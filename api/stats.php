<?php
/* ------------------------------------------------------------------
   stats.php — anonymné denné počítadlo návštev a klikov.

   Žiadne IP adresy, žiadne cookies, žiadne osobné údaje — len denné
   súčty podľa prevádzky a udalosti (napr. "view", "tile:instagram").
   To je zámerne aj celý rozsah GDPR úvahy: nič osobné sa neukladá.

   Prijíma JSON POST:
     { "action": "record", "slug": "kinonova", "metric": "view" }
       — verejné, bez hesla; volá ho verejná stránka pri návšteve/kliku.
     { "action": "read", "slug": "kinonova", "password" alebo "token": "…", "days": 30 }
       — vyžaduje master heslo alebo prihlásenie danej prevádzky.

   Bez api/dbconfig.php vráti "record" tichý úspech (nič sa nezapíše)
   a "read" chybu — štatistiky sú vtedy len vypnuté, nič sa nerozbije.

   "record" je verejný, preto sa bráni pred zaplavením: zapisuje len
   pre existujúce prevádzky (data/<slug>.json) a známe metriky, a na
   jedného klienta pustí najviac QR_STATS_PER_MINUTE zápisov za minútu.
   Brzda si krátkodobo drží len hash IP v dočasnom súbore — nič, čo by
   sa dalo spätne priradiť k osobe, a po minúte je to bezcenné.
   ------------------------------------------------------------------ */

declare(strict_types=1);

define('QR_SAVE_ENTRY', true);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');   // verejná stránka môže bežať na inej doméne než API

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    exit;   // CORS preflight
}

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

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 2048) {
    fail('Požiadavka je príliš veľká.', 413);
}
$req = json_decode($raw, true);
if (!is_array($req)) {
    fail('Telo požiadavky nie je platný JSON.');
}

$slug = (string)($req['slug'] ?? '');
if (!qrIsValidSlug($slug)) {
    fail('Neplatný slug.');
}

$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? require $configPath : null;

const QR_STATS_PER_MINUTE = 30;

/* Rozsahy IP adries, z ktorých Cloudflare posiela požiadavky na origin
   server (https://www.cloudflare.com/ips/, stav 2026). Mimo tohto
   zoznamu je CF-Connecting-IP ľahko sfalšovateľná hlavička a nedôveruje
   sa jej. */
const QR_CLOUDFLARE_RANGES = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

function qrIpInCidr(string $ip, string $cidr): bool
{
    [$subnet, $bits] = array_pad(explode('/', $cidr, 2), 2, null);
    $bits = (int)$bits;
    $ipBin = @inet_pton($ip);
    $subnetBin = @inet_pton($subnet);
    if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
        return false;
    }
    $bytes = intdiv($bits, 8);
    $remBits = $bits % 8;
    if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subnetBin, 0, $bytes)) {
        return false;
    }
    if ($remBits === 0) {
        return true;
    }
    $mask = chr((0xFF << (8 - $remBits)) & 0xFF);
    return (substr($ipBin, $bytes, 1) & $mask) === (substr($subnetBin, $bytes, 1) & $mask);
}

/* Skutočná IP návštevníka. `.sk` beží za Cloudflare, kde REMOTE_ADDR je
   adresa proxy uzla, nie klienta — bez tejto výnimky by throttling na
   jarmoku (desiatky telefónov cez pár CF uzlov) blokoval bežné
   zobrazenia namiesto útočníka. Hlavička sa berie len vtedy, keď
   požiadavka naozaj prišla z overeného rozsahu Cloudflare. */
function qrClientIp(): string
{
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $cfHeader = (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? '');
    if ($remote !== '' && $cfHeader !== '' && filter_var($cfHeader, FILTER_VALIDATE_IP)) {
        foreach (QR_CLOUDFLARE_RANGES as $range) {
            if (qrIpInCidr($remote, $range)) {
                return $cfHeader;
            }
        }
    }
    return $remote;
}

