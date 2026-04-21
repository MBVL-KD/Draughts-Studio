# Roblox agent — lesson step playback (Draughts Studio)

Doel: een andere agent (bv. Roblox-backend of Lua) kan **één lesstap** ophalen als **kanonieke runtime-DTO** (`playbackPayload`), gebouwd door de Studio-server uit Mongo. Roblox hoeft **geen ruwe** `authoringV2`-Mongo-document te parsen: het HTTP-`item` bevat naast legacy bord/validatie ook een optioneel **`authoringTimeline`** (ministeps) — dat is het afspeel-/logica-script. Cache op boek-revision blijft aanbevolen.

**Bron in code:** `server/src/routes/playback.ts`, `server/src/services/playbackService.ts`, `server/src/validation/playbackSchemas.ts`.

### Bridge-afstemming (Draughts-api / Kid Draughts)

- Een **canonieke kopie** van het HTTP-contract kan in repo **Draughts-api** staan als `CONTRACT_PLAYBACK_HTTP_V1.md` (commit daar leidend voor gateway + Roblox). Dit bestand beschrijft dezelfde routes/velden vanuit **deze** server.
- **Puzzels:** `CONTRACT_PUZZLES_V1.md` koppelt `POST /v1/puzzles/next` aan deze playback-payload (`item`); bij playback-problemen na retries kan de bridge **503** + `PLAYBACK_UNAVAILABLE` teruggeven — Roblox moet dat als transient behandelen.
- **Editor-repo:** kleine helper `client/src/lesson-system/api/playbackHttpClient.ts` — query-builder (o.a. herhaalde `requiredLanguage`), owner-headers, cache-key helper — bedoeld om **dezelfde query-string** te bouwen als de bridge (`fetchPlaybackPayload`-stijl).

### Eén zin om overal te plakken

Roblox consumeert alleen HTTP **`item`** (`payloadVersion: 2`); **`lang`** kiest welke taal de strings in `item` zijn; **`requiredLanguage`** bepaalt welke talen Studio-export **verplicht ingevuld** laat slagen — die twee moeten bewust hetzelfde beleid volgen als Kid Draughts + Studio.

### Productie-export (Studio + Roblox dezelfde set)

- **Vaste export-talen** staan in de Editor-repo: `client/src/lesson-system/config/playbackExportLanguages.ts` → `PLAYBACK_EXPORT_REQUIRED_LANGUAGES` (nu **`en` + `nl`**).
- **Roblox:** zet `LearningRuntimeConfig` / `PlaybackRequiredLanguages` op **exact dezelfde** lijst; elke playback-request moet dezelfde `requiredLanguage`-query gebruiken.
- **Studio:** bij opslaan merged `prepareBookForPersistedSave` authoring-validatie met **runtime-export-readiness** (grotendeels gelijk aan server `validateStepForRuntimeExport`: o.a. title, feedback waar interactie, MC-labels, FEN tenzij tekst-only-stap; legacy `prompt` blokkeert export niet meer). Lege verplichte strings na trim falen waar van toepassing.
- **FEN + sourceRef** blijven server-side leidend voor definitieve playback-400; Studio helpt vooraf met FEN-parse en (optioneel) bron-node-check als bron geladen is — anders **warning** `runtimeExport.source_not_loaded`.

| Query | Betekenis |
|-------|-----------|
| `lang` | Weergavetaal van strings in `item` (server resolved via localized fields). |
| `requiredLanguage` | Welke talen inhoudelijk **verplicht** zijn voor `validateStepForRuntimeExport` — **niet** hetzelfde als “alleen UI-taal”. Herhaal de parameter per taal (`requiredLanguage=en&requiredLanguage=nl`) of gebruik komma’s (`requiredLanguage=en,nl`); Express accepteert beide (zie `playback.ts`). |

---

## 1. Base URL & mount

- API-prefix: **`/api`**
- Playback-router: **`/api/steps`** (`server/src/routes/index.ts`)

---

## 2. Authenticatie / owner context

Elke route roept `getOwnerContext(req)` aan (`server/src/routes/ownerContext.ts`).

- **`req.auth`** wordt gezet door `server/src/middleware/authContext.js`:
  - Voorkeur headers: **`x-owner-type`** (`user` \| `school` \| `org`) en **`x-owner-id`** (string).
  - Alternatief: `req.user.ownerType` / `req.user.ownerId` (indien jullie JWT/session dat zet).
