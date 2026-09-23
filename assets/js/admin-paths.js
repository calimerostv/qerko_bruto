/* ------------------------------------------------------------------
   admin-paths.js — administrácia je o priečinok nižšie než koreň
   inštalácie, tak posunieme relatívne cesty z config.js.

   Vlastný súbor namiesto inline <script> v admin/index.html, aby
   Content-Security-Policy mohla mať script-src bez 'unsafe-inline'.
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  var c = window.QR_CONFIG;
  c.dataDir = '../' + c.dataDir;
  if (c.storage && c.storage.php) c.storage.php = '../' + c.storage.php;
})();
