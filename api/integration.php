<?php
/* ------------------------------------------------------------------
   integration.php — server-server API pre externé systémy (napr.
   Déčko), NIE pre prehliadač administrácie. Autentizácia je vlastný
   integračný token (Bearer), nikdy master heslo ani heslo prevádzky.

   Token je viazaný na slug_prefix — smie čítať/zapisovať len sluby vo
   svojom vlastnom mennom priestore (napr. "dc-"), nikdy cudzie
   prevádzky/podujatia. Token sa v DB drží ako sha256 hash, nikdy
   v čitateľnej podobe. Vytvára ho `tools/make-integration-token.php`.

   Prijíma JSON POST s hlavičkou `Authorization: Bearer <token>`:

     { "action": "upsert",
       "idempotency_key": "…",
       "source_system": "decko", "event_id": "123", "occurrence_id": "0",
       "content_version": 3,
       "suggested_slug": "letny-koncert",
       "event": { "name": "…", "subtitle": "…",
                  "from": "2026-07-01", "to": "2026-07-01",
                  "fromTime": "19:00", "toTime": "23:00",
                  "place": "…", "afterText": "…", "program": [ … ] },
       "contact": { "phone": "…", "email": "…", "web": "…", "address": "…" },
       "ticketUrl": "https://…" }

     { "action": "publish"|"cancel"|"finish"|"status",
       "idempotency_key": "…",   -- nie pri "status"
       "source_system": "decko", "event_id": "123", "occurrence_id": "0" }

   Odpoveď na upsert/publish: { ok, qr_page_id, public_url, status,
   content_version, applied }. "applied": false znamená, že prišla
   staršia alebo už spracovaná verzia a nič sa neprepísalo (ochrana
   pred oneskoreným retry, ktorý by prepísal novší obsah).

   "content_version" je pri "upsert" POVINNÉ a musí byť kladné celé
   číslo, ktoré sa s každou zmenou obsahu zvyšuje — server ho neinkrementuje
   sám, lebo pri chýbajúcej hodnote by druhá a každá ďalšia zmena obsahu
   bola ticho zahodená (rovnaká "verzia 0" ako predtým).

   Draft (upsert bez publish) sa nezapisuje do data/<slug>.json vôbec —
   žije len v qr_integration_events.draft_payload, aby koncept nebol
   čitateľný cez verejné URL. Zápis na disk urobí až "publish".
   ------------------------------------------------------------------ */

declare(strict_types=1);

define('QR_SAVE_ENTRY', true);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/tokens.php';

function fail(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Používajte POST.', 405);
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    fail('Chýba api/config.php.', 500);
}
$config = require $configPath;

$db = qrDb();
if (!$db) {
    fail('Integrácia vyžaduje databázu (chýba api/dbconfig.php).', 501);
}
qrDbEnsureSchema($db);

/* ---------- Autentizácia integračným tokenom -------------------------- */
$authHeader = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
usleep(250000);   // rovnaká brzda proti hádaniu ako pri auth.php/save.php
if (!preg_match('/^Bearer\s+(\S+)$/i', $authHeader, $m)) {
    fail('Chýba hlavička Authorization: Bearer <token>.', 401);
}
$tokenHash = hash('sha256', $m[1]);

$stmt = $db->prepare('SELECT id, slug_prefix FROM qr_integration_tokens WHERE token_hash = ? AND enabled = 1');
$stmt->execute([$tokenHash]);
$tokenRow = $stmt->fetch();
if (!$tokenRow) {
    fail('Neplatný alebo zrušený integračný token.', 401);
}
$tokenId = (int)$tokenRow['id'];
$slugPrefix = (string)$tokenRow['slug_prefix'];
$db->prepare('UPDATE qr_integration_tokens SET last_used_at = NOW() WHERE id = ?')->execute([$tokenId]);

/* ---------- Telo požiadavky --------------------------------------------- */
$raw = (string)file_get_contents('php://input');
$maxBytes = (int)($config['max_bytes'] ?? 2097152);
if (strlen($raw) > $maxBytes) {
    fail('Požiadavka je príliš veľká.', 413);
}
$req = json_decode($raw, true);
if (!is_array($req)) {
    fail('Telo požiadavky nie je platný JSON.');
}

