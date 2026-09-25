# Beach Detector

Malá hra o hledání pokladů na pláži pro `naplazi`. Jdeš po pláži s detektorem kovů, podle pípání hledáš, co moře
vyplavilo, a vykopáváš to, dokud neskončí den.

Tento dokument popisuje hru, která postupně nahradí ukázkové demo staženého scaffoldu BLIT386. Je zároveň návrhem hry a
živým dokumentem: když se změní chování kódu, mění se i tenhle soubor (viz sekce 10).

Kód má být čitelný pro zvědavého dvanáctiletého. Každý podsystém je malý samostatný soubor a každé laditelné číslo žije
v pojmenované konstantě s komentářem, nikdy ne rozsypané v kódu. Otevřít soubor, změnit číslo, spustit a vidět rozdíl -
to je celá myšlenka.

Návod k enginu je v `AGENTS.md` a `docs/`, pravidla projektu v `CLAUDE.md`, rozpad na úkoly v `TODO_after.md`.

---

## 1. Pocit ze hry

Portrét telefonu. Dole stojí figurka zezadu a mává detektorem kovů nad pískem. **Jde sama, pořád dopředu, stálou
rychlostí** - chůzi neovládáš, nezastavíš ji a nezrychlíš. Pláž se kvůli tomu sune odshora dolů: u horizontu se plazí, u
nohou uhání, takže to vypadá jako pohled přes rameno, ne jako plochý top-down. Nad horizontem je pruh moře a nad ním
obloha, která mění barvu s denní dobou. Vlevo lemuje pláž voda, u které jdeš.

Pláž je rozdělená na **pět neviditelných pruhů** - něco jako běžecká dráha. Tapnutí na levou nebo pravou polovinu
obrazovky tě přesune o jeden pruh a tím změníš trasu, po které pak jdeš dál sám. To je jediné, co ovládáš.

**Detektor se houpe sám**, zleva doprava a zpátky, nezávisle na tobě. Nemíříš s ním - posloucháš ho. Když se hlava
zrovna přehoupne nad něčím zakopaným, pípání zhoustne. Z toho, _kdy_ v rámci výkyvu zhoustne, poznáš, na které straně to
leží, a rozhodneš se, jestli uhneš o pruh.

Máš dvě reálné minuty. Za tu dobu se herní čas přehoupne z šesti ráno na deset večer. Když padne noc, hodinky pípnou a
den končí. Vykopej, co stihneš.

---

## 2. Herní smyčka

1. Poklad se pod pískem sune dolů k tobě, neviditelný.
2. Asi tři vteřiny předtím, než k tobě dojede, se ozve detektor.
3. **Hlasitost a výška tónu** říkají, jak je daleko. **Tempo pípání** říká, jak přesně je nad ním zrovna hlava.
4. Podle toho, ve které fázi výkyvu tempo zhoustne, odhadneš stranu a tapneš o pruh vlevo nebo vpravo.
5. Když ti poklad dojede k nohám a stojíš v jeho pruhu, vykope se sám.
6. Figurka se zastaví, zvedne nález nad hlavu a otevře se panel: co to je a kolik jich máš v batohu. Panel zastaví i
   hodinky, takže prohlížení nic nestojí.
7. Tap panel zavře, chůze pokračuje. Opakuje se to, dokud hodinky ve 22:00 nepípnou.

Není tu žádné selhání výkopu, žádný špatný cíl a žádný limit na dokopání. Všechno zakopané stojí za sebrání a všechno má
hodnotu přesně jeden bod. Výzvou je čas a poloha, nic jiného.

---

<a id="3-rozvrzeni-obrazovky"></a>

## 3. Rozvržení obrazovky

Logické rozlišení je 180 x 320 pixelů, portrét. Zařízení může doplnit černé pruhy po stranách, to nevadí. Svisle je
rozvržení pevné:

```
 y
  0 +-----------------------------+
    | [00]                [06:00] |  cislo nalezu vlevo, hodinky vpravo
    |                             |  obloha (barva = denni doba)
 90 |=============================|  MORE u horizontu + linka priboje
108 |~|. . . . . . . . . . . . . .|  pisek, scrolluje odshora dolu
    |~|   .        .          .   |  vlevo svisly pruh vody (x 0..17)
    |~|. . . . . . . . . . . . . .|
    |~|        [ NALEZ ]          |  panel nalezu (jen kdyz se neco vykopalo)
    |~|   .          .        .   |
262 |~|            \              |  otocny bod tyce detektoru
    |~|             \  ( o )      |  tyc = cary, hrot = nerotujici sprite
276 |~|            [P]            |  rada hrace: tady se sbira
288 |-----------------------------|
    |    .   :   |   :   .        |  LISTA SIGNALU: vyska = sila
    |----------#------------------|  znacka = poloha hlavy detektoru
319 +-----------------------------+
```

