# Events, Part 5: Org XIII monthly events and Challenge Organization XIII Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The worldwide Org XIII events are served in the Events tab of their story week:
- the monthly «XIII Event» runs of 2016-11..2017-12;
- the «NEW XIII Event» runs of 2018-04..2019-02, the returning run, the SP Challenge and the March 2019 monthly;
- Challenge Organization XIII of 2020.

**Architecture:** Parts 1-4 built the pipeline: private records, `make-events.js`, the calendar, the Event Catalog, cards and coins. This part has two data regimes:
- The 2018-04..2020 runs have donor rows (census flag M21). They go through the Part 4 builder like the challenge events.
- The 2016-11..2017-12 runs fall in the data hole: no master row survives. They are rebuilt from khuxwiki quest infoboxes and the wikiwiki JP 13-stage tables. Each quest gets a JP 4.3.1 map when one matches the quest; otherwise it gets a map generated with the Special pipeline (`gen_story_maps.py`), labelled.

Two generator gaps block the data-hole runs:
- objectives known only as wiki text (no donor code);
- quests with no original map.

Task 3 closes both.

**Tech Stack:** Node server (`server/`), private Python builders (`python -I`) under `D:\Progetto_Restauro_KH_UX\tmp\events\`, `recon/tools/gen_story_maps.py`, LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md`. Read part 5 of «The work, in parts», «Values» (quests without a master row: khuxwiki infoboxes with the Special pipeline, labelled reconstructed) and «Notices (mandatory)».

**Earlier plans:** `2026-11-06-events-part1-framework.md`, `2026-11-07-events-part2-gem.md` (Task 4: wiki-only weekly gem quests, `laterRun`), `2026-11-08-events-part3-coins.md`, `2026-11-09-events-part4-challenges.md`.

**Field notes:** `docs/notes/events.md`. Read «Weekly gem quests of 2017-09..2018-02», «Challenge events (Part 4, Task 6 preparation)» and «Part 4 summary», with its lessons.

**Calendar of record:** `D:\Progetto_Restauro_KH_UX\private\events\sources\event_census\event_census.json` and `EVENT_CENSUS.md`:
- section B: STORY, 47 rows (23 with donor rows, 43 on khuxwiki, 8 JP twins);
- sections D and E (item 5);
- section J (the rows).

**JP 13-stage tables:** `private\events\sources\wikiwiki\event_quests_2016-01_2017-02.md` §4 and `event_quests_2017.md`, plus the «WW links» note: the Marluxia, Larxene, Xemnas and Xigbar runs fell on the same dates in JP and WW; Demyx and Luxord ran one year later in WW.

## The rows (census ids, to confirm in Task 1)

- **Data hole (no donor rows), 15 rows.** EV-0081 Marluxia, EV-0097 Larxene, EV-0122 Xemnas, EV-0139 Xigbar, EV-0156 Xaldin, EV-0182 Vexen, EV-0202 Lexaeus, EV-0219 Zexion, EV-0232 Saïx, EV-0248 Axel, EV-0270 Demyx, EV-0295 Luxord, EV-0333 XIII Revival, EV-0340 Roxas, EV-0346 Xion.
  - EV-0081, EV-0097 and EV-0346 have no khuxwiki run, only JP twins.
  - For EV-0232, EV-0270, EV-0295, EV-0333 and EV-0340, khuxwiki does not separate the quests by run («series total 182»): the run dates on the quest pages decide.
- **Donor rows, 16 rows.** EV-0441, EV-0467, EV-0488, EV-0512, EV-0536, EV-0561, EV-0570 (returning), EV-0592, EV-0621, EV-0622 (SP Challenge), EV-0647, EV-0648, EV-0678, EV-0679, EV-0714, EV-0741 (March 2019 monthly).
  - EV-0648 and EV-0678 are second notices of EV-0647 and EV-0679 («Challenge Larxene / Xemnas»). Task 1 decides from the notices and the donor rows whether they are their own quests or a `scheduleLineOf` line.
- **Challenge Organization XIII, 2020.**
  - EV-1103 (Pt.2, 2020-04-19) and EV-1273 (2020-09-14).
  - Pt.1 is to find. Task 1 searches the notices of 2020-03/04.
- **Already served:** EV-0781 (Final Challenge, pilot of Part 1). It is not rebuilt.

## Global Constraints

