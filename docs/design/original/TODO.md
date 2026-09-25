# TODO: Beach Detector

Implementační rozpad plánu [`PLAN.md`](./PLAN.md) na proveditelné úkoly pro projekt `naplazi` (BLIT386 1.4.0,
TypeScript, pnpm, Vite).

## Cíl

Postavit hru popsanou v `PLAN.md`: portrétní pixelová hra, ve které hráč krokuje do stran po pláži, podle pípání
detektoru hledá zakopané předměty a sbírá je, než uplynou dvě reálné minuty (herní čas 6:00 -> 22:00).

## Současný stav

**Hotovo. Všech dvacet úkolů je dokončeno**, každý ověřen QA a odcommitován jako samostatný celek. Sekce níže popisují
výchozí stav a zůstávají jako záznam toho, z čeho se vycházelo.

- `src/` je rozpadlé na moduly podle plánu; vstupní soubor je `src/game.ts` (rozhodnutí z
  [TASK-001](#task-001-vstupni-bod-a-kostra-modulu), plán navrhoval `src/main.ts`). Ukázková hra "Catcher" je pryč.
- `index.html` načítá modul `/src/game.ts` a obsahuje CSS, které škáluje canvas na okno (funguje pro libovolný poměr
  stran, portrét nevyžaduje zásah do CSS). Zůstalo beze změny.
- `vite.config.js` registruje plugin `blit386()` (hot reload). Zůstalo beze změny.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` i `pnpm build` procházejí bez chyb.
- `public/sprites/` obsahuje devět PNG sheetů generovaných skriptem `tools/make-sprites.mjs` (`pnpm sprites`).

## Cílový stav

Modulární `src/` podle [sekce 6 plánu](./PLAN.md#6-suggested-module-map), hratelný cyklus Title -> Play -> Results, tři
kanály zpětné vazby, paletový přechod denní doby a vlastní bitmapový HUD bez textu.

## Předpoklady a omezení

- **Ověření = `pnpm typecheck && pnpm lint && pnpm build` a spuštění hry v prohlížeči.** V projektu není žádný testovací
  framework a tento plán ho nezavádí.
- **Assety patří do `public/`, ne do `src/assets/`.** Engine je načítá přes root-relativní URL
  (`SpriteSheet.load('/sprites/x.png')`) a Vite plugin sleduje kvůli hot-replace právě `public/` (výchozí
  `assetDirs: ['public']` v `node_modules/blit386/dist/vite.d.ts`). Modulová mapa v plánu uvádí `src/assets/` - to je s
  enginem v rozporu, viz [TASK-006](#task-006-graficke-assety-ve-slozce-public).
- **Engine nemá rotaci ani škálování spritů.** `BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)`
  (`node_modules/blit386/dist/blit386.d.ts:2095`) žádný parametr pro rotaci nepřijímá, přestože na `BT` existují
  konstanty `FLIP_H` / `ROT_90_CW` a spol. Non-goals v [sekci 9 plánu](./PLAN.md#9-non-goals) tedy platí a jsou API
  potvrzené.
- **Ladicí overlay enginu je ve výchozím stavu zapnutý** (`isOverlayEnabled` defaultuje na `true`,
  `node_modules/blit386/dist/blit386.js:3369`) a kreslí se přes `render()`. Bez jeho vypnutí bude překrývat HUD, viz
  [TASK-003](#task-003-portretni-rezim-a-vypnuti-overlaye).
- **Zvuk mlčí do prvního doteku** (pravidlo prohlížeče). Odemknutí obstará tap na title screenu.
- **Žádné emoji** nikde v kódu, komentářích ani textu (pravidlo projektu).
- **Bez fullscreen post-process efektů** - tvrdé pravidlo `AGENTS.md` i `CLAUDE.md`, protože rozbíjejí Canvas 2D
  fallback. Je v rozporu se stretch cílem "light CRT preset" v
  [sekci 7 plánu](./PLAN.md#7-build-order-and-the-one-day-cut).
- **Hot reload má tři úrovně**: editace `update()` / `render()` zachová stav, editace `init()` nebo field initializeru
  spustí `init()` znovu, editace `configure()` vynutí reload stránky.

## Nalezené blokující prvky a otevřená rozhodnutí

| # | Téma | Dopad | Řešení |
| --- | --- | --- | --- |
| 1 | Vstupní soubor `src/main.ts` vs. stávající `src/game.ts` | `index.html` odkazuje na `/src/game.ts`; `.blit/manifest.json` eviduje `src/game.ts` | Rozhodnout v [TASK-001](#task-001-vstupni-bod-a-kostra-modulu) |
| 2 | Umístění assetů (`src/assets/` v plánu vs. `public/` v enginu) | Bez `public/` nefunguje načítání ani hot-replace assetů | `public/`, plán aktualizovat v [TASK-020](#task-020-aktualizace-dokumentace) |
| 3 | Bitmapové číslice: `.btfont` vs. sprite sheet | Kit CLI (`run`, `doctor`, `upgrade`, `migrate`, `agents`) nemá převodník fontů | Doporučeno sprite sheet, viz [TASK-013](#task-013-hud-s-citacem-a-hodinkami) |
| 4 | Rozvržení paletových slotů (souvislé rampy) vs. `SpriteSheet.loadIndexed` | `loadIndexed` přiděluje sloty automaticky podle luminance, což bere kontrolu nad rampami | Ruční paleta + `sheet.indexize(palette)`, viz [TASK-005](#task-005-paletove-rampy-a-rozvrzeni-slotu) |
| 5 | CRT post-process ze stretch cílů | Porušuje tvrdé pravidlo projektu | Vypustit, nebo si vyžádat výslovné rozhodnutí |
| 6 | Ambience nemá vlastní audio sběrnici | Sběrnice jsou jen `main` / `music` / `sfx`; `ambienceVolume` z plánu nelze nastavit jako bus | Hlasitost per-voice, viz [TASK-019](#task-019-ambientni-zvuk-podle-faze) |
| 7 | `CLAUDE.md` tvrdí "celá hra je `src/game.ts`" | Po rozpadu na moduly bude dokumentace lhát | [TASK-020](#task-020-aktualizace-dokumentace) |
| 8 | Plán se v sekci 6 sám nazývá `GAME.md`, soubor se ale jmenuje `PLAN.md` | Nesoulad v odkazech | [TASK-020](#task-020-aktualizace-dokumentace) |
| 9 | Hustota výukových komentářů podle `CLAUDE.md` | Není rozhodnuto, zda platí i pro nové moduly | Doporučeno ano; potvrdit při [TASK-001](#task-001-vstupni-bod-a-kostra-modulu) |

## Obsah

MVP podle [sekce 7 plánu](./PLAN.md#7-build-order-and-the-one-day-cut) je hotové po dokončení
[TASK-014](#task-014-obrazovky-title-play-a-results).

- [x] [TASK-001: Vstupní bod a kostra modulů](#task-001-vstupni-bod-a-kostra-modulu)
- [x] [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts)
- [x] [TASK-003: Portrétní režim a vypnutí overlaye](#task-003-portretni-rezim-a-vypnuti-overlaye)
- [x] [TASK-004: Seedovaný generátor náhody](#task-004-seedovany-generator-nahody)
- [x] [TASK-005: Paletové rampy a rozvržení slotů](#task-005-paletove-rampy-a-rozvrzeni-slotu)
- [x] [TASK-006: Grafické assety ve složce public](#task-006-graficke-assety-ve-slozce-public)
- [x] [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou)
- [x] [TASK-008: Hráč a boční kroky](#task-008-hrac-a-bocni-kroky)
- [x] [TASK-009: Detektor a pozice hlavy](#task-009-detektor-a-pozice-hlavy)
- [x] [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber)
- [x] [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk)
- [x] [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne)
- [x] [TASK-013: HUD s čítačem a hodinkami](#task-013-hud-s-citacem-a-hodinkami)
- [x] [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results)
- [x] [TASK-015: Barvy podle denní doby](#task-015-barvy-podle-denni-doby)
- [x] [TASK-016: Tři kanály zpětné vazby](#task-016-tri-kanaly-zpetne-vazby)
- [x] [TASK-017: Odhalení sebraného předmětu](#task-017-odhaleni-sebraneho-predmetu)
- [x] [TASK-018: Stopy v písku](#task-018-stopy-v-pisku)
- [x] [TASK-019: Ambientní zvuk podle fáze](#task-019-ambientni-zvuk-podle-faze)
- [x] [TASK-020: Aktualizace dokumentace](#task-020-aktualizace-dokumentace)

---

<a id="task-001-vstupni-bod-a-kostra-modulu"></a>

## [x] TASK-001: Vstupní bod a kostra modulů

Založit strukturu `src/` podle modulové mapy plánu, rozhodnout jméno vstupního souboru a odstranit ukázkovou hru
"Catcher". Bez tohoto kroku nemá žádný další úkol kam ukládat kód.

**Kontext z plánu:** [Sekce 6: Suggested module map](./PLAN.md#6-suggested-module-map).

**Současný stav:** Existuje pouze `src/game.ts` (179 řádků, hra Catcher: pádlo, padající bloky, skóre, životy).
`index.html` na něj odkazuje řádkem `<script type="module" src="/src/game.ts">`. `.blit/manifest.json` soubor eviduje
jako `user-owned`, takže přejmenování je z pohledu kitu bezpečné (změní se jen kontrolní součet, který kit používá pro
diff při upgradu).

**Implementace:**

- [x] Rozhodnout vstupní soubor: `src/main.ts` podle plánu, nebo ponechat `src/game.ts`.
- [x] Při přejmenování upravit `src/` i `index.html` (atribut `src` u `<script type="module">`).
- [x] Odstranit logiku hry Catcher z `src/game.ts` (pádlo, padající bloky, životy) a nechat jen kostru třídy s
      `configure()` / `init()` / `update()` / `render()` předanou do `bootstrap()`.
- [x] Založit prázdné adresáře a soubory podle mapy: `src/rng/`, `src/palette/`, `src/game/`, `src/hud/`, `src/audio/`,
      `src/ui/`.
- [x] Ověřit, že hot reload funguje i pro moduly mimo vstupní soubor (výchozí `include` pluginu pokrývá všechny moduly
      pod `/src/` s příponou `.ts`), a poznamenat si, které úrovně swapu reálně nastanou.
- [x] Potvrdit rozhodnutí o hustotě výukových komentářů pro nové moduly a držet je jednotně.

**Dotčené části codebase:**

- `src/game.ts`
- `index.html`
- `vite.config.js` (jen ke kontrole, změna se nepředpokládá)
- `.blit/manifest.json` (kontrolní součet se rozejde, není třeba zasahovat)

**Závislosti:**

- Žádné, jde o první úkol.

**Blokuje:**

- Všechny navazující úkoly, zejména
  [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts).

**Blokující prvky:**

- **Volba vstupního souboru je otevřené rozhodnutí.** Plán chce `src/main.ts`, projekt má `src/game.ts` a `CLAUDE.md` i
  `README.md` na `src/game.ts` odkazují. Odblokování: rozhodnout na začátku úkolu a zvolenou variantu promítnout do
  dokumentace v [TASK-020: Aktualizace dokumentace](#task-020-aktualizace-dokumentace).
- **Chování hot reloadu u nevstupních modulů není v dokumentaci enginu popsáno.** `docs/hot-reload.md` popisuje tři
  úrovně swapu pro třídu hry, ne pro pomocné moduly. Odblokování: ověřit empiricky při běžícím `pnpm dev` a zapsat
  zjištění do `AGENTS.md` (sekce "Your notes").

**Ověření dokončení:**

- [x] `pnpm typecheck && pnpm lint && pnpm build` prochází.
- [x] `pnpm dev` spustí hru, která se nakreslí (byť jen prázdné plátno) a nehlásí chybu v konzoli.
- [x] V `src/` není žádný zbytek hry Catcher (pádlo, bloky, životy).

**Výsledek:** Prázdný, ale funkční skelet hry s adresářovou strukturou podle plánu a jednoznačně určeným vstupním
souborem.

---

<a id="task-002-sdilena-konfigurace-v-config-ts"></a>

## [x] TASK-002: Sdílená konfigurace v config.ts

Zavést `src/config.ts` s jedním exportovaným objektem `CONFIG` pro hodnoty, které potřebuje víc než jeden systém.
Ostatní systémy z něj budou číst místo magických čísel.

**Kontext z plánu:** [Sekce 5: Config philosophy](./PLAN.md#5-config-philosophy) včetně ukázkového obsahu `config.ts`.

**Současný stav:** Konfigurace neexistuje. `src/game.ts` má konstanty na úrovni modulu (`PADDLE_WIDTH`, `ITEM_SIZE`,
...), které patří ukázkové hře a po [TASK-001](#task-001-vstupni-bod-a-kostra-modulu) zmizí.

**Implementace:**

- [x] Vytvořit `src/config.ts` s `export const CONFIG = { ... } as const;`.
- [x] Přidat sekce: obrazovka (`logicalWidth`, `logicalHeight`, `horizonY`), den (`dayLengthSeconds`, `dayStartMinutes`,
      `dayEndMinutes`), náhoda (`seed`, `reseedOnRestart`), hlasitosti (`masterVolume`, `sfxVolume`, `ambienceVolume`),
      kanály zpětné vazby (`beepAudio`, `beepBorderPulse`, `beepDetectorBlink`, `beepHaptic`) a fáze dne (`phaseNoonAt`,
      `phaseEveningAt`).
- [x] Ke každé hodnotě napsat komentář: co dělá a co se stane při změně.
- [x] Ověřit, že hodnoty nejsou v konfliktu (například `horizonY < logicalHeight`).

**Dotčené části codebase:**

- `src/config.ts` (nový)

**Závislosti:**

- Vyžaduje dokončení [TASK-001: Vstupní bod a kostra modulů](#task-001-vstupni-bod-a-kostra-modulu).

**Blokuje:**

- [TASK-003: Portrétní režim a vypnutí overlaye](#task-003-portretni-rezim-a-vypnuti-overlaye)
- [TASK-004: Seedovaný generátor náhody](#task-004-seedovany-generator-nahody)
- [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne)

**Blokující prvky:**

- **`ambienceVolume` nemá v enginu protějšek jako sběrnice.** `BT.audioVolumeSet` zná jen `'main' | 'music' | 'sfx'`.
  Odblokování: hodnotu ponechat v konfiguraci, ale aplikovat ji jako hlasitost jednotlivého hlasu v
  [TASK-019: Ambientní zvuk podle fáze](#task-019-ambientni-zvuk-podle-faze).
- **Rozlišení 180x320 z plánu je ilustrativní.** Změna `logicalWidth` / `logicalHeight` po startu vývoje vynutí reload
  stránky a přepočet všech rozvržení. Odblokování: rozměr zafixovat hned zde, před
  [TASK-007](#task-007-scrollujici-plaz-s-perspektivou).

**Ověření dokončení:**

- [x] `pnpm typecheck` prochází, `CONFIG` je typovaný jako `as const`.
- [x] Žádná z hodnot není duplikovaná jinde v `src/`.
- [x] Obsah odpovídá seznamu polí ze [sekce 5 plánu](./PLAN.md#5-config-philosophy).

**Výsledek:** Jediné místo, kde se mění "tvar" hry; ostatní moduly z něj čtou a samy si drží jen vlastní `CONFIG` bloky.

---

<a id="task-003-portretni-rezim-a-vypnuti-overlaye"></a>

## [x] TASK-003: Portrétní režim a vypnutí overlaye

Přepnout hru na portrétní logické rozlišení a vypnout ladicí overlay enginu, aby na obrazovce zbylo místo pro vlastní
HUD.

**Kontext z plánu:** [Sekce 1: The feel](./PLAN.md#1-the-feel) (portrét telefonu) a
[sekce 3: Screen layout](./PLAN.md#3-screen-layout).

**Současný stav:** `src/game.ts` metodu `configure()` nemá, takže platí výchozí 320x240 při 60 FPS a **zapnutý
overlay**. Ověřeno v `node_modules/blit386/dist/blit386.js:3369`, kde `isOverlayEnabled` defaultuje na `true`. CSS v
`index.html` škáluje canvas podle proměnných `--canvas-*`, které nastavuje engine, takže portrét nevyžaduje zásah do
stylů.

**Implementace:**

- [x] Přidat do třídy hry `configure(): Partial<HardwareSettings>`.
- [x] Vrátit `displaySize: new Vector2i(CONFIG.logicalWidth, CONFIG.logicalHeight)` a `targetFPS: 60`.
- [x] Nastavit `isOverlayEnabled: false` (jinak engine kreslí ladicí HUD přes hru).
- [x] Nastavit `preferredOrientation: 'portrait'`.
- [x] Zvážit `isCapturingPointerScroll: true`, aby tapy a tahy po canvasu nescrollovaly stránku na telefonu, a
      `isCapturingKeyboardScroll: true` kvůli šipkám na klávesnici.
- [x] Ověřit v prohlížeči, že se plátno škáluje na výšku a nic není oříznuté.

**Dotčené části codebase:**

- vstupní soubor hry (`src/main.ts` nebo `src/game.ts` podle [TASK-001](#task-001-vstupni-bod-a-kostra-modulu))
- `src/config.ts`
- `index.html` (jen kontrola, zásah se nepředpokládá)

**Závislosti:**

- Vyžaduje dokončení [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts).

**Blokuje:**

- [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou)
- [TASK-013: HUD s čítačem a hodinkami](#task-013-hud-s-citacem-a-hodinkami)

**Blokující prvky:**

- **Každá editace `configure()` vynutí plný reload stránky** (`docs/hot-reload.md`). Dopad: během ladění rozlišení se
  ztrácí stav hry. Odblokování: hodnoty odladit najednou a pak už se `configure()` nedotýkat.
- **Zamčení orientace prohlížeč negarantuje** (iOS Safari ho ignoruje). Dopad: na iPhonu může hráč hru otočit.
  Odblokování: `onOrientationChange(type)` a jednoduchá výzva k otočení, nebo vědomě akceptovat letterbox.

**Ověření dokončení:**

- [x] Hra běží na portrétním plátně o rozměrech z `CONFIG`.
- [x] Přes obrazovku se nekreslí žádný ladicí overlay enginu.
- [x] `pnpm typecheck && pnpm lint && pnpm build` prochází.

**Výsledek:** Čisté portrétní plátno bez cizí grafiky, připravené pro vlastní HUD.

---

<a id="task-004-seedovany-generator-nahody"></a>

## [x] TASK-004: Seedovaný generátor náhody

Zavést jediný deterministický PRNG, který vlastní veškerou náhodu ve hře, aby byl každý běh reprodukovatelný podle
seedu.

**Kontext z plánu:** [Sekce 4.13: Seeded RNG](./PLAN.md#413-seeded-rng).

**Současný stav:** `src/game.ts:109` používá `Math.random()` pro pozici padajících bloků. Engine žádný PRNG nenabízí -
jedinou "seedovanou" věcí je `seed` v `SynthParams` pro zvuk. Vlastní implementace je proto nutná.

**Implementace:**

- [x] Vytvořit `src/rng/Rng.ts` s třídou nebo funkcí nad malým 32bitovým PRNG (například mulberry32).
- [x] Vystavit `next()` v rozsahu `[0, 1)`, `nextInt(min, max)` a `nextBool(p)`.
- [x] Zajistit, že se seed dá nastavit i přečíst (výsledková obrazovka ho zobrazuje).
- [x] Přidat metodu pro reset na daný seed, aby restart mohl přehrát stejnou pláž.
- [x] Nahradit veškeré použití `Math.random()` v `src/` tímto generátorem.

**Dotčené části codebase:**

- `src/rng/Rng.ts` (nový)
- `src/config.ts` (`seed`, `reseedOnRestart`)

**Závislosti:**

- Vyžaduje dokončení [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts).

**Blokuje:**

- [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou)
- [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber)
- [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results)

**Blokující prvky:**

- **Jedna instance sdílená všemi systémy je podmínkou reprodukovatelnosti.** Pokud si Beach i Treasures vytvoří vlastní
  generátor, seed přestane popisovat celý běh. Odblokování: instanci vytvořit ve vstupním souboru a předávat ji do
  konstruktorů systémů.

**Ověření dokončení:**

- [x] Dva běhy se stejným seedem vygenerují identické rozmístění předmětů i dekorace.
- [x] V `src/` se nevyskytuje `Math.random()`.
- [x] `pnpm typecheck && pnpm lint` prochází.

**Výsledek:** Jeden generátor náhody se čitelným seedem, který lze zobrazit na výsledkové obrazovce a zopakovat.

---

<a id="task-005-paletove-rampy-a-rozvrzeni-slotu"></a>

## [x] TASK-005: Paletové rampy a rozvržení slotů

Navrhnout rozvržení paletových slotů: souvislé rampy pro písek, oblohu a objekty uvnitř jednoho rozsahu, který se bude
přebarvovat, a HUD sloty mimo tento rozsah.

**Kontext z plánu:** [Sekce 4.9: Time-of-day colour (palette effects)](./PLAN.md#49-time-of-day-colour-palette-effects).

**Současný stav:** `src/game.ts:23-26` deklaruje čtyři sloty (`COLOR_BACKGROUND` = 1 až `COLOR_TEXT` = 4) a `init()`
vytváří paletu o 16 slotech. Žádné rampy neexistují. Engine nabízí přesně to, co plán potřebuje:
`BT.paletteFadeRange(start, end, target, durationMs, easing)` (`node_modules/blit386/dist/blit386.d.ts:1509`), tedy fade
omezený na rozsah indexů.

**Implementace:**

- [x] Vytvořit `src/palette/palette.ts` s pojmenovanými konstantami slotů a hranicemi ramp (`SAND_RAMP_START` /
      `SAND_RAMP_END`, `SKY_RAMP_*`, `OBJECT_RAMP_*`, `HUD_*`).
- [x] Umístit rampy světa do jednoho souvislého rozsahu a HUD sloty **mimo** něj.
- [x] Vytvořit funkci, která postaví `Palette` pro danou fázi dne (morning / noon / evening).
- [x] Zvolit způsob indexace spritů: ruční paleta plus `sheet.indexize(palette)` (zachovává kontrolu nad rampami), nebo
      `SpriteSheet.loadIndexed()` (sloty přiděluje automaticky).
- [x] Zdokumentovat rozvržení slotů komentářem nad konstantami, aby bylo zřejmé, který rozsah fade zasahuje.

**Dotčené části codebase:**

- `src/palette/palette.ts` (nový)
- `src/config.ts` (časy fází)

**Závislosti:**

- Vyžaduje dokončení [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts).

**Blokuje:**

- [TASK-006: Grafické assety ve složce public](#task-006-graficke-assety-ve-slozce-public)
- [TASK-015: Barvy podle denní doby](#task-015-barvy-podle-denni-doby)

**Blokující prvky:**

- **`SpriteSheet.loadIndexed(url, palette, startSlot)` přiděluje sloty sám** - projde PNG, sesbírá unikátní barvy a
  zapíše je od `startSlot` seřazené podle luminance (`node_modules/blit386/dist/blit386.d.ts:4745` a dále). Tím ztrácíte
  kontrolu nad tím, které konkrétní indexy tvoří rampu. Dopad: rozsah pro `paletteFadeRange` nelze spolehlivě určit.
  Odblokování: paletu napsat ručně a sprity indexovat přes `SpriteSheet.load()` + `sheet.indexize(palette)`, které barvy
  dohledává přesnou shodou RGB. To ale vyžaduje, aby PNG používaly **přesně** barvy z palety, viz
  [TASK-006](#task-006-graficke-assety-ve-slozce-public).
- **`BT.spritesRefresh()` se po fade volat nesmí.** Dokumentace enginu
  (`node_modules/blit386/dist/blit386.d.ts:2107-2112`) výslovně varuje: po změně _hodnoty_ slotu jsou uložené indexy
  stále správné a shader novou barvu vezme sám; volání `spritesRefresh()` v takové situaci může sheet z registru
  odstranit a ten přestane vykreslovat. Odblokování: `spritesRefresh()` používat jen po přeuspořádání _layoutu_ palety,
  nikdy po fade.
- **Slot 0 je vždy průhledný** a nelze do něj zapsat neprůhlednou barvu. Rampy musí začínat na 1.

**Ověření dokončení:**

- [x] Rampy světa tvoří souvislý rozsah indexů a HUD sloty leží mimo něj.
- [x] Existují alespoň tři fázové palety (morning, noon, evening) postavené stejnou funkcí.
- [x] Rozvržení slotů je popsané v komentáři a nekoliduje s velikostí palety.
- [x] `pnpm typecheck && pnpm lint` prochází.

**Výsledek:** Definované rozvržení palety, ve kterém lze jedním voláním `paletteFadeRange` přebarvit celý svět a nechat
HUD čitelný.

---

<a id="task-006-graficke-assety-ve-slozce-public"></a>

## [x] TASK-006: Grafické assety ve složce public

Vytvořit původní pixelové assety a načíst je jako indexované sprite sheety.

**Kontext z plánu:** [Sekce 8: Assets to make](./PLAN.md#8-assets-to-make).

**Současný stav:** `public/` obsahuje jen `.gitkeep`. Žádný sprite ani font neexistuje; současná hra kreslí pouze
obdélníky přes `BT.drawRectFill`.

**Implementace:**

- [x] Založit `public/sprites/` a uložit assety jako PNG s barvami **přesně** podle palety z
      [TASK-005](#task-005-paletove-rampy-a-rozvrzeni-slotu).
- [x] Nakreslit figurku hráče zezadu, hlavu detektoru (cívka/kroužek), otisk stopy.
- [x] Nakreslit zakopané předměty: hvězdice, plechovka, mušle, mince (s prostorem pro další).
- [x] Nakreslit dekorace: odpadky, kroužky po kelímku, tmavé tečky.
- [x] Nakreslit číslice `0`-`9` a dvojtečku jako jeden sprite sheet s pevnou šířkou buňky.
- [x] Nakreslit ciferník hodinek (generický styl, žádná značka ani chráněný design).
- [x] Načíst sheety v `init()` s `await` a indexovat je proti aktivní paletě.
- [x] Ověřit hot-replace: úprava PNG v `public/` se má promítnout bez reloadu stránky.

**Dotčené části codebase:**

- `public/sprites/` (nový)
- `src/palette/palette.ts`
- vstupní soubor hry (načtení a indexace v `init()`)

**Závislosti:**

- Vyžaduje dokončení [TASK-005: Paletové rampy a rozvržení slotů](#task-005-paletove-rampy-a-rozvrzeni-slotu).

**Blokuje:**

- [TASK-008: Hráč a boční kroky](#task-008-hrac-a-bocni-kroky)
- [TASK-009: Detektor a pozice hlavy](#task-009-detektor-a-pozice-hlavy)
- [TASK-013: HUD s čítačem a hodinkami](#task-013-hud-s-citacem-a-hodinkami)

**Blokující prvky:**

- **Plán umisťuje assety do `src/assets/`, engine je ale načítá z `public/`** přes root-relativní URL a Vite plugin
  sleduje kvůli hot-replace výchozí adresář `public` (`node_modules/blit386/dist/vite.d.ts`, `assetDirs`). Dopad: assety
  v `src/assets/` by se nenačetly ani neaktualizovaly za běhu. Odblokování: použít `public/` a rozdíl zapsat do plánu v
  [TASK-020](#task-020-aktualizace-dokumentace).
- **`indexize()` vyžaduje přesnou shodu RGB s paletou.** Pokud editor barvy převzorkuje nebo uloží PNG s barevným
  profilem, indexace selže. Odblokování: exportovat PNG bez profilu a barvy kontrolovat pipetou proti hodnotám v
  `palette.ts`.
- **Zbývá vytvořit veškerý obsah ručně.** Dopad: úkol je časově nejnákladnější položkou MVP. Odblokování: začít
  placeholdery o správných rozměrech a barvách, detail dodělat později.

**Ověření dokončení:**

- [x] Všechny sprity ze [sekce 8 plánu](./PLAN.md#8-assets-to-make) existují v `public/sprites/`.
- [x] `init()` je načte s `await` a žádný sheet není `undefined`.
- [x] Indexace proti paletě proběhne bez vyhozené výjimky.
- [x] Assety jsou původní, bez převzatých nebo značkových prvků.

**Výsledek:** Kompletní sada indexovaných sprite sheetů, kterou mohou vykreslovací úkoly rovnou používat.

---

<a id="task-007-scrollujici-plaz-s-perspektivou"></a>

## [x] TASK-007: Scrollující pláž s perspektivou

Postavit svislý pás pláže, který scrolluje dolů nelineárně: pomalu u horizontu, rychle u nohou hráče.

**Kontext z plánu:** [Sekce 4.1: The beach (scrolling strip)](./PLAN.md#41-the-beach-scrolling-strip).

**Současný stav:** Neexistuje. Současný `render()` kreslí jen jednobarevné pozadí přes `BT.clear`.

**Implementace:**

- [x] Vytvořit `src/game/Beach.ts` s vlastním `CONFIG` blokem nahoře (rychlost scrollu, exponent perspektivy, hustota
      dekorace).
- [x] Implementovat mapování `depth -> screenY` s laditelným exponentem.
- [x] Držet objekty ve světových souřadnicích (`worldX`, `worldY`) a promítat je až při kreslení.
- [x] Rozmístit dekoraci seedovaným generátorem z [TASK-004](#task-004-seedovany-generator-nahody).
- [x] Kreslit oblohu nad horizontem a písek pod ním; horizont brát z `CONFIG.horizonY`.
- [x] Ořezávat vše nad horizontem a recyklovat objekty, které vyjely spodní hranou.
- [x] Zaokrouhlovat všechny odvozené souřadnice přes `Math.floor` a předávat je jako `Vector2i` / `Rect2i`.

**Dotčené části codebase:**

- `src/game/Beach.ts` (nový)
- `src/config.ts` (`horizonY`)
- `src/rng/Rng.ts`

**Závislosti:**

- Vyžaduje dokončení [TASK-004: Seedovaný generátor náhody](#task-004-seedovany-generator-nahody).
- Vyžaduje dokončení [TASK-003: Portrétní režim a vypnutí overlaye](#task-003-portretni-rezim-a-vypnuti-overlaye).

**Blokuje:**

- [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber)
- [TASK-018: Stopy v písku](#task-018-stopy-v-pisku)

**Blokující prvky:**

- **Engine neumí škálovat sprity**, takže perspektiva může žít jen v rychlosti scrollu, ne ve velikosti objektů
  (`BT.drawSprite` bez parametru měřítka, `node_modules/blit386/dist/blit386.d.ts:2095`). Dopad: předměty mají u
  horizontu stejnou velikost jako u nohou. Odblokování: přijmout jako záměr podle
  [sekce 9 plánu](./PLAN.md#9-non-goals); LOD s menším spritem je možné rozšíření.
- **Celočíselné souřadnice a nelineární mapování se perou.** Při malé rychlosti u horizontu může zaokrouhlení pohyb
  úplně zastavit. Odblokování: akumulovat pozici ve `float` a zaokrouhlovat až při kreslení.

**Ověření dokončení:**

- [x] Pláž scrolluje plynule a rychlost viditelně roste směrem dolů.
- [x] Nad horizontem se nekreslí žádný objekt pláže.
- [x] Dekorace je pro stejný seed vždy stejná.
- [x] `pnpm typecheck && pnpm lint && pnpm build` prochází.

**Výsledek:** Pohyblivá pláž s falešnou perspektivou, oblohou a horizontem, do které lze umisťovat objekty ve světových
souřadnicích.

---

<a id="task-008-hrac-a-bocni-kroky"></a>

## [x] TASK-008: Hráč a boční kroky

Umístit figurku hráče na pevnou svislou pozici a nechat ji krokovat do stran podle vstupu.

**Kontext z plánu:** [Sekce 4.2: The player](./PLAN.md#42-the-player).

**Současný stav:** Neexistuje. `src/game.ts:78-93` obsahuje ovládání pádla (pointer i šipky), které je použitelné jako
vzor pro čtení vstupu, ale ne pro krokování.

**Implementace:**

- [x] Vytvořit `src/game/Player.ts` s vlastním `CONFIG` blokem (šířka kroku, rychlost, hranice pásu).
- [x] Číst vstup v `update()`: `BT.isPointerActive(0)` plus `BT.pointerPos(0)` pro rozhodnutí levá / pravá polovina
      obrazovky, `BT.isDown(BT.BTN_LEFT, 0)` a `BT.BTN_RIGHT` jako záloha.
- [x] Implementovat diskrétní krok do strany, ne plynulé klouzání.
- [x] Omezit pohyb na hratelný pás (clamp na šířku pásu).
- [x] Vykreslit figurku spritem na pevné svislé pozici, bez rotace.
- [x] Vystavit směr posledního vstupu, aby ho mohl použít detektor.

**Dotčené části codebase:**

- `src/game/Player.ts` (nový)
- `public/sprites/` (figurka hráče)

**Závislosti:**

- Vyžaduje dokončení [TASK-006: Grafické assety ve složce public](#task-006-graficke-assety-ve-slozce-public).
- Vyžaduje dokončení [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou).

**Blokuje:**

- [TASK-009: Detektor a pozice hlavy](#task-009-detektor-a-pozice-hlavy)
- [TASK-018: Stopy v písku](#task-018-stopy-v-pisku)

**Blokující prvky:**

- **Vstupní hrany (`isPressed` / `isReleased`) existují jen v `update()`.** Čtení v `render()` tap spolehlivě zmešká
  (`docs/input.md`). Odblokování: veškeré čtení vstupu držet v `update()`.
- **Tap na polovinu obrazovky a HUD si mohou konkurovat.** Dopad: tap na hodinky by mohl posunout hráče. Odblokování:
  rozdělení obrazovky vyhodnocovat až pod HUD pásem, nebo HUD z reakce na tap vyloučit.

**Ověření dokončení:**

- [x] Tap nebo držení levé či pravé poloviny posune hráče daným směrem.
- [x] Šipky na klávesnici fungují jako záloha.
- [x] Hráč nikdy neopustí hratelný pás.
- [x] Figurka se kreslí spritem a nikdy nerotuje.

**Výsledek:** Ovladatelná figurka na pevné svislé pozici, která se drží uvnitř pásu a hlásí směr posledního vstupu.

---

<a id="task-009-detektor-a-pozice-hlavy"></a>

## [x] TASK-009: Detektor a pozice hlavy

Přidat tyč detektoru kreslenou čarami, s omezeným úhlem, omezenou rychlostí otáčení a návratem do středu; hlava tyče je
bod, ze kterého se měří vzdálenost k předmětům.

**Kontext z plánu:** [Sekce 4.3: The detector](./PLAN.md#43-the-detector).

**Současný stav:** Neexistuje. Engine poskytuje `BT.drawLine(p0, p1, paletteIndex)` a `BT.drawSprite` bez rotace, což
přesně odpovídá zadání "tyč jako čáry, hrot jako nerotující sprite".

**Implementace:**

- [x] Vytvořit `src/game/Detector.ts` s `CONFIG` blokem podle [sekce 5 plánu](./PLAN.md#5-config-philosophy):
      `rodLengthPx`, `maxAngleDeg`, `turnSpeedDegPerSec`, `returnSpeedDegPerSec`.
- [x] Držet úhel tyče jako `float` a měnit ho podle vstupu omezenou rychlostí.
- [x] Při absenci vstupu vracet úhel k nule rychlostí `returnSpeedDegPerSec`.
- [x] Spočítat světovou pozici hlavy z pozice hráče, délky tyče a úhlu.
- [x] Vykreslit tyč přes `BT.drawLine` a hrot spritem (bez rotace) na zaokrouhlené pozici.
- [x] Vystavit pozici hlavy pro detekci i pro sběr.

**Dotčené části codebase:**

- `src/game/Detector.ts` (nový)
- `src/game/Player.ts` (zdroj vstupu a pozice)
- `public/sprites/` (hrot detektoru)

**Závislosti:**

- Vyžaduje dokončení [TASK-008: Hráč a boční kroky](#task-008-hrac-a-bocni-kroky).

**Blokuje:**

- [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber)
- [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk)
- [TASK-016: Tři kanály zpětné vazby](#task-016-tri-kanaly-zpetne-vazby)

**Blokující prvky:**

- **Hrot nesmí rotovat, protože engine rotaci spritů nenabízí.** Konstanty `BT.ROT_90_CW` a spol. sice existují, ale
  `BT.drawSprite` je nepřijímá (`node_modules/blit386/dist/blit386.d.ts:2095`). Odblokování: hrot navrhnout jako
  symetrický (cívka, kroužek), aby chybějící rotace nebyla vidět.
- **Úhel je vnitřně `float`, souřadnice musí být celé číslo.** Odblokování: `Math.floor` až při převodu na `Vector2i`,
  aby se chyba nekumulovala do úhlu.

**Ověření dokončení:**

- [x] Tyč se otáčí k drženému směru, zastaví se na `maxAngleDeg` a po uvolnění se vrátí do středu.
- [x] Otáčení je viditelně postupné, ne skokové.
- [x] Hlava detektoru má správnou světovou pozici i při krajních úhlech.
- [x] `pnpm typecheck && pnpm lint` prochází.

**Výsledek:** Funkční tyč detektoru s laditelnou dynamikou a spolehlivě spočítanou pozicí hlavy.

---

<a id="task-010-zakopane-predmety-a-sber"></a>

## [x] TASK-010: Zakopané předměty a sběr

Rozmístit zakopané předměty seedovaně po pásu pláže, hledat nejbližší k hlavě detektoru a automaticky je sbírat.

**Kontext z plánu:** [Sekce 4.1](./PLAN.md#41-the-beach-scrolling-strip) a
[sekce 4.6: Collection](./PLAN.md#46-collection).

**Současný stav:** Neexistuje. Nejbližší analogií je kolizní test v `src/game.ts:123`
(`paddleRect.isIntersecting(itemRect)`), ale sběr podle vzdálenosti od bodu je jiný mechanismus.

**Implementace:**

- [x] Vytvořit `src/game/Treasures.ts` s `CONFIG` blokem (hustota, `collectRadiusPx`).
- [x] Rozmístit předměty ve světových souřadnicích seedovaným generátorem, s konstantní hustotou.
- [x] Držet předměty pod pískem - nevykreslovat je, dokud nejsou vykopané.
- [x] Každý snímek najít nejbližší předmět k hlavě detektoru a vzdálenost vystavit pro pípání.
- [x] Zavést `const COLLECTION_MODE: 'head' | 'body' = 'head';` a kolizní bod podle něj volit.
- [x] Při vzdálenosti pod `collectRadiusPx` předmět odebrat ze světa a ohlásit sběr.
- [x] Doplňovat nové předměty nahoře pásu, aby hustota zůstala konstantní.

**Dotčené části codebase:**

- `src/game/Treasures.ts` (nový)
- `src/game/Beach.ts` (světové souřadnice a projekce)
- `src/game/Detector.ts` (pozice hlavy)
- `src/rng/Rng.ts`

**Závislosti:**

- Vyžaduje dokončení [TASK-009: Detektor a pozice hlavy](#task-009-detektor-a-pozice-hlavy).
- Vyžaduje dokončení [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou).

**Blokuje:**

- [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk)
- [TASK-017: Odhalení sebraného předmětu](#task-017-odhaleni-sebraneho-predmetu)

**Blokující prvky:**

- **Hledání nejbližšího předmětu běží 60x za sekundu.** Naivní průchod celým seznamem je v hot path (`docs/basics.md`
  upozorňuje na alokace v `update()`). Dopad: při větším počtu předmětů propad výkonu. Odblokování: prohledávat jen
  předměty v okně kolem hráče a nealokovat v cyklu nové objekty.
- **`COLLECTION_MODE` je zatím otevřené rozhodnutí.** Plán doporučuje `'head'`, ale explicitně ho nechává jako přepínač.
  Dopad: volba mění pocit ze hry. Odblokování: implementovat obě větve za jedním flagem a hodnotu zamknout až po
  odehrání.

**Ověření dokončení:**

- [x] Předměty se pro stejný seed rozmisťují identicky.
- [x] Zakopaný předmět není vidět, dokud není vykopaný.
- [x] Průchod sběrným bodem přes předmět ho odstraní a zvýší čítač o jedna.
- [x] Přepnutí `COLLECTION_MODE` na `'body'` změní sběrný bod a nic jiného nerozbije.

**Výsledek:** Svět plný neviditelných předmětů, které lze najít podle vzdálenosti a automaticky vykopat.

---

<a id="task-011-pipani-detektoru-a-zvuk"></a>

## [x] TASK-011: Pípání detektoru a zvuk

Převést vzdálenost k nejbližšímu předmětu na interval pípání a syntetizovat zvuky detektoru a sběru.

**Kontext z plánu:** [Sekce 4.4: Detection and beeping](./PLAN.md#44-detection-and-beeping) a
[sekce 4.10: Audio](./PLAN.md#410-audio).

**Současný stav:** Hra je zcela němá. Engine nabízí `AudioClip.synth(params)` s `waveform`, `frequency`, `duration`,
`seed` a volitelnou obálkou, `BT.soundPlay(clip, options)` a sběrnice `main` / `music` / `sfx`.

**Implementace:**

- [x] Vytvořit `src/audio/Sfx.ts`, který v `init()` s `await` vytvoří tik detektoru a zvuk sběru.
- [x] Namapovat vzdálenost na interval: nad `silenceThresholdPx` ticho, na okraji `detectRadiusPx` interval
      `beepIntervalSlowMs`, přímo nad předmětem `beepIntervalFastMs`, mezi tím křivka s exponentem `beepCurvePower`.
- [x] Vést vlastní akumulátor času přes `BT.deltaSeconds` (interval je proměnný v milisekundách, takže třída `Timer` s
      pevným počtem ticků se nehodí).
- [x] Vystavit "hranici pípnutí" jako událost, na kterou se navěsí ostatní kanály zpětné vazby.
- [x] Přehrávat tik konstantní hlasitostí, bez ducking proti ambientu.
- [x] Nastavit hlasitosti sběrnic z `CONFIG` (`masterVolume` na `'main'`, `sfxVolume` na `'sfx'`).

**Dotčené části codebase:**

- `src/audio/Sfx.ts` (nový)
- `src/game/Detector.ts` (`CONFIG` bloku pro detekci a pípání)
- `src/game/Treasures.ts` (vzdálenost k nejbližšímu předmětu)
- `src/config.ts` (hlasitosti, `beepAudio`)

**Závislosti:**

- Vyžaduje dokončení [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber).

**Blokuje:**

- [TASK-016: Tři kanály zpětné vazby](#task-016-tri-kanaly-zpetne-vazby)

**Blokující prvky:**

- **Zvuk je do prvního doteku hráče umlčený.** `BT.soundPlay` před odemknutím se zahodí (`docs/audio.md`). Dopad: pípání
  v prvních sekundách hry by chybělo, kdyby hra začínala rovnou. Odblokování: hru startovat tapem na title screenu,
  který audio odemkne - viz [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results).
- **Syntéza patří do `init()`, nikdy do `update()`.** Dopad: výroba klipu za běhu způsobí záseky snímku. Odblokování:
  všechny klipy vytvořit předem a v `update()` je jen přehrávat.
- **`duration` v `SynthParams` má horní limit** daný enginem (`node_modules/blit386/dist/blit386.d.ts:5187`). Pro krátký
  tik je to bez dopadu, ale je to omezení pro delší zvuky, viz [TASK-019](#task-019-ambientni-zvuk-podle-faze).

**Ověření dokončení:**

- [x] Vzdálenost od předmětu měřitelně mění frekvenci pípání.
- [x] Za hranicí ticha nepípá nic.
- [x] Změna `beepCurvePower` z 1 na 2 je slyšitelná v posledních pixelech.
- [x] Sběr předmětu přehraje vlastní zvuk odlišný od tiku.

**Výsledek:** Slyšitelný detektor, jehož rytmus je jediným vodítkem k nalezení předmětu, plus zvuk sběru.

---

<a id="task-012-denni-hodiny-a-konec-dne"></a>

## [x] TASK-012: Denní hodiny a konec dne

Převést reálné dvě minuty na herní čas 6:00 -> 22:00, odvodit fázi dne, pauzovat při ztrátě fokusu a ukončit hru ve
22:00.

**Kontext z plánu:** [Sekce 4.8: The day clock](./PLAN.md#48-the-day-clock).

**Současný stav:** Neexistuje. K dispozici je `BT.deltaSeconds` a `BT.ticks`; engine nemá vlastní pauzu ani hook na
změnu viditelnosti karty, takže pauzu je nutné napsat ručně nad `document.visibilitychange`. Ověřeno, že
`document.hidden`, `localStorage` i `navigator.vibrate` v tomto projektu typují bez chyby (`lib: ["ESNext", "DOM"]` v
`tsconfig.json`).

**Implementace:**

- [x] Vytvořit `src/game/DayClock.ts`.
- [x] Akumulovat čas přes `BT.deltaSeconds` do `dayLengthSeconds` z `CONFIG`.
- [x] Vystavit herní čas v minutách, normalizovaný `dayProgress` v `[0, 1]` a fázi (morning / noon / evening) podle
      `phaseNoonAt` a `phaseEveningAt`.
- [x] Zastavit akumulaci, když je karta skrytá (`document.visibilitychange` plus `document.hidden`).
- [x] Vystavit událost konce dne, která spustí pípnutí hodinek a ukončí hru.
- [x] Zajistit odregistrování posluchače, aby ho opakovaný běh `init()` při hot reloadu nepřidával podruhé.

**Dotčené části codebase:**

- `src/game/DayClock.ts` (nový)
- `src/config.ts` (`dayLengthSeconds`, `dayStartMinutes`, `dayEndMinutes`, časy fází)

**Závislosti:**

- Vyžaduje dokončení [TASK-002: Sdílená konfigurace v config.ts](#task-002-sdilena-konfigurace-v-config-ts).

**Blokuje:**

- [TASK-013: HUD s čítačem a hodinkami](#task-013-hud-s-citacem-a-hodinkami)
- [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results)
- [TASK-015: Barvy podle denní doby](#task-015-barvy-podle-denni-doby)

**Blokující prvky:**

- **Hot reload spouští `init()` znovu a posluchač `visibilitychange` by se zaregistroval vícekrát.** Dopad: hodiny by se
  po několika editacích chovaly nepředvídatelně. Odblokování: posluchač držet v modulu s idempotentní registrací, nebo
  ho před přidáním vždy odebrat.
- **`update()` může engine v rámci jednoho snímku zavolat vícekrát (catch-up)** nebo vůbec (`IBTDemo.update` v
  `node_modules/blit386/dist/blit386.d.ts`). Dopad: časování odvozené od počtu volání by ujíždělo. Odblokování: počítat
  výhradně s `BT.deltaSeconds`.

**Ověření dokončení:**

- [x] Dvě reálné minuty odpovídají herním 6:00 -> 22:00.
- [x] Přepnutí na jinou kartu prokazatelně zastaví běh času.
- [x] Fáze se přepínají na zadaných prazích.
- [x] Ve 22:00 se vyvolá konec dne právě jednou.

**Výsledek:** Spolehlivé herní hodiny, které pauzují mimo fokus a řídí konec běhu i barvy denní doby.

---

<a id="task-013-hud-s-citacem-a-hodinkami"></a>

## [x] TASK-013: HUD s čítačem a hodinkami

Vykreslit čítač sebraných předmětů vlevo nahoře a hodinky vpravo nahoře, výhradně bitmapami, bez textu.

**Kontext z plánu:** [Sekce 4.11: HUD](./PLAN.md#411-hud) a [sekce 3: Screen layout](./PLAN.md#3-screen-layout).

**Současný stav:** `src/game.ts:155-156` používá `BT.systemPrint` (vestavěný systémový font). Plán ale výslovně požaduje
nula textu a vlastní bitmapové číslice, takže `systemPrint` může sloužit nanejvýš jako dočasná výpomoc při ladění.

**Implementace:**

- [x] Vytvořit `src/hud/Counter.ts`, který vykreslí počet sebraných předmětů z číslicového sheetu.
- [x] Vytvořit `src/hud/Watch.ts` s ciferníkem a digitálním časem `HH:MM` z číslic a dvojtečky.
- [x] Napsat pomocnou funkci pro vykreslení řetězce číslic přes `BT.drawSprite` s pevnou šířkou buňky.
- [x] Kotvit oba prvky do horních rohů podle `BT.displaySize`.
- [x] Přehrát pípnutí hodinek na konci dne (událost z [TASK-012](#task-012-denni-hodiny-a-konec-dne)).
- [x] Kreslit HUD sloty mimo přebarvovaný rozsah palety, aby zůstal čitelný celý den.

**Dotčené části codebase:**

- `src/hud/Counter.ts` (nový)
- `src/hud/Watch.ts` (nový)
- `src/palette/palette.ts` (HUD sloty)
- `public/sprites/` (číslice, ciferník)

**Závislosti:**

- Vyžaduje dokončení [TASK-006: Grafické assety ve složce public](#task-006-graficke-assety-ve-slozce-public).
- Vyžaduje dokončení [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne).

**Blokuje:**

- [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results)

**Blokující prvky:**

- **Bitmapový font nemá v projektu nástrojovou podporu.** Engine sice umí `BitmapFont.load(url)` pro formát `.btfont`,
  ale kit CLI nabízí pouze `run`, `doctor`, `upgrade`, `migrate` a `agents` - žádný převodník fontů. Dopad: cesta přes
  `.btfont` by vyžadovala externí nástroj. Odblokování: vykreslovat číslice jako sprity z jednoho sheetu s pevnou
  mřížkou; `BitmapFont` je volitelné rozšíření.
- **HUD musí zůstat čitelný i za šera.** Pokud jeho sloty spadnou do rozsahu, který přebarvuje `paletteFadeRange`, večer
  zešedne. Odblokování: hranice ramp zafixovat v [TASK-005](#task-005-paletove-rampy-a-rozvrzeni-slotu) a HUD sloty
  držet mimo ně.

**Ověření dokončení:**

- [x] Čítač i hodinky jsou vidět v horních rozích a nepřekrývají hratelnou plochu.
- [x] Zobrazený čas odpovídá stavu `DayClock`.
- [x] Ve hře se nevyskytuje žádný text vykreslený systémovým fontem.
- [x] HUD je čitelný ve všech třech fázích dne.

**Výsledek:** Textově prostý bitmapový HUD, který ukazuje skóre i čas a beze změny přežije přebarvení světa.

---

<a id="task-014-obrazovky-title-play-a-results"></a>

## [x] TASK-014: Obrazovky Title, Play a Results

Zavést stavový automat tří obrazovek, odemknout audio tapem na title, uložit nejlepší skóre a umožnit restart bez
reloadu stránky.

**Kontext z plánu:** [Sekce 4.12: Screen flow](./PLAN.md#412-screen-flow).

**Současný stav:** Neexistuje. Současná hra po ztrátě životů jen resetuje proměnné (`src/game.ts:135-139`); žádné
obrazovky ani perzistence nejsou.

**Implementace:**

- [x] Vytvořit `src/ui/TitleScreen.ts` (tap spustí hru a odemkne audio) a `src/ui/ResultsScreen.ts`.
- [x] Zavést ve vstupním souboru stav `title` / `play` / `results` a přepínat podle něj `update()` i `render()`.
- [x] Na výsledkové obrazovce zobrazit počet nálezů, seed běhu a nejlepší skóre.
- [x] Uložit nejlepší skóre do `localStorage` a bezpečně ošetřit chybějící nebo poškozenou hodnotu.
- [x] Přidat tapovatelnou oblast pro restart, který resetuje stav bez reloadu stránky.
- [x] Podle `CONFIG.reseedOnRestart` rozhodnout, zda restart přegeneruje seed.
- [x] Kontrolovat `BT.isAudioUnlocked` a na title screenu srozumitelně čekat na dotek.

**Dotčené části codebase:**

- `src/ui/TitleScreen.ts` (nový)
- `src/ui/ResultsScreen.ts` (nový)
- vstupní soubor hry (stavový automat)
- `src/rng/Rng.ts` (seed pro zobrazení a případné přegenerování)

**Závislosti:**

- Vyžaduje dokončení [TASK-013: HUD s čítačem a hodinkami](#task-013-hud-s-citacem-a-hodinkami).
- Vyžaduje dokončení [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne).
- Vyžaduje dokončení [TASK-004: Seedovaný generátor náhody](#task-004-seedovany-generator-nahody).

**Blokuje:**

- [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk) je na této obrazovce závislé kvůli odemčení
  audia; bez title screenu zůstane začátek hry němý.

**Blokující prvky:**

- **`localStorage` může vyhodit výjimku** v privátním režimu nebo při zaplněné kvótě. Dopad: pád hry při zápisu skóre.
  Odblokování: zápis i čtení obalit `try` / `catch` a při selhání pokračovat bez perzistence.
- **Zobrazení seedu a nejlepšího skóre potřebuje číslice**, tedy hotový sheet z
  [TASK-006](#task-006-graficke-assety-ve-slozce-public) a vykreslovací funkci z
  [TASK-013](#task-013-hud-s-citacem-a-hodinkami). Odblokování: sdílet jednu funkci pro kreslení číslic mezi HUD a
  obrazovkami.
- **Restart musí resetovat úplně všechen stav** včetně hodin, pláže i předmětů. Dopad: nedoresetovaný systém způsobí, že
  druhý běh startuje uprostřed dne. Odblokování: každému systému dát metodu `reset()` a volat je z jednoho místa.

**Ověření dokončení:**

- [x] Tap na title screenu spustí hru a od té chvíle je slyšet zvuk.
- [x] Ve 22:00 hra přejde na výsledky s korektním počtem nálezů.
- [x] Nejlepší skóre přežije reload stránky.
- [x] Restart z výsledků rozjede plnohodnotný nový běh bez reloadu.
- [x] `pnpm typecheck && pnpm lint && pnpm build` prochází.

**Výsledek:** Uzavřená smyčka Title -> Play -> Results -> restart. Tímto úkolem je splněna definice hotového MVP ze
[sekce 7 plánu](./PLAN.md#7-build-order-and-the-one-day-cut).

---

<a id="task-015-barvy-podle-denni-doby"></a>

## [x] TASK-015: Barvy podle denní doby

Nechat hodiny řídit paletový přechod mezi fázemi dne tak, aby se přebarvil svět, ale ne HUD.

**Kontext z plánu:** [Sekce 4.9: Time-of-day colour (palette effects)](./PLAN.md#49-time-of-day-colour-palette-effects).

**Současný stav:** Neexistuje. Rozvržení ramp vznikne v [TASK-005](#task-005-paletove-rampy-a-rozvrzeni-slotu); engine
poskytuje `BT.paletteFadeRange(start, end, target, durationMs, easing)` (`node_modules/blit386/dist/blit386.d.ts:1509`),
tedy fade omezený na rozsah indexů, přesně podle plánu.

**Implementace:**

- [x] Doplnit do `src/palette/palette.ts` funkci, která spustí přechod na paletu další fáze.
- [x] Volat `BT.paletteFadeRange` s hranicemi ramp světa, nikdy s celým rozsahem palety.
- [x] Napojit spuštění přechodu na změnu fáze z `DayClock`.
- [x] Zvolit délku přechodu a easing tak, aby změna byla patrná, ale ne rušivá.
- [x] Zajistit, aby restart hry vrátil paletu do ranní fáze (`BT.paletteClearEffects` a nastavení výchozí palety).

**Dotčené části codebase:**

- `src/palette/palette.ts`
- `src/game/DayClock.ts` (událost změny fáze)
- `src/config.ts` (`phaseNoonAt`, `phaseEveningAt`)

**Závislosti:**

- Vyžaduje dokončení [TASK-005: Paletové rampy a rozvržení slotů](#task-005-paletove-rampy-a-rozvrzeni-slotu).
- Vyžaduje dokončení [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne).

**Blokující prvky:**

- **Po fade se nesmí volat `BT.spritesRefresh()`.** Dokumentace enginu
  (`node_modules/blit386/dist/blit386.d.ts:2107-2112`) varuje, že po změně hodnoty slotu jsou indexy spritů stále platné
  a volání `spritesRefresh()` může sheet vyřadit z registru, takže přestane vykreslovat. Odblokování: `spritesRefresh()`
  v tomto úkolu vůbec nepoužívat.
- **Nedokončený přechod v okamžiku restartu.** Dopad: nový běh by startoval s večerní paletou. Odblokování: při restartu
  efekty zrušit a paletu nastavit natvrdo.

**Ověření dokončení:**

- [x] Během jednoho běhu se barvy oblohy i písku viditelně promění třikrát.
- [x] HUD si během celého dne drží stejné barvy.
- [x] Sprity po přechodu nezmizí ani se nepřebarví chybně.
- [x] Restart začíná znovu ranní paletou.

**Výsledek:** Plynoucí den, který je vidět na barvách světa, aniž by trpěla čitelnost HUD.

---

<a id="task-016-tri-kanaly-zpetne-vazby"></a>

## [x] TASK-016: Tři kanály zpětné vazby

Rozvést jeden takt pípání do tří kanálů: zvuk, obraz (pulz rámečku a blikání hrotu) a vibrace.

**Kontext z plánu:** [Sekce 4.5: Feedback channels](./PLAN.md#45-feedback-channels).

**Současný stav:** Neexistuje. Takt pípání vznikne v [TASK-011](#task-011-pipani-detektoru-a-zvuk); v současné hře není
žádná vizuální ani hmatová odezva.

**Implementace:**

- [x] Vytvořit `src/game/Signals.ts`, který odebírá hranici pípnutí a rozesílá ji do kanálů.
- [x] Kanál obraz: pulz rámečku po obvodu obrazovky (`BT.drawRect`) a blikání hrotu detektoru.
- [x] Kanál hmat: `navigator.vibrate` s krátkým impulzem, ošetřený na neexistenci podpory.
- [x] Kanál zvuk: přehrání tiku z `Sfx`.
- [x] Každý kanál řídit vlastním přepínačem z `CONFIG` (`beepAudio`, `beepBorderPulse`, `beepDetectorBlink`,
      `beepHaptic`).
- [x] Ověřit, že se hra dá hrát s vypnutým zvukem jen podle obrazu.

**Dotčené části codebase:**

- `src/game/Signals.ts` (nový)
- `src/game/Detector.ts` (blikání hrotu)
- `src/audio/Sfx.ts`
- `src/config.ts` (přepínače kanálů)

**Závislosti:**

- Vyžaduje dokončení [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk).
- Vyžaduje dokončení [TASK-009: Detektor a pozice hlavy](#task-009-detektor-a-pozice-hlavy).

**Blokující prvky:**

- **`navigator.vibrate` je na desktopu i v iOS Safari nedostupné.** Typově je funkce v projektu v pořádku (ověřeno proti
  `tsconfig.json` s `lib: ["ESNext", "DOM"]`), ale za běhu nemusí existovat. Dopad: pád při volání na nepodporované
  platformě. Odblokování: volání podmínit kontrolou existence a návratovou hodnotu ignorovat.
- **Rozhodování o pípnutí musí zůstat v `update()`, kreslení pulzu v `render()`.** Dopad: rozdělení jinak porušuje tvrdé
  pravidlo projektu. Odblokování: `Signals` počítá stav v `update()` a v `render()` už jen čte.
- **Vibrace vyžaduje odemčenou interakci** stejně jako zvuk. Odblokování: kanál aktivovat až po přechodu z title
  screenu.

**Ověření dokončení:**

- [x] Rámeček pulzuje ve stejném rytmu jako zvukový tik.
- [x] Hrot detektoru bliká synchronně s pípnutím.
- [x] Vypnutí `beepAudio` nechá vizuální kanály beze změny funkční.
- [x] Na zařízení bez podpory vibrací hra nespadne.

**Výsledek:** Hratelnost bez zvuku: hráč pozná blízkost předmětu i s vypnutým reproduktorem.

---

<a id="task-017-odhaleni-sebraneho-predmetu"></a>

## [x] TASK-017: Odhalení sebraného předmětu

Po sebrání ukázat nález uprostřed obrazovky, chvíli ho podržet a nechat vyjet dolů z obrazu.

**Kontext z plánu:** [Sekce 4.7: The pickup reveal](./PLAN.md#47-the-pickup-reveal).

**Současný stav:** Neexistuje. Sběr z [TASK-010](#task-010-zakopane-predmety-a-sber) zatím jen zvýší čítač.

**Implementace:**

- [x] Vytvořit `src/game/Pickup.ts` s `CONFIG` blokem (doba podržení, rychlost odjezdu).
- [x] Spawnovat odhalení při sběru na středu obrazovky, ve výchozí velikosti spritu.
- [x] Po uplynutí doby podržení posouvat sprite dolů, dokud neopustí spodní hranu.
- [x] Zvýšit čítač v okamžiku spawnu odhalení, ne až po dojetí animace.
- [x] Zvládnout více odhalení současně (rychle po sobě sebrané předměty).

**Dotčené části codebase:**

- `src/game/Pickup.ts` (nový)
- `src/game/Treasures.ts` (událost sběru)
- `src/hud/Counter.ts` (inkrement čítače)

**Závislosti:**

- Vyžaduje dokončení [TASK-010: Zakopané předměty a sběr](#task-010-zakopane-predmety-a-sber).

**Blokující prvky:**

- **"Full size" v plánu neznamená zvětšení.** Engine sprity neškáluje (`node_modules/blit386/dist/blit386.d.ts:2095`),
  takže odhalení kreslí sprite v nativní velikosti. Dopad: pokud jsou předměty velmi malé, odhalení bude nevýrazné.
  Odblokování: nakreslit pro odhalení samostatný větší sprite předmětu.
- **Odhalení nesmí zakrýt HUD ani hráče.** Odblokování: vymezit svislý pás mezi horizontem a figurkou a držet animaci v
  něm.

**Ověření dokončení:**

- [x] Sebraný předmět se objeví uprostřed, chvíli vydrží a sjede dolů z obrazovky.
- [x] Čítač se zvýší ve chvíli spawnu odhalení.
- [x] Dvě rychle po sobě sebrané věci se zobrazí obě, bez blikání.

**Výsledek:** Hráč vždy uvidí, co vykopal, a sběr má viditelné vyvrcholení.

---

<a id="task-018-stopy-v-pisku"></a>

## [x] TASK-018: Stopy v písku

Odkládat za hráčem otisky stop, které odplouvají spolu s pískem.

**Kontext z plánu:** [Sekce 4.2: The player](./PLAN.md#42-the-player).

**Současný stav:** Neexistuje. Pás pláže z [TASK-007](#task-007-scrollujici-plaz-s-perspektivou) už umí nést objekty ve
světových souřadnicích, takže stopy do něj lze vkládat jako další druh dekorace.

**Implementace:**

- [x] Ukládat otisk při každém dokončeném kroku hráče do světových souřadnic pásu.
- [x] Vykreslovat otisky jako nerotující sprite pod figurkou.
- [x] Omezit počet živých otisků a nejstarší zahazovat.
- [x] Odstraňovat otisky, které vyjely spodní hranou.

**Dotčené části codebase:**

- `src/game/Player.ts`
- `src/game/Beach.ts` (světové souřadnice a scroll)
- `public/sprites/` (otisk stopy)

**Závislosti:**

- Vyžaduje dokončení [TASK-008: Hráč a boční kroky](#task-008-hrac-a-bocni-kroky).
- Vyžaduje dokončení [TASK-007: Scrollující pláž s perspektivou](#task-007-scrollujici-plaz-s-perspektivou).

**Blokující prvky:**

- **Bez horní hranice počtu otisků poroste seznam do nekonečna.** Dopad: propad výkonu při dlouhé hře. Odblokování:
  kruhový buffer s pevnou kapacitou.
- **Otisky nerotují**, takže levá a pravá stopa musí být buď dva sprity, nebo jeden symetrický. Odblokování: nakreslit
  symetrický otisk.

**Ověření dokončení:**

- [x] Krok do strany zanechá otisk, který se scrollem odplouvá dolů.
- [x] Počet živých otisků je shora omezený.
- [x] Snímková frekvence po minutě hraní neklesá.

**Výsledek:** Viditelná stopa hráčova pohybu, která posiluje dojem, že se pláž skutečně sune pod nohama.

---

<a id="task-019-ambientni-zvuk-podle-faze"></a>

## [x] TASK-019: Ambientní zvuk podle fáze

Přidat tichý ambientní podklad, který se mění s fází dne a mezi fázemi se prolíná.

**Kontext z plánu:** [Sekce 4.10: Audio](./PLAN.md#410-audio); jde o stretch cíl ze
[sekce 7](./PLAN.md#7-build-order-and-the-one-day-cut).

**Současný stav:** Neexistuje. Engine umí `BT.soundPlay(clip, { loop: true, volume, fadeInMs })`,
`BT.soundVolumeSet(ref, value, { fadeMs })` a `BT.soundStop(ref, { fadeOutMs })`, takže prolínání lze poskládat ze dvou
hlasů.

**Implementace:**

- [x] Vytvořit `src/audio/Ambience.ts` s klipy pro jednotlivé fáze.
- [x] Zkusit nejprve `AudioClip.synth`; teprve co syntéza nezvládne, doplnit krátkými smyčkami MP3 v `public/`.
- [x] Přehrávat ambient ve smyčce s hlasitostí `CONFIG.ambienceVolume`.
- [x] Při změně fáze prolnout starý a nový hlas přes `fadeMs` / `fadeOutMs`.
- [x] Zajistit, že ambient nepřehluší tik detektoru (ten má zůstat výrazný a bez ducking).
- [x] Zastavit ambient při přechodu na výsledkovou obrazovku a při restartu.

**Dotčené části codebase:**

- `src/audio/Ambience.ts` (nový)
- `public/` (případné MP3 smyčky)
- `src/game/DayClock.ts` (událost změny fáze)
- `src/config.ts` (`ambienceVolume`)

**Závislosti:**

- Vyžaduje dokončení [TASK-012: Denní hodiny a konec dne](#task-012-denni-hodiny-a-konec-dne).
- Vyžaduje dokončení [TASK-011: Pípání detektoru a zvuk](#task-011-pipani-detektoru-a-zvuk).

**Blokující prvky:**

- **Ambient nemá vlastní audio sběrnici.** `BT.audioVolumeSet` zná jen `'main'`, `'music'` a `'sfx'`, takže
  `CONFIG.ambienceVolume` nelze namapovat na bus. Dopad: ztlumení ambientu by ztlumilo i pípání. Odblokování: hlasitost
  nastavovat per-voice přes `BT.soundVolumeSet(ref, ...)`.
- **Délka syntetizovaného klipu je omezená** (`duration` v `SynthParams`,
  `node_modules/blit386/dist/blit386.d.ts:5187`). Dopad: dlouhý ambientní podklad nelze vyrobit jedním klipem.
  Odblokování: krátký klip ve smyčce, nebo MP3 v `public/`.
- **Ambient jako smyčka nesmí jít přes hudební sběrnici** - plán hudbu výslovně vylučuje. Odblokování: použít
  `BT.soundPlay` s `loop: true`, nikoli `BT.musicPlay`.

**Ověření dokončení:**

- [x] Každá fáze dne má rozpoznatelně jiný ambient.
- [x] Přechod mezi fázemi je prolnutý, ne skokový.
- [x] Tik detektoru zůstává zřetelně slyšet nad ambientem.
- [x] Ambient se zastaví na výsledkové obrazovce.

**Výsledek:** Zvuková kulisa, která podpírá vnímání denní doby, aniž by zakryla hlavní signál hry.

---

<a id="task-020-aktualizace-dokumentace"></a>

## [x] TASK-020: Aktualizace dokumentace

Srovnat dokumentaci se skutečným stavem kódu, jak to vyžaduje plán sám.

**Kontext z plánu:** [Sekce 10: Keeping this document alive](./PLAN.md#10-keeping-this-document-alive).

**Současný stav:** `CLAUDE.md` tvrdí, že "celá hra je `src/game.ts`: jedna třída předaná do `bootstrap(Game)`", a
popisuje ukázkovou hru s pádlem (`COLOR_BACKGROUND` / `COLOR_PADDLE`). `README.md` vysvětluje hráči chytání padajících
bloků. Plán se v [sekci 6](./PLAN.md#6-suggested-module-map) sám odkazuje jako na `GAME.md`, ačkoli soubor se jmenuje
`PLAN.md`. Všechny tyto texty budou po dokončení implementace nepravdivé.

**Implementace:**

- [x] Přepsat v `CLAUDE.md` sekci Architecture na modulární `src/` a doplnit skutečný vstupní soubor.
- [x] Aktualizovat v `CLAUDE.md` výčet barevných slotů a odkaz na rozvržení palety.
- [x] Přepsat `README.md` na popis Beach Detectoru včetně ovládání a tipů, co zkusit změnit.
- [x] Srovnat konfigurační náčrt v [sekci 5 plánu](./PLAN.md#5-config-philosophy) se skutečným `src/config.ts`.
- [x] Opravit v plánu umístění assetů z `src/assets/` na `public/`.
- [x] Sjednotit název dokumentu (`PLAN.md` vs. `GAME.md`) v celém plánu.
- [x] Zaznamenat rozhodnutí o `COLLECTION_MODE`, pokud je v praxi zamčené na jednu hodnotu.
- [x] Zapsat do `AGENTS.md` pod značku "Your notes" projektová zjištění (chování hot reloadu u nevstupních modulů,
      vypnutý overlay, zákaz `spritesRefresh()` po fade).
- [x] Rozhodnout osud stretch cíle "light CRT preset", který koliduje se zákazem post-process efektů.

**Dotčené části codebase:**

- `CLAUDE.md`
- `README.md`
- `PLAN.md`
- `AGENTS.md` (výhradně sekce pod `blit-kit:managed:end`)

**Závislosti:**

- Vyžaduje dokončení [TASK-014: Obrazovky Title, Play a Results](#task-014-obrazovky-title-play-a-results) (MVP),
  ideálně i navazujících úkolů druhé vrstvy.

**Blokující prvky:**

- **`docs/*.md` jsou `kit-owned`** a `pnpm exec blit agents sync` je přepíše (`.blit/manifest.json`). Dopad: jakákoli
  ruční úprava v `docs/` se ztratí. Odblokování: do `docs/` nezasahovat a projektové poznámky psát do `AGENTS.md` pod
  koncovou značku.
- **`AGENTS.md` je `shared`** - regeneruje se všechno mezi značkami `blit-kit:managed:start` a `:end`. Odblokování: psát
  výhradně pod koncovou značku.
- **Stretch cíl CRT je v přímém rozporu s tvrdým pravidlem projektu.** Dopad: nerozhodnutý konflikt bude svádět k jeho
  implementaci. Odblokování: buď ho z plánu vypustit, nebo si vyžádat výslovnou výjimku a zdokumentovat dopad na Canvas
  2D fallback.

**Ověření dokončení:**

- [x] `CLAUDE.md` popisuje skutečnou strukturu `src/` a skutečný vstupní soubor.
- [x] `README.md` popisuje Beach Detector, ne hru s pádlem.
- [x] Konfigurační náčrt v plánu odpovídá `src/config.ts`.
- [x] V dokumentaci nezůstal žádný odkaz na `src/assets/` ani na `GAME.md`.
- [x] `pnpm typecheck && pnpm lint && pnpm build` prochází a hra je hratelná od title po results.

**Výsledek:** Dokumentace, kód a plán si neodporují; další agent i další čtenář dostanou pravdivý obrázek projektu.