- In **`NODE_ENV !== "production"`** zonder headers: dev-fallback `user` / `dev-user-1` (alleen lokaal).
- Zonder geldige owner in productie: **`403`** — `"Missing owner context"`.

**Roblox / bridge:** stuur **`x-owner-type`** en **`x-owner-id`** mee (zelfde idee als Kid Draughts → Studio). Tooling-env namen zoals `PLAYBACK_OWNER_TYPE` / `PLAYBACK_OWNER_ID` zijn convenience; de HTTP-naam is altijd de header hierboven.

**Cache-sleutel (aanbevolen):** `playback:{bookId}:{lessonId}:{stepId}:{lang}:{bookRevision}` — als `bookRevision` ontbreekt, gebruik een TTL-fallback of `unknown` voor het laatste segment.

---

## 3. Endpoints (twee varianten)

### 3.1 Stap via globale step-ref (aanbevolen als je alleen `stepId` hebt)

```http
GET /api/steps/:stepId/playback
```

**Query (optioneel maar sterk aanbevolen voor integriteit):**

| Parameter           | Type     | Default | Beschrijving |
|---------------------|----------|---------|--------------|
| `bookId`            | string   | —       | Moet matchen met de opgeloste stap-context; anders **400** `playback.context.book_mismatch`. |
| `lessonId`          | string   | —       | Idem; anders **400** `playback.context.lesson_mismatch`. |
| `lang`              | string   | `en`    | Taal voor `title`, `prompt`, timeline-comments, hint-tekst. |
| `requiredLanguage`  | string   | `en`    | Komma-gescheiden lijst; alle gekozen talen moeten in localized velden gevuld zijn voor export, anders **400** bij validatie (zie §6). |

### 3.2 Stap via expliciet boek + les (handig voor Roblox met vaste context)

```http
GET /api/steps/book/:bookId/lesson/:lessonId/step/:stepId
```

**Query:** zelfde als **`lang`** en **`requiredLanguage`** (zie `resolveRequestedLanguage` / `resolveRequiredLanguages` in `playback.ts`).

**Pad:** `bookId`, `lessonId`, `stepId` zijn verplicht; ontbrekend → **400** `playback.context.missing`.

---

## 4. Response-envelope (succes)

HTTP **200**, JSON:

```json
{
  "item": { /* PlaybackPayload — zie §5 */ },
  "meta": {
    "bookId": "<string>",
    "lessonId": "<string>",
    "stepId": "<string>",
    "language": "<string>"
  }
}
```

`item` is het object dat door `buildPlaybackPayload` wordt gebouwd en door Zod `PlaybackPayloadSchema` gaat.

---

## 5. PlaybackPayload — schema (`payloadVersion` 2)

`payloadType` is altijd **`"lesson-step-playback"`**. Huidige export gebruikt **`payloadVersion: 2`** (`playbackService.ts`).

### 5.1 Top-level velden (Zod: `PlaybackPayloadSchema`)

| Veld | Type | Opmerking |
|------|------|-----------|
| `payloadType` | `"lesson-step-playback"` | Contract-anker. |
| `payloadVersion` | `1` \| `2` | Server zet nu **2**. |
| `stepId` | string | |
| `lessonId` | string? | |
| `stepType` | string | Legacy step-type. |
| `title` | string | Gelokaliseerd voor `lang`. |
| `prompt` | string | Idem. |
| `initialFen` | string | Start FEN. |
| `sideToMove` | `"white"` \| `"black"` | |
| `variantId` | string? | Les-variant (bv. international); default-build `"international"`. |
| `lineMode` | `"mainline"` \| `"variation"` \| `"custom"` | Uit `sourceRef.lineMode` of `"custom"`. |
| `sourceId` | string? | Bron als gekoppeld. |
| `startNodeId` | string \| null? | |
| `endNodeId` | string \| null? | |
| `nodes` | array | Boom uit `sourceRef.nodeTimeline` (analyse-/bronlijn). |
| `autoplayMoves` | string[] | Uit `presentation.autoplay.moves`. |
| `events` | array | O.a. `pre_comment`, `post_comment`, `glyphs`, `overlay` (zie §5.3). |
| `validation` | object? | Runtime-validatieblok (zie §5.4). |
| `puzzleScan` | object? | Meta voor Scan-gedrag (zie §5.5). |
| `navigation` | object? | Als les-context bekend (zie §5.6). |
| `stepIndex` | number? | Duplicaat t.o.v. navigation voor gemak. |
| `totalSteps` | number? | |
| `previousStepId` | string \| null? | |
| `nextStepId` | string \| null? | |
| `hint` | object? | Optioneel: `text`, `expectedFrom`, `expectedTo` (`PlaybackHintSchema`). |
| `authoringStepId` | string? | Id van de authoring-stap (`authoringV2.stepsById[…].id`) wanneer een timeline wordt meegeleverd. |
| `authoringStepKind` | string? | bv. `explain`, `tryMove`, … |
| `authoringTimeline` | array? | Geordende **ministeps** (zie §5.7). Ontbreekt als er geen `timeline` op de authoring-stap zit. |

