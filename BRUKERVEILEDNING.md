# Brukerveiledning for Ting

Ting holder orden på det du eier, og hvor du har det. Alt ligger kryptert på
enheten din. Veiledningen er ordnet etter det du vil gjøre: Legge til, endre,
slette, finne og hente ut. Bakerst står oppslag du slår opp i ved behov.

**Appen:** https://elzacka.github.io/ting/

## Innhold

- [[#Kom i gang|Kom i gang]]
	- [[#Kom i gang#1. Åpne og installer appen|1. Åpne og installer appen]]
	- [[#Kom i gang#2. Prøv appen, og velg et passord for å beholde det|2. Prøv appen, og velg et passord for å beholde det]]
	- [[#Kom i gang#3. Lag kategoriene og egenskapene du trenger|3. Lag kategoriene og egenskapene du trenger]]
	- [[#Kom i gang#4. Legg til de første tingene|4. Legg til de første tingene]]
	- [[#Kom i gang#5. Ta vare på dataene|5. Ta vare på dataene]]
- [[#Slik er appen bygd opp|Slik er appen bygd opp]]
- [[#Legge til|Legge til]]
	- [[#Legge til#En ting|En ting]]
	- [[#Legge til#Mange ting|Mange ting]]
	- [[#Legge til#En egenskap|En egenskap]]
	- [[#Legge til#En kategori|En kategori]]
- [[#Endre|Endre]]
	- [[#Endre#En ting|En ting]]
	- [[#Endre#Mange ting|Mange ting]]
	- [[#Endre#En egenskap|En egenskap]]
	- [[#Endre#Mange egenskaper|Mange egenskaper]]
	- [[#Endre#Kategorier|Kategorier]]
- [[#Slette|Slette]]
- [[#Finne igjen|Finne igjen]]
	- [[#Finne igjen#Velge kategorier|Velge kategorier]]
	- [[#Finne igjen#Søke|Søke]]
	- [[#Finne igjen#Filtrere|Filtrere]]
	- [[#Finne igjen#Sortere og tilpasse tabellen|Sortere og tilpasse tabellen]]
- [[#Skrive ut og hente ut|Skrive ut og hente ut]]
- [[#Ta vare på dataene|Ta vare på dataene]]
- [[#Bruke flere enheter|Bruke flere enheter]]
- [[#Oppslag|Oppslag]]
	- [[#Oppslag#Søk|Søk]]
	- [[#Oppslag#Felttyper|Felttyper]]
	- [[#Oppslag#Egenskaper for det Ting ikke har egne funksjoner for|Egenskaper for det Ting ikke har egne funksjoner for]]
	- [[#Oppslag#Innstillinger|Innstillinger]]
	- [[#Oppslag#Hurtigtaster|Hurtigtaster]]
- [[#Hvis noe går galt|Hvis noe går galt]]
- [[#Personvern|Personvern]]

## Kom i gang

### 1. Åpne og installer appen

Appen virker i nettleseren, men som installert app får den eget ikon, starter
uten adressefelt og tar bedre vare på dataene. Mens du prøver appen, viser
linja under topplinja hvordan du installerer den der du er. I Safari og på
iPhone og iPad står linja også etter at du har valgt passord, helt til appen er
installert. Der kan nettleseren slette dataene til en side du ikke har åpnet på
sju dager.

| Enhet | Slik |
|---|---|
| Mac eller PC med Chrome eller Edge | Installeringsikonet til høyre i adressefeltet, eller «Installer appen» i linja øverst mens du prøver appen |
| Mac med Safari | Del-ikonet i verktøylinjen › «Legg til i Dock» |
| iPhone | Åpne adressen i Safari › ••• ved adressefeltet › «Del» › «Legg til på Hjem-skjerm» |
| iPad | Åpne adressen i Safari › Del-ikonet › «Legg til på Hjem-skjerm» |
| Android | «Installer» i varselet, eller «Installer app» i menyen |

### 2. Prøv appen, og velg et passord for å beholde det

Du kan prøve alt i appen uten passord. Det du legger til da, blir borte når du
lukker appen, og linja under topplinja minner deg om det. På iPhone kan
systemet også lukke appen selv, for eksempel når du bytter til en annen app. Trykk på «Velg
passord for å bevare det», så kommer du til Innstillinger. Alt du har lagt til,
blir med når du velger passordet.

Passordet må ha minst 12 tegn. En setning er lettere å huske enn en kode.
Passordbehandleren din kan lagre det under navnet Ting og fylle det inn når du
låser opp.

> [!WARNING]
> Passordet er den eneste nøkkelen. Mister du det, er dataene tapt. Det finnes
> ingen bakvei, ingen e-post og ingen konto å be om nytt passord fra.

Har du en sikkerhetskopi fra før, gjenoppretter du den under Innstillinger i
stedet for å velge et nytt passord. Da gjelder passordet kopien ble laget med.

Når du har et passord, åpner appen alltid låst. Den låser seg selv etter 10
minutter uten bruk, og hengelåsen øverst låser med én gang.

På iPhone lukker systemet appen når det trenger minnet. Da åpner den låst
igjen, også når den automatiske låsen er av. Slå på «Lås opp med Face ID eller
Touch ID på denne enheten» under Innstillinger › Lås, så låser du opp med
Face ID eller Touch ID i stedet for passordet. Passordet virker fortsatt, og du
trenger det for sikkerhetskopier og på andre enheter. Slår du valget av, kan du
slette passnøkkelen «Ting» i Passord-appen.

Valgene under Lås gjelder bare enheten du bruker. På iPhone har den installerte
appen egne valg, atskilt fra Safari.

### 3. Lag kategoriene og egenskapene du trenger

En **egenskap** er en kolonne i tabellen. Bare «Navn» finnes fra start. En
**kategori** er en verdi i egenskapen Kategori, og bestemmer hvilke ting og
hvilke kolonner du ser. Et godt utgangspunkt:

| Egenskap | Felttype | Alternativer eller enhet |
|---|---|---|
| Kategori | Valgliste | Turutstyr, Kjøkken, Klær og sko, Data og kontor |
| Plassering | Sti | Loftsbod/Hylle 2/Boks 4 |
| Kjøpesum | Tall | kr |
| Kjøpsdato | Dato | |
| Kommentar | Tekst | |

Se [Legge til en egenskap](#en-egenskap) og [Legge til en
kategori](#en-kategori). Ting har ingen faste felt for lån, tilstand eller
antall: Det er egenskaper du lager selv, se [Egenskaper for det Ting ikke har
egne funksjoner for](#egenskaper-for-det-ting-ikke-har-egne-funksjoner-for).

### 4. Legg til de første tingene

Se [Legge til en ting](#en-ting). Det du ikke vet ennå, lar du stå tomt:
`-har:kjøpesum` i søket finner tingene som mangler den senere.

### 5. Ta vare på dataene

Velg en lagringsmappe eller ta en sikkerhetskopi, se [Ta vare på
dataene](#ta-vare-på-dataene).

---

## Slik er appen bygd opp

| Del | Hvor | Gjør |
|---|---|---|
| Kategorifeltet | Øverst til venstre i registeret | Velger hvilke kategorier du ser. Uten valgt kategori vises ingen tabell |
| Pluss | Øverst til høyre | «Legg til ting» eller «Legg til egenskap (kolonne)» |
| Nedlasting og utskrift | Ved siden av pluss | Henter ut det du ser, se [Skrive ut og hente ut](#skrive-ut-og-hente-ut) |
| Den grå linja | Under knappene | Hvor mange ting du ser, summer i kr, og «Vis n kolonner til» |
| Tabellen | Under | Én rad per ting. Navnet åpner tingens side; en annen celle endrer raden |
| Forstørrelsesglasset | Topplinja | Søk og filtre |
| Tannhjulet | Topplinja | Innstillinger |

Under 600 px bred, altså på mobilen, er appen laget for tre ting: Legge til én
ting, finne en ting og se på en ting. Det gjelder også når du snur mobilen på
siden. Kolonner, summer, utskrift og regneark hører til skrivebordet og vises
ikke der. Søkefeltet og pluss for ny ting ligger nederst, der tommelen er.

---

## Legge til

### En ting

**Ved skrivebordet:** Klikk i «Legg til ting» nederst i tabellen, eller pluss ›
«Legg til ting». En ny rad åpner seg. Skriv navnet og det du vet, og klikk i
«Legg til ting» igjen for neste. «Lagre» nederst lagrer alle radene på én gang.
En rad du ikke skriver noe i, forsvinner når du klikker et annet sted.

Valglister, datoer og plasseringer arver verdien fra raden over. Står du i én
kategori, får nye rader den kategorien.

**Med kvitteringen foran deg:** Skriv navn, pris, butikk og dato på første
rad. På neste rad står butikk og dato allerede der; skriv navn og pris. Gjenta
for hver linje på kvitteringen, og trykk «Lagre». Pris og tekst arves ikke.

**Med tingen i hånden, på mobilen:**

1. Pluss nederst til høyre åpner «Ny ting».
2. «Velg bilde» åpner kameraet eller bildene dine. «Legg til bilde» for neste,
   for eksempel av etiketten.
3. Skriv navnet. «Neste» på tastaturet går til neste felt.
4. Kategori og plassering står igjen fra forrige ting. Vil du bytte, trykker
   du på et forslag under feltet. Plassering velger du ett nivå om gangen:
   «Bod», så «Hylle 2», så «Blå kasse».
5. «Lagre» nederst. Skjermen er klar for neste ting.

På mobilen lagres alt med én gang. Resten fyller du inn ved skrivebordet
senere; `-har:pris` i søket henter fram de som står igjen.

**En bok, på mobilen:** Appen kan slå opp bøker. Velg kategorien «Bøker» på
«Ny ting», trykk «Skann strekkode» og ta bilde av strekkoden bak på boka. Trykk
«Slå opp på nett», så fyller appen inn tittel og forfatter i «Navn». Rett det
som er feil før du lagrer.

**Med strekkoden:** På «Ny ting» ligger feltet «Strekkode», nederst.

| Vil du                            | Slik                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lese koden fra etiketten          | «Skann strekkode» åpner kameraet. Ta et bilde av koden, så fyller appen inn feltet. Bildet blir ikke lagret på tingen. Leseren kjenner EAN, UPC, ISBN, ITF, Code 128, GS1 DataBar, QR, Data Matrix, PDF417 og flere, og virker uten nett, også på iPhone. Leser den ikke koden, tar du et nytt bilde nærmere, rett forfra og uten refleks. Eller skriv tallene under streken |
| Slå opp en bok                    | Knappen «Slå opp på nett» vises når kategorien har symbolet «Bok» og feltet har en ISBN. En kategori med «bok» eller «bøker» i navnet får symbolet av seg selv. Appen henter tittel og forfatter fra Nasjonalbiblioteket eller Open Library |
| Ta vare på et serienummer eller en QR-kode | Skann eller skriv inn koden. Appen lagrer den som tekst og slår den ikke opp |

Appen slår bare opp bøker, fordi det ikke finnes noen god, åpen katalog for
andre ting. For dem sparer skanningen deg for å skrive nummeret, og navnet
skriver du selv.

### Mange ting

Kopier radene i Excel, Numbers eller Google Sheets. Klikk i en celle i tabellen
og lim inn. Blokken fyller mot høyre og nedover og lager nye rader. Lag
kolonnene i samme rekkefølge som regnearket først, så treffer alt. «Lagre».

### En egenskap

Pluss › «Legg til egenskap (kolonne)». Skriv navnet og velg felttype, se
[Felttyper](#felttyper). En valgliste kan få alternativer, et tall en enhet.

Står du i én eller flere kategorier, kan egenskapen høre til bare dem: «Bruk
bare i …» er huket av fra start. Under skjemaet står en hjelpetekst for feltet
du er i. Mens du skriver navnet, viser den egenskapene som begynner med det du
har skrevet, og hvor de finnes. Skriver du navnet på en egenskap en annen
kategori har, tar appen den i bruk her også i stedet for å lage en til.

### En kategori

Skriv en ny verdi i Kategori-kolonnen når du legger til en ting, så finnes
kategorien. Vil du lage den før du har ting til den: Kategorifeltet › «Endre
kategorier» › «Ny kategori». Gi den navn og symbol, og trykk «Lagre». Den står i
lista med 0 ting til du legger noe i den.

**Eksempel: En kategori med typer.** Ting har ingen underkategorier. Vil du dele
Underholdning i bøker, film, musikk og spill, gir du kategorien en valgliste med
typene. Leker blir en egen kategori.

1. Kategorifeltet › «Endre kategorier». Trykk på «Ny kategori» og skriv
   `Underholdning`. Gjør det samme for `Leker` og trykk «Lagre». Leker får
   symbolet «Leker» av seg selv.
2. Velg Underholdning i kategorifeltet. Pluss › «Legg til egenskap (kolonne)».
3. Fyll ut skjemaet og trykk «Legg til»:
   - Navn på egenskap: `Type`
   - Felttype: Valgliste
   - Alternativer: `Bøker, Film, Musikk, CD, Brettspill, Dataspill`

«Bruk bare i Underholdning» er huket av, så Type hører bare til Underholdning.
Står du i Underholdning, får du en kolonne og et filter for Type. På «Ny ting»
på mobilen står typene som forslag under Type når kategorien er Underholdning. I
utskriften kan du gruppere etter Type.

Vil du fortsatt slå opp bøker på nett, gir du Underholdning symbolet «Bok» under
«Endre kategorier».

**Har du allerede kategorier som Bøker og Film,** gir du tingene en type før du
slår kategoriene sammen:

1. Velg Bøker og legg til Type som over.
2. Huk av alle tingene › «Endre verdi» › Type: `Bøker` › «Lagre».
3. Gjør det samme for Film og de andre. Appen lager ikke en ny Type, men bruker
   den du har.
4. «Endre kategorier»: Gi hver av dem navnet `Underholdning`. De blir én
   kategori, og Type følger med.

---

## Endre

### En ting

| Hvor | Slik |
|---|---|
| I tabellen | Klikk i cellen og skriv. Raden får en grønn strek til venstre. «Lagre» nederst lagrer, <kbd>Esc</kbd> spør om du vil forkaste |
| På tingens side | Trykk på navnet i tabellen, så på raden du vil endre. Under en valgliste eller en plassering står verdiene du alt bruker. Trykker du på én, lagrer appen den. <kbd>Enter</kbd> eller et trykk utenfor lagrer, <kbd>Esc</kbd> angrer. Siden viser plasseringen først, så egenskapene tingens kategori har |
| Bilder | På tingens side: «Legg til bilde». Du kan velge flere. Trykk på et lite bilde for å gjøre det til hovedbilde; krysset fjerner det |

### Mange ting

Huk av tingene i tabellen. Avkrysningsboksen i overskriften huker av alle du
ser. Linja øverst viser da **«n valgt · Endre verdi · Skriv ut · Last ned ·
Slett · ×»**.

«Endre verdi»: Velg egenskap og skriv verdien. Den kommer på alle tingene du har
huket av. Radene viser hva som endres, og ingenting lagres før du trykker
«Lagre». Et tomt felt fjerner verdien. Slik flytter du for eksempel ti ting til
en ny plassering, eller til en annen kategori.

Du kan også kopiere én celle og lime den inn nedover.

### En egenskap

Kolonnemenyen er pilen ved kolonnenavnet.

| Vil du | Velg |
|---|---|
| Endre navn, felttype, alternativer eller enhet | «Endre» |
| Flytte kolonnen | «Flytt til venstre» eller «Flytt til høyre» |
| La den høre til kategorien du står i | «Bruk bare i …», «Bruk også i …» eller «Ikke bruk i …» (når én kategori er valgt) |

Endrer du felttypen, blir verdiene stående som de er. Slik gjør du for eksempel
en valgliste med plasseringer om til en Sti.

### Mange egenskaper

Pluss › «Legg til egenskap (kolonne)» › «Endre egenskaper». Hver egenskap står
på én linje: Navn, felttype, enhet, kategoriene den hører til, og antall ting
med verdi. Endre det du vil, og trykk «Lagre». Kategori er ikke med; den endrer
du under «Endre kategorier».

En egenskap hører til alle kategorier til du sier noe annet. Knappen med
kategoriene åpner en liste der du huker av dem den skal høre til. Ingen hake er
alle kategorier.

### Kategorier

Kategorifeltet › «Endre kategorier» nederst i lista.

| Vil du | Slik |
|---|---|
| Velge symbol | Trykk på symbolet. Velg i rutenettet; navnet på symbolet står nederst. «Velg ut fra navnet» går tilbake til forslaget |
| Endre navn | Skriv det nye navnet. Alle tingene i kategorien og egenskapene som hører til den, følger med |
| Slå sammen to | Gi den ene samme navn som den andre |

Ingenting lagres før du trykker «Lagre». Til du velger et symbol selv, foreslår
appen et ut fra ordene i navnet.

---

## Slette

| Vil du slette | Slik |
|---|---|
| Én ting | På tingens side: «Slett» nederst |
| Flere ting | Huk av tingene › «Slett» i linja øverst |
| Én egenskap | Kolonnemenyen › «Fjern» |
| Flere egenskaper | «Endre egenskaper» › søppelbøtta på hver linje › «Lagre» |
| En kategori | Flytt tingene til en annen kategori med «Endre verdi», eller slå den sammen med en annen under «Endre kategorier» |

Fjerner du en egenskap, forsvinner verdien fra alle ting. Har den verdier, sier
appen hvor mange ting det gjelder, og spør først. Det du sletter, kan du ikke
få tilbake, utenom fra en sikkerhetskopi.

---

## Finne igjen

### Velge kategorier

Registeret åpner med «Velg kategori» og uten tabell. Trykk på feltet og velg én
eller flere kategorier. Lista blir stående åpen, så du kan velge flere; de du
har valgt, får en hake foran navnet. Trykk på en valgt kategori igjen for å ta
den bort.

| Valg | Gjør |
|---|---|
| En kategori | Tingene i den, og kolonnene som hører til den |
| Flere kategorier | Tingene i alle, og kolonnene som hører til minst én av dem |
| «Alle» | Alt, og lukker lista |
| «Fjern alle valgte» | Skjuler tabellen igjen |

<kbd>Esc</kbd> eller et klikk utenfor lukker lista, og piltastene flytter i
den. Kategori-kolonnen er borte så lenge du står i én kategori: Der sier den det
samme på hver rad.

### Søke

Trykk på forstørrelsesglasset, <kbd>⌘</kbd>+<kbd>K</kbd> på Mac eller
<kbd>Ctrl</kbd>+<kbd>K</kbd> på PC, eller bare begynn å skrive. Søket tåler
skrivefeil og forstår spørsmål som `pris>1000` og `plassering:loftsbod`.
«Søketips» under feltet viser alle, med eksempler fra dine egne kolonner. Se
[Søk](#søk).

Trykk på forstørrelsesglasset igjen for å gjemme feltet og filtrene. Søket
gjelder fortsatt: Ikonet lyser grønt, og linja øverst sier for eksempel «12 av
304 ting». Tøm feltet med krysset, filtrene med «Fjern alle filtre», eller alt
med «Vis alle ting».

### Filtrere

Filtrene ved siden av søkefeltet viser hver verdi med antall, for det du ser.

- Datoer filtreres per år.
- En Sti får ett filter per nivå: «Plassering» er rommet, «Plassering 2» hylla,
  «Plassering 3» boksen.
- Egenskaper der nesten hver ting har sin egen verdi, som pris og ordrenummer,
  får ikke filter. Bruk søket, for eksempel `pris>1000`.

### Sortere og tilpasse tabellen

| Vil du | Slik |
|---|---|
| Sortere | Klikk på kolonnenavnet: Stigende, synkende, av |
| Endre bredde | Dra i kanten av kolonneoverskriften. Dobbeltklikk der for å tilpasse bredden til innholdet |
| Se kolonner som er skjult | «Vis n kolonner til» på den grå linja |
| Skjule en kolonne for godt | Innstillinger › Tilpass visning › «Egenskaper i tabellen» |
| Se lange verdier i sin helhet | Innstillinger › Tilpass visning › «Bryt lang tekst over flere linjer» |

Tabellen viser kolonnene kategorien din har, også de tomme: Det er dem du har
igjen å fylle ut. Kolonner uten verdier der du står, og kolonner for alle
kategorier med samme verdi på hver rad, er skjult; de skiller ikke tingene fra
hverandre. Går tabellen lenger enn kortet, blekner høyre kant: Rull sidelengs.

**På mobilen** svarer lista med plassering og kategori rett under navnet. En
ting uten bilde viser ikonet til kategorien sin. Trykk på tingen for å se alt.

---

## Skrive ut og hente ut

Snevre inn med kategori, søk eller filtre til det som skal med, eller huk av
tingene.

| Vil du | Slik |
|---|---|
| Utskrift eller PDF | Skriverikonet øverst til høyre, eller «Skriv ut» når du har huket av ting: Da kommer bare de med |
| Regneark (CSV) | Nedlastingsikonet, eller «Last ned» for tingene du har huket av. Fila åpner rett i Excel og Numbers, med norske tall og datoer |

I utskriften er kolonnene du ser, valgt fra start. Fjern hakene for dem som ikke
skal med, og trykk «Skriv ut». Rapporten får tittel, dato og sidetall. To valg
bestemmer formen:

| Valg | Gjør |
|---|---|
| Grupper etter | En valgliste blant kolonnene du ser, for eksempel Kategori under «Alle». Tingene kommer under hver sin overskrift, med sum per gruppe og en sluttsum |
| Ta med bilder | Hver ting får hovedbildet sitt. Ting uten bilde får en tom ramme, så du ser hvilke som mangler |

Velger du ingen av dem, skrives tabellen ut som den står. Velger du én, kommer
tingene under hverandre, én blokk per ting. Summene følger det som kommer med.

Utskrift og CSV er ukryptert og laget for å leses. De er ikke en sikkerhetskopi.

---

## Ta vare på dataene

Dataene ligger i nettleseren på enheten. Sletter du nettstedsdata, eller mister
enheten, er de borte derfra. Velg én av to måter under Innstillinger:

| Måte | Passer når | Slik |
|---|---|---|
| Lagringsmappe | Du bruker Chrome eller Edge på Mac eller PC og vil ha en kopi som alltid er oppdatert | «Velg mappe». Appen skriver `ting.json` og bildene dit hver gang du lagrer. Vises ikke på mobil og nettbrett, fordi ingen nettleser der kan nå en mappe |
| Sikkerhetskopi | Du bruker Safari eller iPhone, eller vil ha en fil å legge et trygt sted | «Last ned sikkerhetskopi» lager fila. På iPhone og iPad heter knappen «Del sikkerhetskopi». Velg «Arkiver i Filer» eller send fila med AirDrop. «Gjenopprett fra sikkerhetskopi» henter den inn igjen og erstatter alt, etter at du har svart ja |

Begge tar med alle ting, egenskaper, kategorier, bilder og
kolonneinnstillinger, er kryptert med passordet ditt og åpnes på enhver enhet
der du skriver det inn.

<details>
<summary>Mer om mappen</summary>

- Velg en tom mappe. Appen rydder selv i undermappen `bilder`.
- Har både mappen og nettleseren ting fra før, spør appen hva du vil beholde.
- Deler flere enheter én mappe, bruk den fra én enhet om gangen. Den nyeste
  lagringen vinner; ingenting flettes.
- Stopper lagringen til mappen, blir tannhjulet i topplinja brunt.

</details>

---

## Bruke flere enheter

Appen synkroniserer ikke selv. Én enhet har sannheten om gangen, og en
sikkerhetskopi flytter den. Et eksempel med Mac og iPhone:

1. **På Mac:** Innstillinger › «Last ned sikkerhetskopi». AirDrop fila til
   iPhone.
2. **På iPhone:** Innstillinger › «Gjenopprett fra sikkerhetskopi», og skriv
   passordet. Registrer i boden.
3. **Tilbake på Mac:** Trykk på «Del sikkerhetskopi» på iPhone, send fila med
   AirDrop til Mac og gjenopprett.

> [!IMPORTANT]
> Gjenoppretting erstatter alt som ligger i appen. Ta alltid med den nyeste
> kopien i den retningen du går, og ikke endre på begge enhetene mellom to
> overføringer.

---

## Oppslag

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
| `kategori:tur` | Kategori som inneholder |
| `kjøpsdato<01.01.26` | Dato før |
| `har:bilde`, `har:vekt` | Har minst ett bilde, har en verdi i Vekt |
| `-har:vekt` | Mangler en verdi i Vekt |

Står navnet på egenskapen med mellomrom, setter du det i anførselstegn:
`"kjøpt hvor":komplett`.

### Felttyper

| Felttype | Slik |
|---|---|
| Tekst | Fritekst. Lenker blir klikkbare på tingens side |
| Valgliste | Velg blant verdiene som finnes, eller skriv en ny. Alternativene skilles med komma |
| Tall | Skriv bare tallet, `1250`, ikke `1250 gram`. Enheten gjelder hele kolonnen. Tallene står til høyre, med mellomrom mellom tusener. Kolonner i kr summeres på den grå linja når minst én ting har en verdi |
| Dato | Skriv `19.09.26` |
| Sti | Hele veien inn til en plass: `Loftsbod/Hylle 2/Boks 4`, eller med `>` eller `›`. Appen skriver det alltid som `Loftsbod › Hylle 2 › Boks 4`, og foreslår plassene du alt bruker |

> [!TIP]
> Skriv hele veien inn, ikke bare rommet. På mobilen trykker du deg inn ett
> nivå om gangen i stedet for å skrive. Da får du ett filter per nivå: Ett klikk på «Loftsbod» henter alt på loftet,
> uansett hvor dypt inne det står. Tre nivåer er nok til sted, sone og boks.

### Egenskaper for det Ting ikke har egne funksjoner for

| Vil du | Lag egenskapen |
|---|---|
| Vite hvem som eier hva | Valgliste «Eier»: Ett valg per person, og «Felles» |
| Vite hvem som har lånt noe | Tekst «Lånt til», tom når tingen er hjemme |
| Telle forbruksvarer | Tall «Antall» med enhet stk; `antall<2` finner det som er tomt |
| Merke tilstand | Valgliste «Status»: Ok, Skal repareres, Kast |
| Skille kjøpesum fra verdi | Tall «Verdi» i kr ved siden av «Kjøpesum» |
| Dele en kategori i typer | Valgliste «Type» som bare hører til kategorien, se [eksemplet](#en-kategori) |

### Innstillinger

Tannhjulet lengst til høyre i topplinja.

| Valg | Gjør |
|---|---|
| Velg et passord | Bare mens du prøver appen: Låser det du har lagt til, så det blir med |
| Lagringsmappe | «Velg mappe» kobler til (Chrome og Edge), «Koble fra» kobler fra. Linja under sier hvor appen lagrer |
| Sikkerhetskopi | «Last ned sikkerhetskopi» lager fila. «Gjenopprett fra sikkerhetskopi» erstatter alt, og spør først |
| Tilpass visning | Bryt lang tekst over flere linjer, og hvilke egenskaper tabellen viser. Navn vises alltid. Enheten husker valgene |
| Lås | «Lås appen etter 10 minutter uten bruk» slår den automatiske låsen av eller på. «Lås opp med Face ID eller Touch ID på denne enheten» lar deg låse opp uten passord. Begge gjelder bare enheten du bruker |
| Passord | «Endre passord». Gjenoppretter du fra en sikkerhetskopi og appen ber om passord, bruker du passordet du hadde da du lastet den ned |

### Hurtigtaster

| Tast | Gjør |
|---|---|
| <kbd>⌘</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> | Åpner og lukker søket |
| En bokstav, når du ikke skriver i et felt | Starter et søk med den bokstaven |
| <kbd>Esc</kbd> | Tømmer søket, lukker en liste eller et panel, eller spør om du vil forkaste endringene i tabellen |
| Piltastene | Flytter i lister og i rutenettet med symboler |
| <kbd>Enter</kbd> | Velger i en liste, lagrer en verdi på tingens side |

---

## Hvis noe går galt

| Du ser | Det betyr | Gjør |
|---|---|---|
| Grønt oppdateringsikon i topplinja | En ny versjon er lastet ned og venter | Trykk på ikonet. Det snurrer til appen har lastet den nye versjonen |
| Brunt tannhjul | Lagringen til mappen har stoppet | Åpne Innstillinger og gi tilgang på nytt, eller velg mappen igjen |
| «Denne egenskapen finnes allerede.» | Egenskapen finnes, men er skjult der du står | Kolonnen vises under meldingen. Endre den fra kolonnemenyen i stedet |
| «Lagre eller forkast endringene i tabellen først.» | Du endrer egenskaper mens tabellen har ulagrede endringer | Trykk «Lagre» nederst, eller <kbd>Esc</kbd> og «Forkast endringene» |
| «Fant ingen strekkode i bildet.» | Leseren fant ingen kode | Nærmere, rett forfra, uten refleks. Eller skriv tallene |
| «Ingen nettforbindelse.» | Oppslaget trenger nett | Skriv navnet selv, eller prøv igjen senere |
| «Ingen passnøkler er tilgjengelige» når appen åpner | Nettleseren finner ikke passnøkkelen for Face ID eller Touch ID på enheten, for eksempel fordi den er slettet eller ligger i en passordbehandler | Trykk «Lukk» og lås opp med passordet. Slå så «Lås opp med Face ID eller Touch ID på denne enheten» av og på igjen under Innstillinger › Lås |
| Appen er tom etter en stund på iPhone | Safari kan slette nettstedsdata som ikke er brukt på sju dager | Gjenopprett fra sikkerhetskopien. Installer appen på Hjem-skjerm, så sletter ikke Safari dataene etter sju dager. Ta en ny kopi hver gang du har registrert noe på iPhone |
| Glemt passord | | Dataene kan ikke åpnes. Start på nytt med et nytt passord, og gjenopprett fra en kopi hvis du har en |

---

## Personvern

Appen har ingen server, ingen konto og ingen sporing, laster ingenting fra andre
steder og bruker ingen KI.

| Hva | Hvordan |
|---|---|
| Kryptering | AES-256-GCM i nettleseren (WebCrypto). Nøkkelen utledes fra passordet med Argon2id. Passordet lagres ingen steder |
| Kryptert | Alle ting, egenskaper, kategorier, innstillinger og bilder i nettleseren, `ting.json` og bildene i mappen, og nedlastede kopier. Også mens du prøver appen uten passord |
| Ukryptert | CSV og utskrift, som du lager for å lese dem. Antall ting og tidspunkt for siste endring |
| Datoer | Når en ting ble opprettet, ligger i `ting.json` og i CSV, men vises ikke i appen |
| Lås | Med passord åpner appen alltid låst. Hengelåsen sletter nøkkelen fra minnet; det samme skjer etter 10 minutter uten bruk, men ikke mens du har ulagrede endringer i tabellen. Er Face ID eller Touch ID slått på, er enhetens egen lås også appens lås på den enheten. Kopier og lagringsmappen krever fortsatt passordet |
| Ut av enheten | Bare sifrene i en ISBN, bare når du trykker på «Slå opp på nett», til Nasjonalbiblioteket eller Open Library. De ser da koden og IP-adressen din. Ingenting annet sendes noen gang |

Alt du skriver inn, skanner eller får tilbake fra et oppslag, behandles som
tekst, aldri som kode. Trusselmodellen står i `SECURITY.md` (engelsk).
