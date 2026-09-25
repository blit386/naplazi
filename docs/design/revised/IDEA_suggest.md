# Návrhy na zjednodušení kódu

## Shrnutí kontroly

Projekt je funkční a jeho základní architektura dává smysl:

- herní stav se mění pouze v `update()`,
- kreslení zůstává v `render()`,
- pozice používané pro kreslení jsou celočíselné,
- operace BLIT386 používají veřejné rozhraní `BT`,
- asynchronní načítání assetů je správně `await`ované,
- riziková browser API volaná z herní smyčky jsou chráněná proti výjimkám,
- systémy jsou rozdělené podle odpovědnosti,
- produkční build a TypeScript kontrola procházejí.

Největším problémem není chybná implementace, ale poměr mezi jednoduchostí hry a množstvím textu a vazeb, které je nutné
při čtení držet v hlavě.

Zdrojové soubory v `src/` mají přibližně 4 690 řádků. Z toho je přibližně 2 524 řádků komentářů. Některé hlavní soubory
obsahují více komentářů než implementace:

| Soubor | Celkem řádků | Komentáře | Prázdné | Ostatní |
| --- | ---: | ---: | ---: | ---: |
| `src/game.ts` | 610 | 388 | 58 | 164 |
| `src/game/Beach.ts` | 530 | 312 | 39 | 179 |
| `src/game/DayClock.ts` | 289 | 156 | 29 | 104 |
| `src/game/Detector.ts` | 219 | 119 | 20 | 80 |
| `src/game/Pickup.ts` | 329 | 181 | 26 | 122 |
| `src/game/Player.ts` | 316 | 147 | 36 | 133 |
| `src/game/Treasures.ts` | 282 | 160 | 23 | 99 |
| `src/audio/Ambience.ts` | 275 | 150 | 20 | 105 |
| `src/audio/Sfx.ts` | 292 | 165 | 22 | 105 |

Zjednodušení by proto mělo proběhnout především ve čtyřech směrech:

1. zkrátit a přesunout historické komentáře,
2. rozdělit orchestrace v `Game` do krátkých pojmenovaných metod,
3. odstranit překvapivé závislosti mezi moduly,
4. podložit refaktoring několika testy čisté logiky.

## 1. Výrazně zkrátit komentáře v implementaci

### Současný stav

Komentáře často:

- odkazují na historické úkoly jako `TASK-014`,
- popisují předchozí nefunkční variantu,
- dokazují chování interního kódu BLIT386,
- opakují dokumentaci z `AGENTS.md`,
- popisují každý jednotlivý řádek bez přidání nové informace,
- vysvětlují stejné rozhodnutí v několika souborech současně.

Tyto informace byly užitečné při vývoji a QA, ale v implementaci zakrývají vlastní tok programu. Například jednoduchá
registrace callbacku v `src/game.ts` má před sebou několik odstavců historie úkolu a popisu vztahů mezi systémy.

### Návrh

V kódu ponechat pouze komentáře, které vysvětlují nečekané nebo bezpečnostně důležité rozhodnutí:

- proč se start ambience odkládá do doby, než je audio skutečně odemčené,
- proč se po změně hodnot palety nesmí volat `BT.spritesRefresh()`,
- proč je pořadí některých `update()` volání důležité,
- proč jsou browser API chráněná `try/catch`,
- proč se při restartu znovu nepřipojuje listener viditelnosti stránky,
- jak funguje projekce světové hloubky na obrazovku.

Historické poznámky, trasování enginu a výsledky QA přesunout do:

- `AGENTS.md`, pokud jde o pravidlo závazné pro další práci,
- `docs/architecture.md`, pokud jde o návrhové rozhodnutí,
- případně `docs/qa-notes.md`, pokud jde pouze o ověřovací historii.

### Příklad

Místo několika odstavců:

```ts
// AudioContext is unlocked asynchronously after the input event. Keep retrying on later frames;
// BT.soundPlay calls made while unlocking are dropped.
private ambiencePendingStart = false;
```

Komentáře by měly vysvětlovat „proč“, nikoliv převyprávět „co“ říká následující řádek.

### Přínos

- největší okamžité zlepšení čitelnosti,
- nižší riziko, že komentář časem přestane odpovídat kódu,
- rychlejší orientace v hlavní herní smyčce,
- reálně lze odstranit přibližně 1 500 až 2 000 řádků bez změny chování.

## 2. Rozdělit `Game` do menších privátních metod

