# Personvern i Ting

Oppdatert: 09.10.26

Det du legger inn, lagres kryptert på enheten din.

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
- **Oppslag av bøker:** ISBN-nummeret sendes til Nasjonalbiblioteket eller Open
  Library når du skanner eller skriver ISBN i en kategori for bøker, og boka
  ikke finnes i registeret fra før. De ser IP-adressen din.

Appen ligger på GitHub Pages. GitHub ser IP-adressen din når appen lastes ned
eller oppdateres, og når appen laster ned modellene som leser kvitteringer.

## Rettighetene dine

Dataene ligger bare hos deg, så du bestemmer over dem selv:

- **Se:** Alt står i appen.
- **Hente ut:** Last ned CSV eller en sikkerhetskopi under Innstillinger.
- **Slette:** Slett ting i appen. Slett nettstedsdataene i nettleseren for å
  fjerne alt fra enheten.

Det finnes ingen kopi utenfor enhetene og filene dine, så ingen andre kan se,
endre eller slette dataene.

Har du spørsmål, skriv til hei@tazk.no. Den tekniske beskrivelsen av
sikkerheten står i [SECURITY.md](SECURITY.md) (engelsk).
