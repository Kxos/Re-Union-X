# Raids, Part 1: bench spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn from the real client how a raid works from spawn to rewards, on one Weekly boss, and decide whether a solo boss can keep its damage; every later raid task depends on the answer.

**Architecture:** One week only (`WW-W-2019-10-07`, Beginner, Trickmaster, Curious Room). Layouts and the boss model are real product work, kept. The server routes are a throwaway module behind an environment variable, deleted at the end. Answers go to a new public note; client internals stay private. Steps 2-7 of the design are planned in Part 2, from these answers.

**Tech Stack:** Node server (`server/server.js`), Python importers (`recon/tools/`), Ghidra headless (private), LDPlayer bench instance 0.

**Spec:** `docs/superpowers/specs/2026-11-01-raids-design.md`

## Global Constraints

- Only the original client runs: no client patch. Answer 2 of the spec: if the client does not keep damage, the server starts the boss from the remaining HP; if that is impossible too, **stop and go back to the author**.
- Original values where known, HP for this row 150,000,000 (Beginner). Anything reconstructed is labelled.
- No SE files, decompiled code or private sources in the public repository: private findings in `D:\Progetto_Restauro_KH_UX\tmp\raid_spike\`.
- Bench: one script at a time; taps only with the game alive (`bench_lib`); master revision only goes up, in the 4 session scripts and `tools/play/packaging/make-play-package.ps1`; after `update-resources.ps1` tap KHUX START (200,1020) + Download (1220,715). Battle checks are the user's.
- Press SKIP on any dialogue. Commit + push each verified step, messages in English, `git -c safe.directory=*`, `git commit -F <file>`, UTF-8 (keep an existing BOM on `.ps1`).
- Never run `build-resources.ps1 -Quick` when a newer version exists than the one installed.
- Windows DNS on 192.168.1.185 during the session, automatic at the end.

## Review Focus

- A raid screen whose layout or LWF is missing: the client crashes rather than showing a blank; the first response is `tombstone.ps1`, then the list in Task 1. Pinned in Task 2, Step 4.
- The save at risk: `-Save` writes into the file, so a spike on `maxpower` would change it. Only the copy `raidspike` is used. Pinned in Task 3, Step 1.
- A boss left over from a killed session: `selfRaid` must not stay active after the timer, or the home blocks new raids. Pinned in Task 3, question 7.
- Tier 9/10 or missing medal rows in a raid fight: the friend's medal and guilt cut-in paths differ in raids. Pinned in Task 3, question 4 (played with the maxpower deck).
- Removing the spike must leave the normal game untouched: `/raid/list` with no raid still answers `raidStatus` 0. Pinned in Task 4, Step 2.

---

### Task 1: Map the client's raid flow

Read-only. Private output, plus a public summary.

**Files:**
- Create: `docs/notes/raid.md` (public: routes, field names and behaviour, no addresses or decompiled code)
- Scratch: `D:\Progetto_Restauro_KH_UX\tmp\raid_spike\client\` (private)

**Interfaces:**
- Produces: the list of routes with request and response fields; the table fields read for a raid; the layouts and LWFs each raid screen loads. Task 2 and Task 3 use them.

- [ ] **Step 1: Find the raid routes and action numbers.** Known so far: 120 `/raid/reward` (`raidRewards[]`, entries carry `userTitles`), 123 raid clear (new titles at response +0x18), 240 `/raid/list` (`selfRaid`, `raids[]`). Ghidra headless on `tmp\extra_attack\ghproj`, as in `tmp\i218\guilt_icon.py`, with the response dispatcher in `tmp\i220\disp.txt`. Expected: every raid action with its route string and response parser.

- [ ] **Step 2: Answer from the code, for each: spawn and damage.** What tells the client a boss appeared after a quest (`/stage/clear` field?), what the raid start route sends and receives, where the boss's current HP comes from at the start of a fight, and whether it is server data or local. This is the persistence question: if the start response carries remaining HP, the fallback of the spec is available. Expected: a yes or no with the field name.

- [ ] **Step 3: List the raid tables and fields the client reads** (`raidEnemy`, `raidEnemyAttack`, `raidReward`, `raidSetting`, `raid_rule` hitboxes) against `recon/out/master_types_ww431.json`, marking those a null row would crash. Served today: `raidEnemy` and `raidEnemyAttack` with 7 tutorial rows, `raidReward` and `raidSetting` empty.

- [ ] **Step 4: List the layouts and LWFs of the raid screens.** Start from `catalog\missing_layouts.txt`: `AdvRaidListScene_ver320`, `Adv_Raid_Boss_Block_ver320`, `Adv_Raid_Boss_Dialog_Entrant_ver104`, `Adv_Raid_Boss_Dialog_Result_ver104`, `Adv_Raid_Boss_List_Reward`, `AdventureTop2_Proud_RaidInfo_Start`, `AdventureTop2_RaidInfo2_Start`, `AdventureTop2_Raid_Button`; `lwf/character/raid`, `lwf/raid/demo`. Mark which exist in the JP 4.3.1 data.

- [ ] **Step 5: Write `docs/notes/raid.md`, commit.** Routes, fields, screen list, open points. Add a row to `docs/ISSUES.md` (next free id, status IN PROGRESS, «Raids») and link it.

### Task 2: Resources for one boss

Kept product work.

**Files:**
- Modify: `recon/tools/jp_coco_layouts.txt` (the layouts of Task 1 that exist in JP)
- Modify: the enemy importer's list for the Trickmaster raid model (`recon/tools/make_jp_enemies.py`, or a new `recon/tools/import_raid_models.py` if raid models do not fit its plan)
- Test: bench

**Interfaces:**
- Consumes: Task 1 Step 4 lists.
- Produces: resources version 91 with the raid layouts and the Trickmaster model; `docs/notes/raid.md` records the model id used.

- [ ] **Step 1: Find the Trickmaster model** in `private\events\sources\raid_census\raid_bosses.md` and copy it from JP 4.3.1 through the importer. Expected: the `lwf/character/raid` files for that id in `stage_gen\files`.

- [ ] **Step 2: Import the layouts** with `import_jp_coco.py`. Check Italian or Japanese text: any Japanese label gets an entry in `recon/tools/jp_coco_texts.tsv`, using the WW term.

- [ ] **Step 3: Build and install.** `build-resources.ps1 -Version 91`, measure the size against the 4.33 GiB of version 90 and report if the reserve is exceeded, then `update-resources.ps1` and the two taps.

- [ ] **Step 4: Check no regression.** Relogin with the copy of Task 3 or `maxpower`, open Quests, a story quest start and Special. Expected: no tombstone; `tombstone.ps1` shows none from the game.

- [ ] **Step 5: Commit** the lists and importer change, with the resource version in the message.

### Task 3: The spike on the bench

Throwaway server code. The user plays the battles.

**Files:**
- Create: `server/raid-spike.js` (loaded by `server.js` only when `KHUX_RAID_SPIKE=1`)
- Modify: `server/server.js` (one guarded `require`, and the routes of Task 1)
- Modify: `docs/notes/raid.md`

**Interfaces:**
- Consumes: Task 1 routes and fields; Task 2 resources.
- Produces: answers to the questions below, in `docs/notes/raid.md`.

- [ ] **Step 1: Prepare the save and data.** Copy `server/save/maxpower.json` to `raidspike.json` and use `-Save raidspike` only. Rows for this one week: `raidSetting` with `bossUpTime` 20 (minutes) and `useAp` 10; `raidEnemy` Trickmaster with HP 150,000,000, ATK and DEF from its 2016 row, labelled spike; `raidReward` with coins 120 or 180 / 30 / 30; one event quest with 3 Eggcognito on Curious Room. Bump the master revision in the 4 session scripts and the package script, then relogin.

- [ ] **Step 2: Implement the routes in `server/raid-spike.js`.** `/raid/list` with the boss as `selfRaid`, the raid start and clear routes from Task 1, damage saved in the save as `raidSpike.hpLeft`, timer from first spawn. Log every raid request and response body to `logs\server.log`.

- [ ] **Step 3: Run the questions on the bench, one at a time, saving a screenshot for each to `tmp\raid_spike\`.** The user plays where it says so.
  1. The raid list and the home raid button appear; tap does not crash.
  2. Event quest: killing the Eggcognito spawns the boss.
  3. The start screen shows the boss, level, AP 0, timer.
  4. **User:** fight with the maxpower deck, Give Up with the boss damaged.
  5. **The persistence question:** start again. Does the boss come back damaged, from the server's `hpLeft`? AP charged 10?
  6. **User:** destroy a weak point, Give Up, return under 3 minutes and after it. Who keeps the weak point state?
  7. Let the timer end: boss gone, list empty, home usable, a new spawn possible.
  8. **User:** defeat the boss: result panel with Victory, MVP/Host, All Points; All Points absent if a part survives; coins in `raidRewards`.
  9. Add a title to the clear response: the REWARD popup opens once.
  10. **User:** set the HP to 999,999,999,999 and measure how much of it the maxpower deck removes in 20 minutes. This tells whether the timer of Epic can stand (Answer 1 of the spec).
  11. Set the boss to `tier` Advanced and check the same save's coins: nothing in the client ties a coin balance to a tier.

- [ ] **Step 4: Record the answers** in `docs/notes/raid.md` with the screenshot names and commit the note (not the spike code).

### Task 4: Decision and cleanup

**Files:**
- Delete: `server/raid-spike.js`, and its guarded `require` in `server/server.js`
- Modify: `HANDOFF.md`, `docs/ISSUES.md`
- Create: `docs/superpowers/plans/2026-MM-DD-raids-part2.md`

- [ ] **Step 1: Apply the gate of the spec.** Persistence works (client or server start) and the deck can make progress: go on. If persistence is impossible, stop and report to the author with the evidence, before anything else is built.

- [ ] **Step 2: Remove the spike and check.** `node --check server/server.js`, then run `server/test-title-popup.js`, `server/test-special-server.js`, `server/test-objective-skill.js` and confirm `/raid/list` answers `raidStatus` 0 with the variable unset. Expected: all pass. Keep the revision as it is: it never goes down.

- [ ] **Step 3: Write Part 2** with `superpowers:writing-plans`, covering steps 2-7 of the spec's order of work, applying `private\events\sources\raid_rewards\CORRECTIONS.md`, with the real route and field names.

- [ ] **Step 4: Update `HANDOFF.md` and `docs/ISSUES.md`, commit and push.** Set Windows DNS back to automatic if the session ends here.