### Současný stav

`src/game.ts` správně funguje jako composition root, ale současně v jednom souboru:

- nastavuje vstup,
- vytváří paletu,
- načítá zdroje,
- konstruuje všechny systémy,
- registruje všechny události,
- obsluhuje stav obrazovek,
- aktualizuje gameplay,
- kreslí svět,
- dokončuje běh,
- restartuje běh.

Samotná třída nemusí být rozdělena do dalších tříd. Stačí pojmenovat její hlavní části.

### Návrh struktury

```ts
class Game {
  async init(): Promise<boolean> {
    this.configureInput();
    await this.loadResources();
    this.createSystems();
    this.wireEvents();
    return true;
  }

  update(): void {
    switch (this.screenState) {
      case 'title':
        this.updateTitle();
        return;
      case 'results':
        this.updateResults();
        return;
      case 'play':
        this.updatePlay(BT.deltaSeconds);
    }
  }

  render(): void {
    BT.clear(SKY_ZENITH);
    this.renderWorld();
    this.renderCurrentScreen();
  }
}
```

Doporučené metody:

```ts
private configureInput(): void
private createSystems(): void
private wireEvents(): void
private updateTitle(): void
private updateResults(): void
private updatePlay(deltaSeconds: number): void
private renderWorld(): void
private renderCurrentScreen(): void
private finishRun(): void
private restart(): void
```

Není potřeba mechanicky vytvářet metodu pro každý řádek. Smyslem je, aby `init()`, `update()` a `render()` na první
pohled ukazovaly životní cyklus hry.

### Přínos

- kratší hlavní metody,
- pojmenování nahrazuje část komentářů,
- snazší kontrola pořadí systémů,
- jednodušší budoucí testování orchestrace.

## 3. Načítat nezávislé zdroje paralelně

### Současný stav

Sprite sheets, syntéza SFX a syntéza ambience jsou nezávislé asynchronní operace, ale v `init()` probíhají postupně.

### Návrh

Po vytvoření palety je spustit společně:

```ts
const palette = buildPalette(REFERENCE_PHASE);
BT.paletteSet(palette);

const [sprites, sfx, ambience] = await Promise.all([loadSpriteSheets(palette), Sfx.create(), Ambience.create()]);

this.sprites = sprites;
this.sfx = sfx;
this.ambience = ambience;
```

Systémy závislé na těchto zdrojích se vytvoří až poté.

### Přínos

- kratší inicializace,
- potenciálně rychlejší start hry,
- závislosti inicializace jsou čitelnější.

### Riziko

Je nutné zachovat `BT.paletteSet(palette)` před `loadSpriteSheets(palette)`. Paralelizovat lze až operace, které už mají
připravenou paletu a nejsou navzájem závislé.

## 4. Oddělit sdílenou geometrii od konkrétních systémů

### Současný stav

Několik modulů importuje konstantu z jiné herní třídy jen proto, že tam byla původně definována:

- `Player.ts` importuje maximální dosah detektoru z `Detector.ts`,
- `Detector.ts` importuje projekci a pozici hráče z `Beach.ts`,
- `Pickup.ts` importuje výšku HUD z `Player.ts`,
- `Watch.ts` importuje výšku HUD z `Player.ts`,
- `Treasures.ts` importuje hloubku světa a rychlost posunu z `Beach.ts`,
- `Sfx.ts` importuje beep tuning z `Detector.ts`.

To vytváří mentálně překvapivé vazby. Například HUD není součást hráče a zvuk není součást detektoru, přesto mezi těmito
moduly existují importy.

### Návrh

Vytvořit malý modul `src/game/world.ts`:

```ts
export const WORLD_DEPTH = ...;
export const WORLD_SCROLL_SPEED_PX_PER_SEC = ...;
export const PLAYER_WORLD_Y = ...;
export const HUD_BAND_HEIGHT_PX = 24;

export function depthToScreenY(worldY: number): number {
    // současný výpočet
}
```

Pro tuning detekce vytvořit například `src/game/detectorConfig.ts`:

```ts
export const DETECTOR_CONFIG = {
  detectRadiusPx: 64,
  silenceThresholdPx: 80,
  beepIntervalFastMs: 90,
  beepIntervalSlowMs: 700,
  beepCurvePower: 2,
  collectRadiusPx: 8,
  collectionMode: 'head',
} as const;
```

