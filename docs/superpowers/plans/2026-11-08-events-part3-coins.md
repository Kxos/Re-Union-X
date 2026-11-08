# Events, Part 3: event coins and event boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coin events of 2018-10..2020-02 (Event Coins Galore! and its challenges) are served with their Event Boards. Event quests pay Event Coins (reward type 15) into the balance of their board set. The Event Boards button opens the boards (sphere type 4) of the set in play, and each cell is paid once.

**Architecture:**
- A private builder maps the donor type-4 boards to board sets, and each set to the census rows that feed it. It also writes the coin quest records in the `gem.json` record shape.
- `raid-boards.js` gets the type, the id range and the families as parameters. `event-boards.js` builds the type-4 rows from it.
- `make-events.js` writes the board rows and gives each entry its `boardSet`. Entries with a board set are served as eventType 1, so the Event Boards button shows.
- The server keeps one coin balance per set (`player.eventCoins`) and one focus set at a time. `stageSpherePoint` and the type-4 list both follow the focus set, so the balance on screen always belongs to the boards on screen.

**Tech Stack:** Node server (`server/`), private Python builders (`python -I`), LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md` (part 3 of «The work, in parts»; «Event coins»; «Rewards»). Earlier plans: `2026-11-06-events-part1-framework.md`, `2026-11-07-events-part2-gem.md`. Field notes: `docs/notes/events.md`, `docs/notes/bacheche.md`, `stage_gen/boards/SERVER.md`.

## Global Constraints

- Everything in the Part 2 Global Constraints still applies: worldwide only, the order of trust, labels with `reconstructedWhy`, enemies never substituted, append-only ids, no SE data in the repo, the bench rules, the master regen command, and commit plus push for each step.
- **Event coins (author, 06-11):** «one balance per event board set, never expiring, so a kept event can always be completed; declared».
- **Rewards:**
  - objectives and first-clear rewards are paid once per quest;
  - drops and event coins are paid on every clear, the catalogue included;
  - each board cell is paid once, even after its set closes and opens again.
- **Raid Coins do not change.** Raid rows that pay type 15 today are written as type 16 by `make-raid.js`, so every raid pays exactly what it pays now.
- **Ids:** board ids come from `server/event_ids.json` key `boards` (`"<setKey>/<donorBoardId>": n`, append-only), in the range 4000000..4999999. They never collide with type 1 (2100xxx) or raids (3000000..3999999).
- **Cells we cannot pay** (medals missing from our master, Boosters before Part 6) follow the raid-boards precedent: the cell is reported as `unmatched` and left off the board. A board with an unmatched completion reward is not served.
- **Out of scope:** the Gem Boards EV-0223/0280/0396 (type 2, bought with 2,000 Jewels: Part 7, `/user/sphere/buy`); EV-1065 (avatar parts: Part 7); the 2016 coin and board events EV-0002/0053/0066/0075/0087/0090, and EV-0242 Magic Gems Challenge 2017 with its Gem Boards (type 4), whose 10 quests exist only on khuxwiki (data hole: Part 10). In the catalogue, each keeps its reason with the later part.

## Builder's calls (to confirm at review)

1. **Focus set.** The client shows one `stageSpherePoint` and does not say which board is open. So the server hands out **one set at a time**, and that set is the focus:
   - it is the set of the last event quest started (`/stage/start` with an event id);
   - otherwise, the newest set of the current story week.
   When the focus changes, the boards of the old set close (`closeEventSphereBoardIds`). Their progress and coins are kept.
2. **Board sets by name.** Board sets are mapped from the donor board names, khuxwiki «Event Coins Galore!» and the «X (Event Board)» pages, and the notices. Every mapping cites its source in `board_sets.json`. Unmapped boards (31 «Jewels & Things», 3 «Jewels & Mirrors», «Radiant Rewards Board») are listed in the report and not served.
3. **Window.** A set is available while one of the events that feed it is in the current story week, or is the kept event.
4. **Raid-event type-4 boards** (Zootopia, Weekend Warrior, Seasoned Wielder Bonus) stay what they are today: raid boards paid in Raid Coins.

## Review Focus

- **Two sets wanted at once.** For example, the kept event belongs to April 2019 while the current week is in October 2019.
  - Expected: only the focus set is listed, and `stageSpherePoint` equals its balance.
  - Starting a quest of the other event moves the focus. The old boards close, and their progress and coins are kept.
  - Pinned in Task 5 (`focus_switch_keeps_progress`).
- **A set closes and opens again.**
  - Expected: unlocked cells stay unlocked, and completion is not paid again.
  - Pinned in Task 5 (`reopen_no_repay`).
- **Not enough coins for a cell.**
  - Expected: the update is refused and nothing changes, neither the balance nor the cells.
  - Pinned in Task 5 (`update_insufficient_coins`).
- **Board 2 chained to Board 1** (`openId 5`).
  - Expected: Board 2 cannot be updated before Board 1 is complete, whatever the client sends.
  - Pinned in Task 5 (`chained_board_locked`).
- **Old saves.** A save without `eventCoins`, `eventSphere` or `eventCoinFocus` loads with empty defaults, and a save with no event history shows `stageSpherePoint` 0.
  - Pinned in Task 5 (`old_save_defaults`).

---

### Task 1: Bench spike: Event Boards button and a type-4 board

The client side has never been benched: which `boardTypes` the button sends, whether the type-4 list filters by date, `openId` or `boardEndTime`, how `openId 5` behaves, and the empty-list text. This task is a gate: Tasks 4-5 follow what it records.

**Files:**
- Create: `server/test-fixtures/event_board_spike.json` (one set: two chained boards built by hand from donor 2310115/2310116, with Jewel cells only)
- Modify: `server/event_config.json` (`spike: {censusId, boardFixture}`, off by default)
- Modify: `docs/notes/events.md` (new section «Event Boards spike (Part 3, Task 1)»)

- [ ] **Step 1:** Serve one pilot event (EV-0759) with eventType 1, and the fixture boards as type 4 through a temporary branch in `respondSphereCheck`, behind `config.spike`.
- [ ] **Step 2:** Bench with relogin, a new revision and save `events1`. Tap Event Boards and log the `/user/sphere/check*` body. Record what the list shows for each `boardEndTime` / `openId` / `openParam` value, the coin icon and field, the empty-list text, and the update request.
- [ ] **Step 3:** Write the findings in `docs/notes/events.md`, with the frames in `reference\event_boards\`. If the button does not open the list, stop and report to the user before Task 4.
- [ ] **Step 4:** Turn `spike` off, then commit and push.

### Task 2: Board sets and coin quest records (private)

**Files:**
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\coins\build_board_sets.py` (`python -I`)
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\boards\board_sets.json`
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\records\coin.json` (in the `gem.json` record shape)
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\coins\REPORT.md`

**Interfaces:**
- Produces: `board_sets.json`: `{sets: [{setKey: "2019-04", censusIds: ["EV-0759","EV-0774", ...], sources: [...], boards: [{donorId, name, openId, openParam, kindId, cells: [{idx, cost, rewardSelect, rewardId, num}], completion}]}], unmapped: [{donorId, name, why}]}`.
- Produces: coin records with `boardSet: "<setKey>"`, and objectives / drops of type 15 kept as they are.

- [ ] **Step 1:** Map the donor type-4 boards (163 rows) to sets, citing a source for each, following the fact-sheet table: Galore #1 EV-0603 (with EV-0579 and EV-0582/0588/0589), 2019-02 EV-0703, 2019-04 EV-0759/0774 (with the 8 pilot events that pay type 15), 2019-06 EV-0828, subslot halves EV-0885/0894/0909/0925 (and 0965/1007), 2019-10 EV-0936, 2019-11 EV-0955, 2019-12 EV-0973, 2020-01 EV-0994. Cross-check each board's cell count, costs and rewards against its khuxwiki «X (Event Board)» page, and log every difference in REPORT.md.
- [ ] **Step 2:** Build the coin quest records of EV-0582..EV-1007 from the donor evStage and stage rows, cross-checked against khuxwiki, with the Part 2 builder. Every enemy that is missing goes to REPORT.md, and its quest is not served (Global Constraints).
- [ ] **Step 3:** Run the builder twice and check that the output is byte-identical. REPORT.md lists the served sets, the unmapped boards and the unmatched cells with their counts.

### Task 3: Board generator for type 4

**Files:**
- Modify: `server/raid-boards.js` (`TYPE`, `BOARD_BASE`, `BOARD_MAX` and the families become parameters, with the raid values as defaults)
- Create: `server/event-boards.js`
- Test: `server/test-event-boards.js`; `server/test-raid-boards.js` stays green unchanged

**Interfaces:**
- Produces: `buildBoards({doc, correctionsMd, master, ids, config, censusIds, families, type = 5, idBase = 3000000, idMax = 3999999})`, with the same return value as today.
- Produces: `buildEventBoards({sets, master, ids}) -> {sphereRows, arrayRows, masuRows, art, bySet: {[setKey]: boardIds[]}, chains: {[boardId]: prevBoardId}, report: {unmatched, skipped}}`.

- [ ] **Step 1: Write the failing tests** in `test-event-boards.js`:
  - `type4_rows`: the rows have `type 4`, ids in 4000000..4999999, and the cell count and costs of the fixture;
  - `chain_remapped`: `openId 5` keeps its value and `openParam` holds our id of Board 1;
  - `unmatched_cell_dropped`: a medal id missing from the master is in `report.unmatched` and left off the board;
  - `unmatched_completion_skips_board`: such a board is in `report.skipped`;
  - `ids_append_only`: a second run with a new board keeps the old ids.
- [ ] **Step 2:** Run `node server/test-event-boards.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Parameterise `raid-boards.js` and implement `event-boards.js` on top of it.
- [ ] **Step 4:** Run `node server/test-event-boards.js` and `node server/test-raid-boards.js`. Expected: both PASS.
- [ ] **Step 5:** Commit and push.

