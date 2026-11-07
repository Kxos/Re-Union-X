# SDD ledger — plan: docs/superpowers/plans/2026-11-06-events-part1-framework.md

Spec: docs/superpowers/specs/2026-11-06-events-design.md. Start HEAD 8bb6e35 (main).

## Pre-flight scan
| Rows | Produces -> consumes | Finding |
|---|---|---|
| T1 -> T2 | field list, id ranges -> pilot record fields | ok |
| T2 -> T2b | MISSING_ENEMIES.md -> research | ok |
| T2/T2b -> T3 | event quest record shape (KHUX_EVENT_SRC) -> buildEvents | ok; T3 needs enemies imported by T2b in master, else quests skipped (missing_enemy_skips_quest) — consistent |
| T3 -> T4 | events.json entries -> calendar/routes | ok |
| T3 -> T5 | catalog banner evStage in make-events (T5 modifies make-events.js) | ok, T5 owns that change |
| T4 -> T5 | keep/unkeep/catalogCtx | ok |
| T3/T5 -> T6 | event_maps.json, banner URL version -> tools | ok |
| T1..T6 -> T7 bench | ok |
| T4 vs raid-calendar | shared helpers moved, not copied | ok, review watch: raid tests must stay green |
| T5 vs raid-pages | shared CSS moved into common module | ok, same watch |
| Each task self-consistency | T1-T8 | ok; T2 Step1 expects 13 rows (16 April quest rows minus 2 COIN, 1 HSC) |

## Rulings
- Ruling: work on main, no worktree — durable project rule (commit+push each step on main, bench paths absolute) — cost if wrong: none beyond usual, pushes are the user's standing instruction.
- Ruling: «show the user» steps (T2 Step 4 report, T2b Step 3 enemies, T6 Step 2 banners) block only serving of those items, not later code tasks; reports are relayed to the user when ready — cost if wrong: some rework if the user rejects data after code built on it (code is data-driven, low).
- Ruling: battles in T7 Step 4 go to the user (standing rule) — T7 pauses there.

