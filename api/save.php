<?php
/* ------------------------------------------------------------------
   save.php — zápis dátových súborov na klasickom PHP hostingu.
   Na Verceli a GitHub Pages sa nepoužíva (tam je disk len na čítanie
   a administrácia ukladá cez GitHub API).

   Prijíma JSON POST:
     { "action": "ping",  "password": "…" }
     { "action": "save",  "password": "…",
       "files": [ {"path":"kinonova.json","content":"…","base":"<sha256>"} ],
       "index": { "upsert": {"slug":"kinonova","name":"…",…} } alebo { "remove": "kinonova" },
       "force": false }

   Zoznam prevádzok (index.json) sa NEposiela celý — administrácia
   pošle len zmenu jedného záznamu a server ju pod zámkom zlúči do
   aktuálneho súboru. Dvaja správcovia si tak navzájom nezmažú nové
   prevádzky zo zoznamu, aj keď majú v prehliadači starý stav.

   "base" je sha256 obsahu súboru tak, ako ho administrácia načítala.
   Ak sa medzitým súbor zmenil, server odpovie 409 a klient sa opýta,
   či prepísať ("force": true).

   Namiesto "password" (master heslo) sa dá poslať aj "token" získaný
   z api/auth.php — ten môže byť buď master (rovnaké práva ako heslo),
   alebo prihlásenie jednej prevádzky (smie zapisovať len svoj vlastný
   <slug>.json a v zozname meniť len svoj vlastný záznam).
   ------------------------------------------------------------------ */

declare(strict_types=1);

/* config.php sa smie načítať len odtiaľto. Niektoré servery servírujú
   PHP cez nginx a .htaccess pravidlá pre .php súbory tam nič nezmôžu —
   priamy prístup na config.php sa preto blokuje priamo v kóde, nie
   spoliehaním na webserver. */
define('QR_SAVE_ENTRY', true);

require_once __DIR__ . '/tokens.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

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
    fail('Chýba api/config.php. Skopírujte api/config.example.php a nastavte heslo.', 500);
}
$config = require $configPath;

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    fail('Prázdna požiadavka.');
}
$req = json_decode($raw, true);
if (!is_array($req)) {
    fail('Telo požiadavky nie je platný JSON.');
}

/* ---------- Overenie -------------------------------------------------
   Umelé zdržanie brzdí hádanie hesla hrubou silou; na malom hostingu
   je to jednoduchšie a spoľahlivejšie než počítanie pokusov.

   $scopeSlug === null   → master, smie zapisovať čokoľvek
   $scopeSlug === 'xyz'  → len xyz.json a svoj záznam v index.json */
usleep(250000);
$login = qrVerifyLogin((string)($req['token'] ?? ''), (string)($req['password'] ?? ''), $config);
if (!$login) {
    if (($req['token'] ?? '') !== '') {
        fail('Prihlásenie vypršalo alebo bolo zrušené, prihláste sa znova.', 401);
    }
    fail(($req['password'] ?? '') !== '' ? 'Nesprávne heslo.' : 'Chýba heslo alebo prihlásenie.', 401);
}
$scopeSlug = $login['scope'] === 'venue' ? $login['slug'] : null;

$dataDir = rtrim((string)$config['data_dir'], '/\\');
if (!is_dir($dataDir) && !@mkdir($dataDir, 0755, true)) {
    fail('Priečinok s dátami sa nepodarilo vytvoriť: ' . $dataDir, 500);
}
if (!is_writable($dataDir)) {
    fail('Do priečinka ' . $dataDir . ' sa nedá zapisovať. Nastavte práva na 755 alebo 775.', 500);
}

$action = (string)($req['action'] ?? '');