### 5.2 `nodes[]` (per node)

- `id` (string), `ply` (number), `notation?`, `fenAfter?`, `parentId?`, `childrenIds` (string[]).

### 5.3 `events[]` (discriminated union)

- `{ "type": "pre_comment", "ply": number, "text": string }`
- `{ "type": "post_comment", "ply": number, "text": string }`
- `{ "type": "glyphs", "ply": number, "glyphs": string[] }`
- `{ "type": "overlay", "ply": number, "highlights": unknown[], "arrows": unknown[], "routes": unknown[] }`

Er wordt o.a. één **`overlay`**-event op `ply: 0` gezet met `presentation` highlights/arrows/routes van de legacy step.

### 5.4 `validation` — runtime discriminated union

Exact één van:

**A) Lijn (exacte volgorde gestructureerde zetten)**

```json
{
  "runtimeKind": "line",
  "acceptMode": "exact",
  "acceptedLines": [
    {
      "moves": [
        {
          "notation": "32-28",
          "from": 32,
          "to": 28,
          "path": [32, 28],
          "captures": [],
          "resultFen": "<fen>"
        }
      ]
    }
  ],
  "moveSource": "notation_engine" | "timeline_engine" | "mixed"
}
```

**B) Geen harde zet-validatie**

```json
{
  "runtimeKind": "none",
  "acceptMode": "exact"
}
```

**C) Doel**

```json
{
  "runtimeKind": "goal",
  "acceptMode": "exact",
  "goalType": "<string>",
  "targetSquare": 23,
  "sideToTest": "white" | "black"
}
```

**D) Alleen authoring / fallback (onopgeloste lijn of complexe fallback)**

```json
{
  "runtimeKind": "authoring_only",
  "acceptMode": "exact",
  "authoring": { "<key>": "<unknown>", "_resolveError": "sequence_line_unresolved" }
}
```

Roblox: bij `authoring_only` niet blind valideren als volledige engine; gebruik Studio-repair of server-logica.

### 5.5 `puzzleScan` (optioneel)

Object volgens `PuzzleScanPlaybackMetaSchema`: o.a. `scanFallbackEnabled`, `strictAuthoredOnly`, `puzzleSide`, `baseline` (eval/band), `policy` (drempels, `scanDepth`, `multiPv`), `debug` (string[]).

### 5.6 `navigation` (optioneel maar meestal aanwezig bij succes-route)

```json
{
  "bookId": "<string>",
  "lessonId": "<string>",
  "stepId": "<string>",
  "stepIndex": 0,
  "totalSteps": 12,
  "previousStepId": "<string> | null",
  "nextStepId": "<string> | null"
}
```

Volgorde komt uit **`authoringV2.authoringLesson.stepIds`** als die bestaat; anders uit **`lesson.steps`** in boekvolgorde (`playback.ts`).

### 5.7 `authoringTimeline` — ministeps (Studio → Roblox “script”)

Wanneer de stap in Mongo een **`authoringV2.stepsById[stepId].timeline`** heeft, vult de server **`authoringTimeline`**: een array in **dezelfde volgorde** als in de editor. Elk element is één **moment** (ministep), minimaal met:

- `id` (string), `type` (string) — overeenkomstig Studio `StepMomentType` (bv. `introText`, `showMove`, `askSequence`, …).

**LocalizedText** in de boom (o.a. `title`, `body`, `caption`, teksten in `interaction`, coach, labels, …) wordt omgezet naar:

```json
{ "display": "<string voor request-lang>", "values": { "en": "…", "nl": "…" } }
```

