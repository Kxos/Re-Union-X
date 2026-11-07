# Events, Part 2: gem quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every playable gem event of the census (type GEM, 82 rows, 2017-06..2021-02) is served in the Events tab of its story week. This covers the weekly gem quests, the monthly gem quests, the gem drop events and the daily gem events. Rows that are not quests (gem boards, coin events, undated rows) are listed in the Event Catalog with their reason.

**Architecture:** Part 1 built the framework: `make-events.js`, `event-calendar.js`, `routes-events.js`, the Event Catalog pages and the eventType of the donor. This part widens its data, not its shape.
- The private record builder of the pilot (`tmp/events_p1/pilot/work/`) becomes a builder driven by a census selection, and it writes `gem.json` in the same record shape.
- `KHUX_EVENT_SRC` accepts a folder of record files.
- The `onlyCensusIds` filter becomes a `serve` selection: the 13 pilot ids plus type GEM.
- Gem quests without donor rows (weekly 2017-09..2018-02) are rebuilt from khuxwiki with the Special pipeline and labelled.

**Tech Stack:** Node server (`server/`), private Python builders (`python -I`), LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md` (part 2 of «The work, in parts»); Part 1 plan `docs/superpowers/plans/2026-11-06-events-part1-framework.md`; field notes `docs/notes/events.md`.

## Global Constraints

- Worldwide content only. Calendar of record: `D:\Progetto_Restauro_KH_UX\private\events\sources\event_census\event_census.json`.
- Order of trust: official notice > khuxwiki > donated master (after cross-check) > JP twin > reconstruction.
- Every reconstructed value carries a label with a `reconstructedWhy` text, declared in the «Events» notice. The notice reads its counts and labels from `events.json`.
- **Enemies are never substituted (author, 06-11).** Every missing enemy is searched until found. A quest whose enemy is still missing is not served; it is listed in the catalogue with its reason. New models are shown to the user assembled in their animations before serving.
- No raid boss spawns from event quests (author, 07-11). `eventType` is the donor's, never 2; the fallback is `config.eventType` (1).
- Rewards:
  - objectives and first-clear rewards are paid once per quest;
  - drops are paid on every clear;
  - nothing is paid twice through the catalogue;
  - coin rewards (type 15) are still not paid (Part 3).
- Ids:
  - `server/event_ids.json` is append-only, and the anchors live in the private `event_anchors.json` next to the records;
  - the 13 pilot entries keep their numbers, because the saves `events1` and `events2` hold them;
  - `evStage.stageId` holds at most 5 ids;
  - after every master change the server log shows the valid-table count and no `evStage` line.
- No SE files, notice texts, donor data, wiki dumps or decompiled code in the repo.
  - Records and builders stay under `D:\Progetto_Restauro_KH_UX\tmp\events\`.
  - Generated data goes in `server/game_data/` (git-ignored).
  - Donated material is untrusted: Python with `-I`, never executed.
- Bench:
  - master revision only goes up (cycle, relogin, run-server and update-resources, BOM kept);
  - never restart only the server: use `relogin.ps1`;
  - AppAlive guard before every tap;
  - SKIP on dialogues;
  - battles: Claude plays them when the user asks, otherwise the user does.
- Master regen: `KHUX_MEDALS_ALL=1 KHUX_WORLDTOUR=1 KHUX_EVENT_ENEMIES=1 KHUX_EVENT_SRC=<records folder> node server/make-game-tables.js D:/Progetto_Restauro_KH_UX/wiki/medals.json`.
- Commit and push each verified step. Messages are in English, with explicit paths, `git -c safe.directory=*` and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Two census rows on one donor notice.** For example, Monthly Gem Quests for January 2020 (EV-0995) and PSM Gems Drop Event (EV-0999) share notice 61221 and the same donor rows.
  - The quests are built once, by the row with the longer window.
  - The other entry points to it (`sharedWith`) and is listed in the catalogue.
  - The rewards cannot be taken twice.
  - Pinned in Task 3 (`shared_notice_built_once`).
- **A GEM row without quests:**
  - gem boards (EV-0223, EV-0280, EV-0396);
  - the Event Coin event (EV-0242);
  - EV-1440 (no quests on the wiki);
  - EV-1530 (undated).
  - Expected: no evStage row, and a catalogue line with the reason and the later part.
  - Pinned in Task 3 (`no_quest_rows_reasoned`) and Task 3 (`undated_not_listed`).
- **Gem reward items.** Power, Speed, Magic, Sun and Moon Gems, Avatar Coins and the 6★ Moogle / Huey & Dewey & Louie rewards.
  - A reward whose item id is not in our master would make the clear fail.
  - Expected: built only with existing ids, otherwise the quest is skipped with a reason.
  - Pinned in Task 3 (`reward_items_exist`).
- **The pilot after widening.** The saves `events1` and `events2` hold pilot stage ids in `events.cleared`.
  - Expected: same ids, cleared quests stay cleared.
  - Pinned in Task 3 (`pilot_ids_unchanged`).
- **Same enemy at three difficulties** (AP 5/20/40 or 5/30/60, one quest each).
  - Expected: three quests, each with its own AP, level and objectives, not merged.
  - Pinned in Task 3 (`difficulty_quests_apart`).

---

### Task 1: Gem quest records (private)

Private data work, with a report for the user. Reuse the pilot builder; do not fork a copy.

**Files:**
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\records\`. Copy into it `pilot_2019_04.json` and `event_anchors.json` from `tmp\events_p1\pilot\` (leave the old files in place).
- Modify:
  - `tmp\events_p1\pilot\work\census.py`: selection from arguments, `--types GEM` and/or `--month 2019-04`;
  - `extract.py` and `build.py`: input and output paths from arguments; the output file is named after the selection.
- Create:
  - `tmp\events\records\gem.json`;
  - `tmp\events\gem\CROSSCHECK.md`;
  - `tmp\events\gem\MISSING_ENEMIES.md`;
  - `tmp\events\gem\REPORT.md`.

**Interfaces:**
- Produces: event quest records in the Part 1 shape, `{censusId, name, start, end, type, notices, evStage[], quests[{name, worldId, room, level, ap, targets, objectives, firstClear, drops, enemies[{id, level, label}], restrictions, label}]}`, with two new optional record fields:
  - `sharedWith: censusId`: the row whose quests are the same donor rows;
  - `noQuests: 'board' | 'coin' | 'undated' | 'wikiEmpty'`.
  - Quests without donor rows carry `label: 'wikiQuest'` and `source: 'khuxwiki'`.

- [ ] **Step 1:** Make the builder selection-driven. Then run `python -I build.py --month 2019-04 --out <scratch>/pilot_check.json`. Expected: byte-identical to `pilot_2019_04.json`; this proves the refactor changed nothing.
- [ ] **Step 2:** Run it with `--types GEM --out D:/Progetto_Restauro_KH_UX/tmp/events/records/gem.json`. Expected: 82 records. About 53 have donor rows and about 22 weekly 2017-09..2018-02 rows have khuxwiki only. The rows without quests carry `noQuests`. The donor-notice pairs carry `sharedWith`.
- [ ] **Step 3:** Cross-check each donor quest against khuxwiki (count, level, AP, targets, objectives, rewards). Write the conflicts and the order-of-trust choice in `CROSSCHECK.md`.
- [ ] **Step 4:** Look up every enemy and every reward item in our master. The missing ones go to `MISSING_ENEMIES.md`, with donor id, name, level, quests and what is known. No substitutes.
- [ ] **Step 5:** Write `REPORT.md`:
  - rows by kind (donor, wiki-only, shared, no quests);
  - quests per row;
  - conflicts;
  - missing enemies and items.
  - **Show it to the user** and wait.

### Task 2: Find the missing gem enemies

Same procedure as Part 1 Task 2b. Expect few new families: most gem bosses are story or raid enemies, for example Dual Durandal, Wicked Spider, Assault Dragon, Queen Bee Ω and Ramuh. Assault Dragon, Queen Bee Ω and Ramuh are already on the open list of 17 missing names.

**Files:**
- Modify: `tmp\events\gem\MISSING_ENEMIES.md` (sources tried and found per enemy).
- Modify: the event enemy list read by `KHUX_EVENT_ENEMIES` (as in Part 1) and `recon/tools/make_jp_enemies.py` approved families, if new models are imported.

- [ ] **Step 1:** For each missing enemy, record every attempt, in this order: donated enemy table (cross-checked), WW 1.1.3, JP 4.3.1 (rows, `lwf/character`, textures), khuxwiki, footage.
- [ ] **Step 2:** Import the models found. A value that no source holds is deduced, labelled and declared.
- [ ] **Step 3:** **Show the user** each new enemy assembled in its animations. Wait for approval.
- [ ] **Step 4:** Enemies still not found stay listed; their quests are not served. Commit the importer and list changes.

### Task 3: Generator: records folder, serve selection, shared and empty rows

**Files:**
- Modify: `server/make-events.js`, `server/event_config.json`, `server/test-make-events.js`.

**Interfaces:**
- Consumes: Task 1 records (`sharedWith`, `noQuests`, `label: 'wikiQuest'`).
- Produces:
  - `readRecords(src) -> records[]`: `src` is a file (Part 1 behaviour) or a folder (every `*.json` except `event_anchors.json`, sorted by name). The anchors file is next to the file, or inside the folder.
  - Config `serve: {censusIds: [...13 pilot ids], types: ['GEM']}` replaces `onlyCensusIds`. A record is built when its id or its type is selected. An old config with `onlyCensusIds` still works.
  - Entry fields `sharedWith` and `noQuests` (copied to `events.json`).
  - Reasons `'shared'`, `'board'`, `'coin'`, `'undated'`, `'wikiEmpty'`, `'rewardItemMissing'`, each with a catalogue text in `event_config.json` (`reasonText`).
  - A `reconstructedWhy.wikiQuest` text: «Quest rebuilt from the khuxwiki page: no master row of the original is known».

- [ ] **Step 1: Write the failing tests** in `test-make-events.js`, on fixtures:
  - `records_folder`: a folder with two record files and one anchors file reads as the concatenation of both files. The anchors file is not read as records.
  - `serve_selection`:
    - type GEM plus pilot ids builds both;
    - a type EQ record outside the ids is not built (reason `'notSelected'`);
    - `onlyCensusIds` alone still filters as before.
  - `shared_notice_built_once`:
    - two records on the same donor evStage rows, the second with `sharedWith`, give one set of stage rows;
    - the second entry has `stageIds` equal to the first's and `sharedWith` set;
    - only one evStage row is built for those stages.
  - `no_quest_rows_reasoned`: a record with `noQuests: 'board'` gives no evStage row and an entry with reason `'board'` and its `reasonText`.
  - `undated_not_listed`: a record without `start` gives an entry with reason `'undated'` and no evStage row.
  - `reward_items_exist`: a quest whose first-clear item id is not in the fixture master is skipped with reason `'rewardItemMissing'`. A quest with existing gem material ids is built.
  - `pilot_ids_unchanged`: building pilot plus gem records against the committed `event_ids.json` gives the same evStage and stage ids to every pilot key as before. New keys take numbers above the current maximum.
  - `difficulty_quests_apart`: three quests with the same enemy and AP 5/20/40 give three stage rows with `useAp` 5, 20 and 40.
  - `wiki_quest_labelled`: a `wikiQuest` quest is built with the label in the entry's `labels`, and `reconstructedWhy.wikiQuest` exists.
- [ ] **Step 2:** Run `node server/test-make-events.js`. Expected: the new tests fail, the Part 1 tests pass.
- [ ] **Step 3:** Implement in `make-events.js`. Keep the Part 1 code paths; the selection and the reasons extend `buildEvents`. Set `serve` in `event_config.json`.
- [ ] **Step 4:** Run `node server/test-make-events.js`, `node server/test-event-routes.js`, `node server/test-event-calendar.js`, `node server/test-event-pages.js` and `node server/test-notices.js`. Expected: all OK.
- [ ] **Step 5:** Commit (code, config, ids, tests; no game_data).

### Task 4: Weekly gem quests without master rows (2017-09..2018-02)

About 22 single quests: LV 999 or 1200, AP 0, 10 or 25, one target, and the rewards Jewel 30 + one gem + one 6★ Moogle (khuxwiki).

**Files:**
- Modify: `tmp\events_p1\pilot\work\build.py` (the `wikiQuest` path: world, room, enemy level, objectives and rewards from the khuxwiki infobox).
- Modify: `recon/tools/gen_story_maps.py` config `events` key only if a new room kind is needed.

**Interfaces:**
- Consumes: the Task 3 label `wikiQuest`.
- Produces: `wikiQuest` records with a map.
  - The map is the JP twin map when the census row has the JP flag (EV-0290, EV-0293, EV-0301, EV-0306 and EV-0313).
  - Otherwise it is the story room of the wiki's world with the boss placed, labelled `wikiRoom`. Add a `reconstructedWhy.wikiRoom` text to `event_config.json`.

- [ ] **Step 1:** Build the weekly records. Each value cites its wiki page in `CROSSCHECK.md`. A field the wiki does not hold is left out, never invented. A quest without a known world is not served (reason `'wikiEmpty'`).
- [ ] **Step 2:** Run the master regen with `KHUX_EVENT_SRC=D:/Progetto_Restauro_KH_UX/tmp/events/records`.
  - Expected log: entries for 13 pilot rows plus 82 gem rows.
  - Served counts per kind are printed; record them in `REPORT.md`.
  - The server log shows the same valid-table count and no `evStage` line.
- [ ] **Step 3:** Run `node server/test-make-events.js` again. Commit the config text and any tool change.

### Task 5: Maps, banners, resources

**Files:**
- Modify:
  - `recon/tools/make_event_banners.py` (only if the gem notice image keys need a new case);
  - `server/game_data/event_img/` (git-ignored);
  - the event image version in `routes-events.js` (`EVENT_IMG_VERSION` +1).

- [ ] **Step 1:** Download the gem banners privately into `D:\Progetto_Restauro_KH_UX\reference\event_banners_ww\` and make the cards. **Show the user** the gem cards and wait.
- [ ] **Step 2:** Generate the gem maps. A missing map bin is reported, not invented.
- [ ] **Step 3:** Build resources 107:
  - full build if Task 2 added enemy families, otherwise `-Quick`;
  - then `update-resources.ps1` and the two taps;
  - master regen, revision 279 in the four session scripts;
  - check the log.
- [ ] **Step 4:** Commit tools and revision.

### Task 6: Bench

**Files:**
- Modify: `docs/notes/events.md` (results, screenshot names).

- [ ] **Step 1:** Make two saves from `maxpower` with the `mksave2.js` pattern (`LIMIT`):
  - `gem1`, a story quest whose Shop week falls in October 2017 (a weekly gem quest);
  - `gem2`, a Q in January 2019 (Monthly Gem Quests January, 5 quests).
  - `relogin.ps1 -Save gem1`.
- [ ] **Step 2:** Screenshots in `D:\Progetto_Restauro_KH_UX\screenshots\`:
  - `gem1_tab`: the weekly gem card in the Events tab;
  - `gem1_list`: its quest list, with no Raid Boards button;
  - `gem2_tab`, `gem2_list`;
  - `gem_catalog`: the Event Catalog with gem rows, a board row with its reason, and a shared row.
- [ ] **Step 3:** Play one weekly and one monthly gem quest (Claude when the user asks, otherwise the user). Check that:
  - the objectives are paid once;
  - the gem rewards are in the inventory;
  - the drops match;
  - a replay pays no objective again.
- [ ] **Step 4:** Record the results and commit.

### Task 7: Notice, docs, next part

**Files:**
- Modify:
  - `server/routes-info-album.js` (the «Events» notice: one sentence on rebuilt weekly gem quests, if the `wikiQuest` / `wikiRoom` labels are in use; the counts update by themselves);
  - `server/test-notices.js`;
  - `docs/NOTICES.md` and `docs/notices/index.html` (`node server/export-notices.js`);
  - `docs/ISSUES.md` (I-245 Part 2);
  - `HANDOFF.md`, `README.md`, `README.it.md`.
- Create: `docs/superpowers/plans/2026-MM-DD-events-part3-coins.md`.

- [ ] **Step 1:** Update the notice text and its test. Run `node server/test-notices.js` and `node server/export-notices.js --check`. Expected: OK, up to date.
- [ ] **Step 2:** Update ISSUES, HANDOFF and README. Commit and push.
- [ ] **Step 3:** Write Part 3 (event coins and event boards: `stageSpherePoint`, sphere type 4 boards, type 15 rewards stop paying Raid Coins, the eventType of «Event Boards») with `superpowers:writing-plans`.