Vodorovně:

```
 x    0        18                                168      180
      |  MORE  |            DRAHA                | PISEK  |
      |  18 px |  5 pruhu po 30 px = 150 px      | 12 px  |

 stredy pruhu:   33      63      93     123     153
 pruh cislo:      0       1       2       3       4
 start behu:                      ^
```

Pevné je jen tohle: **horizont** (90), **spodek mořského pruhu** (108), **řada hráče** (276), **pásmo lišty signálu**
(288 a níž) a **mřížka pruhů**. Zbytek se může posunout.

---

## 4. Systémy

<a id="41-plaz"></a>

### 4.1 Pláž

Svět je jeden svislý pás, který se sune dolů. Nese levnou pixelovou **dekoraci** (smetí, tmavé tečky, kroužky po
kelímcích) a zakopané **poklady**, které nejsou vidět, dokud se nevykopou.

Poloha ve světě se drží ve dvou číslech: `worldX` v pixelech napříč pásem a `worldY` **v sekundách chůze**. Hráč
postupuje rychlostí přesně jedné jednotky za sekundu, takže rozdíl `worldY` mezi pokladem a hráčem je rovnou "za kolik
vteřin to bude u nohou" - a z toho se počítá signál i rozestupy pokladů, aniž by se cokoliv převádělo.

Scroll **není lineární**. Řádky u horizontu se plazí, řádky u nohou uhánějí. Projekce hloubky na obrazovku:

```
u = (objekt.worldY - hrac.worldY) / travelSeconds     // 0 = u nohou, 1 = u horizontu
screenY = playerRowY - (playerRowY - 108) * pow(u, 1 / perspectivePower)
```

S `travelSeconds = 8` trvá pokladu osm vteřin, než dorazí od horizontu k nohám, a `perspectivePower = 2.2` dává tu
falešnou perspektivu. Vše nad horizontem se zahazuje, vše, co vyjede spodní hranou, se recykluje.

Engine neumí rotovat **ani škálovat** sprity, takže perspektiva žije výhradně v rychlosti scrollu, ne ve velikosti.
Dekorace u horizontu je stejně velká jako u nohou. Až engine škálování dostane, bude z toho snadné rozšíření; teď je to
mimo rozsah.

**Moře** je vidět dvakrát: jako pruh pod horizontem (y 90..107) s jednou pomalu se vlnící linkou příboje a jako svislý
pruh u levého kraje (x 0..17), podél kterého jdeš. Ten svislý pruh zároveň dělá viditelnou hranici hrací plochy, takže
hráč vidí, kam až se dá jít.

<a id="42-draha-a-hrac"></a>

### 4.2 Dráha a hráč

Hráč stojí na pevné svislé pozici (řada 276) a mění jen pruh. Pruhů je pět, každý 30 px široký, dráha začíná na x = 18 a
středy pruhů jsou 33 / 63 / 93 / 123 / 153. Běh začíná v prostředním pruhu 2.

Ovládání: **tap na levou nebo pravou polovinu obrazovky = přesun o jeden pruh**. Držení prstu nedělá nic navíc - kroky
se neopakují, takže se nedá nechtěně odplavat ke kraji. Přesun je animovaný 0.15 s, aby bylo vidět, že figurka jde, a
aby z čeho vznikaly stopy v písku. Když tapneš během přesunu, jeden tap se uloží do fronty, takže rychlý dvojtap
přeskočí dva pruhy. Na krajích se tapnutí ven ignoruje.

Klávesnice funguje stejně: šipka vlevo/vpravo nebo A/D, jeden krok na stisk. Figurka se nikdy neotáčí.

<a id="43-detektor"></a>

### 4.3 Detektor

Tyč se kreslí **čarami** z otočného bodu (y 262) a na jejím konci sedí malý **nerotující sprite** cívky. Cívka je
symetrická (kroužek), aby chybějící rotace nebyla vidět.

Tyč se **houpe sama**, na vstupu nezávisle:

