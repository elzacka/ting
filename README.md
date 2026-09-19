# Ting

Holder oversikt over det du eier, og hvor det er. Offline-først PWA som lagrer alt lokalt i nettleseren. Ingen konto, ingen sky, ingen sporing.

## MVP

- Oversikt: søk med skrivefeil-toleranse og operatorer som `komfort<0`, `-sommer`, `has:bilde`. Velg ting og last ned CSV eller skriv ut rapport
- Legg til og endre: rediger mange ting samtidig i en tabell, med egenskaper som kolonner
- Detaljside per ting med bilde og full spesifikasjonsliste
- Lagring: koble appen til en mappe på disk (Chrome og Edge), eller last ned og gjenopprett en kopi

**Appen ligger her:** https://elzacka.github.io/ting/

## Installer som app

| Enhet | Slik |
|---|---|
| Mac eller PC med Chrome eller Edge | Åpne adressen over. Klikk installer-ikonet til høyre i adressefeltet, eller «Installer» i varselet i appen |
| Mac med Safari | Åpne adressen. Del-ikonet i verktøylinjen, «Legg til i Dock» |
| iPhone eller iPad | Åpne adressen i Safari. Del-ikonet, «Legg til på Hjem-skjerm» |
| Android | Åpne adressen i Chrome. «Installer» i varselet, eller menyen, «Installer app» |

Installert app får eget vindu og ikon, starter uten adressefelt og beholder dataene sine trygt.

## Kjør lokalt

```bash
npm install
npm run dev
```

Åpne `http://localhost:5173`. Også her tilbyr Chrome installering fra adressefeltet.

## Publisering

Push til `main` bygger og publiserer automatisk til GitHub Pages via `.github/workflows/deploy-pages.yml`. Første gang: under Settings, Pages i repoet, velg «GitHub Actions» som kilde.

## Lagring

Alt ligger i nettleseren på enheten. Koble appen til en mappe under «Lagring», så skrives `ting.json` og bildene dit hver gang du lagrer. Kopier mappen når du vil ta vare på alt. I Safari, som ikke kan koble til mapper, bruker du «Last ned kopi».

## Lisens

Ikonene i appen er hentet fra Google Material Icons, og appikonet bruker symbolet «inventory» fra Material Symbols (begge Apache 2.0).
