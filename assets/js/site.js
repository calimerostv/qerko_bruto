/* ------------------------------------------------------------------
   site.js — verejná stránka.
   Zistí, ktorá prevádzka sa má zobraziť, načíta jej JSON a vykreslí ho.
   Funguje pri troch spôsoboch adresovania:
     qr.bruto.sk/bruto      (prepis na serveri — .htaccess / vercel.json)
     qr.bruto.sk/?p=bruto   (funguje aj bez prepisu, záložná cesta)
     qr.bruto.sk/#bruto     (úplná núdza, napr. otvorenie zo súboru)
     qr.bruto.sk/           (defaultSlug v config.js — jediná prevádzka)
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var CFG = window.QR_CONFIG || {};
  var S = window.QRSchema;
  var R = window.QRRender;

  /* Koreň inštalácie odvodíme z umiestnenia tohto skriptu, takže projekt
     funguje aj v podpriečinku bez akéhokoľvek nastavovania. */
  var BASE = (function () {
    var s = document.currentScript || (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();
    var src = s ? s.src : '';
    var i = src.indexOf('/assets/js/');
    if (i < 0) return '/';
    return new URL(src.slice(0, i + 1)).pathname;
  })();

  var root = document.getElementById('app');
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  var current = null;

  boot();

  function boot() {
    var slug = resolveSlug();
    if (!slug) return showDirectory();
    loadVenue(slug);
  }

  function resolveSlug() {
    var qs = new URLSearchParams(location.search).get('p');
    if (qs) return S.slugify(qs);
    if (location.hash.length > 1) return S.slugify(decodeURIComponent(location.hash.slice(1)));
    var path = decodeURIComponent(location.pathname);
    if (path.indexOf(BASE) === 0) path = path.slice(BASE.length);
    path = path.replace(/^\/+|\/+$/g, '');
    if (!path || /\.(html?|json|js|css)$/i.test(path)) return S.slugify(CFG.defaultSlug || '');
    return S.slugify(path.split('/')[0]);
  }

  function url(file) {
    return BASE + (CFG.dataDir || 'data/') + file + '?v=' + Date.now();
  }

  function loadVenue(slug) {
    fetch(url(slug + '.json'))
      .then(function (r) {
        if (!r.ok) throw new Error(r.status === 404 ? 'notfound' : 'http-' + r.status);
        return r.json();
      })
      .then(function (data) { paint(S.normalizeVenue(data)); })
      .catch(function (err) { showMissing(slug, err); });
  }

  var LS_LANG = 'qr.lang.';
  var currentLang = '';

  function paint(v) {
    current = v;
    R.ensureFont(v.theme.font);
    applyColors();

    var lang = v.langs.length ? (localStorage.getItem(LS_LANG + v.slug) || '') : '';
    if (lang && v.langs.indexOf(lang) < 0) lang = '';
    renderCurrent(lang);

    recordStat(v.slug, 'view');
    wireStatClicks(v.slug);

    /* Otváracie hodiny (alebo stav podujatia) sa v priebehu dňa prepnú
       aj bez obnovenia stránky — kontroluje sa raz za minútu, nie pri
       každom prepnutí jazyka. Celá stránka sa ale prekreslí len vtedy,
       keď sa text stavu naozaj zmenil (napr. "Otvorené" → "Zatvorené") —
       inak by sa každú minútu stratil rozbalený program, otvorená
       fotogaléria aj fokus, hoci sa v skutočnosti nič nezmenilo. */
    lastStatusKey = statusKey(v);
    setInterval(function () {
      if (!current) return;
      var key = statusKey(current);
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      renderCurrent(currentLang);
    }, 60000);
  }

  var lastStatusKey = '';
  function statusKey(v) {
    if (v.kind === 'event') {
      var es = S.eventStatus(v.event);
      return es ? es.phase + '|' + es.label : '';
    }
    var st = S.hoursStatus(v.hours);
    return st ? (st.open ? '1' : '0') + '|' + st.label + '|' + (st.until || '') + '|' + (st.from || '') : '';
  }

  function renderCurrent(lang) {
    var v = current;
    currentLang = lang;
    R.render(root, v, {
      brand: v.footer.showBrand ? CFG.brand : '',
      showHoursTable: true,
      lang: lang,
      onLangChange: function (code) {
        localStorage.setItem(LS_LANG + v.slug, code);
        renderCurrent(code);
      }
    });

    document.title = S.tr(v, 'name', lang) || CFG.brand;
    setMeta('description', S.tr(v.seo, 'description', lang) || S.tr(v, 'subtitle', lang) || '');
    document.documentElement.lang = lang || 'sk';

    /* Farba lišty prehliadača na telefóne nech sedí s hlavičkou. */
    var deep = getComputedStyle(document.documentElement).getPropertyValue('--deep').trim();
    setMeta('theme-color', deep, 'name');

    /* „Uložiť na plochu ako appku" — manifest a ikony pre túto prevádzku. */
    if (window.QRPwa) window.QRPwa.setup(v, BASE, lang);
  }

  function applyColors() {
    if (!current) return;
    R.applyTheme(document.documentElement, current.theme, { prefersDark: mql.matches });
  }

  /* Ak je téma "auto", reagujeme na prepnutie systému za behu. */
  if (mql.addEventListener) mql.addEventListener('change', applyColors);
  else if (mql.addListener) mql.addListener(applyColors);

  /* ---------- Rozcestník: koreň domény bez slugu ---------------------- */
  function showDirectory() {
    fetch(url('index.json'))
      .then(function (r) { return r.ok ? r.json() : { venues: [] }; })
      .then(function (idx) {
        var list = ((idx && idx.venues) || []).filter(function (i) { return !i.hidden; });
        R.applyTheme(document.documentElement, { preset: 'zrnko', mode: 'auto' }, { prefersDark: mql.matches });
        R.ensureFont('grotesk');

        root.className = 'venue';
        root.innerHTML = '';
        var head = document.createElement('div');
        head.className = 'dir';
        head.innerHTML =
          '<h1>' + escapeHtml(CFG.brand || 'Rozcestníky') + '</h1>' +
          '<p class="dek">' + escapeHtml(CFG.brandLine || '') + '</p>';
        root.appendChild(head);

        if (!list.length) {
          var empty = document.createElement('div');
          empty.className = 'oops';
          empty.innerHTML = '<p>Zatiaľ tu nie je žiadna prevádzka.</p>' +
            '<p><a class="tile" href="' + BASE + 'admin/">Otvoriť administráciu</a></p>';
          root.appendChild(empty);
          return;
        }

        var groups = [
          { title: 'Podujatia', icon: 'calendar', items: list.filter(function (i) { return i.kind === 'event'; }) },
          { title: 'Prevádzky', icon: 'layout-grid', items: list.filter(function (i) { return i.kind !== 'event'; }) }
        ];
        groups.forEach(function (g) {
          if (!g.items.length) return;
          var sec = document.createElement('section');
          sec.className = 'sec';
          // Nadpis skupiny ukáž len keď sú obe (inak je zbytočný).
          if (groups[0].items.length && groups[1].items.length) {
            var gh = document.createElement('h3');
            gh.className = 'sec-title';
            gh.textContent = g.title;
            sec.appendChild(gh);
          }
          var tiles = document.createElement('div');
          tiles.className = 'tiles is-list';
          g.items.forEach(function (item) {
            var a = document.createElement('a');
            a.className = 'tile';
            a.href = BASE + item.slug;
            a.innerHTML =
              '<span class="tile-ic">' + window.QRIcons.svg(g.icon) + '</span>' +
              '<span class="tile-body"><span class="tile-title"></span>' +
              (item.subtitle ? '<span class="tile-note"></span>' : '') + '</span>' +
              '<span class="tile-arrow">' + window.QRIcons.svg('chevron-right') + '</span>';
            a.querySelector('.tile-title').textContent = item.name || item.slug;
            if (item.subtitle) a.querySelector('.tile-note').textContent = item.subtitle;
            tiles.appendChild(a);
          });
          sec.appendChild(tiles);
          root.appendChild(sec);
        });

        var f = document.createElement('footer');
        f.className = 'foot';
        f.innerHTML = '<p class="foot-dim">' + escapeHtml(CFG.brand || '') + '</p>';
        root.appendChild(f);

        document.title = CFG.brand || 'Rozcestníky';
      })
      .catch(function () { showMissing('', new Error('index')); });
  }

  function showMissing(slug, err) {
    R.applyTheme(document.documentElement, { preset: 'zrnko', mode: 'auto' }, { prefersDark: mql.matches });
    root.className = 'venue';
    root.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'oops';
    if (err && err.message === 'notfound') {
      box.innerHTML =
        '<h1>Táto prevádzka tu nie je</h1>' +
        '<p>Adresa <code>' + escapeHtml(slug) + '</code> zatiaľ nemá vytvorený rozcestník.</p>';
    } else {
      box.innerHTML =
        '<h1>Stránku sa nepodarilo načítať</h1>' +
        '<p>Skúste to o chvíľu znova.</p>';
    }
    var back = document.createElement('a');
    back.className = 'tile';
    back.href = BASE;
    back.innerHTML = '<span class="tile-ic">' + window.QRIcons.svg('arrow-left') +
      '</span><span class="tile-body"><span class="tile-title">Späť na zoznam</span></span>';
    box.appendChild(back);
    root.appendChild(box);
    document.title = 'Nenájdené — ' + (CFG.brand || '');
  }

  function setMeta(name, content, attr) {
    if (!content) return;
    attr = attr || 'name';
    var m = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute(attr, name);
      document.head.appendChild(m);
    }
    m.setAttribute('content', content);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Anonymné počítadlo návštev a klikov ----------------------
     Len na PHP hostingu (bez api/dbconfig.php je "record" tichý no-op).
     Nikdy nesmie zablokovať ani spomaliť skutočnú navigáciu — preto
     fire-and-forget a klik na odkaz sa nikdy nečaká. */
  function statsEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? BASE + save.replace(/save\.php$/, 'stats.php') : '';
  }

  function recordStat(slug, metric) {
    var endpoint = statsEndpoint();
    if (!endpoint || !slug) return;
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', slug: slug, metric: metric }),
        keepalive: true   // požiadavka prežije aj okamžitý odchod zo stránky po kliku
      }).catch(function () {});
    } catch (e) { /* sendBeacon-like best effort, nikdy nezhodiť stránku */ }
  }

  var statsWired = false;
  function wireStatClicks(slug) {
    if (statsWired) return;   // root sa prekresľuje (napr. hodinová obnova), počúvadlo stačí raz
    statsWired = true;
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-metric]');
      if (el) recordStat(slug, el.getAttribute('data-metric'));
    });
  }
})();
