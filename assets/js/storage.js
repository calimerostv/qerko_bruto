/* ------------------------------------------------------------------
   storage.js — kam administrácia ukladá dáta.
   Tri vymeniteľné cesty, pretože ten istý projekt má bežať aj na
   klasickom doménovom hostingu, aj na Verceli, aj na GitHub Pages:

     download  vždy dostupná, súbor sa nahrá ručne
     php       doménový hosting s PHP, zapisuje priamo do data/
     github    commit cez GitHub API — jediná cesta tam, kde je
               disk len na čítanie (Vercel, Pages)

   Každý adaptér má rovnaké rozhranie: available(), save(files, secret,
   opts), test(). `files` je pole { path, content } relatívne k dátovému
   priečinku. `opts.index` je zmena zoznamu prevádzok ({ upsert: entry }
   alebo { remove: slug }) — PHP adaptér ju posiela serveru, ktorý si
   index.json zlúči sám; download a github nemajú kde zlučovať, tie
   zapíšu celý index.json z `files` tak, ako ho poskladala administrácia.
   ------------------------------------------------------------------ */
(function (g) {
  'use strict';

  var CFG = (g.QR_CONFIG || {});
  var ST = CFG.storage || {};
  var DATA = CFG.dataDir || 'data/';

  /* ---------- Čítanie (rovnaké pre všetky adaptéry) -------------------- */

  /* Prázdny zoznam je len pri 404 (index ešte nevznikol). Výpadok siete
     alebo chyba servera sa hlási ďalej — inak by sa po nej uložil
     "prázdny" zoznam a všetky prevádzky by zo zoznamu zmizli. */
  function readIndex() {
    return fetch(DATA + 'index.json?v=' + Date.now())
      .then(function (r) {
        if (r.status === 404) return { venues: [] };
        if (!r.ok) throw new Error('Zoznam prevádzok sa nepodarilo načítať (HTTP ' + r.status + ').');
        return r.json();
      });
  }

  /* Hash načítaného obsahu si pamätáme podľa názvu súboru — pri
     ukladaní ide serveru ako "base", aby spoznal, že medzitým niekto
     iný súbor zmenil (409). */
  var hashes = {};

  function readVenue(path) {
    return fetch(DATA + path + '?v=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('notfound');
        return r.text();
      })
      .then(function (text) {
        var data = JSON.parse(text);
        return sha256(text).then(function (h) {
          hashes[path] = h;
          return data;
        });
      });
  }

  function sha256(text) {
    if (!(g.crypto && g.crypto.subtle)) return Promise.resolve(null);
    return g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      })
      .catch(function () { return null; });
  }

  /* ---------- 1) Stiahnutie súborov ------------------------------------ */
  var downloadAdapter = {
    id: 'download',
    label: 'Stiahnuť súbory',
    hint: 'Funguje vždy. Stiahnuté JSON súbory nahráte do priečinka ' +
          DATA + ' cez FTP alebo ich commitnete do repozitára.',
    needsSecret: false,
    available: function () { return ST.download !== false; },
    test: function () { return Promise.resolve({ ok: true, message: 'Sťahovanie je vždy k dispozícii.' }); },
    save: function (files) {
      files.forEach(function (f, i) {
        // Prehliadače blokujú dávku stiahnutí naraz — rozostupy to riešia.
        setTimeout(function () {
          var blob = new Blob([f.content], { type: 'application/json;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = f.path;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        }, i * 400);
      });
      return Promise.resolve({
        ok: true,
        message: 'Stiahnuté: ' + files.map(function (f) { return f.path; }).join(', ') +
                 '. Nahrajte ich do priečinka ' + DATA + '.'
      });
    }
  };

  /* ---------- 2) PHP endpoint ------------------------------------------ */
  var phpAdapter = {
    id: 'php',
    label: 'Uložiť na hosting (PHP)',
    hint: 'Pre doménový hosting s PHP. Heslo sa nastavuje v api/config.php.',
    needsSecret: true,
    secretLabel: 'Heslo administrácie',
    available: function () { return !!ST.php; },
    test: function (secret) {
      return fetch(ST.php, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: 'ping' }, authField(secret)))
      })
        .then(readJson)
        .then(function (j) {
          if (j.ok) return { ok: true, message: 'Spojenie funguje, priečinok je zapisovateľný.' };
          throw new Error(j.error || 'Neznáma chyba');
        });
    },
    save: function (files, secret, opts) {
      opts = opts || {};
      /* index.json server skladá sám z opts.index — celý zoznam z klienta
         by prepísal, čo medzitým uložil niekto iný. */
      var own = files.filter(function (f) { return f.path !== 'index.json'; }).map(function (f) {
        var out = { path: f.path, content: f.content };
        var base = hashes[f.path];
        // '' = súbor podľa klienta ešte neexistuje (nová prevádzka)
        if (base !== null) out.base = base === undefined ? '' : base;
        return out;
      });
      var body = Object.assign({ action: 'save', files: own }, authField(secret));
      if (opts.index) body.index = opts.index;
      if (opts.force) body.force = true;

      return fetch(ST.php, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(readJson)
        .then(function (j) {
          if (j.ok) {
            Object.keys(j.hashes || {}).forEach(function (p) { hashes[p] = j.hashes[p]; });
            return { ok: true, message: 'Uložené na hosting (' + j.written + ' súbory).', index: j.index || null };
          }
          var err = new Error(j.error || 'Uloženie zlyhalo');
          err.conflict = !!j.conflict;
          throw err;
        });
    }
  };

  /* `secret` je buď obyčajné master heslo (reťazec, spätná
     kompatibilita), alebo { token } z prihlásenia cez api/auth.php
     (master aj jednotlivá prevádzka). */
  function authField(secret) {
    if (secret && typeof secret === 'object' && secret.token) return { token: secret.token };
    return { password: secret || '' };
  }

  /* ---------- 3) GitHub API -------------------------------------------- */
  var githubAdapter = {
    id: 'github',
    label: 'Commitnúť do GitHubu',
    hint: 'Pre Vercel a GitHub Pages. Potrebný je token s právom zápisu ' +
          '(Fine-grained token → Contents: Read and write).',
    needsSecret: true,
    secretLabel: 'GitHub token',
    available: function () { return !!(ST.github && ST.github.owner && ST.github.repo); },

    test: function (token) {
      return gh('', token).then(function (r) {
        if (r.ok) return { ok: true, message: 'Prístup do repozitára je v poriadku.' };
        return r.json().then(function (j) { throw new Error(j.message || 'HTTP ' + r.status); });
      });
    },

    save: function (files, token) {
      /* Súbory ukladáme po jednom cez Contents API. Je ich pár, takže
         zložitejšia cesta cez Git trees by tu nič nepriniesla. */
      var done = 0;
      return files.reduce(function (chain, f) {
        return chain.then(function () {
          return putFile(f, token).then(function () { done++; });
        });
      }, Promise.resolve()).then(function () {
        return {
          ok: true,
          message: 'Commitnuté do ' + ST.github.owner + '/' + ST.github.repo +
                   ' (' + done + ' súbory). Nasadenie prebehne automaticky.'
        };
      });
    }
  };

  function ghPath(name) {
    var base = (ST.github.path || 'data').replace(/^\/+|\/+$/g, '');
    return base ? base + '/' + name : name;
  }

  function gh(suffix, token, init) {
    var u = 'https://api.github.com/repos/' + ST.github.owner + '/' + ST.github.repo + suffix;
    init = init || {};
    init.headers = Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, init.headers || {});
    return fetch(u, init);
  }

  function putFile(f, token) {
    var path = ghPath(f.path);
    var branch = ST.github.branch || 'main';
    /* Najprv zistíme sha existujúceho súboru — bez neho GitHub prepis odmietne. */
    return gh('/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(branch), token)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (existing) {
        return gh('/contents/' + encodeURIComponent(path), token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Rozcestník: ' + f.path,
            content: b64(f.content),
            branch: branch,
            sha: existing ? existing.sha : undefined
          })
        });
      })
      .then(function (r) {
        if (r.ok) return true;
        return r.json().then(function (j) {
          throw new Error(f.path + ': ' + (j.message || 'HTTP ' + r.status));
        });
      });
  }

  /* Base64 pre UTF-8 obsah — btoa samo o sebe diakritiku nezvládne. */
  function b64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function readJson(r) {
    return r.text().then(function (t) {
      try { return JSON.parse(t); }
      catch (e) {
        throw new Error('Server odpovedal niečím, čo nie je JSON (HTTP ' + r.status + '). ' +
                        'Skontrolujte, či je PHP na hostingu zapnuté.');
      }
    });
  }

  var ALL = [downloadAdapter, phpAdapter, githubAdapter];

  g.QRStorage = {
    adapters: function () { return ALL.filter(function (a) { return a.available(); }); },
    get: function (id) {
      var found = ALL.filter(function (a) { return a.id === id && a.available(); })[0];
      return found || downloadAdapter;
    },
    readIndex: readIndex,
    readVenue: readVenue,
    forgetHash: function (path) { delete hashes[path]; },
    dataDir: DATA
  };
})(typeof window !== 'undefined' ? window : this);