- **`display`:** al opgelost met de playback-query **`lang`** (fallback `en`, daarna eerste niet-lege waarde).
- **`values`:** meegegeven wanneer de bron een klassiek `{ values: { … } }`-object was — handig om in Roblox **van taal te wisselen zonder** opnieuw Studio te bellen.

Overige sleutels (`interaction`, `overlays`, `moveRef`, `lineRef`, `positionRef`, `timing`, `coach`, `camera`, `fx`, `ui`, `constraints`, `branchAction`, `glyphMarkers`, …) worden **recursief** meegenomen zoals in authoring (dus JSON-compatibel). Roblox mag unknown keys negeren tot jullie ze ondersteunen.

**Afspeel-logica (aanbevolen):**

1. Start bij `authoringTimeline[0]` (of toon eerst alleen `item.title` / leeg bord als er geen timeline is).
2. Voor elk moment: switch op **`type`**; lees copy uit `body` / `title` / `interaction` (nu `{ display, values }` waar van toepassing).
3. Zet het bord: gebruik waar nodig **`item.initialFen`** + moment-specifieke `positionRef` / `moveRef` / `lineRef` (Roblox-implementatie bepaalt hoe strikt dat wordt gevolgd).
4. **Interactie / correctheid:** blijf **`item.validation`** gebruiken als canoniek voor “mag deze zet” waar de server die al heeft opgelost (inclusief askSequence-fallback). Waar `validation.runtimeKind === "authoring_only"` staat, gebruik vooral **interaction** in het actieve moment of vraag Studio om reparatie — niet blind gokken.
5. **Overlays / FX:** combineer `item.events` (legacy-lijn + globale overlay) met per-moment `overlays` / `fx` / `ui` in de timeline.
6. **Volgende stap in de les:** na afronden van de stap-flow gebruik `item.navigation.nextStepId` om de volgende playback-call te doen.

**Ontbreekt `authoringTimeline`?** Dan is dit een puur legacy stap-document (of authoring zonder `timeline`-veld). Roblox valt dan terug op `title` / `prompt` / `nodes` / `events` / `validation` alleen.

---

## 6. Export-gates (waarom 400)

Voor export wordt `validateStepForRuntimeExport` aangeroepen. **Tenzij** de les een **`askSequence`-moment met niet-lege `expectedSequence`** heeft (`hasAuthoringAskSequence`), faalt ontbrekende content / taal als:

- **400** `ValidationError`: `"Step is not ready for runtime playback export"`  
- Body bevat `issues` (pad/code/message) — zelfde idee als Studio-validatie.

**Praktisch:** vul localized velden voor `requiredLanguage`, of gebruik `lang=en` en `requiredLanguage=en` voor snelle tests.

---

## 7. Andere HTTP-fouten

| Status | Voorbeeld |
|--------|-----------|
| 400 | Validatie (context mismatch, ontbrekende params, payload build faalt). |
| 403 | Geen owner context. |
| 404 | Step/lesson niet gevonden. |
| 409 | Conflict (zelden op deze routes). |
| 500 | Serverfout. |

---

## 8. Mongo vs HTTP — rolverdeling

| Laag | Rol |
|------|-----|
| **Mongo** | Slaat `books` (lessons, `steps`, `authoringV2`) op. |
| **Studio-server** | Leest Mongo, bouwt **`item`** (playback), valideert taal + export. |
| **Roblox** | Roept **HTTP** aan; cache op `(bookId, lessonId, stepId, lang)` + **book `revision`** (haal uit `GET /api/books` of eigen meta-endpoint). |

---

## 9. Minimale Roblox-taken (checklist)

1. Owner-auth correct meesturen (§2).  
2. Kies endpoint §3.1 of §3.2; gebruik `lang` consistent met UI.  
3. Parse **`item.initialFen`**, **`item.sideToMove`**, **`item.variantId`**.  
4. Valideer spelerinput tegen **`item.validation`** (§5.4).  
5. **Lesflow:** als **`item.authoringTimeline`** bestaat, loop die in volgorde als hoofd-UI/script (§5.7); anders UI uit **`item.title` / `prompt`** en bronlijn uit **`nodes`/`events`**.  
6. Overlays: **`events`** (`type === "overlay"`) + per-moment `overlays` in de timeline.  
7. Navigatie: **`item.navigation`** of top-level `previousStepId` / `nextStepId`.  
8. Optioneel: **`item.puzzleScan`** voor Scan-policy in client.  
9. Bij **400 export**: toon `issues` of log naar Studio; niet raden in client.

