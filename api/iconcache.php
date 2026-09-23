<?php
/* ------------------------------------------------------------------
   iconcache.php — ukladá ikonu prevádzky (vykreslenú cez <canvas> v
   assets/js/pwa.js) ako skutočný PNG súbor, aby ju mohol použiť
   manifest.php. Verejné, bez hesla — rovnaký princíp ako stats.php
   "record": obsah nie je tajný (presne to isté už vidno na stránke),
   len sa z blob: URL (platnej len v danej karte prehliadača) musí
   dostať na disk, aby ju vedela dotiahnuť aj WebAPK služba mimo
   prehliadača. Zapisuje sa len pre existujúce prevádzky a len platný
   PNG v očakávanej veľkosti, aby sa endpoint nedal zneužiť na
   nahrávanie ľubovoľných súborov.

   Keďže je endpoint bez hesla, ktokoľvek by inak vedel kedykoľvek
   prepísať ikonu cudzej prevádzky (ANALYSIS.md #1). Zápis je preto
   obmedzený na dva prípady: ikona ešte neexistuje, alebo je staršia
   než dáta prevádzky (t.j. niekto zmenil logo/farby v administrácii,
   treba ju prekresliť) — bežná návšteva bez zmeny dát tak už znova
   nezapisuje nič. Naviac je pridaný jednoduchý limit na počet zápisov
   z jednej IP za minútu, rovnaký princíp ako qrStatsThrottled()
   v api/stats.php. */

declare(strict_types=1);

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

const QR_ICON_SIZES = [192, 512, 180];
const QR_ICON_MAX_BYTES = 300 * 1024;
const QR_ICON_MAX_PER_MINUTE = 20;

/* Najviac N zápisov za minútu z jednej adresy — rovnaký princíp ako
   qrStatsThrottled() v api/stats.php (samostatná kópia, aby tento
   súbor nezávisel od stats.php). */
function qrIconCacheThrottled(): bool
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '') {
        return false;
    }
    $minute = (int)floor(time() / 60);
    $dir = sys_get_temp_dir() . '/qr-iconcache';
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
    return $count > QR_ICON_MAX_PER_MINUTE;
}

if (qrIconCacheThrottled()) {
    fail('Príliš veľa požiadaviek.', 429);
}

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 1_500_000) {   // 3 ikony × ~300 KB base64 + réžia
    fail('Požiadavka je príliš veľká.', 413);
}
$req = json_decode($raw, true);
if (!is_array($req)) {
    fail('Telo požiadavky nie je platný JSON.');
}

$slug = (string)($req['slug'] ?? '');
if (!preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/', $slug)) {
    fail('Neplatný slug.');
}
$dataFile = __DIR__ . '/../data/' . $slug . '.json';
if (!is_file($dataFile)) {
    exit('{"ok":true}');   // neexistujúca prevádzka — tichý no-op, nie chyba
}
$dataMtime = (int)filemtime($dataFile);

$icons = is_array($req['icons'] ?? null) ? $req['icons'] : [];
$iconDir = __DIR__ . '/../assets/icons';
if (!is_dir($iconDir) && !@mkdir($iconDir, 0755, true) && !is_dir($iconDir)) {
    fail('Priečinok na ikony sa nepodarilo vytvoriť.', 500);
}

$saved = [];
foreach (QR_ICON_SIZES as $size) {
    $dataUrl = (string)($icons[(string)$size] ?? '');
    if ($dataUrl === '') {
        continue;
    }
    $path = $iconDir . "/{$slug}-{$size}.png";
    if (is_file($path) && (int)filemtime($path) >= $dataMtime) {
        continue;   // ikona je aktuálna, netreba prepisovať pri každej návšteve
    }
    if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) {
        continue;   // nesprávny tvar — preskočí sa, nezhodí celú požiadavku
    }
    $bytes = base64_decode($m[1], true);
    if ($bytes === false || strlen($bytes) === 0 || strlen($bytes) > QR_ICON_MAX_BYTES) {
        continue;
    }
    $info = @getimagesizefromstring($bytes);
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] !== $size || $info[1] !== $size) {
        continue;   // musí byť naozaj PNG presne požadovanej veľkosti
    }

    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $bytes) === false) {
        continue;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        continue;
    }
    $saved[] = $size;
}

echo json_encode(['ok' => true, 'saved' => $saved], JSON_UNESCAPED_UNICODE);