```
uhel = maxAngleDeg * sin(2 * PI * cas / sweepPeriodSeconds)
```

S délkou tyče 68 px a maximálním úhlem 45 stupňů dosáhne hlava **±48 px do stran**, tedy 1.6 pruhu, a je 68 px před
hráčem uprostřed výkyvu a 48 px v krajích. Perioda 1.2 s znamená, že hlava přejede přes libovolné místo dvakrát za
cyklus - hráč tedy dostane "čtení" každých ~0.6 s a za třísekundové varování jich stihne asi pět.

Hlava detektoru je bod, ze kterého se měří signál. **Nekope** - kope se u nohou (viz 4.6).

<a id="44-signal"></a>

### 4.4 Signál

Každý snímek se hledá nejbližší poklad, který splňuje obojí: leží **před** řadou hráče a dojede k ní **do tří vteřin**.
Poklad, který projel kolem, z hledání okamžitě vypadne, aby signál nelhal. Když žádný takový není, je ticho a lišta je
prázdná.

Z nalezeného cíle se odvodí čtyři veličiny, každá nese jinou informaci:

| veličina | nese | rozsah |
| --- | --- | --- |
| **tempo pípání** (délka pauzy) | jak přesně je nad ním **hlava** | 110 ms (přesně nad) až 700 ms (60 px stranou), nad 90 px ticho |
| **hlasitost** | jak je poklad **daleko** | 25 % (3 s) až 100 % (u nohou) |
| **výška tónu** | totéž, druhým kanálem | pitch 1.0 až 2.0 (klip 440 Hz, tedy 440 až 880 Hz) |
| **stereo pan** | kde je zrovna **hlava** | -0.6 (vlevo) až +0.6 (vpravo) |

Rytmus tedy vypadá takhle, jak se tyč houpe přes poklad ležící vlevo:

```
hlava:   L . . . S . . . P . . . S . . . L
tempo:  [.-.]  [.--.]  [.---.] [.--.]  [.-.]
```

Hlasitost a výška se přitom celou dobu drží na úrovni odpovídající vzdálenosti. Hráč tak z jednoho zvuku čte dvě věci
naráz: "je to blízko" a "je to vlevo". Ve sluchátkách navíc slyší detektor fyzicky se houpat, protože pan kopíruje
polohu hlavy - ale nikdy neprozradí, kde poklad leží.

Křivka mezi krajními hodnotami je laditelná (výchozí exponent 1.5 pro vzdálenost, lineární pro tempo). Tempo záměrně
nezávisí na vzdálenosti: daleký, ale dobře zaměřený poklad pípá hustě a potichu, blízký a špatně zaměřený pomalu a
nahlas.

<a id="45-kanaly-zpetne-vazby"></a>

### 4.5 Kanály zpětné vazby

Většina lidí hraje na telefonu bez zvuku, takže zvuk nikdy nesmí být jediný kanál. Hlasitost a výška tónu jsou v tichu
pryč, proto vzdálenost celou nese **lišta signálu**.

1. **Zvuk** - pípnutí popsané výše.
2. **Lišta signálu** (dole, y 288 a níž) - značka jede vodorovně přesně podle polohy hlavy a výška sloupku nad ní je
   aktuální síla signálu. Je to vizuální dvojče zvuku: hlasitost jako výška, pan jako pozice. Lišta leží mimo hrací
   plochu a používá HUD sloty, takže ji denní přechod nikdy nezatemní.
3. **Blikání hrotu** - cívka cvakne při každém pípnutí, takže tempo je vidět přímo tam, kam se hráč dívá.
4. **Haptika** - krátká vibrace jen při událostech, ne při pípání: nový cíl v dosahu (20 ms), vykopání (40 ms), konec
   dne (3 x 60 ms). Vibrace v rytmu pípání by při dobrém zaměření splynula v souvislý bzukot. `navigator.vibrate` se
   volá obaleně; kde není podpora (iOS Safari), tiše se nic nestane.

Puls celého rámečku obrazovky se **nedělá**. Při rychlém tempu by to bylo osm bliknutí přes celou obrazovku za vteřinu,
což nic nepřidá a citlivým hráčům ublíží.

Každý kanál se dá vypnout v configu a porovnat, kolik toho nesl sám.

<a id="46-poklady-a-sber"></a>

### 4.6 Poklady a sběr

