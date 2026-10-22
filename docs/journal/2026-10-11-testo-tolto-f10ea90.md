# Text removed from HANDOFF.md in commit f10ea90 (11 October 2026)

Commit f10ea90 («Layout mancanti: nuvoletta di Chirithy...») rewrote the resume
block and removed, together with the outdated entries, ~240 lines of history from 9-11 October that did not
appear anywhere else. They are reported here as they were (lines removed by the diff, in order).
The facts that are still useful have been carried over into docs/notes/.

---

- **OPEN CRASH: defeat**. 1240 part 2: Bandit + Red Nocturne (ids 9 and 4, Dark Road graphics
  5008/5004) wipe out 3040 HP (LV3 player with 2 medals in a level-27 quest:
  balancing, not an error); on defeat black screen and crash, in the loading of a `.plist` particle like the pet crash.
  Analysis in progress together with the pet one.
- **Profile message**: even with Enter or Back after `adb input text` the client sends
- **OPEN CRASH (already present before, not related to 1060)**: in home, tapping the character
  in the square (e.g. (950,850)) the client crashes at once, before any request. The crash happens while the pet info card
  loads an LWF with a `.plist` particle; the files involved are
  `lwf/character/npc/999/wait/wait.lwf` (our empty 492-byte LWF) and
  `lwf/avatar/body/30001/...`. Likely: the invisible pet (empty LWF) sits on the character and the
  tap opens its info card. The Profile instead opens from the portrait at the top left and works.
  The empty speech bubble above the character also remains to be done.
