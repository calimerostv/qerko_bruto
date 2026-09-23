/* ------------------------------------------------------------------
   admin.js — administrácia rozcestníkov.
   Drží jednu rozpracovanú prevádzku v pamäti, po každej zmene ju
   prekreslí do náhľadu a nakoniec ju uloží zvoleným adaptérom.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var S = window.QRSchema;
  var R = window.QRRender;
  var I = window.QRIcons;
  var Q = window.QRCodeGen;
  var ST = window.QRStorage;
  var CFG = window.QR_CONFIG;

  var LS = {
    base: 'qr.admin.baseUrl',
    adapter: 'qr.admin.adapter',
    secret: 'qr.admin.secret.',
    format: 'qr.admin.sheetFormat',
    login: 'qr.admin.login'
  };

  /* Prihlásenie z api/auth.php — voliteľné, žije len v pamäti/localStorage
     tohto prehliadača. { token, scope: 'master'|'venue', slug } alebo null. */
  var auth = null;

  var state = {
    venue: S.blankVenue(),
    index: { venues: [] },
    indexStale: false,  // zoznam sa nepodarilo načítať — nesmie sa prepísať prázdnym
    openTile: null,     // "sectionIndex:tileIndex" práve rozbaleného editora
    dirty: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var mql = window.matchMedia('(prefers-color-scheme: dark)');

  init();

  /* ================= ŠTART ================= */
  function init() {
    $('brandName').textContent = CFG.brand || 'Administrácia';
    buildThemeGrid();
    buildLangToggles();
    buildFontSelect();
    buildPrimaryTypes();
    buildAdapterSelect();
    buildFormatSelect();
    bindBasics();
    bindKind();
    bindEvent();
    bindAppearance();
    bindPrimary();
    bindHours();
    bindContact();
    bindFooter();
    bindSections();
    bindPanes();
    bindQr();
    bindSave();
    bindLogin();
    bindAccounts();
    bindStats();
    bindTopbar();

    $('qBase').value = localStorage.getItem(LS.base) || guessBase();

    loadIndex().then(function () {
      var first = state.index.venues[0];
      if (first) openVenue(first.slug);
      else { state.venue = starterVenue(); fillForm(); refresh(); }
      restoreLogin();
    });

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    if (mql.addEventListener) mql.addEventListener('change', refreshPreview);
  }

  function guessBase() {
    // /admin/ → koreň inštalácie
    return location.origin + location.pathname.replace(/admin\/?$/, '');
  }

  function starterVenue() {
    var v = S.blankVenue();
    v.sections = [
      { title: 'Sledujte nás', layout: 'list', tiles: [] },
      { title: 'Podnik', layout: 'list', tiles: [] }
    ];
    v.footer.showBrand = true;
    return v;
  }

  /* ================= ZOZNAM PREVÁDZOK ================= */
  function loadIndex() {
    return ST.readIndex()
      .then(function (idx) {
        state.index = idx && Array.isArray(idx.venues) ? idx : { venues: [] };
        state.indexStale = false;
      })
      .catch(function (e) {
        /* Chyba siete nie je prázdny zoznam. Editor sa otvorí, ale
           zápis celého index.json (download/github) sa zablokuje, kým
           sa zoznam nenačíta. */
        state.index = { venues: [] };
        state.indexStale = true;
        note('saveNote', (e && e.message) || 'Zoznam prevádzok sa nepodarilo načítať.', 'err');
      })
      .then(fillPicker);
  }

  function fillPicker() {
    var sel = $('venuePicker');
    sel.innerHTML = '';
    if (!state.index.venues.length) {
      sel.appendChild(new Option('— zatiaľ žiadne qerko —', ''));
    }
    state.index.venues.forEach(function (v) {
      sel.appendChild(new Option((v.name || v.slug) + (v.hidden ? ' — skryté' : ''), v.slug));
    });
    if (state.venue.slug) sel.value = state.venue.slug;
  }

  function openVenue(slug) {
    if (!confirmDiscard()) { $('venuePicker').value = state.venue.slug; return; }
    ST.readVenue(slug + '.json')
      .then(function (data) {
        state.venue = S.normalizeVenue(data);
        state.venue.slug = slug;
        state.openTile = null;
        state.dirty = false;
        fillForm();
        refresh();
      })
      .catch(function () {
        note('saveNote', 'Súbor ' + slug + '.json sa nepodarilo načítať.', 'err');
      });
  }

  function confirmDiscard() {
    if (!state.dirty) return true;
    return confirm('Máte neuložené zmeny. Zahodiť ich?');
  }

  /* ================= FORMULÁR → STAV ================= */
  /* ---------- Typ stránky: prevádzka vs podujatie ---------------------- */
  function bindKind() {
    document.querySelectorAll('input[name=kind]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.venue.kind = r.value === 'event' ? 'event' : 'venue';
        applyKindUi();
        touch();
      });
    });
  }

  function applyKindUi() {
    var isEvent = state.venue.kind === 'event';
    $('eventCard').hidden = !isEvent;
    $('hoursCard').hidden = isEvent;
    $('fNameLabel').textContent = isEvent ? 'Názov podujatia' : 'Názov prevádzky';
    document.querySelectorAll('input[name=kind]').forEach(function (r) {
      r.checked = r.value === state.venue.kind;
    });
  }

  function bindEvent() {
    on('fEventFrom', 'change', function (e) { state.venue.event.from = e.target.value; touch(); });
    on('fEventTo', 'change', function (e) { state.venue.event.to = e.target.value; touch(); });
    on('fEventFromTime', 'change', function (e) { state.venue.event.fromTime = e.target.value; touchPreviewOnly(); });
    on('fEventToTime', 'change', function (e) { state.venue.event.toTime = e.target.value; touchPreviewOnly(); });
    on('fEventPlace', 'input', function (e) { state.venue.event.place = e.target.value; touchPreviewOnly(); });
    on('fEventAfter', 'input', function (e) { state.venue.event.afterText = e.target.value; touchPreviewOnly(); });
    $('btnAddProgram').addEventListener('click', function () {
      state.venue.event.program.push({
        day: state.venue.event.from || '', time: '', endTime: '', title: '', stage: '', note: '', i18n: {}
      });
      touch();
    });
  }

  function renderProgram() {
    var wrap = $('programList');
    wrap.innerHTML = '';
    var prog = state.venue.event.program;
    if (!prog.length) {
      wrap.innerHTML = '<div class="empty">Zatiaľ žiadny bod programu.</div>';
      return;
    }
    prog.forEach(function (p, i) {
      var card = document.createElement('div');
      card.className = 'sec-card';
      var r1 = document.createElement('div');
      r1.className = 'row';
      r1.appendChild(field('Deň', input('date', p.day, '', function (v) { p.day = v; touchPreviewOnly(); })));
      r1.appendChild(field('Čas', input('time', p.time, '', function (v) { p.time = v; touchPreviewOnly(); })));
      r1.appendChild(field('Do', input('time', p.endTime, '', function (v) { p.endTime = v; touchPreviewOnly(); })));
      card.appendChild(r1);
      card.appendChild(field('Názov', input('text', p.title, 'Rozsvietenie stromčeka', function (v) { p.title = v; touchPreviewOnly(); })));
      var r2 = document.createElement('div');
      r2.className = 'row';
      r2.appendChild(field('Pódium / miesto', input('text', p.stage, 'Hlavné pódium', function (v) { p.stage = v; touchPreviewOnly(); })));
      r2.appendChild(field('Poznámka', input('text', p.note, '', function (v) { p.note = v; touchPreviewOnly(); })));
      card.appendChild(r2);
      var acts = document.createElement('div');
      acts.className = 'btnrow';
      acts.appendChild(iconBtn('arrow-left', 'Vyššie', function () { move(prog, i, -1); touch(); }, i === 0, 'rot-up'));
      acts.appendChild(iconBtn('arrow-left', 'Nižšie', function () { move(prog, i, 1); touch(); }, i === prog.length - 1, 'rot-down'));
      acts.appendChild(iconBtn('trash-2', 'Odstrániť', function () { prog.splice(i, 1); touch(); }, false, 'danger'));
      card.appendChild(acts);
      wrap.appendChild(card);
    });
  }

  function bindBasics() {
    on('fName', 'input', function (e) {
      state.venue.name = e.target.value;
      if (!state.venue.slug || state.venue.slug === S.slugify(prevName)) {
        // Slug sa dopĺňa sám, kým ho správca ručne nezmení.
        state.venue.slug = S.slugify(e.target.value);
        $('fSlug').value = state.venue.slug;
      }
      prevName = e.target.value;
      touch();
    });
    var prevName = '';

    on('fSlug', 'input', function (e) {
      state.venue.slug = S.slugify(e.target.value);
      touch();
    });
    on('fSlug', 'blur', function () { $('fSlug').value = state.venue.slug; });

    on('fSubtitle', 'input', function (e) { state.venue.subtitle = e.target.value; touch(); });
    on('fMarkText', 'input', function (e) { state.venue.mark.text = e.target.value; touch(); });

    document.querySelectorAll('input[name=markType]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.venue.mark.type = r.value;
        toggleMarkFields();
        touch();
      });
    });

    $('btnLogo').addEventListener('click', function () { $('fileLogo').click(); });
    $('fileLogo').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importLogo(f);
      e.target.value = '';
    });
    $('btnLogoClear').addEventListener('click', function () {
      state.venue.mark.image = '';
      touch();
    });
  }

  function toggleMarkFields() {
    var isImg = state.venue.mark.type === 'image';
    $('markTextWrap').style.display = isImg ? 'none' : '';
    $('markImageWrap').style.display = isImg ? '' : 'none';
  }

  /* Logo zmenšíme v prehliadači — do JSON nemá zmysel ukladať 4 MB fotku. */
  function importLogo(file) {
    if (file.type === 'image/svg+xml') {
      var fr = new FileReader();
      fr.onload = function () {
        state.venue.mark.image = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fr.result)));
        state.venue.mark.type = 'image';
        syncMarkRadio();
        touch();
      };
      fr.readAsText(file);
      return;
    }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 512;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var w = Math.round(img.width * scale);
      var h = Math.round(img.height * scale);
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      state.venue.mark.image = cv.toDataURL('image/png');
      state.venue.mark.type = 'image';
      syncMarkRadio();
      touch();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert('Tento obrázok sa nepodarilo načítať.');
    };
    img.src = url;
  }

  function syncMarkRadio() {
    document.querySelectorAll('input[name=markType]').forEach(function (r) {
      r.checked = r.value === state.venue.mark.type;
    });
    toggleMarkFields();
  }

  /* ---------- Vzhľad ---------------------------------------------------- */
  function buildThemeGrid() {
    var grid = $('themeGrid');
    grid.innerHTML = '';
    Object.keys(S.THEMES).forEach(function (key) {
      var t = S.THEMES[key];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-opt';
      b.dataset.theme = key;
      b.innerHTML =
        '<span class="theme-swatch">' +
        '<i style="background:' + t.light.deep + '"></i>' +
        '<i style="background:' + t.light.accent + '"></i>' +
        '<i style="background:' + t.light.surface2 + '"></i>' +
        '<i style="background:' + t.dark.surface + '"></i>' +
        '</span><b></b><em></em>';
      b.querySelector('b').textContent = t.label;
      b.querySelector('em').textContent = t.hint;
      b.addEventListener('click', function () {
        state.venue.theme.preset = key;
        markTheme();
        touch();
      });
      grid.appendChild(b);
    });
  }

  function markTheme() {
    document.querySelectorAll('.theme-opt').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.theme === state.venue.theme.preset);
    });
  }

  /* ---------- Viacjazyčnosť ----------------------------------------------
     Prepínače jazykov sú statické (postavia sa raz), samotný obsah karty
     Preklady je dynamický a prekresľuje sa spolu so sekciami a dlaždicami
     (rovnaký vzor ako renderHours). */
  function buildLangToggles() {
    var box = $('langToggles');
    box.innerHTML = '';
    Object.keys(S.LANG_NAMES).forEach(function (code) {
      var label = document.createElement('label');
      label.className = 'check fixed';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = code;
      input.addEventListener('change', function () {
        var i = state.venue.langs.indexOf(code);
        if (input.checked && i < 0) state.venue.langs.push(code);
        else if (!input.checked && i >= 0) state.venue.langs.splice(i, 1);
        touch();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + S.LANG_NAMES[code] + ' (' + code.toUpperCase() + ')'));
      box.appendChild(label);
    });
  }

  function syncLangToggles() {
    document.querySelectorAll('#langToggles input').forEach(function (input) {
      input.checked = state.venue.langs.indexOf(input.value) >= 0;
    });
  }

  function renderTranslations() {
    var card = $('translationsCard');
    var body = $('translationsBody');
    var langs = state.venue.langs;
    card.hidden = !langs.length;
    body.innerHTML = '';
    if (!langs.length) return;

    langs.forEach(function (code) {
      var box = document.createElement('div');
      box.className = 'sec-card';
      box.appendChild(el('div', 'sec-title', (S.LANG_NAMES[code] || code) + ' (' + code.toUpperCase() + ')'));

      box.appendChild(field(state.venue.kind === 'event' ? 'Názov podujatia' : 'Názov prevádzky',
        trInput(state.venue, 'name', code)));
      box.appendChild(field('Podnadpis', trInput(state.venue, 'subtitle', code)));

      if (state.venue.kind === 'event') {
        box.appendChild(field('Miesto konania', trInput(state.venue.event, 'place', code)));
        box.appendChild(field('Text po skončení', trInput(state.venue.event, 'afterText', code)));
        state.venue.event.program.forEach(function (p, i) {
          var pBox = document.createElement('div');
          pBox.className = 'sec-card';
          pBox.appendChild(el('div', 'sec-title', 'Program ' + (i + 1) + ': ' + (p.title || '(bez názvu)')));
          pBox.appendChild(field('Názov', trInput(p, 'title', code)));
          var pr = document.createElement('div');
          pr.className = 'row';
          pr.appendChild(field('Pódium', trInput(p, 'stage', code)));
          pr.appendChild(field('Poznámka', trInput(p, 'note', code)));
          pBox.appendChild(pr);
          box.appendChild(pBox);
        });
      }

      if (state.venue.primary.enabled) {
        box.appendChild(field('Hlavná výzva — nadpis', trInput(state.venue.primary, 'title', code)));
        box.appendChild(field('Hlavná výzva — popis', trInput(state.venue.primary, 'note', code)));
      }

      state.venue.sections.forEach(function (sec) {
        var secBox = document.createElement('div');
        secBox.className = 'sec-card';
        secBox.appendChild(field('Sekcia: ' + (sec.title || '(bez názvu)'), trInput(sec, 'title', code)));
        sec.tiles.forEach(function (t) {
          var def = S.TILE_BY_ID[t.type] || S.TILE_BY_ID.custom;
          var row = document.createElement('div');
          row.className = 'row';
          row.appendChild(field((t.title || def.label) + ' — nadpis', trInput(t, 'title', code)));
          row.appendChild(field((t.title || def.label) + ' — popis', trInput(t, 'note', code)));
          secBox.appendChild(row);
        });
        box.appendChild(secBox);
      });

      box.appendChild(field('Text v päte', trInput(state.venue.footer, 'text', code)));
      box.appendChild(field('Popis pre vyhľadávače', trInput(state.venue.seo, 'description', code)));

      body.appendChild(box);
    });
  }

  /* Textové pole naviazané na preklad `field` v jazyku `code` na objekte
     `obj` — obj.i18n[code][field]. Prázdna hodnota preklad jednoducho
     odstráni, nenechá po sebe prázdny záznam. */
  function trInput(obj, field, code) {
    var current = (obj.i18n && obj.i18n[code] && obj.i18n[code][field]) || '';
    return input('text', current, '', function (v) {
      obj.i18n = obj.i18n || {};
      if (v) {
        obj.i18n[code] = obj.i18n[code] || {};
        obj.i18n[code][field] = v;
      } else if (obj.i18n[code]) {
        delete obj.i18n[code][field];
      }
      touchPreviewOnly();
    });
  }

  function buildFontSelect() {
    var sel = $('fFont');
    sel.innerHTML = '';
    Object.keys(S.FONTS).forEach(function (k) {
      sel.appendChild(new Option(S.FONTS[k].label, k));
    });
  }

  function bindAppearance() {
    on('fMode', 'change', function (e) { state.venue.theme.mode = e.target.value; touch(); });
    on('fFont', 'change', function (e) {
      state.venue.theme.font = e.target.value;
      R.ensureFont(e.target.value);
      touch();
    });
    on('fAccent', 'input', function (e) { state.venue.theme.accent = e.target.value; touch(); });
    on('fDeep', 'input', function (e) { state.venue.theme.deep = e.target.value; touch(); });
    document.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.venue.theme[b.dataset.clear] = '';
        touch();
      });
    });

    /* Fotka na pozadí hlavičky */
    $('btnHero').addEventListener('click', function () { $('fileHero').click(); });
    $('fileHero').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importHeroPhoto(f);
      e.target.value = '';
    });
    $('btnHeroClear').addEventListener('click', function () {
      state.venue.hero.image = '';
      touch();
    });
    on('fHeroDim', 'input', function (e) {
      state.venue.hero.dim = parseInt(e.target.value, 10);
      $('heroDimVal').textContent = e.target.value;
      touchPreviewOnly();
    });
  }

  /* Fotka sa pred uložením zmenší a prekóduje do JPEG — do JSON súboru
     nemá zmysel ukladať fotoaparátový originál. */
  function importHeroPhoto(file) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 1200;
      var scale = Math.min(1, max / img.width);
      var w = Math.round(img.width * scale);
      var h = Math.round(img.height * scale);
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      state.venue.hero.image = cv.toDataURL('image/jpeg', 0.72);
      touch();
      var kb = Math.round(state.venue.hero.image.length * 0.75 / 1024);
      if (kb > 400) {
        note('saveNote', 'Fotka má po zmenšení ' + kb + ' kB. Stránka sa bude ' +
          'na mobilnom dáta načítavať pomalšie — zvážte menší výrez.', 'err');
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert('Túto fotku sa nepodarilo načítať.');
    };
    img.src = url;
  }

  /* ---------- Hlavná výzva --------------------------------------------- */
  function buildPrimaryTypes() {
    var sel = $('fPrimaryType');
    sel.innerHTML = '';
    S.TILE_TYPES.forEach(function (t) {
      if (t.kind === 'none') return;
      sel.appendChild(new Option(t.label, t.id));
    });
  }

  function bindPrimary() {
    on('fPrimaryOn', 'change', function (e) {
      state.venue.primary.enabled = e.target.checked;
      $('primaryFields').style.display = e.target.checked ? '' : 'none';
      touch();
    });
    on('fPrimaryType', 'change', function (e) {
      var def = S.TILE_BY_ID[e.target.value];
      state.venue.primary.type = e.target.value;
      if (def) {
        if (!state.venue.primary.title) { state.venue.primary.title = def.title || def.label; $('fPrimaryTitle').value = state.venue.primary.title; }
        if (!state.venue.primary.note) { state.venue.primary.note = def.note; $('fPrimaryNote').value = def.note; }
        $('fPrimaryUrl').placeholder = def.placeholder || '';
        $('primaryHint').textContent = def.hint || '';
      }
      touch();
    });
    on('fPrimaryTitle', 'input', function (e) { state.venue.primary.title = e.target.value; touch(); });
    on('fPrimaryNote', 'input', function (e) { state.venue.primary.note = e.target.value; touch(); });
    on('fPrimaryUrl', 'input', function (e) { state.venue.primary.url = e.target.value; touch(); });
  }

  /* ---------- Sekcie a dlaždice ---------------------------------------- */
  function bindSections() {
    $('btnAddSection').addEventListener('click', function () {
      state.venue.sections.push({ title: 'Nová sekcia', layout: 'list', tiles: [] });
      touch();
    });
  }

  function renderSections() {
    var wrap = $('sections');
    wrap.innerHTML = '';
    if (!state.venue.sections.length) {
      wrap.innerHTML = '<div class="empty">Zatiaľ žiadna sekcia. Pridajte prvú tlačidlom nižšie.</div>';
      return;
    }

    state.venue.sections.forEach(function (sec, si) {
      var card = document.createElement('div');
      card.className = 'sec-card';

      var top = document.createElement('div');
      top.className = 'sec-top';
      var ti = document.createElement('input');
      ti.type = 'text';
      ti.value = sec.title;
      ti.placeholder = 'Názov sekcie (môže zostať prázdny)';
      ti.addEventListener('input', function () { sec.title = ti.value; touchPreviewOnly(); });
      top.appendChild(ti);

      var lay = document.createElement('select');
      lay.className = 'fixed';
      lay.style.width = '128px';
      lay.appendChild(new Option('Pod sebou', 'list'));
      lay.appendChild(new Option('Do dvoch stĺpcov', 'grid'));
      lay.value = sec.layout;
      lay.addEventListener('change', function () { sec.layout = lay.value; touch(); });
      top.appendChild(lay);

      var handle = document.createElement('span');
      handle.className = 'handle sec-handle';
      handle.title = 'Presunúť sekciu ťahaním';
      handle.innerHTML = I.svg('grip-vertical');
      top.insertBefore(handle, top.firstChild);
      wireSectionDrag(handle, si);

      top.appendChild(iconBtn('arrow-left', 'Presunúť vyššie', function () { move(state.venue.sections, si, -1); touch(); }, si === 0, 'rot-up'));
      top.appendChild(iconBtn('arrow-left', 'Presunúť nižšie', function () { move(state.venue.sections, si, 1); touch(); }, si === state.venue.sections.length - 1, 'rot-down'));
      top.appendChild(iconBtn('trash-2', 'Odstrániť sekciu', function () {
        if (confirm('Odstrániť sekciu „' + (sec.title || 'bez názvu') + '“ aj s dlaždicami?')) {
          state.venue.sections.splice(si, 1); touch();
        }
      }, false, 'danger'));
      card.appendChild(top);
      wireSectionDrop(card, si);

      /* Dlaždice */
      if (!sec.tiles.length) {
        var e = document.createElement('div');
        e.className = 'empty';
        e.textContent = 'Sekcia je prázdna — dlaždicu sem môžete aj pretiahnuť z inej sekcie.';
        card.appendChild(e);
      }
      sec.tiles.forEach(function (tile, ti2) {
        card.appendChild(tileRow(sec, si, tile, ti2));
        if (state.openTile === si + ':' + ti2) card.appendChild(tileEditor(sec, si, tile, ti2));
      });

      /* Katalóg typov */
      var addWrap = document.createElement('div');
      addWrap.className = 'btnrow';
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn sm';
      addBtn.innerHTML = I.svg('plus') + ' Pridať dlaždicu';
      var picker = buildPicker(sec);
      picker.style.display = 'none';
      addBtn.addEventListener('click', function () {
        picker.style.display = picker.style.display === 'none' ? '' : 'none';
      });
      addWrap.appendChild(addBtn);
      card.appendChild(addWrap);
      card.appendChild(picker);

      wrap.appendChild(card);
    });
  }

  function tileRow(sec, si, tile, ti) {
    var def = S.TILE_BY_ID[tile.type] || S.TILE_BY_ID.custom;
    var row = document.createElement('div');
    row.className = 'tile-row' + (tile.hidden ? ' is-hidden' : '');
    row.draggable = true;
    row.dataset.si = si;
    row.dataset.ti = ti;

    var h = document.createElement('span');
    h.className = 'handle';
    h.innerHTML = I.svg('grip-vertical');
    row.appendChild(h);

    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.innerHTML = I.svg(tile.icon || def.icon);
    row.appendChild(ic);

    var meta = document.createElement('div');
    meta.className = 'meta';
    var b = document.createElement('b');
    b.textContent = tile.title || def.label;
    var sp = document.createElement('span');
    sp.textContent = def.kind === 'photos'
      ? ((tile.images && tile.images.length) ? tile.images.length + ' fotiek' : 'zatiaľ bez fotiek')
      : (tile.value || def.hint || def.label);
    meta.appendChild(b);
    meta.appendChild(sp);
    meta.style.cursor = 'pointer';
    meta.addEventListener('click', function () {
      state.openTile = state.openTile === si + ':' + ti ? null : si + ':' + ti;
      renderSections();
    });
    row.appendChild(meta);

    row.appendChild(iconBtn(tile.hidden ? 'eye' : 'eye', tile.hidden ? 'Zobraziť' : 'Skryť', function () {
      tile.hidden = !tile.hidden; touch();
    }));
    row.appendChild(iconBtn('trash-2', 'Odstrániť', function () {
      sec.tiles.splice(ti, 1);
      state.openTile = null;
      touch();
    }, false, 'danger'));

    wireDrag(row);
    return row;
  }

  function tileEditor(sec, si, tile, ti) {
    var def = S.TILE_BY_ID[tile.type] || S.TILE_BY_ID.custom;
    var box = document.createElement('div');
    box.className = 'tile-edit';

    box.appendChild(field('Nadpis', input('text', tile.title, def.title || def.label, function (v) {
      tile.title = v; touchPreviewOnly();
    })));
    box.appendChild(field('Popis pod nadpisom', input('text', tile.note, def.note || '', function (v) {
      tile.note = v; touchPreviewOnly();
    })));

    if (def.kind === 'photos') {
      var ta = document.createElement('textarea');
      ta.rows = 4;
      ta.placeholder = 'https://.../foto1.jpg\nhttps://.../foto2.jpg';
      ta.value = (tile.images || []).join('\n');
      ta.addEventListener('input', function () {
        tile.images = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
        touchPreviewOnly();
      });
      box.appendChild(field('Obrázky — jeden odkaz na riadok, max 20', ta));
    } else if (def.kind !== 'vcard' && def.kind !== 'share' && def.kind !== 'none') {
      var labelText = def.kind === 'tel' ? 'Telefónne číslo'
        : def.kind === 'mail' ? 'E-mailová adresa'
          : def.kind === 'maps' ? 'Adresa pre navigáciu' : 'Odkaz';
      box.appendChild(field(labelText, input('text', tile.value, def.placeholder, function (v) {
        tile.value = v; touchPreviewOnly();
      })));
    }
    if (def.hint) {
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = def.hint;
      box.appendChild(hint);
    }

    /* Ikona — fotogaléria na stránke ju nepoužíva. */
    if (def.kind !== 'photos') {
      var sel = document.createElement('select');
      I.names().sort().forEach(function (n) {
        sel.appendChild(new Option(n.replace(/^b:/, '') + (n.indexOf('b:') === 0 ? ' (značka)' : ''), n));
      });
      sel.value = tile.icon || def.icon;
      sel.addEventListener('change', function () { tile.icon = sel.value; touch(); });
      box.appendChild(field('Ikona', sel));
    }

    return box;
  }

  function buildPicker(sec) {
    var box = document.createElement('div');
    box.className = 'picker';
    var groups = {};
    S.TILE_TYPES.forEach(function (t) {
      (groups[t.group] = groups[t.group] || []).push(t);
    });
    Object.keys(groups).forEach(function (g) {
      var h = document.createElement('div');
      h.className = 'picker-group';
      h.textContent = g;
      box.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'picker-grid';
      groups[g].forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = I.svg(t.icon) + '<span></span>';
        b.querySelector('span').textContent = t.label;
        b.addEventListener('click', function () {
          sec.tiles.push(S.normalizeTile({ type: t.id, title: t.title || t.label, note: t.note, value: '', icon: t.icon }));
          state.openTile = state.venue.sections.indexOf(sec) + ':' + (sec.tiles.length - 1);
          touch();
        });
        grid.appendChild(b);
      });
      box.appendChild(grid);
    });
    return box;
  }

  /* Preťahovanie dlaždíc — v rámci sekcie aj medzi sekciami. Dátový
     prenos nesie „zdrojová-sekcia:zdrojová-dlaždica“, cieľ sa číta
     z elementu, na ktorý sa pustí. */
  function wireDrag(row) {
    row.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', row.dataset.si + ':' + row.dataset.ti);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-drag');
    });
    row.addEventListener('dragend', function () { row.classList.remove('is-drag'); });
    row.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      row.classList.add('is-over');
    });
    row.addEventListener('dragleave', function () { row.classList.remove('is-over'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('is-over');
      moveTile(e.dataTransfer, parseInt(row.dataset.si, 10), parseInt(row.dataset.ti, 10));
    });
  }

  /* Sekcia samotná je tiež spustný cieľ — pustenie mimo konkrétnej
     dlaždice (napr. do prázdnej sekcie) priloží dlaždicu na koniec. */
  function wireSectionDrop(card, si) {
    card.addEventListener('dragover', function (e) { e.preventDefault(); });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      moveTile(e.dataTransfer, si, null);
    });
  }

  function moveTile(dataTransfer, toSi, toTi) {
    var from = String(dataTransfer.getData('text/plain')).split(':');
    var fromSi = parseInt(from[0], 10), fromTi = parseInt(from[1], 10);
    if (isNaN(fromSi) || isNaN(fromTi)) return;
    if (fromSi === toSi && fromTi === toTi) return;
    var fromSec = state.venue.sections[fromSi];
    var toSec = state.venue.sections[toSi];
    if (!fromSec || !toSec) return;
    var item = fromSec.tiles.splice(fromTi, 1)[0];
    if (!item) return;
    if (toTi == null || toTi > toSec.tiles.length) toSec.tiles.push(item);
    else toSec.tiles.splice(toTi, 0, item);
    state.openTile = null;
    touch();
  }

  /* Preťahovanie celých sekcií — chytá sa za hlavičku sekcie. */
  function wireSectionDrag(top, si) {
    top.draggable = true;
    top.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('application/x-qr-section', String(si));
      e.dataTransfer.effectAllowed = 'move';
      top.closest('.sec-card').classList.add('is-drag');
    });
    top.addEventListener('dragend', function () {
      top.closest('.sec-card').classList.remove('is-drag');
    });
    top.addEventListener('dragover', function (e) {
      if (e.dataTransfer.types.indexOf('application/x-qr-section') === -1) return;
      e.preventDefault();
      top.closest('.sec-card').classList.add('is-over');
    });
    top.addEventListener('dragleave', function () {
      top.closest('.sec-card').classList.remove('is-over');
    });
    top.addEventListener('drop', function (e) {
      var raw = e.dataTransfer.getData('application/x-qr-section');
      if (raw === '') return;
      e.preventDefault();
      e.stopPropagation();
      top.closest('.sec-card').classList.remove('is-over');
      var from = parseInt(raw, 10);
      if (isNaN(from) || from === si) return;
      var item = state.venue.sections.splice(from, 1)[0];
      /* Po odstránení sa indexy za `from` posunuli o jedna nižšie —
         cieľová sekcia, pôvodne na `si`, je teraz na `si - 1`, ak sme
         brali položku spred nej. */
      state.venue.sections.splice(from < si ? si - 1 : si, 0, item);
      touch();
    });
  }

  /* ---------- Otváracie hodiny ------------------------------------------
     Tri vrstvy, prekresľované spolu (podobne ako sekcie s dlaždicami):
       days       — predvolený týždenný rozvrh
       seasons    — obdobia s vlastným rozvrhom (napr. leto/zima)
       exceptions — jednorazové zmeny na presný dátum
     Editor jedného týždňa (7 dní, viac rozsahov na deň) je zdieľaná
     funkcia — používa ju predvolený rozvrh aj rozvrh každej sezóny.
     -------------------------------------------------------------------*/
  function bindHours() {
    on('fHoursOn', 'change', function (e) {
      state.venue.hours.enabled = e.target.checked;
      $('hoursFields').style.display = e.target.checked ? '' : 'none';
      touch();
    });
    on('fHoursNote', 'input', function (e) { state.venue.hours.note = e.target.value; touchPreviewOnly(); });
    $('btnHoursCopy').addEventListener('click', function () {
      var mon = state.venue.hours.days[0];
      for (var i = 1; i < 7; i++) {
        state.venue.hours.days[i] = {
          closed: mon.closed,
          ranges: mon.ranges.map(function (r) { return [r[0], r[1]]; })
        };
      }
      touch();
    });
    $('btnAddSeason').addEventListener('click', function () {
      state.venue.hours.seasons.push(S.normalizeSeason({
        label: 'Nová sezóna', fromMonth: 10, fromDay: 1, toMonth: 4, toDay: 30
      }));
      touch();
    });
    $('btnAddException').addEventListener('click', function () {
      var today = new Date();
      var iso = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
      state.venue.hours.exceptions.push(S.normalizeException({ date: iso, closed: true, label: '' }));
      touch();
    });
  }

  function renderHours() {
    renderDayGrid($('hoursGrid'), state.venue.hours.days, touch);
    renderSeasons();
    renderExceptions();
  }

  /* Zdieľaný 7-dňový editor s podporou viacerých rozsahov na deň
     (napr. obedná prestávka). `onChange` sa volá po štrukturálnej zmene
     (pridanie/odstránenie rozsahu, prepnutie zatvorené) — hodnoty času
     samé osebe si vystačia s prekreslením náhľadu. */
  function renderDayGrid(grid, days, onStructuralChange) {
    grid.innerHTML = '';
    S.DAY_NAMES.forEach(function (name, i) {
      var d = days[i];
      var line = document.createElement('div');
      line.className = 'hline';

      var head = document.createElement('div');
      head.className = 'hline-head';
      head.appendChild(el('span', 'day', name));
      var closedLabel = document.createElement('label');
      closedLabel.className = 'check';
      var closedInput = document.createElement('input');
      closedInput.type = 'checkbox';
      closedInput.checked = d.closed;
      closedInput.addEventListener('change', function () {
        d.closed = closedInput.checked;
        onStructuralChange();
      });
      closedLabel.appendChild(closedInput);
      closedLabel.appendChild(document.createTextNode(' zatvorené'));
      head.appendChild(closedLabel);
      line.appendChild(head);

      var rangesBox = document.createElement('div');
      rangesBox.className = 'hranges';
      if (!d.closed) {
        d.ranges.forEach(function (r, ri) {
          var row = document.createElement('div');
          row.className = 'hrange';
          var from = document.createElement('input');
          from.type = 'time'; from.value = r[0];
          from.addEventListener('change', function () { r[0] = from.value || '09:00'; touchPreviewOnly(); });
          var to = document.createElement('input');
          to.type = 'time'; to.value = r[1];
          to.addEventListener('change', function () { r[1] = to.value || '17:00'; touchPreviewOnly(); });
          row.appendChild(from);
          row.appendChild(el('span', 'sep', '–'));
          row.appendChild(to);
          if (d.ranges.length > 1) {
            row.appendChild(iconBtn('trash-2', 'Odstrániť rozsah', function () {
              d.ranges.splice(ri, 1);
              onStructuralChange();
            }, false, 'danger'));
          }
          rangesBox.appendChild(row);
        });
        var addRange = document.createElement('button');
        addRange.type = 'button';
        addRange.className = 'btn sm';
        addRange.textContent = '+ rozsah (napr. obedná prestávka)';
        addRange.addEventListener('click', function () {
          var last = d.ranges[d.ranges.length - 1];
          d.ranges.push([last ? last[1] : '13:00', '17:00']);
          onStructuralChange();
        });
        rangesBox.appendChild(addRange);
      }
      line.appendChild(rangesBox);
      grid.appendChild(line);
    });
  }

  function renderSeasons() {
    var wrap = $('seasonsList');
    wrap.innerHTML = '';
    if (!state.venue.hours.seasons.length) {
      wrap.innerHTML = '<div class="empty">Zatiaľ žiadna sezóna — bez nej platí len rozvrh vyššie.</div>';
      return;
    }
    state.venue.hours.seasons.forEach(function (season, si) {
      var card = document.createElement('div');
      card.className = 'sec-card';

      var top = document.createElement('div');
      top.className = 'sec-top';
      var label = input('text', season.label, 'Názov sezóny (napr. Letné hodiny)', function (v) {
        season.label = v; touchPreviewOnly();
      });
      top.appendChild(label);
      top.appendChild(iconBtn('trash-2', 'Odstrániť sezónu', function () {
        state.venue.hours.seasons.splice(si, 1);
        touch();
      }, false, 'danger'));
      card.appendChild(top);

      var range = document.createElement('div');
      range.className = 'season-range';
      range.appendChild(el('span', 'lbl', 'Od'));
      range.appendChild(monthDayInput(season.fromMonth, season.fromDay, function (m, d) {
        season.fromMonth = m; season.fromDay = d; touchPreviewOnly();
      }));
      range.appendChild(el('span', 'lbl', 'do'));
      range.appendChild(monthDayInput(season.toMonth, season.toDay, function (m, d) {
        season.toMonth = m; season.toDay = d; touchPreviewOnly();
      }));
      card.appendChild(range);

      var grid = document.createElement('div');
      grid.className = 'hgrid';
      renderDayGrid(grid, season.days, touch);
      card.appendChild(grid);

      wrap.appendChild(card);
    });
  }

  function monthDayInput(month, day, onChange) {
    var box = document.createElement('span');
    box.className = 'monthday';
    var m = document.createElement('select');
    ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec']
      .forEach(function (name, i) { m.appendChild(new Option(name, i + 1)); });
    m.value = month;
    var d = document.createElement('input');
    d.type = 'number'; d.min = 1; d.max = 31; d.value = day; d.className = 'fixed';
    d.style.width = '56px';
    m.addEventListener('change', function () { onChange(parseInt(m.value, 10), parseInt(d.value, 10) || 1); });
    d.addEventListener('change', function () {
      var v = Math.max(1, Math.min(31, parseInt(d.value, 10) || 1));
      d.value = v;
      onChange(parseInt(m.value, 10), v);
    });
    box.appendChild(d);
    box.appendChild(m);
    return box;
  }

  function renderExceptions() {
    var wrap = $('exceptionsList');
    wrap.innerHTML = '';
    if (!state.venue.hours.exceptions.length) {
      wrap.innerHTML = '<div class="empty">Zatiaľ žiadna výnimka.</div>';
      return;
    }
    // Zoradené podľa dátumu, nech sa v nich dá orientovať.
    var sorted = state.venue.hours.exceptions.map(function (e, i) { return { e: e, i: i }; })
      .sort(function (a, b) { return a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : 0; });

    sorted.forEach(function (entry) {
      var ex = entry.e;
      var row = document.createElement('div');
      row.className = 'tile-row';

      var meta = document.createElement('div');
      meta.className = 'meta exception-fields';

      var dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = ex.date;
      dateInput.className = 'fixed';
      dateInput.addEventListener('change', function () { ex.date = dateInput.value; touch(); });
      meta.appendChild(dateInput);

      var closedLabel = document.createElement('label');
      closedLabel.className = 'check fixed';
      var closedInput = document.createElement('input');
      closedInput.type = 'checkbox';
      closedInput.checked = ex.closed;
      closedInput.addEventListener('change', function () { ex.closed = closedInput.checked; touch(); });
      closedLabel.appendChild(closedInput);
      closedLabel.appendChild(document.createTextNode(' celý deň zatvorené'));
      meta.appendChild(closedLabel);

      if (!ex.closed) {
        var from = document.createElement('input');
        from.type = 'time'; from.value = ex.ranges[0][0]; from.className = 'fixed';
        from.addEventListener('change', function () { ex.ranges[0][0] = from.value || '09:00'; touchPreviewOnly(); });
        var to = document.createElement('input');
        to.type = 'time'; to.value = ex.ranges[0][1]; to.className = 'fixed';
        to.addEventListener('change', function () { ex.ranges[0][1] = to.value || '17:00'; touchPreviewOnly(); });
        meta.appendChild(from);
        meta.appendChild(el('span', 'sep', '–'));
        meta.appendChild(to);
      }

      var labelInput = input('text', ex.label, 'Popis (napr. Štátny sviatok)', function (v) {
        ex.label = v; touchPreviewOnly();
      });
      labelInput.style.flex = '1';
      meta.appendChild(labelInput);

      row.appendChild(meta);
      row.appendChild(iconBtn('trash-2', 'Odstrániť výnimku', function () {
        state.venue.hours.exceptions.splice(entry.i, 1);
        touch();
      }, false, 'danger'));

      wrap.appendChild(row);
    });
  }

  /* ---------- Kontakt a päta -------------------------------------------- */
  function bindContact() {
    [['cPhone', 'phone'], ['cEmail', 'email'], ['cWeb', 'web'],
      ['cOrg', 'org'], ['cAddress', 'address']].forEach(function (p) {
      on(p[0], 'input', function (e) { state.venue.contact[p[1]] = e.target.value; touchPreviewOnly(); });
    });
  }

  function bindFooter() {
    on('fFootText', 'input', function (e) { state.venue.footer.text = e.target.value; touchPreviewOnly(); });
    on('fFootBrand', 'change', function (e) { state.venue.footer.showBrand = e.target.checked; touch(); });
    on('fSeo', 'input', function (e) { state.venue.seo.description = e.target.value; state.dirty = true; });
  }

  /* ================= STAV → FORMULÁR ================= */
  function fillForm() {
    var v = state.venue;
    $('fName').value = v.name;
    $('fSlug').value = v.slug;
    $('fSubtitle').value = v.subtitle;
    $('fMarkText').value = v.mark.text;
    syncMarkRadio();

    markTheme();
    $('fMode').value = v.theme.mode;
    $('fFont').value = v.theme.font;
    R.ensureFont(v.theme.font);
    $('fAccent').value = v.theme.accent || S.THEMES[v.theme.preset].light.accent;
    $('fDeep').value = v.theme.deep || S.THEMES[v.theme.preset].light.deep;
    $('fHeroDim').value = v.hero.dim;
    $('heroDimVal').textContent = v.hero.dim;

    $('fPrimaryOn').checked = v.primary.enabled;
    $('primaryFields').style.display = v.primary.enabled ? '' : 'none';
    $('fPrimaryType').value = v.primary.type;
    $('fPrimaryTitle').value = v.primary.title;
    $('fPrimaryNote').value = v.primary.note;
    $('fPrimaryUrl').value = v.primary.url;
    var pdef = S.TILE_BY_ID[v.primary.type];
    if (pdef) {
      $('fPrimaryUrl').placeholder = pdef.placeholder || '';
      $('primaryHint').textContent = pdef.hint || '';
    }

    renderSections();
    syncLangToggles();
    renderTranslations();

    applyKindUi();
    $('fEventFrom').value = v.event.from;
    $('fEventTo').value = v.event.to;
    $('fEventFromTime').value = v.event.fromTime;
    $('fEventToTime').value = v.event.toTime;
    $('fEventPlace').value = v.event.place;
    $('fEventAfter').value = v.event.afterText;
    renderProgram();

    $('fHoursOn').checked = v.hours.enabled;
    $('hoursFields').style.display = v.hours.enabled ? '' : 'none';
    $('fHoursNote').value = v.hours.note;
    renderHours();

    $('cPhone').value = v.contact.phone;
    $('cEmail').value = v.contact.email;
    $('cWeb').value = v.contact.web;
    $('cOrg').value = v.contact.org;
    $('cAddress').value = v.contact.address;

    $('fFootText').value = v.footer.text;
    $('fFootBrand').checked = v.footer.showBrand;
    $('fSeo').value = v.seo.description;
  }

  /* ================= PREKRESLENIE ================= */
  function touch() {
    state.dirty = true;
    renderSections();
    renderHours();
    renderProgram();
    renderTranslations();
    refresh();
  }

  /* Zmeny v textových poliach nesmú prekresliť sekcie — kurzor by
     vyskočil z rozpísaného políčka. Prekreslí sa len náhľad. */
  function touchPreviewOnly() {
    state.dirty = true;
    refresh();
  }

  function refresh() {
    $('markPreview').innerHTML = '';
    if (state.venue.mark.type === 'image' && state.venue.mark.image) {
      var im = document.createElement('img');
      im.src = state.venue.mark.image;
      $('markPreview').appendChild(im);
    } else {
      $('markPreview').textContent = state.venue.mark.text || R.initials(state.venue.name);
    }
    var hp = $('heroPreview');
    hp.innerHTML = '';
    if (state.venue.hero.image) {
      var hi = document.createElement('img');
      hi.src = state.venue.hero.image;
      hi.style.width = '100%';
      hi.style.height = '100%';
      hi.style.objectFit = 'cover';
      hp.appendChild(hi);
    }
    $('heroDimWrap').style.display = state.venue.hero.image ? '' : 'none';
    $('btnHeroClear').disabled = !state.venue.hero.image;

    $('slugPreview').textContent = publicUrl() || '—';
    refreshPreview();
    refreshQr();
    updateSaveButton();
    syncHideBtn();
  }

  var previewLang = '';

  function refreshPreview() {
    var box = $('preview');
    if (previewLang && state.venue.langs.indexOf(previewLang) < 0) previewLang = '';
    R.applyTheme(box, state.venue.theme, { prefersDark: mql.matches });
    R.render(box, state.venue, {
      brand: state.venue.footer.showBrand ? CFG.brand : '',
      /* V náhľade ukážeme aj nedokončené dlaždice, označené — na verejnej
         stránke sa nezobrazia vôbec. */
      editing: true,
      lang: previewLang,
      onLangChange: function (code) { previewLang = code; refreshPreview(); }
    });
    var u = publicUrl();
    $('pvUrl').innerHTML = I.svg('globe') + '<span></span>';
    $('pvUrl').querySelector('span').textContent = u.replace(/^https?:\/\//, '') || '…';
  }

  /* ================= PANELY ================= */
  function bindPanes() {
    document.querySelectorAll('.pv-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.pv-tabs button').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        document.querySelectorAll('[data-pane]').forEach(function (p) {
          p.hidden = p.dataset.pane !== b.dataset.pv;
        });
        if (b.dataset.pv === 'qr') refreshQr();
      });
    });
  }

  /* ================= QR ================= */
  function publicUrl() {
    var base = ($('qBase').value || '').replace(/\/+$/, '');
    if (!base || !state.venue.slug) return base || '';
    return base + '/' + state.venue.slug;
  }

  function buildFormatSelect() {
    var sel = $('qFormat');
    sel.innerHTML = '';
    Object.keys(Q.SHEET_FORMATS).forEach(function (k) {
      sel.appendChild(new Option(Q.SHEET_FORMATS[k].label, k));
    });
    var saved = localStorage.getItem(LS.format);
    if (saved && Q.SHEET_FORMATS[saved]) sel.value = saved;
    sel.addEventListener('change', function () { localStorage.setItem(LS.format, sel.value); });
  }

  function bindQr() {
    on('qBase', 'input', function (e) {
      localStorage.setItem(LS.base, e.target.value);
      $('slugPreview').textContent = publicUrl() || '—';
      refreshPreview();
      refreshQr();
    });
    ['qDark', 'qLight', 'qLogo', 'qTransparent'].forEach(function (id) {
      on(id, 'input', refreshQr);
      on(id, 'change', refreshQr);
    });

    $('btnQrSvg').addEventListener('click', function () {
      var u = publicUrl();
      if (!requireUrl(u)) return;
      Q.download(Q.toSVG(u, qrOpts(true)), state.venue.slug + '-qr.svg', 'image/svg+xml;charset=utf-8');
    });
    $('btnQrPng').addEventListener('click', function () { pngDownload(1024); });
    $('btnQrPng2').addEventListener('click', function () { pngDownload(2048); });
    $('btnQrPrint').addEventListener('click', function () {
      var u = publicUrl();
      if (!requireUrl(u)) return;
      var ok = Q.printSheet({
        url: u,
        name: state.venue.name || state.venue.slug,
        subtitle: state.venue.subtitle,
        dark: $('qDark').value,
        logo: $('qLogo').checked ? state.venue.mark.image : '',
        format: $('qFormat').value,
        cta: 'Naskenujte telefónom'
      });
      if (!ok) alert('Prehliadač zablokoval nové okno. Povoľte vyskakovacie okná pre túto stránku.');
    });
    $('btnQrPrintAll').addEventListener('click', printAllVenues);
  }

  /* Hromadná tlač — stiahne aktuálny obsah každej uloženej prevádzky
     (nie len rozpracovaný stav v editore) a poskladá jeden dokument. */
  function printAllVenues() {
    var base = ($('qBase').value || '').replace(/\/+$/, '');
    if (!base) { alert('Najprv vyplňte základnú adresu.'); return; }
    if (!state.index.venues.length) { alert('Zatiaľ nie je uložená žiadna prevádzka.'); return; }

    note('saveNote', 'Načítavam prevádzky…', 'busy');
    Promise.all(state.index.venues.map(function (entry) {
      return ST.readVenue(entry.slug + '.json')
        .then(function (data) { return S.normalizeVenue(data); })
        .catch(function () { return null; });
    })).then(function (venues) {
      var items = venues.filter(Boolean).map(function (v) {
        return {
          url: base + '/' + v.slug,
          name: v.name || v.slug,
          subtitle: v.subtitle,
          logo: $('qLogo').checked ? v.mark.image : ''
        };
      });
      if (!items.length) { note('saveNote', 'Žiadnu prevádzku sa nepodarilo načítať.', 'err'); return; }
      var ok = Q.printBulkSheet(items, {
        dark: $('qDark').value,
        format: $('qFormat').value,
        cta: 'Naskenujte telefónom'
      });
      note('saveNote', ok
        ? ('Pripravené na tlač: ' + items.length + ' prevádzok.')
        : 'Prehliadač zablokoval nové okno. Povoľte vyskakovacie okná pre túto stránku.', ok ? 'ok' : 'err');
    });
  }

  function pngDownload(px) {
    var u = publicUrl();
    if (!requireUrl(u)) return;
    var o = qrOpts(false);
    o.px = px;
    Q.toPNG(u, o).then(function (blob) {
      Q.download(blob, state.venue.slug + '-qr-' + px + '.png');
    }).catch(function () {
      alert('PNG sa nepodarilo vyrobiť. Skúste stiahnuť SVG.');
    });
  }

  function qrOpts(allowTransparent) {
    var logo = $('qLogo').checked ? state.venue.mark.image : '';
    return {
      dark: $('qDark').value,
      light: (allowTransparent && $('qTransparent').checked) ? 'none' : $('qLight').value,
      logo: logo,
      logoRatio: 0.24,
      logoBg: $('qLight').value,
      px: 1024
    };
  }

  function requireUrl(u) {
    if (u && state.venue.slug) return true;
    alert('Najprv vyplňte základnú adresu a slug prevádzky.');
    return false;
  }

  function refreshQr() {
    var box = $('qrBox');
    var u = publicUrl();
    $('qrUrl').textContent = u || 'Vyplňte adresu a slug.';
    if (!u || !state.venue.slug) { box.innerHTML = '<span class="hint">Zatiaľ nie je čo zakódovať.</span>'; return; }

    var hasLogo = $('qLogo').checked && state.venue.mark.image;
    $('qLogo').disabled = !state.venue.mark.image;
    $('qWarn').textContent = !state.venue.mark.image
      ? 'Logo do stredu kódu sa dá vložiť, až keď je v Základných údajoch nahraté ako obrázok.'
      : (hasLogo ? 'S logom sa použije najvyššia korekcia chýb. Po vytlačení kód vždy vyskúšajte naskenovať.' : '');

    try {
      box.innerHTML = Q.toSVG(u, qrOpts(false));
    } catch (e) {
      box.innerHTML = '<span class="hint">Adresa je pre QR kód príliš dlhá.</span>';
    }
  }

  /* ================= UKLADANIE ================= */
  function buildAdapterSelect() {
    var sel = $('sAdapter');
    sel.innerHTML = '';
    ST.adapters().forEach(function (a) { sel.appendChild(new Option(a.label, a.id)); });
    var saved = localStorage.getItem(LS.adapter);
    if (saved && [].slice.call(sel.options).some(function (o) { return o.value === saved; })) {
      sel.value = saved;
    }
    syncAdapterUi();
  }

  function syncAdapterUi() {
    var a = ST.get($('sAdapter').value);
    $('sHint').textContent = a.hint;
    $('secretWrap').style.display = a.needsSecret ? '' : 'none';
    if (a.needsSecret) {
      $('sSecretLabel').textContent = a.secretLabel || 'Heslo';
      var remembered = localStorage.getItem(LS.secret + a.id) || '';
      $('sSecret').value = remembered;
      $('sRemember').checked = !!remembered;
    }
  }

  function bindSave() {
    on('sAdapter', 'change', function (e) {
      localStorage.setItem(LS.adapter, e.target.value);
      syncAdapterUi();
    });

    $('btnTest').addEventListener('click', function () {
      var a = ST.get($('sAdapter').value);
      note('saveNote', 'Overujem…', 'busy');
      a.test(currentAuth())
        .then(function (r) { note('saveNote', r.message, 'ok'); })
        .catch(function (e) { note('saveNote', e.message || String(e), 'err'); });
    });

    $('btnSave').addEventListener('click', save);

    $('btnDelete').addEventListener('click', function () {
      if (!state.venue.slug) return;
      if (!confirm('Odstrániť „' + (state.venue.name || state.venue.slug) + '“ zo zoznamu prevádzok?')) return;
      var a = ST.get($('sAdapter').value);
      if (a.id !== 'php' && state.indexStale) {
        note('saveNote', 'Zoznam prevádzok sa nenačítal — obnovte stránku, inak by sa prepísal prázdnym.', 'err');
        return;
      }
      var slug = state.venue.slug;
      state.index.venues = state.index.venues.filter(function (x) { return x.slug !== slug; });
      a.save([{ path: 'index.json', content: json(state.index) }], currentAuth(), { index: { remove: slug } })
        .then(function (r) {
          if (r.index) state.index = r.index;
          note('saveNote', 'Odstránené zo zoznamu.', 'ok');
          fillPicker();
        })
        .catch(function (e) { note('saveNote', e.message || String(e), 'err'); });
    });

    $('btnHideToggle').addEventListener('click', function () {
      if (!state.venue.slug || !state.venue.name) return;
      var willHide = state.venue.listed !== false;
      var q = state.venue.name || state.venue.slug;
      if (willHide && !confirm('Skryť „' + q + '“ z verejného rozcestníka? Priama adresa a QR ostanú funkčné.')) return;
      state.venue.listed = !willHide;
      touch();
      syncHideBtn();
      save();
    });

    $('btnCheckLinks').addEventListener('click', checkLinks);
  }

  /* ---------- Kontrola odkazov -------------------------------------------
     Skutočný HTTP dotaz cez api/checklinks.php, ak je dostupný (PHP
     hosting); inak obmedzená kontrola priamo z prehliadača, ktorá vie
     povedať len, či požiadavka zlyhala — nie presný stavový kód (CORS). */
  function collectVenueUrls() {
    var v = state.venue;
    var urls = [];
    if (v.primary.enabled) {
      var pHref = S.tileHref({ type: v.primary.type, value: v.primary.url }, v);
      if (/^https?:/i.test(pHref)) urls.push(pHref);
    }
    v.sections.forEach(function (sec) {
      sec.tiles.forEach(function (t) {
        if (t.hidden) return;
        var href = S.tileHref(t, v);
        if (/^https?:/i.test(href)) urls.push(href);
      });
    });
    return urls.filter(function (u, i) { return urls.indexOf(u) === i; });
  }

  function checklinksEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? save.replace(/save\.php$/, 'checklinks.php') : '';
  }

  function checkLinks() {
    var urls = collectVenueUrls();
    var box = $('linkCheckResults');
    box.innerHTML = '';
    if (!urls.length) {
      box.innerHTML = '<div class="empty">Táto prevádzka nemá žiadne externé odkazy na kontrolu.</div>';
      return;
    }
    box.innerHTML = '<p class="hint">Kontrolujem ' + urls.length + ' odkazov…</p>';

    var endpoint = checklinksEndpoint();
    if (!endpoint) { clientSideCheck(urls); return; }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ urls: urls }, auth ? { token: auth.token } : { password: $('sSecret').value }))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'server');
        renderLinkResults(j.results, false);
      })
      .catch(function () { clientSideCheck(urls); });
  }

  function clientSideCheck(urls) {
    Promise.all(urls.map(function (u) {
      return fetch(u, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' })
        .then(function () { return { url: u, status: null, ok: null }; })
        .catch(function () { return { url: u, status: 0, ok: false }; });
    })).then(function (results) { renderLinkResults(results, true); });
  }

  function renderLinkResults(results, limited) {
    var box = $('linkCheckResults');
    box.innerHTML = '';
    if (limited) {
      box.appendChild(el('p', 'hint',
        'Obmedzená kontrola z prehliadača — vie povedať len, či požiadavka zlyhala, ' +
        'nie presný stavový kód (chýba api/checklinks.php alebo nesprávne heslo).'));
    }
    results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'link-row';
      var icon = el('span', 'link-icon ' + (r.ok === true ? 'is-ok' : r.ok === false ? 'is-bad' : 'is-unknown'));
      icon.innerHTML = I.svg(r.ok === true ? 'check' : r.ok === false ? 'x' : 'info');
      row.appendChild(icon);
      row.appendChild(el('span', 'link-url', r.url + (r.status ? ' — ' + r.status : '')));
      box.appendChild(row);
    });
  }

  function updateSaveButton() {
    $('btnSave').disabled = !state.venue.slug || !state.venue.name;
  }

  /* Tlačidlo „Zneviditeľniť / Znova zobraziť moje qerko" v Nebezpečnej zóne. */
  function syncHideBtn() {
    var b = $('btnHideToggle');
    if (!b) return;
    var hidden = state.venue.listed === false;
    b.textContent = hidden ? 'Znova zobraziť moje qerko' : 'Zneviditeľniť moje qerko';
    b.classList.toggle('danger', !hidden);
    b.disabled = !state.venue.slug || !state.venue.name;
  }

  function save() {
    var v = state.venue;
    if (!v.slug || !v.name) {
      note('saveNote', 'Vyplňte aspoň názov a adresu (slug).', 'err');
      return;
    }
    if (S.isReservedSlug(v.slug)) {
      note('saveNote', 'Adresa „' + v.slug + '“ je vyhradená pre systém, zvoľte inú.', 'err');
      return;
    }

    /* Zoznam prevádzok držíme zoradený podľa názvu, nech sa v ňom dá
       orientovať aj po pridaní desiatej prevádzky. */
    var entry = { slug: v.slug, name: v.name, subtitle: v.subtitle, kind: v.kind };
    if (v.listed === false) entry.hidden = true;
    var found = false;
    state.index.venues = state.index.venues.map(function (x) {
      if (x.slug === v.slug) { found = true; return entry; }
      return x;
    });
    if (!found) state.index.venues.push(entry);
    state.index.venues.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'sk'); });

    var files = [
      { path: v.slug + '.json', content: json(v) },
      { path: 'index.json', content: json(state.index) }
    ];

    var a = ST.get($('sAdapter').value);
    var secret = currentAuth();

    /* Bez načítaného zoznamu by download/github zapísali index len
       s touto jednou prevádzkou. PHP adaptér si zoznam zlučuje na
       serveri, toho sa to netýka. */
    if (a.id !== 'php' && state.indexStale) {
      note('saveNote', 'Zoznam prevádzok sa nenačítal — obnovte stránku, inak by sa prepísal.', 'err');
      return;
    }

    /* Heslo do localStorage sa ukladá len pri ručnom zadaní — prihlásenie
       (token) má vlastné, kratšie trvanie a rieši si to samo. */
    if (a.needsSecret && !auth) {
      if ($('sRemember').checked) localStorage.setItem(LS.secret + a.id, secret);
      else localStorage.removeItem(LS.secret + a.id);
    }

    note('saveNote', 'Ukladám…', 'busy');
    $('btnSave').disabled = true;

    var attempt = function (force) {
      return a.save(files, secret, { index: { upsert: entry }, force: force })
        .then(function (r) {
          state.dirty = false;
          if (r.index) state.index = r.index;   // zlúčený zoznam zo servera
          note('saveNote', r.message, 'ok');
          fillPicker();
        })
        .catch(function (e) {
          /* Server odmietol zápis, lebo súbor medzitým zmenil niekto
             iný. Prepísať smie len vedomé rozhodnutie správcu. */
          if (e && e.conflict && !force) {
            if (confirm(e.message + '\n\nPrepísať jeho verziu vašou?')) return attempt(true);
            note('saveNote', 'Neuložené — načítajte prevádzku znova (výber v zozname) a zmeny zopakujte.', 'err');
            return;
          }
          note('saveNote', e.message || String(e), 'err');
        });
    };
    attempt(false).then(function () { updateSaveButton(); syncHideBtn(); });
  }

  /* Auth pre PHP volania — token z prihlásenia, inak ručne zadané heslo.
     storage.js aj api/*.php akceptujú obe podoby rovnako. */
  function currentAuth() {
    return auth ? { token: auth.token } : $('sSecret').value;
  }

  /* ================= PRIHLÁSENIE (voliteľné) ============================
     Nezávislé od zvoleného spôsobu ukladania — slúži len na to, aby sa
     nemuselo opakovane zadávať heslo, a aby prevádzka prihlásená pod
     svojím vlastným účtom videla, že smie upravovať len seba. */
  function bindLogin() {
    $('btnLogin').addEventListener('click', function () {
      var slug = S.slugify($('loginSlug').value);
      var password = $('loginPassword').value;
      if (!password) { note('loginNote', 'Zadajte heslo.', 'err'); return; }
      note('loginNote', 'Prihlasujem…', 'busy');
      fetch(authEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, password: password })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'Prihlásenie zlyhalo');
          auth = { token: j.token, scope: j.scope, slug: j.slug };
          if ($('loginRemember').checked) localStorage.setItem(LS.login, JSON.stringify(auth));
          else localStorage.removeItem(LS.login);
          $('loginPassword').value = '';
          note('loginNote', 'Prihlásené.', 'ok');
          applyLoginUi();
        })
        .catch(function (e) { note('loginNote', e.message || String(e), 'err'); });
    });

    $('btnLogout').addEventListener('click', function () {
      auth = null;
      localStorage.removeItem(LS.login);
      applyLoginUi();
      note('loginNote', 'Odhlásené.', 'ok');
    });
  }

  function authEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? save.replace(/save\.php$/, 'auth.php') : '';
  }

  function restoreLogin() {
    var raw = localStorage.getItem(LS.login);
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      // exp sa neoveruje tu — expirovaný token jednoducho zlyhá na
      // serveri pri prvom použití a používateľ sa prihlási znova.
      if (parsed && parsed.token) auth = parsed;
    } catch (e) { /* poškodený záznam, ignorovať */ }
    applyLoginUi();
  }

  /* Prihlásenie ako konkrétna prevádzka uzamkne výber len na ňu —
     server by cudziu prevádzku aj tak odmietol, toto len ušetrí
     zbytočný pokus a vysvetlí prečo. */
  function applyLoginUi() {
    var logged = !!auth;
    $('btnLogin').style.display = logged ? 'none' : '';
    $('btnLogout').style.display = logged ? '' : 'none';
    $('loginSlug').disabled = logged;
    $('loginPassword').disabled = logged;

    var status = $('loginStatus');
    if (logged) {
      status.style.display = '';
      status.textContent = auth.scope === 'master'
        ? 'Prihlásené: master (vidí všetko)'
        : 'Prihlásené ako qerko: ' + auth.slug;
    } else {
      status.style.display = 'none';
    }

    $('accountsCard').hidden = !(logged && auth.scope === 'master');

    /* Úplné odstránenie zo zoznamu smie len master (alebo lokálne bez
       prihlásenia). Vedúci prevádzky má v Nebezpečnej zóne len
       zneviditeľnenie svojho qerka. */
    var venueScope = logged && auth.scope === 'venue';
    $('deleteRow').hidden = venueScope;
    $('deleteHint').hidden = venueScope;
    syncHideBtn();

    var picker = $('venuePicker');
    if (logged && auth.scope === 'venue') {
      [].slice.call(picker.options).forEach(function (o) {
        o.disabled = o.value !== auth.slug && o.value !== '';
      });
      if (state.venue.slug !== auth.slug && state.index.venues.some(function (v) { return v.slug === auth.slug; })) {
        openVenue(auth.slug);
      }
      $('btnNew').disabled = true;
      $('btnNew').title = 'Prihlásený účet prevádzky nesmie zakladať nové qerko.';
    } else {
      [].slice.call(picker.options).forEach(function (o) { o.disabled = false; });
      $('btnNew').disabled = false;
      $('btnNew').title = '';
    }
  }

  /* ================= ÚČTY PREVÁDZOK (master) ============================ */
  function bindAccounts() {
    $('btnAcctSet').addEventListener('click', function () {
      var slug = S.slugify($('acctSlug').value);
      var newPassword = $('acctPassword').value;
      if (!slug) { note('acctNote', 'Zadajte slug prevádzky.', 'err'); return; }
      if (newPassword.length < 6) { note('acctNote', 'Heslo musí mať aspoň 6 znakov.', 'err'); return; }
      var endpoint = accountsEndpoint();
      note('acctNote', 'Ukladám…', 'busy');
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: 'set', slug: slug, newPassword: newPassword }, currentAuthObj()))
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'Zlyhalo');
          note('acctNote', 'Heslo pre ' + slug + ' nastavené.', 'ok');
          $('acctPassword').value = '';
          loadAccounts();
        })
        .catch(function (e) { note('acctNote', e.message || String(e), 'err'); });
    });
  }

  function accountsEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? save.replace(/save\.php$/, 'accounts.php') : '';
  }

  /* { token } keď je prihlásenie, inak { password } z master poľa. */
  function currentAuthObj() {
    return auth ? { token: auth.token } : { password: $('sSecret').value };
  }

  function loadAccounts() {
    var endpoint = accountsEndpoint();
    if (!endpoint) return;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'list' }, currentAuthObj()))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var box = $('accountsList');
        box.innerHTML = '';
        if (!j.ok) { box.innerHTML = '<div class="empty">' + (j.error || 'Nepodarilo sa načítať.') + '</div>'; return; }
        if (!j.accounts.length) { box.innerHTML = '<div class="empty">Zatiaľ žiadny účet prevádzky.</div>'; return; }
        j.accounts.forEach(function (acc) {
          var row = document.createElement('div');
          row.className = 'tile-row';
          row.appendChild(el('span', 'meta', acc.slug));
          row.appendChild(iconBtn('trash-2', 'Odstrániť účet', function () {
            if (!confirm('Odstrániť účet pre ' + acc.slug + '?')) return;
            fetch(accountsEndpoint(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign({ action: 'remove', slug: acc.slug }, currentAuthObj()))
            }).then(function (r) { return r.json(); }).then(function () { loadAccounts(); });
          }, false, 'danger'));
          box.appendChild(row);
        });
      })
      .catch(function () { /* ticho — účty sú voliteľné */ });
  }

  /* ================= ŠTATISTIKY ========================================= */
  function bindStats() {
    $('btnStatsLoad').addEventListener('click', loadStats);
    document.querySelector('.pv-tabs button[data-pv="stats"]').addEventListener('click', function () {
      loadStats();
      loadReportDefault();
    });
    bindReport();
  }

  /* ---------- Jednorazový report e-mailom -------------------------------
     Rovnaký endpoint (api/report.php) ako cron report, len s vlastným
     rozsahom dátumov a príjemcom namiesto weekly/monthly — vždy len za
     aktuálne otvorenú prevádzku. */
  var reportDefaultLoaded = false;

  function reportEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? save.replace(/save\.php$/, 'report.php') : '';
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function bindReport() {
    var today = new Date();
    var weekAgo = new Date(today.getTime() - 7 * 86400000);
    $('reportTo').value = isoDate(today);
    $('reportFrom').value = isoDate(weekAgo);

    $('btnReportSend').addEventListener('click', function () {
      var note = $('reportNote');
      if (!state.venue.slug) { note.innerHTML = '<div class="empty">Najprv vyberte prevádzku.</div>'; return; }
      var endpoint = reportEndpoint();
      if (!endpoint) { note.innerHTML = '<div class="empty">Report potrebuje PHP hosting.</div>'; return; }
      if (!auth && !$('sSecret').value) {
        note.innerHTML = '<div class="empty">Najprv sa prihláste — karta Uloženie → Prihlásenie.</div>';
        return;
      }
      var from = $('reportFrom').value, to = $('reportTo').value, email = $('reportEmail').value.trim();
      if (!from || !to) { note.innerHTML = '<div class="empty">Vyplňte obdobie od–do.</div>'; return; }
      if (!email) { note.innerHTML = '<div class="empty">Vyplňte e-mail príjemcu.</div>'; return; }
      note.innerHTML = '<p class="hint">Odosielam…</p>';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(
          { action: 'send', slug: state.venue.slug, from: from, to: to, email: email },
          currentAuthObj()
        ))
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          note.innerHTML = '';
          var p = document.createElement(j.ok ? 'p' : 'div');
          p.className = j.ok ? 'hint' : 'empty';
          p.textContent = j.ok ? ('Report odoslaný na ' + email + '.') : (j.error || 'Odoslanie zlyhalo.');
          note.appendChild(p);
        })
        .catch(function (e) {
          note.innerHTML = '';
          var p = document.createElement('div');
          p.className = 'empty';
          p.textContent = e.message || String(e);
          note.appendChild(p);
        });
    });
  }

  function loadReportDefault() {
    if (reportDefaultLoaded) return;
    var endpoint = reportEndpoint();
    if (!endpoint || (!auth && !$('sSecret').value)) return;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'default' }, currentAuthObj()))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        reportDefaultLoaded = true;
        if (j.ok && j.to && !$('reportEmail').value) $('reportEmail').value = j.to;
      })
      .catch(function () {});
  }

  function statsEndpoint() {
    var save = (CFG.storage && CFG.storage.php) || '';
    return save ? save.replace(/save\.php$/, 'stats.php') : '';
  }

  function loadStats() {
    var box = $('statsResults');
    if (!state.venue.slug) { box.innerHTML = '<div class="empty">Najprv vyberte prevádzku.</div>'; return; }
    var endpoint = statsEndpoint();
    if (!endpoint) { box.innerHTML = '<div class="empty">Štatistiky potrebujú PHP hosting.</div>'; return; }
    if (!auth && !$('sSecret').value) {
      box.innerHTML = '<div class="empty">Najprv sa prihláste — karta Uloženie → Prihlásenie ' +
        '(master heslom alebo heslom tejto prevádzky).</div>';
      return;
    }
    box.innerHTML = '<p class="hint">Načítavam…</p>';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'read', slug: state.venue.slug, days: 30 }, currentAuthObj()))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Zlyhalo');
        renderStats(j.rows);
      })
      .catch(function (e) { box.innerHTML = '<div class="empty">' + (e.message || String(e)) + '</div>'; });
  }

  function renderStats(rows) {
    var box = $('statsResults');
    box.innerHTML = '';
    if (!rows.length) { box.innerHTML = '<div class="empty">Zatiaľ žiadne dáta za posledných 30 dní.</div>'; return; }
    // Súčet za metriku, nech je hneď vidno celkový obraz, nie len po dňoch.
    var totals = {};
    rows.forEach(function (r) { totals[r.metric] = (totals[r.metric] || 0) + r.count; });
    Object.keys(totals).sort().forEach(function (metric) {
      var row = document.createElement('div');
      row.className = 'link-row';
      row.appendChild(el('span', 'link-icon is-ok', String(totals[metric])));
      row.appendChild(el('span', 'link-url', metric));
      box.appendChild(row);
    });
  }

  /* ================= HORNÁ LIŠTA ================= */
  function bindTopbar() {
    on('venuePicker', 'change', function (e) {
      if (e.target.value) openVenue(e.target.value);
    });

    $('btnNew').addEventListener('click', function () {
      if (!confirmDiscard()) return;
      state.venue = starterVenue();
      state.openTile = null;
      state.dirty = false;
      fillForm();
      refresh();
      $('venuePicker').value = '';
      $('fName').focus();
    });

    $('btnExport').addEventListener('click', function () {
      if (!state.venue.slug) { alert('Najprv vyplňte slug.'); return; }
      Q.download(json(state.venue), state.venue.slug + '.json', 'application/json;charset=utf-8');
    });

    $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
    $('fileImport').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!confirmDiscard()) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          state.venue = S.normalizeVenue(JSON.parse(fr.result));
          state.openTile = null;
          state.dirty = true;
          fillForm();
          refresh();
        } catch (err) {
          alert('Tento súbor nie je platný JSON rozcestníka.');
        }
      };
      fr.readAsText(f);
    });
  }

  /* ================= POMOCNÍCI ================= */
  function on(id, ev, fn) {
    var n = $(id);
    if (n) n.addEventListener(ev, fn);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function field(label, control) {
    var w = document.createElement('div');
    w.className = 'field';
    var l = document.createElement('span');
    l.className = 'lbl';
    l.textContent = label;
    w.appendChild(l);
    w.appendChild(control);
    return w;
  }

  function input(type, value, placeholder, onInput) {
    var i = document.createElement('input');
    i.type = type;
    i.value = value || '';
    i.placeholder = placeholder || '';
    i.addEventListener('input', function () { onInput(i.value); });
    return i;
  }

  function iconBtn(icon, title, fn, disabled, extra) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn icon sm fixed' + (extra === 'danger' ? ' danger' : '');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = I.svg(icon);
    if (extra === 'rot-up') b.querySelector('svg').style.transform = 'rotate(90deg)';
    if (extra === 'rot-down') b.querySelector('svg').style.transform = 'rotate(-90deg)';
    b.disabled = !!disabled;
    b.addEventListener('click', fn);
    return b;
  }

  function move(arr, i, delta) {
    var j = i + delta;
    if (j < 0 || j >= arr.length) return;
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }

  function json(o) { return JSON.stringify(o, null, 2); }

  function note(id, msg, kind) {
    var n = $(id);
    n.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'note ' + (kind || '');
    d.textContent = msg;
    n.appendChild(d);
  }
})();
