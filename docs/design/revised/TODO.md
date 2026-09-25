# TODO: Beach Detector

Rozpad [`PLAN_new.md`](./PLAN_new.md) na proveditelné úkoly pro projekt `naplazi` (BLIT386 1.4.0, TypeScript, pnpm,
Vite).

Toto je jediný platný seznam nehotových úkolů. Dokončené TASK-001 až TASK-004 zde už nejsou. Spolu s `PLAN_new.md` má
tento soubor stačit na postavení celé hry: `PLAN_new.md` říká _proč a jak se to má chovat_, tento soubor _co udělat a v
jakém pořadí_.

## Cíl

Hra podle `PLAN_new.md`: portrétní pixelová hra, ve které figurka sama jde po pláži v pěti neviditelných pruzích, hráč
tapy mění pruh, sám se houpající detektor pípá podle vzdálenosti a zaměření, nálezy se vykopávají u nohou a otevírají
panel s batohem, a to celé stihne za dvě reálné minuty herního dne od 6:00 do 22:00.

## Současný stav

- Hotovo: `src/game.ts` (kostra, portrét, vypnutý overlay), `src/config.ts`, `src/rng/Rng.ts`. Prázdné složky
  `palette/`, `game/`, `hud/`, `audio/`, `ui/` čekají.