### Task 4: Generator: board rows, boardSet, eventType 1, raids on type 16

**Files:**
- Modify: `server/make-events.js` (`KHUX_EVENT_BOARDS=<board_sets.json>`, the `own` keys `sphere`/`sphereArray`/`sphereMasu`, `entry.boardSet`, `servedType`)
- Modify: `server/event_config.json` (`servedEventTypes [1,3]`, `serve.types` + `COIN`, `boardEventType 1`)
- Modify: `server/make-raid.js:393` (`'Event Coin': [16,0]`) and the raid coin tables of type 15 (raid_config.json l.560 note)
- Test: `server/test-make-events.js`, `server/test-make-raid.js`, `server/test-raid-rewards.js`

**Interfaces:**
- Consumes: `buildEventBoards` (Task 3).
- Produces: `game_data/events.json` entries with `boardSet: "<setKey>" | null`, plus top-level `boardSets: {[setKey]: {boardIds, chains, censusIds}}`.

- [ ] **Step 1: Write the failing tests:**
  - `test-make-events.js` `board_entry_type1`: an entry with a board set has eventType 1, and one without has 3. The old assertion at l.646 (donor 1 served as 3) becomes «donor 1 without a set served as 3».
  - `boards_in_patch`: the sphere rows are in `own.sphere`, and the second regen is identical.
  - `test-make-raid.js` `raid_coins_type16`: no raid stage objective and no raidReward row has type 15.