## Progress
Task 1: dispatched (BASE 8bb6e35, implementer a2f491a51ef0a84b0, sonnet)
Task 1: implementer DONE_WITH_CONCERNS (7405294): eventType 1/3, parentEventStageId, resetFlag, validStageWidthId unverified -> bench T7; pilot maps mostly missing in JP 4.3.1 (contradicts census 90%) -> reviewer checks. Review dispatched (af4360c07e19acc60)
Task 1: review (af4360c07e19acc60): Important 1 = pilot map absence likely census artefact (stageBinId 0). Fix round 1 sent to implementer (FIX_BASE 7405294).
Task 1: minor (deferred): events.md:159-160 free stage range stated as 4,006,500 vs 4,009,999
Task 1: minor (deferred): events.md:158 evStage used range says 8000-8999, real max 8201
Task 1: minor (deferred): events.md:68 links the spec path (it is in the public repo, fine)
Task 1: minor (deferred): only stage/evStage ranges verified, other tables with stage ids not re-checked
Task 1: fix round 1 implemented (1a2ee0e: 120/120 pilot stages have a JP 4.3.1 map); re-review dispatched (a14be37352cf06b0d)
Task 1: fix round 1/5 (1 addressed, 0 open; commits 7405294..1a2ee0e)
Task 1: complete (commits 8bb6e35..1a2ee0e, review clean)
Task 2: dispatched (BASE cfbde1c, implementer acdd73b299a147d56, opus; private data task, Task 2b separate)
Task 2: implementer DONE_WITH_CONCERNS (no commits; private outputs tmp\events_p1\pilot): 13 rows, 130 quests, 65 enemy ids / 54 names missing in 73 quests; quiz bins 740260/740262 lack part _02, 740280/740282 lack STG header; own rule «2018-only wiki pages do not override donor»; Shiva Adv 500 vs 600. Review dispatched (a3124e574d0e2df06).
Ruling: missing JP map parts (quiz _02, Daily headers) are searched like missing enemies in Task 2b (author's «must be found» spirit) before any reconstruction is proposed to the user — cost if wrong: extra research time.
Task 2: review approved with 2 Important (15 donor-kept quests unlabelled; raidEnemy leads missing in MISSING_ENEMIES.md) -> fix round 1 sent to implementer
Task 2: fix round 1 implemented (labels 15 + 1 low-confidence; raidEnemy leads; missing map parts section); re-review dispatched (a84785ffa5b551775)
Task 2: fix round 1/5 (2 addressed, 0 open; private files)
Task 2: minor (deferred): build.py/gen_md.py mtimes after outputs — regenerate once before Task 3 consumes
Task 2: complete (no commits, private outputs tmp\events_p1\pilot, review clean)
Ruling: Task 2b (enemy research + importer, recon/tools + resources) runs in parallel with Task 3 (server/make-events.js) — disjoint files, 2b is long research — cost if wrong: a rebase/merge of two commits.
Task 3: dispatched (BASE cfbde1c, implementer adcfe74b6e7762569, opus)
Ruling: evStage eventType 2 for event quests (proven by raids); donor value kept as origEventType for the T7 bench — cost if wrong: one field change after the bench.
Task 2b: dispatched in parallel (implementer a53d8af90f315b927, opus; renders for the user, no serving)
Task 3: implementer DONE_WITH_CONCERNS (397ae59): 11/11, raid 86/86; regen 13 entries, 5 evStage, 57/130 quests served; concerns: offset-based id keys, drops not written, daily days<12h, dramaOff. Review dispatched (ab2b85fb4101c2555, opus)
Task 3: review (ab2b85fb4101c2555): Important 1 offset id key can misbind save ids. Fix round 1 sent (FIX_BASE 397ae59): private anchor sidecar + guards + tests; Minor 2 map-key clash included.
Ruling: freeze the id anchor in a private sidecar (event_anchors.json beside KHUX_EVENT_SRC) with a stop-the-run guard — keeps donor ids out of the repo — cost if wrong: losing the sidecar stops builds until restored (guarded, not silent).
Ruling: short window = donor row under 12 h gets the whole day (category 3 rows can be week-long) — cost if wrong: some short events listed for their full span instead of one day.
Task 3: minor (deferred -> Task 4 brief): type-15 objective rewards shown in submissionRewardType but not paid; Task 4 must pay drops every clear, objectives/first-clear once.
Task 3: minor (deferred -> T7 bench): stageStartId/EndId span non-served ids; chapterId 4000-4009 undefined.
Task 3: fix round 1 implemented (0ccb606, 14/14, raid 86/86); re-review dispatched
Task 3: fix round 1/5 (2 addressed, 0 open; commits 397ae59..0ccb606)
Task 3: complete (commits cfbde1c..0ccb606, review clean)
Task 4: dispatched (BASE 0ccb606, implementer a22d49a0a9d0ea2c0, opus)
Ruling: daily events listed for their whole original period (no weekday restriction) unless the record says otherwise — cost if wrong: daily quests visible on extra days.
Task 4: implementer DONE_WITH_CONCERNS (7907e2f): drops wired but stage_poi has no event map keys (-> Task 6 must generate POI for event maps); onStageClear(stageId, cleared); objectives recorded twice by design; achievements Events progress counts raids only.
Task 4: review approved (af158f7579ea1e71c), no Critical/Important
Task 4: minor (deferred -> folded into Task 5 dispatch): server.js:2501 onStageClear not in try/catch; routes-events.js:357-367 cleared[id] set when stage row missing (first-clear lost); routes-events.js:427 endTime days check
Task 4: minor (deferred): two sources of objective state (comment); masterRows copy per quest
Task 4: complete (commits 0ccb606..7907e2f, review clean)
Ruling: fold Task 4 minors 1-3 into the Task 5 dispatch — they are robustness fixes in files Task 5 touches anyway — cost if wrong: slightly larger Task 5 diff.
Task 5: dispatched (BASE 7907e2f)
Task 2b: implementer DONE_WITH_CONCERNS (829d5b8): 37/54 found (16 new models, renders in tmp\events_p1\enemies_review), 17 missing (Titan, Ramuh, Queen Bee Ω, Assault Dragon, 12 Org XIII, sEnm_2009), map parts 0/4; gated by approved:true
Task 5: implementer DONE (752d3e6): catalog-pages.js shared module (1171 raid pages byte-identical), catalog evStage 20000, make-event-notices.js; notices/docs left to Task 8; filters/year tabs not built (pilot)
Task 2b: review (a718a1f14bcd71149): I-1 25 served-model rows auto-approved -> enter master on next regen; I-2 name lookups (gen_story_maps.py, make-proud.js) unguarded; I-3 copy rows labelled user-approved. Fix round 1 sent (FIX_BASE 829d5b8).
Ruling: global switch KHUX_EVENT_ENEMIES default off (no event enemy rows in the master until the T7 bench), per-family approved gate kept for new models — cost if wrong: one env var to flip at the bench.
Task 2b: minor (deferred): extra_donors_dedup.tsv hand-appended block lost if dedup_export.py rewrites; enemy-attack-fix.js:73 reads private file per readOrig call; Wily Bandit displayId 226 vs served 227 (ask user at render review).
Task 5: review approved (a68f3c82c341b7c8f), no Critical/Important
Task 5: minor (deferred): event-pages.js:163 q.level/q.ap unescaped; :188 empty compacted heading matches; pruneKept keeps non-listable kept entry; POST tests for non-numeric/unknown id; server.js banner insertion by eventType 0 (match CATALOG_EV); detail page no Remove after Keep
Task 5: complete (commits 829d5b8..752d3e6, review clean)
Task 6: waits for Task 2b fix round (both touch recon/tools/gen_story_maps.py)
Task 2b: fix round 1 implemented (8612045)
Task 2b: fix round 1/5 (3 addressed, 0 open; commits 752d3e6..8612045)
Task 2b: minor (deferred): Python event filter no-op when private file and id list both absent; gen_story_maps lookup test mirrors the rule instead of importing it
Task 2b: complete (commits 7907e2f..8612045 for 2b, review clean); user render approval PENDING (16 sheets) + Wily Bandit 226 vs 227 question; 17 names still missing (research continues later)
Task 6: dispatched (BASE 8612045, implementer a922d9ce26ba318c5, opus); maps = import original JP files + POI for drops (Task 4 concern)
User 06-11: approved renders 226,261,262,1025,1027,1522,1530,1546,1553,1556,1565,1566,1580,1593 (Wily Bandit = display 226); 97 Ringmaster (sheet shows a Shadow) and 1526 Royal Pretender (chest wait/move, small atk) to redo -> sent to 2b implementer.
Task 6: implementer DONE_WITH_CONCERNS (cc2022b, 366b633): 13 cards + catalog + KEPT; 49/57 stages original JP maps + POI; 8 quests without usable map; 26 map reward ids would get generic content on next master run; DWW 7/12 + Agrabah #2 JP enemies unlabelled
User 06-11: banners approved except Event Catalog card (too similar to the Raid Catalog design, could confuse players) -> redesign in Task 6 fix round; also KEPT tab over quiz '3rd' (my note). DWW/Agrabah map enemy question still open.
Task 6: review (aa9267f853ff22577): Important 1 generic drops on next master run; 2 eight unusable-map quests still served; 3 live stage_poi.json modified; 4 DWW/Agrabah JP enemies unlabelled. Fix round 1 sent (FIX_BASE 366b633) with minors 5 (docs control chars), 6 KEPT tab override, 7 user catalog redesign, 8 card source.
Ruling: restore live stage_poi.json now; POI merge becomes part of the master run so POI and reward rows land together — cost if wrong: none (backup exists).
Ruling: label DWW 7/12 + Agrabah #2 «JP map enemy kept» until the user decides — cost if wrong: label/map change later.
User 06-11: DWW 7/12 and Agrabah #2 must have the WW enemy (Morning Star, Bag O' Jewels) -> sent to Task 6 implementer as patch step + label; replaces the interim 'JP map enemy kept' ruling.
Task 2b: user-review round (c0c36e9 approvals, 51ad16a Ringmaster from JP files; 1526 chest = original per khuxwiki, scale artefact fixed); scoped re-review dispatched
Task 2b: user-review round re-review clean (a574980bc797afd0f); 97 and 1526 new sheets await user approval
User 06-11 review 2: 97 wait head wrong; 1526 atk1_o/atkSp head and crown fullness -> sent to 2b implementer
Task 6: fix round 1 implemented (a4d286e): 49/130 served, 26 reward rows from original drops, stage_poi restored, WW enemies patched (Morning Star 99, Bag O' Jewels 23), catalog card redesigned, keptTab
Task 6: fix round 1/5 (8 addressed, 0 open; commits 51ad16a..a4d286e)
Task 6: minor (deferred): patch_swaps no STG length check (old 28-byte v4 crashes import); reward id shared with story generic row keeps generic; KHUX_EVENTS=0 leaves event POI keys; make-game-tables skip no unit test
Task 6: complete (commits 8612045..a4d286e, review clean); user approval of the new Event Catalog card pending
Task 7: waits for user approvals (catalog card; 97/1526 in user review 2) before the bench serves graphics
Task 2b: user review 2 round (d6e8996): 97 stale Shadow files dropped (stale_plain) + 25 slots by 2018 record; 1526 all textures own/identical (hollow crown = crown turned, footage only); 1556 Icy Beast 5 wrong slots fixed and set back to pending; concern: served families 94,95,96,197,1029,2502 same placeholder pattern. Re-review dispatched.
User 06-11: redesign Raid Catalog card (simple red, raid boss collage) and make Event Catalog card prettier (keep colour) -> sent to Task 6 implementer; image versions to bump.
User 06-11: approved 97, 1526, 1556 -> sent to 2b agent (+ ISSUES row for served families 94,95,96,197,1029,2502 placeholder pattern)
Task 2b: approvals of 97/1526/1556 committed (b0f6346); I-246 opened; all 16 found families approved; switch off
Task 2b: user review 2 re-review clean (a26579d4be34f1371)
Task 2b: minor (deferred): dry run 258 vs report 261 families (unreconciled); stale-pattern list 6 vs code comment 9 (71, 140 extra) -> I-246 scope check
Task 6: catalog redesign (605c382): raid red + 4 bosses (1009,1005,0004,0013), event rays/bokeh/3 coins; RAID_IMG_VERSION 8, EVENT 2; boss textures from tmp\raid_p2\files (to move to a stable private place). Awaiting user approval. My note: TRAINING mark overlaps the title 'G' on both.
User 06-11: all catalog cards (Special/Raid/Event) gold frame + gold title, distinct designs; asked for options -> options sheet (3 variants each) requested from Task 6 agent
User 06-11: Special B, Event A chosen; Raid: B variants requested (B1-B4)
User 06-11: Raid B1 chosen; TRAINING mark slightly outside the gold frame on the 3 chosen cards -> fix + build final cards + bump versions
Task 6: final catalog cards built (e4bfcfc): Special B, Raid B1, Event A; TRAINING inside frame (test); versions SPECIAL 7, RAID 9, event 3. Awaiting user ok.
User 06-11: TRAINING ok; Raid B1 boss crosses the gold frame -> fix (clip to frame, test all layers), bump RAID 10
Task 6: art inside frame (84dbcc3): SPECIAL 8, RAID 10, event 3; awaiting user ok
User 06-11: banner lighting got dirtier vs catalog_family.png -> diff + restore clean lighting, idempotent rebuild test
Task 6: clean lighting (54a7f5e): cause = 256-colour palette save with dithering; catalog cards now full-colour PNG; glows fade 6 px; versions SPECIAL 9, RAID 11, event 4. Bench must check the client loads full-colour PNG cards.
User 06-11: catalog cards approved (Special B, Raid B1, Event A, clean lighting). Task 6 graphics closed.
Task 7: dispatched (BASE 54a7f5e, implementer a34ed8047e06c8932, opus): steps 1-3 only, battles to the user
Task 7: partial (37c292e rev 277): full build 106 (enemy_gen needed), master +44 enemy rows, 5 events/49 quests, 106 valid tables; save events1 Q850 week 2019-04-04..10; client install 106 interrupted wait (low PC memory) -> agent resumed to wait and do Step 3. Keyblade EV-0783 needs a Q851-855 save for Step 4.
Task 7: install 106 verified complete by controller (data 5335201715, index 42949885); agent told to relogin + Step 3
Task 7: steps 1-3 done (37c292e, 98e60b1): tab order OK, full-colour cards OK, notice/details/catalog OK, KEPT works (RealNow 2026-11-10, Countdown kept). Bench bugs: (B1) Raid Boards button on event quest list (eventType 2); (B2) quest counter 1/12 with 9 served (stageStartId/EndId span non-served, T3 minor); (B3) «no continue» objective shown twice on DWW quest 1. Step 4: user plays DWW quest 1 now; keyblade event needs a Q851-855 save.
Session end 06-11: handoff fe23574. Resume: user battle DWW q1, fix B1-B3, keyblade save, Task 8, final review.
Task 7 step 4 (07-11, controller played, user asked): DWW 1/12 first clear + 7 replays OK; drop odds bug fixed d8339ed (test-drop-odds); B2/B3 original (name / donor+khuxwiki); B1 = fidelity question to the user (event quests spawned raids 2017-19 per khuxwiki raid=); 23d691b
