# Events, Part 4: challenge and battle events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The challenge and battle events of 2018-04..2021 are served in the Events tab of their story week, year by year. These are census types EQ, KEY (keyblade challenges) and QUIZ: 287 rows not served yet, 230 without the Surprise events and Time Missions, which come last (57 rows).

**Architecture:** Parts 1-3 built the whole pipeline: private records, `make-events.js`, the calendar, the Event Catalog, coins and boards. This part widens the data again, like Part 2, and fixes the gaps that big batches hit:
- rooms not served;
- incomplete maps;
- missing enemies and reward items;
- reward types the server cannot pay yet (Boosters);
- many short evStage rows on one day.

One record file per year. A year is served only when its records, enemies, maps and cards have passed their gates.

**Tech Stack:** Node server (`server/`), private Python builders (`python -I`) under `D:\Progetto_Restauro_KH_UX\tmp\events\`, LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md` (part 4 of «The work, in parts»; «Short windows»; «Values»; «Notices (mandatory)»). Earlier plans: `2026-11-06-events-part1-framework.md`, `2026-11-07-events-part2-gem.md`, `2026-11-08-events-part3-coins.md`. Field notes: `docs/notes/events.md` (read «Part 3 summary», «Lessons for Part 4»). Calendar of record: `D:\Progetto_Restauro_KH_UX\private\events\sources\event_census\event_census.json` and `EVENT_CENSUS.md` (sections A, B, D, G).

## Global Constraints

- Everything in the Part 2 and Part 3 Global Constraints still applies:
  - worldwide only, and the order of trust (notice > khuxwiki > donor after cross-check > JP twin > reconstruction);
  - labels with `reconstructedWhy`, declared in the «Events» notice, which reads its counts from `events.json`;
  - append-only ids, and no SE data in the repo;
  - the bench rules (relogin only, AppAlive guard, SKIP, the revision only goes up);
  - the master regen command, and commit plus push for each step.
- **Enemies are never substituted (author, 06-11).** A quest whose enemy is missing is not served. New models are shown to the user assembled in their animations before serving.
- **Catalogue = playable events (user, 08-11).** An informative notice with no quest and no original banner gets no row. A playable event whose quests are not served yet keeps its row and its reason.
- **Nothing half-served (user, 08-11, boards).** A feature we cannot pay whole is held back and declared, never served with blanks or pass-through parts.
- **Short windows (author):** Surprise events and Time Missions open for their whole original Pacific day (`shortWindowHours` 12, label `wholeDay`).
- **Rewards:**
  - objectives and first-clear rewards are paid once;
  - drops and Event Coins are paid on every clear;
  - type-15 coins go to the set of the entry (`boardSet || boardSetKey`).
- **Ids:**
  - stage ids stay inside 4000000..4009999 and evStage ids inside 20000..29999;
  - Task 4 stops the run if a range would overflow;
  - every `evStage.stageId` holds at most 5 ids.
- **Memory (lesson of Part 3):** if the host kills the full resources build or `update-resources` for low memory, stop. Report, free memory and resume. No tap after a kill.
- **Out of scope:**
  - EQ rows before 2018-04 (the data hole, Part 10);
  - Org XIII (Part 5);
  - Booster challenges BOOST and the Booster effects (Part 6);
  - HSC (Part 8);
  - campaigns (Part 9).

## Builder's calls (to confirm at review)

1. **Booster rewards.** A quest reward that is a Booster (31 rows carry the census `booster` flag) is not paid now. The quest is served with its other rewards. The Booster is recorded once in `player.pendingBoosters` (`[{emblemName, stageId, objective}]`) for Part 6 to grant, and the catalogue shows it as «comes with the Boosters». Label `boosterLater`. A Booster that is the quest's only reward holds the quest (`boosterOnly`).
2. **Quizzes need their question.** A quiz quest is served only when the drama with its question is in our resources (`validBeforeDrama`). Otherwise it is not served (reason `quizTextMissing`), and the user is asked before any reconstruction.
3. **Coin feeders.** A challenge event that pays type 15 gets the `boardSetKey` of the month's board set. The mapping is extended in `board_sets.json`, with a source for each event. With no cited set, the quest's coins are logged, not paid, and labelled `noBoardSet`. A feeder keeps its donor `eventType` (3: no Event Boards button; Part 3 `feeder_keeps_donor_type`), and a feeder alone does not hand out a set: only a set with a donor-1 entry is handed out, the coins of the feeders still accrue to it (`feeder_alone_does_not_hand_out_set`).
4. **Years in order:** 2018-04..12, then 2019, 2020 and 2021. Surprise events and Time Missions are served last, in their own record file.