- `public/` obsahuje jen `.gitkeep` - žádné assety zatím nejsou a v první fázi ani nebudou potřeba.
- Baseline je zelený: `pnpm typecheck`, `pnpm lint` a `pnpm format:check` procházejí.
- `src/config.ts` odpovídá **starému** plánu a v [TASK-005](#task-005-paletove-rampy) se aktualizuje podle sekce 5
  `PLAN_new.md`.

## Změny proti původnímu plánu úkolů

| původní úkol | osud |
| --- | --- |
| TASK-005 palety | přepracováno: čtyři fáze místo tří, pevné rozvržení slotů |
| TASK-006 assety | **přesunuto do fáze 2** - nejdřív se hraje na primitivech |
| TASK-007 pláž | přepracováno: přibylo moře a `worldY` v sekundách chůze |
| TASK-008 hráč | přepracováno: pruhy místo spojitého pohybu, automatická chůze |
| TASK-009 detektor | přepracováno: houpe se sám, vstup s ním nic nedělá |
| TASK-010 poklady | přepracováno: rozestupy v sekundách, sběr u nohou |
| TASK-011 zvuk | přepracováno: hlasitost, výška a pan podle 4.4 |
| TASK-012 hodiny | přepracováno: čtyři fáze, pauza sdílená s panelem |
| TASK-013 HUD | přepracováno: v první fázi `systemPrint` |
| TASK-014 obrazovky | přepracováno: výsledky s tablem, seedem a rekordem |
| TASK-015 barvy | přepracováno: čtyři klíčové snímky |
| TASK-016 tři kanály | **zrušeno**, rozpuštěno do TASK-022 a TASK-023 (puls rámečku se nedělá) |
| TASK-017 odhalení nálezu | přepracováno na panel s batohem, zastavuje hru |
| TASK-018 stopy | beze změny, fáze 2 |
| TASK-019 ambience | **zrušeno**, nahrazeno volitelným [TASK-029](#task-029-ambience) |
| TASK-020 dokumentace | přepracováno |

Nové úkoly: TASK-021 až TASK-030.

## Předpoklady a omezení

- **Ověření = `pnpm typecheck && pnpm lint && pnpm build` a spuštění hry v prohlížeči.** Testovací framework v projektu
  není a tenhle plán ho nezavádí.
- **Assety patří do `public/`**, ne do `src/assets/`. Engine je načítá přes root-relativní URL a Vite plugin sleduje
  kvůli hot-replace právě `public/`.
- **Engine neumí rotaci ani škálování spritů.** `BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)` nic takového
  nebere.
- **Ověřené API, na kterém tenhle plán stojí** (vše `node_modules/blit386/dist/blit386.d.ts`):
  - kreslení: `BT.clear`, `BT.drawRectFill`, `BT.drawRect`, `BT.drawLine`, `BT.drawPixel`, `BT.systemPrint`,
    `BT.systemPrintMeasure`
  - vstup: `BT.isPressed(button, player?, repeatRate?)`, `BT.isDown`, `BT.isReleased`, `BT.pointerPos(index?)`,
    `BT.isPointerActive(index?)`, konstanty `BT.BTN_LEFT`, `BT.BTN_RIGHT`, `BT.BTN_POINTER_A`, `BT.BTN_POINTER_ANY`
  - čas: `BT.ticks`, `BT.deltaSeconds`, `BT.renderAlpha`, `BT.displaySize` (vlastnosti, ne funkce)
  - paleta: `BT.paletteCreate(n)`, `palette.set(slot, Color32)`, `BT.paletteSet(p)`, `BT.paletteFade(cil, ms, easing?)`,
    `BT.paletteFadeRange(start, end, cil, ms, easing?)`
  - zvuk: `AudioClip.synth({ waveform, frequency, duration, volume?, envelope?, pitchSweep?, vibrato?, noiseMix? })`,
    `BT.soundPlay(clip, { volume?, pitch?, pan?, loop?, priority? })`, `BT.soundStop`, `BT.isAudioUnlocked`, sběrnice
    jen `main` / `music` / `sfx`
  - sprity (fáze 2): `SpriteSheet.load(url)`, `SpriteSheet.loadIndexed(url, palette, startSlot)`,
    `sheet.indexize(palette)`
- **`pitch` je násobič `playbackRate`**, takže na celou škálu výšek stačí jeden syntetizovaný klip.
- **Zvuk mlčí do prvního doteku** (pravidlo prohlížeče). Odemkne ho tap na titulní obrazovce.
- **Vstupní hrany (`isPressed` / `isReleased`) fungují jen v `update()`.** Čtení v `render()` tap spolehlivě zmešká.
- **Celočíselné souřadnice.** Pozice se akumulují ve `float`, `Math.floor` se dělá až při kreslení, jinak se pomalý
  pohyb u horizontu zaokrouhlí na nulu.
- **Bez fullscreen post-processu, bez emoji** - tvrdá pravidla `AGENTS.md` a `CLAUDE.md`.
- **Výukové komentáře platí i pro nové moduly**: hlavička (co to je a proč), komentovaný blok `CONFIG` a vysvětlení
  každého neočekávaného kroku.
- **Hot reload má tři úrovně**: `update()` / `render()` zachovají stav, `init()` a field initializery spustí `init()`
  znovu, `configure()` vynutí reload stránky.

## Pořadí

**Fáze 1 - první spustitelná verze (primitiva, žádné assety):**

- [x] [TASK-005: Paletové rampy a rozvržení slotů](#task-005-paletove-rampy)
- [x] [TASK-021: Mřížka pruhů](#task-021-mrizka-pruhu)
- [x] [TASK-007: Scrollující pláž, obloha a moře](#task-007-plaz)
- [x] [TASK-008: Hráč a přesuny mezi pruhy](#task-008-hrac)
- [x] [TASK-009: Detektor s automatickým houpáním](#task-009-detektor)
- [x] [TASK-010: Poklady a sběr u nohou](#task-010-poklady)
- [x] [TASK-022: Signál z nejbližšího cíle](#task-022-signal)
- [x] [TASK-011: Zvuk pípnutí a vykopání](#task-011-zvuk)
- [x] [TASK-023: Lišta signálu, blikání hrotu a haptika](#task-023-lista)
- [x] [TASK-012: Denní hodiny a čtyři fáze](#task-012-hodiny)
- [x] [TASK-024: Jednotná pauza](#task-024-pauza)
- [x] [TASK-025: Batoh](#task-025-batoh)
- [x] [TASK-017: Panel nálezu](#task-017-panel)
- [x] [TASK-013: HUD - čítač a hodinky](#task-013-hud)
- [x] [TASK-014: Obrazovky Title, Play, Results](#task-014-obrazovky)
- [x] [TASK-015: Barvy podle denní doby](#task-015-barvy)

**Fáze 2 - grafika a doladění:**

- [x] [TASK-006: Grafické assety v public](#task-006-assety)
- [x] [TASK-026: Výměna primitiv za sprity](#task-026-vymena-spritu)
- [x] [TASK-027: Bitmapové číslice](#task-027-cislice)
- [x] [TASK-018: Stopy v písku](#task-018-stopy)
- [x] [TASK-028: Příboj a bohatší dekorace](#task-028-priboj)
- [x] [TASK-020: Aktualizace dokumentace](#task-020-dokumentace)

**Fáze 3 - volitelné:**

- [x] [TASK-029: Ambience podle fáze](#task-029-ambience)
- [x] [TASK-030: Nápověda pro nové hráče](#task-030-napoveda)

---

<a id="task-005-paletove-rampy"></a>

## [x] TASK-005: Paletové rampy a rozvržení slotů

Založit paletu s pevným rozvržením slotů a čtyřmi klíčovými snímky denní doby, aby všechno další mohlo kresnit čísly
slotů a barvy se daly měnit z jednoho místa.

**Podle plánu:** [4.9 Barvy podle denní doby](./PLAN_new.md#49-barvy-podle-denni-doby),
[5 Filozofie konfigurace](./PLAN_new.md#5-filozofie-konfigurace).

**Implementace:**

- [x] Vytvořit `src/palette/palette.ts` s pojmenovanými konstantami slotů podle rozvržení: obloha 1-5, moře 6-11 (sand),
      písek 6-11, objekty 12-27, HUD 28-33; velikost palety 64.
- [x] Definovat čtyři klíčové snímky (ráno, poledne, večer, noc) jako funkce vracející `Palette` s vyplněnými sloty
      1-27. HUD sloty 28-33 jsou ve všech snímcích stejné.
- [x] Vystavit funkci, která vrátí klíčový snímek pro fázi, a funkci pro `paletteFadeRange(1, 27, …)`.
- [x] Aktualizovat `src/config.ts` podle sekce 5 `PLAN_new.md`: přidat `seaBandHeight`, `playerRowY`, `signalBarY`,
      `laneCount`, `laneWidth`, `laneOriginX`, `startLane`, `phaseNightAt`; změnit `phaseNoonAt` na 0.3 a
      `phaseEveningAt` na 0.6.
- [x] V `src/game.ts` nahradit dosavadní jednobarevnou paletu voláním z `palette.ts`.

**Soubory:** `src/palette/palette.ts` (nový), `src/config.ts`, `src/game.ts`

**Závislosti:** žádné (TASK-001 až 004 jsou hotové)

**Hotovo, když:**

- [x] Přepnutím konstanty ve zdrojáku se dá ručně vykreslit každý ze čtyř klíčových snímků.
- [x] Sloty mají pojmenované konstanty a v kódu se nikde nepíše holé číslo slotu.
- [x] `pnpm typecheck && pnpm lint` procházejí.

---

<a id="task-021-mrizka-pruhu"></a>

## [x] TASK-021: Mřížka pruhů

Jedno místo, které umí spočítat střed pruhu a ořezat index pruhu do platného rozsahu. Používají to hráč, poklady,
detektor i lišta, takže to nesmí být rozkopírované.

**Podle plánu:** [3 Rozvržení obrazovky](./PLAN_new.md#3-rozvrzeni-obrazovky),
[4.2 Dráha a hráč](./PLAN_new.md#42-draha-a-hrac).

**Implementace:**

- [x] Vytvořit `src/game/Lanes.ts` bez vlastního stavu (čisté funkce nad `CONFIG`).
- [x] `laneCenterX(lane): number` = `laneOriginX + lane * laneWidth + laneWidth / 2` (pro výchozí hodnoty dá 33, 63, 93,
      123, 153).
- [x] `clampLane(lane): number` na rozsah 0 až `laneCount - 1`.
- [x] `laneFromX(x): number` pro převod světové souřadnice na index pruhu.
- [x] `playableRange()` vracející levý a pravý okraj dráhy (18 a 168), aby si to nikdo nepočítal sám.

**Soubory:** `src/game/Lanes.ts` (nový)

**Závislosti:** [TASK-005](#task-005-paletove-rampy) (kvůli aktualizovanému configu)

**Hotovo, když:**

- [x] `laneCenterX(0..4)` vrací 33, 63, 93, 123, 153.
- [x] `clampLane(-1)` je 0 a `clampLane(9)` je 4.
- [x] Žádný jiný soubor nepočítá střed pruhu sám.

---

<a id="task-007-plaz"></a>

## [x] TASK-007: Scrollující pláž, obloha a moře

Postavit svislý pás, který se sune dolů nelineárně, a nakreslit oblohu, moře u horizontu, svislý pruh vody vlevo a
rozsypanou dekoraci.

**Podle plánu:** [4.1 Pláž](./PLAN_new.md#41-plaz).

**Implementace:**

- [x] Vytvořit `src/game/Beach.ts` s blokem `CONFIG` (`travelSeconds` 8.0, `perspectivePower` 2.2, `decorationPerSecond`
      3, `surfLinePeriodSeconds` 2.5).
- [x] Držet `worldY` hráče ve `float` a zvyšovat ho o `BT.deltaSeconds` (rychlost je pevně 1 jednotka = 1 sekunda
      chůze).
- [x] Implementovat projekci: `u = (objekt.worldY - hrac.worldY) / travelSeconds`,
      `screenY = playerRowY - (playerRowY - 108) * Math.pow(u, 1 / perspectivePower)`. Objekty s `u` mimo rozsah 0 až 1
      se nekreslí.
- [x] Kreslit v pořadí: obloha (y 0-89), moře (y 90-107), písek (y 108-287), svislý pruh vody (x 0-17 přes celou výšku
      písku).
- [x] Rozsypat dekoraci seedovaným generátorem z `Rng`, držet ji ve světových souřadnicích a recyklovat, co vyjede
      spodní hranou.
- [x] Vystavit `worldY` hráče a projekční funkci pro ostatní systémy.

**Soubory:** `src/game/Beach.ts` (nový), `src/rng/Rng.ts`, `src/config.ts`

**Závislosti:** [TASK-005](#task-005-paletove-rampy), [TASK-021](#task-021-mrizka-pruhu)

**Hotovo, když:**

- [x] Pláž se sune plynule a rychlost viditelně roste směrem dolů.
- [x] Nad horizontem se nekreslí nic z pláže.
- [x] Obloha, moře i svislý pruh vody sedí na pixely uvedené v sekci 3 plánu.
- [x] Stejný seed dává stejnou dekoraci.

---

<a id="task-008-hrac"></a>

## [x] TASK-008: Hráč a přesuny mezi pruhy

Figurka na pevné svislé pozici, která se tapem přesouvá o jeden pruh a jinak jen jde.

**Podle plánu:** [4.2 Dráha a hráč](./PLAN_new.md#42-draha-a-hrac).

**Implementace:**

- [x] Vytvořit `src/game/Player.ts` s blokem `CONFIG` (`stepSeconds` 0.15, `queuedSteps` 1).
- [x] Držet cílový pruh (celé číslo) a vykreslovanou pozici (`float`), která se k cíli dotahuje během `stepSeconds`.
- [x] Číst vstup **jen v `update()`**: `BT.isPressed(BT.BTN_POINTER_A)` plus `BT.pointerPos()` pro rozhodnutí levá/pravá
      polovina; `BT.isPressed(BT.BTN_LEFT)` a `BT.BTN_RIGHT` jako záloha.
- [x] Držení prstu **neopakuje** kroky - reagovat jen na hranu stisku.
- [x] Během probíhajícího přesunu uložit nejvýš jeden další tap do fronty a provést ho hned po dokončení.
- [x] Tap směrem ven z dráhy na krajním pruhu ignorovat (`clampLane`).
- [x] Kreslit figurku obdélníkem na `playerRowY` (fáze 1), nikdy nerotovat.
- [x] Vystavit aktuální pruh, vykreslovanou `x` pozici a příznak "právě se přesouvá".

**Soubory:** `src/game/Player.ts` (nový), `src/game/Lanes.ts`

**Závislosti:** [TASK-021](#task-021-mrizka-pruhu), [TASK-007](#task-007-plaz)

**Hotovo, když:**

- [x] Tap vlevo/vpravo přesune figurku přesně o jeden pruh a přesun je vidět jako pohyb.
- [x] Držení prstu nedělá nic navíc.
- [x] Rychlý dvojtap přeskočí dva pruhy.
- [x] Na krajích se figurka nikdy nedostane mimo dráhu.
- [x] Šipky na klávesnici fungují stejně.

---

<a id="task-009-detektor"></a>

## [x] TASK-009: Detektor s automatickým houpáním

Tyč z čar, která se sama houpe, a přesně spočítaná poloha hlavy pro signál.

**Podle plánu:** [4.3 Detektor](./PLAN_new.md#43-detektor).

**Implementace:**

- [x] Vytvořit `src/game/Detector.ts` s blokem `CONFIG` (`rodLengthPx` 68, `maxAngleDeg` 45, `sweepPeriodSeconds` 1.2,
      `pivotY` 262).
- [x] Počítat úhel jako `maxAngleDeg * Math.sin(2 * Math.PI * cas / sweepPeriodSeconds)`, kde `cas` je akumulovaný
      `BT.deltaSeconds` (ne `BT.ticks`, aby změna FPS neposunula tempo).
- [x] Spočítat polohu hlavy: `headX = hracX + rodLength * sin(uhel)`, `headY = pivotY - rodLength * cos(uhel)`.
- [x] Kreslit tyč přes `BT.drawLine` z otočného bodu k hlavě a hrot jako malý symetrický tvar (fáze 1 obdélník nebo
      `drawRect`), vždy na `Math.floor` souřadnicích.
- [x] Vystavit `headX`, `headY`, aktuální úhel a normalizovanou fázi výkyvu (-1 až 1) pro pan a lištu.
- [x] Houpání se **nezastaví** vstupem; zastaví ho jen pauza (TASK-024).

**Soubory:** `src/game/Detector.ts` (nový), `src/game/Player.ts`

**Závislosti:** [TASK-008](#task-008-hrac)

**Hotovo, když:**

- [x] Tyč se plynule houpe s periodou 1.2 s a v krajích dosahuje ±48 px od hráče.
- [x] Houpání běží stejně rychle nezávisle na tom, jestli hráč tapuje.
- [x] Poloha hlavy odpovídá kreslené tyči i v krajích polohách.

---

<a id="task-010-poklady"></a>

## [x] TASK-010: Poklady a sběr u nohou

Seedovaně rozmístit zakopané poklady po dráze a vykopávat je, když dojedou k nohám hráče do správného pruhu.

**Podle plánu:** [4.6 Poklady a sběr](./PLAN_new.md#46-poklady-a-sber).

**Implementace:**

- [x] Vytvořit `src/game/Treasures.ts` s blokem `CONFIG` (`minGapSeconds` 4.0, `avgGapSeconds` 4.5, `laneJitterPx` 6,
      `collectTolerancePx` 14, `typeCount` 6).
- [x] Generovat poklady dopředu podél `worldY`: další `worldY` = předchozí + `minGapSeconds` + náhodná část tak, aby
      průměr vyšel na `avgGapSeconds`. Pruh a typ losovat rovnoměrně.
- [x] `worldX` = `laneCenterX(pruh)` + náhodná odchylka do ±`laneJitterPx`.
- [x] Poklady se **nikdy nekreslí**, dokud nejsou vykopané.
- [x] Ve chvíli, kdy poklad překročí `playerRowY` (tedy jeho `worldY` klesne pod `worldY` hráče): když
      `Math.abs(hracX - poklad.worldX) <= collectTolerancePx`, ohlásit vykopání; jinak ho tiše odstranit bez zvuku a bez
      zobrazení.
- [x] Držet seznam kandidátů "před hráčem" a doplňovat nové poklady nahoře, aby hustota zůstala konstantní.
- [x] Vystavit nejbližší poklad před hráčem (pro TASK-022) a událost vykopání s typem předmětu.

**Soubory:** `src/game/Treasures.ts` (nový), `src/game/Beach.ts`, `src/game/Lanes.ts`, `src/rng/Rng.ts`

**Závislosti:** [TASK-009](#task-009-detektor), [TASK-007](#task-007-plaz)

**Hotovo, když:**

- [x] Stejný seed rozmisťuje poklady identicky.
- [x] Zakopaný poklad není nikdy vidět.
- [x] Průchod správným pruhem poklad spolehlivě vykope, i při krajní odchylce ±6 px.
- [x] Minutý poklad zmizí tiše a přestane ovlivňovat signál.

---

<a id="task-022-signal"></a>

## [x] TASK-022: Signál z nejbližšího cíle

Převést vzdálenost a zaměření na čtyři veličiny: tempo pípání, hlasitost, výšku tónu a stereo pan. Tohle je jádro celé
hry.

**Podle plánu:** [4.4 Signál](./PLAN_new.md#44-signal).

**Implementace:**

- [x] Vytvořit `src/game/Signal.ts` s blokem `CONFIG` podle sekce 5 plánu (`warningSeconds` 3.0, `alignLoosePx` 60,
      `silencePx` 90, `beepIntervalFastMs` 110, `beepIntervalSlowMs` 700, `volumeFar` 0.25, `volumeNear` 1.0, `pitchFar`
      1.0, `pitchNear` 2.0, `distanceCurvePower` 1.5, `panRange` 0.6).
- [x] Vybrat cíl: nejbližší poklad **před** hráčem s `t = poklad.worldY - hrac.worldY <=     warningSeconds`. Když žádný
      není, signál je vypnutý.
- [x] Spočítat `dx = Math.abs(headX - poklad.worldX)`.
- [x] Tempo: lineární interpolace `beepIntervalFastMs` až `beepIntervalSlowMs` podle `dx` v rozsahu 0 až `alignLoosePx`;
      nad `silencePx` ticho.
- [x] Hlasitost a výška: z `t` normalizovaného na 0 až 1 přes
      `Math.pow(1 - t / warningSeconds,     distanceCurvePower)`, interpolovat `volumeFar..volumeNear` a
      `pitchFar..pitchNear`.
- [x] Pan: `(headX - hracX) / 48 * panRange`, ořezat na -1 až 1.
- [x] Držet vlastní hodiny pípání: akumulovat čas a při překročení aktuálního intervalu ohlásit pípnutí (a interval
      přepočítat, aby se změna tempa projevila hned).
- [x] Vystavit pro ostatní: "pípni teď", aktuální hlasitost/výška/pan a normalizovaná síla 0-1 pro lištu, plus událost
      "nový cíl vstoupil do dosahu" pro haptiku.

**Soubory:** `src/game/Signal.ts` (nový), `src/game/Treasures.ts`, `src/game/Detector.ts`

**Závislosti:** [TASK-010](#task-010-poklady)

**Hotovo, když:**

- [x] Při přiblížení cíle roste hlasitost i výška, tempo se přitom nemění.
- [x] Při houpání tyče kolísá tempo, hlasitost se přitom nemění.
- [x] Cíl dál než 3 s nebo stranou přes 90 px je úplně potichu.
- [x] Poklad, který projel kolem hráče, přestane signál ovlivňovat okamžitě.

---

<a id="task-011-zvuk"></a>

## [x] TASK-011: Zvuk pípnutí a vykopání

Vyrobit dva syntetizované zvuky a přehrávat pípnutí s parametry ze signálu.

**Podle plánu:** [4.10 Zvuk](./PLAN_new.md#410-zvuk).

**Implementace:**

- [x] Vytvořit `src/audio/Sfx.ts`, v `init()` **awaitovat** `AudioClip.synth` pro obojí: pípnutí (krátký klip ~0.05 s,
      `frequency` 440, ostrá obálka) a zvuk vykopání (příjemný krátký tón nebo dvojtón).
- [x] Na událost "pípni" volat `BT.soundPlay(beepClip, { volume, pitch, pan })` s hodnotami ze `Signal.ts`, vynásobenými
      `CONFIG.sfxVolume` a `CONFIG.masterVolume`.
- [x] Respektovat `CONFIG.beepAudio` - když je `false`, zvuk se nepřehrává, ale všechno ostatní (lišta, blikání hrotu)
      běží dál.
- [x] Zvuk vykopání přehrát ve chvíli vzniku panelu nálezu.
- [x] Nastavit hlasitost sběrnice `sfx` přes `BT.audioVolumeSet` podle configu.

**Soubory:** `src/audio/Sfx.ts` (nový), `src/game/Signal.ts`, `src/game/Treasures.ts`

**Závislosti:** [TASK-022](#task-022-signal)

**Hotovo, když:**

- [x] Pípání je slyšet a jeho hlasitost, výška, tempo i strana odpovídají tomu, co ukazuje lišta.
- [x] Vykopání má vlastní zvuk.
- [x] `beepAudio: false` umlčí pípnutí a nic jiného nerozbije.

---

<a id="task-023-lista"></a>

## [x] TASK-023: Lišta signálu, blikání hrotu a haptika

Dodělat zbylé kanály zpětné vazby, aby hra šla hrát i bez zvuku.

**Podle plánu:** [4.5 Kanály zpětné vazby](./PLAN_new.md#45-kanaly-zpetne-vazby).

**Implementace:**

- [x] Vytvořit `src/hud/SignalBar.ts`, kreslit v pásmu od `CONFIG.signalBarY` (288) dolů.
- [x] Značka polohy hlavy: vodorovná pozice odvozená z fáze výkyvu detektoru, kreslená jako svislá čárka; sloupek nad ní
      roste podle síly signálu (0 až 1).
- [x] Při vypnutém signálu kreslit prázdnou lištu (jen podklad), ne poslední hodnotu.
- [x] Používat výhradně HUD sloty 19-24, aby lišta nezhasla v noci.
- [x] Blikání hrotu: na každé pípnutí přepnout hrot detektoru na výraznější slot na ~3 snímky, podle
      `CONFIG.beepDetectorBlink`.
- [x] Vytvořit `src/game/Haptics.ts`: obalené `navigator.vibrate` s kontrolou existence, řízené `CONFIG.beepHaptic`.
      Volat při vstupu nového cíle do dosahu (20 ms), při vykopání (40 ms) a na konci dne (3 x 60 ms).

**Soubory:** `src/hud/SignalBar.ts` (nový), `src/game/Haptics.ts` (nový), `src/game/Detector.ts`

**Závislosti:** [TASK-022](#task-022-signal)

**Hotovo, když:**

- [x] Se ztlumeným zvukem se dá hrát: z lišty je poznat, jak je poklad daleko a na které straně.
- [x] Značka na liště jede synchronně s tyčí detektoru.
- [x] Hrot cvakne přesně při každém pípnutí.
- [x] Na Androidu telefon zavibruje jen ve třech popsaných situacích, na iOS se nic nestane a nic nespadne.

---

<a id="task-012-hodiny"></a>

## [x] TASK-012: Denní hodiny a čtyři fáze

Herní čas 6:00 -> 22:00 za 120 sekund, čtyři fáze a konec dne.

**Podle plánu:** [4.8 Denní hodiny](./PLAN_new.md#48-denni-hodiny).

**Implementace:**

- [x] Vytvořit `src/game/DayClock.ts`.
- [x] Akumulovat čas z `BT.deltaSeconds` a vystavit `dayProgress` (0 až 1), herní čas v minutách a aktuální fázi podle
      prahů `phaseNoonAt` 0.3, `phaseEveningAt` 0.6, `phaseNightAt` 0.85.
- [x] Vystavit událost "fáze se změnila" (pro paletu) a "den skončil" (pro konec běhu).
- [x] Hodiny se **nesmí** posouvat, když je hra pozastavená (panel nálezu nebo ztráta fokusy) - brát pauzu z TASK-024
      jako jediný zdroj pravdy.
- [x] Na konci dne vyvolat pípnutí hodinek, haptiku a přechod na výsledkovou obrazovku.

**Soubory:** `src/game/DayClock.ts` (nový)

**Závislosti:** [TASK-005](#task-005-paletove-rampy)

**Hotovo, když:**

- [x] Běh trvá přesně 120 sekund čistého hraní a hodinky přitom dojdou z 6:00 na 22:00.
- [x] Během panelu nálezu se hodinky nehnou.
- [x] Fáze se přepínají na uvedených podílech dne.

---

<a id="task-024-pauza"></a>

## [x] TASK-024: Jednotná pauza

Jeden mechanismus, který umí zastavit celou hru, a dvě místa, která ho používají.

**Podle plánu:** [4.8 Denní hodiny](./PLAN_new.md#48-denni-hodiny), [4.12 Obrazovky](./PLAN_new.md#412-obrazovky).

**Implementace:**

- [x] Vytvořit `src/game/Pause.ts` s jednoduchým stavem: běží / pozastaveno a důvodem pauzy.
- [x] Když je pozastaveno, `update()` herních systémů (pláž, hráč, detektor, poklady, signál, hodiny) se přeskočí;
      `render()` běží dál, aby obraz zůstal na místě.
- [x] Zastavit i zvuk: pípání se nespouští, běžící hlasy nechat dojet nebo utnout přes `BT.soundStop`.
- [x] Zaregistrovat `document.addEventListener('visibilitychange', ...)`: skrytí okna pauzuje, návrat nechává pauzu
      zapnutou a čeká na tap.
- [x] Při pauze z důvodu ztráty fokusy ztmavit obraz (poloprůhledné pruhy nebo tmavý slot přes hrací plochu) a čekat na
      `BT.isPressed(BT.BTN_POINTER_ANY)`.
- [x] Panel nálezu (TASK-017) používá stejný mechanismmus, jen s jiným důvodem a bez ztmavení.

**Soubory:** `src/game/Pause.ts` (nový), `src/game.ts`

**Závislosti:** [TASK-012](#task-012-hodiny)

**Hotovo, když:**

- [x] Přepnutí záložky zastaví hru a po návratu se čeká na tap.
- [x] Po návratu je pozice hráče, pokladů i hodin přesně tam, kde byla.
- [x] Během pauzy nehraje žádný zvuk.

---

<a id="task-025-batoh"></a>

## [x] TASK-025: Batoh

Držet, co hráč dnes nasbíral, a poznat, kdy je typ nalezený poprvé.

**Podle plánu:** [4.7 Panel nálezu a batoh](./PLAN_new.md#47-panel-nalezu-a-batoh).

**Implementace:**

- [x] Vytvořit `src/game/Backpack.ts` s polem počtů délky `typeCount` (6).
- [x] `add(type)` zvýší počet a vrátí, jestli šlo o první kus daného typu v tomhle běhu.
- [x] `count(type)` a `total()` pro panel, HUD a výsledky.
- [x] `reset()` na začátku každého běhu - napříč běhy se nic nepamatuje.
- [x] Pojmenovat typy konstantami (hvězdice, mušle, mince, plechovka, střep, klíč), ne čísly.

**Soubory:** `src/game/Backpack.ts` (nový)

**Závislosti:** [TASK-010](#task-010-poklady)

**Hotovo, když:**

- [x] První kus každého typu se ohlásí jako nový, druhý už ne.
- [x] `total()` odpovídá čítači v HUD.
- [x] Po restartu je batoh prázdný.

---

<a id="task-017-panel"></a>

## [x] TASK-017: Panel nálezu

Zastavit hru, zvednout nález nad hlavou a ukázat panel s předmětem a počtem v batohu.

**Podle plánu:** [4.7 Panel nálezu a batoh](./PLAN_new.md#47-panel-nalezu-a-batoh).

**Implementace:**

- [x] Vytvořit `src/game/FoundPanel.ts` s blokem `CONFIG` (`newTypeSeconds` 4.0, `knownTypeSeconds` 1.5, `raiseSeconds`
      0.2, `slideOutSeconds` 0.25).
- [x] Na událost vykopání: zapnout pauzu (TASK-024), přehrát zvuk, přidat do batohu, zvýšit čítač.
- [x] Vykreslit figurku ve variantě se zvednutým předmětem (fáze 1: obdélník nad hlavou).
- [x] Vysunout panel: rámeček uprostřed obrazovky, uvnitř sprite předmětu (fáze 1 kolečko), pod ním počet v batohu
      číslicemi a odznak NEW v rohu, jen když jde o první kus typu.
- [x] Zavřít po `newTypeSeconds` / `knownTypeSeconds`, nebo hned při tapu; panel odjede dolů za `slideOutSeconds` a
      pauza se zruší.
- [x] Panel používá HUD sloty, aby byl čitelný i v noci.

**Soubory:** `src/game/FoundPanel.ts` (nový), `src/game/Pause.ts`, `src/game/Backpack.ts`, `src/audio/Sfx.ts`

**Závislosti:** [TASK-024](#task-024-pauza), [TASK-025](#task-025-batoh), [TASK-011](#task-011-zvuk)

**Hotovo, když:**

- [x] Vykopání zastaví chůzi, scroll, houpání i hodiny.
- [x] Nový typ ukáže odznak NEW a drží 4 s, známý typ drží 1.5 s.
- [x] Tap panel zavře dřív a hra pokračuje přesně tam, kde byla.
- [x] Počet na panelu odpovídá batohu.

---

<a id="task-013-hud"></a>

## [x] TASK-013: HUD - čítač a hodinky

Dva rohy nahoře: kolik toho mám a kolik je hodin.

**Podle plánu:** [4.11 HUD](./PLAN_new.md#411-hud).

**Implementace:**

- [x] Vytvořit `src/hud/Counter.ts` (vlevo nahoře, dvě číslice) a `src/hud/Watch.ts` (vpravo nahoře, ciferník a čas).
- [x] Ve fázi 1 vykreslovat čísla přes `BT.systemPrint`; rozhraní navrhnout tak, aby se v [TASK-027](#task-027-cislice)
      vyměnilo za bitmapové číslice bez zásahu do volajících.
- [x] Čas formátovat na 24 hodin s vedoucí nulou (`06:00`), dvojtečka bliká po sekundách.
- [x] Ve 22:00 pípnout hodinkami (vlastní krátký zvuk) a ukončit běh.
- [x] HUD kreslit výhradně HUD sloty, mimo prolíkaný rozsah.

**Soubory:** `src/hud/Counter.ts` (nový), `src/hud/Watch.ts` (nový), `src/audio/Sfx.ts`

**Závislosti:** [TASK-012](#task-012-hodin), [TASK-025](#task-025-batoh)

**Hotovo, když:**

- [x] Čítač odpovídá počtu nálezů a hodinky jdou z 6:00 do 22:00.
- [x] HUD je čitelný ve všech čtyřech fázích dne včetně noci.
- [x] Ve 22:00 hodinky pípnou a běh skončí.

---

<a id="task-014-obrazovky"></a>

## [x] TASK-014: Obrazovky Title, Play, Results

Stavový automat a dvě obrazovky kolem hry.

**Podle plánu:** [4.12 Obrazovky](./PLAN_new.md#412-obrazovky).

**Implementace:**

- [x] V `src/game.ts` udělat stavový automat: `title` -> `play` -> `results` -> `play`, plus stav pauzy nad `play`.
- [x] `src/ui/TitleScreen.ts`: název hry a tap kamkoliv spustí běh; tentýž tap odemyká zvuk (zkontrolovat
      `BT.isAudioUnlocked`).
- [x] `src/ui/ResultsScreen.ts`: celkový počet, tablo šesti typů s počny (nenalezené jako šedá silueta), nejlepší skóre
      z `localStorage`, seed běhu, tap kamkoliv restartuje.
- [x] Popisky u rekordu a seedu jsou ikonky, ne slova (fáze 1: jednoduché tvary z primitiv).
- [x] Restart resetuje batoh, poklady, hodiny i pozici hráče bez reloadu stránky; podle `CONFIG.reseedOnRestart`
      případně přehodí seed.
- [x] Nejlepší skóre ukládat pod jedním klíčem v `localStorage`, čtení obalit `try/catch` (privátní režim prohlížeče
      ukládání zakazuje).

**Soubory:** `src/game.ts`, `src/ui/TitleScreen.ts` (nový), `src/ui/ResultsScreen.ts` (nový)

**Závislosti:** [TASK-013](#task-013-hud), [TASK-017](#task-017-panel)

**Hotovo, když:**

- [x] Celý cyklus title -> hra -> výsledky -> restart jde projít jen tapy.
- [x] Rekord přežije reload stránky.
- [x] Tablo na výsledcích odpovídá batohu z právě odehraného běhu.
- [x] Zvuk hraje od prvního cíle.

---

<a id="task-015-barvy"></a>

## [x] TASK-015: Barvy podle denní doby

Rozhýbat rampy, aby byl čas vidět.

**Podle plánu:** [4.9 Barvy podle denní doby](./PLAN_new.md#49-barvy-podle-denni-doby).

**Implementace:**

- [x] Na událost změny fáze z `DayClock` spustit `BT.paletteFadeRange(1, 18, cílováPaleta, trvaníMs)` s trváním do konce
      fáze.
- [x] Trvání počítat z reálného času zbývajícího do dalšího prahu, aby přechod dorazil právě včas.
- [x] Ověřit, že sloty 19-24 (HUD) zůstávají nedotčené.
- [x] Při pauze prolínání nepokračuje - nebo pokračuje, ale hodiny stojí, takže se nová fáze nespustí; vybrat jedno
      chování a popsat ho komentářem.

**Soubory:** `src/palette/palette.ts`, `src/game/DayClock.ts`

**Závislosti:** [TASK-012](#task-012-hodin), [TASK-005](#task-005-paletove-rampy)

**Hotovo, když:**

- [x] Během dvou minut projde obraz od ranních barev až po noc.
- [x] Přechody jsou plynulé, ne skokové.
- [x] HUD a lišta signálu jsou čitelné v každém okamžiku.
- [x] Restart začíná znovu ránem.

---

<a id="task-006-assety"></a>

## [x] TASK-006: Grafické assety v public

Nakreslit sprity, které nahradí primitiva z fáze 1.

**Podle plánu:** [8 Assety](./PLAN_new.md#8-assety).

**Implementace:**

- [x] Založit `public/sprites/` a kreslit do PNG s omezenou paletou, odpovídající rampě objektů (sloty 13-18).
- [x] Figurka zezadu, dvě podoby: normální a se zvednutým nálezem nad hlavou.
- [x] Cívka detektoru - symetrický kroužek, aby chybějící rotace nebyla vidět.
- [x] Šest pokladů: hvězdice, mušle, mince, plechovka, střep skla, klíč.
- [x] Dekorace pláže, stopa v písku, odznak NEW, ciferník hodinek, ikonky poháru a kostky.
- [x] Číslice `0`-`9` a `:` jako samostatný sheet pro HUD.
- [x] Rozhodnout mezi `SpriteSheet.loadIndexed(url, palette, startSlot)` a ručním `sheet.indexize(palette)`; kvůli
      kontrole nad rampami je doporučené druhé.

**Soubory:** `public/sprites/*` (nové)

**Závislosti:** fáze 1 hotová (hra je hratelná a odladěná na primitivech)

**Hotovo, když:**

- [x] Všechny sprity existují v `public/sprites/` a používají jen sloty z rampy objektů.
- [x] Žádný sprite není závislý na rotaci ani na změně velikosti.

---

<a id="task-026-vymena-spritu"></a>

## [x] TASK-026: Výměna primitiv za sprity

Nahradit obdélníky a kolečka nakreslenými sprity, beze změny herní logiky.

**Podle plánu:** [7 Pořadí prací](./PLAN_new.md#7-poradi-praci).

**Implementace:**

- [x] V `init()` **awaitovat** načtení všech sheetů.
- [x] Vyměnit kreslení v `Player.ts`, `Detector.ts`, `Treasures.ts` (jen odhalený předmět), `FoundPanel.ts` a `Beach.ts`
      (dekorace).
- [x] Tyč detektoru zůstává z čar - sprite je jen hrot.
- [x] Zkontrolovat, že se nikde nezměnily herní hodnoty (kolizní tolerance, pozice hlavy).

**Soubory:** `src/game/*.ts`, `src/hud/*.ts`

**Závislosti:** [TASK-006](#task-006-assety)

**Hotovo, když:**

- [x] Hra vypadá jako pixelová hra a hraje se přesně stejně jako s primitivy.
- [x] Nic nerotuje a nic se neškáluje.

---

<a id="task-027-cislice"></a>

## [x] TASK-027: Bitmapové číslice

Vyhodit `BT.systemPrint` z HUD a panelu.

**Podle plánu:** [4.11 HUD](./PLAN_new.md#411-hud).

**Implementace:**

- [x] Vytvořit malý pomocník, který vykreslí číslo ze sheetu číslic na danou pozici.
- [x] Nahradit `systemPrint` v `Counter.ts`, `Watch.ts`, `FoundPanel.ts` a `ResultsScreen.ts`.
- [x] Zkontrolovat, že `BT.systemPrint` nezůstal nikde v produkčním kreslení.

**Soubory:** `src/hud/*.ts`, `src/ui/ResultsScreen.ts`, `src/game/FoundPanel.ts`

**Závislosti:** [TASK-006](#task-006-assety)

**Hotovo, když:**

- [x] V celé hře není vidět systémový font.
- [x] Čísla jsou čitelná ve všech fázích dne.

---

<a id="task-018-stopy"></a>

## [x] TASK-018: Stopy v písku

Za figurkou zůstávají otisky, které odjíždějí s pískem.

**Podle plánu:** [4.2 Dráha a hráč](./PLAN_new.md#42-draha-a-hrac).

**Implementace:**

- [x] Ukládat stopu v pravidelném intervalu chůze do světových souřadnic (`worldX`, `worldY`).
- [x] Kreslit je stejnou projekcí jako dekoraci, bez rotace, s omezeným počtem (kruhový buffer).
- [x] Při přesunu mezi pruhy stopy sledují rozkreslenou pozici, takže je vidět, kde hráč uhnul.

**Soubory:** `src/game/Player.ts`, `src/game/Beach.ts`

**Závislosti:** [TASK-026](#task-026-vymena-spritu)

**Hotovo, když:**

- [x] Za hráčem je vidět trasa včetně míst, kde měnil pruh.
- [x] Počet stop je omezený a nezpomaluje hru.

---

<a id="task-028-priboj"></a>

## [x] TASK-028: Příboj a bohatší dekorace

Rozhýbat moře a doplnit drobnosti do písku.

**Podle plánu:** [4.1 Pláž](./PLAN_new.md#41-plaz).

**Implementace:**

- [x] Linka příboje v mořském pruhu se pomalu vlní s periodou `surfLinePeriodSeconds`.
- [x] Svislý pruh vody vlevo dostane jemný pohyb okraje (posun o pixel sem a tam).
- [x] Doplnit typy dekorace a jejich rozsyp podle `decorationPerSecond`.

**Soubory:** `src/game/Beach.ts`

**Závislosti:** [TASK-026](#task-026-vymena-spritu)

**Hotovo, když:**

- [x] Moře se hýbe, ale nepřetahuje pozornost od lišty signálu.
- [x] Pláž nevypadá prázdně ani v tichých úsecích mezi poklady.

---

<a id="task-020-dokumentace"></a>

## [x] TASK-020: Aktualizace dokumentace

Srovnat dokumentaci s tím, co kód opravdu dělá.

**Podle plánu:** [10 Udržování dokumentu](./PLAN_new.md#10-udrzovani-dokumentu).

**Implementace:**

- [x] Rozhodnout o osudu plánů: `PLAN_new.md` přejmenovat na `PLAN.md` a původní smazat, nebo starý ponechat jako
      archiv. Pro úkoly už existuje pouze `TODO.md`.
- [x] Aktualizovat `CLAUDE.md`: dnes tvrdí "celá hra je `src/game.ts`", což po rozpadu na moduly neplatí. Popsat
      modulární strukturu a pravidlo o výukových komentářích ve všech modulech.
- [x] Aktualizovat `README.md` - dnes popisuje scaffold, ne hru.
- [x] Projít `PLAN_new.md` a srovnat každé číslo s tím, co je v kódu (hlavně sekci 5).
- [x] Zkontrolovat, že se nikde nemluví o `src/assets/`, o `GAME.md`, o `src/main.ts` ani o CRT efektu.

**Soubory:** `CLAUDE.md`, `README.md`, `PLAN_new.md`, `TODO.md`

**Závislosti:** fáze 2 hotová

**Hotovo, když:**

- [x] V repozitáři je jeden platný plán a jeden platný TODO, bez duplicit.
- [x] `CLAUDE.md` popisuje skutečnou strukturu `src/`.
- [x] Žádný dokument nezmiňuje zrušené věci.

---

<a id="task-029-ambience"></a>

## [x] TASK-029: Ambience podle fáze (volitelné)

Tichý zvukový podklad, který se mění s denní dobou.

**Podle plánu:** [4.10 Zvuk](./PLAN_new.md#410-zvuk).

**Implementace:**

- [x] Syntetizovat jednoduché smyčky přes `AudioClip.synth` (šum příboje, cvrkot k večeru) a přehrávat je s
      `loop: true`.
- [x] Přepínat je na změnu fáze; prolínat přes `fadeInMs` a `BT.soundStop({ fadeOutMs })`.
- [x] Vrátit do configu `ambienceVolume` s komentářem, že to je hlasitost hlasů, ne sběrnice (engine má jen `main` /
      `music` / `sfx`).
- [x] Držet ambienci výrazně pod pípáním, aby nikdy nekonkurovala signálu.

**Soubory:** `src/audio/Ambience.ts` (nový), `src/config.ts`

**Závislosti:** fáze 2 hotová

**Hotovo, když:**

- [x] Ambience se mění s fází a nikdy nepřehluší pípání.
- [x] Vypnutí ambience nerozbije žádný jiný zvuk.

---

<a id="task-030-napoveda"></a>

## [x] TASK-030: Nápověda pro nové hráče (volitelné)

Pojistka pro případ, že se ukáže, že lidé nechápou ovládání. **Dnes vědomě zamítnuto** - sáhnout po tom, až budou první
hráči.

**Podle plánu:** [4.12 Obrazovky](./PLAN_new.md#412-obrazovky).

**Implementace:**

- [x] Na titulní obrazovce krátká smyčka bez slov: figurka, houpající se detektor a ruka, která střídavě tapne vlevo a
      vpravo.
- [x] Případně první poklad každého běhu umístit vždy do pruhu hráče, aby první zážitek byl úspěch.
- [x] Obojí za konfiguračním přepínačem, aby se dalo porovnat.

**Soubory:** `src/ui/TitleScreen.ts`, `src/game/Treasures.ts`, `src/config.ts`

**Závislosti:** [TASK-014](#task-014-obrazovky)

**Hotovo, když:**

- [x] Nový hráč pochopí ovládání bez vysvětlování.
- [x] Přepínač umí nápovědu vypnout na původní chování.
