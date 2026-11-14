# Events, Part 6: Boosters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boosters exist on the server and every Booster that a served source paid in the original is paid:
- the Boosters already recorded in `player.pendingBoosters` are granted;
- the event quests whose only reward was a Booster (`boosterOnly`) are served;
- the Event Boards held for a Booster cell are served whole;
- the Booster cells of the raid boards (I-227) come back.

A Booster shows in the profile «Boosters» dialog with its expiry date, puts the light-blue «+N%» plate on the Medal Details screen, and raises the damage of the medals it targets until it expires.

**Architecture:**
- The 4.3.1 client already has the whole Booster feature: the `Emblem` master table, the `emblemIds[]` field in the stage clear, board update, shop and login responses, the Boosters dialog (I-123, JP layouts already served) and the Medal Details plate (`MedalInfo_Information2_ver240`: `Area_Emblem_Plate`, `Txt_Emblem_Plate`, `Emblem_Icon`, art `MD_Emblem*.png` in the WW resources). Battles are computed by the client, so **the damage bonus is applied by the client** from the emblem rows of the owned ids. The server only builds the rows, keeps what the player owns, and sends the active ids.
- The donated WW emblem table (640 rows) has names, descriptions, image and sort ids, but its effect fields were lost (all 0, `endTime` 2099). Task 1 learns their encoding from the client; Task 2 rebuilds each effect from its description; Task 3 writes the rows.
- A new `server/boosters.js` owns `player.boosters`, the grant, the expiry and `emblemIds`. Event quests, Event Boards and raid boards pay type 34 through it.

