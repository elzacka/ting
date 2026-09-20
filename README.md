# Ting

Et register over det du eier, og hvor du har det: Innbo, utstyr og andre eiendeler, med egenskaper, bilder og en rapport til forsikringen. En PWA som virker uten nett og lagrer alt lokalt i nettleseren. Ingen konto, ingen sky, ingen sporing. Du slipper å registrere noe på nytt: Appen kan speile alt til en mappe på maskinen og lage en sikkerhetskopi du henter inn igjen, også etter at nettleserdata er slettet eller på en ny enhet.

## MVP

- Ett skjermbilde: Øverst hvor mange ting du har, samlet pris og hva som mangler bilde eller pris. Under: Én tabell med egenskaper som kolonner. Smart søk og filtrering: Søket tåler skrivefeil og forstår operatorer som `komfort<0`, `-sommer` og `has:bilde`; filtrene viser antall per verdi. Blyanten i topplinja gjør tabellen redigerbar: Legg til ting og egenskaper, endre mange ting samtidig. Velg ting og last ned CSV eller skriv ut en rapport
- Egen side for hver ting, med bilde og alle egenskaper
- Innstillinger: Koble appen til en mappe på maskinen (Chrome og Edge), eller last ned og gjenopprett en sikkerhetskopi

**Appen ligger her:** https://elzacka.github.io/ting/

## Installer som app

| Enhet | Slik |
|---|---|
| Mac eller PC med Chrome eller Edge | Åpne adressen over. Klikk på installeringsikonet til høyre i adressefeltet, eller på «Installer» i varselet i appen |
| Mac med Safari | Åpne adressen. Klikk på Del-ikonet i verktøylinjen og velg «Legg til i Dock» |
| iPhone eller iPad | Åpne adressen i Safari. Trykk på Del-ikonet og velg «Legg til på Hjem-skjerm» |
| Android | Åpne adressen i Chrome. Trykk på «Installer» i varselet, eller velg «Installer app» i menyen |

En installert app får eget vindu og ikon, starter uten adressefelt og tar vare på dataene.

## Ta vare på alt

Alt ligger kryptert i nettleseren på enheten. Sletter du nettleserdata, rydder Safari bort en app du ikke har brukt på en stund, eller mister du enheten, er det borte derfra. Derfor kan du ta vare på alt på to måter, begge under Innstillinger:

| Måte | Slik | Passer når |
|---|---|---|
| Mappe på maskinen, automatisk | Koble appen til en mappe (Chrome og Edge). Appen skriver `ting.json` og bildene dit hver gang du lagrer, og leser dem inn igjen når du åpner appen. Har både mappen og nettleseren ting fra før, spør appen hva du vil beholde. Stopper lagringen til mappen, blir Innstillinger-ikonet brunt | Du vil ha en oppdatert kopi utenfor nettleseren uten å tenke på det |
| Sikkerhetskopi, manuelt | Last ned én fil med alt. Hent den inn igjen med «Gjenopprett fra sikkerhetskopi» | En kopi å legge et trygt sted, flytting til en annen enhet, eller Safari, som ikke kan koble til mapper |

Begge tar med alle ting, egenskaper, bilder og kolonneinnstillinger.

Mappen og kopiene er kryptert med passordet ditt og åpnes på enhver enhet der du skriver det inn. Det eneste du ikke må miste, er passordet.

Velg en tom mappe: Appen rydder selv i undermappen `bilder`. Deler flere enheter én mappe, bruk den fra én enhet om gangen; den nyeste lagringen vinner, ingenting flettes.

## Rapport

Under Oversikt lager du en liste over det du eier, til forsikringen eller for å dele: Som regneark (CSV) eller som utskrift og PDF. Huk av ting for å ta med bare noen. Rapporten er ikke en sikkerhetskopi: Den er ukryptert og kan ikke hentes inn igjen.

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
| Datoer | Når en ting ble opprettet, ligger i `ting.json` og i CSV, men vises ikke i appen |
| Passordet | Minst 12 tegn. Bruk gjerne en setning. Det låser alt du registrerer, på enheten og i alle kopier |
| Åpning | Appen åpner alltid låst. Hengelåsen i topplinja sletter nøkkelen fra minnet. Blyanten ved siden av er noe annet: Appen åpner låst for redigering, blyanten åpner for det til du låser igjen eller lukker appen |
| Automatisk lås | Etter 10 minutter uten aktivitet, men ikke mens du har endringer som ikke er lagret. Kan slås av under Innstillinger |
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
| Valgliste | Velg blant verdiene som finnes, eller skriv en ny. Alternativene du oppgir når du lager egenskapen, skilles med komma; verdier som allerede er brukt, kommer i tillegg |
| Tall | Skriv bare tallet, `1250` og ikke `1250 gram`. Enheten gjelder hele kolonnen |
| Dato | Skriv `19.09.26` |

## Innstillinger

Ikonet lengst til høyre i topplinja.

| Valg | Slik |
|---|---|
| Mappe på maskinen | Koble til eller fra. Se «Ta vare på alt» over |
| Sikkerhetskopi | Last ned eller gjenopprett. Se «Ta vare på alt» over |
| Automatisk lås | Slå den av eller på |
| Passord | Bytt passord |

## Lisens

Ikonene i appen er hentet fra Google Material Icons, og appikonet bruker symbolet «inventory» fra Material Symbols (begge Apache 2.0).
