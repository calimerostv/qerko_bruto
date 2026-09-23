/* ------------------------------------------------------------------
   render.js — vykreslí prevádzku do zadaného elementu.
   Ten istý kód beží na verejnej stránke aj v náhľade administrácie,
   takže náhľad nemôže "klamať".
   Závisí na: schema.js, icons.js
   ------------------------------------------------------------------ */
(function (g) {
  'use strict';

  var S = g.QRSchema;
  var I = g.QRIcons;

  /* ---------- Farby: téma → CSS premenné -----------------------------
     Toto je jediné miesto, kde sa rozhoduje o farbách. Vloží sa na
     ľubovoľný element (scope), takže v administrácii môžu vedľa seba
     existovať dve rôzne témy naraz.
     -------------------------------------------------------------------*/
  function applyTheme(scope, theme, opts) {
    opts = opts || {};
    theme = theme || {};
    var preset = S.THEMES[theme.preset] || S.THEMES.zrnko;
    var mode = theme.mode || 'auto';
    var resolved = mode === 'auto' ? (opts.prefersDark ? 'dark' : 'light') : mode;
    var t = Object.assign({}, preset[resolved === 'dark' ? 'dark' : 'light']);

    // Vlastné farby z administrácie prebijú tému.
    if (theme.accent) { t.accent = theme.accent; t.accentInk = readableInk(theme.accent); }
    if (theme.deep) { t.deep = theme.deep; t.deepInk = readableInk(theme.deep); }

    var font = S.FONTS[theme.font] || S.FONTS.grotesk;
    var st = scope.style;
    st.setProperty('--bg', t.bg);
    st.setProperty('--surface', t.surface);
    st.setProperty('--surface-2', t.surface2);
    st.setProperty('--ink', t.ink);
    st.setProperty('--muted', t.muted);
    st.setProperty('--line', t.line);
    st.setProperty('--accent', t.accent);
    st.setProperty('--accent-ink', t.accentInk);
    st.setProperty('--deep', t.deep);
    st.setProperty('--deep-ink', t.deepInk);
    st.setProperty('--good', t.good);
    st.setProperty('--display', font.display);
    st.setProperty('--body', font.body);
    st.setProperty('--shadow', resolved === 'dark'
      ? '0 1px 2px rgba(0,0,0,.4),0 14px 34px -14px rgba(0,0,0,.7)'
      : '0 1px 2px rgba(14,20,18,.06),0 12px 32px -12px rgba(14,20,18,.22)');
    scope.setAttribute('data-resolved-theme', resolved);
    return { tokens: t, resolved: resolved, font: font };
  }

  /* Čierny alebo biely text na danej farbe — podľa relatívneho jasu. */
  function readableInk(bgHex) {
    var c = bgHex.replace('#', '');
    var r = parseInt(c.slice(0, 2), 16) / 255;
    var gg = parseInt(c.slice(2, 4), 16) / 255;
    var b = parseInt(c.slice(4, 6), 16) / 255;
    function lin(x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    var L = 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    return L > 0.42 ? '#141414' : '#FFFFFF';
  }

  /* Načíta Google fonty pre zvolenú dvojicu, ak treba. */
  function ensureFont(fontKey) {
    var font = S.FONTS[fontKey] || S.FONTS.grotesk;
    if (!font.google) return;
    var id = 'qr-font-' + fontKey;
    if (document.getElementById(id)) return;
    var href = 'https://fonts.googleapis.com/css2?' +
      font.google.split('|').map(function (f) { return 'family=' + f; }).join('&') +
      '&display=swap';
    var l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  /* ---------- Vykreslenie -------------------------------------------- */
  function render(root, venue, opts) {
    opts = opts || {};
    venue = S.normalizeVenue(venue);
    root.innerHTML = '';
    root.className = 'venue';

    var lang = (opts.lang && venue.langs.indexOf(opts.lang) >= 0) ? opts.lang : '';

    root.appendChild(hero(venue, lang));
    if (venue.primary.enabled) {
      var p = primaryCta(venue, opts, lang);
      if (p) root.appendChild(p);
    }

    venue.sections.forEach(function (sec) {
      var visible = sec.tiles.filter(function (t) { return !t.hidden && usable(t, venue, opts); });
      if (!visible.length) return;
      var wrap = el('section', 'sec');
      var secTitle = S.tr(sec, 'title', lang);
      if (secTitle) wrap.appendChild(el('h3', 'sec-title', secTitle));
      var list = el('div', 'tiles ' + (sec.layout === 'grid' ? 'is-grid' : 'is-list'));
      visible.forEach(function (t) { list.appendChild(tile(t, venue, sec.layout, opts, lang)); });
      wrap.appendChild(list);
      root.appendChild(wrap);
    });

    if (venue.kind === 'event') {
      var prog = programTable(venue, lang);
      if (prog) root.appendChild(prog);
    } else if (venue.hours.enabled && opts.showHoursTable !== false) {
      root.appendChild(hoursTable(venue));
    }

    root.appendChild(footer(venue, opts, lang));
    wireActions(root, venue);
    return root;
  }

  function hero(v, lang) {
    var h = el('header', 'hero');

    /* Fotka na pozadí. Farebná vrstva témy nad ňou drží text čitateľný,
       jej krytie sa nastavuje v administrácii. */
    if (v.hero && v.hero.image) {
      h.classList.add('has-photo');
      h.style.backgroundImage = 'url("' + v.hero.image.replace(/"/g, '%22') + '")';
      h.style.setProperty('--hero-dim', v.hero.dim);
    }

    var mark = el('div', 'mark');
    if (v.mark.type === 'image' && v.mark.image) {
      var img = document.createElement('img');
      img.src = v.mark.image;
      img.alt = '';
      mark.appendChild(img);
      mark.classList.add('is-img');
    } else {
      mark.textContent = (v.mark.text || initials(v.name)).slice(0, 3);
    }
    h.appendChild(mark);

    h.appendChild(el('h2', '', S.tr(v, 'name', lang) || (v.kind === 'event' ? 'Názov podujatia' : 'Názov prevádzky')));

    if (v.kind === 'event') {
      if (v.decko && v.decko.status) {
        var deckoLabel = v.decko.status === 'cancelled' ? 'Zrušené' : 'Podujatie skončilo';
        var db = el('p', 'status is-cancelled');
        db.appendChild(el('span', 'dot'));
        db.appendChild(document.createTextNode(deckoLabel));
        h.appendChild(db);
      }
      var when = eventDateLine(v.event);
      if (when) h.appendChild(el('p', 'where', when));
      var place = S.tr(v.event, 'place', lang);
      if (place) h.appendChild(el('p', 'where', place));

      var es = S.eventStatus(v.event);
      if (es && !(v.decko && v.decko.status)) {
        var eb = el('p', 'status is-' + es.phase);
        eb.appendChild(el('span', 'dot'));
        eb.appendChild(document.createTextNode(es.label));
        h.appendChild(eb);
      }
      var after = S.tr(v.event, 'afterText', lang);
      if (after && es && es.phase === 'after') h.appendChild(el('p', 'where', after));
      return h;
    }

    var subtitle = S.tr(v, 'subtitle', lang);
    if (subtitle) h.appendChild(el('p', 'where', subtitle));

    var st = S.hoursStatus(v.hours);
    if (st) {
      var b = el('p', 'status ' + (st.open ? 'is-open' : 'is-closed'));
      b.appendChild(el('span', 'dot'));
      var txt = st.label;
      if (st.open && st.until) txt += ' · do ' + st.until;
      else if (st.from) txt += ' · otvárame ' + (st.fromDay ? st.fromDay + ' ' : '') + 'o ' + st.from;
      b.appendChild(document.createTextNode(txt));
      h.appendChild(b);
    }
    return h;
  }

  var MONTHS_SK = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna',
    'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];

  function fmtDate(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + '. ' + MONTHS_SK[parseInt(p[1], 10) - 1];
  }

  /* "5. – 23. decembra 2026" alebo "6. decembra 2026" pre jednodňové. */
  function eventDateLine(ev) {
    if (!ev.from) return '';
    var y = ev.from.slice(0, 4);
    var toTime = ev.toTime ? '–' + ev.toTime : '';
    var timeStr = ev.fromTime ? ' · ' + ev.fromTime + toTime : '';
    if (!ev.to || ev.to === ev.from) return fmtDate(ev.from) + ' ' + y + timeStr;
    var fromP = ev.from.split('-'), toP = ev.to.split('-');
    if (fromP[1] === toP[1]) {
      // rovnaký mesiac: "5. – 23. decembra 2026"
      return parseInt(fromP[2], 10) + '. – ' + fmtDate(ev.to) + ' ' + y + timeStr;
    }
    return fmtDate(ev.from) + ' – ' + fmtDate(ev.to) + ' ' + y + timeStr;
  }

  /* Časový program podujatia — zoskupený po dňoch. */
  function programTable(v, lang) {
    var items = v.event.program;
    if (!items || !items.length) return null;
    var sec = el('section', 'sec');
    sec.appendChild(el('h3', 'sec-title', 'Program'));

    var byDay = {};
    var order = [];
    items.forEach(function (p) {
      var key = p.day || '';
      if (!byDay[key]) { byDay[key] = []; order.push(key); }
      byDay[key].push(p);
    });
    order.sort();

    order.forEach(function (day) {
      var box = el('div', 'prog-day');
      if (day) box.appendChild(el('div', 'prog-date', fmtDate(day)));
      byDay[day].sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
      byDay[day].forEach(function (p) {
        var row = el('div', 'prog-row');
        var t = p.time + (p.endTime ? '–' + p.endTime : '');
        row.appendChild(el('span', 'prog-time', t));
        var body = el('span', 'prog-body');
        body.appendChild(el('span', 'prog-title', S.tr(p, 'title', lang)));
        var meta = [];
        var stage = S.tr(p, 'stage', lang);
        var note = S.tr(p, 'note', lang);
        if (stage) meta.push(stage);
        if (note) meta.push(note);
        if (meta.length) body.appendChild(el('span', 'prog-meta', meta.join(' · ')));
        row.appendChild(body);
        box.appendChild(row);
      });
      sec.appendChild(box);
    });
    return sec;
  }

  /* Odkaz, ktorý nikam nevedie, je na verejnej stránke horší než žiadny —
     zákazník naň ťukne a nič sa nestane. Preto sa nedokončené dlaždice
     navonok vôbec nezobrazia. V administrácii naopak áno, označené, aby
     bolo vidieť, čo ešte treba doplniť. */
  function usable(t, venue, opts) {
    if (opts && opts.editing) return true;
    var def = S.TILE_BY_ID[t.type] || S.TILE_BY_ID.custom;
    if (def.kind === 'none') return true;
    if (def.kind === 'photos') return !!(t.images && t.images.length);
    return !!S.tileHref(t, venue);
  }

  /* Fotogaléria priamo na stránke — vodorovný pás, žiadny odchod preč.
     V náhľade administrácie sa bez fotiek ukáže ako prázdna zástupka,
     na verejnej stránke sa taká vôbec nevykreslí (viď usable() vyššie). */
  function photoStrip(t, opts) {
    var wrap = el('div', 'tile-photos');
    if (!t.images || !t.images.length) {
      wrap.className += ' is-empty';
      wrap.textContent = 'Fotogaléria — zatiaľ bez fotiek';
      return wrap;
    }
    var strip = el('div', 'photo-strip');
    t.images.forEach(function (url) {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      img.alt = '';
      a.appendChild(img);
      strip.appendChild(a);
    });
    wrap.appendChild(strip);
    return wrap;
  }

  function primaryCta(v, opts, lang) {
    var def = S.TILE_BY_ID[v.primary.type] || S.TILE_BY_ID.custom;
    var href = S.tileHref({ type: v.primary.type, value: v.primary.url }, v);
    var editing = !!(opts && opts.editing);
    if (!href && !editing) return null;
    var a = document.createElement(href ? 'a' : 'div');
    a.className = 'cta' + (def.stars ? ' is-review' : '') + (href ? '' : ' is-empty');
    a.setAttribute('data-metric', 'primary:' + def.id);
    if (href) {
      a.href = href;
      applyLinkTarget(a, href);
    } else {
      a.title = 'Chýba odkaz — na verejnej stránke sa nezobrazí.';
    }

    if (def.stars) {
      /* Päť hviezdičiek nad textom — pozvánka na napísanie recenzie,
         nie zobrazenie dosiahnutého hodnotenia. */
      var stars = el('span', 'cta-stars');
      stars.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 5; i++) stars.innerHTML += I.svg('star-filled');
      a.appendChild(stars);
    } else {
      a.innerHTML = I.svg(def.icon);
    }

    var box = el('span', 'cta-txt');
    box.appendChild(el('span', 'cta-title', S.tr(v.primary, 'title', lang) || def.title || def.label));
    var primaryNote = S.tr(v.primary, 'note', lang);
    if (primaryNote) box.appendChild(el('span', 'cta-note', primaryNote));
    a.appendChild(box);
    return a;
  }

  function tile(t, v, layout, opts, lang) {
    var def = S.TILE_BY_ID[t.type] || S.TILE_BY_ID.custom;
    if (def.kind === 'photos') return photoStrip(t, opts);
    var href = S.tileHref(t, v);
    var dead = !href && def.kind !== 'none';
    var node = document.createElement(href ? 'a' : 'div');
    node.className = 'tile' + (layout === 'grid' ? ' is-grid' : '') + (dead ? ' is-empty' : '');
    node.setAttribute('data-metric', 'tile:' + def.id);
    if (href) {
      node.href = href;
      applyLinkTarget(node, href);
      if (href === '#vcard') node.setAttribute('data-action', 'vcard');
      if (href === '#share') node.setAttribute('data-action', 'share');
    } else if (dead) {
      node.title = 'Chýba odkaz — na verejnej stránke sa nezobrazí.';
    }
    var ic = el('span', 'tile-ic');
    ic.innerHTML = I.svg(t.icon || def.icon);
    node.appendChild(ic);

    var body = el('span', 'tile-body');
    body.appendChild(el('span', 'tile-title', S.tr(t, 'title', lang) || def.title || def.label));
    var tileNote = S.tr(t, 'note', lang);
    if (tileNote) body.appendChild(el('span', 'tile-note', tileNote));
    node.appendChild(body);

    if (href && layout !== 'grid') {
      var ch = el('span', 'tile-arrow');
      ch.innerHTML = I.svg('chevron-right');
      node.appendChild(ch);
    }
    return node;
  }

  function hoursTable(v) {
    var sec = el('section', 'sec');
    sec.appendChild(el('h3', 'sec-title', 'Otváracie hodiny'));
    var box = el('div', 'hours');
    var week = S.weekSchedule(v.hours);
    var activeLabel = '';
    week.forEach(function (d, i) {
      var row = el('div', 'hrow' + (d.isToday ? ' is-today' : ''));
      row.appendChild(el('span', 'hday', S.DAY_NAMES[i]));
      row.appendChild(el('span', 'htime' + (d.closed ? ' is-closed' : ''),
        d.closed ? 'zatvorené' : d.ranges.map(function (r) { return r[0] + '–' + r[1]; }).join(', ')));
      box.appendChild(row);
      if (d.label) activeLabel = d.label;
    });
    sec.appendChild(box);
    /* Sezóna či výnimka platná tento týždeň sa ukáže ako odznak — inak by
       si zákazník nevšimol, prečo sa rozvrh líši od bežného. */
    if (activeLabel) sec.appendChild(el('p', 'hours-note is-active', activeLabel));
    if (v.hours.note) sec.appendChild(el('p', 'hours-note', v.hours.note));
    return sec;
  }

  function footer(v, opts, lang) {
    var f = el('footer', 'foot');
    var footerText = S.tr(v.footer, 'text', lang);
    if (footerText) f.appendChild(el('p', '', footerText));
    if (v.contact.address) f.appendChild(el('p', 'foot-dim', v.contact.address));
    if (v.footer.showBrand && opts && opts.brand) {
      f.appendChild(el('p', 'foot-dim', opts.brand));
    }
    if (v.langs.length && opts && opts.onLangChange) {
      f.appendChild(langSwitcher(v, lang, opts.onLangChange));
    }
    return f;
  }

  /* Prepínač jazyka — len ak má prevádzka nastavenú aspoň jednu ďalšiu
     reč. Základný jazyk (prázdny `lang`) sa ukazuje ako "SK". */
  function langSwitcher(v, lang, onChange) {
    var box = el('div', 'lang-switch');
    var codes = [''].concat(v.langs);
    codes.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn' + (code === lang ? ' is-on' : '');
      b.textContent = code ? code.toUpperCase() : 'SK';
      b.addEventListener('click', function () { onChange(code); });
      box.appendChild(b);
    });
    return box;
  }

  /* ---------- Akcie bez odkazu (vCard, zdieľanie) --------------------- */
  function wireActions(root, v) {
    root.querySelectorAll('[data-action="vcard"]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        e.preventDefault();
        downloadVCard(v);
      });
    });
    root.querySelectorAll('[data-action="share"]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        e.preventDefault();
        var data = { title: v.name, text: v.subtitle, url: location.href };
        if (navigator.share) { navigator.share(data).catch(function () {}); }
        else if (navigator.clipboard) {
          navigator.clipboard.writeText(location.href);
          toast(root, 'Odkaz skopírovaný');
        }
      });
    });
  }

  function vcardText(v) {
    var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push('FN:' + esc(v.name));
    if (v.contact.org || v.name) lines.push('ORG:' + esc(v.contact.org || v.name));
    if (v.contact.phone) lines.push('TEL;TYPE=WORK,VOICE:' + esc(v.contact.phone));
    if (v.contact.email) lines.push('EMAIL;TYPE=WORK:' + esc(v.contact.email));
    if (v.contact.web) lines.push('URL:' + esc(v.contact.web));
    if (v.contact.address) lines.push('ADR;TYPE=WORK:;;' + esc(v.contact.address) + ';;;;');
    lines.push('END:VCARD');
    return lines.join('\r\n');
    function esc(s) { return String(s || '').replace(/([,;\\])/g, '\\$1'); }
  }

  function downloadVCard(v) {
    var blob = new Blob([vcardText(v)], { type: 'text/vcard;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (v.slug || 'kontakt') + '.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function toast(root, msg) {
    var t = el('div', 'toast', msg);
    root.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 1600);
    setTimeout(function () { t.remove(); }, 2100);
  }

  /* ---------- Pomocníci ----------------------------------------------- */
  function applyLinkTarget(a, href) {
    if (/^https?:/i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function initials(name) {
    return String(name || '?')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  g.QRRender = {
    render: render,
    applyTheme: applyTheme,
    ensureFont: ensureFont,
    readableInk: readableInk,
    vcardText: vcardText,
    initials: initials
  };
})(typeof window !== 'undefined' ? window : this);