## Review Focus

- **Several short rows on one day.** A Surprise event that ran 3 times a day for 15-60 minutes, with the same stages each time.
  (Corrected 10 Nov 2026: the WW Surprise events ran for one whole Pacific day; the rule still covers short rows of one day.)
  - Expected: one evStage row per Pacific day, its stages once, and no duplicated card.
  - Pinned in Task 4 (`short_rows_one_per_day`).
- **A Booster reward on an objective.**
  - Expected: the clear succeeds and the other rewards are paid. The Booster is pending once, and a replay adds nothing.
  - Pinned in Task 4 (`booster_reward_pending_once`).
- **A reward type the server does not know.**
  - Expected: the quest is not served (`rewardTypeUnknown`). The type is never passed to the client, where it could crash a clear.
  - Pinned in Task 4 (`unknown_reward_type_held`).
- **Two events on one map key** (`mapKeyUsed`, 4 quests today).
  - Expected: both are served when they are the same quest (the second gets `sharedWith`); otherwise the second waits with its reason.
  - Pinned in Task 4 (`map_key_shared_quest`).
- **Catalogue size.** About 340 events in place of 110.
  - Expected: the catalogue renders under the Raid Catalog's budget (page about 100 KB, about 8 s on the bench), and the year tabs stay usable.
  - Pinned in Task 4 (`catalog_size_budget`).

---

### Task 1: Challenge records by year (private)

**Files:**
- Modify: `D:\Progetto_Restauro_KH_UX\tmp\events_p1\pilot\work\census.py` and `build.py` (selection `--types EQ,KEY,QUIZ --from 2018-04 --to 2018-12`, `--short only|exclude`; a census id already in another record file is skipped and listed).
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\records\challenge_2018.json`, `challenge_2019.json`, `challenge_2020.json`, `challenge_2021.json`, `short_2020.json` (Surprise events and Time Missions, all years).
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\challenge\CROSSCHECK.md`, `MISSING.md`, `REPORT.md`.
- Modify: `D:\Progetto_Restauro_KH_UX\tmp\events\boards\board_sets.json` (Part 4 coin feeders in `censusIds`, with a source each).

**Interfaces:**
- Produces: records in the `gem.json` shape. New optional quest fields:
  - `rewardTypes: [n]`, the reward types it pays;
  - `booster: {name}` on a reward that is a Booster;
  - `drama: {before, after}` for quizzes.

- [ ] **Step 1:** Run `build.py --month 2019-04 --out <scratch>`. Expected: byte-identical to `pilot_2019_04.json` (the refactor changed nothing).
- [ ] **Step 2:** Build the five files. Expected: 287 rows (none of them is in the pilot or coin records), 57 of them in `short_2020.json`. The 19 rows with no donor rows (`EVENT_CENSUS` B) are `wikiQuest` where khuxwiki has the infobox, otherwise `noQuests: 'wikiEmpty'`. Informative notices (no quest of their own and no banner; which rows they are is decided from the notice and the donor rows, and listed in `REPORT.md`) get `noQuests: 'notice'`.
- [ ] **Step 3:** Cross-check each donor quest against khuxwiki (count, LV, AP, targets, objectives, rewards). Log the conflicts and the choice made in `CROSSCHECK.md`.
- [ ] **Step 4:** Make `MISSING.md`, one table per year:
  - enemies not in our master or the event enemy list;
  - reward items not in our master;
  - reward types other than 1/3/5/15 (and every Booster);
  - map rooms not served;
  - incomplete maps.
- [ ] **Step 5:** Run the builder twice. Expected: byte-identical output. Write `REPORT.md` (rows per year and kind, quests, conflicts, missing) and **show it to the user**; wait.

### Task 2: Map coverage

Today 159 event quests wait for a map: 98 «STG header absent», 8 «part 2 absent», about 50 «rooms not served», 3 STG absent, 4 `mapKeyUsed`. Part 4 adds more of the same.

**Files:**
- Modify: `recon/tools/make_jp_rooms.py` (`EVENT_ROOMS` becomes a list read from `D:\Progetto_Restauro_KH_UX\tmp\events\maps\event_rooms.json`, written by the import, in place of the four hard-coded rooms).
- Modify: `recon/tools/import_event_stages.py` (report the incomplete STG per cause; try the other copies of the same bin: WW 2018 bundle, `bundle2016`, JP 4.3.1).
- Test: `recon/tools/test_make_jp_rooms.py` (`event_rooms_from_list`: the rooms of the list are built with `--story-only`, and a room not in the list is not).