$action = (string)($req['action'] ?? '');
$sourceSystem = trim((string)($req['source_system'] ?? ''));
$eventId = trim((string)($req['event_id'] ?? ''));
$occurrenceId = trim((string)($req['occurrence_id'] ?? ''));
$idempotencyKey = trim((string)($req['idempotency_key'] ?? ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '')));

$knownActions = ['upsert', 'publish', 'cancel', 'finish', 'status'];
if (!in_array($action, $knownActions, true)) {
    fail('Neznáma akcia.');
}
if ($sourceSystem === '' || $eventId === '') {
    fail('Chýba source_system alebo event_id.');
}
$writeActions = ['upsert', 'publish', 'cancel', 'finish'];
if (in_array($action, $writeActions, true) && $idempotencyKey === '') {
    fail('Chýba idempotency_key.', 400);
}

/* ---------- Pomocné funkcie --------------------------------------------- */

function qrIntegrationAudit(PDO $db, int $tokenId, string $action, string $slug, string $idemKey, bool $ok, int $status, string $message): void
{
    $stmt = $db->prepare(
        'INSERT INTO qr_integration_audit (token_id, action, slug, idempotency_key, ok, http_status, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    $stmt->execute([$tokenId, $action, $slug, $idemKey, $ok ? 1 : 0, $status, mb_substr($message, 0, 250)]);
}

/* Vráti uloženú odpoveď, ak už bol tento idempotency_key spracovaný.
   Iný obsah pod tým istým kľúčom je programátorská chyba volajúceho —
   nikdy sa nesmie ticho použiť pôvodná odpoveď na iné dáta. */
function qrIntegrationIdempotentReplay(PDO $db, int $tokenId, string $key, string $requestHash): ?array
{
    if ($key === '') {
        return null;
    }
    $stmt = $db->prepare('SELECT request_hash, http_status, response_json FROM qr_integration_idempotency WHERE token_id = ? AND idempotency_key = ?');
    $stmt->execute([$tokenId, $key]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    if (!hash_equals((string)$row['request_hash'], $requestHash)) {
        fail('idempotency_key už bol použitý s inými dátami.', 409);
    }
    return ['status' => (int)$row['http_status'], 'body' => json_decode((string)$row['response_json'], true)];
}

function qrIntegrationStoreIdempotent(PDO $db, int $tokenId, string $key, string $requestHash, int $status, array $body): void
{
    if ($key === '') {
        return;
    }
    try {
        $stmt = $db->prepare(
            'INSERT INTO qr_integration_idempotency (token_id, idempotency_key, request_hash, http_status, response_json, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([$tokenId, $key, $requestHash, $status, json_encode($body, JSON_UNESCAPED_UNICODE)]);
    } catch (Throwable $e) {
        // Súbežná duplicitná požiadavka už vložila záznam prvá — v poriadku,
        // odpoveď tejto požiadavky sa aj tak vráti klientovi rovnaká.
    }
}

/* Zostaví verejnú URL z hosta, ktorý naozaj obsluhuje tento skript —
   doménovo neutrálne, rovnaký princíp ako QR_OG_ALLOWED_HOSTS v og.php. */
function qrIntegrationPublicUrl(string $slug): string
{
    $allowed = ['qr.bruto.sk', 'localhost'];
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $host = (string)preg_replace('/:\d+$/', '', $host);
    if (!in_array($host, $allowed, true)) {
        $host = $allowed[0];
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $host . '/' . $slug;
}

/* Sanitizuje voľný text na tvar sluga a doplní číselnú príponu pri kolízii
   s existujúcim záznamom (iná udalosť, alebo ručne založená prevádzka
   v data/index.json). Prefix tokenu je vždy na začiatku. */
function qrIntegrationGenerateSlug(PDO $db, string $dataDir, string $prefix, string $hint): string
{
    $base = strtolower((string)preg_replace('/[^a-z0-9]+/', '-', $hint));
    $base = trim($base, '-');
    if ($base === '') {
        $base = 'podujatie';
    }
    $base = substr($base, 0, 40 - strlen($prefix));
    $slug = $prefix . $base;
    $suffix = 1;
    while (qrIntegrationSlugTaken($db, $dataDir, $slug)) {
        $candidate = $prefix . substr($base, 0, 40 - strlen($prefix) - strlen((string)(++$suffix)) - 1) . '-' . $suffix;
        $slug = $candidate;
    }
    return $slug;
}

function qrIntegrationSlugTaken(PDO $db, string $dataDir, string $slug): bool
{
    if (!qrIsValidSlug($slug)) {
        return true;
    }
    if (is_file($dataDir . '/' . $slug . '.json')) {
        return true;
    }
    $stmt = $db->prepare('SELECT 1 FROM qr_integration_events WHERE slug = ?');
    $stmt->execute([$slug]);
    return (bool)$stmt->fetchColumn();
}

/* Postaví verejný JSON tvar podľa assets/js/schema.js (kind: 'event').
   Len polia z Déčko kontraktu ako verejné — žiadne interné poznámky,
   ceny nákladov, osobné kontakty tímu ani zmluvy sem nesmú prísť. */
function qrIntegrationBuildVenueJson(string $slug, array $req): array
{
    $event = is_array($req['event'] ?? null) ? $req['event'] : [];
    $contact = is_array($req['contact'] ?? null) ? $req['contact'] : [];
    $sections = [];

    $tiles = [];
    if (!empty($req['ticketUrl']) && is_string($req['ticketUrl'])) {
        $tiles[] = ['id' => 'tickets', 'url' => (string)$req['ticketUrl']];
    }
    if (!empty($contact['phone'])) {
        $tiles[] = ['id' => 'phone', 'url' => 'tel:' . (string)$contact['phone']];
    }
    if (!empty($contact['email'])) {
        $tiles[] = ['id' => 'email', 'url' => 'mailto:' . (string)$contact['email']];
    }
    if (!empty($contact['web'])) {
        $tiles[] = ['id' => 'web', 'url' => (string)$contact['web']];
    }
    if ($tiles !== []) {
        $sections[] = ['title' => '', 'tiles' => $tiles];
    }

    return [
        'slug' => $slug,
        'kind' => 'event',
        'name' => (string)($event['name'] ?? ''),
        'subtitle' => (string)($event['subtitle'] ?? ''),
        'listed' => false,   // Déčko podujatia sa nemiešajú do verejného rozcestníka DK Sereď prevádzok
        'event' => [
            'from' => (string)($event['from'] ?? ''),
            'to' => (string)($event['to'] ?? ($event['from'] ?? '')),
            'fromTime' => (string)($event['fromTime'] ?? ''),
            'toTime' => (string)($event['toTime'] ?? ''),
            'place' => (string)($event['place'] ?? ''),
            'afterText' => (string)($event['afterText'] ?? ''),
            'program' => is_array($event['program'] ?? null) ? array_values($event['program']) : [],
        ],
        'contact' => [
            'phone' => (string)($contact['phone'] ?? ''),
            'email' => (string)($contact['email'] ?? ''),
            'web' => (string)($contact['web'] ?? ''),
            'address' => (string)($contact['address'] ?? ''),
        ],
        'sections' => $sections,
    ];
}

/* Zapíše <slug>.json + zlúči index.json pod rovnakým princípom zámku ako
   api/save.php. Zámerne samostatná, nezávislá od save.php — nemenný,
   dobre otestovaný admin zápis sa touto zmenou vôbec nedotýka. */
function qrIntegrationWriteLive(array $config, array $venue): void
{
    $dataDir = rtrim((string)$config['data_dir'], '/\\');
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0755, true)) {
        fail('Priečinok s dátami sa nepodarilo vytvoriť.', 500);
    }
    $content = (string)json_encode($venue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $target = $dataDir . '/' . $venue['slug'] . '.json';

    $lockPath = $dataDir . '/.lock';
    $lock = @fopen($lockPath, 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        fail('Nepodarilo sa získať zámok na zápis. Skúste o chvíľu.', 503);
    }

    $keepBackups = (int)($config['keep_backups'] ?? 20);
    if ($keepBackups > 0 && is_file($target)) {
        $backupDir = $dataDir . '/.backups';
        if (!is_dir($backupDir)) {
            @mkdir($backupDir, 0755, true);
        }
        if (is_dir($backupDir) && is_writable($backupDir)) {
            $stamp = date('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
            @copy($target, $backupDir . '/' . basename($target) . '.' . $stamp . '.bak');
        }
    }

    $tmp = $target . '.tmp' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $content, LOCK_EX) === false || !@rename($tmp, $target)) {
        @unlink($tmp);
        flock($lock, LOCK_UN);
        fclose($lock);
        fail('Zápis zlyhal.', 500);
    }
    @chmod($target, 0644);

    $indexTarget = $dataDir . '/index.json';
    $rawIndex = is_file($indexTarget) ? (string)file_get_contents($indexTarget) : '{"venues":[]}';
    $idx = json_decode($rawIndex, true);
    if (!is_array($idx) || !is_array($idx['venues'] ?? null)) {
        $idx = ['venues' => []];
    }
    $byslug = [];
    foreach ($idx['venues'] as $v) {
        if (is_array($v) && qrIsValidSlug((string)($v['slug'] ?? ''))) {
            $byslug[(string)$v['slug']] = $v;
        }
    }
    $byslug[$venue['slug']] = [
        'slug' => $venue['slug'],
        'name' => $venue['name'],
        'subtitle' => $venue['subtitle'],
        'kind' => 'event',
        'hidden' => true,   // Déčko podujatia majú vlastnú distribúciu (QR/odkaz), nie verejný rozcestník
    ];
    $idx['venues'] = array_values($byslug);
    @file_put_contents($indexTarget, json_encode($idx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);

    flock($lock, LOCK_UN);
    fclose($lock);
}

/* ---------- Nájdenie/založenie mapovania event -> slug ------------------ */
function qrIntegrationFindOrCreateEvent(PDO $db, string $dataDir, int $tokenId, string $prefix, string $sourceSystem, string $eventId, string $occurrenceId, string $slugHint): array
{
    $stmt = $db->prepare('SELECT * FROM qr_integration_events WHERE token_id = ? AND source_system = ? AND event_id = ? AND occurrence_id = ?');
    $stmt->execute([$tokenId, $sourceSystem, $eventId, $occurrenceId]);
    $row = $stmt->fetch();
    if ($row) {
        return $row;
    }
    $slug = qrIntegrationGenerateSlug($db, $dataDir, $prefix, $slugHint);
    $ins = $db->prepare(
        "INSERT INTO qr_integration_events (token_id, source_system, event_id, occurrence_id, slug, status, content_version)
         VALUES (?, ?, ?, ?, ?, 'draft', 0)"
    );
    try {
        $ins->execute([$tokenId, $sourceSystem, $eventId, $occurrenceId, $slug]);
    } catch (Throwable $e) {
        // Súbežné prvé volanie tej istej udalosti — niekto ju medzitým založil, načítaj jeho záznam.
    }
    $stmt->execute([$tokenId, $sourceSystem, $eventId, $occurrenceId]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Nepodarilo sa priradiť slug.', 500);
    }
    return $row;
}

/* ---------- Idempotencia ------------------------------------------------- */
$requestHash = hash('sha256', $raw);
$replay = qrIntegrationIdempotentReplay($db, $tokenId, $idempotencyKey, $requestHash);
if ($replay !== null) {
    http_response_code($replay['status']);
    echo json_encode($replay['body'], JSON_UNESCAPED_UNICODE);
    exit;
}

$dataDir = rtrim((string)$config['data_dir'], '/\\');

/* ---------- status (čítanie, bez efektu) --------------------------------- */
if ($action === 'status') {
    $stmt = $db->prepare('SELECT slug, status, content_version, published_version FROM qr_integration_events WHERE token_id = ? AND source_system = ? AND event_id = ? AND occurrence_id = ?');
    $stmt->execute([$tokenId, $sourceSystem, $eventId, $occurrenceId]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Udalosť nenájdená.', 404);
    }
    echo json_encode([
        'ok' => true,
        'slug' => $row['slug'],
        'public_url' => qrIntegrationPublicUrl((string)$row['slug']),
        'status' => $row['status'],
        'content_version' => (int)$row['content_version'],
        'published_version' => $row['published_version'] !== null ? (int)$row['published_version'] : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$eventRow = qrIntegrationFindOrCreateEvent($db, $dataDir, $tokenId, $slugPrefix, $sourceSystem, $eventId, $occurrenceId, (string)($req['suggested_slug'] ?? ($req['event']['name'] ?? '')));
$slug = (string)$eventRow['slug'];
if (!qrIsValidSlugForPrefix($slug, $slugPrefix)) {
    fail('Interná chyba: slug mimo menného priestoru tokenu.', 500);
}

$httpStatus = 200;
$responseBody = ['ok' => false, 'error' => 'Neznáma chyba.'];

try {
    if ($action === 'upsert') {
        if (!isset($req['content_version'])) {
            fail('Chýba content_version.', 400);
        }
        $incomingVersion = (int)$req['content_version'];
        if ($incomingVersion <= 0) {
            fail('content_version musí byť kladné celé číslo.', 400);
        }
        $currentVersion = (int)$eventRow['content_version'];
        if ($incomingVersion <= $currentVersion && $currentVersion > 0) {
            /* Staršia alebo už spracovaná verzia (oneskorený retry) — nič sa
               neprepíše, aby nepredbehla novší koncept iným poradím doručenia. */
            $responseBody = [
                'ok' => true, 'applied' => false, 'qr_page_id' => $slug,
                'public_url' => qrIntegrationPublicUrl($slug),
                'status' => $eventRow['status'], 'content_version' => $currentVersion,
            ];
        } else {
            $venue = qrIntegrationBuildVenueJson($slug, $req);
            $upd = $db->prepare('UPDATE qr_integration_events SET content_version = ?, draft_payload = ?, updated_at = NOW() WHERE id = ?');
            $upd->execute([$incomingVersion, json_encode($venue, JSON_UNESCAPED_UNICODE), (int)$eventRow['id']]);
            $responseBody = [
                'ok' => true, 'applied' => true, 'qr_page_id' => $slug,
                'public_url' => qrIntegrationPublicUrl($slug),
                'status' => $eventRow['status'], 'content_version' => $incomingVersion,
            ];
        }
    } elseif ($action === 'publish') {
        if ($eventRow['draft_payload'] === null) {
            fail('Žiadny koncept na publikovanie — najprv zavolajte upsert.', 409);
        }
        $venue = json_decode((string)$eventRow['draft_payload'], true);
        if (!is_array($venue)) {
            fail('Uložený koncept je poškodený.', 500);
        }
        $venue['listed'] = false;
        qrIntegrationWriteLive($config, $venue);
        /* published_payload je kópia toho, čo naozaj beží na verejnej URL —
           cancel/finish z nej vychádzajú, nie z draft_payload, ktorý medzitým
           môže obsahovať ďalší, ešte nepublikovaný upsert (ANALYSIS.md #3). */
        $db->prepare("UPDATE qr_integration_events SET status = 'published', published_version = content_version, published_payload = draft_payload, updated_at = NOW() WHERE id = ?")
            ->execute([(int)$eventRow['id']]);
        $responseBody = [
            'ok' => true, 'qr_page_id' => $slug, 'public_url' => qrIntegrationPublicUrl($slug),
            'status' => 'published', 'content_version' => (int)$eventRow['content_version'],
        ];
    } elseif ($action === 'cancel' || $action === 'finish') {
        $newStatus = $action === 'cancel' ? 'cancelled' : 'finished';
        if (in_array($eventRow['status'], ['published', 'finished', 'cancelled'], true)) {
            $venue = $eventRow['published_payload'] !== null ? json_decode((string)$eventRow['published_payload'], true) : null;
            if (is_array($venue)) {
                /* Vlastné pole navyše mimo schema.js — renderer neznáme kľúče
                   ignoruje, takže nič nerozbije. Banner na verejnej stránke
                   pre kind:'event' + decko.status vidí assets/js/render.js. */
                $venue['decko'] = ['status' => $newStatus];
                $venue['listed'] = false;
                qrIntegrationWriteLive($config, $venue);
            }
        }
        $db->prepare('UPDATE qr_integration_events SET status = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$newStatus, (int)$eventRow['id']]);
        $responseBody = [
            'ok' => true, 'qr_page_id' => $slug, 'public_url' => qrIntegrationPublicUrl($slug),
            'status' => $newStatus, 'content_version' => (int)$eventRow['content_version'],
        ];
    }
} catch (Throwable $e) {
    qrIntegrationAudit($db, $tokenId, $action, $slug, $idempotencyKey, false, 500, $e->getMessage());
    fail('Interná chyba pri spracovaní.', 500);
}

qrIntegrationAudit($db, $tokenId, $action, $slug, $idempotencyKey, true, $httpStatus, $action);
qrIntegrationStoreIdempotent($db, $tokenId, $idempotencyKey, $requestHash, $httpStatus, $responseBody);

http_response_code($httpStatus);
echo json_encode($responseBody, JSON_UNESCAPED_UNICODE);