Poklad leží na středu jednoho z pěti pruhů s odchylkou do ±6 px. Rozestupy se generují v sekundách chůze: nejméně 4.0 s,
průměrně 4.5 s. Za dvouminutový běh se tedy objeví asi 27 pokladů a dobrý hráč jich sebere 18 až 24. Rozestup je
schválně větší než třísekundové okno varování, takže v dosahu nikdy nejsou dva poklady naráz a signál patří vždycky
jednomu cíli.

Typ pokladu se losuje rovnoměrně ze šesti možností. Hustota je konstantní, nikde se nezvyšuje.

**Sbírá se u nohou.** Ve chvíli, kdy poklad překročí řadu hráče, se změří boční vzdálenost mezi ním a hráčem; do 14 px
se vykope, jinak se poklad tiše odstraní. Pravidlo je tím úplně předvídatelné: _stůj ve správném pruhu a máš ho_.
Tolerance 14 px bezpečně pokrývá odchylku ±6 px, takže se nikdy nestane, že by hráč stál správně a přesto minul.

Minutý poklad zmizí bez zvuku a beze stopy. Je to vědomé rozhodnutí: hra hráče netrestá, ale taky mu neukáže, o kolik
minul, takže se učí jen z úspěchů.

<a id="47-panel-nalezu-a-batoh"></a>

### 4.7 Panel nálezu a batoh

Vykopáním se **zastaví všechno**: chůze, scroll pláže, houpání detektoru i denní hodiny. Figurka zvedne nález nad hlavu
a vyjede panel:

```
+-------------------+
|            [NEW]  |   odznak jen u prvniho kusu daneho typu
|                   |
|       ( o )       |   sprite predmetu, plna velikost
|                   |
|        x 3        |   kolik jich mas v batohu
+-------------------+
```

Panel je **beze slov** - sprite, číslice a odznak jako obrázek, žádná abeceda. Nový typ drží 4.0 s, už známý typ 1.5 s;
tap ho zavře dřív a panel sjede dolů z obrazovky (0.25 s). Pak se chůze rozeběhne přesně tam, kde skončila. Čítač nálezů
naskočí ve chvíli, kdy panel vzniká.

Protože hodiny během panelu stojí, den zůstává 120 s čistého hledání a prohlížení nálezu nikdy nestojí body. Reálné
sezení tím naroste zhruba na 2.5 až 3.5 minuty.

**Batoh** platí pro jeden běh: na začátku je prázdný, drží počty podle typu a příznak "dnes už jsem tenhle typ viděl".
Napříč běhy se nic nepamatuje kromě nejlepšího skóre, takže každý běh má stejný tvar - nejdřív šest objevení, pak
plynulý lov. Obsah batohu se na konci ukáže na výsledkové obrazovce.

<a id="48-denni-hodiny"></a>

### 4.8 Denní hodiny

Dvě reálné minuty se mapují na herní čas 6:00 -> 22:00. Hodiny vystavují:

- aktuální herní čas pro hodinky,
- normalizovaný `dayProgress` v rozsahu 0 až 1,
- **fázi** (ráno / poledne / večer / noc) podle prahů,
- událost konce dne, která pípne hodinkami a ukončí běh.

Hodiny stojí vždy, když stojí hra: při panelu nálezu i při ztrátě fokusu okna. Ztráta fokusu (`visibilitychange`)
zastaví scroll, houpání i zvuk, ztmaví obraz a čeká na tap - telefonát ani přepnutí záložky tak nespálí ani vteřinu dne
a hráč se nevrátí doprostřed rozjeté hry.

<a id="49-barvy-podle-denni-doby"></a>

### 4.9 Barvy podle denní doby

Barva je hlavní způsob, jak je čas cítit. BLIT386 je palette-first, takže je to práce pro paletu, ne pro sprity.

Sprity používají jen pár indexů a ty leží v **souvislých rampách** uvnitř jednoho rozsahu: obloha, moře, písek, objekty.
Denní hodiny prolínají rampy k barvám další fáze pomocí `BT.paletteFadeRange(start, end, cil, durationMs)`, tedy
rozsahově omezeně. HUD indexy leží **mimo** prolínaný rozsah, takže čítač, hodinky i lišta signálu zůstanou čitelné v
každou hodinu včetně tmy.

Fáze jsou čtyři, s klíčovými snímky a prolínáním mezi nimi:

