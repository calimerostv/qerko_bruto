/* ------------------------------------------------------------------
   Vývojový server. Napodobňuje prepis adries, ktorý na ostro robí
   .htaccess (Apache) alebo vercel.json (Vercel), takže /bruto
   funguje aj lokálne.

     node tools/dev-server.js [port]

   Počúva len na 127.0.0.1 a servíruje výhradne statické súbory
   z povolených priečinkov. PHP nespúšťa — api/*.php sa tu netestuje —
   a nikdy ich neodošle ako text (config.php by inak prezradil hash).
   ------------------------------------------------------------------ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 4173;
const HOST = '127.0.0.1';

/* Čo sa smie servírovať: koreňové statické súbory a tri priečinky.
   Všetko ostatné (tools/, .git/, .backups/, PHP) dostane 404. */
const ROOT_FILES = ['/index.html', '/sw.js', '/robots.txt', '/manifest.webmanifest'];
const ALLOWED_DIRS = /^\/(assets|data|admin)\//;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // Cesta sa nesmie vymaniť z koreňa projektu — kontrola na hranici
  // priečinka (ROOT + separator), nie len na prefixe reťazca.
  let file = path.normalize(path.join(ROOT, url));
  let rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
    // `rel`/`hidden`/`relUrl` musia sedieť na súbor, ktorý sa naozaj
    // pošle — inak napr. /admin/ prejde nižšie kontrolou pre "/admin"
    // (bez koncového /index.html), ALLOWED_DIRS aj ROOT_FILES ju
    // odmietnu a požiadavka tíško spadne do SPA prepisu, ktorý namiesto
    // administrácie vráti verejný index.html.
    rel = path.relative(ROOT, file);
  }

  let ext = path.extname(file).toLowerCase();
  const relUrl = '/' + rel.split(path.sep).join('/');
  const hidden = rel.split(path.sep).some((seg) => seg.startsWith('.'));
  const allowed = !hidden && ext !== '.php' &&
    (ALLOWED_DIRS.test(relUrl) || ROOT_FILES.includes(relUrl) ||
     (url === '/' || url.endsWith('/')) && relUrl.endsWith('/index.html'));

  if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Skutočné priečinky a PHP musia vracať 404, inak by sa chýbajúci
    // dátový súbor tváril ako stránka a chyby by sa schovali.
    if (/^\/(data|assets|api|tools)\//.test(url) || ext === '.php' || hidden) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
      return;
    }
    // Prepis: /bruto → index.html
    file = path.join(ROOT, 'index.html');
    ext = '.html';
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  console.log('Rozcestníky bežia na http://localhost:' + PORT + ' (len tento počítač, bez PHP API)');
  console.log('  zoznam:        http://localhost:' + PORT + '/');
  console.log('  prevádzka:     http://localhost:' + PORT + '/bruto');
  console.log('  administrácia: http://localhost:' + PORT + '/admin/');
});