Vizuální a pohybové parametry tyče mohou zůstat lokálně v `Detector.ts`. Sdílené hodnoty čtené zvukem a treasures nejsou
interním detailem třídy `Detector`.

### Přínos

- jasnější vlastnictví konstant,
- méně překvapivé importy,
- jednodušší změny HUD, světa nebo detekčního modelu,
- nižší riziko budoucích kruhových závislostí.

## 5. Sloučit callbacky jedné herní události

### Současný stav

Na nalezení treasure jsou v `Game.init()` registrovány dva samostatné listenery:

```ts
this.treasures.onCollect(() => {
  this.sfx.playCollectSound();
});

this.treasures.onCollect((_worldX, _worldY, kind) => {
  this.pickup.spawn(kind);
});
```

Podpora více listenerů v `Treasures` je obecně v pořádku. Aktuální orchestrace je ale čitelnější jako jedna reakce na
jednu doménovou událost:

```ts
this.treasures.onCollect((_worldX, _worldY, kind) => {
  this.sfx.playCollectSound();
  this.pickup.spawn(kind);
});
```

Ještě čitelnější varianta po rozdělení `Game`:

```ts
this.treasures.onCollect((_x, _y, kind) => this.handleTreasureCollected(kind));
```

```ts
private handleTreasureCollected(kind: number): void {
    this.sfx.playCollectSound();
    this.pickup.spawn(kind);
}
```

### Přínos

- všechny reakce na nalezení předmětu jsou pohromadě,
- méně registračního boilerplate,
- jednodušší dohledání výsledku události.

## 6. Přesunout dokončení dne do pojmenované metody

### Současný stav

Anonymní callback `dayClock.onDayEnd()`:

- zahraje alarm,
- zastaví ambience,
- uloží high score,
- přepne obrazovku.

To je významný stavový přechod a zaslouží si jméno.

### Návrh

```ts
this.dayClock.onDayEnd(() => this.finishRun());
```

```ts
private finishRun(): void {
    this.sfx.playWatchAlarm();
    this.ambience.stop();
    this.highScore = saveHighScoreIfBetter(this.treasures.collectedCount);
    this.screenState = 'results';
}
```

Podobně lze pojmenovat změnu fáze:

```ts
this.dayClock.onPhaseChange((phase) => this.changePhase(phase));
```

### Přínos

- callback registrace ukazuje záměr,
- stavový přechod lze najít podle názvu,
- méně potřeby dlouhého vysvětlujícího komentáře.

## 7. Zjednodušit výběr collector pozice

### Současný stav

`Game.update()` samostatně vybírá X a Y:

```ts
const collectorWorldX = COLLECTION_MODE === 'head' ? this.detector.headWorldX : this.player.worldX;
const collectorWorldY = COLLECTION_MODE === 'head' ? this.detector.headWorldY : this.player.worldY;
```

### Návrh

Použít malou hodnotu reprezentující bod:

```ts
const collector =
  COLLECTION_MODE === 'head'
    ? { x: this.detector.headWorldX, y: this.detector.headWorldY }
    : { x: this.player.worldX, y: this.player.worldY };

this.treasures.update(deltaSeconds, collector.x, collector.y);
```

V hot path není vhodné vytvářet nový objekt každý frame. Lepší finální varianta proto je buď:

- přidat `Treasures.updateHead(...)` pouze pokud se režim mění za běhu, nebo
- protože `COLLECTION_MODE` je compile-time konfigurace, nechat dnešní dva ternární výrazy,
- případně předat pozici přes dvě lokální proměnné z privátní metody, která používá znovupoužitelnou strukturu.

### Doporučení

Toto místo není prioritou. Současný zápis je výkonný a srozumitelný. Zjednodušovat ho objektem alokovaným každý frame by
bylo horší. Smysluplnější je pouze přesunout `COLLECTION_MODE` do sdílené konfigurace.

## 8. Zachovat explicitní pořadí gameplay systémů

Následující pořadí v `update()` je důležité:

1. `dayClock.update()`,
2. případné okamžité ukončení frame,
3. `beach.update()`,
4. `player.update()`,
5. `detector.update()`,
6. `treasures.update()`,
7. `sfx.update()`,
8. `signals.update()`,
9. `pickup.update()`.

Nedoporučuje se nahrazovat ho obecným polem systémů:

```ts
for (const system of this.systems) {
  system.update(deltaSeconds);
}
```