**Tech Stack:** Node server (`server/`), private Python builders (`python -I`) under `D:\Progetto_Restauro_KH_UX\tmp\events\boosters\`, private Ghidra project of the WW 4.3.1 client (`recon/ghidra/*.py` scripts; outputs stay private), LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-06-events-design.md`. Read part 6 of «The work, in parts» («Emblem rows with effects rebuilt from the descriptions and notices, `emblemIds` in the responses, the Boosters screen, the damage bonus; the Booster challenges; closes I-227»), «Values» (unknown rewards: nothing invented) and «Notices (mandatory)» («Boosters rebuilt from their descriptions»).

**Earlier plans:** `2026-11-06-events-part1-framework.md` .. `2026-11-10-events-part5-orgxiii.md` (Part 3: held boards; Part 4 Task 4: `boosterLater`, `boosterOnly`, `player.pendingBoosters`).

**Issues:** `docs/ISSUES.md` I-166 (Event Boosters, user request 19-10), I-227 (raid board Booster cells), I-245 (events), I-123 (Boosters button).

**Field notes:** `docs/notes/events.md` («Part 3 summary», «Part 4 summary», «Part 5 summary»: held boards, `boosterOnly`), `docs/notes/home_profilo.md` («Boosters», the dialog's element names), `docs/notes/raid.md` (Boosted medals, `boards.unmatched`).

## What is known and what is not

Private evidence (local only, facts only in the repo): `D:\Progetto_Restauro_KH_UX\reference\boosters\` (notices `booster_notices.txt`, khuxwiki `booster_wiki.txt`, GameFAQs thread 76528964, `NOTE.txt`), the donated table `D:\Progetto_Restauro_KH_UX\private\donations\relux_2026-11\verified\emblem_boosters.json`.

**Known (source):**
- A Booster raises the damage of the medals it targets; there is nothing to use or activate: it works as soon as it is obtained (notice 34270, «Introducing Boosters», v2.4.0, 2017-11-09; khuxwiki Booster).
- It loses its effect at a fixed date and time, not after a duration; each event's notice states it, usually the end of the month (notices 33889, 34473, 46006: Booster Set until 2018-11-30; 54258: until 2019-06-30; 67361; khuxwiki table «Effective Until»).
- Several Boosters of the same attribute stack (notice 34270; GameFAQs thread 76528964). No cap is known.
- The profile «Boosters» button lists them with effect and expiry; the Medal Details screen shows the Booster percentage (notice 34270; video Z_JRaJF7GbQ at 9:54: cyan «+25%» with an arrow after the guilt, P Booster +25% on Supernova - Sephiroth).
- A Copy special attack that copies a Power medal gets the P Booster (notice 34270).
- The shown special attack multiplier does not include the Booster (`NOTE.txt`: 9.54-14.36 x 3.30 = notice 50644 value).
- Kinds, from the 640 donor names and descriptions (verdict «PARTLY»: names, descriptions and months consistent with the notices 40/40):
  - attribute: «P/S/M SP Attack +N%» (N = 3, 5, 6, 10, 25, 30 ...);
  - Upright / Reversed (Booster [Final Form Sora] for Upright medals, notice 36855; [Darkside] and [Master Xehanort] for Reversed medals, notices 34673, 35535);
  - medal group: «<Group> SP Attack +N%» or «<Group> Medal SP Attack +1%» (Pongo, Pooh, Santa Sora, Donald, Mickey, Sora & Stitch, Sora & Peter Pan, Toy Story, Incredibles 2, TWEWY ...);
  - keyblade: «+0.10 with all-attribute match in <Keyblade> slots 1-5» (Lady Luck, Treasure Trove, Starlight, Olympia ...; notice 54898: the keyblade slot multiplier rises when the slot attribute matches the medal attribute).
- Where they came from: event quest objectives (Booster Challenges 2017-18, EV-0624 Booster [Mickey], EV-1217 «Get Yourself a Booster» P/S/M +30%); Event Board cells (rewardSelect 34; 2018-10 P/S/M boards, all 19 boards of 2019-12 «... Booster», notice 60375); raid boards (HD Vanitas (EX+) +5%, April 2018); Union Cross Cross Boards; login campaigns (Booster [Toy Story] 42094, Keyblade Booster 54898/55356); Jewel Booster Boards (54258, 3,000 Jewels) and Avatar Coin Booster Boards (71743).
- Client 4.3.1: `Emblem` has 16 fields (`emblemId, imageId, sortId, name, description, category, attribute, source, keybladeCategory, slot1..slot5, upperParam, endTime`, `recon/out/master_fields_ww431.txt`); reward type 34 is the emblem icon `img/ui/emblem/Emblem_%d.png` (`home_profilo.md`). The WW resources lack `Emblem_%d.png`; JP 4.3.1 has them (`risorse_layout.md`).
- Today: 4 served quests record a Booster (EV-0556 Treasure Trove Booster +0.60; EV-0624 Booster [Mickey] +5/+10/+25%); 5 quests are held `boosterOnly` (EV-1217 1/5..5/5); 30 Event Boards are held (265 Booster cells: all 19 of 2019-12, 3 of 2018-10, both boards of 2019-04 / 06 / 10, 2 of 2019-02) with any board chained behind them, their coins kept since Part 3; the raid board `WW-E38970-1:ev1-booster-hd-vanitas-ex-both` leaves off 3 cells, and the JP board of JP-D-2018-01-15 leaves off «Booster [Final Form Sora] +5%» (`raid_config.json` `boards.unmatched`).

**Unknown (to settle in Task 1 or to ask):**
- The encoding of `category`, `attribute`, `source`, `keybladeCategory`, `slot1..5`, `upperParam` (which value means P, Upright, a medal group, a keyblade; whether `upperParam` is the percentage, in what unit).
- Whether the bonus multiplies the special attack damage only (the donor descriptions say «SP Attack») or all the medal's damage (the wiki says «damage dealt by specific Medals»).
- Whether the client drops an expired id by `endTime` itself, or only shows it.
- Whether two grants of the same `emblemId` can coexist in `emblemIds`.
- Which medals a group Booster covers (a field of the medal master, or a list in `source`).
- The expiry of the Boosters whose notice is not in the archive.
- Whether a stage row objective of type 34 and a type-4 board cell of type 34 render in the client (objectives popup, clear screen, board popup).

## Global Constraints

- Everything in the Part 2..5 Global Constraints still applies:
  - worldwide only;
  - the order of trust: notice > khuxwiki > donor after cross-check > JP twin > reconstruction;
  - labels with `reconstructedWhy`, declared in the «Events» notice, which reads its counts from `events.json`;
  - append-only ids in `event_ids.json`, and no SE data in the repo (`server/master_data` and `server/game_data` are git-ignored; donor names, descriptions and notice texts stay private, the repo keeps parsers, rules and facts with their notice ids);
  - the bench rules: relogin only, the AppAlive guard, SKIP every dialogue, and the revision only goes up;
  - the master regen command in HANDOFF, and commit plus push for each step, always after `git pull --rebase`.
- **Client code stays private.** Ghidra outputs, decompiled code and addresses never enter the repo; `docs/notes` gets only the behaviour learned («field `attribute` 1 = Power»).
- **Nothing half-served (user, 08-11).** A Booster whose effect cannot be encoded is not served: its quest stays held, its board stays held, its cell stays declared in `boards.unmatched`. Never a stopgap effect, never a «close enough» group.
- **No stopgaps.** No server-side damage, stat or medal change stands in for a Booster. If the client does not apply emblem rows, stop and ask the user (Task 1 gate).
- **Notices for every deviation** (expiry rule, pending Boosters granted late, rebuilt effects). Never the word «restored».
- **Rewards:** a Booster is paid once per quest objective, first-clear slot and board cell, like any other one-time reward; a replay, a rerun sharing the stage row, or the Event Catalog never pays it again.
- **Ids:** emblem rows use the donor `emblemId` (original ids, 6..2102119); a Booster with no donor row is not invented. No new stage, evStage or board id ranges; the held quests and boards keep the ids `event_ids.json` already gave them.
- **Memory:** if the host kills a resources build or `update-resources`, stop. Report, free memory and resume. No tap after a kill.
- **Out of scope** (each gets its emblem rows when its own part serves the source):
  - Union Cross Cross Board Boosters (Union Cross area);
  - login-campaign Boosters (Booster [Toy Story], the Keyblade Boosters of July / August 2019): Part 9;
  - Jewel Booster Boards (June 2019) and Avatar Coin Booster Boards (December 2020): Part 7;
  - the Booster Challenges of 2017-11..2018-03 (data hole, no quest rows yet): Part 10.

## Builder's calls (to confirm at review)

**User decisions (14 November 2026).** All eight calls are approved. Before Task 1, the original Booster data is searched in
every source we hold (private `tmp\eventsoosters\SOURCES_SEARCH.md`): original rows with real effect values would replace
call 4 (effects rebuilt from descriptions) for the Boosters they cover.
Search result (14-11): no source holds an original `Emblem` row with effect values (the donated 640 rows are the only
ones; every effect field 0). Evidence of the encoding for Task 1: `medal.source` (int[3], `validSource`) carries Booster-group
codes by month (e.g. 181101 Mickey, 190530 Sora & Stitch, 191001 Graveyard), likely the value of `Emblem.source`;
`keyblade.category` has one id per keyblade Booster family, likely `keybladeCategory`; the `emblemIds` parser keeps
duplicates; the JP Emblem panel shows a countdown from `endTime`.

Task 2 decisions (user, 14 November 2026): (a) group Boosters: the served medal rows get the donor medal master's Booster-group codes (medal.source entries after the first, matched by medal name; entry 0 unchanged), so the client finds the group's medals; (b) the raid board Booster cells known only by name take distinct donor ids of that name, lowest first (label boosterIdByName).

1. **The client applies the bonus.** The server sends rows and ids, the client computes the damage, the Medal Details plate and the dialog. Task 1 proves it on the bench with one hand-made row before anything else is built; if the client ignores it, the part stops and the user decides.
2. **Expiry under the story-week calendar.** Proposal: each Booster lasts, from the moment it is obtained, as many days as its original span: original expiry minus the original start of the event (or board window) that paid it. A Booster from a story-week event then behaves almost as in the original (P Booster +25% of 2017-11-09: 21 days), and one from a kept event is not dead on arrival. Declared: in the original a Booster obtained late in its event lasted less. The «Expires» date the client shows is the per-player `endTime` of the served row (`clock.fakeString`, as mission `endDate`).
   - Rejected: (a) the expiry mapped onto the story calendar (a Booster from a kept past event would arrive already expired); (b) never expiring like the event coins (years of Boosters would stack without end).
3. **The recorded `pendingBoosters`** are granted at the first login after Part 6, with a full span counted from that login (call 2), directly as in the original (no Present); one log line each. A pending name with no built row stays pending.
4. **Effects from descriptions.** Each served Booster gets its effect from its description by the encoding of Task 1, label `boosterEffect` (declared «rebuilt from its description»). A description outside the grammar, or a group whose medals no source lists, holds the Booster (reason `boosterEffectUnknown`) and what pays it.
5. **Expiry dates.** From the notice that announced the Booster; else the khuxwiki «Effective Until»; else the end of the window of the event or board that paid it (label `boosterExpiryWindow`, declared). Never from the id month alone.
6. **Stacking.** Different Boosters stack (the client sums them). The same `emblemId` is owned once: a second grant of the same id (the same Booster in two quests) renews its expiry instead of adding a copy, unless Task 1 shows the client sums duplicates in `emblemIds` (then ask).
7. **Payment path.** Where Task 1 shows the client renders type 34, the Booster is written as type 34 in the stage row and board cell, so the objectives popup, clear screen and board show it as in the original; the server grants it through `boosters.js`. Where it does not render, ask the user before serving that path.
8. **Icons.** The Booster icons are the JP 4.3.1 `Emblem_<imageId>.png`, added to the generated resource pack; shown to the user before serving. An `imageId` with no JP file is asked about, never drawn.

## Review Focus

- **A Booster past its expiry.**
  - Expected: not in `emblemIds` of any response, gone from the Boosters dialog, no plate on Medal Details; `player.boosters` keeps the record (so it is never paid again).
  - Pinned in Task 4 (`expired_not_sent`, `expired_never_regranted`).
- **The same objective cleared again** (replay, a rerun sharing the stage row, the kept event in the Event Catalog).
  - Expected: no second grant and no renewed expiry.
  - Pinned in Task 5 (`booster_objective_once`, `shared_rerun_booster_once`).
- **An old save with `pendingBoosters` naming a Booster that is not built** (e.g. the keyblade «Treasure Trove Booster +0.60» if keyblade effects stay unknown).
  - Expected: it stays in `pendingBoosters`; the built ones are granted once; the save is written only when something was granted.
  - Pinned in Task 4 (`pending_unbuilt_kept`).
- **A held board set that now opens, with the coins kept since Part 3.**
  - Expected: the balance on screen is the kept balance; Board 2 stays locked until Board 1 is complete; each Booster cell pays once.
  - Pinned in Task 5 (`held_set_served_with_kept_coins`).
- **Another player's profile** (`PUT /emblem/list` with a `userId` other than 1).
  - Expected: an empty list, as `respondPassiveList` does.
  - Pinned in Task 4 (`emblem_list_other_profile_empty`).

---

### Task 1: Client spike: emblem fields, damage, expiry (user gate)

**Files:**
- Create (private): `D:\Progetto_Restauro_KH_UX\tmp\events\boosters\spike\FINDINGS.md`, the Ghidra outputs beside it.
- Modify: `docs/notes/events.md` (new section «Boosters: client behaviour (Part 6, Task 1)», behaviour only).

- [x] **Step 1:** In the private Ghidra project of the WW 4.3.1 client, find the readers of the `Emblem` master fields (vtable in `recon/ghidra/out/ww431/master_vtables.json`) and of `emblemIds`, with `khux_refs.py` / `khux_decomp_at.py`. Record in `FINDINGS.md`, per field: what the battle, the Medal Details plate and the Boosters dialog do with it; whether `endTime` is compared with the server time; whether duplicates in `emblemIds` add up; whether the bonus applies to the special attack or to all damage.
- [x] **Step 2:** Bench, master revision +1 with a test-only overlay of 3 hand-made rows (a P row by the Step 1 encoding, an Upright row, a keyblade row), not committed, and a save `boost0` with their ids in `emblemIds`.
  - Expected frames `D:\Progetto_Restauro_KH_UX\screenshots\t6s_*.png`: the dialog with name, description and «Expires»; the cyan «+N%» plate on a P medal and none on an S medal; the same special attack on the same enemy with and without the row (damage numbers).
  - Also a stage row objective of type 34 and a type-4 board cell of type 34: popup, clear screen, board popup.
- [x] **Step 3:** Write the behaviour in `docs/notes/events.md`. **Show the user** `FINDINGS.md`, the frames and the eight builder's calls; wait. If the client does not apply the bonus, stop here.

### Task 2: Booster records (private)

**Files:**
- Create: `D:\Progetto_Restauro_KH_UX\tmp\events\boosters\build_boosters.py`, `boosters.json`, `CROSSCHECK.md`, `MISSING.md`, `REPORT.md`.

**Interfaces:**
- Produces `boosters.json`: `{boosters: [{emblemId, name, imageId, sortId, effect: {kind: 'attribute'|'orientation'|'group'|'keyblade', attribute?, orientation?, group?, medalIds?, keyblade?, slots?, value}, expiry: {date, source: 'notice'|'khuxwiki'|'window', noticeId?}, start, sources: [..]}], unbuilt: [{name, reason, why}]}`, emblem fields encoded by the Task 1 findings in `effect.fields` `{category, attribute, source, keybladeCategory, slot1..slot5, upperParam}`.
- The scope list: every Booster name in `events.json` quests (`boosters`, `boosterOnly`), in the held Event Board cells (`event-boards.js` report, rewardSelect 34), and in `raid_config.json` `boards.unmatched`.

- [ ] **Step 1:** Build the scope list from the live `events.json`, a dry `event-boards.js` report and `raid_config.json`. Expected: 4 recorded + 5 `boosterOnly` quest Boosters, the 265 Event Board cells, 2 raid board Boosters (HD Vanitas (EX+) +5%, Final Form Sora +5%).
- [ ] **Step 2:** Match each name to a donor emblem row (exact name; a board cell by its donor `rewardId`). Parse its description into `effect` (Builder's call 4). Record in `CROSSCHECK.md` the notice and khuxwiki line behind each value.
- [ ] **Step 3:** Date each expiry and start (Builder's call 5). A group Booster lists its medals from the source Task 1 found; none: `unbuilt` with `boosterEffectUnknown`.
- [ ] **Step 4:** Run the builder twice. Expected: byte-identical output. Write `REPORT.md`: Boosters per kind, per expiry source, unbuilt with reasons. **Show it to the user**; wait.

### Task 3: Emblem rows in the served master

**Files:**
- Create: `server/make-emblems.js` (reads the private `boosters.json` path from `KHUX_BOOSTERS` or the default `D:\Progetto_Restauro_KH_UX\tmp\events\boosters\boosters.json`; writes `master_data/emblem.json` and `game_data/boosters.json` (`{byName, byId}` index with span and labels)).
- Modify: `server/make-game-tables.js` (call `make-emblems` after `make-boosted-medals`), `server/server.js` `servedMasterRows('emblem', realMs)` (per-player `endTime` from `player.boosters`, `clock.fakeString`; an unowned row keeps a far date).
- Test: `server/test-make-emblems.js`.

**Interfaces:**
- Produces `makeEmblems(boosters) -> {rows, index}`; `game_data/boosters.json` `{byName: {name: emblemId}, byId: {emblemId: {name, spanDays, labels}}}`.

- [x] **Step 1: Write the failing tests:**
  - `row_fields_from_effect`: a P +25% record gives a row with the 16 client fields in order and the Task 1 encoding.
  - `unbuilt_not_written`: an `unbuilt` name has no row and no index entry.
  - `span_days`: start 2017-11-09, expiry 2017-11-30 gives `spanDays` 21.
  - `served_end_time_per_player` (test-master-clock style): an owned Booster's served `endTime` equals `clock.fakeString(until, offset)`.
- [x] **Step 2:** Run `node server/test-make-emblems.js`. Expected: FAIL (module missing).
- [x] **Step 3:** Implement. Rows sorted by `sortId`; no row without a record.
- [x] **Step 4:** Run it and `node server/test-master-clock.js`. Expected: OK. Commit.

### Task 4: `server/boosters.js`: ownership, expiry, `emblemIds`

**Files:**
- Create: `server/boosters.js`.
- Modify: `server/server.js` (every response that carries `emblemIds`: `respondStageClear`, `inventoryBlocks` (board update and the other inventory responses), `respondMoogleshopBuy`, the login responses answered from the schema, and a new `PUT /emblem/list` handler; the login hook beside `payPending`).
- Modify: `server/routes-events.js` (`pendingBoosters` handed to `boosters.payPending`).
- Test: `server/test-boosters.js`.

**Interfaces:**
- `boosters({player, index, realNow, log}) -> {grant(emblemId, from) -> bool, activeIds(realMs) -> [emblemId], untilOf(emblemId) -> ms|null, payPending() -> n, list(userId) -> {emblemIds}}`.
- State: `player.boosters = [{emblemId, from: {stageId, objective, slot} | {board, cell} | {pending: true}, at, until}]`; absent in older saves = none; reading never writes the save.

- [x] **Step 1: Write the failing tests:**
  - `grant_active_now`: a grant at t gives the id in `activeIds(t)` and `until = t + spanDays`.
  - `expired_not_sent`: `activeIds(until + 1)` is empty.
  - `expired_never_regranted`: `grant` of the same `from` after expiry returns false.
  - `same_id_renews` (Builder's call 6): another `from` with the same id renews `until`, one entry in `activeIds`.
  - `pending_paid_once`: two built pending names are granted at login, removed from `pendingBoosters`, and a second `payPending` returns 0.
  - `pending_unbuilt_kept`: a pending name not in the index stays.
  - `emblem_list_other_profile_empty`: `list(2)` gives `{emblemIds: []}`.
  - `old_save_no_write`: a save without `boosters` lists nothing and is not written.
- [x] **Step 2:** Run `node server/test-boosters.js`. Expected: FAIL.
- [x] **Step 3:** Implement; replace every `emblemIds: []` in `server.js` (today three: `respondStageClear`, `inventoryBlocks`, `respondMoogleshopBuy`) and the schema-answered ones with `boosters.activeIds(now)`.
- [x] **Step 4:** Run `test-boosters.js`, `test-event-routes.js`, `test-master-clock.js`. Expected: OK, the 8 known failures unchanged. Commit.

### Task 5: Pay Boosters from quests and boards

**Files:**
- Modify: `server/make-events.js` (`remapItems`: a built Booster becomes a type-34 reward with its `emblemId` (Builder's call 7); `boosterOnly` and `boosterLater` only for unbuilt names; new label `boosterEffect`), `server/event_config.json` (`payableTypes` + 34, `reasonText.boosterEffectUnknown`, `reconstructedWhy.boosterEffect` and `boosterExpiryWindow`).
- Modify: `server/routes-events.js` (`onStageClear`: type 34 goes to `boosters.grant` with `{stageId, objective, slot}`).
- Modify: `server/event-boards.js` (`matchDonor` sel 34: the built `emblemId`, else `why` with the unbuilt reason), `server/server.js` `grantSphereReward` (sel 34 to `boosters.grant` with `{board, cell}`).
- Modify: `server/raid-boards.js` / `server/raid_config.json` (the two Booster names leave `boards.unmatched` when built).
- Modify: `server/event-pages.js` (the «comes with the Boosters» lines only for unbuilt names; the Booster and its expiry span on the quest line).
- Test: `server/test-make-events.js`, `test-event-routes.js`, `test-event-boards.js`, `test-event-board-routes.js`, `test-make-raid.js`, `test-event-pages.js`.

**Interfaces:**
- Consumes: `game_data/boosters.json` (Task 3), `boosters.grant` (Task 4).

- [x] **Step 1: Write the failing tests:**
  - `booster_type34_in_row`: a built Booster objective is type 34 with its `emblemId` in the stage row; label `boosterEffect`.
  - `booster_only_served`: the EV-1217 shape (only Boosters) is served when built, still `boosterOnly` when unbuilt.
  - `booster_objective_once` (test-event-routes): first clear grants, a replay grants nothing.
  - `shared_rerun_booster_once`: the second record of a `sharedWith` quest grants nothing.
  - `board_booster_cell_paid` (test-event-board-routes): unlocking a type-34 cell grants once; reopening the set grants nothing.
  - `held_set_served_with_kept_coins`: a set held in Part 3 is built, its balance is the kept one, Board 2 locked until Board 1 completes.
  - `raid_booster_cells_back` (test-make-raid): `boards.unmatched` holds only the JP-only items; the HD Vanitas board has its 3 Booster cells.
  - `unbuilt_booster_still_held`: a board with an unbuilt Booster cell stays held with its chained board.
- [x] **Step 2:** Run the files. Expected: the new tests fail, the old ones pass.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Run `node server/test-make-events.js`, `test-event-routes.js`, `test-event-pages.js`, `test-event-boards.js`, `test-event-board-routes.js`, `test-event-calendar.js`, `test-make-raid.js`, `test-notices.js`, `test-boosters.js`, `test-make-emblems.js`. Expected: OK, the 8 known failures unchanged. Commit.

### Task 6: Booster icons (user gate)

**Files:**
- Modify: `tools/ldplayer/session/build-resources.ps1` (copy the JP `img/ui/emblem/Emblem_<imageId>.png` of the built rows into the generated pack).

- [ ] **Step 1:** List the `imageId` values of the built rows; find each JP 4.3.1 file. Build `tmp\events\boosters\icons.html` (icon, name, description, imageId).
- [ ] **Step 2:** **Show the user**; wait. A missing icon is asked about (Builder's call 8). Commit.

### Task 7: Serve, resources, bench

**Files:**
- Modify: the four session scripts (revision +1, BOM kept), `docs/notes/events.md` (section «Boosters (Part 6)»).

- [ ] **Step 1:** Master regen (HANDOFF command). Expected log: emblem rows written; served quests +5 (EV-1217) or the held count with reasons; Event Board sets served up from 7 by the built ones; `md5` shows only emblem, stage, evStage, reward, sphere, sphereArray, sphereMasu changed; no served id moves.
- [ ] **Step 2:** Build the resources (`-Quick` unless Task 6 added more than icons), `update-resources.ps1`, taps (200,1020) and (1220,715). *(Main session.)*
- [ ] **Step 3:** Saves from `maxpower` with the `mksave2.js` pattern. *(Main session.)*
  - `boost18`: week of 2018-11-19 (EV-0624 Booster [Mickey], the 2018-10 P/S/M boards kept if the window allows);
  - `boost19`: week of 2019-12-02 (the 19 Booster boards of 2019-12);
  - `boost20`: week of 2020-07-20 (EV-1217 «Get Yourself a Booster»);
  - `boostold`: an old save with the 4 `pendingBoosters`.
- [ ] **Step 4:** Bench, frames `D:\Progetto_Restauro_KH_UX\screenshots\t6p_*.png`. *(Main session; Claude plays the battles when the user asks.)*
  - `boostold`: login grants the pending Boosters; the dialog lists them with «Expires».
  - EV-1217 1/5: objective popup with the Booster icon, clear, dialog, Medal Details «+30%» on a P medal, none on an S medal; replay grants nothing.
  - A 2019-12 board: Unlock a Booster cell, dialog updated; the board chain.
  - The Gear Golem raid board (April 2018 week): the HD Vanitas cells.
  - Damage: the same special attack on the same enemy with and without the Booster; **show the user the numbers**, wait.
  - Expiry: `-RealNow` past `until`: the Booster leaves the dialog and the plate.
- [ ] **Step 5:** Record the results in `docs/notes/events.md`; commit.

### Task 8: Notice, docs, next part

**Files:**
- Modify: `server/routes-info-album.js`:
  - «Events» notice: new section «Boosters» (counts from `events.json` and `game_data/boosters.json`: Boosters served, by source; effects rebuilt from their descriptions; the expiry rule of Builder's call 2; pending Boosters granted at the first login with a full span; what is still held and why); the «Event coins and boards» paragraph and the «Challenge events» Booster sentence updated (no more «a later update» for what is served);
  - raid notice: «Shared rewards» no longer lists the Final Form Sora Boosters when built.
- Modify: `server/test-notices.js`. Run `node server/export-notices.js`; after the push, run the GitHub Action «discord-notices».
- Modify: `README.md`, `README.it.md` (parts 1-6), `docs/ISSUES.md` (I-166 and I-227 closed or narrowed to what is held; I-245 Part 6; new rows for the out-of-scope Booster sources), `HANDOFF.md` (new «read first» block), `docs/notes/events.md` (Part 6 summary).
- Create: `docs/superpowers/plans/<date>-events-part7-avatar-boards.md` (writing-plans; spec part 7, the Jewel and Avatar Coin Booster Boards included).

- [ ] **Step 1:** Write the notice lines and their test. Never the word «restored». Run `node server/test-notices.js` and `node server/export-notices.js --check`. Expected: OK, up to date.
- [ ] **Step 2:** Update the docs. Commit and push.
- [ ] **Step 3:** Write the Part 7 plan.
