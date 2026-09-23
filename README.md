# QR rozcestník — Bruto s.r.o.

Jedna stránka, dostupná cez QR kód alebo NFC čip. Zákazník naskenuje kód
a dostane odkazy — web, e-shop, sociálne siete, kontakt — plus prípadné
otváracie hodiny so živým stavom „Otvorené / Zatvorené“.

```
qr.bruto.sk
```

Obsah aj farby sa nastavujú v administrácii na `/admin/`. V kóde nie je
natvrdo ani jeden text ani jedna farba konkrétnej prevádzky — projekt je
klon [qerko.dksered.sk](https://github.com/calimerostv/qr), zúžený na
jednu prevádzku (`data/bruto.json`, koreň domény naň ukazuje priamo cez
`defaultSlug` v `assets/js/config.js`).

---

## Ako je to postavené

Statické HTML, CSS a JavaScript. **Žiadny build, žiadne `npm install`,
žiadny framework.** Priečinok sa nakopíruje na hosting a beží.

Prevádzka je jeden JSON súbor v `data/`. Stránka si ho stiahne
podľa adresy a poskladá sa v prehliadači.

```
index.html            verejná stránka
admin/index.html      administrácia
data/bruto.json       obsah prevádzky
data/index.json       zoznam prevádzok (jedna položka)
assets/js/config.js   jediný súbor na úpravu pri nasadení (branding, ukladanie)
assets/js/schema.js   témy, katalóg dlaždíc, dátová schéma
assets/js/render.js   vykresľovanie (spoločné pre stránku aj náhľad)
assets/js/qr.js       výroba QR kódu (SVG, PNG, hárok A4)
assets/js/storage.js  ukladanie — tri vymeniteľné cesty
api/save.php          zápis na PHP hostingu
api/auth.php          prihlásenie — master heslo alebo účet prevádzky
api/accounts.php      správa účtov prevádzok (len master, MariaDB)
api/stats.php         anonymné denné počítadlá (MariaDB)
api/checklinks.php    kontrola odkazov (len verejné ciele)
.htaccess             prepis adries pre Apache
vercel.json           prepis adries pre Vercel
```

---

## Miestne spustenie

```bash
node tools/dev-server.js
```

Otvorí sa na `http://localhost:4173` (počúva len na `127.0.0.1`).
**PHP nespúšťa** — ukladanie, prihlásenie, štatistiky ani kontrola
odkazov sa ním netestujú; servíruje len `index.html`, `sw.js`,
`assets/`, `data/` a `admin/`. Na test API použite `php -S 127.0.0.1:8080`
z koreňa projektu s vyplneným `api/config.php`.

---

## Nasadenie

Projekt beží na oboch typoch hostingu bez zásahu do kódu. Líši sa iba
spôsob, akým administrácia ukladá zmeny.

### A) Doménový hosting (Apache + PHP)

1. Nahrajte celý priečinok do koreňa domény/subdomény `qr.bruto.sk`.
2. Skopírujte `api/config.example.php` na `api/config.php`.
3. Vygenerujte hash hesla a vložte ho do `api/config.php`:
   ```bash
   php -r "echo password_hash('vase-heslo', PASSWORD_DEFAULT), PHP_EOL;"
   ```
4. Nastavte priečinku `data/` práva na zápis (`755`, na niektorých
   hostingoch `775`).
5. V administrácii zvoľte **Uložiť na hosting (PHP)** a stlačte
   **Overiť spojenie**.

`api/config.php` je v `.gitignore` a `.htaccess` ho blokuje zvonku.

**Štatistický e-mail** (voliteľné): skopírujte `api/mailconfig.example.php`
na `api/mailconfig.php` a doplňte reálny SMTP prístup schránky
`milos@bruto.sk` (alebo inej, ktorú si firma zvolí).

**Účty prevádzok a štatistiky** (voliteľné) potrebujú MariaDB/MySQL:
skopírujte `api/dbconfig.example.php` na `api/dbconfig.php` a vyplňte
prístup. Tabuľky sa založia samy pri prvom použití. Bez `dbconfig.php`
funguje len master heslo a štatistiky sú vypnuté.

**Prihlásenie:** v administrácii sa dá prihlásiť master heslom (prázdny
slug) alebo účtom prevádzky (slug + heslo nastavené masterom v karte
Účty). Prihlásenie vydá token na 14 dní.

### B) Vercel

1. Naimportujte repozitár vo Verceli. Framework: **Other**, build command
   nechajte prázdny, output directory tiež.
2. Vercel má disk len na čítanie, takže PHP zápis tam nefunguje.
   Administrácia preto ukladá **cez GitHub API** — commit do repozitára
   spustí nové nasadenie.
3. Vyrobte si token: GitHub → Settings → Developer settings →
   Fine-grained tokens → repozitár `calimerostv/qerko_bruto` →
   oprávnenie **Contents: Read and write**.
4. V administrácii zvoľte **Commitnúť do GitHubu**, vložte token,
   **Overiť spojenie**.

Token si administrácia môže zapamätať v `localStorage` daného
prehliadača. Do repozitára sa nikdy nedostane.

### Subdoména `qr.bruto.sk`

Subdoménu treba vyrobiť u správcu DNS pre `bruto.sk`, samo nevznikne.

| Kam | Čo nastaviť |
|---|---|
| Vercel | `CNAME` záznam → `cname.vercel-dns.com`, potom vo Verceli *Project → Settings → Domains* pridať doménu |
| Doménový hosting | `A`/`CNAME` záznam na IP hostingu, a v paneli založiť subdoménu s **document rootom presne na priečinok projektu** |

Certifikát vybaví Vercel aj väčšina hostingov sám (Let's Encrypt).

### C) Bez servera

Voľba **Stiahnuť súbory** funguje všade. Administrácia stiahne
`bruto.json` a `index.json`, vy ich nahráte do `data/` cez FTP alebo
commitnete. Hodí sa aj ako záloha.

---

## Po každom nasadení JS/CSS — nezabudnúť na cache-busting

`.htaccess` drží `assets/*.css` a `assets/*.js` v keši prehliadača
**týždeň** (`max-age=604800`). Preto majú `index.html` aj
`admin/index.html` na konci každého odkazu na `assets/js/*` a
`assets/css/*` reťazec `?v=YYYYMMDDx`. **Pri každom nasadení zmeny v JS
alebo CSS treba toto číslo zvýšiť.**

**Zároveň zvýšte `CACHE` a `SHELL` v `sw.js`** na rovnakú hodnotu —
service worker (PWA / „appka na ploche") si inak drží starú verziu
donekonečna.

---

## Nedokončené dlaždice

Dlaždica bez vyplneného odkazu sa na verejnej stránke **nezobrazí vôbec**.
V náhľade administrácie sa takéto dlaždice naopak ukážu prečiarknuto
s popiskou *chýba odkaz*.

---

## Otváracie hodiny

V `data/bruto.json` sú hodiny nastavené Po–Pia 8:00–15:30, So/Ne zatvorené
(potvrdené firmou, [zvazsito.sk/kontakt](https://zvazsito.sk/kontakt/)).

---

## QR kód

- **SVG** — vektor, do tlače. Nerozmaže sa ani na plagáte.
- **PNG 1024 / 2048** — na web a sociálne siete.
- **Hárok A4** — hotová stránka s veľkým kódom, názvom a adresou,
  na stolový stojanček alebo do výlepu.

Vytlačený kód vždy vyskúšajte naskenovať. Kontrast medzi kódom
a pozadím musí byť výrazný.

---

## Zdroje údajov o firme

Obsah `data/bruto.json` bol zostavený z verejne dostupných stránok:

- [bruto.sk](https://bruto.sk/) — popis firmy, história
- [zvazsito.sk/znacka/brutto-s-r-o](https://zvazsito.sk/znacka/brutto-s-r-o/) — e-shop
- [zvazsito.sk/kontakt](https://zvazsito.sk/kontakt/) — adresa predajne (Niklova ul. 4434, Sereď), telefón, e-mail, otváracie hodiny
- [facebook.com/digitalne.vahy](https://www.facebook.com/digitalne.vahy) (stránka „ZvážSiTo") — sociálne siete
- [digitalne-vahy.sk](https://www.digitalne-vahy.sk/) — ďalší obchod firmy
- [avs.bruto.sk](https://avs.bruto.sk/) — automatizované vážiace systémy

Otváracie hodiny (Po–Pia 8:00–15:30) potvrdila firma priamo.

---

## Licencie prevzatého kódu

- QR generátor — Kazuhiko Arase, MIT (`assets/js/qrcode.js`)
- Simple Icons — CC0 1.0
- Lucide — ISC