Jednotlivé systémy mají odlišné argumenty a skutečné datové závislosti. Explicitní volání je zde jednodušší a
bezpečnější. Po přesunu do `updatePlay(deltaSeconds)` bude pořadí dostatečně čitelné i bez rozsáhlých komentářů.

## 9. Zachovat explicitní restart

Seznam:

```ts
this.beach.reset();
this.player.reset();
this.detector.reset();
this.treasures.reset();
this.pickup.reset();
this.sfx.reset();
this.ambience.reset();
this.signals.reset();
this.dayClock.reset();
```

je sice opakující se, ale má jednu podstatnou výhodu: každý nový systém musí být vědomě přidán do restartu.

Obecný seznam `Resettable[]` by zkrátil několik řádků, ale mohl by:

- skrýt důležité pořadí,
- míchat celoherní a per-run systémy,
- svádět k automatickému resetování objektů, které se resetovat nemají.

Doporučení je explicitní seznam zachovat. Stačí zkrátit komentář nad ním a případně reset logiku oddělit do:

```ts
private resetRunSystems(): void
```

## 10. Zjednodušit deklarace stavu v `Game`

### Současný stav

Třída `Game` obsahuje velké množství veřejně vypadajících polí s definite-assignment operátorem:

```ts
sprites!: SpriteSheets;
beach!: Beach;
player!: Player;
detector!: Detector;
// ...
```

Všechna jsou interním detailem třídy.

### Návrh

Označit je `private`, pokud hot reload mechanismus nebo jiné rozhraní nepotřebuje veřejný přístup:

```ts
private sprites!: SpriteSheets;
private beach!: Beach;
private player!: Player;
private detector!: Detector;
```

Pokud by hot reload snapshot závisel na enumeraci veřejných vlastností, je před touto změnou nutné ověřit chování
BLIT386. Samotné TypeScript `private` však za běhu vlastnost neschovává.

Nedoporučuje se vytvářet velký objekt `systems`, pokud by to pouze přidalo další úroveň:

```ts
this.systems.world.beach;
```

Přímá pole jsou pro takto malou hru jednodušší.

## 11. Udržet UI geometrické výpočty lokální, ale sdílet skutečné invarianty

`Counter`, `Watch`, `TitleScreen` a `ResultsScreen` správně počítají své pozice v konstruktorech místo každého frame. To
je dobrý vzor a měl by zůstat.

Sdílet má smysl pouze:

- výšku HUD pásu,
- velikosti buněk sprite sheetů,
- společné palette sloty,
- společné obrazovkové rozměry.

Není vhodné vytvářet obecný layout framework. UI je malé a explicitní `Rect2i` a `Vector2i` hodnoty jsou v duchu BLIT386
jednodušší než abstraktní constraints nebo responsivní layout.

## 12. Prověřit návrat snapshotů z `Treasures`

`getTreasureSnapshot()` vrací interní pole jako read-only typ:

```ts
getTreasureSnapshot(): ReadonlyArray<Readonly<Treasure>> {
    return this.items;
}
```

`readonly` zde chrání pouze TypeScript volajícího. Za běhu je to stále stejné mutovatelné pole a stejné objekty.

Pokud metoda existuje pouze pro testy, jsou možné dvě varianty:

1. ponechat ji a jasně ji pojmenovat jako debug/test view,
2. vracet kopii:

```ts
return this.items.map((item) => ({ ...item }));
```

Kopie by se neměla volat v herní smyčce, ale pro test je bezpečnější. Pokud snapshot nikdo nepoužívá, lze metodu po
zavedení testů odstranit nebo přesunout do testovacího helperu.

## 13. Zjednodušit konfiguraci a její validaci

Konfigurace je nyní rozdělená mezi:

- globální `CONFIG`,
- lokální objekty `BEACH`, `PLAYER`, `DETECTOR`, `TREASURES`, `SFX`, `AMBIENCE`, `SIGNALS`, `WATCH` a další.

Princip „globální pouze to, co používá více systémů“ je dobrý. Problém vzniká tam, kde údaj používá více systémů, ale
zůstává exportovaný z jednoho konkrétního systému.

Doporučené pravidlo:

- lokální vizuální nebo implementační tuning ponechat u systému,
- sdílené herní invarianty přesunout do `config.ts`, `world.ts` nebo účelového config modulu,
- validační kontroly provést jednou během inicializace.

Lze přidat čistou funkci:

```ts
export function validateConfig(): void {
  // throw před startem hry při neplatné statické konfiguraci
}
```