- [ ] **Step 1:** Write `event_rooms_from_list`. Run it and see it fail. Implement. See it pass.
- [ ] **Step 2:** For each «STG header absent» and «part 2 absent» map, record every copy tried in `tmp\events\maps\INCOMPLETE.md`. A part found in another original copy is used; nothing is invented.
- [ ] **Step 3:** Rebuild `rooms_gen` and the event stages. Expected: the counts drop in the log. Note them in `REPORT.md`. Commit the tools.

### Task 3: Missing enemies and reward items (user gate)

Same procedure as Part 3 Task 7a.

**Files:**
- Modify:
  - `recon/tools/event_enemy_families.json`;
  - `recon/tools/whole_export.py` labels;
  - `extra_donors_events2.tsv`;
  - the private `tmp\events_p1\pilot\work\build_event_enemies.py` input (`missing_challenge.json`);
  - `server/medal-restored.js` for a missing reward medal (as 90296 and 90346).

- [ ] **Step 1:** For each enemy in `MISSING.md`, record every source tried, in order: donor table cross-checked, WW 1.1.3, JP 4.3.1 rows/`lwf/character`/textures, khuxwiki, footage.
- [ ] **Step 2:** Import the models found and build the review page `tmp\events_enemies\review\challenge\index.html` (assembled, every animation). **Show the user**; wait for approval per model.
- [ ] **Step 3:** For each missing reward medal, find it (data + art), as 90296 was. Ask the user when a medal has no original art.
- [ ] **Step 4:** What is still missing stays listed; its quests are not served. Commit the tool and list changes.

### Task 4: Generator: payable rewards, Boosters pending, short rows, shared map keys

**Files:**
- Modify: `server/make-events.js`, `server/event_config.json` (`serve.types` + `EQ`, `KEY`, `QUIZ`; `payableTypes: [1, 3, 5, 15]`; `reasonText` and `reconstructedWhy` for `boosterLater`, `boosterOnly`, `rewardTypeUnknown`, `quizTextMissing`, `noBoardSet`, `notice`).
- Modify: `server/routes-events.js` (a Booster reward goes to `player.pendingBoosters` once).
- Modify: `server/event-pages.js` (a Booster cell or reward line «comes with the Boosters»).
- Also in Task 4 (the new code `noQuests: 'notice'`): add `'notice'` to `REASONS` in `server/make-events.js` (otherwise `unknown reason` stops the run), and widen `informative()` in `server/event-pages.js` (today `e.noQuests === 'board'` only) to `['board', 'notice'].includes(e.noQuests)`, so that `entriesOf` drops the notice rows (`notice_row_not_listed`).
- Test: `server/test-make-events.js`, `server/test-event-routes.js`, `server/test-event-pages.js`.

**Interfaces:**
- Consumes: the Task 1 records (`rewardTypes`, `booster`, `drama`, `noQuests: 'notice'`).
- Produces:
  - `remapItems(q, resolve, payable) -> {q, missing, boosters, unknownTypes}`;
  - save `player.pendingBoosters: [{emblemName, stageId, objective}]`, empty by default, for Part 6.

- [ ] **Step 1: Write the failing tests:**
  - `short_rows_one_per_day`: three donor rows of 20 minutes each on 2020-02-02 (same 5 stages) give one evStage row with `days ['2020-02-02']` and five stage ids.
  - `booster_reward_pending_once`: an objective with `booster: {name: 'P Booster +25%'}` is built with label `boosterLater`. On clear the other rewards are paid and `pendingBoosters` has one item. A replay leaves the length at 1.
  - `booster_only_held`: a quest whose only reward is a Booster gives reason `boosterOnly` and no stage row.
  - `unknown_reward_type_held`: a reward of type 99 gives reason `rewardTypeUnknown`, and type 99 is absent from every emitted reward row.
  - `quiz_needs_drama`: a QUIZ quest whose `drama.before` is not in the fixture drama list gives reason `quizTextMissing`.
  - `map_key_shared_quest`: two records with the same map key and the same quest give one stage row. The second record gets `sharedWith`. A different quest on the same key keeps `mapKeyUsed`.
  - `coin_feeder_by_set`: a type-15 objective of an entry with `boardSetKey` is built. Without one it is labelled `noBoardSet`.
  - `notice_row_not_listed`: `noQuests: 'notice'` gives no evStage row and no catalogue row (`entriesOf`).
  - `catalog_size_budget` (test-event-pages): a fixture of 400 entries with 6 quests each renders the catalogue under 150 KB.
