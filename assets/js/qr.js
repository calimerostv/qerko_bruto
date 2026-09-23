/* ------------------------------------------------------------------
   qr.js — výroba QR kódu k rozcestníku.
   Vektor (SVG) do tlačiarne, rastr (PNG) na web a sociálne siete,
   voliteľne s logom uprostred.
   Závisí na: qrcode.js (Kazuhiko Arase, MIT)
   ------------------------------------------------------------------ */
(function (g) {
  'use strict';

  /* Kód s logom potrebuje najvyššiu úroveň korekcie chýb — vykryté
     jadro sa tak dá dopočítať. Bez loga stačí nižšia, kód je redšie
     a číta sa z väčšej diaľky. */
  function build(text, opts) {
    opts = opts || {};
    var ecc = opts.logo ? 'H' : (opts.ecc || 'M');
    var qr = qrcode(0, ecc);
    qr.addData(text);
    qr.make();
    return qr;
  }

  function moduleMatrix(qr) {
    var n = qr.getModuleCount();
    var rows = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return rows;
  }

  /* Vyčistí stred, aby tam mohlo sadnúť logo. `ratio` je podiel strany. */
  function punchHole(rows, ratio) {
    var n = rows.length;
    var size = Math.floor(n * ratio);
    if (size % 2 !== n % 2) size += 1;
    var from = Math.floor((n - size) / 2);
    for (var r = from; r < from + size; r++) {
      for (var c = from; c < from + size; c++) rows[r][c] = false;
    }
    return { from: from, size: size };
  }

  /* ---------- SVG ------------------------------------------------------
     Jedna cesta pre všetky moduly — malý súbor, ktorý zvládne každý
     grafický program aj tlačiareň.
     -------------------------------------------------------------------*/
  function toSVG(text, opts) {
    opts = opts || {};
    var dark = opts.dark || '#000000';
    var light = opts.light || '#FFFFFF';
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var qr = build(text, opts);
    var rows = moduleMatrix(qr);
    var n = rows.length;
    var hole = opts.logo ? punchHole(rows, opts.logoRatio || 0.24) : null;

    var d = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (rows[r][c]) d.push('M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z');
      }
    }

    var total = n + quiet * 2;
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" width="' + (opts.px || 1024) + '" height="' + (opts.px || 1024) +
      '" shape-rendering="crispEdges" role="img" aria-label="QR kód">');
    if (light !== 'none') {
      parts.push('<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>');
    }
    parts.push('<path fill="' + dark + '" d="' + d.join('') + '"/>');

    if (opts.logo && hole) {
      /* Logo dostane vlastnú podložku, aby ostalo čitateľné aj na
         farebnom kóde. Vloží sa ako <image> s data URI. */
      var pad = 0.6;
      var x = hole.from + quiet - pad;
      var y = hole.from + quiet - pad;
      var s = hole.size + pad * 2;
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s +
        '" rx="' + (s * 0.18) + '" fill="' + (opts.logoBg || light) + '"/>');
      var ins = s * 0.14;
      parts.push('<image href="' + escapeAttr(opts.logo) + '" x="' + (x + ins) + '" y="' + (y + ins) +
        '" width="' + (s - ins * 2) + '" height="' + (s - ins * 2) +
        '" preserveAspectRatio="xMidYMid meet"/>');
    }
    parts.push('</svg>');
    return parts.join('');
  }

  /* ---------- PNG ------------------------------------------------------ */
  function toPNG(text, opts) {
    opts = opts || {};
    var px = opts.px || 1024;
    return new Promise(function (resolve, reject) {
      var svg = toSVG(text, opts);
      var img = new Image();
      var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = px; cv.height = px;
        var ctx = cv.getContext('2d');
        if (opts.light && opts.light !== 'none') {
          ctx.fillStyle = opts.light;
          ctx.fillRect(0, 0, px, px);
        }
        ctx.drawImage(img, 0, 0, px, px);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error('canvas'));
        }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('svg-load')); };
      img.src = url;
    });
  }

  /* ---------- Sťahovanie ------------------------------------------------ */
  function download(blobOrString, filename, mime) {
    var blob = typeof blobOrString === 'string'
      ? new Blob([blobOrString], { type: mime || 'text/plain;charset=utf-8' })
      : blobOrString;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /* ---------- Tlačové formáty ---------------------------------------------
     Štyri veľkosti pre rôzne miesta nasadenia — od plagátu po pásik
     na pokladničný blok. `page` je rozmer @page, `qr` veľkosť kódu,
     zvyšok je typografia primeraná danej veľkosti.
     ---------------------------------------------------------------------*/
  var SHEET_FORMATS = {
    a4: {
      label: 'Hárok A4', page: 'size:A4;margin:16mm', qr: '105mm',
      title: '26pt', text: '12pt', url: '13pt', gapTop: '10mm', gapUrl: '6mm'
    },
    a6: {
      label: 'Stojanček A6', page: 'size:A6;margin:8mm', qr: '55mm',
      title: '15pt', text: '9pt', url: '10pt', gapTop: '5mm', gapUrl: '3mm'
    },
    sticker: {
      label: 'Nálepka na dvere (90×90 mm)', page: 'size:90mm 90mm;margin:6mm', qr: '52mm',
      title: '11pt', text: '7.5pt', url: '8pt', gapTop: '3mm', gapUrl: '2mm'
    },
    strip: {
      label: 'Pásik k pokladni (58×180 mm)', page: 'size:58mm 180mm;margin:5mm', qr: '42mm',
      title: '10pt', text: '7pt', url: '7.5pt', gapTop: '4mm', gapUrl: '2mm'
    }
  };

  function sheetStyle(fmt) {
    var f = SHEET_FORMATS[fmt] || SHEET_FORMATS.a4;
    return '@page{' + f.page + '}' +
      '.sheet{display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'text-align:center;page-break-after:always;break-after:page;padding:2mm}' +
      '.sheet:last-child{page-break-after:auto;break-after:auto}' +
      '.sheet .qr{width:' + f.qr + ';height:' + f.qr + '}' +
      '.sheet .qr svg{width:100%;height:100%}' +
      '.sheet h1{font-size:' + f.title + ';margin:' + f.gapTop + ' 0 1mm;letter-spacing:-.02em;line-height:1.15}' +
      '.sheet p{margin:0;font-size:' + f.text + ';color:#555}' +
      '.sheet .u{margin-top:' + f.gapUrl + ';font-family:ui-monospace,monospace;font-size:' + f.url + ';color:#111}' +
      '.sheet .cta{margin-top:1.5mm;font-size:calc(' + f.text + ' - 1pt);color:#555}';
  }

  function sheetBlock(o) {
    var svg = toSVG(o.url, { dark: o.dark, light: '#FFFFFF', logo: o.logo, logoRatio: o.logoRatio, px: 900 });
    return '<div class="sheet">' +
      '<div class="qr">' + svg + '</div>' +
      '<h1>' + esc(o.name) + '</h1>' +
      (o.subtitle ? '<p>' + esc(o.subtitle) + '</p>' : '') +
      '<div class="u">' + esc(o.url.replace(/^https?:\/\//, '')) + '</div>' +
      '<div class="cta">' + esc(o.cta || 'Naskenujte telefónom') + '</div>' +
      '</div>';
  }

  /* Jedna prevádzka — hárok podľa zvoleného formátu. Otvorí rovno
     tlačový dialóg. */
  function printSheet(o) {
    var w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(
      '<!doctype html><html lang="sk"><head><meta charset="utf-8">' +
      '<title>' + esc(o.name) + ' — QR</title><style>' +
      'body{margin:0;font-family:system-ui,sans-serif;color:#111;min-height:100vh}' +
      sheetStyle(o.format) +
      '</style></head><body>' + sheetBlock(o) + '</body></html>'
    );
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 350);
    return true;
  }

  /* Hromadná tlač — všetky prevádzky naraz, jeden hárok na stránku,
     jeden tlačový dialóg namiesto sťahovania po jednej. */
  function printBulkSheet(items, opts) {
    opts = opts || {};
    if (!items.length) return false;
    var w = window.open('', '_blank');
    if (!w) return false;
    var blocks = items.map(function (o) {
      return sheetBlock(Object.assign({}, o, { dark: opts.dark, logo: opts.logo, logoRatio: opts.logoRatio, cta: opts.cta }));
    }).join('');
    w.document.write(
      '<!doctype html><html lang="sk"><head><meta charset="utf-8">' +
      '<title>QR kódy — všetky prevádzky</title><style>' +
      'body{margin:0;font-family:system-ui,sans-serif;color:#111}' +
      sheetStyle(opts.format) +
      '</style></head><body>' + blocks + '</body></html>'
    );
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 400);
    return true;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

  g.QRCodeGen = {
    toSVG: toSVG,
    toPNG: toPNG,
    download: download,
    printSheet: printSheet,
    printBulkSheet: printBulkSheet,
    SHEET_FORMATS: SHEET_FORMATS
  };
})(typeof window !== 'undefined' ? window : this);
