/* ------------------------------------------------------------------
   schema.js — jediný zdroj pravdy o tom, čo prevádzka môže obsahovať.
   Používa ho verejná stránka aj administrácia. Bez závislostí.
   ------------------------------------------------------------------ */
(function (g) {
  'use strict';

  /* ---------- Farebné témy -------------------------------------------
     Každá téma nesie svetlú aj tmavú sadu tokenov. Administrácia mení
     iba `theme.preset` (+ prípadné vlastné farby) a celý obsah stránky
     sa prefarbí sám — nikde inde nie sú farby natvrdo.
     -------------------------------------------------------------------*/
  var THEMES = {
    zrnko: {
      label: 'Zrnko — teal a jantár',
      hint: 'Predvolená. Kaviarne, kultúra, teplý a pokojný dojem.',
      light: {
        bg: '#EFF1EE', surface: '#FFFFFF', surface2: '#F7F8F6',
        ink: '#121A17', muted: '#626E69', line: '#DDE2DE',
        accent: '#E8A317', accentInk: '#3D2A05',
        deep: '#0E3B36', deepInk: '#EAF2F0', good: '#1F7A5C'
      },
      dark: {
        bg: '#0C1211', surface: '#141C1A', surface2: '#101817',
        ink: '#E8EDEA', muted: '#93A29C', line: '#26312D',
        accent: '#F2B12A', accentInk: '#241802',
        deep: '#08201E', deepInk: '#DCE9E6', good: '#4FBF95'
      }
    },
    kino: {
      label: 'Kino — noc a magenta',
      hint: 'Kiná, koncerty, večerné podujatia.',
      light: {
        bg: '#F1EFF4', surface: '#FFFFFF', surface2: '#F8F6FB',
        ink: '#16121C', muted: '#67617A', line: '#E0DCE8',
        accent: '#D6236B', accentInk: '#FFF0F5',
        deep: '#1B1430', deepInk: '#EDE9F7', good: '#2F7D67'
      },
      dark: {
        bg: '#0B0912', surface: '#15111F', surface2: '#110E1A',
        ink: '#EAE6F2', muted: '#9990AC', line: '#2C2540',
        accent: '#F5417F', accentInk: '#2B0413',
        deep: '#120C22', deepInk: '#E3DCF2', good: '#57C4A4'
      }
    },
    kniznica: {
      label: 'Knižnica — indigo a papier',
      hint: 'Knižnice, štúdium, pokoj a čitateľnosť.',
      light: {
        bg: '#EEF0F5', surface: '#FFFFFF', surface2: '#F6F7FB',
        ink: '#101625', muted: '#5C6679', line: '#DCE0EA',
        accent: '#2F5DD6', accentInk: '#EEF3FF',
        deep: '#152449', deepInk: '#E6EBF7', good: '#1C7A5E'
      },
      dark: {
        bg: '#0A0D16', surface: '#131824', surface2: '#0F131E',
        ink: '#E6EAF3', muted: '#8E97AB', line: '#242C3D',
        accent: '#5B85F5', accentInk: '#08122B',
        deep: '#101833', deepInk: '#DEE5F5', good: '#4FBF95'
      }
    },
    muzeum: {
      label: 'Múzeum — hlina a bronz',
      hint: 'Múzeá, galérie, historické expozície.',
      light: {
        bg: '#F2EFEA', surface: '#FFFFFF', surface2: '#FAF7F2',
        ink: '#1C1712', muted: '#6E655A', line: '#E3DCD1',
        accent: '#9C5A22', accentInk: '#FFF3E8',
        deep: '#3B2A1B', deepInk: '#F3EBE1', good: '#4A6B34'
      },
      dark: {
        bg: '#100D0A', surface: '#1A1613', surface2: '#15110E',
        ink: '#EDE7DF', muted: '#A0958A', line: '#2F2822',
        accent: '#D8873C', accentInk: '#2A1607',
        deep: '#231A12', deepInk: '#EBE1D5', good: '#8FB86A'
      }
    },
    les: {
      label: 'Les — zelená a limetka',
      hint: 'Príroda, šport, letné aktivity, kúpaliská.',
      light: {
        bg: '#EDF2EC', surface: '#FFFFFF', surface2: '#F5F9F4',
        ink: '#0F1A12', muted: '#5C6D5F', line: '#DAE3D8',
        accent: '#5A9A1E', accentInk: '#F2FBE8',
        deep: '#153A22', deepInk: '#E7F2E9', good: '#1F7A5C'
      },
      dark: {
        bg: '#0A100B', surface: '#131A14', surface2: '#0F150F',
        ink: '#E6EDE6', muted: '#8FA093', line: '#232E25',
        accent: '#87C93C', accentInk: '#0F2004',
        deep: '#0E2415', deepInk: '#DCE9DE', good: '#4FBF95'
      }
    },
    mesto: {
      label: 'Mesto — modrá a oceľ',
      hint: 'Úrady, informačné centrá, oficiálne prevádzky.',
      light: {
        bg: '#EDF1F3', surface: '#FFFFFF', surface2: '#F5F8FA',
        ink: '#0F1719', muted: '#5A686D', line: '#D9E1E5',
        accent: '#0B7FA8', accentInk: '#ECF9FF',
        deep: '#0E2A38', deepInk: '#E5EFF4', good: '#1F7A5C'
      },
      dark: {
        bg: '#080D0F', surface: '#121A1D', surface2: '#0E1518',
        ink: '#E4EBEE', muted: '#8C9BA1', line: '#212D32',
        accent: '#2FAAD6', accentInk: '#04212C',
        deep: '#0B1F29', deepInk: '#DCE7EC', good: '#4FBF95'
      }
    },
    vinohrad: {
      label: 'Vinohrad — burgundská',
      hint: 'Reštaurácie, vinárne, gastro.',
      light: {
        bg: '#F3EEEE', surface: '#FFFFFF', surface2: '#FAF5F5',
        ink: '#1B1112', muted: '#6F5D5F', line: '#E6D9DA',
        accent: '#A31D3C', accentInk: '#FFF0F3',
        deep: '#3A1420', deepInk: '#F4E7EA', good: '#4A6B34'
      },
      dark: {
        bg: '#100B0C', surface: '#1A1315', surface2: '#150F10',
        ink: '#EEE4E6', muted: '#A38F92', line: '#312628',
        accent: '#E0446A', accentInk: '#2C0410',
        deep: '#241017', deepInk: '#EDDCE1', good: '#8FB86A'
      }
    },
    grafit: {
      label: 'Grafit — čiernobiela',
      hint: 'Neutrálna. Ak má hovoriť len logo a fotka.',
      light: {
        bg: '#F0F0F0', surface: '#FFFFFF', surface2: '#F7F7F7',
        ink: '#131313', muted: '#666666', line: '#DFDFDF',
        accent: '#1A1A1A', accentInk: '#FFFFFF',
        deep: '#1A1A1A', deepInk: '#F2F2F2', good: '#1F7A5C'
      },
      dark: {
        bg: '#0B0B0B', surface: '#161616', surface2: '#111111',
        ink: '#EDEDED', muted: '#9A9A9A', line: '#292929',
        accent: '#F5F5F5', accentInk: '#111111',
        deep: '#151515', deepInk: '#EAEAEA', good: '#4FBF95'
      }
    }
  };

  /* ---------- Písmové dvojice ---------------------------------------- */
  var FONTS = {
    grotesk: {
      label: 'Familjen Grotesk + Instrument Sans',
      display: '"Familjen Grotesk", system-ui, sans-serif',
      body: '"Instrument Sans", system-ui, sans-serif',
      google: 'Familjen+Grotesk:wght@400;500;600;700|Instrument+Sans:wght@400;500;600;700'
    },
    serif: {
      label: 'Fraunces + Inter',
      display: '"Fraunces", Georgia, serif',
      body: '"Inter", system-ui, sans-serif',
      google: 'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700|Inter:wght@400;500;600;700'
    },
    kompakt: {
      label: 'Archivo + Inter',
      display: '"Archivo", system-ui, sans-serif',
      body: '"Inter", system-ui, sans-serif',
      google: 'Archivo:wght@500;600;700|Inter:wght@400;500;600;700'
    },
    system: {
      label: 'Systémové písmo (nič sa nesťahuje)',
      display: 'system-ui, -apple-system, Segoe UI, sans-serif',
      body: 'system-ui, -apple-system, Segoe UI, sans-serif',
      google: ''
    }
  };

  /* ---------- Katalóg dlaždíc ----------------------------------------
     `kind` hovorí, ako sa z hodnoty poskladá odkaz:
       url    – hodnota je celá adresa
       tel    – telefónne číslo
       mail   – e-mailová adresa
       maps   – adresa, ktorá sa pošle do máp
       vcard  – generuje sa v prehliadači z kontaktu
       share  – zdieľanie stránky
     -------------------------------------------------------------------*/
  var TILE_TYPES = [
    { id: 'google-review', group: 'Hodnotenie', label: 'Google recenzia', icon: 'star-filled', kind: 'url', stars: true,
      title: 'Napísať recenziu', note: 'Google · trvá to 20 sekúnd',
      placeholder: 'https://g.page/r/…/review',
      hint: 'V Google Business Profile → Požiadať o recenzie → skopírovať odkaz.' },
    { id: 'google-profile', group: 'Hodnotenie', label: 'Google profil', icon: 'b:googlemaps', kind: 'url',
      title: 'Nájdete nás na Google', note: '', placeholder: 'https://maps.app.goo.gl/…' },
    { id: 'tripadvisor', group: 'Hodnotenie', label: 'Iný hodnotiaci portál', icon: 'star-filled', kind: 'url', stars: true,
      title: 'Ohodnoťte nás', note: '', placeholder: 'https://…' },

    { id: 'instagram', group: 'Sociálne siete', label: 'Instagram', icon: 'b:instagram', kind: 'url',
      title: 'Instagram', note: '@profil', placeholder: 'https://instagram.com/…' },
    { id: 'facebook', group: 'Sociálne siete', label: 'Facebook', icon: 'b:facebook', kind: 'url',
      title: 'Facebook', note: '', placeholder: 'https://facebook.com/…' },
    { id: 'youtube', group: 'Sociálne siete', label: 'YouTube', icon: 'b:youtube', kind: 'url',
      title: 'YouTube', note: '', placeholder: 'https://youtube.com/@…' },
    { id: 'tiktok', group: 'Sociálne siete', label: 'TikTok', icon: 'b:tiktok', kind: 'url',
      title: 'TikTok', note: '', placeholder: 'https://tiktok.com/@…' },
    { id: 'threads', group: 'Sociálne siete', label: 'Threads', icon: 'b:threads', kind: 'url',
      title: 'Threads', note: '', placeholder: 'https://threads.net/@…' },
    { id: 'x', group: 'Sociálne siete', label: 'X (Twitter)', icon: 'b:x', kind: 'url',
      title: 'X', note: '', placeholder: 'https://x.com/…' },
    { id: 'linkedin', group: 'Sociálne siete', label: 'LinkedIn', icon: 'b:linkedin', kind: 'url',
      title: 'LinkedIn', note: '', placeholder: 'https://linkedin.com/company/…' },
    { id: 'spotify', group: 'Sociálne siete', label: 'Spotify', icon: 'b:spotify', kind: 'url',
      title: 'Spotify', note: '', placeholder: 'https://open.spotify.com/…' },

    { id: 'web', group: 'Podnik', label: 'Webová stránka', icon: 'globe', kind: 'url',
      title: 'Webová stránka', note: '', placeholder: 'https://…' },
    { id: 'menu', group: 'Podnik', label: 'Menu / cenník', icon: 'utensils', kind: 'url',
      title: 'Denné menu', note: '', placeholder: 'https://…' },
    { id: 'program', group: 'Podnik', label: 'Program / podujatia', icon: 'calendar', kind: 'url',
      title: 'Program', note: '', placeholder: 'https://…' },
    { id: 'tickets', group: 'Podnik', label: 'Vstupenky', icon: 'ticket', kind: 'url',
      title: 'Kúpiť vstupenku', note: '', placeholder: 'https://…' },
    { id: 'catalog', group: 'Podnik', label: 'Katalóg / rezervácia', icon: 'search', kind: 'url',
      title: 'Online katalóg', note: '', placeholder: 'https://…' },
    { id: 'gallery', group: 'Podnik', label: 'Fotogaléria (odkaz)', icon: 'image', kind: 'url',
      title: 'Fotogaléria', note: '', placeholder: 'https://…' },
    { id: 'photos', group: 'Podnik', label: 'Fotogaléria (priamo na stránke)', icon: 'image', kind: 'photos',
      title: 'Fotogaléria', note: '', placeholder: '',
      hint: 'Odkazy na už niekde hosťované obrázky, jeden na riadok. Zobrazia sa ako' +
            ' vodorovný pás priamo na stránke, bez odchodu preč.' },
    { id: 'price', group: 'Podnik', label: 'Vstupné / poplatky', icon: 'banknote', kind: 'url',
      title: 'Vstupné', note: '', placeholder: 'https://…' },

    { id: 'navigate', group: 'Kontakt', label: 'Navigovať', icon: 'navigation', kind: 'maps',
      title: 'Navigovať', note: '', placeholder: 'Námestie republiky 12, Sereď' },
    { id: 'phone', group: 'Kontakt', label: 'Zavolať', icon: 'phone', kind: 'tel',
      title: 'Zavolať', note: '', placeholder: '+421 903 000 000' },
    { id: 'email', group: 'Kontakt', label: 'Napísať e-mail', icon: 'mail', kind: 'mail',
      title: 'Napísať e-mail', note: '', placeholder: 'info@example.sk' },
    { id: 'whatsapp', group: 'Kontakt', label: 'WhatsApp', icon: 'b:whatsapp', kind: 'url',
      title: 'WhatsApp', note: '', placeholder: 'https://wa.me/421903000000' },
    { id: 'messenger', group: 'Kontakt', label: 'Messenger', icon: 'b:messenger', kind: 'url',
      title: 'Messenger', note: '', placeholder: 'https://m.me/…' },
    { id: 'telegram', group: 'Kontakt', label: 'Telegram', icon: 'b:telegram', kind: 'url',
      title: 'Telegram', note: '', placeholder: 'https://t.me/…' },
    { id: 'vcard', group: 'Kontakt', label: 'Uložiť kontakt (vCard)', icon: 'users', kind: 'vcard',
      title: 'Uložiť kontakt', note: 'vCard · 1 klik', placeholder: '',
      hint: 'Vygeneruje sa z kontaktných údajov nižšie. Netreba nič vypĺňať.' },
    { id: 'share', group: 'Kontakt', label: 'Zdieľať stránku', icon: 'share-2', kind: 'share',
      title: 'Zdieľať', note: '', placeholder: '' },

    { id: 'wifi', group: 'Ostatné', label: 'Wi-Fi', icon: 'wifi', kind: 'url',
      title: 'Wi-Fi', note: 'heslo', placeholder: '' },
    { id: 'parking', group: 'Ostatné', label: 'Parkovanie', icon: 'car', kind: 'url',
      title: 'Parkovanie', note: '', placeholder: 'https://…' },
    { id: 'accessibility', group: 'Ostatné', label: 'Bezbariérovosť', icon: 'accessibility', kind: 'url',
      title: 'Bezbariérový prístup', note: '', placeholder: 'https://…' },
    { id: 'info', group: 'Ostatné', label: 'Informácia (bez odkazu)', icon: 'info', kind: 'none',
      title: 'Informácia', note: '', placeholder: '' },
    { id: 'custom', group: 'Ostatné', label: 'Vlastná dlaždica', icon: 'link', kind: 'url',
      title: '', note: '', placeholder: 'https://…',
      hint: 'Vlastný názov, popis, ikona aj odkaz.' }
  ];

  var TILE_BY_ID = {};
  TILE_TYPES.forEach(function (t) { TILE_BY_ID[t.id] = t; });

  var DAY_NAMES = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
  var DAY_SHORT = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

  /* ---------- Predvolená prázdna prevádzka ---------------------------- */
  function blankVenue() {
    return {
      slug: '',
      /* 'venue' = stála prevádzka (otváracie hodiny), 'event' = podujatie
         (dátum, program, stav "o X dní / prebieha / skončilo"). Zvyšok —
         témy, dlaždice, QR, viacjazyčnosť, účty, štatistiky — je rovnaký. */
      kind: 'venue',
      name: '',
      subtitle: '',
      /* Zaradené vo verejnom rozcestníku (koreň domény). Keď je false,
         priama adresa a QR kód fungujú ďalej, len sa qerko neukazuje
         v zozname. Vedúci prevádzky si to smie prepnúť sám. */
      listed: true,
      /* Voliteľné ďalšie jazyky (napr. ['en']) — preklad každého textu
         sedí priamo pri origináli (i18n.<kód>), nie v oddelenom strome,
         takže sa nikdy nerozíde poradím sekcií či dlaždíc. Chýbajúci
         preklad jednoducho spadne späť na základný text. */
      langs: [],
      i18n: {},
      mark: { type: 'text', text: '', image: '' },
      /* Podujatie: dátum konania, miesto, text po skončení a časový
         program. Ignoruje sa, keď kind === 'venue'. */
      event: {
        from: '', to: '', fromTime: '', toTime: '',
        place: '', afterText: '',
        program: [],
        i18n: {}
      },
      /* Vypĺňa len api/integration.php pri "cancel"/"finish" — vlastné
         pole mimo verejnej administrácie, banner naň reaguje v render.js. */
      decko: { status: '' },
      /* Fotka na pozadí hlavičky. `dim` je krytie farebnej vrstvy nad ňou
         v percentách — bez nej by bol text na svetlej fotke nečitateľný. */
      hero: { image: '', dim: 55 },
      theme: { preset: 'zrnko', mode: 'auto', font: 'grotesk', accent: '', deep: '' },
      hours: {
        enabled: true,
        tz: 'Europe/Bratislava',
        note: '',
        days: [0, 1, 2, 3, 4, 5, 6].map(function (i) {
          return { closed: i > 4, ranges: [['09:00', '17:00']] };
        }),
        /* Sezóny: napr. iné hodiny cez leto. Kontrolujú sa v poradí, prvá
           zhoda vyhráva; ak žiadna nesedí, platí `days` vyššie. */
        seasons: [],
        /* Výnimky: jednorazové zatvorenie alebo iné hodiny na konkrétny
           dátum (sviatok, akcia). Majú prednosť pred sezónami aj `days`. */
        exceptions: []
      },
      primary: { enabled: false, type: 'google-review', title: '', note: '', url: '', i18n: {} },
      sections: [],
      contact: { phone: '', email: '', web: '', address: '', org: '' },
      footer: { text: '', showBrand: true, i18n: {} },
      seo: { description: '', i18n: {} }
    };
  }

  /* ---------- Normalizácia -------------------------------------------
     Doplní chýbajúce polia, aby staršie alebo ručne písané JSON súbory
     nikdy nezhodili renderer.
     -------------------------------------------------------------------*/
  function normalizeVenue(raw) {
    var v = blankVenue();
    if (!raw || typeof raw !== 'object') return v;

    v.slug = str(raw.slug);
    v.kind = raw.kind === 'event' ? 'event' : 'venue';
    v.name = str(raw.name);
    v.subtitle = str(raw.subtitle);
    v.listed = raw.listed !== false;
    if (raw.event && typeof raw.event === 'object') {
      v.event.from = isDate(raw.event.from) ? raw.event.from : '';
      v.event.to = isDate(raw.event.to) ? raw.event.to : '';
      v.event.fromTime = isTime(raw.event.fromTime) ? raw.event.fromTime : '';
      v.event.toTime = isTime(raw.event.toTime) ? raw.event.toTime : '';
      v.event.place = str(raw.event.place);
      v.event.afterText = str(raw.event.afterText);
      v.event.i18n = normalizeI18n(raw.event.i18n, ['place', 'afterText']);
      if (Array.isArray(raw.event.program)) {
        v.event.program = raw.event.program.map(normalizeProgramItem).filter(Boolean);
      }
      /* Ak koniec chýba, trvá jeden deň. */
      if (v.event.from && !v.event.to) v.event.to = v.event.from;
    }
    if (raw.decko && typeof raw.decko === 'object') {
      v.decko.status = ['cancelled', 'finished'].indexOf(raw.decko.status) >= 0 ? raw.decko.status : '';
    }
    if (Array.isArray(raw.langs)) {
      v.langs = raw.langs.map(str).filter(function (l) { return LANG_RE.test(l); })
        .filter(function (l, i, arr) { return arr.indexOf(l) === i; }).slice(0, 4);
    }
    v.i18n = normalizeI18n(raw.i18n, ['name', 'subtitle']);

    if (raw.mark && typeof raw.mark === 'object') {
      v.mark.type = raw.mark.type === 'image' ? 'image' : 'text';
      v.mark.text = str(raw.mark.text).slice(0, 3);
      v.mark.image = str(raw.mark.image);
    }

    if (raw.hero && typeof raw.hero === 'object') {
      v.hero.image = str(raw.hero.image);
      var dim = parseInt(raw.hero.dim, 10);
      v.hero.dim = isNaN(dim) ? 55 : Math.max(0, Math.min(95, dim));
    }

    if (raw.theme && typeof raw.theme === 'object') {
      v.theme.preset = THEMES[raw.theme.preset] ? raw.theme.preset : 'zrnko';
      v.theme.mode = ['auto', 'light', 'dark'].indexOf(raw.theme.mode) >= 0 ? raw.theme.mode : 'auto';
      v.theme.font = FONTS[raw.theme.font] ? raw.theme.font : 'grotesk';
      v.theme.accent = hex(raw.theme.accent);
      v.theme.deep = hex(raw.theme.deep);
    }

    if (raw.hours && typeof raw.hours === 'object') {
      v.hours.enabled = raw.hours.enabled !== false;
      v.hours.tz = str(raw.hours.tz) || 'Europe/Bratislava';
      v.hours.note = str(raw.hours.note);
      if (Array.isArray(raw.hours.days)) {
        for (var d = 0; d < 7; d++) {
          var src = raw.hours.days[d];
          if (!src || typeof src !== 'object') continue;
          var ranges = [];
          if (Array.isArray(src.ranges)) {
            src.ranges.forEach(function (r) {
              if (Array.isArray(r) && r.length === 2 && isTime(r[0]) && isTime(r[1])) {
                ranges.push([r[0], r[1]]);
              }
            });
          }
          v.hours.days[d] = {
            closed: !!src.closed || ranges.length === 0,
            ranges: ranges.length ? ranges : [['09:00', '17:00']]
          };
        }
      }
      if (Array.isArray(raw.hours.seasons)) {
        v.hours.seasons = raw.hours.seasons.map(normalizeSeason).filter(Boolean);
      }
      if (Array.isArray(raw.hours.exceptions)) {
        v.hours.exceptions = raw.hours.exceptions.map(normalizeException).filter(Boolean);
      }
    }

    if (raw.primary && typeof raw.primary === 'object') {
      v.primary.enabled = !!raw.primary.enabled;
      v.primary.type = TILE_BY_ID[raw.primary.type] ? raw.primary.type : 'google-review';
      v.primary.title = str(raw.primary.title);
      v.primary.note = str(raw.primary.note);
      v.primary.url = str(raw.primary.url);
      v.primary.i18n = normalizeI18n(raw.primary.i18n, ['title', 'note']);
    }

    if (Array.isArray(raw.sections)) {
      v.sections = raw.sections.map(function (s) {
        return {
          title: str(s && s.title),
          layout: (s && s.layout === 'grid') ? 'grid' : 'list',
          tiles: Array.isArray(s && s.tiles) ? s.tiles.map(normalizeTile).filter(Boolean) : [],
          i18n: normalizeI18n(s && s.i18n, ['title'])
        };
      });
    }

    if (raw.contact && typeof raw.contact === 'object') {
      v.contact.phone = str(raw.contact.phone);
      v.contact.email = str(raw.contact.email);
      v.contact.web = str(raw.contact.web);
      v.contact.address = str(raw.contact.address);
      v.contact.org = str(raw.contact.org);
    }

    if (raw.footer && typeof raw.footer === 'object') {
      v.footer.text = str(raw.footer.text);
      v.footer.showBrand = raw.footer.showBrand !== false;
      v.footer.i18n = normalizeI18n(raw.footer.i18n, ['text']);
    }
    if (raw.seo && typeof raw.seo === 'object') {
      v.seo.description = str(raw.seo.description);
      v.seo.i18n = normalizeI18n(raw.seo.i18n, ['description']);
    }

    return v;
  }

  function normalizeRanges(raw) {
    var out = [];
    if (Array.isArray(raw)) {
      raw.forEach(function (r) {
        if (Array.isArray(r) && r.length === 2 && isTime(r[0]) && isTime(r[1])) out.push([r[0], r[1]]);
      });
    }
    return out;
  }

  function normalizeSeason(s) {
    if (!s || typeof s !== 'object') return null;
    var fromMonth = clampInt(s.fromMonth, 1, 12, 1);
    var fromDay = clampInt(s.fromDay, 1, 31, 1);
    var toMonth = clampInt(s.toMonth, 1, 12, 12);
    var toDay = clampInt(s.toDay, 1, 31, 31);
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var src = Array.isArray(s.days) ? s.days[i] : null;
      var ranges = normalizeRanges(src && src.ranges);
      /* Nová sezóna bez vlastných dní nech defaultne nie je zavretá celý
         týždeň — to by správcovi nedávalo zmysel odškrtávať sedemkrát. */
      return { closed: !!(src && src.closed), ranges: ranges.length ? ranges : [['09:00', '17:00']] };
    });
    return {
      id: str(s.id) || ('season-' + Math.random().toString(36).slice(2, 8)),
      label: str(s.label),
      fromMonth: fromMonth, fromDay: fromDay, toMonth: toMonth, toDay: toDay,
      days: days
    };
  }

  function normalizeException(e) {
    if (!e || typeof e !== 'object') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(e.date))) return null;
    var closed = e.closed !== false;
    var ranges = normalizeRanges(e.ranges);
    return {
      date: str(e.date),
      label: str(e.label),
      closed: closed || ranges.length === 0,
      ranges: ranges.length ? ranges : [['09:00', '17:00']]
    };
  }

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeProgramItem(p) {
    if (!p || typeof p !== 'object') return null;
    var title = str(p.title);
    if (!title) return null;
    return {
      day: isDate(p.day) ? p.day : '',
      time: isTime(p.time) ? p.time : '',
      endTime: isTime(p.endTime) ? p.endTime : '',
      title: title,
      stage: str(p.stage),
      note: str(p.note),
      i18n: normalizeI18n(p.i18n, ['title', 'stage', 'note'])
    };
  }

  function normalizeTile(t) {
    if (!t || typeof t !== 'object') return null;
    var def = TILE_BY_ID[t.type] || TILE_BY_ID.custom;
    var images = [];
    if (Array.isArray(t.images)) {
      images = t.images.map(str).filter(Boolean).slice(0, 20);
    }
    return {
      type: def.id,
      title: str(t.title) || def.title || def.label,
      note: str(t.note),
      value: str(t.value !== undefined ? t.value : t.url),
      icon: str(t.icon) || def.icon,
      hidden: !!t.hidden,
      images: images,
      i18n: normalizeI18n(t.i18n, ['title', 'note'])
    };
  }

  /* ---------- Viacjazyčnosť -------------------------------------------
     Preklad sedí priamo pri origináli (pole `i18n` na tom istom objekte),
     nie v oddelenom strome — nič sa nemôže rozísť poradím pri preusporiadaní
     sekcií či dlaždíc. Chýbajúci preklad ticho spadne späť na základný text.
     -------------------------------------------------------------------*/
  var LANG_RE = /^[a-z]{2}$/;
  var LANG_NAMES = {
    en: 'Angličtina', de: 'Nemčina', hu: 'Maďarčina', pl: 'Poľština',
    cs: 'Čeština', uk: 'Ukrajinčina', ru: 'Ruština', it: 'Taliančina',
    fr: 'Francúzština', es: 'Španielčina'
  };

  function normalizeI18n(raw, fields) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (lang) {
      if (!LANG_RE.test(lang)) return;
      var src = raw[lang];
      if (!src || typeof src !== 'object') return;
      var entry = {};
      var any = false;
      fields.forEach(function (f) {
        var val = str(src[f]);
        if (val) { entry[f] = val; any = true; }
      });
      if (any) out[lang] = entry;
    });
    return out;
  }

  /* Vráti preklad poľa `field` na objekte `obj` pre jazyk `lang`, inak
     základnú hodnotu. `lang` prázdne alebo '' = vždy základná hodnota. */
  function tr(obj, field, lang) {
    if (obj && lang && obj.i18n && obj.i18n[lang] && obj.i18n[lang][field]) {
      return obj.i18n[lang][field];
    }
    return (obj && obj[field]) || '';
  }

  /* ---------- Odkaz z dlaždice ---------------------------------------- */
  function tileHref(tile, venue) {
    var def = TILE_BY_ID[tile.type] || TILE_BY_ID.custom;
    var val = (tile.value || '').trim();
    switch (def.kind) {
      case 'tel':
        val = val || (venue && venue.contact.phone) || '';
        return val ? 'tel:' + val.replace(/[^\d+]/g, '') : '';
      case 'mail':
        val = val || (venue && venue.contact.email) || '';
        return val ? 'mailto:' + val : '';
      case 'maps':
        val = val || (venue && venue.contact.address) || '';
        return val ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(val) : '';
      case 'vcard':
        /* Prázdna vizitka nikomu nepomôže — bez kontaktu sa dlaždica
           správa ako nedokončená. */
        if (!venue) return '';
        return (venue.contact.phone || venue.contact.email ||
                venue.contact.web || venue.contact.address) ? '#vcard' : '';
      case 'share':
        return '#share';
      case 'none':
        return '';
      default:
        if (!val) return '';
        if (/^(https?:|mailto:|tel:)/i.test(val)) return val;
        return 'https://' + val.replace(/^\/+/, '');
    }
  }

  /* ---------- Otváracie hodiny ----------------------------------------
     Vracia { open, label, until } podľa aktuálneho času v zóne prevádzky.

     Pre daný dátum sa rozvrh hľadá v poradí: výnimka na presný dátum
     (sviatok, jednorazová zmena) → sezóna, do ktorej dátum spadá (napr.
     letné hodiny) → predvolený týždenný rozvrh `days`. Prvá zhoda vyhráva.
     -------------------------------------------------------------------*/
  function resolveDay(hours, y, m, d, weekdayIdx) {
    var dateStr = pad2(m) === null ? '' : (y + '-' + pad2(m) + '-' + pad2(d));
    for (var i = 0; i < hours.exceptions.length; i++) {
      var ex = hours.exceptions[i];
      if (ex.date === dateStr) {
        return { closed: ex.closed, ranges: ex.ranges, label: ex.label };
      }
    }
    var monthDay = m * 100 + d;
    // Pri prekryve vyhráva neskôr pridaná sezóna — zoznam sa prechádza
    // odzadu, takže vracia prvú zhodu od konca.
    for (var j = hours.seasons.length - 1; j >= 0; j--) {
      var se = hours.seasons[j];
      var from = se.fromMonth * 100 + se.fromDay;
      var to = se.toMonth * 100 + se.toDay;
      var inRange = from <= to ? (monthDay >= from && monthDay <= to) : (monthDay >= from || monthDay <= to);
      if (inRange) {
        var sd = se.days[weekdayIdx];
        return { closed: sd.closed, ranges: sd.ranges, label: se.label };
      }
    }
    var dd = hours.days[weekdayIdx];
    return { closed: dd.closed, ranges: dd.ranges, label: '' };
  }

  function hoursStatus(hours, now) {
    if (!hours || !hours.enabled) return null;
    now = now || new Date();
    var local = zonedParts(now, hours.tz);
    var dayIdx = (local.weekday + 6) % 7;          // Po = 0
    var mins = local.hour * 60 + local.minute;

    /* Interval cez polnoc (napr. piatok 20:00–02:00) patrí včerajšku —
       v sobotu o 01:00 je stále otvorené, aj keď sobota sama má zatvorené.
       Včerajší dátum sa počíta kalendárne, nie odčítaním 24 h, aby zmena
       letného času neposunula deň. */
    var yd = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
    var yIdx = (yd.getUTCDay() + 6) % 7;
    var yesterday = resolveDay(hours, yd.getUTCFullYear(), yd.getUTCMonth() + 1, yd.getUTCDate(), yIdx);
    if (yesterday && !yesterday.closed) {
      for (var y = 0; y < yesterday.ranges.length; y++) {
        var ya = toMin(yesterday.ranges[y][0]);
        var yb = toMin(yesterday.ranges[y][1]);
        if (yb <= ya && mins < yb) {
          return { open: true, label: 'Otvorené', until: yesterday.ranges[y][1], note: yesterday.label };
        }
      }
    }

    var today = resolveDay(hours, local.year, local.month, local.day, dayIdx);
    if (today && !today.closed) {
      for (var i = 0; i < today.ranges.length; i++) {
        var a = toMin(today.ranges[i][0]);
        var b = toMin(today.ranges[i][1]);
        if (b <= a) b += 1440;                      // cez polnoc
        if (mins >= a && mins < b) {
          return { open: true, label: 'Otvorené', until: today.ranges[i][1], note: today.label };
        }
      }
      // Ešte dnes otvoríme?
      for (var j = 0; j < today.ranges.length; j++) {
        if (mins < toMin(today.ranges[j][0])) {
          return { open: false, label: 'Zatvorené', from: today.ranges[j][0], fromDay: 'dnes', note: today.label };
        }
      }
    }
    // Najbližší nasledujúci otvárací deň — hľadá sa dosť dopredu, aby
    // prekryl aj viacdňovú výnimku (napr. celotýždňová dovolenka).
    for (var k = 1; k <= 30; k++) {
      var future = new Date(now.getTime() + k * 86400000);
      var f = zonedParts(future, hours.tz);
      var fIdx = (f.weekday + 6) % 7;
      var d = resolveDay(hours, f.year, f.month, f.day, fIdx);
      if (d && !d.closed && d.ranges.length) {
        return {
          open: false, label: 'Zatvorené',
          from: d.ranges[0][0],
          fromDay: k === 1 ? 'zajtra' : DAY_SHORT[fIdx],
          note: d.label
        };
      }
    }
    return { open: false, label: 'Zatvorené' };
  }

  /* ---------- Stav podujatia ----------------------------------------
     Vracia { phase: 'before'|'during'|'after', label, days } podľa
     dnešného dátumu v zóne Europe/Bratislava. `before` nesie počet dní
     do začiatku.
     -------------------------------------------------------------------*/
  function eventStatus(event, now) {
    if (!event || !event.from) return null;
    now = now || new Date();
    var z = zonedParts(now, 'Europe/Bratislava');
    var today = z.year + '-' + pad2(z.month) + '-' + pad2(z.day);
    var from = event.from;
    var to = event.to || event.from;

    if (today < from) {
      var days = daysBetween(today, from);
      var label = days === 0 ? 'Dnes' : days === 1 ? 'Zajtra' : ('O ' + days + ' ' + dniWord(days));
      return { phase: 'before', label: label, days: days };
    }
    if (today > to) {
      return { phase: 'after', label: 'Skončilo' };
    }
    return { phase: 'during', label: 'Práve prebieha' };
  }

  function daysBetween(a, b) {
    var da = Date.parse(a + 'T00:00:00Z');
    var db = Date.parse(b + 'T00:00:00Z');
    return Math.round((db - da) / 86400000);
  }

  function dniWord(n) {
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return 'deň';
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'dni';
    return 'dní';
  }

  function zonedParts(date, tz) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'Europe/Bratislava',
        year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch (e) {
      fmt = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      });
    }
    var out = { weekday: 0, hour: 0, minute: 0, year: 1970, month: 1, day: 1 };
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    fmt.formatToParts(date).forEach(function (p) {
      if (p.type === 'weekday') out.weekday = map[p.value] || 0;
      else if (p.type === 'hour') out.hour = parseInt(p.value, 10) % 24;
      else if (p.type === 'minute') out.minute = parseInt(p.value, 10);
      else if (p.type === 'year') out.year = parseInt(p.value, 10);
      else if (p.type === 'month') out.month = parseInt(p.value, 10);
      else if (p.type === 'day') out.day = parseInt(p.value, 10);
    });
    return out;
  }

  function pad2(n) { return n == null || isNaN(n) ? null : (n < 10 ? '0' + n : '' + n); }

  /* ---------- Rozvrh aktuálneho týždňa --------------------------------
     Vráti 7 záznamov Po–Ne pre reálne dátumy tohto týždňa (nie len
     abstraktný predvolený rozvrh), takže tabuľka na stránke ukáže aj
     platnú sezónu či výnimku, ak práve teraz nastala.
     -------------------------------------------------------------------*/
  function weekSchedule(hours, now) {
    now = now || new Date();
    var local = zonedParts(now, hours.tz);
    var dayIdx = (local.weekday + 6) % 7;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(now.getTime() + (i - dayIdx) * 86400000);
      var z = zonedParts(d, hours.tz);
      var zIdx = (z.weekday + 6) % 7;
      var resolved = resolveDay(hours, z.year, z.month, z.day, zIdx);
      out.push({ idx: i, isToday: i === dayIdx, closed: resolved.closed, ranges: resolved.ranges, label: resolved.label });
    }
    return out;
  }

  function toMin(t) {
    var p = String(t).split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function isTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t)); }
  function isDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)); }
  function str(x) { return typeof x === 'string' ? x.trim() : (x == null ? '' : String(x).trim()); }
  function hex(x) { return /^#[0-9a-f]{6}$/i.test(String(x || '')) ? String(x) : ''; }

  function slugify(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  /* Slugy, ktoré kolidujú so súbormi alebo cestami inštalácie
     (index.json, admin/, api/…). Rovnaký zoznam drží api/tokens.php —
     server ich odmietne, toto len ušetrí zbytočný pokus. */
  var RESERVED_SLUGS = ['index', 'admin', 'api', 'assets', 'data', 'sw', 'og'];
  function isReservedSlug(slug) { return RESERVED_SLUGS.indexOf(String(slug || '')) !== -1; }

  g.QRSchema = {
    THEMES: THEMES, FONTS: FONTS, TILE_TYPES: TILE_TYPES, TILE_BY_ID: TILE_BY_ID,
    DAY_NAMES: DAY_NAMES, DAY_SHORT: DAY_SHORT,
    blankVenue: blankVenue, normalizeVenue: normalizeVenue, normalizeTile: normalizeTile,
    normalizeSeason: normalizeSeason, normalizeException: normalizeException,
    normalizeProgramItem: normalizeProgramItem,
    normalizeI18n: normalizeI18n, tr: tr, LANG_RE: LANG_RE, LANG_NAMES: LANG_NAMES,
    tileHref: tileHref, hoursStatus: hoursStatus, eventStatus: eventStatus,
    resolveDay: resolveDay, weekSchedule: weekSchedule,
    slugify: slugify, isReservedSlug: isReservedSlug, RESERVED_SLUGS: RESERVED_SLUGS, toMin: toMin
  };
})(typeof window !== 'undefined' ? window : this);