- Everything in the Part 2, 3 and 4 Global Constraints still applies:
  - worldwide only;
  - the order of trust: notice > khuxwiki > donor after cross-check > JP twin > reconstruction;
  - labels with `reconstructedWhy`, declared in the «Events» notice, which reads its counts from `events.json`;
  - append-only ids in `event_ids.json`, and no SE data in the repo;
  - the bench rules: relogin only, the AppAlive guard, SKIP every dialogue, and the revision only goes up;
  - the master regen command in HANDOFF, and commit plus push for each step, always after `git pull --rebase`.
- **Enemies are never substituted (author, 06-11).** A «variant» boss of the JP tables (Behemoth variant, Trickmaster variant, Darkside variant) is its own enemy: found, or the quest waits. New models are shown to the user assembled in their animations before serving.
- **Nothing half-served (user, 08-11).** An objective whose code is unknown holds its quest. It never gets a stopgap code. `make-special.js` uses stopgaps; events must not.
- **Catalogue = playable events (user, 08-11).** An announcement row with no quest of its own gets no catalogue row.
- **Rewards:**
  - objectives and first-clear rewards are paid once;
  - drops and Event Coins are paid on every clear;
  - a rerun that shares a stage row (`sharedWith`) pays its objectives once in all.
- **Ids:**
  - stage ids stay inside 4000000..4009999 (last used 4003301) and evStage ids inside 20000..29999;
  - every `evStage.stageId` holds at most 5 ids.
- **Pitfalls (Part 4):**
  - Never run `make_jp_enemies.py --ids`.
  - Never rerun a builder against a master that already holds its own new enemy rows.
  - `build_challenge.py` is not rerun by this part. If it must be, `patch_surprise.py` is re-applied after it.
- **Memory:** if the host kills a resources build or `update-resources`, stop. Report, free memory and resume. No tap after a kill.
- **Out of scope:**
  - The Keyblade War (I-247);
  - the Genie Jafar quests (I-248);
  - the Org. XIII Avatar Parts boards EV-0728 / EV-1084 (Part 7);
  - Boosters (Part 6);
  - scenario drama texts: scenes stay off, label `dramaOff`, as in Parts 1-4.

## Builder's calls (to confirm at review)

**User decisions (10 November 2026).** All five calls are approved, with one addition to call 1: before a generated map
is used, the original map is searched in every source we hold (JP 4.3.1, WW 1.1.3, the donor data, the restored room
packs); only when none exists does the quest get a reconstructed map (`wikiRoom`, declared not original). **The Keyblade
War (I-247) joins Part 5**: date EV-0929 to 2019-09-03, build part 3 «The Ultimate Test» per Union, and pay the Keyblade
War Challenge completion reward (notice 61226, the six Kyroo SAB 10 medals) counting only the player's own Union version.

1. **Maps of the data-hole quests.**
   - A quest gets a JP 4.3.1 map when one map holds exactly the enemy names, counts and target of its khuxwiki page or JP table row, at the quest's level. Label `jpTwinMap`. This is the `laterRun` rule of Part 2.
   - Otherwise it gets a generated map: the story room of its world (khuxwiki `room` / `world`) with the enemy groups placed by `gen_story_maps.py`, as the Special quests. Label `wikiRoom`, declared as not original.
   - With no world, no map: reason `wikiEmpty`.
2. **Wiki objectives.**
   - An objective known only as text gets its code from `objectiveCodes` (make-story-oltre.js), widened only with codes proven by donor stage rows (the Part 4 time trials). Label `wikiObjective`.
   - A text with no proven code holds the quest (reason `objectiveUnmapped`). The user is asked before any new code is used.
3. **Levels and stats.**
   - The quest level comes from the khuxwiki infobox, else from the JP table.
   - Enemy stats are those of our master's enemy row at that level (the story enemies' rules).
   - Nothing is deduced beyond the level.
4. **Second notices** (EV-0648, EV-0678). They are `scheduleLineOf` their main row, unless their donor rows prove other quests. Never two cards for one event.
5. **The XIII Revival (EV-0333) and Returning (EV-0570) runs.** Where they replay the quests of an earlier run (same map, same values), they share its stage row (`sharedWith`): objectives paid once in all.

## Review Focus

- **A wiki objective text with no code.** «Clear within 75 seconds» in a 2016 Demyx run.
  - Expected: the quest is held with `objectiveUnmapped` and the text. No stopgap code reaches the stage row.
  - Pinned in Task 3 (`wiki_objective_unmapped_held`).
- **A generated-map quest whose wiki enemy is not in the master.**
  - Expected: `enemyMissing` with the name. No `event_gen_maps.json` entry and no map file planned.
  - Pinned in Task 3 (`wiki_room_enemy_missing_held`).