---

## 10. Voorbeeld (ingekort) — succesresponse

```json
{
  "item": {
    "payloadType": "lesson-step-playback",
    "payloadVersion": 2,
    "stepId": "…",
    "lessonId": "…",
    "stepType": "sequence",
    "title": "…",
    "prompt": "…",
    "initialFen": "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20:W",
    "sideToMove": "white",
    "variantId": "international",
    "lineMode": "custom",
    "nodes": [],
    "autoplayMoves": [],
    "events": [
      {
        "type": "overlay",
        "ply": 0,
        "highlights": [],
        "arrows": [],
        "routes": []
      }
    ],
    "validation": {
      "runtimeKind": "line",
      "acceptMode": "exact",
      "acceptedLines": [{ "moves": [] }],
      "moveSource": "notation_engine"
    },
    "navigation": {
      "bookId": "…",
      "lessonId": "…",
      "stepId": "…",
      "stepIndex": 0,
      "totalSteps": 1,
      "previousStepId": null,
      "nextStepId": null
    },
    "stepIndex": 0,
    "totalSteps": 1,
    "previousStepId": null,
    "nextStepId": null
  },
  "meta": {
    "bookId": "…",
    "lessonId": "…",
    "stepId": "…",
    "language": "en"
  }
}
```

*(Waarden zijn illustratief; `validation.acceptedLines` wordt server-side gevuld.)*

---

## Gerelateerde Kid Draughts API — les-voortgang (Draughts-api)

**Doel:** dunne **state** per speler/les (waar iemand is, wat af is), **los** van de **rijke playback-payload** van de Studio.

| Methode | Route | Korte inhoud |
|--------|--------|----------------|
| `GET` | `/api/players/:userId/lesson-progress?bookId=&lessonId=` | Voortgang lezen. `:userId` = jullie **playerId** (zelfde idee als puzzle-stats). |
| `PATCH` / `PUT` | `/api/players/:userId/lesson-progress` | Voortgang schrijven. |

- **Auth (Kid Draughts):** `x-api-key` (`requireApiKey`) op GET en PUT/PATCH. Dit is **niet** hetzelfde mechanisme als Studio-playback (`x-owner-type` / `x-owner-id`); in Roblox heb je dus typisch **twee** HTTP-clients of twee header-sets: één naar Draughts-api (API-key), één naar Studio (owner-headers + eventueel andere base URL).
- **Mongo:** collectie `player_lesson_progress`, unieke index `{ playerId, bookId, lessonId }` (eenmalig indexes-script op de DB).
- **Regels (service):**
  - **`furthestStepIndex`:** `max(bestand, stepIndex)`.
  - **`furthestStepId`:** alleen bijstellen als `stepIndex >=` vorige furthest — **terugspelen** wijzigt de opgeslagen “furthest”-stap-id niet.
  - **`completedStepIds`:** idempotent (Set-gedrag); `stepId` veilig opnieuw toevoegen.
  - **`totalStepsKnown`:** optioneel; `max` met bestaande waarde indien meegegeven.
  - **`bookRevision`:** client-revision **lager** dan opgeslagen → **409** `BOOK_REVISION_MISMATCH` (`expectedRevision` / `actualRevision`); anders bij update `max(client, server)`.
- **Response:** o.a. `lastPlayedAt` als **Unix seconden**; `schemaVersion` (bijv. `1.x`).

### Hoe dit samen met playback loopt (Roblox)

1. **GET** lesson-progress → bepaal resume-punt (`furthestStepId` / eerste open stap / UI-keuze).
2. **GET** Studio **`/api/steps/.../playback`** voor die `stepId` → bord + `item.validation` + overlays (`item.events`) + optioneel **`item.authoringTimeline`** (ministeps).
3. Na succesvolle stap: **PATCH** lesson-progress (`stepIndex`, `completedStepIds`, `bookRevision`, … volgens Draughts-api contract).
4. Bij **409** `BOOK_REVISION_MISMATCH` → content opnieuw syncen (boek/les), daarna playback opnieuw ophalen.

**Playback blijft “rijk”; lesson-progress blijft “licht”.** Gebruik progress niet als bron voor FEN of zetten — dat zit in `item`.

---

## Bericht voor de agent die Roblox bouwt (copy-paste)

