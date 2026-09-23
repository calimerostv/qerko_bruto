<?php
/* ------------------------------------------------------------------
   Skopírujte ako api/dbconfig.php a vyplňte prístupové údaje k MySQL/
   MariaDB databáze. Súbor sa zámerne nedostane do gitu (.gitignore).

   Bez tohto súboru fungujú účty prevádzok aj štatistiky jednoducho
   ako vypnuté — zvyšok administrácie (JSON obsah, QR, atď.) beží
   ďalej bez zmeny.
   ------------------------------------------------------------------ */

if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

return [
    'host' => 'sql25.hostcreators.sk',
    'port' => 3330,
    'name' => 'd00000_zmente',
    'user' => 'u00000_zmente',
    'pass' => 'ZMENTE_TOTO_HESLO',
    'charset' => 'utf8mb4',
];
