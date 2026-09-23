/* ------------------------------------------------------------------
   swupdate.js — keď service worker nájde novú verziu, stránka sa raz
   sama obnoví. Bez toho by po nasadení mohla ostať načítaná stará
   verzia (starý shell → starý JS), kým používateľ ručne nevyčistí keš.

   Načítava sa na verejnej stránke aj v administrácii.
   ------------------------------------------------------------------ */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  /* iOS Safari má známu chybu: clients.claim() vie vyvolať
     'controllerchange' aj bez skutočnej zmeny workera, opakovane —
     bez poistky by to viedlo k nekonečnému reloadu ("blikaniu").
     window.__swReloaded chránil len jedno načítanie stránky, nie celú
     reláciu (po reloade sa vynuluje). Poistka preto ide do
     sessionStorage — v jednej karte sa auto-reload spustí najviac raz,
     aj keby prehliadač poslal 'controllerchange' viackrát za sebou. */
  var RELOAD_KEY = 'qr.sw.reloaded';

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (window.__swReloaded) return;
    window.__swReloaded = true;
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch (e) { /* súkromné prehliadanie a pod. — radšej reloadni raz */ }
    location.reload();
  });

  /* Pri každom otvorení skontroluj, či nie je novšia verzia SW. */
  navigator.serviceWorker.ready
    .then(function (reg) { return reg.update(); })
    .catch(function () {});
})();
