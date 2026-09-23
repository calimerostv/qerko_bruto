<?php
/* ------------------------------------------------------------------
   manifest.php — skutočný (nie blob:) manifest pre jednu prevádzku,
   podľa ?slug=.

   Android/Chrome pri reálnej inštalácii appky (nie len záložky)
   sťahuje manifest cez svoju vlastnú službu na pozadí (WebAPK), ktorá
   sa k blob: URL (pôvodné riešenie, skladané v assets/js/pwa.js za
   behu v prehliadači) nedostane — prompt sa zobrazí, ale inštalácia
   potichu zlyhá. Meno/farby sa tu vedia dopočítať priamo zo servera
   (rovnaké dáta ako pwa.js), ale ikony s logom alebo iniciálami sa
   kreslia cez <canvas> v prehliadači — tie sem priebežne posiela
   pwa.js cez api/iconcache.php (viď tam) a manifest ich len odkazuje.
   Kým prvý návštevník appku neotvorí (a ikonu tým neuloží), použije sa
   univerzálna náhrada (assets/img/og-default.png).
   ------------------------------------------------------------------ */

declare(strict_types=1);

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

$slug = preg_replace('/[^a-z0-9-]/', '', strtolower((string)($_GET['slug'] ?? '')));
if ($slug === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/', $slug)) {
    http_response_code(400);
    exit('{"error":"invalid slug"}');
}

$file = __DIR__ . '/data/' . $slug . '.json';
if (!is_file($file)) {
    http_response_code(404);
    exit('{"error":"not found"}');
}
$venue = json_decode((string)file_get_contents($file), true);
$venue = is_array($venue) ? $venue : [];

$name = (string)($venue['name'] ?? $slug);

/* Rovnaká paleta ako THEMES v assets/js/schema.js — len farba hlavičky
   ("deep"), viac tu netreba (manifest ju použije ako theme_color a
   pozadie splash screenu, samotnú ikonu má už hotovú súbor z keše). */
const QR_THEME_DEEP = [
    'zrnko'    => ['light' => '#0E3B36', 'dark' => '#08201E'],
    'kino'     => ['light' => '#1B1430', 'dark' => '#120C22'],
    'kniznica' => ['light' => '#152449', 'dark' => '#101833'],
    'muzeum'   => ['light' => '#3B2A1B', 'dark' => '#231A12'],
    'les'      => ['light' => '#153A22', 'dark' => '#0E2415'],
    'mesto'    => ['light' => '#0E2A38', 'dark' => '#0B1F29'],
    'vinohrad' => ['light' => '#3A1420', 'dark' => '#241017'],
    'grafit'   => ['light' => '#1A1A1A', 'dark' => '#151515'],
];

function qrResolveDeep(array $venue): string
{
    $theme = is_array($venue['theme'] ?? null) ? $venue['theme'] : [];
    if (!empty($theme['deep']) && is_string($theme['deep'])) {
        return $theme['deep'];
    }
    $preset = QR_THEME_DEEP[$theme['preset'] ?? ''] ?? QR_THEME_DEEP['zrnko'];
    $mode = ($theme['mode'] ?? '') === 'light' ? 'light' : 'dark';
    return $preset[$mode];
}

/* Rovnaká logika ako shortNameFor() v assets/js/pwa.js — celé slová
   (aj cez pomlčky), kým sa zmestia do limitu, nie orezané uprostred
   slova ani len iniciály (Android tým aj appku vyhľadáva). */
function shortNameFor(array $venue, string $name): string
{
    if (mb_strlen($name) <= 15) {
        return $name;
    }
    $words = preg_split('/\s+/', str_replace('-', ' ', $name), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $out = '';
    foreach ($words as $word) {
        $next = $out === '' ? $word : $out . ' ' . $word;
        if (mb_strlen($next) > 15) {
            break;
        }
        $out = $next;
    }
    if ($out !== '') {
        return $out;
    }
    $mark = is_array($venue['mark'] ?? null) ? $venue['mark'] : [];
    $text = ($mark['type'] ?? '') === 'text' ? trim((string)($mark['text'] ?? '')) : '';
    return $text !== '' ? $text : mb_substr($name, 0, 15);
}

$deep = qrResolveDeep($venue);

$iconDir = __DIR__ . '/assets/icons';
$icons = [];
foreach ([192, 512, 180] as $size) {
    $path = $iconDir . "/{$slug}-{$size}.png";
    if (is_file($path)) {
        $icons[] = [
            'src' => "/assets/icons/{$slug}-{$size}.png?v=" . filemtime($path),
            'sizes' => "{$size}x{$size}",
            'type' => 'image/png',
            'purpose' => $size === 512 ? 'any maskable' : 'any',
        ];
    }
}
if (!$icons) {
    // Kým sa ikona z prehliadača ešte nestihla uložiť (viď hore).
    $icons[] = ['src' => '/assets/img/og-default.png', 'sizes' => '1200x630', 'type' => 'image/png'];
}

echo json_encode([
    'id' => '/' . $slug,
    'name' => $name,
    'short_name' => shortNameFor($venue, $name),
    'start_url' => '/' . $slug,
    'scope' => '/',
    'display' => 'standalone',
    'orientation' => 'portrait',
    'background_color' => $deep,
    'theme_color' => $deep,
    'icons' => $icons,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