- [ ] **Step 2:** Run the three test files. Expected: the new tests fail and the old ones pass.
- [ ] **Step 3:** Implement. An overflow of the id range throws with the range and the count.
- [ ] **Step 4:** Run `node server/test-make-events.js`, `test-event-routes.js`, `test-event-pages.js`, `test-event-boards.js`, `test-event-board-routes.js`, `test-event-calendar.js`, `test-notices.js`. Expected: all OK. Commit (code, config, tests).

### Task 5: Cards (user gate)

**Files:**
- Modify: `recon/tools/make_event_banners.py` (only for new notice image key cases; `noQuests 'notice'` gets no card, like `'board'`), `server/game_data/event_img/` (git-ignored), `imgVersion` +1 in `event_config.json`.

- [ ] **Step 1:** Download the banners privately into `D:\Progetto_Restauro_KH_UX\reference\event_banners_ww\` and make the cards of the four years. Build the review page `tmp\events_enemies\review\challenge\cards.html`, by year.
- [ ] **Step 2:** **Show the user**; wait. A card the user rejects is redone or dropped, as 20181 was. Commit the tool change.

### Task 6: Serve 2018-04..2021, resources 109, bench

**Files:**
- Modify: the four session scripts (revision +1, BOM kept), `docs/notes/events.md` (section «Challenge events (Part 4)»).

- [ ] **Step 1:** Put in the records folder only the year files that passed Tasks 1-5 (`short_2020.json` stays out until Task 7). Master regen with `KHUX_EVENT_SRC=D:/Progetto_Restauro_KH_UX/tmp/events/records` and `KHUX_EVENT_BOARDS=…/board_sets.json`.
  - Expected log: served and not-served counts per year and per reason; same valid-table count; no `evStage` line.
  - `md5` of the tables before and after shows that only event rows changed.
- [ ] **Step 2:** Build resources 109 (full if Task 3 added models or Task 2 added rooms, else `-Quick`). Then `update-resources.ps1` and the taps (200,1020) and (1220,715).
- [ ] **Step 3:** Make saves from `maxpower` with the `mksave2.js` pattern:
  - `chal18`: a Shop week in 2018-06, Quiz June 27 and a Keyblade Challenge;
  - `chal20`: a week in 2020-05, Keyblade Challenge (5/9) and a Booster-reward event.
  Run `relogin.ps1 -Save chal18`.
- [ ] **Step 4:** Bench, frames in `D:\Progetto_Restauro_KH_UX\screenshots\t4p_*.png`:
  - the Events tab cards;
  - a keyblade challenge start popup (the locked Keyblade, RULE);
  - a quiz question drama;
  - a Booster-reward clear (no crash, other rewards paid);
  - a coin feeder paying into its set;
  - the Event Catalog year tabs and load time.
  Claude plays the battles when the user asks, otherwise the user does.
- [ ] **Step 5:** Record the results and commit.

### Task 7: Surprise events and Time Missions

**Files:**
- Modify: `server/event_config.json` (nothing if Task 4 covers the short rows: they are type EQ, already in `serve.types`), `docs/notes/events.md`.

- [ ] **Step 1:** Move `short_2020.json` into the records folder and regen. Expected: 57 rows, one evStage row per original day (`short_rows_one_per_day`), label `wholeDay`.
- [ ] **Step 2:** Bench on a save with a week in 2020-02 (`surp20`). Check that the Surprise event is listed on its weekday all day and that it is gone the next day. Record and commit (revision +1; resources only if new maps).

### Task 8: Notice, docs, next part

**Files:**
- Modify: `server/routes-info-album.js` (the «Events» notice: challenge events served by year with counts from `events.json`, Booster rewards pending until the Boosters, quizzes, Surprise events and Time Missions open all day), `server/test-notices.js`; run `node server/export-notices.js`.
- Modify: `README.md`, `README.it.md` (parts 1-4), `docs/ISSUES.md` (I-245 Part 4; I-166: the pending Boosters), `HANDOFF.md` (new «read first» block), `docs/notes/events.md` (Part 4 summary).
- Create: `docs/superpowers/plans/<date>-events-part5-orgxiii.md` (writing-plans).

- [ ] **Step 1:** Write the notice lines and their test. Run `node server/test-notices.js` and `node server/export-notices.js --check`. Expected: OK, up to date.
- [ ] **Step 2:** Update the docs. Commit and push.
- [ ] **Step 3:** Write the Part 5 plan.
