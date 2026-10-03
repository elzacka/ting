# Personvern i Ting

Oppdatert: 03.10.26

Det du legger inn, lagres kryptert på enheten din. Du trenger ikke registrere
deg eller logge inn. Data forlater enheten bare når du selv sender dem:
Registeret sendes kryptert med AirDrop til en av enhetene dine, og når du slår
opp en bok, sendes sifrene i ISBN-en til Nasjonalbiblioteket eller Open
Library.

## Det appen lagrer

| Hva | Hvor | Kryptert |
|---|---|---|
| Ting, egenskaper, kategorier, bilder og kvitteringer | I nettleseren på enheten | Ja |
| Kopi i en lagringsmappe, hvis du velger en | Mappen du velger | Ja |
| Sikkerhetskopier og filer du sender til egne enheter | Der du legger dem | Ja |
| Antall ting, når du sist sendte, hentet og endret noe, og en tilfeldig id for enheten | I nettleseren | Nei |
| Hvilke egenskaper du har skjult i tabellen, og bredden på kolonnene | I nettleseren | Ja |
| CSV og utskrift | Der du legger dem | Nei, de er laget for å leses |

Appen krypterer med AES-256-GCM. Nøkkelen kommer fra passordet ditt, og
passordet lagres ingen steder. Dataene kan ikke åpnes hvis du mister passordet.

## Det som forlater enheten

- **«Send til en annen enhet»:** Hele registeret sendes kryptert, bare til
  enheten du velger i AirDrop.
- **«Slå opp på nett»:** Sifrene i en ISBN sendes til Nasjonalbiblioteket eller
  Open Library. De ser også IP-adressen din.

Appen ligger på GitHub Pages. GitHub ser IP-adressen din når appen lastes ned
eller oppdateres, slik alle nettsteder ser den.

## Kvitteringer og KI

Appen leser teksten på kvitteringer på enheten, også uten nett.
Tekstgjenkjenningen er små modeller som kjenner igjen bokstaver og tall
(PP-OCRv5). De lærer ingenting av dataene dine og lager ingen tekst selv.
Appen bruker ingen språkmodell og ingen KI-tjeneste.

Bildet av kvitteringen lagres kryptert sammen med tingene du kjøpte. Teksten
appen leste, lagres ikke. Bare navn, pris, dato og butikk blir med, og du ser
dem før du lagrer.

## Rettighetene dine

Dataene ligger bare hos deg, så du bestemmer over dem selv:

- **Se:** Alt står i appen.
- **Hente ut:** Last ned CSV eller en sikkerhetskopi under Innstillinger.
- **Slette:** Slett ting i appen. Slett nettstedsdataene i nettleseren for å
  fjerne alt fra enheten.

Det finnes ingen kopi utenfor enhetene og filene dine, så ingen andre kan se,
endre eller slette dataene.

Appen bruker ingen informasjonskapsler, ingen analyse og ingen reklame.

Har du spørsmål, skriv til hei@tazk.no. Den tekniske beskrivelsen av
sikkerheten står i [SECURITY.md](SECURITY.md) (engelsk).
