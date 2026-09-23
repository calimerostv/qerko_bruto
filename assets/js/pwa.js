/* ------------------------------------------------------------------
   pwa.js — „uložiť na plochu ako appku".

   Jeden index.html slúži všetkým prevádzkam — manifest je preto
   manifest.php?slug=… (server dorenderuje meno/farby z data/<slug>.json).
   Skutočná (nie blob:) adresa je nutná, lebo Android pri reálnej
   inštalácii (WebAPK) sťahuje manifest aj ikony cez službu na pozadí,
   ktorá sa k blob: nedostane. iOS sa na manifest nepozerá, potrebuje
   vlastné <link rel="apple-touch-icon"> a <meta apple-mobile-web-app-*>,
   tie sa nastavujú tiež tu — tam blob: stačí, číta sa priamo v karte.

   Ikonu vygenerujeme z loga prevádzky (ak je nahraté) alebo z iniciál
   na farbe témy — cez <canvas> do PNG, a pošleme na uloženie ako
   skutočný súbor (api/iconcache.php), aby ju mal z čoho vziať aj
   manifest.php.

   Service worker (sw.js v koreni) sa stará o offline režim a o výzvu
   „Pridať na plochu" na Androide.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var iconCache = {};     // slug|lang|theme -> Promise<{png192, png512, png180}>
  var swTried = false;
  var deferredPrompt = null;   // Android/Chrome: odchytená výzva na inštaláciu
  var lastName = '';           // meno prevádzky pre text tlačidla

  window.QRPwa = { setup: setup };

  /* Android/Chrome pošle beforeinstallprompt, keď je stránka
     „inštalovateľná". Odchytíme ju a ponúkneme vlastné tlačidlo. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    mountInstallCta();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var cta = document.getElementById('pwaCta');
    if (cta) cta.remove();
  });

  /* Krátky názov pod ikonkou na ploche (Android najprv skúša short_name,
     iOS berie apple-mobile-web-app-title) — a Android ho použije aj na
     vyhľadávanie appky v systéme, preto sa nemá orezať na samotnú
     skratku ("APS"): hľadanie "auto" by ju potom nenašlo. Namiesto toho
     sa berú celé slová (aj cez pomlčky) dokým sa zmestia do limitu —
     "Auto-Pneu-Servis Krivosudský" → "Auto Pneu", nie useknuté
     uprostred slova ani len iniciály. Na skratku z hlavičky (mark.text)
     sa siahne len keď by inak ostalo prázdno. */
  function shortNameFor(venue, name) {
    if (name.length <= 15) return name;
    var words = name.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    var out = '';
    for (var i = 0; i < words.length; i++) {
      var next = out ? out + ' ' + words[i] : words[i];
      if (next.length > 15) break;
      out = next;
    }
    if (out) return out;
    var mark = venue.mark && venue.mark.type === 'text' ? (venue.mark.text || '').trim() : '';
    return mark || name.slice(0, 15);
  }

  /* Zavolá site.js po vykreslení (a pri prepnutí jazyka/témy). */
  function setup(venue, base, lang) {
    if (!venue || !venue.slug) return;
    lang = lang || '';

    var cs = getComputedStyle(document.documentElement);
    var deep = cs.getPropertyValue('--deep').trim() || '#0E3B36';
    var deepInk = cs.getPropertyValue('--deep-ink').trim() || '#EAF2F0';

    var name = (window.QRSchema.tr(venue, 'name', lang) || venue.slug).trim();
    var shortName = shortNameFor(venue, name);

    var key = venue.slug + '|' + (venue.mark && venue.mark.image ? 'logo' : name) + '|' + deep + '|' + deepInk;
    if (!iconCache[key]) iconCache[key] = buildIcons(venue, name, deep, deepInk);

    iconCache[key].then(function (ic) {
      /* iOS berie ikonu priamo z tohto <link>, synchrónne v tej istej
         karte — blob: URL tam je v poriadku, žiadny server ju sťahovať
         nemusí. */
      setLink('apple-touch-icon', ic.png180);
      /* Android/Chrome pri SKUTOČNEJ inštalácii appky (nie len záložky)
         naopak manifest aj ikony sťahuje cez vlastnú službu na pozadí
         (WebAPK) — tá sa k blob: URL nedostane. Preto sa vykreslená
         ikona pošle na uloženie ako reálny súbor (viď manifest.php a
         api/iconcache.php); manifest odkazuje na tie súbory, nie na
         blob. Fire-and-forget — nesmie spomaliť ani zablokovať stránku. */
      uploadIconCache(base, venue.slug, ic);
    });

    setLink('manifest', base + 'manifest.php?slug=' + encodeURIComponent(venue.slug));

    setNamedMeta('apple-mobile-web-app-capable', 'yes');
    setNamedMeta('mobile-web-app-capable', 'yes');
    setNamedMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    setNamedMeta('apple-mobile-web-app-title', shortName);

    registerSW(base);

    lastName = name;
    mountInstallCta();
  }

  var iconUploaded = {};
  function uploadIconCache(base, slug, ic) {
    if (iconUploaded[slug]) return;   // raz za návštevu stačí
    iconUploaded[slug] = true;
    try {
      fetch(base + 'api/iconcache.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, icons: { 192: ic.png192, 512: ic.png512, 180: ic.png180 } }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* best effort, nikdy nezhodiť stránku */ }
  }

  /* ---------- tlačidlo „Pridať na plochu ako appku" ------------------
     Úplne na konci stránky. Android/Chrome → spustí natívnu výzvu.
     iPhone (Safari nemá beforeinstallprompt) → ukáže návod. Keď už
     appka beží (display: standalone), tlačidlo sa nezobrazí. */
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function mountInstallCta() {
    var app = document.getElementById('app');
    if (!app || isStandalone()) return;
    if (sessionStorage.getItem('qr.pwa.hide') === '1') return;

    var canPrompt = !!deferredPrompt;
    var ios = isIOS();
    if (!canPrompt && !ios) return;   // desktop / prehliadač bez podpory — nič

    var old = document.getElementById('pwaCta');
    if (old) old.remove();

    var wrap = document.createElement('div');
    wrap.className = 'pwa-cta';
    wrap.id = 'pwaCta';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwa-cta-btn';
    btn.innerHTML = window.QRIcons.svg('download') +
      '<span>Pridať na plochu ako appku</span>';
    btn.addEventListener('click', function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          wrap.remove();
        });
      } else {
        showIosSheet();
      }
    });

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pwa-cta-x';
    dismiss.setAttribute('aria-label', 'Skryť');
    dismiss.innerHTML = window.QRIcons.svg('x');
    dismiss.addEventListener('click', function () {
      sessionStorage.setItem('qr.pwa.hide', '1');
      wrap.remove();
    });

    wrap.appendChild(btn);
    wrap.appendChild(dismiss);
    app.appendChild(wrap);
  }

  function showIosSheet() {
    if (document.getElementById('pwaSheet')) return;
    var ov = document.createElement('div');
    ov.className = 'pwa-sheet';
    ov.id = 'pwaSheet';
    var name = lastName ? ('„' + lastName + '"') : 'stránku';
    ov.innerHTML =
      '<div class="pwa-sheet-card" role="dialog" aria-label="Pridať na plochu">' +
        '<button type="button" class="pwa-sheet-x" aria-label="Zavrieť">' +
          window.QRIcons.svg('x') + '</button>' +
        '<h3>Pridať ' + escapeHtml(name) + ' na plochu</h3>' +
        '<ol>' +
          '<li>Ťukni na <strong>Zdieľať</strong> ' +
            '<span class="pwa-sheet-ic">' + window.QRIcons.svg('share-2') + '</span> ' +
            'v spodnej lište Safari.</li>' +
          '<li>Vyber <strong>Pridať na plochu</strong>.</li>' +
          '<li>Potvrď <strong>Pridať</strong> vpravo hore.</li>' +
        '</ol>' +
        '<p class="pwa-sheet-note">Otvorí sa na celú obrazovku a funguje aj bez signálu.</p>' +
      '</div>';
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('.pwa-sheet-x')) close();
    });
    document.body.appendChild(ov);
  }

  /* ---------- ikony -------------------------------------------------- */
  function buildIcons(venue, name, deep, ink) {
    var logo = venue.mark && venue.mark.image;
    return loadImage(logo).then(function (img) {
      return {
        png192: drawIcon(192, img, name, deep, ink),
        png512: drawIcon(512, img, name, deep, ink),
        png180: drawIcon(180, img, name, deep, ink)
      };
    });
  }

  function drawIcon(size, img, name, deep, ink) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d');

    x.fillStyle = deep;
    x.fillRect(0, 0, size, size);

    if (img) {
      /* Logo vpíš do ~68 % plochy so zachovaním pomeru strán. */
      var box = size * 0.68;
      var r = Math.min(box / img.width, box / img.height);
      var w = img.width * r, h = img.height * r;
      x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    } else {
      var initials = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)
        .slice(0, 2).map(function (s) { return s[0]; }).join('').toUpperCase() || 'QR';
      x.fillStyle = ink;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      var fam = getComputedStyle(document.documentElement).getPropertyValue('--display').trim()
        || 'system-ui, sans-serif';
      x.font = '700 ' + Math.round(size * (initials.length > 1 ? 0.4 : 0.52)) + 'px ' + fam;
      x.fillText(initials, size / 2, size / 2 + size * 0.02);
    }
    return c.toDataURL('image/png');
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* ---------- service worker --------------------------------------- */
  function registerSW(base) {
    if (swTried || !('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    swTried = true;
    /* updateViaCache: 'none' — sw.js sa pri kontrole aktualizácie vždy
       stiahne zo siete. Na tomto hostingu nginx obchádza no-cache
       hlavičku z .htaccess a servíruje sw.js s ročnou kešou, toto to
       obchádza na strane prehliadača. */
    navigator.serviceWorker.register(base + 'sw.js', {
      scope: base,
      updateViaCache: 'none'
    }).catch(function () {});
  }

  /* ---------- drobné pomôcky -------------------------------------- */
  function setLink(rel, href) {
    var l = document.querySelector('link[rel="' + rel + '"]');
    if (!l) {
      l = document.createElement('link');
      l.rel = rel;
      document.head.appendChild(l);
    }
    l.setAttribute('href', href);
  }

  function setNamedMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', name);
      document.head.appendChild(m);
    }
    m.setAttribute('content', content);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
