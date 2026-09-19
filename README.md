# Ting

Holder oversikt over det du eier, og hvor det er. En PWA som virker uten nett og lagrer alt lokalt i nettleseren. Ingen konto, ingen sky, ingen sporing.

## MVP

- Oversikt: Smart søk og filtrering. Søket tåler skrivefeil og forstår operatorer som `komfort<0`, `-sommer` og `has:bilde`. Filtrene under søkefeltet har en nedtrekksmeny per egenskap, med flervalg. Velg ting og last ned CSV eller skriv ut en rapport
- Legg til og endre: Rediger mange ting samtidig i en tabell, med egenskaper som kolonner
- Egen side for hver ting, med bilde og full spesifikasjonsliste
- Lagring: Koble appen til en mappe på disk (Chrome og Edge), eller last ned og gjenopprett en kopi

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
| Åpning | Appen åpner alltid låst. Låseknappen i topplinja sletter nøkkelen fra minnet |
| Mister du passordet | Dataene er tapt. Det finnes ingen bakvei |

Ingenting sendes noe sted: appen har ingen server, ingen konto og ingen sporing.

## Sikkerhet

Alt du skriver inn behandles som tekst, aldri som kode eller instruksjoner. Det gjelder feltene, søk, filer du gjenoppretter og mapper appen leser.

| Risiko | Tiltak |
|---|---|
| Skript via feltinnhold | Appen setter aldri inn HTML fra tekst |
| Formler i CSV | Tekst som begynner med `=`, `+`, `-` eller `@` får en apostrof foran, så regneark ikke kjører den |
| Skadelige filer | Bare bildefiler tas inn som bilder. Filer og mapper valideres mot et fast format før noe lagres |
| Innhold fra nettet | Appen laster ingenting fra andre steder og sender ingenting ut (Content Security Policy) |
| Passord | Lagres og logges aldri. Nøkkelen slettes fra minnet når du låser |

Appen bruker ingen KI. Kommer det en gang en KI-funksjon, skal alt du har registrert fortsatt bare være data for den, aldri instruksjoner, og ingenting sendes ut av enheten uten at du velger det hver gang.

## Lagring

Alt lagres i nettleseren på enheten. Koble appen til en mappe under «Lagring», så skriver appen `ting.json` og bildene dit hver gang du lagrer. Kopier mappen når du vil ta vare på alt. Safari kan ikke koble til mapper. Der bruker du «Last ned kopi». Mappen og kopiene er kryptert og åpnes med passordet ditt, også på en annen enhet.

## Lisens

Ikonene i appen er hentet fra Google Material Icons, og appikonet bruker symbolet «inventory» fra Material Symbols (begge Apache 2.0).
