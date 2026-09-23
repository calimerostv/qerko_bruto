<?php
/* ------------------------------------------------------------------
   auth.php — prihlásenie do administrácie, master heslo alebo účet
   jednotlivej prevádzky.

   Prijíma JSON POST: { "slug": "" alebo "kinonova", "password": "…" }
     slug prázdny  → overí sa proti master heslu (api/config.php)
     slug vyplnený → overí sa proti qr_venue_accounts v DB

   Pri úspechu vráti podpísaný token bez potreby serverovej session:
     { "ok": true, "token": "<payload>.<podpis>", "scope": "master"|"venue", "slug": "…" }

   Token si overí každý ďalší endpoint sám cez qrVerifyLogin
   (api/tokens.php). Master token je bez úložiska; token prevádzky
   nesie verziu účtu, ktorú server pri každom použití porovná s DB.
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

$req = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($req)) {
    fail('Telo požiadavky nie je platný JSON.');
}

$slug = trim((string)($req['slug'] ?? ''));
$password = (string)($req['password'] ?? '');
usleep(250000);   // brzda proti hádaniu hesla hrubou silou

if ($password === '') {
    fail('Chýba heslo.', 401);
}

if ($slug === '') {
    /* Master heslo — prístup ku všetkému, presne ako doteraz v save.php. */
    if (!password_verify($password, (string)$config['password_hash'])) {
        fail('Nesprávne heslo.', 401);
    }
    echo json_encode([
        'ok' => true,
        'scope' => 'master',
        'slug' => '',
        'token' => qrMakeToken(['scope' => 'master', 'slug' => ''], $config['password_hash']),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/* Účet konkrétnej prevádzky — vyžaduje databázu. Bez nej (napr. kým
   nie je nastavená) sa dá prihlásiť len master heslom. */
$db = qrDb();
if (!$db) {
    fail('Účty jednotlivých prevádzok nie sú nastavené (chýba api/dbconfig.php).', 501);
}
qrDbEnsureSchema($db);

$stmt = $db->prepare('SELECT password_hash, token_version FROM qr_venue_accounts WHERE slug = ?');
$stmt->execute([$slug]);
$row = $stmt->fetch();

if (!$row || !password_verify($password, (string)$row['password_hash'])) {
    fail('Nesprávne heslo.', 401);
}

echo json_encode([
    'ok' => true,
    'scope' => 'venue',
    'slug' => $slug,
    'token' => qrMakeToken(
        ['scope' => 'venue', 'slug' => $slug, 'ver' => (int)$row['token_version']],
        $config['password_hash']
    ),
], JSON_UNESCAPED_UNICODE);
