# Ting

Holder oversikt over det du eier, og hvor det er. En PWA som virker uten nett og lagrer alt lokalt i nettleseren. Ingen konto, ingen sky, ingen sporing.

## MVP

- Oversikt: Smart søk og filtrering. Søket tåler skrivefeil og forstår operatorer som `komfort<0`, `-sommer` og `has:bilde`. Filtrene under søkefeltet har en nedtrekksmeny per egenskap, med flervalg. Velg ting og last ned CSV eller skriv ut en rapport
- Legg til og endre: Rediger mange ting samtidig i en tabell, med egenskaper som kolonner
- Egen side for hver ting, med bilde og full spesifikasjonsliste
- Innstillinger: Koble appen til en mappe på disk (Chrome og Edge), eller last ned og gjenopprett en kopi

**Appen ligger her:** https://elzacka.github.io/ting/

## Installer som app

| Enhet | Slik |
|---|---|
| Mac eller PC med Chrome eller Edge | Åpne adressen over. Klikk på installeringsikonet til høyre i adressefeltet, eller på «Installer» i varselet i appen |
| Mac med Safari | Åpne adressen. Klikk på Del-ikonet i verktøylinjen og velg «Legg til i Dock» |
| iPhone eller iPad | Åpne adressen i Safari. Trykk på Del-ikonet og velg «Legg til på Hjem-skjerm» |
| Android | Åpne adressen i Chrome. Trykk på «Installer» i varselet, eller velg «Installer app» i menyen |

En installert app får eget vindu og ikon, starter uten adressefelt og tar vare på dataene.

## Kjør lokalt

```bash
npm install
npm run dev
```

Åpne `http://localhost:5173`. Også her kan du installere appen fra adressefeltet i Chrome.

## Publisering

Hver push til `main` bygger og publiserer automatisk til GitHub Pages via `.github/workflows/deploy-pages.yml`. Første gang: Gå til Settings, Pages i repoet og velg «GitHub Actions» som kilde.

## Kryptering

Alt du registrerer krypteres på enheten med et passord du velger første gang du åpner appen.

| Hva | Hvordan |
|---|---|
| Algoritme | AES-256-GCM, innebygd i nettleseren (WebCrypto) |
| Nøkkel | Utledes fra passordet med Argon2id (64 MiB, 3 runder). Passordet lagres ingen steder |
| Hva som er kryptert | Alle ting, egenskaper, feltinnstillinger og bilder i nettleseren, `ting.json` og bildene i mappen, og nedlastede kopier |
| Hva som ikke er kryptert | CSV og utskrift, som du lager for å lese dem. Antall ting og tidspunkt for siste endring |
| Passordet | Minst 12 tegn. Bruk gjerne en setning. Det låser alt du registrerer, på enheten og i alle kopier |
| Åpning | Appen åpner alltid låst. Hengelåsen i topplinja sletter nøkkelen fra minnet. Blyanten ved siden av er noe annet: Slår du den av, kan du bare lese, ikke endre |
| Automatisk lås | Etter ti minutter uten bruk, men ikke mens du har endringer som ikke er lagret. Kan slås av under Innstillinger |
| Bytte passord | Under Innstillinger. Dataene krypteres på nytt. Kopier du tok før byttet, åpnes med det gamle passordet |
| Mister du passordet | Dataene er tapt. Det finnes ingen bakvei |

Ingenting sendes noe sted: appen har ingen server, ingen konto og ingen sporing.

## Sikkerhet

Alt du skriver inn behandles som tekst, aldri som kode. Appen laster ingenting fra andre steder og sender ingenting ut. Passordet lagres og logges aldri. Trusselmodellen og tiltakene, punkt for punkt mot OWASP Top 10, står i `SECURITY.md` (engelsk).

Appen bruker ingen KI.

## Egenskaper

Hver egenskap er en kolonne i tabellen og en linje på tingens side.

| Felttype | Slik |
|---|---|
| Tekst | Fritekst |
| Liste | Velg blant verdiene som finnes, eller skriv en ny. Valgene du oppgir når du lager egenskapen, skilles med komma; verdier som allerede er brukt, kommer i tillegg |
| Tall | Skriv bare tallet, `1250` og ikke `1250 gram`. Enheten gjelder hele kolonnen |
| Dato | Skriv `19.09.26` |

## Innstillinger

Ikonet lengst til høyre i topplinja. Alt lagres i nettleseren på enheten; her kan du i tillegg:

| Valg | Slik |
|---|---|
| Mappe på disk | Koble appen til en mappe (Chrome og Edge), så skriver appen `ting.json` og bildene dit hver gang du lagrer. Kopier mappen når du vil ta vare på alt |
| Kopi | Én fil med alle ting og bilder. Passer som ekstra sikkerhet, eller for å flytte alt til en annen enhet. Safari kan ikke koble til mapper; der er kopien veien |
| Lås | Slå den automatiske låsen av eller på |
| Passord | Bytt passord |

Mappen og kopiene er kryptert og åpnes med passordet ditt, også på en annen enhet.

## Lisens

Ikonene i appen er hentet fra Google Material Icons, og appikonet bruker symbolet «inventory» fra Material Symbols (begge Apache 2.0).