Gebruik **twee HTTP-contexten**: (A) **Draughts-api** met `x-api-key` voor lesson-progress (en puzzels volgens jullie `CONTRACT_PUZZLES_V1`); (B) **Studio** voor lesson-step playback met `x-owner-type` / `x-owner-id` en query **`lang`** + herhaalde **`requiredLanguage`** — zelfde taalset als `PLAYBACK_EXPORT_REQUIRED_LANGUAGES` in de Editor (`en` + `nl` tenzij afgestemd).

**Flow:** eerst lesson-progress **GET** om te weten waar de speler staat → dan Studio **playback GET** voor de actieve `stepId` → na stap-gelukt **PATCH** progress; bij **409** revision mismatch eerst content/revisie alignen, daarna opnieuw playback.

**Belangrijk — rijke lessen:** het Studio-`item` kan een **`authoringTimeline`** bevatten: een **geordende array van ministeps** (zelfde idee als de timeline in de editor). Implementeer de speler-ervaring primair als **state machine** over `authoringTimeline[i].type` (bv. `introText` → toon `body.display`; `askMove` / `askSequence` → combineer moment-`interaction` met **`item.validation`** voor correct/incorrect). Localized velden in de timeline zijn meestal `{ display, values }`: `display` hoort bij `lang`; bewaar `values` als je runtime taal wilt wisselen zonder nieuwe HTTP-call. Ontbreekt `authoringTimeline`, val terug op legacy: `title`, `prompt`, `nodes`, `events`, `validation` alleen.

**Cache:** playback-key blijft `playback:{bookId}:{lessonId}:{stepId}:{lang}:{bookRevision}`; lesson-progress responses hebben eigen TTL — revision uit progress moet consistent zijn met het boek dat je voor playback gebruikt.

---

## Boek-entitlement + exam unlock (editor/database velden)

Deze velden zijn nu bedoeld als bron voor Roblox “toon alle boeken, kies alleen eligible”:

### Op `Book`

- `accessModel`: `"free"` | `"paid"`
- `productId`: string (shop SKU / product-id; verwacht gevuld bij `paid`)
- `shopTag`: optioneel label voor storefront/UI
- `sequenceIndex`: numerieke campagnevolgorde (1,2,3…)
- `unlockRules`:
  - `type`: `"none"` | `"requires_exams"`
  - `requiredBookId`: bookId van prerequisite boek
  - `requiredExamLessonIds`: optioneel expliciete lijst examenlessen (leeg => runtime kan alle `isExam` lessen van requiredBook gebruiken)
  - `requiredPassMode`: `"all"` | `"any"`

### Op `Lesson`

- `isExam`: boolean (les telt als examen in unlock-flow)
- `examConfig`: optionele exam-instellingen (pass score/attempts/timer)

### Roblox UI-beleid bij openen lessen

1. Toon **alle** boeken in lijst/tiles.
2. Bereken per boek `eligible`:
   - Entitlement: `accessModel=free` => ok, `paid` => check shop purchase op `productId`.
   - Unlock: `unlockRules.type=requires_exams` => check exam-pass results op `requiredBookId`.
3. Alleen `eligible=true` boeken zijn klikbaar/startbaar; locked boeken tonen duidelijke reden:
   - `LOCKED_PURCHASE_REQUIRED`
   - `LOCKED_PREREQ_EXAMS`
4. Voor locked paid boeken: toon “Koop in shop” CTA met `productId`.

### Aanbevolen Roblox response-shape (aggregator/gateway)

Per boek in listing:

```json
{
  "bookId": "book-2",
  "title": "Combinations II",
  "accessModel": "paid",
  "productId": "shop_book_2",
  "sequenceIndex": 2,
  "eligible": false,
  "lockReasons": ["LOCKED_PREREQ_EXAMS", "LOCKED_PURCHASE_REQUIRED"],
  "unlockProgress": {
    "requiredBookId": "book-1",
    "requiredExamCount": 3,
    "passedExamCount": 2,
    "requiredPassMode": "all"
  }
}
```

Zo kan Roblox direct: alle boeken tonen, alleen eligible selecteerbaar maken, en juiste shop/unlock messaging tonen zonder extra client-logica.

---

*Laatste afstemming op codebase: `PlaybackPayloadSchema` + `buildPlaybackPayload` + `buildAuthoringTimelineForPlayback` + `playbackRouter`; lesson-progress beschrijving op basis van Draughts-api bridge (o.a. commit e153621).*