Volat ji v `init()` před vytvořením systémů. Výjimka během inicializace je vhodnější než výjimka později v `update()`.

Validace by mohla ověřit:

- `logicalWidth` a `logicalHeight` jsou kladná celá čísla,
- `horizonY` leží uvnitř obrazovky,
- `dayLengthSeconds > 0`,
- detector intervaly a radiusy dávají smysl,
- HUD se vejde na obrazovku,
- sprite indexy odpovídají deklarované geometrii.

## 14. Doplnit minimální automatické testy

Projekt nemá testovací script. Build ověřuje integraci a TypeScript typy, ale neověřuje herní logiku.

Před větším zjednodušením je vhodné přidat malé testy především pro čisté části:

### Doporučené testy

- `Rng`
  - stejný seed produkuje stejnou sekvenci,
  - `reset()` obnoví původní sekvenci,
  - reset s novým seedem aktualizuje `seed`.
- `computeBeepIntervalMs()`
  - vzdálenost mimo threshold vrací `null`,
  - nula vrací nejrychlejší interval,
  - detekční radius vrací pomalý interval,
  - výsledek je monotónní.
- `DayClock`
  - správné fáze dne,
  - správný konec dne,
  - callback konce dne se spustí právě jednou,
  - nulová nebo chybná délka neprodukuje `NaN`.
- high score
  - chybějící hodnota vrací nulu,
  - poškozená hodnota vrací nulu,
  - horší skóre nepřepíše lepší,
  - výjimka `localStorage` nezastaví tok.
- čas na hodinkách
  - formát `06:00`,
  - přechody hodin,
  - koncový čas.
- projekce světa
  - horizont a spodní hranice,
  - monotónnost,
  - žádné `NaN` pro platný rozsah.

### Proč testy zjednodušují kód

Část dnešních velmi dlouhých komentářů funguje jako ruční důkaz správnosti. Test může tento důkaz zachytit přesněji a
průběžně ověřovat. Komentář pak může zůstat krátký.

## 15. Opravit automaticky zjistitelné formátovací problémy

Biome našel sedm problémů se seřazením importů:

- `src/game.ts`,
- `src/game/Detector.ts`,
- `src/game/Pickup.ts`,
- `src/game/Player.ts`,
- `src/game/Treasures.ts`,
- `src/hud/Counter.ts`,
- `src/sprites.ts`.

Jde o bezpečně automaticky opravitelné změny:

```sh
pnpm exec biome check --write src
```

Před použitím je vhodné zkontrolovat diff, protože příkaz může aplikovat i další bezpečné formátovací opravy podle
aktuální konfigurace.

Do CI nebo běžné kontroly projektu stačí používat existující:

```sh
pnpm run typecheck
pnpm run lint
pnpm run build
```

## 16. Co nezjednodušovat

Některé části vypadají defenzivně nebo explicitně, ale mají dobrý důvod.

### Zachovat `ambiencePendingStart`

Audio unlock není synchronní s prvním gestem a jednorázový `BT.soundPlay` může být během odemykání zahozen. Opakovaná
kontrola v následujících `play` framech je správné řešení.

### Zachovat `try/catch` kolem browser API

`navigator.vibrate()` a `localStorage` mohou vyhodit výjimku. Protože BLIT386 nemá ochranný `try/catch` kolem
`update()`, nechráněná výjimka může zastavit celou herní smyčku.

### Zachovat oddělení `update()` a `render()`

Render metody nemají měnit stav. Současná architektura toto pravidlo dodržuje.

### Zachovat celočíselné vykreslovací souřadnice

Výpočty mohou interně používat desetinná čísla, ale před předáním do BLIT386 kreslicích metod musí být pozice
zaokrouhlené a zabalené do `Vector2i` nebo `Rect2i`.

### Nevolat `BT.spritesRefresh()` po změně hodnot palety

Projekt zachovává stejnou strukturu palette slotů a mění pouze jejich barvy. Varování enginu při restartu je v této
verzi bezpodmínečné a není důvodem k refreshi sprite sheets.

### Nevytvářet obecný ECS nebo systémový framework

Hra má malý počet konkrétních systémů s jasnými závislostmi. ECS, dependency injection container nebo obecný event bus
by přidaly více kódu, než by odstranily.

### Nezavádět obecný UI framework

Bitmap HUD má několik pevných prvků. Přímé výpočty s `Rect2i` a `Vector2i` jsou jednodušší než univerzální layout
abstrakce.

