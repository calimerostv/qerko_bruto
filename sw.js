/* ------------------------------------------------------------------
   sw.js — service worker pre QR rozcestníky.

   Cieľ: stránka sa dá „nainštalovať" na plochu a otvorí sa aj bez
   signálu (jarmok, slabá sieť). Nekešuje natvrdo — spolieha sa na
   ?v=… cache-busting v index.html, takže po nasadení novej verzie
   assetov sa stiahnu čerstvé samy. Pri zmene CACHE sa starý obsah
   zmaže.

   Pri každom nasadení, kde sa menil JS/CSS, zvýš CACHE rovnako ako
   ?v=… v index.html a admin/index.html.
   ------------------------------------------------------------------ */
var CACHE = 'qr-20260923a';

var SHELL = [
  './',
  './index.html',
  './assets/css/site.css?v=20260923a',
  './assets/js/swupdate.js?v=20260923a',
  './assets/js/config.js?v=20260923a',
  './assets/js/icons.js?v=20260923a',
  './assets/js/schema.js?v=20260923a',
  './assets/js/render.js?v=20260923a',
  './assets/js/site.js?v=20260923a',
  './assets/js/pwa.js?v=20260923a',
  './assets/img/favicon.svg?v=20260923a'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});   // jedna chýbajúca URL nezhodí inštaláciu
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  /* Navigácia a HTML (index.html, admin/) — vždy zo siete s obídením
     HTTP keše prehliadača (`cache: 'no-store'`), inak by sa načítal
     starý shell so zastaraným ?v=… (hosting nevie nastaviť Cache-Control
     na .html). Offline padáme na keš. */
  if (req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html').then(function (m) {
            return m || caches.match('./');
          });
        });
      })
    );
    return;
  }

  if (!sameOrigin) {
    /* Písma a pod. — ber z keše, na pozadí dopĺňaj. */
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  /* Dáta prevádzky — sieť má prednosť (aktuálnosť), offline z keše.
     URL nesie meniace sa ?v=Date.now(), preto sa kešuje bez query.
     Do keše ide len úspešná odpoveď s platným JSON — dočasná 500-ka
     alebo HTML chybová stránka by inak prepísala funkčnú offline kópiu. */
  if (/\/data\/.+\.json/.test(url.pathname)) {
    var key = stripQuery(req);
    e.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          e.waitUntil(cacheIfValidJson(key, res.clone()));
        }
        return res;
      }).catch(function () {
        return caches.match(key).then(function (hit) {
          return hit || caches.match(req, { ignoreSearch: true });
        }).then(function (hit) {
          return hit || new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  /* Assety (majú ?v=…) — z keše, na pozadí obnov. */
  e.respondWith(staleWhileRevalidate(req));
});

/* Uloží odpoveď len ak sa dá rozparsovať ako JSON — chránená kópia
   pre offline režim nesmie byť poškodená. */
function cacheIfValidJson(key, res) {
  return res.clone().text().then(function (text) {
    JSON.parse(text);   // vyhodí pri neplatnom obsahu → catch nižšie
    return caches.open(CACHE).then(function (c) { return c.put(key, res); });
  }).catch(function () {});
}

function stripQuery(req) {
  var u = new URL(req.url);
  u.search = '';
  return new Request(u.toString());
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}
