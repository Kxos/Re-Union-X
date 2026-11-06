# Events, Part 1: spike, framework and the April 2019 pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Events tab lists and plays the original event quests of the player's story week beside the raids, with an Event Catalog and one kept event, proven on the 16 quest events of April 2019.

**Architecture:** Same shape as the raids, reusing their pieces: a generator `server/make-events.js` (census row -> evStage + stage rows + `game_data/events.json`, wired after `make-raid` in `make-game-tables.js`), a pure calendar `server/event-calendar.js` (which rows run in the Shop week, from `storyCtx` shopFrom / shopTo), routes `server/routes-events.js` (events of `/stage/event` category 2 after the raids, clear rewards, catalog keep / unkeep) and pages `server/event-pages.js` (Event Catalog, details, original notice). Maps come from the Special pipeline (`gen_story_maps.py`), banners from the notice image keys. Event coins, event boards, High Score and Boosters are later parts: in this part a coin reward (type 15) is not paid, and it is declared.

**Tech Stack:** Node server (`server/`), Python tools (`recon/tools/`), LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md`

## Global Constraints

- Worldwide content only. Japan-only events are not served.
- Calendar of record: `D:\Progetto_Restauro_KH_UX\private\events\sources\event_census\event_census.json`. Order of trust: official notice > khuxwiki > donated master (after cross-check) > JP twin > reconstruction. Every reconstructed value carries a label in the data, and every label is declared in the Notices.
- Rotation as for raids: story date -> original period, one original week per real Monday (`storyCtx`). Short windows (donor evStage category 3) open for their whole original day. One kept event at a time.
- Rewards: objectives and first-clear rewards once per quest; drops on every clear; nothing taken twice through the catalogue.
- Ids live in saves and in the client master: `server/event_ids.json` is append-only, as `raid_ids.json` (a key that disappears keeps its number; a repeated number stops the run).
- `evStage.stageId` holds at most 5 ids (`EVSTAGE_MAX_STAGES` of `make-raid.js`, docs/notes/raid.md «evStage rows and the client's master»); a bad evStage table is silently dropped by the client, so after every master change the server log must show the valid-table count and no `evStage` line.
- No SE files, notice texts, banner images, donor data or decompiled code in the public repo: generated data under `server/game_data/` (git-ignored), private work under `D:\Progetto_Restauro_KH_UX\tmp\events_p1\`. Donated material is untrusted: Python with `-I`, never executed.
- Bench: master revision only goes up (4 session scripts + `tools/play/packaging/make-play-package.ps1`, BOM kept); `relogin.ps1` with a copy of `maxpower`; press SKIP on dialogues; battles go to the user. Graphics (banners) shown to the user before serving.
- Commit + push each verified step, English messages, explicit paths, `git -c safe.directory=*`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An event quest that is also a raid quest or a Special quest.** Raid event quests (Eggcognito) are already served by `make-raid`; a census row whose stages are raid stages must not be built twice. Pinned in Task 3 (`no_raid_or_special_rows`).
- **A week with raids and events together.** The raid list must keep its order and its kept raid; events come after it, and the Raid Catalog banner stays first. Pinned in Task 4 (`events_after_raids`).
- **A save from before this part.** No `player.events` field: the tab works and nothing is reported as cleared. Pinned in Task 4 (`old_save`).
- **A kept event whose census row is no longer built** (data changed, row filtered out): the kept id is cleared at load, never served as an empty banner. Pinned in Task 5 (`kept_unknown_cleared`).
- **A quest row with an unknown enemy.** A donor enemy id missing from our master would crash the battle. The generator replaces it with the nearest story enemy and labels it, or skips the quest with a reason. Pinned in Task 3 (`enemies_exist`).

---

### Task 1: Map what the client needs for non-raid event quests

Read-only, from the raid notes, the WW 4.3.1 master types and the private client notes. Private findings stay in `tmp\events_p1\client\`.

**Files:**
- Create: `docs/notes/events.md` (public: fields and behaviour, no addresses or decompiled code)
- Modify: `docs/ISSUES.md` (new row, next free id, IN PROGRESS, «Events»)

**Interfaces:**
- Produces: for Tasks 3-5, the answers below, with field names.

- [ ] **Step 1:** List the `evStage` and `stage` fields an event quest uses beyond the raid ones (`recon/out/master_types_ww431.json`): `eventType` values the client accepts in category 2, quest restrictions (continue, turn limit, keyblade held, deck cost, attribute), `validMinute` / time windows, `boardEndTime`, objectives, first-clear rewards.
- [ ] **Step 2:** Read the 16 pilot rows in the donated master (`evStage` by notice id, their `stage` rows) and note which of those fields they set; mark any value our master does not have (enemy ids, drop ids, map bins).
- [ ] **Step 3:** Check the id ranges free in our master for the event `evStage` and `stage` rows, leaving room for about 6,500 stages. Proposed: `evStage` 20000 + r, `stage` 4000000 + n. Confirm `stageId` is a 32-bit int in the types.
- [ ] **Step 4:** Write `docs/notes/events.md` (fields, ranges, open points), add the ISSUES row, commit.

### Task 2: The April 2019 pilot data

Private data work, with a report for the user.

**Files:**
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events_p1\pilot\pilot_2019_04.json` (private)
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events_p1\pilot\CROSSCHECK.md` (private)

**Interfaces:**
- Consumes: Task 1 field list.
- Produces: one record per pilot census row: `{censusId, name, start, end, type, notices, quests: [{name, worldId, room, level, ap, targets, objectives, firstClear, drops, enemies: [{id, level, label}], restrictions, label}]}`. Task 3 reads this shape. The same shape will later come from the full census, so name it the **event quest record**.

- [ ] **Step 1:** Select the census rows of types EQ, CELEB, KEY, QUIZ, STORY, COLLAB starting in 2019-04. Expected: 13 rows. The 2 COIN rows and the HSC row wait for Parts 3 and 8.
- [ ] **Step 2:** For each row, build the quests from the donated master and cross-check each quest against khuxwiki (count, level, AP, targets, objectives, rewards). On a conflict, follow the order of trust and write it in `CROSSCHECK.md`.
- [ ] **Step 3:** For each enemy, look it up in our master. Missing: nearest story enemy of the same family and level, labelled `enemy-substitute`.
- [ ] **Step 4:** Show the user the report: rows, quests, conflicts, substitutes.

### Task 3: Generator `server/make-events.js`

**Files:**
- Create: `server/make-events.js`, `server/event_config.json` (ours: `onlyCensusIds` filter for the pilot, reconstructed-label texts `reconstructedWhy`, id bases), `server/event_ids.json`
- Create: `server/test-make-events.js`
- Modify: `server/make-game-tables.js` (wire `require('./make-events').patch(OUT)` after `make-raid`, off with `KHUX_EVENTS=0`)

**Interfaces:**
- Consumes: the event quest records of Task 2 (path from `KHUX_EVENT_SRC`; missing -> warn and write nothing, as `make-raid`); `EVSTAGE_MAX_STAGES` and the story-row copy helper of `make-raid.js` (export them if they are not exported).
- Produces: `buildEvents(records, config, master) -> {evStage: [], stage: [], index: {entries, reasons, own}}`, `patch(masterDir)`. `game_data/events.json` entries: `{censusId, evStageId, name, type, start, end, days?, stageIds, useAp, label, labels[], noticeIds, banner}`; `game_data/event_maps.json` for `gen_story_maps.py`.

- [ ] **Step 1: Write the failing tests** in `test-make-events.js`, on a two-row fixture:
  - `ids_stable`: building twice gives the same ids; a new row takes the next number; a removed row keeps its number.
  - `evstage_row_fits_schema`: at most 5 ids in `stageId`, range in `stageStartId` / `stageEndId`, `eventCategory` 2, `eventType` 2.
  - `no_raid_or_special_rows`: a record whose stage is a raid or Special stage is skipped with a reason.
  - `enemies_exist`: every enemy id of every built stage exists in the fixture master.
  - `labels_declared`: every label in use has a `reconstructedWhy` text.
  - `short_window_whole_day`: a category 3 record gets `days` covering its whole original day.
- [ ] **Step 2:** Run `node server/test-make-events.js`. Expected: fail, module missing.
- [ ] **Step 3:** Implement `make-events.js`, mirroring `make-raid.js` (own rows dropped first, anything else in the ranges stops the run).
- [ ] **Step 4:** Run the tests. Expected: all pass. Then run the master regen of HANDOFF with `KHUX_EVENT_SRC` set and check the log line of built entries (13 expected).
- [ ] **Step 5:** Commit (code, config, ids, test; no game_data).

### Task 4: Calendar and routes

**Files:**
- Create: `server/event-calendar.js`, `server/routes-events.js`
- Create: `server/test-event-calendar.js`, `server/test-event-routes.js`
- Modify: `server/server.js` (`/stage/event` category 2: `[...raid().events(), ...events().events(), ...rest]`; clear hook for event stages)

**Interfaces:**
- Consumes: `storyCtx()` shopFrom / shopTo of `server.js`; `game_data/events.json`; the overlap rule of `raid-calendar.js` (move the shared helpers into a small module if both need them, no copy).
- Produces: `currentEntries(index, {shopFrom, shopTo}, nowMs)`; `routesEvents(ctx) -> {events(realMs), onStageClear(stageId, player), keep(evStageId), unkeep(), catalogCtx()}`. Save: `player.events = {kept: censusId|null, cleared: {stageId: [missionIds]}}`.

- [ ] **Step 1: Write the failing tests:**
  - calendar: `week_overlap` (an event of 3 weeks is listed in each of them), `none_outside` (no event outside its dates), `whole_day` (a short-window event is open all its day, closed the day after).
  - routes: `events_after_raids` (Raid Catalog first, kept raid, raids, then events), `objectives_once` (second clear gives no objective reward), `coins_not_paid` (a type 15 reward is not paid, no Raid Coins), `old_save` (no `player.events`: list served, nothing cleared).
- [ ] **Step 2:** Run them. Expected: fail.
- [ ] **Step 3:** Implement. Banner URL `/web/event/img/v<N>/<evStageId>.png` with an `EVENT_IMG_VERSION`, as raids.
- [ ] **Step 4:** Run the new tests and the raid and Special suites (`test-raid-routes.js`, `test-raid-calendar.js`, `test-special-server.js`). Expected: all pass.
- [ ] **Step 5:** Commit.

### Task 5: Event Catalog, details, original notice, kept event

**Files:**
- Create: `server/event-pages.js`, `server/test-event-pages.js`
- Modify: `server/server.js` (routes `/web/event/catalog`, `/web/event/event/<evStageId>`, `/web/event/notice/<evStageId>`, `POST /web/event/keep/<evStageId>`, `/web/event/unkeep`, `/web/event/img/...`), `server/make-events.js` (catalog banner evStage `EVENT_CATALOG_EV` with the Training Grounds quest, as the Raid Catalog)

**Interfaces:**
- Consumes: `routesEvents` keep / unkeep / catalogCtx; the page code of `raid-pages.js` (`SRV_CSS`, Original notice card, category bands): shared parts moved into a common module, not copied.
- Produces: the pages; the catalog banner second in category 2, after the Raid Catalog banner.

- [ ] **Step 1: Write the failing tests:** `catalog_by_period` (rows grouped by month, states now / can / kept / later as `raid-calendar.js rowState`), `keep_past_only` (a current or future event cannot be kept), `kept_unknown_cleared`, `notice_page_private` (the notice text is read at request time from git-ignored data, never from the repo), `on_this_server_box` (reconstructed labels shown in the merged «On this server» box, Rebuilt values closed).
- [ ] **Step 2:** Run them. Expected: fail.
- [ ] **Step 3:** Implement in the style of the Raid Catalog pages approved on 06-11.
- [ ] **Step 4:** Run the tests and `test-raid-pages.js`. Expected: all pass.
- [ ] **Step 5:** Commit.

### Task 6: Banners and maps of the pilot

**Files:**
- Create: `recon/tools/make_event_banners.py` (from the notice image keys; same 640x140 processing as `make_raid_banners.py`), output to `server/game_data/event_img/` (git-ignored)
- Modify: `recon/tools/gen_story_maps.py` config (key `events`, reading `event_maps.json`)

- [ ] **Step 1:** Download the pilot banners to `D:\Progetto_Restauro_KH_UX\reference\event_banners_ww\` (private), make the cards, and the catalog card with `make_special_banners.py --section event`.
- [ ] **Step 2:** **Show the user** the 13 cards, the catalog card and the KEPT card. Wait for approval.
- [ ] **Step 3:** Generate the pilot maps; any map bin missing in JP 4.3.1 is reported, not invented.
- [ ] **Step 4:** Commit the tools.

### Task 7: Bench

**Files:**
- Modify: `docs/notes/events.md` (results with screenshot names)

- [ ] **Step 1:** Quick build (`build-resources.ps1 -Quick`, `update-resources.ps1`, the two taps), master regen, revision +1; check the log: valid-table count, no `evStage` line.
- [ ] **Step 2:** Copy `maxpower` to `events1` and set its story date into April 2019 (the Shop week of 2019-04-08). `relogin.ps1 -Save events1`.
- [ ] **Step 3:** Check, with a screenshot each in `D:\Progetto_Restauro_KH_UX\screenshots\`: Events tab with Raid Catalog, Event Catalog, the week's raid and the week's events; Details of an event (original notice); a quest list; the Event Catalog page; keep a past event and see it as KEPT.
- [ ] **Step 4:** **User:** play one quest of a challenge event and one of the keyblade event; check objectives, first-clear rewards and that no Raid Coins are paid.
- [ ] **Step 5:** Record the results and commit.

### Task 8: Notices, docs, next part

**Files:**
- Modify: `server/routes-info-album.js` (IMPORTANT notice «Events»), `server/test-notices.js`, `docs/ISSUES.md`, `HANDOFF.md`, `README.md`, `README.it.md`
- Create: `docs/superpowers/plans/2026-MM-DD-events-part2-gem.md`

- [ ] **Step 1:** Write the notice: story-week rotation, Event Catalog and kept event, short windows open all day, coins not yet paid (Part 3), every label in use. Test the text in `test-notices.js`, run `node server/export-notices.js`.
- [ ] **Step 2:** Keep the pilot filter `onlyCensusIds` in `event_config.json` until Part 2 widens the data; note it in HANDOFF.
- [ ] **Step 3:** Update ISSUES, HANDOFF, README rows; commit and push.
- [ ] **Step 4:** Write Part 2 (Gem quests, widening the generator to the full census for that type) with `superpowers:writing-plans`.