| podíl dne | herní čas | fáze | nálada |
| --- | --- | --- | --- |
| 0.00 | 6:00 | ráno | světlá, růžová obloha, chladný písek |
| 0.30 | 10:48 | poledne | ostré světlo, bílá obloha, žlutý písek |
| 0.60 | 15:36 | večer | teplá oranžová, dlouhé stíny v barvě |
| 0.85 | 19:36 | noc | tmavá modř, šedý písek, svítící HUD |

Čtvrtá fáze je tam schválně: den končí ve 22:00 a bez noci by pípnutí hodinek přišlo do plného odpoledne. Písek v noci
nesmí zčernat úplně, jinak přestane být vidět, kde figurka je.

<a id="410-zvuk"></a>

### 4.10 Zvuk

Žádná hudba. V první verzi jen dva zvuky, oba z `AudioClip.synth` (průběh vlny a krátká obálka), takže nejsou potřeba
žádné soubory:

- **pípnutí detektoru** - jeden krátký klip, který se přehrává opakovaně s parametry `{ volume, pitch, pan }` podle 4.4.
  Jeden klip stačí, protože `pitch` je násobič rychlosti přehrávání.
- **zvuk vykopání** - krátký příjemný tón při vzniku panelu.

Ambience (racci, cikády, příboj) je mimo první verzi. Engine nemá pro ambience vlastní sběrnici - jsou jen `main`,
`music` a `sfx` - takže by se řídila hlasitostí jednotlivých hlasů, a až přijde, bude taky ze syntézy. Sample MP3 by
znamenaly shánět nebo tvořit zvuky a řešit licence.

Prohlížeč mlčí až do prvního doteku. Odemčení obstará tap na titulní obrazovce, který zároveň spouští hru.

<a id="411-hud"></a>

### 4.11 HUD

Nula textu, všechno jsou bitmapy, anglicky a bez lokalizace:

- **Čítač** (vlevo nahoře) - dvě číslice, kolik pokladů dnes máš.
- **Hodinky** (vpravo nahoře) - malý ciferník ve stylu starých digitálek, bez značky a bez chráněného designu. Ukazují
  herní čas ve 24hodinovém formátu s vedoucí nulou (`06:00`), dvojtečka bliká po sekundách. Ve 22:00 pípnou a ukončí
  běh.
- **Lišta signálu** (dole) - viz 4.5.

Číslice jsou vlastní sprite sheet (`0`-`9` a `:`). V první fázi vývoje je zastupuje `BT.systemPrint`, viz sekce 7.

<a id="412-obrazovky"></a>

### 4.12 Obrazovky

- **Title** - název hry a tap kamkoliv pro start; ten tap zároveň odemyká zvuk. Žádná nápověda k ovládání. Je to vědomě
  přijaté riziko: první běh může snadno skončit nulou. Kdyby se to ukázalo jako problém, nápověda je připravená jako
  pozdější doplněk.
- **Play** - všechno výše.
- **Pauza** - ztmavený obraz a čekání na tap; vzniká při ztrátě fokusu.
- **Results** - celkový počet, tablo šesti typů s počty (nenalezené jako šedá silueta), nejlepší skóre z `localStorage`,
  seed běhu a tap kamkoliv pro restart. Popisky u nejlepšího skóre a seedu jsou ikonky, ne slova, aby platilo pravidlo
  "nula textu". Restart resetuje stav bez reloadu stránky; jestli přitom přehodí seed, řídí `reseedOnRestart`.

```
+---------------------+
|        2 4          |   dnesni ulovek
|                     |
| (o) (o) (o) ... ... |   tablo 6 typu
|  x5  x4  x3   -   - |
|                     |
| [pohar] 2 9         |   nejlepsi skore
| [kostka] 1 3 3 7    |   seed behu
|   tap = znovu       |
+---------------------+
```

### 4.13 Seedovaný generátor náhody

Jeden seedovaný generátor vlastní veškerou náhodu: rozestupy pokladů, jejich pruhy, odchylky, typy i rozsyp dekorace.
Seed žije v configu a ukazuje se na výsledkové obrazovce, takže je každý běh reprodukovatelný - což se hodí při ladění
signálu, kde "ta jedna divná pláž" jinak nejde zopakovat.

---

<a id="5-filozofie-konfigurace"></a>

## 5. Filozofie konfigurace

Hra učí tím, že zve čtenáře měnit čísla. Tedy:

- **Žádná magická čísla.** Každá smysluplná hodnota je pojmenovaná konstanta s komentářem, co dělá a co se stane, když
  se změní.