- **The style avatar reward of stage IX** (male / female parts).
  - Expected: paid as the original row lists it, each part once, and a replay adds nothing.
  - Pinned in Task 3 (`avatar_pair_reward_once`).
- **A second notice row of the same event** (EV-0648 beside EV-0647).
  - Expected: one evStage row and one card.
  - Pinned in Task 3 (`schedule_line_no_row`, reusing the Part 4 `scheduleLineOf` rule).
- **A rerun sharing quests with an earlier run** (EV-0333 vs a 2017 run).
  - Expected: one stage row (`sharedWith`). A player who cleared the objectives in the first run gets nothing twice.
  - Pinned in Task 3 (`rerun_shared_objectives_once`).

---

### Task 1: Org XIII records (private)

**Files:**
- Modify: `D:\Progetto_Restauro_KH_UX\tmp\events_p1\pilot\work\census.py`. Add a selection `--ids EV-0081,...` (explicit census ids, any type). It is combined with `--skip-in`.
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\orgxiii\build_orgxiii.py`. Same shape as `tmp\events\challenge\build_challenge.py`: it runs extract.py and build.py with `python -I`, then the data-hole path below.
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\records\orgxiii_2016_17.json`, `orgxiii_2018_19.json`, `orgxiii_2020.json`.
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\orgxiii\CROSSCHECK.md`, `MISSING.md`, `REPORT.md`, `missing_orgxiii.json` (`missing_gem.json` shape).

**Interfaces:**
- Produces records in the `gem.json` shape, with these quest fields for the data-hole runs:
  - `label: 'wikiQuest'`;
  - `objectives: [{code: null, text, reward, source}]`;
  - `map: {key, status, source: 'jpTwin'|'generate'}`;
  - `jpTable: {member, stage: 'I'..'XIII', level, target, challenge}` (the wikiwiki row);
  - `room` / `worldId` from the khuxwiki infobox.
- Produces record fields `scheduleLineOf` and `noQuests: 'notice'`, as in Part 4.

- [ ] **Step 1:** Run `build.py --month 2019-04 --out <scratch>`. Expected: byte-identical to `pilot_2019_04.json` (`--ids` changed nothing).
- [ ] **Step 2:** Build the donor-row records (`orgxiii_2018_19.json` and `orgxiii_2020.json`) with the Part 4 path. Cross-check every donor quest against khuxwiki and log it in `CROSSCHECK.md`. Find Challenge Organization XIII Pt.1 in the notices of 2020-03..04, or record where it was searched.
- [ ] **Step 3:** Build `orgxiii_2016_17.json`.
  - Each quest comes from its khuxwiki page, pinned to the run by its run dates (the «series total 182» pages), else from the JP table row. Every value cites its page or table line in `CROSSCHECK.md`.
  - For each quest, try the JP 4.3.1 maps by enemy names, counts, target and level (builder's call 1). Record the match or every map tried.
  - A value no source holds is left out, never invented.
- [ ] **Step 4:** Make `MISSING.md`, one table per file:
  - enemies not in our master, the «variant» bosses first;
  - reward items not in our master (member B medals 5★, H/D/L, Magic Mirror, style avatar parts, titles «No. I».. «No. XIII»);
  - objective texts with no code in `objectiveCodes`;
  - quests with neither a JP map nor a world.
- [ ] **Step 5:** Run the builder twice. Expected: byte-identical output. Write `REPORT.md`: rows, quests per regime, matched JP maps, generated maps, objective texts without a code, missing enemies and items. **Show it to the user** with the five builder's calls; wait.

### Task 2: Missing enemies and reward items (user gate)

The Org XIII bosses of 2018-19 are in our master (display ids 1579..1607, served since the Part 1 pilot). The 2016-17 runs use story enemies plus the «variants».

**Files:**
- Modify: `recon/tools/event_enemy_families.json`, `extra_donors_events2.tsv`, the private `tmp\events_p1\pilot\work\build_event_enemies.py` input (`missing_orgxiii.json`), and `server/medal-restored.js` for a missing reward medal.

- [ ] **Step 1:** For each enemy in `MISSING.md`, record every source tried, in order:
  1. our master;
  2. the donor enemy table, cross-checked;
  3. WW 1.1.3;
  4. JP 4.3.1 rows, `lwf/character` and textures;
  5. khuxwiki;
  6. footage.

  Write it in `tmp\events_enemies\orgxiii\SOURCES.md`.
- [ ] **Step 2:** Import the models found. Build the review page `tmp\events_enemies\review\orgxiii\index.html`: assembled, every animation, with the fixed review renderer flags of Part 4 round 2. **Show the user**; wait for approval per model.
- [ ] **Step 3:** For each missing reward item, find it (data and art). Ask the user when an item has no original art.
- [ ] **Step 4:** What is still missing stays listed in `MISSING.md`, and its quests are not served. Commit the tool and list changes.

### Task 3: Generator: wiki objectives, generated maps, Org XIII rows

**Files:**
- Modify: `server/make-events.js`:
  - wiki objectives: `objectiveCodes` from `make-story-oltre.js`;
  - quests with `map.source 'generate'`: stageBinId = own stageId, as `make-special.js` does;
  - write `server/game_data/event_gen_maps.json` in the gen_story_maps «special» list shape.
- Modify: `server/event_config.json`:
  - `serve.censusIds` + the Org XIII ids of Task 1;
  - `reasonText.objectiveUnmapped`;
  - `reconstructedWhy` for `wikiObjective`, `wikiRoom` and `jpTwinMap`.
- Modify: `recon/tools/gen_story_maps.py` (config key `events`: the same list and rules as `special`).
- Modify: `server/make-story-oltre.js` (`objectiveCodes`: only the codes Task 1 proved from donor stage rows, each with its donor row in a comment).
- Test: `server/test-make-events.js`, `server/test-event-routes.js`, `recon/tools/test_gen_story_maps_events.py`.

**Interfaces:**
- Consumes: the Task 1 records (`label 'wikiQuest'`, `objectives[].code null`, `map.source`, `jpTable`).
- Produces:
  - `wikiObjectives(q, ctx) -> {objectives, unmapped: [text]}` in make-events.js;
  - `game_data/event_gen_maps.json`: `[{stageId, world, name, room, target, targetId, level, enemies: [[{name, enemyId, n, reward}]], treasures: [], rooms: 1}]`;
  - labels `wikiObjective`, `wikiRoom`, `jpTwinMap`;
  - reason `objectiveUnmapped`.

- [ ] **Step 1: Write the failing tests:**
  - `wiki_objective_mapped`: the text «Defeat 7 or more enemies» gets req 3 / n 7 and label `wikiObjective`.
  - `wiki_objective_unmapped_held`: «Clear within 75 seconds» (no proven code) gives reason `objectiveUnmapped` with the text in `why`, and no stage row.
  - `wiki_room_map_listed`: a served `generate` quest has `stageBinId === stageId`, one `event_gen_maps.json` entry with its level and enemy groups, and label `wikiRoom`.
  - `wiki_room_enemy_missing_held`: a generated-map quest naming an enemy not in the master gives `enemyMissing` and no `event_gen_maps.json` entry.
  - `jp_twin_map_served`: a `jpTwin` quest is served on its map key with label `jpTwinMap`.
  - `avatar_pair_reward_once`: a stage IX objective paying two avatar parts pays both on the first clear. A replay leaves the parts count unchanged (test-event-routes).
  - `schedule_line_no_row`: a `scheduleLineOf` record gives no evStage row and no catalogue row.
  - `rerun_shared_objectives_once`: two records with the same quest give one stage row and `sharedWith`. Clearing it from the second record after the first pays no objective (test-event-routes).
  - `test_gen_story_maps_events.py` `events_list_built`: an `events` list entry gives `mappoi_stg<stageId>.bin` + `_00.bin` with the target at the farthest point, the same placement as a `special` entry.
- [ ] **Step 2:** Run the test files. Expected: the new tests fail and the old ones pass.
- [ ] **Step 3:** Implement. `objectiveCodes` gets no code that a donor stage row does not prove.
- [ ] **Step 4:** Run these files. Expected: all OK, and every pre-existing failure unchanged (the 8 known ones).
  - `node server/test-make-events.js`, `test-event-routes.js`, `test-event-pages.js`, `test-event-boards.js`, `test-event-board-routes.js`, `test-event-calendar.js`, `test-notices.js`, `test-make-special.js`;
  - `python -I recon/tools/test_gen_story_maps_events.py`.

  Commit the code, config and tests.

### Task 4: Maps and rooms

**Files:**
- Modify: `tools/ldplayer/session/build-resources.ps1`. Run `gen_story_maps.py` with the `events` key into the generated pack, beside the Special maps.
- Run (no change expected): `recon/tools/import_event_stages.py`, `make_jp_rooms.py --story-only --event-rooms`.

- [ ] **Step 1:** Dry regen into a copy of `server/` at the repository's depth (`tmp\t5r`), as Part 4 did. Expected: `event_maps.json` lists the new JP-twin keys, and `event_gen_maps.json` lists the generated quests.
- [ ] **Step 2:** Import the JP maps (`import_event_stages.py`, then `--stage-dir stage_gen/files/stage`). Build the rooms list and any new room with `make_jp_rooms.py`. Generate the `events` maps.
  - Expected: counts per cause in `tmp\events\orgxiii\REPORT.md`;
  - no change to any served map file (md5 of `stage_gen\files\stage` before and after, for the old keys).
- [ ] **Step 3:** Render 3 generated maps (one per world kind) with the map preview tool used for the Special quests. **Show the user** beside the original footage of the same run where it exists; wait. Commit the build script change.

### Task 5: Cards (user gate)

**Files:**
- Modify: `recon/tools/make_event_banners.py` (only for new notice image key cases), `server/game_data/event_img/` (git-ignored), `imgVersion` +1 in `event_config.json`.

- [ ] **Step 1:** Download the 2016-2020 Org XIII banners privately into `D:\Progetto_Restauro_KH_UX\reference\event_banners_ww\`. Make the cards with `make_event_banners.py --all-rows --extra <staging>`. Build the review page `tmp\events\orgxiii\cards.html`, by year.
- [ ] **Step 2:** **Show the user**; wait. A card with no original banner is shown as such («No card in the original»), never invented. Commit the tool change.

### Task 6: Serve, resources 111, bench

**Files:**
- Modify: the four session scripts (revision +1, BOM kept), `docs/notes/events.md` (section «Org XIII events (Part 5)»).

- [ ] **Step 1:** Put the three Org XIII record files into `tmp\events\records`. Run the master regen (HANDOFF command).
  - Expected log: served and not-served counts per file and per reason; same valid-table count (106); no `evStage` line.
  - The `md5` of the tables before and after shows that only stage, evStage, reward, enemy and enemyAttack changed. No served stage or evStage id moves.
- [ ] **Step 2:** Build resources 111. Make it full if Task 2 added models or Task 4 added rooms, else `-Quick`. Then `update-resources.ps1` and the taps (200,1020) and (1220,715). *(Main session.)*
- [ ] **Step 3:** Make saves from `maxpower` with the `mksave2.js` pattern. *(Main session.)*
  - `org17`: the story week of 2017-01-13 (Xemnas XIII Event, data hole, generated or JP-twin maps);
  - `org18`: the week of 2018-08-13 (Axel NEW XIII, donor rows);
  - `org20`: the week of 2020-09-14 (Challenge Organization XIII).
- [ ] **Step 4:** Bench, frames in `D:\Progetto_Restauro_KH_UX\screenshots\t5p_*.png`. *(Main session; Claude plays the battles when the user asks, otherwise the user does.)*
  - the Events tab cards of each save;
  - one data-hole quest on a generated map and one on a JP-twin map (start popup, objectives, clear, first-clear rewards once, replay);
  - the stage XIII title and the stage IX style avatar paid once;
  - an Org XIII boss quest of 2018 (boss model, special attack);
  - the Event Catalog year tabs with the new rows.
- [ ] **Step 5:** Record the results in `docs/notes/events.md` and commit.

### Task 7: Notice, docs, next part

**Files:**
- Modify: `server/routes-info-album.js` («Events» notice: section «Org XIII events» with counts from `events.json`; the generated maps and wiki objectives declared through their labels), `server/test-notices.js`. Run `node server/export-notices.js`. After the push, run the GitHub Action «discord-notices» with «Run workflow».
- Modify: `README.md`, `README.it.md` (parts 1-5), `docs/ISSUES.md` (I-245 Part 5; new issues for what is left), `HANDOFF.md` (new «read first» block), `docs/notes/events.md` (Part 5 summary).
- Create: `docs/superpowers/plans/<date>-events-part6-boosters.md` (writing-plans; spec part 6, I-166, I-227, `player.pendingBoosters`).

- [ ] **Step 1:** Write the notice lines and their test. Never use the word «restored». Run `node server/test-notices.js` and `node server/export-notices.js --check`. Expected: OK, up to date.
- [ ] **Step 2:** Update the docs. Commit and push.
- [ ] **Step 3:** Write the Part 6 plan.