if ($action === 'ping') {
    echo json_encode(['ok' => true, 'dir' => basename($dataDir)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action !== 'save') {
    fail('Neznáma akcia.');
}

$files = $req['files'] ?? [];
$indexOp = $req['index'] ?? null;
$force = !empty($req['force']);
if (!is_array($files)) {
    fail('Pole files má nesprávny tvar.');
}
if ($files === [] && !is_array($indexOp)) {
    fail('Neprišli žiadne súbory.');
}

$maxBytes = (int)($config['max_bytes'] ?? 2097152);
$prepared = [];   // path => [cieľová cesta, obsah, base hash alebo null]

foreach ($files as $file) {
    $path = (string)($file['path'] ?? '');
    $content = (string)($file['content'] ?? '');
    $base = isset($file['base']) ? (string)$file['base'] : null;

    /* Povolíme výhradne ploché názvy typu "kinonova.json". Žiadne lomky
       ani bodkobodky sa sem nedostanú a index.json sa cez files
       nezapisuje vôbec — ten sa mení len cez pole "index". */
    if (!preg_match('/^([a-z0-9][a-z0-9-]{0,47})\.json$/', $path, $m) || !qrIsValidSlug($m[1])) {
        fail('Neprípustný názov súboru: ' . $path);
    }
    $fileSlug = $m[1];
    if (strlen($content) > $maxBytes) {
        fail('Súbor ' . $path . ' je príliš veľký. Zmenšite logo.');
    }
    $decoded = json_decode($content, true);
    if (!is_array($decoded) || array_is_list($decoded)) {
        fail('Obsah súboru ' . $path . ' nie je objekt prevádzky.');
    }
    /* Tvar prevádzky: slug v súbore sa musí zhodovať s názvom súboru
       a názov musí byť text — inak by sa verejná stránka nevykreslila. */
    if ((string)($decoded['slug'] ?? '') !== $fileSlug) {
        fail('Slug v súbore ' . $path . ' sa nezhoduje s názvom súboru.');
    }
    if (!is_string($decoded['name'] ?? null) || trim($decoded['name']) === '') {
        fail('Súbor ' . $path . ' nemá názov prevádzky.');
    }
    if ($scopeSlug !== null && $fileSlug !== $scopeSlug) {
        fail('Toto prihlásenie smie zapisovať len ' . $scopeSlug . '.json.', 403);
    }
    if (isset($prepared[$path])) {
        fail('Súbor ' . $path . ' je v požiadavke dvakrát.');
    }
    $prepared[$path] = [$dataDir . '/' . $path, $content, $base];
}

/* ---------- Zmena zoznamu prevádzok -------------------------------------
   Skontroluje sa len tvar; samotné zlúčenie prebehne pod zámkom nižšie. */
$indexUpsert = null;
$indexRemove = null;
if (is_array($indexOp)) {
    if (isset($indexOp['upsert'])) {
        $e = $indexOp['upsert'];
        if (!is_array($e) || !qrIsValidSlug((string)($e['slug'] ?? ''))) {
            fail('Záznam v zozname má nesprávny tvar.');
        }
        if (!is_string($e['name'] ?? null) || trim($e['name']) === '') {
            fail('Záznam v zozname nemá názov.');
        }
        $indexUpsert = [
            'slug' => (string)$e['slug'],
            'name' => (string)$e['name'],
            'subtitle' => (string)($e['subtitle'] ?? ''),
            'kind' => (string)($e['kind'] ?? ''),
        ];
        if (!empty($e['hidden'])) {
            $indexUpsert['hidden'] = true;
        }
        if ($scopeSlug !== null && $indexUpsert['slug'] !== $scopeSlug) {
            fail('Prihlásenie tejto prevádzky smie meniť len jej vlastný záznam v zozname.', 403);
        }
    } elseif (isset($indexOp['remove'])) {
        $indexRemove = (string)$indexOp['remove'];
        if (!qrIsValidSlug($indexRemove)) {
            fail('Neplatný slug na odstránenie.');
        }
        if ($scopeSlug !== null && $indexRemove !== $scopeSlug) {
            fail('Prihlásenie tejto prevádzky smie meniť len jej vlastný záznam v zozname.', 403);
        }
    } else {
        fail('Pole index musí obsahovať upsert alebo remove.');
    }
}

/* ---------- Zámok -----------------------------------------------------
   Od kontroly konfliktu až po zápis indexu drží požiadavka výhradný
   zámok. Dve súbežné uloženia sa tak vykonajú za sebou a druhé už vidí
   výsledok prvého — bez toho by kontrola indexu aj "base" boli len
   pretekami s časom. */
$lockPath = $dataDir . '/.lock';
$lock = @fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    fail('Nepodarilo sa získať zámok na zápis. Skúste o chvíľu.', 503);
}

/* ---------- Konflikt verzií -------------------------------------------
   Klient posiela hash obsahu, z ktorého vychádzal. Ak je na disku niečo
   iné, niekto medzitým uložil — bez "force" sa nič neprepíše. */
if (!$force) {
    foreach ($prepared as $path => [$target, $content, $base]) {
        if ($base === null) {
            continue;   // starší klient bez kontroly — správa sa ako doteraz
        }
        $exists = is_file($target);
        $current = $exists ? hash('sha256', (string)file_get_contents($target)) : '';
        if ($current !== $base) {
            http_response_code(409);
            echo json_encode([
                'ok' => false,
                'conflict' => true,
                'error' => $exists
                    ? 'Prevádzku ' . $path . ' medzitým niekto iný zmenil. Načítajte ju znova, alebo prepíšte jeho verziu.'
                    : 'Prevádzka ' . $path . ' už medzitým vznikla. Zvoľte iný slug, alebo ju prepíšte.',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

/* ---------- Zlúčenie zoznamu ------------------------------------------ */
$indexTarget = $dataDir . '/index.json';
$indexOut = null;
if ($indexUpsert !== null || $indexRemove !== null) {
    $rawIndex = is_file($indexTarget) ? (string)file_get_contents($indexTarget) : '{"venues":[]}';
    $idx = json_decode($rawIndex, true);
    if (!is_array($idx) || !is_array($idx['venues'] ?? null)) {
        fail('index.json na serveri je poškodený — opravte ho ručne, zápis by ho prepísal.', 500);
    }
    $byslug = [];
    foreach ($idx['venues'] as $v) {
        if (is_array($v) && qrIsValidSlug((string)($v['slug'] ?? ''))) {
            $byslug[(string)$v['slug']] = $v;   // duplicitný slug — posledný vyhráva
        }
    }
    if ($indexUpsert !== null) {
        $byslug[$indexUpsert['slug']] = $indexUpsert;
    } else {
        unset($byslug[$indexRemove]);
    }
    $list = array_values($byslug);
    if (class_exists('Collator')) {
        $col = new Collator('sk_SK');
        usort($list, static fn($a, $b) => $col->compare((string)($a['name'] ?? ''), (string)($b['name'] ?? '')));
    } else {
        usort($list, static fn($a, $b) => strcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? '')));
    }
    $idx['venues'] = $list;
    $indexOut = $idx;
    $prepared['index.json'] = [
        $indexTarget,
        (string)json_encode($idx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        null,
    ];
}

/* ---------- Záloha pred prepísaním -------------------------------------
   Na GitHub adaptéri je história v commitoch, tu ju treba spraviť
   ručne — inak sa predchádzajúca verzia bez stopy stratí. Drží sa
   posledných $keepBackups verzií na súbor, staršie sa priebežne mažú. */
$keepBackups = (int)($config['keep_backups'] ?? 20);
if ($keepBackups > 0) {
    $backupDir = $dataDir . '/.backups';
    if (!is_dir($backupDir)) {
        @mkdir($backupDir, 0755, true);
    }
    if (is_dir($backupDir) && is_writable($backupDir)) {
        foreach ($prepared as [$target]) {
            if (!is_file($target)) {
                continue;   // nová prevádzka — nič na zálohovanie
            }
            $stamp = date('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4);
            @copy($target, $backupDir . '/' . basename($target) . '.' . $stamp . '.bak');

            $pattern = $backupDir . '/' . basename($target) . '.*.bak';
            $existing = glob($pattern) ?: [];
            if (count($existing) > $keepBackups) {
                usort($existing, static fn($a, $b) => filemtime($a) <=> filemtime($b));
                foreach (array_slice($existing, 0, count($existing) - $keepBackups) as $old) {
                    @unlink($old);
                }
            }
        }
    }
}

/* ---------- Zápis -----------------------------------------------------
   Najprv do dočasného súboru a až potom presun — pri výpadku uprostred
   zápisu tak na disku nezostane rozbitý JSON, ktorý by zhodil stránku. */
$written = 0;
$hashes = [];
foreach ($prepared as $path => [$target, $content]) {
    $tmp = $target . '.tmp' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $content, LOCK_EX) === false) {
        @unlink($tmp);
        fail('Zápis zlyhal: ' . basename($target), 500);
    }
    if (!@rename($tmp, $target)) {
        @unlink($tmp);
        fail('Presun zlyhal: ' . basename($target), 500);
    }
    @chmod($target, 0644);
    $hashes[$path] = hash('sha256', $content);
    $written++;
}
flock($lock, LOCK_UN);
fclose($lock);

/* Klient dostane zlúčený zoznam aj nové hashe, aby mal čerstvý stav
   bez ďalšieho načítania a ďalšie uloženie neskončilo falošným 409. */
echo json_encode([
    'ok' => true,
    'written' => $written,
    'index' => $indexOut,
    'hashes' => $hashes,
], JSON_UNESCAPED_UNICODE);