- (history) 1060 walked by hand on the bench (smoke.json with
  stageId 1060): the long detour around the arch and the bottleneck on the water lilies can be walked, the target
  is reached. But at the exit towards part 1 (blue arrow, (2200,1760)) the client CRASHES
  (null pointer). It is the first
  transition between parts tested on the bench: it concerns all multi-part quests (86 with 2 parts,
  9 with 3). Hypotheses to verify: global uids across parts (gen_story_maps restarts from 2 for each
  part, see above «to be renumbered for multi-room") or the format of the exits. Compare with an original multi-part one.
- 1050 fixed (agent): chest uid 4 moved from (2700,1450) to (2290,690), STG totals
  (1,1,2,4); validate_maps: 0 errors on 569 stages. Files outside the repo (stage_gen\files\stage,
  spec_1050.json, reach\REPORT.md); server\game_data\stage_poi.json does not have 1050 (to be regenerated).
  A -Quick is needed to bring it into the guest (not done yet).
- Save: boards 1 and 2 complete (titles 2001, 2002), avatarCoin 405.
- Test save: board 1 complete (7/7), title 2001, avatarCoin 450. To test
  the popups again: stop the server, `unlock` of 2100001 at [1..5], spherePoint 470,
  sphereBonus.cost 3, remove 2001 from titles, restart.

**Session of 10 October 2026 (evening)**:
- TESTED ON THE BENCH (resources 32 regenerated with -Quick, revision 80): complete quests. Rows
  144 high (the code's cell is 148, the row appears 44 to the left: content shifted by +44),
  bar like the LUX one (Gage_LUX_Base + stretched Gage_LUX_Tip), World_Stage_Clear stamp
  («COMPLETE») on the claimed rows. Quest/Lux counters correct after quest 1030; «Collect
  All» ok (Jewel 3000 -> 3060, «All rewards have been collected», rows darkened).
- Node unlock popup FIXED: Sphere_Incentive_ver240 is not a popup, but the reward icon
  that the client adds into the `Panel` of Sphere_Popup_Get_ver240 (now a 100x100 'build'
  with reward_icons). Tested: a single window with the icon (gloves), coins 475 -> 470.
  The node price at the top right is like the original (ab_31): it must not be moved.
- CHANGED BUT NOT YET TESTED (needs `build-resources.ps1 -Quick`, 32 is still the latest):
  Get popup text raised (y 78) and icon lowered (Panel y 250), because the icon covered the
  text; board list: children of Img_Win_L with coordinates from the centre (the coin and «45/25» were
  shifted to the right), «No. N» above the card (No_Panel y 300) as in ab_sheet; stamp scale 0.95.
- TO DO:
  1. Yellow check mark on unlocked nodes (`Get` widget of Sphere_Incentive.json: now Kind_0001
     placeholder, invisible). No texture found so far: search in the LWFs (results?) or
     rebuild it.
  2. «Unlock All» and completed board (title 2000+N) still to be tested.
  3. Generated maps, reachability check DONE and integrated (recon/tools/validate_maps.py
     with flood-fill, needs numpy/scipy; gen_story_maps.py links only points of the same walkable
     area, output identical to before: nothing to regenerate). Result in
     `D:\Progetto_Restauro_KH_UX\stage_gen\reach\REPORT.md`: 0 errors in the generated ones (only
     1050, made by hand: chest uid 4 unreachable, STG totals). 1060 is NOT blocked: the
     target (2200,1760) is reached with the long detour around the arch (up the left arm,
     at the top, down on the right, bottleneck of ~180); the bench goes straight towards the arrow. TO DO:
     walk it by hand on the bench to confirm the bottleneck (same spot in 3200, 6220,
     10010, 10100, 10400); possible generator option for detours <= 1.2x; fix 1050.
  4. story.ps1 / bench_prologue -Seek: on dark maps (fog) FindSpotlight mistakes the background
     for the tutorial circle and takes no steps (0 steps); and in 1030 it did not see the
     /stage/clear that was there (#718). To be fixed.
  5. Retest 990018; Raid/PVP/Union Cross in the quest counters; missing Cutins; style.
- Test save: avatarCoin 470, quests 2004/2008 claimed.

**Update after the compaction** (previous):
- Generated enemyAttack rows (revision 78): the 17 enemies with validSkill 3 now all start
  (`stage_gen\zoo2_results.json`). Point 1 closed.
- Daily/weekly quests: `server/tables/mission.json` copied into the master by
  make-game-tables; GET /user/mission/list and POST /user/mission/receive in server.js
  (counters per period in `player.missions`; they count quests and Lux, not yet Raid/PVP/Union
  Cross). To be tested on the bench (Missions menu).
- Dark Road graphics: make-game-tables assigns them by name from
  `recon/tools/enemy_display_map.json` (high/medium confidence: 312 enemies, 51 graphics);
  `recon/tools/make_enemy_moves.py` (in build-resources) creates `move` by copying `wait`.
  Zoo quests 990001-990051 = one per graphic (`stage_gen\zoo_dr.json`, story_cfg.json
  points there). To be tested with smoke_quests.ps1.
- `recon/tools/story_rooms.json` = the 84 verified rooms; maps regenerated (161 exact) and
  copied from `stage_gen\story` to `stage_gen\files\stage` (by hand, after gen_story_maps).
- Complete medals: KHUX_MEDALS_ALL=1 (2,094 medals) and full resources version 31 with
  the medal package; master revision 79.
- Avatar Boards agent (second part) DONE: `stage_gen\boards\files\` (442 PNGs: 381
  sphere_incentive, 15 sphere_board, 42 sphere_masu_icon, Kind_0002 rebuilt, backgrounds),
  `ASSETS.md` (sources and missing items), `LAYOUT.md` (SphereScene_ver310 widgets read from the code:
  G11..G59 = 45 empty cells, Grid/Grid_R/Info/LeftUI mandatory, background
  img/ui/Equip_DeckBG_01.png, overlay Sphere_Incentive.json; positions estimated on 960x640).
  To integrate: copy the files into stage_gen\files, build the layout in make_layouts.py,
  sphere* master in server/tables, server userSphere.
- Avatar Boards integrated (to be tested on the bench, needs master revision 80 and resources 32):
  layout SphereScene_ver310 + Sphere_Incentive + 4 popups in make_layouts; armatures
  (recon/tools/gen_sphere_armatures.py; the movements are chosen by index 0/1/2 = Lock/
  Release/Target, `stage_gen\boards\ARMATURES.md`); server GET /user/sphere,
  /user/sphere/update, /user/sphere/check (`stage_gen\boards\SERVER.md`); the
  sphere_incentive images (37 MB) are in medal_gen\files (static package: full version).
- TESTED ON THE BENCH (resources 32, revision 80): Missions menu (Daily/Weekly tabs, rows with
  reward, time, bar, Challenge: layouts MyPageMission_Panel and PresentBOX_IconPanel_ver131
  rebuilt with KHUX widgets; ChallengeButton/ReceiveButton are created by the code: do NOT
  put them in the layout); Avatar Boards: list with the cards (costume, blue/pink figure), board
  (grid, START, paths, nodes, Unlock) and unlock of 4 nodes with the popup «Congratulations! Max
  HP increased by 20!», coins deducted (500 -> 480; the test save has 500 coins given
  by hand). Popups: Area_Point and the per-type icons are needed (reward_icons in make_layouts);
  SpIcon_Open/SphereMap_Complete = renamed copies of Result_Reward (an empty LWF has no
  label: crash). TO DO: second popup (Sphere_Incentive_ver240?) shown out of place
  at the top right (`screenshots\v32_unlock4a.png`), node price above to the right of the node,
  Missions rows very widely spaced, test Collect of the quests and «Unlock All», completed
  board (title), retest 990018 (lost tap).
- Multi-room maps (95 quests) and chests/enemies of the generated quests in the server
  (gen_story_maps writes server/game_data/stage_poi.json with "poi" in the config): to be tested.
- Textures: the originals have PREMULTIPLIED alpha; btf.encode now premultiplies, decode
  removes it; `recon/tools/btf_fix.py` (in the build) converts true PNGs and old BTFs. Cause of the
  white borders on the medals (Donald). Visual check agent for all medals:
  results in `stage_gen\medal_check\REPORT.md`.

**Bench:** resources version 30 (with the images of the master's 521 medals), master
revision 77 (raise it after each change of master_data, then relogin.ps1 twice).
**In progress / to resume, in order:**
1. Single-enemy test (zoo quests 990001-990040 = the 40 enemies of the failed groups,
   list in `stage_gen\zoo_single.json`; results in `stage_gen\zoo1_results.json`).
   Cause found: enemies with `validSkill` 3 crash at startup; fix already in the
   code (make-game-tables: enemyAttack rows generated for all skillIds, +276;
   enemyAttack_base.json keeps the original) but NOT yet applied to the served master.
   Then: regenerate (`$env:KHUX_ZOO='1'; $env:KHUX_ZOO_COUNT='40'; node server\make-game-tables.js
   D:\Progetto_Restauro_KH_UX\wiki\medals.json`), revision 78, retest only the failed ones.
   RESULT of the single test (finished): 17 enemies out of 40 crash, ALL with validSkill 3; no
   enemy with 3 abilities works, those with 2 or 4 do (list of the failed indices in
   `stage_gen\zoo_single_failed.txt`). If the generated enemyAttack rows are not enough, second
   hypothesis: bring validSkill 3 to 4 by duplicating the last ability (skillId/Require/Arg/Odds).
   Enemies agent DONE: `stage_gen\enemy_display_map.json` (61 enemies -> Dark Road graphics, 47
   high confidence; no Dark Road graphic has `move`; details and proofs in
   scratchpad\enemymap\). To integrate in make-game-tables (DISPLAY_SUBSTITUTE by name) and to
   test with the zoo quests.
   Exits agent DONE: `stage_gen\exits\NOTE.md`. The exits between rooms are a block
   of each MAP part (u32 n + n records of 9 integers: x, y, arrow angle, distance, forward/
   back, arrival x/y, destination part, direction; X = 4 + 36n), they trigger within 96
   units; STG [2] = parts | (starting part << 16), [5] initial direction, [10] enemyId of the
   target card, [11] level bonus; uids of areas, enemies and chests GLOBAL across parts
   (gen_story_maps/mappoi_gen restart from 2 for each part: to be renumbered for multi-room);
   section C are event actors (type 0xb), not exits. Recipe in NOTE.md.
   Avatar Boards agent DONE: `stage_gen\boards\` (sphere/sphereArray/sphereMasu, 118
   standard boards and 874 nodes, conforming to the schema; NOTE.md with the meaning of the fields and
   doubts; tools\gen_boards.py regenerates them). To integrate: copy into master_data (new
   revision); the server must list the unlocked boards in userSphere.userSphereDatas
   (POST /user/sphere/check) and give title 2000+N on completion; images from Roboloid
   (images/assets/board/sphere_incentive-<id>.png -> img/sphere_incentive/<id>.png,
   other/sphere_board-Board_0001.png, other/sphere_masu_icon-*); to create Kind_0002 (pink
   figure) and the board's SphereScene_ver310 scene (missing layout).
   Quests agent DONE: `stage_gen\missions\mission.json` (20 rows: 10 daily 30 jewels,
   10 weekly party 100 jewels, conforming) + NOTE.md. To integrate: master `mission`;
   GET /user/mission/list -> missions[] {id, status 0/1/2, numUpper progress, numLower
   goal} ONLY with master ids (otherwise crash); POST /user/mission/receive
   {receiveMissionIds} -> userData + missions + full inventory like /stage/clear; the
   server must count the progress and reset it (day: startDate time, 08:00 UTC).
   Rooms agent DONE: `stage_gen\story_rooms_full.json` (84 entries verified by comparing the
   rebuilt backgrounds with the khwiki images <Stanza>_KHX.png). CORRECTION: DW_0003_00_00 is
   «Path to the Mine», NOT Dwarf's Cottage (the Cottage folder is not in the resources):
   redo quest 8 (spec_1050) and regenerate the maps with this file instead of
   recon/tools/story_rooms.json. «2nd District» = DB_0004_01_00. Coverage: 18 of the 86 rooms
   of quests 1-525, 154 quests out of 525 with all rooms exact; missing from the resources:
   West Wing, Boardwalk, Market, Dwarf's Cottage, Waterfront Park, Avenue, Morning Dew Grove,
   Garden Maze... Prefixes: CS Game Central Station, HD Cy-Bug Sector, NL Niceland, SR Candy
   Kingdom, DG_0200 Corridor of Darkness. Schema: XX_NNNN_VV_00 = Roboloid <Mondo>_NNNN_VV
   (VV = day/night variant).
2. Complete medals: `fetch_medal_images.py --all` DONE (1,918 medals with images in
   `medal_gen\files`, 712 MB; 199 failed downloads for names with «#», e.g.
   «569_6Star_Key_Art_#2.png»: to retry with another encoding). Then: KHUX_MEDALS_ALL=1
   in make-game-tables (2,094 medals, 1,904 bursts, types verified), full resources version 31
   (`build-resources.ps1 -Version 31`; WARNING: the server announces the latest
   version immediately and the client downloads it, so do it when the tests are finished, then
   `update-resources.ps1`). To see them in game they will have to be given to the player (rewards/gacha).
3. Two agents launched (results expected in files): `stage_gen\enemy_display_map.json`
   (KHUX enemy -> equivalent Dark Road graphic, with animations) and
   `stage_gen\story_rooms_full.json` (room -> map folder). Apply them:
   DISPLAY_SUBSTITUTE in make-game-tables.js (removing the `d < 5000` limit if the Dark Road
   graphics work: the group 1 crash was Fat Bandit, not Yellow Opera/5075) and
   `recon/tools/story_rooms.json` for gen_story_maps.py; test with the zoo quests.
4. Test of the story quests: `smoke_pick.py` (76 quests) + `smoke_quests.ps1`.
5. Then: exits between rooms (multi-room quests), keyblade gauge (name of the
   /stage/clear field from the «[gauge]» log), Avatar Boards (reward icons on Roboloid
   images/assets/board), red trait bar, Profile message.

### How to resume the work (state as of 10 October 2026)

**Bench now:** resources **version 29** installed (data reserve 16 MiB, index 64 KB: the
`build-resources.ps1 -Quick` cycles work without a download); master **revision 70**
(scripts' default: **raise it by 1 after each change of `server/master_data`**, then
`relogin.ps1` twice: on the first the client downloads the masters and crashes, known, on the
second it gets in); `server/master_data` is outside the repository (ignored): the
Moogle Shop table is regenerated by `node server/make-moogleshop.js`; server and app are restarted with `tools\ldplayer\session\relogin.ps1 -Tag x`.
If LDPlayer is off: `ldconsole launch --index 0`, then `ld.exe -s 0 "sh
/mnt/shared/Misc/phaseb-guest.sh 192.168.1.185"`. Test save in
`server\save\player.json`: Donald 2★ (evolved, trait STR +1000), stack of 3 Huey & Dewey &
Louie, locked stack of 4 Dewey, Goofy removed from the deck (`player.deck` 1,0,3), Donald Ver. A
6★ (userMedalId 120, for the trait tests), munny ~31,000, jewels 4,000, 10 Rainbow Gems.

**Done on 9–10 October** (details in the «Notes for later» below and in the commits):
Medal List, selling (stacks, quantity popup, currency icons, animated selection
frame), Level Up, Evolve, lock, Unequip, Sort/Filter popup, Sell Materials
(selling and style), «Complete!» popup, red band and «1/N» of the quantity popup,
Moogle Shop (Items tab with working exchange, Traits tab with all rows).
**Done on 10 October (evening):** complete trait exchange («Select Medal» popup, addition
and replacement, cost deducted only if the exchange succeeds; see «Moogle Shop — traits» in the
notes); missing special attacks generated (`burst`: 11 real rows + 321 generated by
`make-game-tables.js`, revision 70; the detail of evolved medals no longer
crashes). **Done on 10 October (night):** Profile (screen, Titles, Name/Message, Play
Style; see «Profile — done» in the notes). **Next, in order:** 1) Profile Outfits,
Avatar Boards, Other, menu scroll; 2) quest 8. Profile: avatar `260,95`;
Titles `330,1030`, Name/Message `808,1030`, Play Style `1155,1030`, Outfits `1590,1030`.

**Taps on the bench (screen 1920x1080):** from home Moogle Shop `288,1000`; tabs Traits
`340,250` / Items `700,250`; «Exchange» of the first row `1213,512`, OK `1220,712`; trait:
row STR +1000 `600,400`, «Select Medal» `788,1012`, then **drag** the medal onto the
slot (`Swipe 1640 290 630 330 900`: a tap opens the detail), «Set Trait» `840,1010`; Sell
Materials `1205,250`, then material `1200,430`, Sell `1183,930`, confirm `1220,715`.
Medal List: MENU `1790,45`, `1745,697`; Sell Medals `335,262`. Crash analysis: private tools.

**Method (user's rules):** style of every screen from the originals found online
(screenshots/videos in `reference\<schermata>\`, yt-dlp in `D:\Progetto_Restauro_KH_UX\tools\yt`
with `PYTHONPATH` and `--js-runtimes node:<node.exe>`); known resources in the catalog
`D:\Progetto_Restauro_KH_UX\catalog\index.html`; note in this file the buttons,
screens and actions not yet dealt with; commit + push after each verified step.
**Cycle for a missing screen:** `func_strings.py` + `widget_lookup.py` (names
looked up from the code), `text_ids.py` (missing texts), layout in `make_layouts.py`
(`build`/`copy`/`scene`/`func`), missing textures in `make_textures.py`, test with
`build-resources.ps1 -Quick` and `scratchpad tap.ps1`-like (bench_lib Tap/Shot); crashes are analysed
with private tools.

### How to resume the work (state as of 9 October 2026, afternoon)

**State as of 9 October, in short** (details in §2, «The locked drop-down menu»,
«Button mapping», «Equipment — solved», «Replacement layouts»):
- tutorial finished from phase 995: drop-down menu working; Equipment working
  (`GET /keyblade/subslot`); Presents working (replacement layouts + texts);
- bench: **resources version 26** installed (= OBB 5.0.1 + addnl + generated package:
  maps, empty LWFs for pet/NPCs, layouts from `make_layouts.py`, replacement Armature
  animations, **2,332 original `text/ui` texts** from the 4.4.0 IPA); master revision 57;
