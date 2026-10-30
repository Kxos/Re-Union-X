# Special tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Quests > Special tab with the original Special quests of the player's story period. Add a Special
Catalog with one pinned (KEPT) quest and a training quest against an unkillable dummy.

**Architecture:** An authored, versioned rules file (`server/special_periods.json`) plus the private wiki catalogue
feed a generator (`server/make-special.js`, run at the end of `make-game-tables.js`). The generator writes master
rows (`stage`, `evStage`, `reward`) and a runtime index (`server/game_data/special.json`). Runtime logic lives in
`server/special.js`, which is pure and unit tested: period from the Shop rotation date, weekday/VIP lock, pin rules,
and the `events[]` builder. `server.js` wires it into `GET /stage/event`, `ret.functionFlags`, `/stage/start|clear`,
`/stage/achievements` and the `/web/special/*` routes. Maps come from `recon/tools/gen_story_maps.py` into
`stage_gen\files\stage`, then a new resource build.

**Tech Stack:** Node (server, plain `node server/test-*.js` tests with `check()`), Python 3 (`python -I`, map and
banner tools), LDPlayer bench (`tools/ldplayer/session/*.ps1`, `D:\Progetto_Restauro_KH_UX\tmp\bench29.ps1`).

**Spec:** `docs/superpowers/specs/2026-10-30-special-tab-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- Docs, comments in new files and commit messages in English. Commits:
  - commit with `git -c safe.directory=* commit -F <file>` and the attribution line;
  - commit and push at every verified step.
- Legal: no SE files, decompiled code or private comms in the repo.
  - `server/game_data/`, `server/master_data/`, banner PNGs and map bins stay local (already ignored).
  - The private catalogue is read from `KHUX_SPECIAL_SRC`, default
    `D:\Progetto_Restauro_KH_UX\private\events\special\special_quests.json`. It is never copied into the repo.
  - Names and dates derived from the wiki may go in versioned JSON, like `server/limited_rotation.json`.
- Every master change: run the generator, then bump the master revision in the 4 session scripts
  (`tools/ldplayer/session/{cycle,relogin,run-server,update-resources}.ps1`, now 213; never lower).
- Bench:
  - Only LDPlayer instance 0; never touch instance 1.
  - Press SKIP on every dialogue.
  - No taps when the game is closed.
  - Battle checks are asked to the user, never judged alone.
- Every deviation has an in-game Notice (`server/routes-info-album.js` `NOTICES`, then
  `node server/export-notices.js` to regenerate `docs/NOTICES.md`).
- `evStage` rows (spec 8):
  - all 38 fields present;
  - `validStageId` = `stageId.length` ≤ 5;
  - the four time fields are dates;
  - `detailUrl` without `?`;
  - no stageId 95100/95200.
- Ids (builder's call, fixed here):
  - special stageIds 970000-979999 (970000 = training quest);
  - `evStage` 7000 = Special Catalog, 7001-7499 permanent entries, 7501-7620 VIP campaigns;
  - stage row `id` = stageId (keeps them out of every story filter `id <= 979`).
- Weekday = `['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][clock.dayIndex(realMs) % 7]`. `DAY0` is Monday 08:00 UTC,
  the same day boundary as the missions.

## Review Focus

1. **Clearing a Special quest must not move story progress.**
   - `respondStageClear` sets `player.lastClearStageId` when the stage `id` is bigger. A Special id 97xxxx would win.
   - Expected: story list, misc 106 unlocks and the home bubble unchanged after a Special clear.
   - Test in Task 5.
2. **A player at a story date before WW launch (JP-only era) or after the last period** must get period 1 / period 5,
   never an empty list or a crash. Test in Task 2.
3. **A pin that becomes invalid** must not show up or crash:
   - catalogue regenerated without that key;
   - the story moves into the pinned quest's period (shown once, no duplicate);
   - VIP lost for a pinned VIP quest (shown locked).
   - Tests in Task 2 and Task 9.
4. **Week rollover while the tab is open**: VIP ends at Monday 08:00 or the weekday changes; the next opening must
   recompute. `/stage/start` of a quest that became locked is still served (the client already let the player in).
   - Expected: no error and normal rewards.
   - Test in Task 5.
5. **The training quest must never leak rewards or gauge**:
   - path A clear after taking the CP chests: `player.keybladeBurst` unchanged, `getLux` 0, no materials;
   - Give Up on path B: gauge unchanged even though the client sends `burst`.
   - Test in Task 11.

---

## Milestone 1: framework + period 4 end to end

### Task 1: Bench spike of the open client questions

Throwaway: no product code is kept. Answers go into `docs/notes/server.md#eventi` as a new bullet «Bench Special
spike».

**Files:**
- Modify: `docs/notes/server.md` (section `eventi`)
- Scratch: `D:\Progetto_Restauro_KH_UX\tmp\special_spike\`

- [ ] **Step 1: Prepare a test save and master**
  - Copy story stage 1040's row into a stage row with stageId 970001, `id` 970001 and `stageBinId` 1040 (Proud
    mechanism, `docs/notes/mappe_storia.md` near line 695), first with `stageKind` 2.
  - Add one `evStage` row 7001 (`eventCategory` 1, `stageId` [970001], fields as in the bench row of 30-10 in
    `docs/notes/server.md`).
  - Write `server/save/event.json` with one event for 7001.
  - Bump the revision to 214.
- [ ] **Step 2: Answer on the bench, one at a time; note each answer with a screenshot name**
  - Q1: does tapping the quest in the Special list send `/stage/start` with `stageId` 970001 and `eventId` 7001, and
    does the map load through `stageBinId`? If not, try `stageKind` 3, then 1 with the stage excluded from
    `respondStageList` (only the server reads `stageKind` there).
  - Q2: can an enemy drop a medal? Set the reward row of one enemy uid in 1040's POI to type 3 (medal 90041 Dewey) and
    send `dropItemTypeIds [3]`. Fallback: put the medal in the `/stage/clear` response `stageRewardUserMedalIds`
    (`{rewardkind, userMedalId, display}`). Note which one shows in RESULTS.
  - Q3: with `functionFlags` 4, check the Shop, home, Missions and Story/Events tabs for visible changes.
  - Q4: banner order on screen = `events[]` order? (Needed for catalogue → KEPT → current.)
  - Q5: `endTime` of a Special banner: is it shown, and how (countdown, date)?
  - Q6: does the quest list of one banner with 3 stages show 3 rows in `stages[]` order?
- [ ] **Step 3: Revert the spike**
  - `functionFlags` back to 0.
  - `evStage.json` back to `[]`.
  - Remove the spike stage row and `server/save/event.json`.
  - Keep revision 214 in the session scripts.
- [ ] **Step 4: Write the answers into `docs/notes/server.md`, commit and push.**

The rest of the plan assumes:
- Q1: `stageKind` K = the value that works.
- Q2: a medal-drop mechanism M = `enemy` or `clearReward`.

### Task 2: `server/special.js` pure logic

**Files:**
- Create: `server/special.js`
- Create: `server/test-special.js`

**Interfaces:**
- Consumes: `clock.dayIndex` (`server/clock.js`).
- Produces (all pure, no player or master access):
  - `PERIODS`: `[{n, name, from, to}]` from `special_periods.json`.
  - `periodOf(day: 'YYYY-MM-DD') -> 1..5`. Before period 1 → 1; after the last → 5.
  - `weekdayOf(realMs) -> 'Mon'..'Sun'`.
  - `isOpen(entry, {weekday, vip, pinned: bool}) -> bool`:
    - `entry.vip` → `vip`;
    - otherwise `entry.days === 'all'` or `entry.days.includes(weekday)`, or `vip`, or (`pinned` and no
      `entry.replacedBy`).
  - `currentEntries(index, {period, shopFrom, shopTo}) -> entry[]`:
    - entries with `periods.includes(period)` and not `removed`;
    - plus campaigns whose `[start, end]` overlaps `[shopFrom, shopTo]` and whose period = `period`;
    - in index order.
  - `pinnable(entry, period) -> {ok: bool, why: 'removed'|'training'|'not-past'|'replaced'|'' }`:
    - past = `Math.max(...entry.periods) < period`;
    - campaigns use their own period.
  - `specialEvents(index, ctx) -> event[]`. `ctx` = `{period, weekday, vip, pinnedKey, shopFrom, shopTo, nowStr,
    dayEndStr, weekEndStr, imgBase, stageState: (stageId) => {score, playStatus, clearMissionIds}}`.
    - Order: catalogue (always open), then KEPT (only if pinnable, not in the current list, not removed), then
      current.
    - Element:
      - `{stages, eventStageId, showIcon: 1, bannerUrl, eventType: 0, status: 1, endTime, newStageId: 0, isLock,
        complete: 0}`;
      - `stages[]`: `{stageId, useAp, score, playStatus, clearMissionIds}`, with `useAp` from `entry.useAp[i]`.
    - Values:
      - `isLock` = 0 if open, 1 if closed;
      - `bannerUrl` = `${imgBase}/web/special/img/${evStageId}${kept ? '-kept' : ''}.png`;
      - `endTime` = `dayEndStr` for weekday-limited open entries, `weekEndStr` for VIP and campaigns, else
        `'2030-12-31 23:59:59'` (builder's call, adjust to the Q5 answer).
  - `resetDue(entry, done: {stageId: clearMissionIds[]}, lastResetWeek, week) -> bool`:
    - for `entry.resetGroup`, true when every stage of every entry in the group has 3 objectives and
      `week > lastResetWeek`;
    - this is the Daily Cid reset at the week start after a full cycle (builder's call).
- Index entry shape (written by Task 3):
  - `{key, evStageId, name, family, periods: [n], days: 'all'|['Mon',…], vip: bool, replacedBy: key|null,
    removed: ''|'no-use', campaign: {start, end}|null, resetGroup: ''|'cid'}`;
  - plus `stageIds: [..≤5]`, `useAp: [..]`.
  - Root: `{catalog: {evStageId: 7000, stageIds: [970000], useAp: [0]}, entries: [...]}`.

- [ ] **Step 1: Write the failing tests in `server/test-special.js`**
  - Use a small inline fixture index (catalog plus 6 entries), not the generated file.
  - `periodOf`:
    - `'2015-11-02'` → 1;
    - `'2016-09-18'` → 1; `'2016-09-19'` → 2;
    - `'2018-05-25'` → 3;
    - `'2020-05-23'` → 4;
    - `'2020-11-16'` → 5; `'2021-06-01'` → 5.
  - `weekdayOf`:
    - `Date.UTC(2026,9,26,9)` → `'Mon'`;
    - `Date.UTC(2026,9,26,7)` → `'Sun'` (before 08:00).
  - `isOpen`:
    - Tue-only entry: open on Tue, closed on Wed, open on Wed with `vip`;
    - VIP entry: closed without vip;
    - pinned Tue-only entry with `replacedBy null`: open on Wed;
    - pinned VIP entry without vip: closed.
  - `pinnable`:
    - an entry with `periods [1,2]` at period 4 → ok;
    - same entry with `replacedBy` → `'replaced'`;
    - `periods [4]` at period 4 → `'not-past'`;
    - `removed 'no-use'` → `'removed'`;
    - catalog → `'training'`.
  - `specialEvents`:
    - first element is 7000;
    - with `pinnedKey` of a past entry, the second element is that entry with `-kept` in `bannerUrl`;
    - with `pinnedKey` of an entry of the current period: it appears once, without `-kept`;
    - with an unknown `pinnedKey`: no KEPT element and no throw;
    - closed entry → `isLock 1`;
    - every element has the 10 keys above;
    - every `stages` item has the 5 keys.
  - `currentEntries`:
    - campaign `2019-07-15..2019-07-21` at shop week `2019-07-15..2019-07-21` → included;
    - at `2019-07-22..` → excluded.
  - `resetDue`: group of 2 entries with all objectives done, `lastResetWeek` 10 → week 10 false, week 11 true.
- [ ] **Step 2: Run `node server/test-special.js`.** Expected: FAIL, `Cannot find module './special'`.
- [ ] **Step 3: Implement `server/special.js`** with the signatures above. `special_periods.json` is loaded lazily
  (`PERIODS` getter) so the tests can run before Task 3 writes the file. Until then the tests pass `periods` in the
  fixture: `periodOf(day, periods = PERIODS)`.
- [ ] **Step 4: Run `node server/test-special.js`.** Expected: `test-special: OK`.
- [ ] **Step 5: Commit** (`feat(special): period, lock, pin and events logic`), then push.

### Task 3: Rules file and generator, period 4

**Files:**
- Create: `server/special_periods.json` (versioned, authored)
- Create: `server/make-special.js`
- Create: `server/test-make-special.js`
- Modify: `server/make-game-tables.js` (call `require('./make-special').patch(OUT)` after `make-proud`)
- Modify: `server/make-story-oltre.js` (export `objectiveReward` next to `objectiveCodes`)

**Interfaces:**
- Consumes:
  - `objectiveCodes(text, ctx)` and `objectiveReward(o, ctx, titleIdx, slot)` from `make-story-oltre.js`;
  - stage K from Task 1.
- Produces:
  - `build(rules, catalogue, masterRows: {stage, enemy, material, medal, reward}) -> {stageRows, evStageRows,
    rewardRows, index}`;
  - `patch(masterDir)`: appends the rows idempotently (drops existing stageIds 970000-979999, `evStage` 7000-7999 and
    its own reward rows), then writes `server/game_data/special.json` (= `index`).
- `special_periods.json` shape:
  - `periods: [{n, name, from, to}]`, with the dates of spec 5.1;
  - `entries`: `[{key, series: [<catalogue quests[].series>…] | quests: [<catalogue quests[].quest>…], name, family,
    periods, days, vip, replacedBy, removed, resetGroup, useAp?: [..], drops: [{type, id, num}]}]`.

- [ ] **Step 1: Author the period-4 entries in `special_periods.json`** from catalogue section 7 and spec 5.1:
  - Daily Cid Mon-Sun: 7 entries, one stage each, `resetGroup 'cid'`, `days` = its day.
  - MOG: A New Keyblade + Kupo Seeds/Leaves/Blossoms/Dew Drops; `days 'all'`; 5 stages in one entry.
  - Evolve Legendary: Mon.
  - EXP & Evolve: Power Tue, Magic Wed, Speed Thu.
  - Munny Legendary: Fri.
  - Skill EXP: Sat-Sun, `useAp [0]`.
  - Permanent VIP set of mid-2020 (section 7): Jewels & Avatar Parts, Medal Quest, Gems, Subslot Medal, Dual Meow
    Wow, Draw Ticket; `vip true`, `days 'all'`.
  - SQ06 Mythril Madness and SQ08 Adamantite get `removed 'no-use'` entries (so the catalogue can show why) with their
    original periods.
  - Drops:
    - from the wiki reward text of each family, as `{type, id, num}` against `material.json` / `medal.json` names;
    - medals use type 3;
    - when no number is given, `num` 1 per drop-carrying enemy;
    - mark the values as reconstructed in a `_note` field.
- [ ] **Step 2: Write `server/test-make-special.js`** against a small inline fixture: a catalogue with 2 series, a
  rules file with 3 entries (one removed), and master rows with one story stage of world 1. Checks:
  - every `evStageRows` row has exactly the 38 field names of the 30-10 bench row;
  - `validStageId === stageId.length` and ≤ 5;
  - the 4 time fields match `/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/`;
  - `detailUrl` is `'/web/special/catalog'` on 7000 and `''` elsewhere;
  - `bannerUrl` = `'/web/special/img/<id>.png'`;
  - `eventCategory 1`;
  - `resetFlag 1` on entries with a `resetGroup`, 0 elsewhere;
  - stage rows have `stageKind K`, `id === stageId`, stageId in 970000-979999, `useAp` from the catalogue `ap` (first
    number of «12 / 20 / 30» for tier I…), `validClearGetItem 0`;
  - objective texts go through `objectiveCodes` (e.g. «Defeat the target enemy within 1 turn» gives the same codes
    as in the story rows);
  - a removed entry gets an index entry but no stage or `evStage` row;
  - `patch` run twice on a temp copy of a master dir gives identical files;
  - no stageId equals 95100 or 95200.
- [ ] **Step 3: Run `node server/test-make-special.js`.** Expected: FAIL (module missing).
- [ ] **Step 4: Implement `make-special.js`.**
  - Each stage row is cloned from the last story row of the same world (as `make-story-oltre.js` picks reference
    rows), with `name`, `useAp`, the objectives and their first-clear rewards, and the enemy level from catalogue
    `level` (as `wikiLv`).
  - `stageBinId` = own stageId (own maps, Task 4).
  - The training row 970000 is created here too:
    - 0 AP;
    - objectives «Defeat the target enemy», «Complete without having to continue», «Defeat Shadow x1»;
    - objective rewards: none if `validSubmission` rows accept a 0 type, else 1 munny (spec 7);
    - name «Training Grounds» (builder's call).
  - Drop reward rows: new rows after the current maximum `rewardId`. Position 0 holds the drop with
    `ENEMY_DROP_TYPE` 5, or type 3 for medals if M = `enemy`.
- [ ] **Step 5: Run the test** (expected `test-make-special: OK`), then `node server/make-game-tables.js` as usual.
  Then:
  - `node server/check-stage-data.js` passes;
  - `node -e` count: `evStage.json` has `1 + period-4 entries` rows.
- [ ] **Step 6: Commit** `feat(special): rules file and generator (period 4)`, then push.

### Task 4: Maps, POI and banner art for the generated stages

**Files:**
- Modify: `recon/tools/gen_story_maps.py`
  - new config key `"special"`: path to a JSON list `[{stageId, world, name, target, enemies: [names], treasures:
    [], rooms: 1}]`;
  - one MAP part per stage, same placement rules, output `mappoi_stg<stageId>.bin` + `_00.bin`.
- Modify: `recon/tools/stage_poi.py` (include 970000-979999)
- Create: `recon/tools/make_special_banners.py`
- Create: `recon/tools/test_make_special_banners.py`
- Modify: `server/make-special.js` (also writes `server/game_data/special_maps.json` for the generator)

**Interfaces:**
- `special_maps.json` entry: `{stageId, world, name, target, enemies, treasures: [], rooms: 1}`.
  - `enemies` = the target name ×3 groups, the drop carriers (builder's call: Growth Egg for EXP and so on, from
    catalogue `target`).
- Banner files: `server/game_data/special_img/<evStageId>.png` and `<evStageId>-kept.png`, 640×140.

- [ ] **Step 1:** Extend the existing tests of `gen_story_maps.py` (or add `test_gen_story_maps_special.py`) with one
  special entry. Check the output part exists, the target is in the farthest area, and `validate_maps.py` passes.
  Run: FAIL, then implement, then PASS.
- [ ] **Step 2:** Generate the maps into `D:\Progetto_Restauro_KH_UX\stage_gen\files\stage` and regenerate
  `server/game_data/stage_poi.json`. Check that each period-4 stageId has a POI entry with ≥ 1 enemy.
- [ ] **Step 3: Banner art.**
  - Search the original Special banners first (khuxwiki file pages, `reference\`, memory «style from originals») and
    save the found ones under `reference\special_banners\`.
  - `make_special_banners.py` resizes originals to 640×140. For entries without an original it draws a plate in the
    style of `make_banner_images.py`: quest name, family colour.
  - The `-kept` copy carries the KEPT badge of the Shop (`KEPT_STYLE` in `server/gacha.js`).
  - Test: output size 640×140 for both an original and a generated plate.
- [ ] **Step 4:** Build resources (`tools/ldplayer/session/build-resources.ps1`, new version 82). Check that the
  index lists the new `mappoi_stg97*` files.
- [ ] **Step 5: Commit** the tools and tests (no bins or PNGs), then push.

### Task 5: Server wiring

**Files:**
- Modify: `server/server.js`:
  - `ret()` line ~333;
  - `respondStageEvent` ~3803;
  - `servedMasterRows` ~517;
  - `respondStageStart` ~1726;
  - `respondStageClear` ~2122;
  - `respondStageAchievements` ~4025;
  - the route table near line 159.
- Create: `server/test-special-server.js` (pattern of `server/test-moogleshop.js`: temp save, `_test` exports,
  `Date.now` stub)

**Interfaces:**
- Consumes:
  - `special.*` from Task 2;
  - `game_data/special.json` from Task 3;
  - `storyCtx()` (`shopFrom`, `shopTo`), `vipActive()`, `stageClearMissions()`, `serverTimeAt()`, `clock.dayEnd`,
    `clock.weekEnd`.
- Produces:
  - `specialIndex()`: memoised read of `special.json`; `{catalog: null, entries: []}` if missing, logged once.
  - `specialCtx(realMs)`: the `ctx` for `special.specialEvents`. `period = special.periodOf(storyCtx().shopFrom)`;
    `pinnedKey = player.special?.pinned`.
  - `isSpecialStage(stageId) -> bool`: stageId in 970000-979999.
  - `_test` export of `respondStageEvent`, `specialCtx`, `isSpecialStage`.

- [ ] **Step 1: Write `server/test-special-server.js`.**
  - At a story save of quest ≥ 6 and the real date 2026-10-27 (Tuesday 09:00 UTC), `respondStageEvent` with `{
    eventCategory: 1 }` returns `events[0].eventStageId === 7000`.
  - The Tuesday EXP & Evolve Power entry has `isLock 0`; the Monday Evolve Legendary entry has `isLock 1`.
  - With `KHUX_VIP=1`: both are `isLock 0`.
  - `ret().functionFlags === 4`.
  - `respondStageEvent` with `{ eventCategory: 2 }` (Events) returns `events []`.
  - `respondStageClear` after `/stage/start` of a special stage:
    - `player.lastClearStageId` unchanged (Review Focus 1);
    - `respondStageList` unchanged;
    - `player.stageScores[stageId]` set.
  - Week rollover (Review Focus 4): `/stage/start` of the Tuesday quest, `Date.now` moved to Wednesday 09:00, then
    `/stage/clear` → status 0 and objective rewards granted.
  - `servedMasterRows('evStage')` has absolute `bannerUrl`/`detailUrl` starting with `WEB_BASE`.
  - `/stage/achievements` `strengthNumerator`/`strengthDenominator` = objectives done / 3 × stages of the current
    open entries, not counting the training quest (builder's call for I-037; 0/0 never sent: if no entries, 0/1 as
    today).
  - Medal drops with M from Task 1: one enemy-drop uid of a Special stage grants its medal in `player.medals`.
- [ ] **Step 2: Run `node server/test-special-server.js`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `respondStageEvent(res, body)`:
    - when `Number(body?.eventCategory) === 1` and quest ≥ misc 122: `special.specialEvents`;
    - otherwise the old `event.json` path, kept for tests.
  - `ret().functionFlags` = 4 when the index has entries, else 0. Recheck with the Task 1 Q3 answer; if bit 4
    changes another screen, note it as a known side effect in the Notice.
  - In `respondStageClear`, guard the `lastClearStageId` update with `stage?.stageKind === 1`, the story only. This
    replaces the Proud check, which stays implied.
  - Medal drops per M:
    - `enemy`: extend the drop grant loop to type 3;
    - `clearReward`: fill `stageRewardUserMedalIds` with the granted medals.
  - Daily Cid reset: in `specialCtx`, when `special.resetDue(...)`, clear `player.clearMissions` for the group's
    stages and set `player.special.cidReset = week`.
- [ ] **Step 4: Run** `node server/test-special-server.js` and the existing suites touched by `server.js`. Expected:
  all print `OK`.
  - Suites: `test-moogleshop`, `test-gacha-server`, `test-achievements`, `test-limited`, `test-skip`,
    `test-story-oltre`, `test-proud`, `test-notices`.
- [ ] **Step 5: Commit** `feat(special): serve the Special tab`, then push.

### Task 6: Notices and the bench check of period 4

**Files:**
- Modify: `server/routes-info-album.js` (`NOTICES`)
- Modify: `server/test-notices.js`
- Regenerate: `docs/NOTICES.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Test first.** In `test-notices.js`, assert an IMPORTANT notice titled «Special Quests» whose body
  matches each of these:
  - `/follows your Story/`;
  - `/Special Catalog/`;
  - `/one quest/`;
  - `/Weekly Missions/` (VIP);
  - `/Adamantite Ore Challenge/` and `/Mythril Madness/` with `/no use/`;
  - `/Unlock All/` with `/no function/`;
  - `/training/` with `/Give Up/`;
  - `/reconstructed/` (drops).

  Run: FAIL.
- [ ] **Step 2:** Write the notice (spec 9), dated with the build day, then run the test (PASS) and
  `node server/export-notices.js`.
- [ ] **Step 3: Bench** (revision +1, resources 82 with `update-resources.ps1`, KHUX START + Download, then
  `relogin.ps1 -Save maxpower`). Use a real date on a Tuesday and one on a Saturday, with and without `KHUX_VIP`. Check:
  - catalogue banner first;
  - period-4 list;
  - locked banners with padlock and «Unlock All»;
  - Details opens the catalogue URL (a 404 page is fine until Task 8);
  - one weekday quest played end to end: AP spent, drops in RESULTS, objectives ticked, list and story progress
    unchanged;
  - Special progress counter on the Quests screen;
  - Notices text.

  Ask the user for the battle check.
- [ ] **Step 4:** Update `HANDOFF.md` (rev, resources, state), commit, push.

## Milestone 2: the other periods

### Task 7: Periods 1, 2, 3 and 5 in the rules file

**Files:**
- Modify: `server/special_periods.json`
- Modify: `server/test-make-special.js`
- Create: `server/test-special-periods.js` (runs against the real `special_periods.json` plus the real catalogue
  when `KHUX_SPECIAL_SRC` exists, else skips with a message)

- [ ] **Step 1: Write `test-special-periods.js`.** Checks:
  - every period 1-5 has ≥ 1 non-VIP entry;
  - every `replacedBy` points to an existing key with a later first period;
  - no entry of family SQ10, SQ20 or SQ25 (JP-only, spec 2);
  - SQ06/SQ08 entries are all `removed 'no-use'`;
  - period 5 has no Daily Cid entry and has the 4 «Day of the Weekly Quest» entries;
  - period 5 holds the period-4 free entries except Daily Cid (spec 5.3);
  - Keyblade Materials (SQ07) entries have `replacedBy null`;
  - the separate 2016 EXP and Evolve entries have `replacedBy` = the 2018 EXP & Evolve keys (spec 6);
  - every catalogue `series`/`quest` named in the file exists in the catalogue.

  Run: FAIL.
- [ ] **Step 2: Author the entries** from catalogue sections 3, 4 and Appendix A:
  - weekday sets of periods 1-3;
  - MOG weekends in period 2, every day from period 3;
  - Skill: VIP in periods 1-2, free Sat-Sun from period 3;
  - Daily Cid: VIP from 2016-05-19 within period 1, free from period 2's 2017-04-20. Split period 2 by giving the
    entries a `from` date that `currentEntries` also checks against `shopFrom`: add `from`/`to` optional entry
    fields, and add their test to `test-special.js`;
  - the recurring VIP set of period 3 from 2018-10;
  - Upgrade Quests VIP from 2016-06-16.

  Run both tests: PASS.
- [ ] **Step 3:** Regenerate the master and maps (Task 3 step 5, Task 4 steps 2 and 4 for the new stages), then a new
  resource version and a revision bump.
- [ ] **Step 4: Bench:** one save per period, using `relogin.ps1` with saves at quests that map to each period (pick
  from `catalog.story` dates). Check the list per period and one quest each. Ask the user for battle checks.
- [ ] **Step 5: Commit**, then push.

## Milestone 3: Special Catalog and pinning

### Task 8: Catalogue page `/web/special/catalog`

**Files:**
- Create: `server/special-pages.js` (`catalogPage(index, ctx) -> html`, `bannerImage(file) -> Buffer|null`)
- Create: `server/test-special-pages.js`
- Modify: `server/server.js` (routes `/web/special/catalog` and `/web/special/img/<id>(-kept)?.png`, GET kind
  `specialweb` next to `gachaweb`)

**Interfaces:**
- Consumes: `special.pinnable`, `special.isOpen`, `specialCtx`.
- Produces:
  - `catalogPage(index, {period, pinnedKey, vip}) -> string`;
  - each quest row has `id="q<evStageId>"`, its period header, its status text, and a button
    `data-pin="/web/special/pin/<evStageId>"` or `data-pin="/web/special/unpin"`.
- Style: the Shop catalogue CSS and the `khuxPin` script of `server/gacha.js` (copy the pattern; do not import the
  Shop page code).

- [ ] **Step 1: Tests.** `catalogPage` for period 4 with a pinned period-2 Keyblade Materials entry:
  - five period sections in order;
  - the current period is marked «Now»;
  - later periods have no pin button and the text «Reached later in the Story»;
  - a replaced entry shows «Replaced by <name>» and no button;
  - a removed entry shows «Not restored: its materials have no use in this version»;
  - the pinned entry shows «Remove from Special»;
  - a pinnable one shows «📌 Keep in Special» and «Replaces: <pinned name>»;
  - a VIP entry shows «VIP only».

  Run: FAIL.
- [ ] **Step 2:** Implement, then run: PASS.
- [ ] **Step 3: Commit**, then push.

### Task 9: Pin routes and the KEPT banner

**Files:**
- Modify: `server/server.js`:
  - `respondSpecialPost(res, url)`, next to `respondGachaPost`;
  - POST routing for `/web/special/pin/<id>` and `/web/special/unpin`.
- Modify: `server/test-special-server.js`

**Interfaces:**
- Produces:
  - `POST /web/special/pin/<evStageId>`: 200 `{ok: true}`, or 409 `{ok: false, why}` with the `pinnable` reason
    text, or 404 for an unknown id;
  - `POST /web/special/unpin`: 200 `{ok: true}`;
  - storage: `player.special.pinned = key`.

- [ ] **Step 1: Tests.**
  - Pinning a past Keyblade Materials entry → 200. The next `respondStageEvent` has it second, with `-kept` and
    `isLock 0` on a day that is not its weekday.
  - Pinning a replaced entry → 409 and `player.special.pinned` unchanged.
  - Pinning a second entry replaces the first.
  - Unpin removes it.
  - Review Focus 3:
    - set `player.special.pinned` to a key that is not in the index → no KEPT element and no throw;
    - a pinned VIP entry without VIP → KEPT element with `isLock 1`.

  Run: FAIL.
- [ ] **Step 2:** Implement, then run: PASS.
- [ ] **Step 3: Bench:**
  - open Details → catalogue → pin → close → reopen Special: the KEPT banner is right below the catalogue;
  - play it on another weekday;
  - unpin.

  Then commit and push.

## Milestone 4: training quest

### Task 10: Two-path map with the dummy and the CP chests

**Files:**
- Modify: `recon/tools/gen_story_maps.py`
  - special entry key `"training": true`;
  - two areas from the start: path A ends at the Shadow target arena, path B ends at the dummy group;
  - CP chests on path B before the dummy, with the dummy group visible from the start where the room allows
    (spec 7).
- Modify: `server/make-special.js` (dummy enemy row and the CP chest reward row)
- Create: `recon/tools/test_gen_training_map.py`

**Interfaces:**
- Dummy enemy:
  - a new `enemy` row copied from an existing large Heartless (builder picks from `enemy.json`; e.g. Large Body);
  - `hp` = the largest value the client accepts (check the type used by the story rows above Lv 999, I-206: 979 =
    6.5e11);
  - no drop;
  - self-heal only if an existing enemy attack row with a heal effect can be attached (I-207 enemy mechanics notes),
    otherwise HP only (spec 7).
- CP chests: reward row with type 8 entries, enough to fill the largest `keyblade.maxBurstGauge` × 10000; chest
  count = ceil(max gauge / per-chest CP).

- [ ] **Step 1: Test** the map on a two-path config:
  - path A target and path B dummy groups are in different areas;
  - both are reachable (`validate_maps.py`);
  - chests sit on the path-B side (geodesic distance to the dummy < to the target);
  - the start is closer to the two branch points than to either end.

  Run: FAIL, implement, then PASS.
- [ ] **Step 2:** Generate, build resources, bump the revision, commit and push.

### Task 11: Training quest server rules

**Files:**
- Modify: `server/server.js` (`respondStageStart`, `respondStageClear`, `respondStageContinue`: a `TRAINING_STAGE_ID
  = 970000` guard)
- Modify: `server/test-special-server.js`

- [ ] **Step 1: Tests** (Review Focus 5). Start 970000, then `/stage/clear` with `burst 120000`, `getPoint {lux:
  500, money: 300}`, `getMaterials [...]` and `getEnemyDropItems [...]`:
  - `player.keybladeBurst` unchanged;
  - lux, money and materials unchanged;
  - `getLux 0`;
  - objectives recorded;
  - AP unchanged.

  Also `/stage/retire` with `{burst: 0}` on 970000 → gauge unchanged.

  Run: FAIL.
- [ ] **Step 2:** Implement the guard: skip `setKeybladeBurst`, money, materials, drops, lux, the mission counters
  (`missionCount`, `weeklyLux`), skill EXP and objective rewards. Keep the score and the objectives.
- [ ] **Step 3: Bench** (ask the user for the battle check):
  - path B: chests fill the gauge, the dummy survives, then Give Up;
  - path A: the Shadow clears and RESULTS shows no Lux;
  - a real quest after both starts with the old gauge.

  Then commit and push.

## Milestone 5: VIP campaigns (after the permanent quests)

### Task 12: The 120 WW week-limited VIP campaigns

**Files:**
- Modify: `server/make-special.js`
  - campaign entries 7501-7620 from catalogue `vip_limited_campaigns_ww`;
  - key `C<notice>`;
  - period from the start date;
  - `vip true`;
  - `campaign {start, end}`.
- Modify: `server/special_periods.json` (`campaigns: {<key>: {quests: [...], drops / objectives}}` for the campaigns
  whose content is known from the notices; the others get one generic quest of their theme, builder's call, listed
  in the Notice)
- Modify: `server/test-make-special.js`, `server/test-special.js`

- [ ] **Step 1: Tests.**
  - 120 campaign rows;
  - each appears only in its rotation week (`currentEntries` with `shopFrom` inside and outside);
  - pinnable only from a later period and only playable with VIP.

  Run: FAIL, implement, then PASS.
- [ ] **Step 2:** Generate maps, resources and revision; bench one campaign week with `KHUX_VIP=1`; update the
  Notice; commit and push.

---

## After each milestone

- Update `HANDOFF.md` and the README phase row if a sub-project completes (memory «README status»).
- At ~40% context: no new task. Commit, update HANDOFF, ask the user to `/compact`.