## Doporučený cílový tvar

Po refaktoringu by hlavní soubor mohl přibližně vypadat takto:

```ts
class Game {
  private screenState: ScreenState = 'title';
  private ambiencePendingStart = false;

  configure(): Partial<HardwareSettings> {
    return {/* hardware settings */};
  }

  async init(): Promise<boolean> {
    this.configureInput();
    validateConfig();

    const palette = buildPalette(REFERENCE_PHASE);
    BT.paletteSet(palette);

    await this.loadResources(palette);
    this.createSystems();
    this.wireEvents();
    return true;
  }

  update(): void {
    switch (this.screenState) {
      case 'title':
        this.updateTitle();
        return;
      case 'results':
        this.updateResults();
        return;
      case 'play':
        this.updatePlay(BT.deltaSeconds);
    }
  }

  render(): void {
    BT.clear(SKY_ZENITH);
    this.renderWorld();

    switch (this.screenState) {
      case 'title':
        this.titleScreen.render();
        return;
      case 'results':
        this.resultsScreen.render(this.treasures.collectedCount, this.rng.seed, this.highScore);
        return;
      case 'play':
        this.renderHud();
    }
  }
}
```

Toto není návrh na přesné mechanické přepsání. Ukazuje cílovou vlastnost: hlavní lifecycle metody mají být natolik
krátké, aby šel celý tok hry pochopit bez rolování přes několik obrazovek komentářů.

## Doporučené pořadí realizace

### Fáze 1: Bez změny chování

1. Přidat základní testy čistých funkcí.
2. Opravit pořadí importů pomocí Biome.
3. Přesunout historické a QA komentáře do dokumentace.
4. Zkrátit komentáře v `src/`.
5. Po každém kroku spustit typecheck a build.

### Fáze 2: Lokální refaktoring `Game`

1. Vyčlenit `finishRun()`.
2. Sloučit reakce na collection event.
3. Vyčlenit `wireEvents()`.
4. Vyčlenit `updatePlay()`.
5. Vyčlenit `renderWorld()` a `renderHud()`.
6. Paralelizovat načítání nezávislých zdrojů.

### Fáze 3: Vyčištění závislostí

1. Vytvořit `game/world.ts`.
2. Přesunout `HUD_BAND_HEIGHT_PX`.
3. Přesunout světovou projekci a světové konstanty.
4. Oddělit sdílený detector/beep tuning od implementace `Detector`.
5. Zkontrolovat import graf a odstranit zbylé vazby typu UI -> Player nebo Audio -> Detector.

### Fáze 4: Finální kontrola

1. `pnpm run typecheck`
2. `pnpm run lint`
3. `pnpm run build`
4. Ručně ověřit title -> play -> results -> restart.
5. Ověřit klávesnici, myš a touch.
6. Ověřit první audio unlock a ambience po restartu.
7. Ověřit změny denní fáze a palety.
8. Ověřit, že restart resetuje skóre, předměty, signály, pickup i čas.

## Priorita návrhů

| Priorita | Návrh | Přínos | Riziko |
| --- | --- | --- | --- |
| 1 | Zkrátit a přesunout komentáře | Velmi vysoký | Nízké |
| 2 | Rozdělit metody v `Game` | Vysoký | Nízké |
| 3 | Přidat testy čisté logiky | Vysoký | Nízké |
| 4 | Přesunout sdílené konstanty | Střední až vysoký | Střední |
| 5 | Paralelizovat načítání | Střední | Nízké |
| 6 | Sloučit související callbacky | Menší až střední | Nízké |
| 7 | Přidat validaci konfigurace | Střední | Nízké |
| 8 | Další abstrakce systémů nebo UI | Malý nebo záporný | Vysoké |

## Závěr

Kód nepotřebuje velký architektonický přepis. Herní systémy jsou už rozdělené rozumně a nejrizikovější okrajové případy
jsou ošetřené.

Nejlepší zjednodušení je redukční:

- méně historických komentářů v implementaci,
- kratší lifecycle metody,
- méně vazeb mezi moduly kvůli sdíleným konstantám,
- několik testů místo ručních důkazů v komentářích,
- žádné nové obecné frameworky.

Cílem by mělo být zachovat současné chování a obranné vlastnosti, ale umožnit pochopit hlavní tok hry během několika
minut místo pročítání tisíců řádků vysvětlení.