- **Sdílené hodnoty -> `src/config.ts`.** Jen to, co potřebuje víc než jeden systém.
- **Lokální hodnoty -> blok `CONFIG` nahoře v souboru vlastníka.** Když o hodnotě ví jen detektor, bydlí nahoře v
  `Detector.ts`.

Sdílený config (ilustrativně, implementace upřesní):

```ts
export const CONFIG = {
  // --- Obrazovka -----------------------------------------------------------
  logicalWidth: 180,
  logicalHeight: 320,
  horizonY: 90, // kde obloha končí a začíná moře
  seaBandHeight: 18, // pruh moře pod horizontem, y 90..107
  playerRowY: 276, // řada, ve které se sbírá
  signalBarY: 288, // horní hrana pásma lišty signálu

  // --- Dráha ---------------------------------------------------------------
  laneCount: 5,
  laneWidth: 30,
  laneOriginX: 18, // levý okraj dráhy = šířka mořského pruhu vlevo
  startLane: 2,

  // --- Den -----------------------------------------------------------------
  dayLengthSeconds: 120,
  dayStartMinutes: 6 * 60,
  dayEndMinutes: 22 * 60,

  // --- Fáze dne (podíl 0..1) -----------------------------------------------
  phaseNoonAt: 0.3,
  phaseEveningAt: 0.6,
  phaseNightAt: 0.85,

  // --- Náhoda --------------------------------------------------------------
  seed: 1337,
  reseedOnRestart: true,

  // --- Hlasitost (0 = ticho, 1 = plná) -------------------------------------
  masterVolume: 0.8,
  sfxVolume: 1.0,

  // --- Kanály zpětné vazby (vypni a porovnej) ------------------------------
  beepAudio: true,
  beepDetectorBlink: true,
  beepHaptic: true,
} as const;
```

Lokální bloky, které nesou pocit ze hry:

```ts
// Detector.ts - tyč a její houpání.
const DETECTOR = {
  rodLengthPx: 68, // jak daleko hlava dosáhne od otočného bodu
  maxAngleDeg: 45, // krajní výkyv; s délkou 68 to dává ±48 px do stran
  sweepPeriodSeconds: 1.2, // celý cyklus vlevo-vpravo-vlevo
  pivotY: 262, // otočný bod tyče na obrazovce
};

// Signal.ts - jak se ze vzdálenosti stane zvuk.
const SIGNAL = {
  warningSeconds: 3.0, // jak dlouho předem se cíl ozve
  alignTightPx: 0, // hlava přesně nad pokladem
  alignLoosePx: 60, // hlava na kraji použitelného zaměření
  silencePx: 90, // za tímhle je úplné ticho
  beepIntervalFastMs: 110, // nejhustší tempo
  beepIntervalSlowMs: 700, // nejřidší tempo
  volumeFar: 0.25, // hlasitost na hranici tří vteřin
  volumeNear: 1.0, // hlasitost u nohou
  pitchFar: 1.0, // násobič výšky daleko (klip má 440 Hz)
  pitchNear: 2.0, // násobič výšky blízko
  distanceCurvePower: 1.5, // 1 = lineární, víc = urgentnější konec
  panRange: 0.6, // stereo rozsah podle polohy hlavy
};

// Treasures.ts - kde poklady leží.
const TREASURES = {
  minGapSeconds: 4.0, // nikdy dva cíle v dosahu naráz
  avgGapSeconds: 4.5, // dává ~27 pokladů na dvouminutový běh
  laneJitterPx: 6, // odchylka od středu pruhu
  collectTolerancePx: 14, // jak blízko musí hráč stát, aby vykopal
  typeCount: 6,
};

// Beach.ts - jak se svět sune.
const BEACH = {
  travelSeconds: 8.0, // z horizontu k nohám
  perspectivePower: 2.2, // vyšší = ostřejší perspektiva
  decorationPerSecond: 3, // hustota rozsypané dekorace
  surfLinePeriodSeconds: 2.5,
};

// Player.ts - krokování.
const PLAYER = {
  stepSeconds: 0.15, // jak dlouho trvá přesun o pruh
  queuedSteps: 1, // kolik tapů se uloží během přesunu
};

// FoundPanel.ts - panel nálezu.
const FOUND_PANEL = {
  newTypeSeconds: 4.0,
  knownTypeSeconds: 1.5,
  raiseSeconds: 0.2, // zvednutí předmětu nad hlavu
  slideOutSeconds: 0.25,
};
```

