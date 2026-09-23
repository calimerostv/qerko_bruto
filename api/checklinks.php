<?php
/* ------------------------------------------------------------------
   checklinks.php — overí, či zoznam odkazov niekam vedie.
   Len na PHP hostingu — na Verceli tento súbor neexistuje a admin.js
   preto prejde na obmedzenú klientskú kontrolu (viď checkLinks
   v assets/js/admin.js).

   Prijíma JSON POST: { "password"/"token": "…", "urls": ["https://…", …] }
   Vracia:            { "ok": true, "results": [{"url":…, "status":200|0, "ok":true}, …] }

   Vyžaduje prihlásenie ako save.php (master heslo, master token alebo
   token prevádzky) — bez toho by bol endpoint voľne dostupný komukoľvek
   ako nástroj na sondovanie cudzích aj vnútorných adries.

   Ochrana pred SSRF: každá adresa — aj každý cieľ presmerovania — sa
   najprv preloží cez DNS, všetky vrátené IPv4/IPv6 adresy musia byť
   verejné a cURL sa pripája na tú overenú IP (CURLOPT_RESOLVE), nie
   na čokoľvek, čo by DNS vrátilo o chvíľu neskôr. Presmerovania sa
   preto nesledujú automaticky, ale ručne po jednom kroku.
   ------------------------------------------------------------------ */

declare(strict_types=1);

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
if (!function_exists('curl_init')) {
    fail('Server nemá curl — kontrolu odkazov nie je možné spustiť.', 500);
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    fail('Chýba api/config.php.', 500);
}
$config = require $configPath;

$raw = file_get_contents('php://input');
$req = json_decode((string)$raw, true);
if (!is_array($req) || !isset($req['urls']) || !is_array($req['urls'])) {
    fail('Chýba pole urls.');
}

usleep(250000);
$login = qrVerifyLogin((string)($req['token'] ?? ''), (string)($req['password'] ?? ''), $config);
if (!$login) {
    fail('Nesprávne heslo alebo prihlásenie.', 401);
}

const QR_MAX_REDIRECTS = 5;
const QR_MAX_BODY = 65536;

/* Rozloží URL a preloží hostiteľa. Vráti
   ['host' => …, 'port' => …, 'ip' => 'verejná IP'] alebo null, ak je
   adresa zlá, DNS zlyhalo, alebo ktorákoľvek z vrátených adries je
   privátna/rezervovaná (vrátane IPv6). */
function qrResolvePublic(string $u): ?array
{
    if (!preg_match('#^https?://#i', $u)) {
        return null;
    }
    $parts = parse_url($u);
    $host = $parts['host'] ?? '';
    if ($host === '') {
        return null;
    }
    $host = strtolower(trim($host, '[]'));
    $port = (int)($parts['port'] ?? (strtolower($parts['scheme']) === 'https' ? 443 : 80));

    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        foreach ((array)@dns_get_record($host, DNS_A) as $rec) {
            if (!empty($rec['ip'])) {
                $ips[] = $rec['ip'];
            }
        }
        foreach ((array)@dns_get_record($host, DNS_AAAA) as $rec) {
            if (!empty($rec['ipv6'])) {
                $ips[] = $rec['ipv6'];
            }
        }
    }
    if ($ips === []) {
        return null;
    }
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return null;   // jediná interná adresa v zázname stačí na odmietnutie
        }
    }
    /* Pri výbere uprednostníme IPv4 — hostingy bez IPv6 konektivity
       by inak hlásili mŕtvy odkaz, hoci web funguje. */
    usort($ips, static fn($a, $b) => (int)str_contains($a, ':') <=> (int)str_contains($b, ':'));
    return ['host' => $host, 'port' => $port, 'ip' => $ips[0]];
}

/* Jeden HTTP dotaz na už overenú adresu, bez automatického sledovania
   presmerovaní. $method 'HEAD' alebo 'GET'. Vráti [status, location]. */
