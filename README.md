# Ting

Holder oversikt over det du eier, og hvor det er. En PWA som virker uten nett og lagrer alt lokalt i nettleseren. Ingen konto, ingen sky, ingen sporing.

## MVP

- Oversikt: søk som tåler skrivefeil, med operatorer som `komfort<0`, `-sommer` og `has:bilde`. Velg ting og last ned CSV eller skriv ut en rapport
- Legg til og endre: rediger mange ting samtidig i en tabell, med egenskaper som kolonner
- Egen side for hver ting, med bilde og full spesifikasjonsliste
- Lagring: koble appen til en mappe på disk (Chrome og Edge), eller last ned og gjenopprett en kopi

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

## Lagring

Alt lagres i nettleseren på enheten. Koble appen til en mappe under «Lagring», så skriver appen `ting.json` og bildene dit hver gang du lagrer. Kopier mappen når du vil ta vare på alt. Safari kan ikke koble til mapper. Der bruker du «Last ned kopi».

## Lisens

Ikonene i appen er hentet fra Google Material Icons, og appikonet bruker symbolet «inventory» fra Material Symbols (begge Apache 2.0).