/* Najviac N zápisov za minútu z jednej adresy. Kľúč je sha256 IP so
   soľou z aktuálnej minúty — súbor sa nedá použiť na identifikáciu
   a po minúte je mŕtvy. Pri nedostupnom temp priečinku sa brzda
   jednoducho nepoužije. */
function qrStatsThrottled(): bool
{
    $ip = qrClientIp();
    if ($ip === '') {
        return false;
    }
    $minute = (int)floor(time() / 60);
    $dir = sys_get_temp_dir() . '/qr-stats';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return false;
    }
    $file = $dir . '/' . hash('sha256', $ip . '|' . $minute) . '.cnt';
    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return false;
    }
    flock($fh, LOCK_EX);
    $count = (int)stream_get_contents($fh) + 1;
    rewind($fh);
    ftruncate($fh, 0);
    fwrite($fh, (string)$count);
    flock($fh, LOCK_UN);
    fclose($fh);

    /* Upratovanie starých minút — občas, nie pri každom zápise. */
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/*.cnt') ?: [] as $old) {
            if (filemtime($old) < time() - 120) {
                @unlink($old);
            }
        }
    }
    return $count > QR_STATS_PER_MINUTE;
}

$action = (string)($req['action'] ?? '');

if ($action === 'record') {
    $metric = (string)($req['metric'] ?? '');
    /* Len metriky, ktoré verejná stránka naozaj posiela (site.js):
       návšteva, klik na dlaždicu a klik na hlavnú akciu. */
    if (!preg_match('/^(view|tile:[a-z0-9_-]{1,32}|primary:[a-z0-9_-]{1,32})$/', $metric)) {
        exit('{"ok":true}');   // tichý no-op — chybný tvar nikoho nezaujíma
    }
    /* Neexistujúca prevádzka sa nepočíta — inak by sa dala tabuľka
       nafúknuť ľubovoľnými slugmi. */
    $dataDir = $config ? rtrim((string)$config['data_dir'], '/\\') : __DIR__ . '/../data';
    if (!is_file($dataDir . '/' . $slug . '.json')) {
        exit('{"ok":true}');
    }
    if (qrStatsThrottled()) {
        exit('{"ok":true}');   // klient to nemá riešiť, zápis sa len vynechá
    }
    $db = qrDb();
    if (!$db) {
        echo json_encode(['ok' => true]);   // štatistiky sú vypnuté, ale klient to nemá riešiť
        exit;
    }
    $sql = 'INSERT INTO qr_stats_daily (venue_slug, metric, day, count)
            VALUES (?, ?, CURDATE(), 1)
            ON DUPLICATE KEY UPDATE count = count + 1';
    try {
        $db->prepare($sql)->execute([$slug, $metric]);
    } catch (PDOException $e) {
        /* Tabuľka ešte nemusí existovať (prvý zápis po inštalácii) —
           až vtedy sa založí schéma, nie pri každom zápise. */
        qrDbEnsureSchema($db);
        $db->prepare($sql)->execute([$slug, $metric]);
    }
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'read') {
    if (!$config) {
        fail('Chýba api/config.php.', 500);
    }
    usleep(250000);   // rovnaká brzda proti hádaniu hesla ako v ostatných endpointoch
    $login = qrVerifyLogin((string)($req['token'] ?? ''), (string)($req['password'] ?? ''), $config);
    if (!$login || ($login['scope'] === 'venue' && $login['slug'] !== $slug)) {
        fail('Nesprávne heslo alebo prihlásenie.', 401);
    }

    $db = qrDb();
    if (!$db) {
        fail('Štatistiky nie sú nastavené (chýba api/dbconfig.php).', 501);
    }
    qrDbEnsureSchema($db);

    $days = max(1, min(90, (int)($req['days'] ?? 30)));
    $stmt = $db->prepare(
        'SELECT metric, day, count FROM qr_stats_daily
         WHERE venue_slug = ? AND day >= CURDATE() - INTERVAL ? DAY
         ORDER BY day ASC'
    );
    $stmt->execute([$slug, $days]);
    echo json_encode(['ok' => true, 'rows' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

fail('Neznáma akcia.');
