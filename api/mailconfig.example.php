<?php
/* ------------------------------------------------------------------
   Skopírujte ako api/mailconfig.php a vyplňte SMTP prístup k schránke,
   z ktorej sa posielajú štatistické e-maily. Súbor sa zámerne nedostane
   do gitu (.gitignore).
   ------------------------------------------------------------------ */

if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

return [
    'host' => 'ZMENTE_TOTO_smtp.hosting.sk',
    'port' => 587,               // 587 = STARTTLS, 465 = priame TLS
    'user' => 'ZMENTE_TOTO@bruto.sk',
    'pass' => 'ZMENTE_TOTO_HESLO',
    'from' => 'ZMENTE_TOTO@bruto.sk',
    'fromName' => 'qr.bruto.sk',
    'ehlo' => 'qr.bruto.sk',

    // Kam chodia štatistické e-maily.
    'to' => 'milos@bruto.sk',

    // Voliteľné: tajný token, ktorým hostingový cron spúšťa report.php
    // cez HTTP (keď panel nevie spúšťať PHP z príkazového riadku).
    // Bez CLI aj bez tokenu report.php odmietne bežať.
    'cron_token' => '',
];