Rozvržení paletových slotů (upřesní implementace):

```
0            průhledná (engine)
1  ..  4     obloha        \
5  ..  7     moře           |  světové rampy, prolínají se s denní dobou
8  .. 12     písek          |  paletteFadeRange(1, 18, cil, ms)
13 .. 18     objekty        /
19 .. 24     HUD: čítač, hodinky, lišta signálu, panel  (nikdy se neprolínají)
```

---

## 6. Modulová mapa

Každý soubor je malý a odstranitelný. Když se dva čtou líp pohromadě, sloučí se - jasnost je přednější než obřad.

```
PLAN_new.md            tenhle dokument (živý)
TODO_after.md          rozpad na úkoly
README.md              úvod pro člověka
index.html
vite.config.js
package.json
public/
  sprites/             obrázky, root-relativní cesty (NE src/assets/)
src/
  game.ts              bootstrap, stavový automat Title / Play / Pause / Results
  config.ts            sdílená nastavení (sekce 5)
  rng/
    Rng.ts             jeden seedovaný generátor pro celou hru
  palette/
    palette.ts         rampy, čtyři klíčové snímky, prolínání podle fáze
  game/
    Lanes.ts           mřížka pruhů: střed pruhu, clamp, převod x na pruh
    Beach.ts           scroll, perspektiva, obloha, moře, dekorace
    Player.ts          pruh, tapy, animace přesunu, kreslení
    Detector.ts        houpání, pozice hlavy, kreslení tyče a hrotu
    Treasures.ts       seedované rozmístění, sběr u nohou, mizení minutých
    Signal.ts          nejbližší cíl -> tempo, hlasitost, výška, pan
    Backpack.ts        počty podle typu, příznak "poprvé"
    FoundPanel.ts      panel nálezu a zastavení hry
    DayClock.ts        herní čas, fáze, konec dne
    Pause.ts           jednotná pauza (panel i ztráta fokusu)
    Haptics.ts         obalené navigator.vibrate
  hud/
    Counter.ts         čítač vlevo nahoře
    Watch.ts           hodinky vpravo nahoře, pípnutí ve 22:00
    SignalBar.ts       lišta signálu dole
  audio/
    Sfx.ts             syntéza pípnutí a zvuku vykopání
  ui/
    TitleScreen.ts     tap spustí hru a odemkne zvuk
    ResultsScreen.ts   počet, tablo, nejlepší skóre, seed, restart
```

Vstupní soubor zůstává `src/game.ts` - odkazuje na něj `index.html` i `.blit/manifest.json`.

---

<a id="7-poradi-praci"></a>

## 7. Pořadí prací

**Nejdřív hratelnost na primitivech, teprve pak grafika.** Celý herní cyklus se postaví z `BT.drawRectFill`,
`BT.drawLine` a `BT.drawPixel`, číslice zastoupí `BT.systemPrint`: hráč je obdélník, poklad kolečko, panel rámeček.
Většina práce je stejně v ladění signálu a tempa, a to jde ladit na krabičkách. Grafika pak jednotlivé kusy vymění, aniž
by se sáhlo do logiky.

**Fáze 1 - první spustitelná verze.** Palety a rampy, mřížka pruhů, scrollující pláž s mořem, hráč a tapy, houpající se
detektor, poklady a sběr u nohou, signál, zvuk, lišta, denní hodiny, pauza, batoh, panel nálezu, HUD, obrazovky Title /
Play / Results, barvy podle denní doby.

Hotovo, když: spustíš hru tapem, podle zvuku a lišty najdeš poklady, vidíš panely s nálezy, doběhne den, uvidíš výsledky
s tablem a restartuješ - všechno bez sáhnutí do kódu.

**Fáze 2 - grafika a doladění.** Nakreslené sprity místo primitiv, bitmapové číslice místo `systemPrint`, stopy v písku,
vlnící se příboj a bohatší dekorace, aktualizace dokumentace.

**Fáze 3 - volitelné.** Ambience podle fáze ze syntézy, případně nápověda pro nové hráče, pokud se ukáže, že bez ní lidé
nechápou ovládání.

---

<a id="8-assety"></a>

## 8. Assety

Všechno vlastní. Každý sprite jen na pár paletových indexů, z rampy objektů.

