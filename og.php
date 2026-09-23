<?php
/* ------------------------------------------------------------------
   og.php — správny náhľad pri zdieľaní na Facebooku, v správach a pod.

   Skutoční návštevníci vidia SPA (index.html) ako doteraz — sem ich
   .htaccess vôbec nepustí. Sem sa dostanú len roboty sociálnych sietí
   (Facebook, X, WhatsApp, Slack, Discord…), ktoré JavaScript nespúšťajú
   a potrebujú meta tagy hneď v HTML.

   Len na PHP hostingu. Na Verceli tento súbor neexistuje a zdieľanie
   ukáže len všeobecný branding namiesto mena konkrétnej prevádzky —
   opraviteľné neskôr serverless funkciou, viď TODO.md.
   ------------------------------------------------------------------ */

declare(strict_types=1);

$slug = preg_replace('/[^a-z0-9-]/', '', strtolower((string)($_GET['slug'] ?? '')));
$dataDir = __DIR__ . '/data';

/* Domény, na ktorých tento skript naozaj beží. HTTP_HOST posiela klient
   a nedá sa mu veriť bez kontroly — inak by si cudzí Host dostal cestu
   do og:url/og:image/canonical, ktoré roboty sociálnych sietí zoberú
   ako dôveryhodné. Pri presune na ďalšiu doménu (viď TODO.md) sem
   pridajte novú položku súčasne so zmenou assets/js/config.js. */
const QR_OG_ALLOWED_HOSTS = ['qr.bruto.sk', 'localhost'];

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$host = preg_replace('/:\d+$/', '', $host);   // port preč, allowlist ho nenesie
if (!in_array($host, QR_OG_ALLOWED_HOSTS, true)) {
    $host = QR_OG_ALLOWED_HOSTS[0];
}
$base = $scheme . '://' . $host;

$name = 'Rozcestníky prevádzok';
$description = '';
$pageUrl = $base . '/';

if ($slug !== '') {
    $file = $dataDir . '/' . $slug . '.json';
    if (is_file($file)) {
        $venue = json_decode((string)file_get_contents($file), true);
        if (is_array($venue)) {
            $name = (string)($venue['name'] ?? $name);
            $description = (string)($venue['seo']['description'] ?? $venue['subtitle'] ?? '');
        }
    }
    $pageUrl = $base . '/' . $slug;
}

/* Fotka v hlavičke sa ukladá ako Base64 (data:) — to nie je platná
   hodnota pre og:image, tá musí byť skutočná http(s) adresa. Pokým
   fotky nebudú mať aj samostatný verejný odkaz, používa sa jeden
   spoločný branding obrázok pre všetky prevádzky. */
$image = $base . '/assets/img/og-default.png';

function ogEsc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=600');
?>
<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<title><?= ogEsc($name) ?></title>
<meta name="description" content="<?= ogEsc($description) ?>">
<link rel="canonical" href="<?= ogEsc($pageUrl) ?>">

<meta property="og:type" content="website">
<meta property="og:title" content="<?= ogEsc($name) ?>">
<meta property="og:description" content="<?= ogEsc($description) ?>">
<meta property="og:url" content="<?= ogEsc($pageUrl) ?>">
<meta property="og:image" content="<?= ogEsc($image) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= ogEsc($name) ?>">
<meta name="twitter:description" content="<?= ogEsc($description) ?>">
<meta name="twitter:image" content="<?= ogEsc($image) ?>">
</head>
<body>
<h1><?= ogEsc($name) ?></h1>
<?php if ($description): ?><p><?= ogEsc($description) ?></p><?php endif; ?>
<p><a href="<?= ogEsc($pageUrl) ?>">Otvoriť stránku</a></p>
</body>
</html>