function qrMakeHandle(string $url, array $target, string $method): CurlHandle
{
    $ch = curl_init($url);
    $pin = str_contains($target['ip'], ':') ? '[' . $target['ip'] . ']' : $target['ip'];
    $opts = [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_RESOLVE => [$target['host'] . ':' . $target['port'] . ':' . $pin],
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; QRLinkCheck/1.0)',
        CURLOPT_HEADER => false,
        CURLOPT_RETURNTRANSFER => true,
    ];
    if ($method === 'HEAD') {
        $opts[CURLOPT_NOBODY] = true;
    } else {
        /* Telo nás nezaujíma — zahodíme ho a po QR_MAX_BODY prenos
           prerušíme (návratom 0 z callbacku). Stavový kód je už vtedy
           známy, takže výsledok to nepokazí. */
        $opts[CURLOPT_HTTPGET] = true;
        $opts[CURLOPT_RANGE] = '0-0';
        $received = 0;
        $opts[CURLOPT_WRITEFUNCTION] = static function ($ch, string $chunk) use (&$received): int {
            $received += strlen($chunk);
            return $received > QR_MAX_BODY ? 0 : strlen($chunk);
        };
    }
    curl_setopt_array($ch, $opts);
    return $ch;
}

/* Spustí naraz dotazy pre všetky položky $jobs (kľúč → ['url','target',
   'method']) a vráti kľúč → ['status' => int, 'location' => ?string]. */
function qrRunRound(array $jobs): array
{
    $mh = curl_multi_init();
    $handles = [];
    foreach ($jobs as $key => $job) {
        $handles[$key] = qrMakeHandle($job['url'], $job['target'], $job['method']);
        curl_multi_add_handle($mh, $handles[$key]);
    }
    $running = null;
    do {
        curl_multi_exec($mh, $running);
        if ($running > 0) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running > 0);

    $out = [];
    foreach ($handles as $key => $ch) {
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $location = curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: null;
        $out[$key] = ['status' => $status, 'location' => $location ?: null];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}

$allUrls = array_slice(array_map('strval', $req['urls']), 0, 40);   // rozumný strop na jednu prevádzku
$results = [];   // pôvodná URL → výsledok
$jobs = [];      // pôvodná URL → aktuálny krok

foreach ($allUrls as $url) {
    $target = qrResolvePublic($url);
    if (!$target) {
        /* URL, ktorá neprešla filtrom (zlá adresa, nedostupné DNS,
           interná sieť), sa nahlási rovno ako nedostupná — nesmie sa
           len ticho stratiť, inak by mŕtvy odkaz vyzeral, akoby sa
           vôbec neskúmal. */
        $results[$url] = ['url' => $url, 'status' => 0, 'ok' => false];
        continue;
    }
    $jobs[$url] = ['url' => $url, 'target' => $target, 'method' => 'HEAD', 'hops' => 0];
}

/* Kolá: HEAD → prípadne GET (servery, ktoré HEAD odmietajú) → ďalší
   krok presmerovania. Každý cieľ presmerovania prechádza rovnakou
   kontrolou verejnosti ako pôvodná adresa. */
while ($jobs !== []) {
    $round = qrRunRound($jobs);
    $next = [];
    foreach ($round as $key => $r) {
        $job = $jobs[$key];
        $status = $r['status'];

        if (($status === 0 || $status === 405) && $job['method'] === 'HEAD') {
            $job['method'] = 'GET';
            $next[$key] = $job;
            continue;
        }
        if ($status >= 300 && $status < 400 && $r['location']) {
            if ($job['hops'] >= QR_MAX_REDIRECTS) {
                $results[$key] = ['url' => $key, 'status' => $status, 'ok' => false];
                continue;
            }
            $target = qrResolvePublic($r['location']);
            if (!$target) {
                /* Presmerovanie na internú alebo nepreložiteľnú adresu —
                   nasledovať sa nesmie, odkaz sa nahlási ako nefunkčný. */
                $results[$key] = ['url' => $key, 'status' => 0, 'ok' => false];
                continue;
            }
            $next[$key] = ['url' => $r['location'], 'target' => $target, 'method' => 'HEAD', 'hops' => $job['hops'] + 1];
            continue;
        }
        $results[$key] = ['url' => $key, 'status' => $status, 'ok' => $status >= 200 && $status < 400];
    }
    $jobs = $next;
}

/* Poradie výsledkov podľa poradia vstupu. */
$ordered = [];
foreach ($allUrls as $url) {
    if (isset($results[$url])) {
        $ordered[] = $results[$url];
    }
}

echo json_encode(['ok' => true, 'results' => $ordered], JSON_UNESCAPED_UNICODE);
