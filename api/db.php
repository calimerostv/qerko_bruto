<?php
/* ------------------------------------------------------------------
   db.php — jediné miesto, ktoré otvára pripojenie na databázu.
   Volá sa len z iných api/*.php súborov (QR_SAVE_ENTRY guard),
   nikdy priamo z prehliadača.

   Ak api/dbconfig.php chýba (napr. na Verceli, alebo kým DB ešte
   nie je nastavená), qrDb() vráti null — volajúci sa má podľa toho
   správať tak, akoby účty prevádzok a štatistiky boli vypnuté,
   nie hádzať chybu.
   ------------------------------------------------------------------ */

declare(strict_types=1);

if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

function qrDb(): ?PDO
{
    static $pdo = null;
    static $tried = false;
    if ($tried) {
        return $pdo;
    }
    $tried = true;

    $path = __DIR__ . '/dbconfig.php';
    if (!is_file($path)) {
        return null;
    }
    $cfg = require $path;

    try {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $cfg['host'],
            (int)$cfg['port'],
            $cfg['name'],
            $cfg['charset'] ?? 'utf8mb4'
        );
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        $pdo = null;
    }
    return $pdo;
}

/* Vytvorí tabuľky, ak ešte neexistujú. Volá sa pri každom požiadavku,
   ktorý DB potrebuje — CREATE TABLE IF NOT EXISTS je lacný no-op,
   keď už tabuľka je, a ušetrí to samostatný inštalačný krok. */
function qrDbEnsureSchema(PDO $db): void
{
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_venue_accounts (
            slug VARCHAR(48) PRIMARY KEY,
            password_hash VARCHAR(255) NOT NULL,
            token_version INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_stats_daily (
            venue_slug VARCHAR(48) NOT NULL,
            metric VARCHAR(64) NOT NULL,
            day DATE NOT NULL,
            count INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (venue_slug, metric, day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    /* Stĺpec pribudol dodatočne — staršie inštalácie ho ešte nemajú.
       MariaDB pozná IF NOT EXISTS, MySQL nie; tam sa chyba ticho zhltne
       a druhý pokus už prejde, lebo stĺpec medzitým existuje. */
    try {
        $db->exec('ALTER TABLE qr_venue_accounts ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 1');
    } catch (Throwable $e) {
        try {
            $db->exec('ALTER TABLE qr_venue_accounts ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1');
        } catch (Throwable $e2) {
            // stĺpec už existuje
        }
    }

    /* ---------- Server-server integrácia (napr. Déčko) -----------------
       Samostatné poverenie od master/venue prihlásenia — token viazaný
       na slug_prefix, takže smie zapisovať len svoj vlastný menný
       priestor. Pozri api/integration.php. */
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_integration_tokens (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(100) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            slug_prefix VARCHAR(24) NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP NULL DEFAULT NULL,
            UNIQUE KEY uniq_token_hash (token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    /* Mapovanie (source_system,event_id,occurrence_id) -> stabilný slug.
       Slug sa priradí raz pri prvom upserte a už sa nikdy nemení, aj keď
       klient neskôr pošle iný návrh — vytlačené QR musí zostať funkčné. */
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_integration_events (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            token_id INT UNSIGNED NOT NULL,
            source_system VARCHAR(64) NOT NULL,
            event_id VARCHAR(64) NOT NULL,
            occurrence_id VARCHAR(64) NOT NULL DEFAULT \'\',
            slug VARCHAR(48) NOT NULL,
            status ENUM(\'draft\',\'published\',\'finished\',\'cancelled\') NOT NULL DEFAULT \'draft\',
            content_version INT UNSIGNED NOT NULL DEFAULT 0,
            published_version INT UNSIGNED NULL DEFAULT NULL,
            draft_payload LONGTEXT NULL,
            published_payload LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_source_event (token_id, source_system, event_id, occurrence_id),
            UNIQUE KEY uniq_slug (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    /* Presná repríza tej istej požiadavky (rovnaký Idempotency-Key) vráti
       rovnakú odpoveď namiesto opakovania efektu. */
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_integration_idempotency (
            token_id INT UNSIGNED NOT NULL,
            idempotency_key VARCHAR(128) NOT NULL,
            request_hash CHAR(64) NOT NULL,
            http_status SMALLINT UNSIGNED NOT NULL,
            response_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (token_id, idempotency_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    /* Log každého pokusu, aj neúspešného — kto/kedy/čo/výsledok. */
    $db->exec(
        'CREATE TABLE IF NOT EXISTS qr_integration_audit (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            token_id INT UNSIGNED NOT NULL,
            action VARCHAR(32) NOT NULL,
            slug VARCHAR(48) NOT NULL DEFAULT \'\',
            idempotency_key VARCHAR(128) NOT NULL DEFAULT \'\',
            ok TINYINT(1) NOT NULL,
            http_status SMALLINT UNSIGNED NOT NULL,
            message VARCHAR(255) NOT NULL DEFAULT \'\',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_token_created (token_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
}
