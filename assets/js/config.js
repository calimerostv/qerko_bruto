/* ------------------------------------------------------------------
   config.js — jediný súbor, ktorý sa upravuje pri nasadení.
   Zvyšok kódu sa nemusí meniť medzi doménami ani hostingmi.
   ------------------------------------------------------------------ */
window.QR_CONFIG = {

  /* Názov v päte stránok a v administrácii. */
  brand: 'qr.bruto.sk',
  brandLine: 'Bruto s.r.o.',

  /* Jediná prevádzka — koreň domény ňou rovno prejde, bez /bruto. */
  defaultSlug: 'bruto',

  /* Kde ležia dátové súbory (relatívne ku koreňu inštalácie). */
  dataDir: 'data/',

  /* Ako administrácia ukladá zmeny. Zapnuté sú všetky dostupné cesty,
     používateľ si v administrácii vyberie tú, ktorá na danom hostingu
     funguje. Ak niektorú nechceš, nastav ju na null.  */
  storage: {

    /* 1) Stiahnutie súboru — funguje vždy a všade, aj bez servera.
          Súbor sa nahrá na hosting ručne (FTP alebo git commit). */
    download: true,

    /* 2) PHP endpoint — klasický doménový hosting s PHP.
          Heslo sa nastavuje v api/config.php, nie tu. */
    php: 'api/save.php',

    /* 3) GitHub API — commit priamo do repozitára.
          Funguje aj na Verceli a GitHub Pages, kde je disk len na čítanie.
          Token zadáva správca v administrácii, tu sa neukladá. */
    github: {
      owner: 'calimerostv',
      repo: 'qerko_bruto',
      branch: 'main',
      path: 'data'
    }
  }
};
