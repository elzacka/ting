# Ting

Et register over det du eier, og hvor du har det: Innbo, utstyr og andre eiendeler, med egenskaper, bilder og en rapport til forsikringen. En PWA som virker uten nett og lagrer alt kryptert i nettleseren. Ingen konto, ingen sky, ingen sporing, ingen KI.

**Appen:** https://elzacka.github.io/ting/

| Dokument | For |
|---|---|
| [BRUKERVEILEDNING.md](BRUKERVEILEDNING.md) | Deg som bruker appen: Fra første gang til rapporten, søk, egenskaper, innstillinger, personvern og hva du gjør når noe går galt |
| [SECURITY.md](SECURITY.md) | Trusselmodellen og tiltakene, punkt for punkt mot OWASP Top 10 (engelsk) |
| [CLAUDE.md](CLAUDE.md) | Deg som endrer koden: Struktur, datamodell, kryptering og konvensjoner (engelsk) |

## Det appen gjør

| | |
|---|---|
| Én tabell | Egenskaper som kolonner, du bestemmer hvilke. Rediger i cellene, lim inn fra et regneark, søk med operatorer, filtrer med antall |
| Én side per ting | Bilde og alle verdier, hver av dem redigerbar der den står |
| Mobil | Søk og liste, og «Legg til ting» med kamera, strekkode og oppslag av navn for bøker og varer, én ting om gangen |
| Rapport | Utskrift eller PDF med valgte kolonner, eller CSV |
| Ta vare på alt | Mappe på maskinen som holdes oppdatert (Chrome og Edge), eller en kryptert sikkerhetskopi |

Alt er kryptert på enheten med et passord du velger. Det eneste som noen gang forlater enheten, er sifrene i en strekkode når du selv trykker på «Slå opp på nett». Detaljene står i brukerveiledningen under [Personvern](BRUKERVEILEDNING.md#personvern).

## Kjør lokalt

```bash
npm install
npm run dev
```

Åpne `http://localhost:5173`. Også her kan du installere appen fra adressefeltet i Chrome.

| Kommando | Gjør |
|---|---|
| `npm run dev` | Utviklingsserver på 5173 |
| `npm run build` | Typesjekk og produksjonsbygg til `dist/` |
| `npm run preview` | Serverer `dist/` |
| `npm test` | Enhetstester |

## Publisering

Hver push til `main` bygger og publiserer automatisk til GitHub Pages via `.github/workflows/deploy-pages.yml`. Første gang: Gå til Settings, Pages i repoet og velg «GitHub Actions» som kilde. `.github/workflows/ci.yml` kjører tester og bygg på pull requests.

## Lisens

Alle ikonene i appen, og appikonet med symbolet «inventory», er hentet fra Google Material Symbols (Apache 2.0).
