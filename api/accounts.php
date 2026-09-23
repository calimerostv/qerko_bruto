<?php
/* ------------------------------------------------------------------
   accounts.php — správa hesiel jednotlivých prevádzok. Len master.

   Prijíma JSON POST:
     { "action": "list",   "password"/"token": "…" }
     { "action": "set",    "password"/"token": "…", "slug": "kinonova", "newPassword": "…" }
     { "action": "remove", "password"/"token": "…", "slug": "kinonova" }
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

/* ---------- Len master smie spravovať účty ostatných prevádzok. ------- */
$token = (string)($req['token'] ?? '');
$password = (string)($req['password'] ?? '');
usleep(250000);

$login = qrVerifyLogin($token, $password, $config);
if (!$login || $login['scope'] !== 'master') {
    fail('Túto akciu smie vykonať len master heslo.', 401);
}

$db = qrDb();
if (!$db) {
    fail('Účty prevádzok nie sú nastavené (chýba api/dbconfig.php).', 501);
}
qrDbEnsureSchema($db);

$action = (string)($req['action'] ?? '');

if ($action === 'list') {
    $rows = $db->query('SELECT slug, updated_at FROM qr_venue_accounts ORDER BY slug')->fetchAll();
    echo json_encode(['ok' => true, 'accounts' => $rows], JSON_UNESCAPED_UNICODE);
    exit;
}

$slug = (string)($req['slug'] ?? '');
if (!qrIsValidSlug($slug)) {
    fail('Neplatný slug.');
}

if ($action === 'remove') {
    $stmt = $db->prepare('DELETE FROM qr_venue_accounts WHERE slug = ?');
    $stmt->execute([$slug]);
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'set') {
    $newPassword = (string)($req['newPassword'] ?? '');
    if (strlen($newPassword) < 6) {
        fail('Heslo musí mať aspoň 6 znakov.');
    }
    /* token_version + 1 zneplatní všetky doteraz vydané tokeny účtu —
       kto pozná staré heslo, nesmie ostať prihlásený ani do expirácie. */
    $hash = password_hash($newPassword, PASSWORD_DEFAULT);
    $stmt = $db->prepare(
        'INSERT INTO qr_venue_accounts (slug, password_hash) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                                 token_version = token_version + 1'
    );
    $stmt->execute([$slug, $hash]);
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

fail('Neznáma akcia.');
