<?php
/* ------------------------------------------------------------------
   make-integration-token.php — vygeneruje integračný token pre server-
   server API (api/integration.php), napr. pre Déčko.

   Token sa vypíše LEN RAZ na stdout — v DB je iba jeho sha256 hash,
   presne ako heslá (password_hash), takže sa nedá spätne zobraziť.
   Ak sa stratí, treba vygenerovať nový (starý zneplatniť revoke).

   Použitie (z koreňa projektu, tam kde je api/dbconfig.php):
     php tools/make-integration-token.php create "Déčko" "dc-"
     php tools/make-integration-token.php list
     php tools/make-integration-token.php revoke <id>
   ------------------------------------------------------------------ */

declare(strict_types=1);

define('QR_SAVE_ENTRY', true);

require_once __DIR__ . '/../api/db.php';
require_once __DIR__ . '/../api/tokens.php';

$db = qrDb();
if (!$db) {
    fwrite(STDERR, "Chyba: api/dbconfig.php chýba alebo pripojenie zlyhalo.\n");
    exit(1);
}
qrDbEnsureSchema($db);

$cmd = $argv[1] ?? '';

if ($cmd === 'create') {
    $label = trim((string)($argv[2] ?? ''));
    $prefix = trim((string)($argv[3] ?? ''));
    if ($label === '' || $prefix === '') {
        fwrite(STDERR, "Použitie: php tools/make-integration-token.php create \"Popis\" \"prefix-\"\n");
        exit(1);
    }
    if (!preg_match('/^[a-z0-9]+-$/', $prefix)) {
        fwrite(STDERR, "Prefix musí byť malými písmenami/číslicami a končiť pomlčkou, napr. \"dc-\".\n");
        exit(1);
    }
    $rawToken = bin2hex(random_bytes(32));
    $hash = hash('sha256', $rawToken);
    $stmt = $db->prepare('INSERT INTO qr_integration_tokens (label, token_hash, slug_prefix, enabled) VALUES (?, ?, ?, 1)');
    $stmt->execute([$label, $hash, $prefix]);
    $id = (int)$db->lastInsertId();
    echo "Token vytvorený (id {$id}), zapíšte si ho — nezobrazí sa znova:\n\n";
    echo $rawToken . "\n\n";
    echo "Menný priestor slugov: {$prefix}*\n";
    exit(0);
}

if ($cmd === 'list') {
    $rows = $db->query('SELECT id, label, slug_prefix, enabled, created_at, last_used_at FROM qr_integration_tokens ORDER BY id')->fetchAll();
    foreach ($rows as $row) {
        printf(
            "#%d  %-20s prefix=%-10s %s  vytvorené=%s  posledne_pouzite=%s\n",
            $row['id'],
            $row['label'],
            $row['slug_prefix'],
            $row['enabled'] ? 'aktivny' : 'zruseny',
            $row['created_at'],
            $row['last_used_at'] ?? '-'
        );
    }
    exit(0);
}

if ($cmd === 'revoke') {
    $id = (int)($argv[2] ?? 0);
    if ($id <= 0) {
        fwrite(STDERR, "Použitie: php tools/make-integration-token.php revoke <id>\n");
        exit(1);
    }
    $db->prepare('UPDATE qr_integration_tokens SET enabled = 0 WHERE id = ?')->execute([$id]);
    echo "Token #{$id} zrušený.\n";
    exit(0);
}

fwrite(STDERR, "Príkazy: create \"Popis\" \"prefix-\" | list | revoke <id>\n");
exit(1);
