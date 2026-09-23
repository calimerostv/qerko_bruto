/* ------------------------------------------------------------------
   Generátor assets/js/icons.js.

     node tools/build-icons.js

   Stiahne značky zo Simple Icons (CC0) a glyfy rozhrania z Lucide (ISC),
   pridá vlastné ikony zo zoznamu CUSTOM a všetko zapíše do jedného
   súboru, aby stránka nebola závislá na CDN.

   Ikony sa pridávajú tu, nie ručne vo vygenerovanom súbore.
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

/* Značky — v katalógu dlaždíc majú predponu "b:". */
const BRANDS = [
  'facebook', 'instagram', 'youtube', 'tiktok', 'whatsapp', 'googlemaps',
  'spotify', 'linkedin', 'x', 'threads', 'telegram', 'messenger'
];

/* Glyfy rozhrania. */
const UI = [
  'phone', 'mail', 'globe', 'clock', 'map-pin', 'ticket', 'utensils',
  'share-2', 'download', 'star', 'calendar', 'image', 'info', 'navigation',
  'wifi', 'car', 'accessibility', 'banknote', 'users', 'external-link',
  'link', 'chevron-right', 'x', 'plus', 'trash-2', 'copy', 'check',
  'pencil', 'eye', 'search', 'grip-vertical', 'upload', 'printer',
  'palette', 'layout-grid', 'arrow-left', 'settings'
];

/* Vlastné ikony. Plná hviezdička pochádza z pôvodného návrhu Ťapky —
   Lucide má len obrysovú, ktorá na tlačidle recenzie nevyzerá dobre. */
const CUSTOM = {
  'star-filled': {
    k: 'fill',
    v: '0 0 24 24',
    d: '<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"/>'
  }
};

const SI = (n) => `https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${n}.svg`;
const LU = (n) => `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${n}.svg`;

async function grab(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

/* Zo stiahnutého SVG nás zaujíma len viewBox a vnútro. */
function strip(svg) {
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 24 24';
  const inner = svg
    .replace(/[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { viewBox, inner };
}

async function main() {
  const icons = {};

  for (const name of BRANDS) {
    const { viewBox, inner } = strip(await grab(SI(name)));
    icons['b:' + name] = { k: 'fill', v: viewBox, d: inner };
    process.stdout.write('.');
  }
  for (const name of UI) {
    const { viewBox, inner } = strip(await grab(LU(name)));
    icons[name] = { k: 'stroke', v: viewBox, d: inner };
    process.stdout.write('.');
  }
  Object.assign(icons, CUSTOM);
  process.stdout.write('\n');

  const out = `/* Automaticky vygenerované — needitovať ručne.
   Nové ikony pridávaj v tools/build-icons.js a spusti:
     node tools/build-icons.js

   Značky (b:*) zo Simple Icons — CC0 1.0
   Glyfy rozhrania z Lucide — ISC License */
(function (g) {
  var ICONS = ${JSON.stringify(icons)};
  g.QRIcons = {
    has: function (n) { return Object.prototype.hasOwnProperty.call(ICONS, n); },
    names: function () { return Object.keys(ICONS); },
    svg: function (n, cls) {
      var i = ICONS[n] || ICONS['link'];
      var a = i.k === 'stroke'
        ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        : 'fill="currentColor"';
      return '<svg viewBox="' + i.v + '" ' + a + ' aria-hidden="true" focusable="false"' +
        (cls ? ' class="' + cls + '"' : '') + '>' + i.d + '</svg>';
    }
  };
})(typeof window !== 'undefined' ? window : this);
`;

  const target = path.resolve(__dirname, '../assets/js/icons.js');
  fs.writeFileSync(target, out);
  console.log(`${Object.keys(icons).length} ikon → ${path.relative(process.cwd(), target)}`);
}

main().catch((e) => {
  console.error('Zlyhalo:', e.message);
  process.exit(1);
});
