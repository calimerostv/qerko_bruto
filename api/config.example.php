<?php
/* ------------------------------------------------------------------
   Skopírujte tento súbor ako api/config.php a zmeňte heslo.
   config.php sa zámerne nedostane do gitu (viď .gitignore).

   Hash vyrobíte takto — spustite raz v prehliadači alebo v konzole:

     php -r "echo password_hash('vase-heslo', PASSWORD_DEFAULT), PHP_EOL;"

   alebo si nechajte vygenerovať dočasnú stránku:

     <?php echo password_hash('vase-heslo', PASSWORD_DEFAULT); ?>

   Nikdy sem nedávajte heslo v čitateľnej podobe.
   ------------------------------------------------------------------ */

/* Priamy prístup zvonku je zakázaný — niektoré servery servírujú PHP
   cez nginx, kde .htaccess pravidlá pre .php súbory nič nezmôžu, takže
   sa to rieši tu, nie na webserveri. */
if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

return [
    // Hash hesla do administrácie.
    'password_hash' => '$2y$10$ZAMENTE.TENTO.HASH.ZA.VLASTNY.ABCDEFGHIJKLMNOPQRSTUVWXYZ012',

    // Priečinok s dátami, relatívne k tomuto súboru.
    'data_dir' => __DIR__ . '/../data',

    // Maximálna veľkosť jedného súboru v bajtoch (logo v Base64 je veľké).
    'max_bytes' => 2 * 1024 * 1024,

    // Koľko predchádzajúcich verzií každého súboru sa drží v data/.backups.
    // 0 zálohovanie vypne.
    'keep_backups' => 20,
];