- [ ] **Step 2:** Run the three tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `test-raid-rewards.js` `reward_type_15_and_16` changes: 16 still pays `raidSpherePoint`, and 15 is now covered by Task 5.
- [ ] **Step 4:** Run all `node server/test-*.js`. Expected: PASS. Regenerate the master: the server log shows the valid-table count and no `evStage` or `sphere` line.
- [ ] **Step 5:** Commit and push.

### Task 5: Serving coins and type-4 boards

**Files:**
- Create: `server/routes-event-boards.js` (factory, like `routes-events.js`)
- Modify: `server/server.js`:
  - `grantItem` l.2253: 15 no longer goes to `raidSpherePoint`;
  - `userPointData` l.1981;
  - the sphere functions l.2641-2774: the id sequence, check and close, and update for type 4;
  - `/stage/start`: sets the focus;
  - `eventRoutes()` deps.
- Modify: `server/routes-events.js` (`pay()` pays type 15 into the entry's set)
- Test: `server/test-event-board-routes.js`; `server/test-event-routes.js` (`coins_not_paid` becomes `coins_paid_to_set`)

**Interfaces:**
- Consumes: `events.json` `boardSets` and `entry.boardSet` (Task 4).
- Produces: `eventBoardRoutes({player, events, master, grantSphereReward, now}) -> {focusSet(), stagePoint(), addCoins(setKey, n), check(body), update(boardId, cellIdx), onStageStart(eventEntry)}`.
- Produces save fields: `player.eventCoins {[setKey]: n}`, `player.eventSphere {[boardId]: {id, unlock[], getDatetime}}`, `player.eventSphereSent []`, `player.eventCoinFocus setKey|null`.

- [ ] **Step 1: Write the failing tests** in `test-event-board-routes.js`:
  - `coins_to_entry_set`: clearing a quest of EV-0759 twice pays its type-15 objective once and its type-15 drops twice, all into `eventCoins["2019-04"]`;
  - `stage_point_is_focus_balance`: `userPoint.stageSpherePoint` equals the balance of the focus set;
  - `check_hands_focus_only`, with the `boardTypes` recorded in Task 1;
  - `focus_switch_keeps_progress`;
  - `reopen_no_repay`;
  - `update_insufficient_coins`;
  - `chained_board_locked`;
  - `old_save_defaults`;
  - `kept_event_window`: the kept event's set is available outside its week;
  - `grantItem_15_without_set`: logged and not paid, and `raidSpherePoint` does not change.
- [ ] **Step 2:** Run `node server/test-event-board-routes.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `routes-event-boards.js` and wire it in `server.js`. `respondSphereUpdate` sends type 4 to `update()`. Type 5 keeps its own path, and type-5 tests do not change.
- [ ] **Step 4:** Run all `node server/test-*.js`. Expected: PASS.
- [ ] **Step 5:** Commit and push.

### Task 6: Event Catalog: boards of each event

**Files:**
- Modify: `server/event-pages.js`, `server/routes-events.js` (`catalogCtx`), in the same way as `raidBoardIndex` / `raidBoardItems` / `raidBoardDoneLookup` (server.js l.4579-4620)
- Test: `server/test-event-pages.js`

- [ ] **Step 1: Write the failing tests:**
  - `event_board_items`: an entry with a set lists its boards and cells and marks the unlocked cells as done;
  - `event_coins_label`: the coin line shows the set balance and the «never expire» note.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, then run the tests. Expected: PASS.
- [ ] **Step 4:** Check the page in the browser against the Raid Catalog style, with the original board frames from `reference\` as the target. Commit and push.

### Task 7: Maps, banners, resources, bench

**Files:**
- Modify: the private event maps and banners under `D:\Progetto_Restauro_KH_UX\tmp\events\` (Part 2 pipeline), `stage_gen` board art (`img/sphere_incentive/<id>.png`)
- Modify: `tools/ldplayer/session/*.ps1` (Revision +1)

- [ ] **Step 1:** Build the maps and banners for the new coin quests. Show the new banners and every new enemy assembled in its animations to the user before serving.
- [ ] **Step 2:** Build the resources with `build-resources.ps1 -Version 108`, run update-resources and tap Download.
- [ ] **Step 3:** Bench on save `coin1` (story date in April 2019):
  - clear one EV-0774 quest twice and check the coins on the board screen;
  - unlock two cells;
  - complete Board 1 and open Board 2;
  - keep an October 2019 event, start it, and check that the focus moves;
  - come back and check that the April progress is kept.
  Log the results in `docs/notes/events.md`. Ask the user before each battle unless they say to play.

### Task 8: Notice, docs, next part

**Files:**
- Modify: `server/routes-info-album.js` (the «Events» notice gets the section «## Event coins and boards»: never-expiring coins, one balance per set and the focus rule, unmatched cells, raid coins unchanged), then `node server/export-notices.js`
- Modify: `README.md`, `README.it.md`, `docs/ISSUES.md` (I-245 Part 3), `HANDOFF.md`, `docs/notes/events.md`
- Create: `docs/superpowers/plans/<date>-events-part4-challenges.md` (writing-plans)

- [ ] **Step 1:** Write the notice section with its counts read from `events.json`. Run `node server/test-notices.js` and `node server/export-notices.js`. Expected: OK and up to date.
- [ ] **Step 2:** Update the docs, then commit and push.
- [ ] **Step 3:** Write the Part 4 plan.
