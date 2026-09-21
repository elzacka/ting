# Brukerveiledning for Ting

Ting holder orden på det du eier, og hvor du har det. Alt ligger kryptert på
enheten din. Denne veiledningen tar deg gjennom første gang, og så de
situasjonene du står i etterpå.

**Appen:** https://elzacka.github.io/ting/

## Innhold

- [Første gang](#første-gang)
  - [1. Installer appen](#1-installer-appen)
  - [2. Velg et passord](#2-velg-et-passord)
  - [3. Lag egenskapene dine](#3-lag-egenskapene-dine)
  - [4. Legg til de første tingene](#4-legg-til-de-første-tingene)
  - [5. Ta vare på alt](#5-ta-vare-på-alt)
- [Situasjoner](#situasjoner)
  - [Med kvitteringen foran deg](#med-kvitteringen-foran-deg)
  - [Med tingen i hånden](#med-tingen-i-hånden)
  - [Skanne strekkoden og hente navnet](#skanne-strekkoden-og-hente-navnet)
  - [Finne igjen en ting](#finne-igjen-en-ting)
  - [Rette noe](#rette-noe)
  - [Mange ting på én gang](#mange-ting-på-én-gang)
  - [Rapport til forsikringen](#rapport-til-forsikringen)
  - [Mac og iPhone sammen](#mac-og-iphone-sammen)
- [Oppslagsverk](#oppslagsverk)
  - [Søk](#søk)
  - [Egenskaper](#egenskaper)
  - [Innstillinger](#innstillinger)
- [Hvis noe går galt](#hvis-noe-går-galt)
- [Personvern](#personvern)

---

## Første gang

### 1. Installer appen

Åpne adressen over. Appen virker i nettleseren, men som installert app får den
eget ikon, starter uten adressefelt og tar bedre vare på dataene.

| Enhet | Slik |
|---|---|
| Mac eller PC med Chrome eller Edge | Klikk på installeringsikonet til høyre i adressefeltet |
| Mac med Safari | Del-ikonet i verktøylinjen › «Legg til i Dock» |
| iPhone eller iPad | Åpne adressen i Safari › Del-ikonet › «Legg til på Hjem-skjerm» |
| Android | «Installer» i varselet, eller «Installer app» i menyen |

### 2. Velg et passord

Første gang spør appen etter et passord. Minst 12 tegn: En setning er lettere å
huske enn en kode.

> [!WARNING]
> Passordet er den eneste nøkkelen. Mister du det, er dataene tapt. Det finnes
> ingen bakvei, ingen e-post og ingen konto å be om nytt passord fra.

Appen åpner alltid låst, og låser seg selv etter 10 minutter uten bruk.
Hengelåsen øverst låser med én gang.

### 3. Lag egenskapene dine

En egenskap er en kolonne i tabellen. Bare «Navn» finnes fra start. Trykk på
«Legg til egenskap» og lag de du trenger. Et godt utgangspunkt:

| Egenskap | Felttype | Alternativer eller enhet |
|---|---|---|
| Kategori | Valgliste | Turutstyr, Kjøkken, Klær og sko, Data og kontor |
| Plassering | Valgliste | Leilighet, Loftsbod, Kjellerbod |
| Kjøpesum | Tall | kr |
| Kjøpsdato | Dato | |
| Kommentar | Tekst | |

Alt du senere trenger, lager du på samme måte. Ting har ingen faste felt for
lån, tilstand eller antall: Det er egenskaper, se [Egenskaper](#egenskaper).

> [!TIP]
> Skriv plasseringen som en sti med hele veien inn: «Loftsbod › Hylle 2 ›
> Boks 4». Da finner søket `plassering:loftsbod` alt på loftet, og
> `plassering:"boks 4"` finner boksen.

### 4. Legg til de første tingene

Trykk på «Legg til ting». En ny rad åpner seg i tabellen: Skriv navnet, fyll
det du vet, trykk på «Legg til ting» igjen for neste. «Lagre» nederst lagrer
alle radene på én gang.

Valglister og datoer arver verdien fra raden over. Det du ikke vet ennå, lar du
stå tomt: Linja øverst teller hva som mangler, og ett klikk finner dem igjen.

### 5. Ta vare på alt

Dataene ligger i nettleseren på enheten. Sletter du nettleserdata, eller mister
enheten, er de borte derfra. Velg én av to måter under Innstillinger:

| Måte | Passer når | Slik |
|---|---|---|
| Mappe på maskinen | Du bruker Chrome eller Edge på Mac eller PC og vil ha en kopi som alltid er oppdatert | «Velg mappe». Appen skriver `ting.json` og bildene dit hver gang du lagrer |
| Sikkerhetskopi | Du bruker Safari eller iPhone, eller vil ha en fil å legge et trygt sted | Pil ned laster ned fila. Pil opp henter den inn igjen |

Begge tar med alle ting, egenskaper, bilder og kolonneinnstillinger, er
kryptert med passordet ditt og åpnes på enhver enhet der du skriver det inn.

<details>
<summary>Mer om mappen</summary>

- Velg en tom mappe. Appen rydder selv i undermappen `bilder`.
- Har både mappen og nettleseren ting fra før, spør appen hva du vil beholde.
- Deler flere enheter én mappe, bruk den fra én enhet om gangen. Den nyeste
  lagringen vinner; ingenting flettes.
- Stopper lagringen til mappen, blir Innstillinger-ikonet brunt.

</details>

---

## Situasjoner

### Med kvitteringen foran deg

Ved skrivebordet, flere ting fra samme butikk:

1. «Legg til ting». Skriv navn, pris, butikk og dato på første rad.
2. «Legg til ting» igjen. Butikk, dato og plassering står allerede der; skriv
   navn og pris.
3. Gjenta for hver linje på kvitteringen. «Lagre».

Pris og tekst arves ikke: Hver rad har sin egen.

### Med tingen i hånden

I boden, med mobilen. Under 600 px bred er appen laget for akkurat dette.

1. «Legg til ting» åpner skjermen «Ny ting».
2. «Ta bilde». Kameraet åpner seg direkte.
3. Skriv navnet. Kategori og plassering står igjen fra forrige ting.
4. «Lagre». Skjermen er klar for neste ting.

Pris og resten fyller du inn ved skrivebordet senere. Linja øverst i tabellen
sier «5 mangler kjøpesum», og klikket finner dem.

> [!NOTE]
> På mobilen lagres alt med én gang. Det finnes ingen «ulagrede endringer» der.

### Skanne strekkoden og hente navnet

På «Ny ting» ligger feltet «Strekkode».

| Vil du | Slik |
|---|---|
| Lese koden fra etiketten | «Skann strekkode» tar et bilde av etiketten og leser koden: EAN, UPC, ISBN, ITF, Code 128, GS1 DataBar, QR, Data Matrix, PDF417 og flere. Leseren følger med appen og virker uten nett, også på iPhone. Leser den ikke koden: Nærmere, rett forfra, uten refleks. Eller skriv tallene under streken |
| Hente navnet på en bok eller vare | Med en ISBN, EAN eller UPC i feltet: «Slå opp på nett». Bøker slås opp i Open Library, varer i Open Products Facts og Open Food Facts. Rett navnet før du lagrer |
| Ta vare på et serienummer | Skann eller skriv det. Alt som ikke er en varekode, lagres som tekst |

Bøker og matvarer finnes som regel i oppslagsverkene. Turutstyr og elektronikk
finnes sjelden: Da sparer skanningen deg for å skrive nummeret, og navnet skriver
du selv.

### Finne igjen en ting

Trykk på forstørrelsesglasset, eller <kbd>⌘</kbd>+<kbd>K</kbd> på Mac. Søket
tåler skrivefeil og forstår spørsmål som `komfort<0` og `plassering:loftsbod`;
«Søketips» under feltet viser alle. Se [Søk](#søk). Filtrene ved siden av viser
hver verdi med antall.

Trykk på forstørrelsesglasset igjen for å gjemme feltet og filtrene. Søket
gjelder fortsatt: Ikonet lyser, og linja øverst sier «12 av 304 ting». Tøm
feltet med krysset, filtrene med «Fjern alle filtre», eller alt med «Vis alle
ting».

På mobilen svarer lista med kategori og plassering rett under navnet. Trykk på
tingen for å se alt.

### Rette noe

| Hvor | Slik |
|---|---|
| I tabellen | Klikk i cellen, skriv, «Lagre» nederst |
| På tingens side | Trykk på blyanten ved verdien. <kbd>Enter</kbd> eller et trykk utenfor lagrer, <kbd>Esc</kbd> angrer |
| Samme verdi på mange | Kopier én celle, lim inn i første rad av det som skal endres |
| Bilde | På tingens side: «Velg bilde», «Bytt bilde», «Fjern bilde» |
| Slette | På tingens side, eller huk av flere rader i tabellen og «Slett valgte» |

### Mange ting på én gang

Kopier radene i Excel, Numbers eller Google Sheets. Klikk i en celle i tabellen
og lim inn. Blokken fyller mot høyre og nedover og lager nye rader. Lag
kolonnene i samme rekkefølge som regnearket først, så treffer alt.

### Rapport til forsikringen

Snevre inn med søk eller filtre til det som skal med. Så:

| Vil du | Slik |
|---|---|
| Utskrift eller PDF | Skriverikonet til høyre i verktøylinja. Velg kolonnene som skal med («Velg alle», «Fjern alle»), så «Skriv ut». Rapporten får tittel, dato og sidetall |
| Regneark | Nedlastingsikonet ved siden av. CSV-fila åpner rett i Excel og Numbers, med norske tall og datoer |

Rapporten er ukryptert og laget for å leses. Den er ikke en sikkerhetskopi.

### Mac og iPhone sammen

Appen synkroniserer ikke selv. Én enhet har sannheten om gangen, og en
sikkerhetskopi flytter den.

1. **På Mac:** Innstillinger › pil ned. AirDrop fila til iPhone.
2. **På iPhone:** Innstillinger › pil opp, samme passord. Registrer i boden.
3. **Tilbake på Mac:** Last ned sikkerhetskopi på iPhone, AirDrop den til Mac,
   gjenopprett.

> [!IMPORTANT]
> Gjenoppretting erstatter alt som ligger i appen. Ta alltid med den nyeste
> kopien i den retningen du går, og ikke endre på begge enhetene mellom to
> overføringer.

---

## Oppslagsverk

### Søk

| Skriv | Finner |
|---|---|
| `sovepose` | Ord, tåler skrivefeil |
| `"sovepose vinter"` | Nøyaktig frase |
| `-sommer` | Uten dette ordet |
| `s` | Én bokstav: Alle navn som begynner på s |
| `komfort<0`, `vekt>1000` | Mindre enn, større enn. Også `<=` og `>=` |
| `farge=rød` | Nøyaktig lik |
| `brensel:gass` | Inneholder |
| `kjøpsdato<01.01.26` | Dato før |
| `has:bilde`, `has:vekt` | Har bilde, har en verdi i Vekt |

### Egenskaper

| Felttype | Slik |
|---|---|
| Tekst | Fritekst. Lenker blir klikkbare på tingens side |
| Valgliste | Velg blant verdiene som finnes, eller skriv en ny. Alternativene skilles med komma |
| Tall | Skriv bare tallet, `1250`, ikke `1250 gram`. Enheten gjelder hele kolonnen. Kolonner i kr summeres øverst |
| Dato | Skriv `19.09.26` |

Kolonnemenyen (pilen ved kolonnenavnet) endrer, flytter og fjerner en egenskap.
Fjerner du en egenskap, forsvinner verdien fra alle ting. Kolonner som er tomme
for alt som vises, er skjult; «Vis n tomme kolonner» henter dem fram. Navn står
alltid først og blir stående når tabellen ruller sidelengs. Kategori, Notat og
Strekkode er egenskaper som alle andre.

Filtrene under søkefeltet viser bare verdier som finnes i det som vises, med
antall, så et valg i Kategori snevrer inn de andre. Datoer filtreres per år.

<details>
<summary>Egenskaper for det Ting ikke har egne funksjoner for</summary>

| Vil du | Lag egenskapen |
|---|---|
| Vite hvem som eier hva | Valgliste «Eier»: Ett valg per person, og «Felles» |
| Vite hvem som har lånt noe | Tekst «Lånt til», tom når tingen er hjemme |
| Telle forbruksvarer | Tall «Antall» med enhet stk; `antall<2` finner det som er tomt |
| Merke tilstand | Valgliste «Status»: Ok, Skal repareres, Kast |
| Skille kjøpesum fra verdi | Tall «Verdi» i kr ved siden av «Kjøpesum» |

</details>

### Innstillinger

Ikonet lengst til høyre i topplinja.

| Valg | Gjør |
|---|---|
| Mappe på maskinen | Kobler til eller fra (Chrome og Edge) |
| Sikkerhetskopi | Pil ned laster ned, pil opp gjenoppretter |
| Automatisk lås | Slår låsen etter 10 minutter av eller på |
| Passord | Bytter passord. Dataene krypteres på nytt; gamle kopier åpnes med det gamle passordet |

---

## Hvis noe går galt

| Du ser | Det betyr | Gjør |
|---|---|---|
| Grønt oppdateringsikon i topplinja | En ny versjon er lastet ned og venter | Trykk på ikonet |
| Brunt Innstillinger-ikon | Lagringen til mappen har stoppet | Åpne Innstillinger og gi tilgang på nytt, eller velg mappen igjen |
| «Denne egenskapen finnes allerede.» | Egenskapen finnes, men er skjult fordi den er tom | Kolonnen vises ved siden av meldingen. Endre den fra kolonnemenyen i stedet |
| «Fant ingen strekkode i bildet.» | Ingen av de to leserne fant en kode | Nærmere, rett forfra, uten refleks. Eller skriv tallene |
| «Ingen nettforbindelse.» | Oppslaget trenger nett | Skriv navnet selv, eller prøv igjen senere |
| Appen er tom etter en stund på iPhone | Safari rydder nettleserdata som ikke er brukt på sju dager, også for apper på Hjem-skjermen i enkelte tilfeller | Gjenopprett fra sikkerhetskopien. Ta en ny kopi hver gang du har registrert noe på iPhone |
| Glemt passord | | Dataene kan ikke åpnes. Start på nytt med et nytt passord, og gjenopprett fra en kopi hvis du har en |

---

## Personvern

Appen har ingen server, ingen konto og ingen sporing, laster ingenting fra andre
steder og bruker ingen KI.

| Hva | Hvordan |
|---|---|
| Kryptering | AES-256-GCM i nettleseren (WebCrypto). Nøkkelen utledes fra passordet med Argon2id. Passordet lagres ingen steder |
| Kryptert | Alle ting, egenskaper, innstillinger og bilder i nettleseren, `ting.json` og bildene i mappen, og nedlastede kopier |
| Ukryptert | CSV og utskrift, som du lager for å lese dem. Antall ting og tidspunkt for siste endring |
| Datoer | Når en ting ble opprettet, ligger i `ting.json` og i CSV, men vises ikke i appen |
| Lås | Appen åpner alltid låst. Hengelåsen sletter nøkkelen fra minnet; det samme skjer etter 10 minutter uten bruk, men ikke mens du har ulagrede endringer i tabellen |
| Ut av enheten | Bare sifrene i en strekkode, bare når du trykker på «Slå opp på nett», til Open Library, Open Products Facts eller Open Food Facts. De ser da koden og IP-adressen din. Ingenting annet sendes noen gang |

Alt du skriver inn, skanner eller får tilbake fra et oppslag behandles som
tekst, aldri som kode. Trusselmodellen står i `SECURITY.md` (engelsk).
