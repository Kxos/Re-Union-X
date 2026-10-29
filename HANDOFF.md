# Resuming the work

This file exists **only to restart**: current state and next step. Problems are in
[docs/ISSUES.md](docs/ISSUES.md), technical knowledge in [docs/notes/](docs/notes/), history in
[docs/journal/](docs/journal/) (the old full HANDOFF is in
[docs/journal/fino-al-2026-10-11.md](docs/journal/fino-al-2026-10-11.md), the states from 14 to 16 October in
[docs/journal/fino-al-2026-10-16.md](docs/journal/fino-al-2026-10-16.md), the state blocks from 17 to 22 October in
[docs/journal/2026-10-22.md](docs/journal/2026-10-22.md)).

## The project

Restoration of **Kingdom Hearts Union χ** (Android WW 4.3.1 client, service shut down in 2021): a
Node server (`server/server.js`) answers the **original**, unmodified client, which runs on
**LDPlayer 9 (Android 9)**, the only bench where the LIAPP protector lets it start
([protector](docs/notes/protector.md)). The resources are the 5.0.1 OBBs + `addnl` from the iOS 4.3.1 IPA +
the packages we build (original JP/2016 stages and rooms, original and rebuilt CocoStudio layouts, textures, medals,
enemy graphics). You can play from the new player to the home screen, story quests **1-979** on the original stages
and rooms (JP 4.3.1 data), Medal List, selling, Level Up, Evolve, Moogle Shop, Shop, Profile, Missions, Avatar Boards,
pet; every deviation from the original is declared in the in-game Notices
([docs/NOTICES.md](docs/NOTICES.md), [web page](https://kxos.github.io/Re-Union-X/notices/)).

## Restarting

Bench state (23-10 morning): **resources 62 installed** (4.22 GiB, 40 parts; after `update-resources.ps1` tap KHUX START (200,1020) and Download (1220,715) by hand; before: 56 (21-10), 49 (20-10: compacted, 3.90 GiB; above 4 GiB tested with 48, I-171 closed)), **master revision: BASE 180** (default of the 4 session scripts; the server sends `BASE*100000 + past deadlines`, [server.md](docs/notes/server.md#orologio)). Fake clock
(twin months 2016-2021), `-RealNow <ISO>` to test a week change: [server.md](docs/notes/server.md#orologio);
full history in [fino-al-2026-10-16.md](docs/journal/fino-al-2026-10-16.md).

```powershell
# emulator (if off)
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ldconsole.exe launch --index 0
# server + re-entry of the saved player up to the home screen
.\tools\ldplayer\session\relogin.ps1 -Tag x
# MANDATORY after every emulator start, otherwise the «End of Service» popup
D:\Progetto_Restauro_KH_UX\LDPlayer\LDPlayer9\ld.exe -s 0 "sh /mnt/shared/Misc/phaseb-guest.sh 192.168.1.185"
```

- After an emulator restart the client may re-download the latest version (~4.2 GiB, minutes).
- At every master revision bump the client shows the Download popup: since 26-10 it announces only the master (~24 MB), tap Download ([server.md](docs/notes/server.md)). Never lower the revision in the session scripts.
- Windows IPv4 DNS on **192.168.1.185** during tests, **automatic** at the end of the session. Guest network broken
  («7 ERROR», `ip route` with no default): `ldconsole reboot --index 0`, `sys.boot_completed`, `phaseb-guest.sh`, relogin.
- Layout tests: `.\tools\ldplayer\session\build-resources.ps1 -Quick` (~40 s, no
  download if the sizes stay within the reserve). **Never `-Quick` if there is a version newer
  than the installed one.** A full version (`-Version N`) is downloaded right away by the
  client: only with the bench stopped, then `update-resources.ps1`.
- After every change to `server/master_data`: raise the revision in the 4 session scripts and
  `relogin.ps1` (twice if the first one crashes). Do not restart only the server with a session open.
- Crashes: `tombstone.ps1`; the deeper crash capture tools and their recipe are private (outside the
  repository). `D:\Progetto_Restauro_KH_UX\tmp\repro.ps1 <name> <x> <y>` taps, saves
  requests, logcat and screenshots. Taps only while the game is alive (`bench_lib` refuses taps with the game closed).

## State and next step

(Older state blocks, 17-22 October: [docs/journal/2026-10-22.md](docs/journal/2026-10-22.md).)

- **29-10 (read first).** Bench instance 0: resources **77** installed + master **rev 205** (maxpower save, home reached; tombstones of the install = emulator sensors/audioserver). Done 29-10: I-194 CLOSED (user bench, all 245 families); **I-213** counter crash on Give Up / Supernova = use-after-free: boss HP bar `_S_Boss` lacked `SpEnm_NumNull`/`CounterAtk_NumNull`, grafted from `_S` (`import_jp_coco.py` `graftww=`, notice updated); **I-214** thunder of 806-808 (original hole_thunder: JP LWF + 9 textures shared with hole_rain); **I-215** snow particles (459-464, 781-783) + 79 original room animations (366 quests), `originals.tsv` sections 42-44. All three TO VERIFY by the user on 77: 808 starts with thunder; 809 Supernova + Give Up; Give Up in 735/790/800/598; counter number next to the boss bar; room animations in 11-13, 25, 121, 371, 491-496. Next: play package rebuild (rev 205 / resources 77).
- **27-10 NIGHT (previous).** Bench instance 0: resources **76** + master **rev 205** (maxpower save, home reached; update-resources gave up before the Download tap: tap Download (1220,715) by hand while the server is still up, then relogin). **All 245 enemy families complete** (05e06f1; I-194 TO VERIFY). User bench checks still open: the new looks of the 16 families completed 27-10 (1532, 1535, 1536, 1554, 1560, 1563, 1608, 1628, 1635, 1645, 1646, 2005, 2006, 2010, 2022, 2024), (verified by the user 27-10: Green Requiem heal counter, cost 999, Fiend «320% BONUS»); I-212 open decisions (0-4 dot fallback, 302012 Xion). Next: play package rebuild (rev 205 / resources 76).
- **27-10 LATE.** Bench instance 0: resources **75** installed + master **rev 205** (maxpower save, home reached after an emulator «System UI not responding» popup: tap Attendi, then KHUX START by hand). Complete enemy families **243/245** (hunt27 A af79a1c, B b9ad9d3, 1645 v2 7d645b5; generator: source manifest ab46688, LWF names outside the texture table ignored). Left: 1635 Soda Specter and 2010 Phillip -> hunt28 found A originals (`tmp\dedup\hunt28\`: proposal.tsv 15 rows; optional proposal_side.tsv 2010 bm17 blink, proposal_1635_classfix.tsv 36 rows no visible change), sheets 1635.png/2010.png waiting for the user. Still to check by the user: Green Requiem q592 + counter, cost 999, Fiend 320% BONUS in battle; I-212 open decisions (0-4 dot fallback, 302012 Xion).
- **27-10 EVENING UPDATE.** Bench instance 0: resources **74** installed + master **rev 205** served (`relogin.ps1 -Save maxpower -RealNow 2026-12-09T10:00:00Z`), home reached; tombstones 02/03 of 27-10 = emulator system services (audioserver/sensors), not the game. To check by the user: Green Requiem green look + counter (q592), cost 999 of the support Medals, Fiend «320% BONUS» hit in battle. Running: hunt27 texture hunt for the 16 incomplete families (agents, `tmp\dedup\hunt27\A` = 1532/1563/1554/1560/1535/1536/1608, `B` = 1628/1635/1645/1646/2005/2006/2010/2022/2024) -> user approval -> integrate, resources 75.
- **STATE AS OF 27-10 (DAY).** Bench instance 0 ON: resources **73** installed today (the server announces the
  newest built version: the client downloaded it), master served **rev 203** (`relogin.ps1 -Revision 203 -Save maxpower
  -RealNow 2026-12-09T10:00:00Z`), Windows DNS on 192.168.1.185. Session scripts at **rev 205** (= 204 enemy rows + I-211
  cost 999 + Green Requiem counter): **never serve 204/205 on resources 72/73**. Done 27-10: 1527/1542 integrated (rule
  `dedup-wwrecord-override`, 6babf2d), Green Requiem atkSp complete (aed2189) and its counter back on (29ecf74, local
  schema `enemy_counter_moves.json` changed, backup tmp\enemy_counter_moves.before-gr-2026-10-27.json), I-211 (26a3f4f,
  notice «Support Medal Cost»; bench check of the 999 still to do). I-212: the Medal detail «Damage» never includes the
  guilt in the 4.3.1 client (decompiled analysis tmp\i212\ANALYSIS.txt; ours = x1.00-16.00 like the original formula;
  khuxwiki Max = base x guilt); waiting for the user: what value they saw wrong, battle check of the «320% BONUS» hit,
  decisions on the 0-4 dot fallback of the SN++ rows and 302012 KH III Xion (medaglie.md#sn-fiend). **Running/next:**
  1) reccheck on all families: `tmp\dedup\reccheck27\` (64 suspect slots in 28 served families; record index often
  NOT shifted: the `stesso` same-name rule picks neighbouring frames). User 27-10: 13 families integrated (b00ea5c),
  251/1536/2510 keep ours; 21/55/98/113/140/169/2003 = triage artefact (those slots are served from the 2016 package,
  `tmp\dedup\reccheck27\fix7\FIX7.md`, sheets fix_<fam>.png): user confirmed "no change" 27-10; fallback_jp.tsv
  (868 rows) not integrated. Generator bug fixed (ab46688: sources.json manifest, files rewritten when the source
  changes; enemy_gen fully rewritten 27-10). Future rechecks: build the served map from plan_enemy(), not texsrc.json;
  43 tierA rows of unserved families not triaged; 2) build resources **74** (`build-resources.ps1 -Version 74`),
  `update-resources.ps1` (+ KHUX START / Download), relogin with rev 205; check Green Requiem green + its counter in q592,
  cost 999 screens; 3) user bench of the counters; 4) play package (rev 205+ / resources 74).
- **STATE AS OF 26-10 EVENING.** Bench instance 0: resources **72** installed, master served **rev 203**
  (Green Requiem counter off). In the repo: session scripts at **rev 204** = enemy rows pointing at the new graphics of
  hunt26 (Green Requiem now display 1502 instead of Yellow Opera 5003): **never serve rev 204 on resources 72** (missing
  graphics). Resources **73** built (227 complete families) but NOT installed (skip it: build 74 tomorrow). **Tomorrow, in
  order:** 1) integrate 1542 Golden Hook Bat (OK as proposed) and 1527 Flutterings (7 proposal rows + the 5 corrections of
  `D:\Progetto_Restauro_KH_UX\tmp\dedup\hunt26\verify\proposal_1527_corrections.tsv`, rule dedup-wwrecord, they must
  override the old wrong pieces bm13/bm19/bm30/bm42/bm43; user approved the comparison 26-10), rows from
  `tmp\dedup\hunt26\proposal.tsv` filtered to 1527/1542; then `python recon/tools/make_jp_enemies.py --jobs 2` twice and
  `node server/make-enemy-oltre.js` (now reapplies enemy-mechanics), suite; 2) run `tmp\dedup\hunt26\verify\scripts\reccheck.py`
  on all families: old dedup/same-name rules may have served wrong pieces elsewhere (as in 1527); proposals to the user;
  3) build resources **74**, `update-resources.ps1` (+ KHUX START / Download), relogin with rev 204+; check Green Requiem
  green in q592; 4) Green Requiem counter: its atkSp still lacks a piece -> counter stays off until complete (then
  `attackMotion` 2, `attackTarget` 3, row 992070010, move it back from `waiting` in
  `reference\world_schema\oltre525\enemy_counter_moves.json`); 5) user bench of the counters (Barrier Master DEF to allies
  with atkSp, an Archer status) — Emerald Sonata verified 26-10; 6) I-211 (cost 999 for boost/evolve/EXP/sell Medals),
  I-212 (SN++ - Fiend damage multiplier vs khuxwiki); 7) rebuild the play package (rev 204+ / resources 74).
  Done 26-10: I-134 + VIP Draws/Free Deals (rev 192-195), download popup fix, resources 72, I-207 counters restored for 24
  families with `attackTarget`/`attackMotion` from the client analysis (private notes tmp\i207\client), I-194 hunt26
  (+25 families). Remember: Windows IPv4 DNS back to automatic at the end of the session.
- **STATE AS OF 26-10 (DAY).** **I-134 CLOSED + VIP Draws** (user's decisions 26-10, details in [shop.md#vip-draws](docs/notes/shop.md#vip-draws)): master **rev 197** (session scripts; content of rev 195: drawMedalType with benefitId 100 on 73 rows: 39 VIP twins + 13 per-medal VIP rows of Sep-Nov 2019 + 22 VIP Free Deals incl. 5 «[WJE]»; all 34 Free Deals share one draw a day and are keepable, `shop.json` pass rows from `server/make-shop-rows.js`), served on bench instance 0; resources **72** installed 26-10 (full version, English `Txt_Lock` on two lines). VIP benefit = all the Weekly Missions of a week -> rest of the week + next week (`server/vip-benefit.js`; nobody can earn it until Raid Boss / Union Cross exist; review in I-164); `relogin.ps1 -Vip 1|0` forces it. Bench 26-10: padlock tap no crash, English panel, `-Vip 1` unlocked + VIP draw B0434 -3000 OK (save `maxpower` spent 3000 Jewels). The 17 VIP Free Deals need the benefit too (user, 26-10). **I-207 (26-10):** proposal for the 22 ambiguous + 8 flavor-only counters in `D:\Progetto_Restauro_KH_UX	mp\i207\proposal\` (14 high, 8 medium, 4 family estimates, 4 false positives); the move at 0 is per family (research `D:\Progetto_Restauro_KH_UX\tmp\i207\research\REPORT.md`), so the 127 counters of 25-10 are SUSPENDED (master **rev 198**, absorb kept, notice updated). Online research 26-10 (`D:\Progetto_Restauro_KH_UX\tmp\i207\online\ONLINE.md`): red counter = per Medal, blue = per hit, at 0 the enemy interrupts with its family move, the turn goes on, the counter resets to its start value; moves documented for ~23 families (khuxwiki Coliseum Quests pages). Local data hunt found nothing new (`tmp\i207\hunt\HUNT.md`). **User decision 26-10:** re-enable ONLY families with a documented move, creating the move row from the documented effect/value when no original row exists, original values searched online; families without a documented move stay off. **Done 26-10: master rev 203** (Green Requiem counter off until its graphics, user) (rev 199 + `attackTarget` fix, then `attackMotion` 2 on the ally-targeted moves of Emerald Sonata and Barrier Master after the user's bench checks), 24 families / 44 enemies restored (`reference\world_schema\oltre525\enemy_counter_moves.json`, 7 new rows 992070001..), notice updated; the 6 wiki-only families stay off after a recheck (`tmp\i207\recheck6\RECHECK.md`). **Next:** Green Requiem still hits its allies for 1 (Yellow Opera look without atkSp) until its textures are found; I-194 texture hunt for the 43 incomplete families incl. Green Requiem (shown with the Yellow Opera look), then rebuild the play package (rev 200 / resources 72).
- **STATE AS OF 25-10 EVENING.** Play package delivered: a tester (author's friend) played it on another PC; the content creator received it (emails sent 25-10). Current package `D:\ReUnionX-work\Re-Union X` (2026-10-25.1507, resources **69**, master rev **187**, start save = maxpower medals + Proud 1-979, 100,000 jewels, no party). Fixed today, all committed: I-208 Extra Attack second use (Again LWFs), I-209 «Gauge +N» x10000 (verified by the user), Outfits > Save (`/user/avatar/update`, «200 ERROR :43»), review fixes of `tools/play` (shares, fresh LDPlayer, ports, previous log, APK from the guest), ChatScene imported from JP. **Open:** I-210 party chat crash (no chat service; package save has no party as a stopgap); clean-PC rehearsal never done; bench checks of the 120% Extra Attack hit, `Burst_Medal_Change`, HP MAX/cures/Count +N; 11 minor review points (ledger in `private\plans\play-package-ledger.md`); `test-master-clock` (timing) and `test-medal-guilt` (test argument) fail also before today's changes. **Bench instance 0 updated 25-10 evening**: resources 69 and rev 187 installed, save `maxpower` pruned to 2900 live medals (it had 3284 > 3000 storage: every quest refused; backup tmpplaymaxpower.before-prune-2026-10-25.json), home reached with `relogin.ps1 -Save maxpower -RealNow 2026-12-09T10:00:00Z`. Next (agreed 25-10 night, after /compact): **1) I-207 step 1 DONE 25-10 (master rev 188**, `server/enemy-start-state.js`, fixed in place on the built master; bench check by the user: q180 Blue Gummi Copter loses DEF M on turn 1, q394 White Rose asleep, q920 Chocolate Monster no +5 Upright ATK); step 2 DONE (rev 189, missing counter attack 1501001; bench still on 188 until the next relogin); steps 3-4 DONE (rev 190 counters/absorb, resources 70 with the JP counter/absorb/reflect UI; install with update-resources then relogin; bench by the user: q920 Chocolate Monster 20-hit, q585, q592/601/649, q977 slot 3, q806/810 absorb); I-207 left: 22 ambiguous + 8 flavor-only counters, reflect (ISSUES has the decisions). **2) I-210 DONE 25-10** (rev 191 + resources 71 installed on bench instance 0; chat verified: stickers, text, delete, kept after relogin). Next package build will carry rev 191 / resources 71. **3)** bench of the new enemies when the user can play (list in this conversation's handoff: quests 977, 975, 965, 955, 935, 931, 927, 920, 915, 910, 885, 880, 860, 835, 771 + 570, 589, 600, 602, 607, 662, 684, 686, 760, 853, 864, 890). Review minors of the play package: all fixed (commits 599ba58, 50c1464); server suite 52/52 + test-log-dir. Dedicated LDPlayer instance «Re-Union X» = index 1 (package tests; data folders D:\ReUnionX-work\data, data2). **I-136 CLOSED 25-10 late** (c13435f: resource stream errors close the response, server stays up; server-only, active at the next relogin; suite 58/58). **Next session: I-134** (Shop > Draw padlock crash, misc 720/721; needs a user tap on the bench to confirm), then the user bench checks above.
- **STATE AS OF 25-10 MIDDAY — PLAY PACKAGE.** New: a private, ready-to-play package for testers (`tools/play/`, see SETUP «Play package»): the server runs **inside the LDPlayer guest** on a pinned Termux Node.js (no PC server, no Windows DNS, no IP), started by `Play.bat` on a dedicated LDPlayer instance **«Re-Union X» (index 1)**; instance 0 and the bench files are untouched (hashes checked). Build: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\play\packaging\make-play-package.ps1 -Out <dir> -Resources 66` (5.4 GB; never in git). Rehearsal 25-10 in D:\ReUnionX-work (pkg + data): cold start 154 s to the title, full resource download in the guest ~3 min, home, quest start, second start without download, Play with the emulator open. Guest DNAT must target the guest's own wlan0 address (127.0.0.1 is dropped by Android policy routing). The start save (`server/make-package-save.js`) = maxpower medals + Proud 1-979 progress, spare duplicates sold to stay under the 3000-slot storage. Leftover for the author: delete D:\ReUnionX-test (partial first build). Bench: rev 186 still unserved, resources 66 installed, 67 build unfinished (`_build_67`).
- **STATE AS OF 23-10 NIGHT.** Master **rev 186** (4 session scripts), NOT served yet: the bench runs rev 185 + resources **66** (installed 23-10, save `evolvetest`). Resources **67** built at the end of the day from enemy_gen with the whole-LWF copies (44e5d53); the Q960 stage file (Lv 1900, 7f81539) may have been written after the build started: if `stage_gen\files\stage` is newer than resource_data\67, build **68** before installing. Then `update-resources.ps1` (+ KHUX START / Download) and `relogin.ps1 -Save maxpower -RealNow 2026-12-09T10:00:00Z`. **Done 23-10 evening:** enemy families complete 149 -> **202** of 245 (I-194: dedup copies + reviews A-G + downscaled copies + whole LWFs from the 2018 WW name index, tmp\thethiny_x\bundle2016\names.tsv; 43 incomplete, mostly texture pieces); I-205 evolve materials + wiki evolutions (Terra evolve verified on the bench); I-206 late story HP restored above Lv 999 (local override reference\world_schema\oltre525\enemy_hp_oltre.json from tmp\balance; 979 = 6.5e11; misc 203 kept = original 300,000); save **maxpower** (server/make-maxpower-save.js: 337 tier 8-10 medals maxed, traits Extra Attack 120% + DEF -70% + STR, Attack Boost XV Max, 16 keyblades +60; check the NOVA level 3614 display). **Bench 23-10 (rev 185, res 66):** no crash in 14 quests (979 Ephemer & Skuld original look, 789 Jafar Cobra cleared, 813, 883, 856); the provefine team loses from ~813 on. The check script tmp\enemy_check.ps1 failed to open 9 quests from the list (navigation, not the game) and was killed for low memory. **Next:** 1) bench with maxpower: quests 977/975/860/835/880/910/927/771/915/920/955/965/885 + the new complete families (570/589/600/662/602/760/607/684/686/853/864/890/931/935) + the other evolutions (Blue Fairy, Pongo, Meow Wow, Halloween C, Puppy) in evolvetest; Candy Plant mask, Calhoun irises; 2) **I-207 enemy mechanics** (counters etc.); 3) remaining 43 incomplete families: unseen proposal tmp\dedup\unseen (not approved yet) and texture sharers in tmp\dedup\lwfhunt\work\texholes.tsv; 4) HP model for 856-950 is low confidence (videos listed in tmp\balance\REPORT.md). Open decisions: Kyroo SAB 7-9 munny only; Fantasia Mickey A/B sources; Queen of Hearts counts.
- **STATE AS OF 23-10 EVENING.** Master **rev 185** (default of the 4 session scripts, NOT served yet: the bench still runs rev 183 + resources 63). Resources **64/65/66 built, none installed**; plan agreed with the user: build **67** after the round-7 integration (overrides_G: 1635 atkSp legs, 2506 feet) and install it once (`update-resources.ps1`, then KHUX START (200,1020) + Download (1220,715); after an emulator restart run phaseb-guest.sh first). rev 184/185 point at enemy looks that only exist from resources 64+: never serve them on 63. **I-194 (enemy textures) — dedup discovery 23-10:** the BGAD containers store identical files once, so missing enemy textures sit in other folders (films lwf/drama, raids, burst, npc). `recon/tools/dedup_match.py` (order alignment of texture tables), `dedup_review.py` (own-family donors, mask/blend-aware renderer: high 16 bits of place.depth = Flash clip depth), `dedup_rescale.py` (downscaled copies, never upscale), `dedup_export.py` (proposal + tmp\dedup
eview\overrides_*.tsv merged with the allow-list `recon/tools/extra_donors_dedup_approved.txt`) -> `recon/tools/extra_donors_dedup.tsv` (rules dedup-order / dedup-override / dedup-rescale), read by `make_jp_enemies.py --dedup`. Every pick was approved by the user on comparison sheets (tmp\dedup\sheets, review
3..r7_<fam>.png, rescale\sheets); the user flags families, review agents fix them, then one integration pass. Complete families: 149 (morning) -> 185 (ca5efd6) -> ~186 with G. Regeneration: `python recon/tools/make_jp_enemies.py --jobs 4` twice, then `node server/make-enemy-oltre.js`. Remaining: ~59 incomplete families, mostly a whole missing LWF (dead / allies' wait) -> community or video; a few sourceless pieces (Ephemer 8x1 mouth, 1560 big slashes, 1635 sparks); 2006 cites 13 PNGs not in any table (generator decision). Incomplete families keep the substitute look, so their approved fixes (1560 feather, Ralph eyes 2014/2015/2020) stay invisible until complete. **I-205 (evolve materials)** fixed in c9259dd (`server/evolve-wiki.js`: Fantasia Mickey B for SN++ upgrades, combinations, self-copy evolutions); adding the wiki evolutions missing from the master (Meow Wow, Halloween C, Puppies, Blue Fairy) in progress. Open user decisions: Kyroo SAB 7-9 munny only; Fantasia Mickey B only from 3 banners (715/730/735), Fantasia Mickey A no source (Moogle Shop?). **Bench checks after resources 67:** save `evolvetest` (Terra 1 Fantasia Mickey B, HD Roxas 2); new complete enemies 725/860 (Shipwreck Shark arcs), 787/788/839, 813/814, 835, 880, 883/884/945, 910, 927-929, 975, 977, 979; Candy Plant attack (915/917/922: is the bulb clipped by the mask?), Calhoun irises (905/965), Ferry Reaper 750, smoke defeats 1590/1592/2503, I-199 guest allies, older new looks 682/704/840/927/787. Older I-194 decisions (samename rule, 1544 lid, rescale scan, 1511/1516 splash) are superseded by the dedup work.
- **STATE AS OF 23-10 MORNING.** Master **rev 180** (Beginner 9-10 reward = type 28 Skip Ticket+, checked in the client), resources **62** installed (I-203 Optimize button orange `But06` via `restyle=`, verified on the bench in the Story Q595 and Proud Q979 start popups). LDPlayer had been restarted: `phaseb-guest.sh` was missing (End of Service popup), rerun before `update-resources.ps1`. **Next step:** bench checks still open: new looks 682/704/840/927/787 and guest allies 350/525/760/905/977 (I-199); I-203 closed (Skip Tickets spent, bench 23-10). Saves: `proud979` reset again (979 objectives removed; played copy in D:\Progetto_Restauro_KH_UX	mp\proud979.played-2026-10-23.json; `-Save` writes into the file, so playing 979 spends the reset again), `proudall` also has 979 cleared now (played 22-10), `skiptest` = proud979 with 979 objectives + Skip Tickets (now 2 normal + 7 Skip Ticket+; `beginnerSince` moved to 2026-12-08 so the Beginner tab shows), `skipstory` (story stopped at 672, Skip tickets 2 + 1). Skips do not raise the Lux Record; `img/ui/ST_Ticket_Icon.png` alias in the guest via `-Quick` (next full version includes it). Banner unlock popup: dropped by the user (23-10) — the original client can only show server content in the login news popup (action 31) or as an image in the Quests category pickup carousel (`/stage/pickup` `pisckupStages`, verified on the bench, tap does nothing), no popup on the Story list and no OK -> Shop. Next: I-204, then the open bench checks (I-199, new looks). Story «Progress: 1%» on these saves is right (88/5,868 objectives: their quests were unlocked as cleared without objectives).
- **STATE AS OF 23-10 (END OF DAY).** Master **rev 179**, resources **61** installed (combined objectives animation, I-202 closed). Saves: `provefine` (story 979), `proudall` (all Proud cleared except 979), `proud979` (979 objectives reset), all with `-RealNow 2026-12-09T10:00:00Z`. Verified on the bench 22-10: Proud Mode (I-200 closed: list, popup, condition blocks Special Attacks, levels 210..7000, 801+ all together, 978 cutscene), quest category percentages (I-037 closed), COMPLETE rule (I-201: original = cleared, not objectives; newStageId 0 fix). **Next step:** build resources 62 for I-203 (Optimize button orange via `restyle=` in jp_coco_layouts.txt), install, check the Proud and Story start popups; the bench checks still open: new looks 682/704/840/927/787 and guest allies 350/525/760/905/977 (I-199). Skip button: shown only with Skip Tickets (`stageSkipTicket`); /stage/start does not consume them yet (I-203). Proud panel title «RULE» (JP texture) accepted by the user. Community: Reddit donations in D:\Progetto_Restauro_KH_UX\Reddit Donators\ (DONATORE.txt per donor; ReLux Team analysed: notices/banners -> private events catalogue D:\Progetto_Restauro_KH_UX\private\events, 38 banners in reference\banners\from_relux); portal gallery with 12 screenshots; name note about the separate project KH ReUnion. Legal: history rewritten twice, GitHub Support ticket open (updated with the second rewrite), fork ZarxielZerg still has the old history (issue #1), local backups tmp\repo_backup_pre_rewrite*.bundle never to be uploaded.
- **STATE AS OF 22-10 EVENING.** Master **rev 179** (Proud Mode rows I-200, guest allies I-199, new looks for 6 families); resources **60** being installed on the bench (download continued after update-resources.ps1 gave up: when the home appears, `relogin.ps1 -Save provefine -RealNow 2026-12-09T10:00:00Z`), then the bench check of Proud 1/3, quests 682/704/840/927/787 (new looks) and 350/525/760/905/977 (allies). **Legal cleanup done (22-10)**: audit (D:\Progetto_Restauro_KH_UX\tmp\audit\AUDIT.md), HEAD cleaned, history rewritten with git filter-repo and force-pushed, repo renamed **Re-Union-X** (site https://kxos.github.io/Re-Union-X/), commits with the GitHub noreply address; decryption/protector tools moved to D:\Progetto_Restauro_KH_UX\private (outside the repo, found by recon/tools/private_tools.py); GitHub Support ticket sent (cached views + GC); fork ZarxielZerg/KH-UX-Dark-Road-Restoration still has the old history (owner to be asked via an issue). Rules: never publish SE files, download sources, circumvention tools, decompiled code, private communications. A second independent legal check is running.
- **STATE AS OF 22-10 AFTERNOON.** Master **rev 177** (default of the 4 session scripts); resources
  **58 installed** on the bench (22-10 evening; 57 built and superseded); save `provefine` with
  `relogin.ps1 -Save provefine -RealNow 2026-12-09T10:00:00Z` (day 12-09: Login Bonus received, verified by the user;
  use 12-10 for the next one). Bench check done (user, 22-10): Quest 850 Guard Armor Ω and Quest 670 Chill Ripper (original
  look, reconstructed defeat) work; timed quests 595, 619, 633, 643, 655 start correctly (time panel layout). Done in the afternoon: I-194 integration of the original copies found by content
  (`recon/tools/deep_donors.py`, `extra_donors_deep.tsv`; rev 176: 1028 Guard Armor Ω), 1524 Chill Ripper completed
  (dead of the DR twin 5045, user's decision, rev 177): **142 complete families**; 526-979 family rows: 46 own graphics,
  28 Dark Road, 148 base; ~88 families still missing (including the 6 DR medium placeholders). Notices exported by
  `node server/export-notices.js` to `docs/NOTICES.md` and the GitHub Pages page `docs/notices/` (newest first); all
  docs and commit messages in English.

### Open priorities

- **Enemy/NPC graphics of quests 526-979 (I-194)**, priority: source order, status and next steps in
  [ISSUES](docs/ISSUES.md) and [journal 2026-10-22](docs/journal/2026-10-22.md); ~88 families still missing.
- User's open items: I-191 (active banners on the home screen), I-192 (Beginner's Guide WebView), checks against
  the Roboloid data and the wiki's Special Attack page; final web page «Re-Union X» (public project name since 22-10) only as the LAST task.
- Trait deals unlocked by the story 526-979 (e.g. B0259 at quest 725) not yet seen on the bench (I-084,
  [medaglie.md#trait-medal-b](docs/notes/medaglie.md#trait-medal-b)).
- Open Shop items: I-139, I-140, I-141, I-142, I-143, I-145, I-146, I-151 ([shop.md](docs/notes/shop.md)).
- Other pending work (Limited I-118, Blue Fairy and PvP I-126, JP NPCs, intermittent crashes):
  [fino-al-2026-10-16.md](docs/journal/fino-al-2026-10-16.md) and [ISSUES](docs/ISSUES.md).
- Long term: resource balance I-164 and event Boosters I-166 (both ON HOLD).
- Test saves: `provefine` (all 979 quests), `prove`/`prove525`/`provetm`; backups of the real save and the
  test changes made to it: [journal 2026-10-22](docs/journal/2026-10-22.md).

## Work rules (from the user)

- **Commit + push at every verified step**, without asking; `git pull --rebase` before the push
  (other agents commit in parallel). Messages in English (since 22-10 all repository docs are in English too), ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git -c safe.directory=*`,
  `git commit -F <file>`; UTF-8 without BOM.
- **Style from the originals**: before building a screen, look for screenshots/videos/data
  of the original, save them in `D:\Progetto_Restauro_KH_UX\reference\<screen>\` and
  match them; style check at every step.
- **Parallel agents** for independent work off the bench; the bench stays serial
  (one script at a time). The user watches the bench live: every report of theirs is true,
  verify with screenshots.
- **Dialogues and cutscenes: always press SKIP** when it appears.
- At ~40% of the context: no new tasks, let the running ones finish, commit+push,
  update this file, ask the user for `/compact`.
- Only original code and documentation in the repository: never APKs, assets, Square
  Enix master data or decompiled code (`.gitignore`).

## Where to look

| File | Content |
|---|---|
| [docs/ISSUES.md](docs/ISSUES.md) | all problems, open and closed, with status and proof |
| [docs/notes/banco.md](docs/notes/banco.md) | LDPlayer bench, scripts, `-Quick`, taps, crash capture, pitfalls |
| [docs/notes/server.md](docs/notes/server.md) | protocol, startup chain, master, resources, save |
| [docs/notes/risorse_layout.md](docs/notes/risorse_layout.md) | BGAD, BTF, resource rules, `make_layouts.py`, missing layouts |
| [docs/notes/battaglia.md](docs/notes/battaglia.md) | stage API, HP/CP/chests, empty slot, defeat |
| [docs/notes/mappe_storia.md](docs/notes/mappe_storia.md) | STG/MAP format, exits, generator, rooms, enemies |
| [docs/notes/medaglie.md](docs/notes/medaglie.md) | Medal List, selling, Sort/Filter, Level Up, Evolve, graphics |
| [docs/notes/moogle_shop.md](docs/notes/moogle_shop.md) | Moogle Shop and traits |
| [docs/notes/guilt.md](docs/notes/guilt.md) | guilt and Level Up with special medals (Chip, Dale, Cid) |
| [docs/notes/union_cross.md](docs/notes/union_cross.md) | Union Cross (multiplayer): `/multi/*` routes, tables |
| [docs/NOTICES.md](docs/NOTICES.md) | in-game Notices (generated by `node server/export-notices.js`, also `docs/notices/`) |
| [docs/notes/shop.md](docs/notes/shop.md) | Shop > Draw: /gacha/list, /gacha/draw, plates, raisedraw, tests |
| [docs/notes/bacheche.md](docs/notes/bacheche.md) | Avatar Boards |
| [docs/notes/home_profilo.md](docs/notes/home_profilo.md) | home, Other, Profile, Missions, pet, Presents |
| [docs/notes/analisi.md](docs/notes/analisi.md) | `recon/tools` tools |
| [docs/notes/ricerca_esterna.md](docs/notes/ricerca_esterna.md) | downloaded files, sources, contacts |
| [docs/notes/protector.md](docs/notes/protector.md) | LIAPP and choice of the bench |
| [docs/journal/](docs/journal/) | journal by day (archive up to 11 October, text removed in f10ea90, states 14-16 October, [state blocks 17-22 October](docs/journal/2026-10-22.md)) |

Detailed research notes (addresses, client internals, protector, crash capture) are kept in a private
folder outside the repository (`D:\Progetto_Restauro_KH_UX\private\docs_full\`), never in the public docs.

Setting up a new machine (prerequisites, clone, certificates, Windows network): §3-§4 of
[docs/journal/fino-al-2026-10-11.md](docs/journal/fino-al-2026-10-11.md).

## How to update these files

- **New problem**: a row in [docs/ISSUES.md](docs/ISSUES.md) with the next free ID (never
  reuse an ID) and the technical detail in the right file of `docs/notes/` (with an
  `<a id="...">` anchor to link). When it is closed: status CLOSED, row moved to «Closed», proof =
  commit.
- **Session journal**: `docs/journal/YYYY-MM-DD.md` of the day (what was tried, outcomes,
  screenshots). The facts that stay true also go into the area notes.
- **HANDOFF.md**: only the state needed to restart (bench, revision, resources, work in progress, next
  step, provisional values in the save). Keep it under ~120 lines.