- Figurka zezadu, ve dvou podobách: normální a se zvednutým nálezem nad hlavou.
- Cívka detektoru (symetrický kroužek, nerotuje).
- Stopa v písku.
- Šest pokladů: hvězdice, mušle, mince, plechovka, střep skla, klíč.
- Dekorace: smetí, kroužky po kelímcích, tmavé tečky.
- Bitmapové číslice `0`-`9` a `:` pro čítač a hodinky.
- Ciferník hodinek (obecné digitálky, bez značky).
- Odznak NEW pro panel nálezu.
- Ikonky pro výsledky: pohár (nejlepší skóre) a kostka (seed).

Abeceda A-Z se **nedělá** - v celé hře není jediné slovo.

---

## 9. Ne-cíle

Vypsané, aby je nikdo nezačal stavět z reflexu:

- Žádná rotace ani škálování spritů (engine to neumí). Nic se neotáčí a nemění velikost s hloubkou.
- Žádné falešné signály ani nesmyslné cíle - všechno zakopané je k sebrání.
- Žádná vzácnost ani body podle typu; všechno má hodnotu jedna.
- Žádná křivka obtížnosti ani hustoty; hustota je konstantní.
- Žádný fullscreen post-process, a tedy ani CRT efekt: potřebuje WebGPU a rozbíjí Canvas 2D fallback, což je tvrdé
  pravidlo projektu.
- Žádná hudba.
- Žádná lokalizace a vůbec žádný text ve hře.
- Žádná trvalá sbírka napříč běhy; ukládá se jen nejlepší skóre.
- Žádná ambience v první verzi.
- Žádný onboarding v první verzi.
- Žádné ovládání chůze - hráč mění jen pruh.

---

<a id="10-udrzovani-dokumentu"></a>

## 10. Udržování dokumentu

Tenhle soubor je zdroj pravdy pro _záměr_, kód je zdroj pravdy pro _chování_. Nesmí se rozejít.

- **Když změna kódu změní chování, uprav v témže commitu i tenhle soubor.** Nový systém, přejmenovaný soubor, jiná
  výchozí hodnota, zahozená funkce - všechno sem patří.
- **Náčrt configu v sekci 5 drž poctivý.** Nemusí být úplný, ale nesmí lhát.
- **Rozhodnutí, která se ustálila, vytáhni z režimu "přepínač".** Sběrný bod už není přepínač - kope se u nohou a
  hotovo.
- **Nepiš sem** dočasné TODO, poznámky ke commitům ani nic s datem. To patří do `TODO_after.md`, do issues nebo do
  commit messages.
- **Když si tenhle soubor a kód odporují, je to chyba.** Oprav to, co je špatně, a poznamenej to.

---

## 11. Co se změnilo proti původnímu PLAN.md

Pro čtenáře, který zná starší verzi. Původní návrh měl jiný model ovládání a několik vnitřních rozporů; tady je rozdíl v
kostce:

| téma | původně | teď |
| --- | --- | --- |
| chůze | hráč nejde dopředu, jen krokuje do stran | jde sám, nepřetržitě; hráč mění jen pruh |
| poloha | spojitá napříč pásem | 5 neviditelných pruhů po 30 px |
| tyč detektoru | natáčí se stejným vstupem jako chůze | houpe se sama, na vstupu nezávisle |
| tempo pípání | vzdálenost | zaměření hlavy |
| hlasitost | konstantní, schválně | vzdálenost, spolu s výškou tónu |
| stereo | neřešeno | pan podle polohy hlavy |
| sběr | přepínač hlava/tělo, doporučeno hlava | pevně u nohou ve správném pruhu |
| nález | odhalení uprostřed, hra běží dál | panel s batohem, zastaví i hodiny |
| batoh a typy | neexistoval | 6 typů, počty a odznak NEW na jeden běh |
| kanály | puls rámečku + blikání hrotu | lišta signálu + blikání hrotu, puls zrušen |
| haptika | při každém pípnutí | jen při událostech |
| fáze dne | tři (ráno, poledne, večer) | čtyři, přibyla noc |
| moře | nebylo | pruh pod horizontem a svislý pruh vlevo |
| pauza při blur | jen hodiny | celá hra, návrat tapem |
| assety | `src/assets/`, kreslí se první | `public/`, primitiva první |
| CRT efekt | stretch cíl | zrušeno, porušuje pravidlo projektu |
| ambience | součást návrhu, MP3 fallback | mimo první verzi, pak jen syntéza |
