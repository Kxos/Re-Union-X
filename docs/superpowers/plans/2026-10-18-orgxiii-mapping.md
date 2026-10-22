# Organization XIII: fix of the medal mapping (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the 13 original 6★ ids of Organization XIII (and the 10 strengthened copies 1xxxxx) go back to Tier 3 as in the game; the 13 6★ «X [+]» (Tier 8) exist as medals of their own from their date; the duplicates «X A» 3004xx disappear; catalog and saves consistent.

**Architecture:** the error is in `D:\Progetto_Restauro_KH_UX\medal_gen\medal_map.json` (outside the repo): 23 SE ids point to the Roboloid rows «X [+]» instead of «X A». We fix it with a correction table in the repo, applied by `make-game-tables.js` on top of `medal_map.json` (reproducible without touching the external file). From the right mapping the pipeline creates the 6★ [+] by itself (300000 + Roboloid id) and no longer creates the duplicates. Then catalog (`make_banner_catalog.py`), save migration, bench.

**Tech Stack:** Node (server, generators, tests `node server/test-*.js`), Python (`recon/tools/make_banner_catalog.py`, test `python recon/tools/test_make_banner_catalog.py`).

**Spec:** no separate spec: the evidence and the full table are in `D:\Progetto_Restauro_KH_UX\tmp\sp2b\g4\medal_mapping_audit.md`, `medal_mapping_audit.tsv` and `orgxiii_migration.md` (read by the implementer, outside the repo). User decision of 18-10: fix points 1-6 before G4 of 2c.

## Global Constraints

- The repo contains only our own code and documents: never Square Enix data, APKs, masters or decompiled code. The Roboloid ids and the medal ids in the correction tables are allowed (as in `medal_map.json`/generators already in the repo).
- Never run `make-game-tables.js` without the variables: full command `$env:KHUX_MEDALS_ALL='1'; $env:KHUX_WORLDTOUR='1'; node server\make-game-tables.js D:\Progetto_Restauro_KH_UX\wiki\medals.json` (without them, the master drops to 522 medals). First on a copy of the master (`KHUX_MASTER_OUT` or a working folder in `D:\Progetto_Restauro_KH_UX\tmp\orgxiii\`), diff, then on the real master.
- Every master regeneration raises the BASE revision (126 -> 127) in the 4 session scripts (`run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1`).
- Commits in Italian with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, `git -c safe.directory=*`, `-F file` UTF-8 without BOM, `pull --rebase --autostash`, push at every verified step. Do not commit `bash.exe.stackdump`.
- Code comments in Italian, density and style of the surrounding files.
- Heavy temporary files in `D:\Progetto_Restauro_KH_UX\tmp\orgxiii\`.

## Correction table (exact values)

SE 6★ -> Roboloid «X A» 6★ (now -> right), 7★ «X A» for the evolution, 6★ [+] that is created, EN date of the [+]:

| SE id (+ boosted) | member | now | right | 7★ «X A» | new 6★ [+] (evolves into) | EN date [+] |
|---|---|---|---|---|---|---|
| 31176 (131176) | Lexaeus | 1491 | 443 | 300444 | 301491 (301492) | 2018-05-13 |
| 31196 (131196) | Xaldin | 1601 | 483 | 300484 | 301601 (301602) | 2018-09-24 (event only) |
| 31206 (131206) | Saïx | 1531 | 486 | 300487 | 301531 (301532) | 2018-07-13 |
| 31226 | Xemnas | 1680 | 638 | 300639 | 301680 (301681) | 2019-01-13 |
| 32186 (132186) | Marluxia | 1634 | 446 | 300447 | 301634 (301635) | 2018-11-13 |
| 32196 (132196) | Larxene | 1658 | 449 | 300450 | 301658 (301659) | 2018-12-13 |
| 32216 (132216) | Xigbar | 1745 | 489 | 300490 | 301745 (301746) | 2019-02-13 |
| 32236 | Axel | 1563 | 641 | 300642 | 301563 (301564) | 2018-08-13 |
| 33176 (133176) | Vexen | 1446 | 452 | 300453 | 301446 (301447) | 2018-04-13 |
| 33186 (133186) | Zexion | 1511 | 455 | 300456 | 301511 (301512) | 2018-06-13 |
| 33206 (133206) | Demyx | 1595 | 492 | 300493 | 301595 (301596) | 2018-09-13 |
| 33216 (133216) | Luxord | 1616 | 495 | 300496 | 301616 (301617) | 2018-10-13 |
| 33236 | Roxas | 1782 | 644 | 300645 | 301782 (301783) | 2019-03-13 |

Duplicates that disappear (6★ «X A» = 300000 + right id): 300443, 300483, 300486, 300638, 300446, 300449, 300489, 300641, 300452, 300455, 300492, 300495, 300644 -> same SE medalId of the row.

## Review Focus

1. A save with copies of the 3004xx duplicates (bench: 33) must reopen without «empty» medals (row absent from the master = crash or grey icon): all migrated to the SE id, deck/locks/skills unchanged.
2. The new 6★ [+] must have image and cutin (imageId = medalId): without the resource the client shows the fallback or errors out.
3. The strengthened copies (2031176..., 2131176...) must not stay Tier 8: they are regenerated from the base.
4. No 2016-2017 banner must give an Organization Tier 8; the [+] deals of April-November 2018 must give the 6★ [+].
5. The evolution 6★ «X A» -> 7★ «X A» must require 5 Blue Fairy [3] and work (Evolve on the bench).

---

### Task 1: correct mapping in the master generator

**Files:**
- Modify: `server/make-game-tables.js` (near `MEDAL_MAP`, line ~100; `KHUX_MEDALS_ALL` block lines ~148-180)
- Create: `server/test-orgxiii-map.js`

**Interfaces:**
- Produces: `MEDAL_MAP_FIX` (object `{ [seId]: robolid }`, the 23 ids of the table) and `EVOLVE_FIX` (`{ [seId 6★]: medalId 7★ «X A» }`, the 13 non-strengthened ids and the 10 strengthened ones towards the same 7★), exported or readable by the test; master regenerated.

- [ ] **Step 1: failing test** `server/test-orgxiii-map.js`, on the master `server/master_data/medal.json` (or `KHUX_MASTER_DIR`):
  - for every SE id of the table and the 1xxxxx copies: `guiltValue === 3`, `evolveId` = 7★ «X A» of the table, `validEvolve === 1`, `validEvolveNeed === 5` (Blue Fairy, from `blue-fairy.js`);
  - the 13 6★ [+] rows exist, `rare === 6`, `guiltValue === 8`, `evolveId` = 7★ [+] of the table;
  - none of the 13 duplicate rows 3004xx 6★ exists; the 7★ «X A» (300444...) exist;
  - the strengthened copies `2000000 + id` of the table (if present in the master) have `guiltValue === 3`.
- [ ] **Step 2:** `node server/test-orgxiii-map.js` -> FAIL (31176 guiltValue 8).
- [ ] **Step 3:** in `make-game-tables.js` apply `MEDAL_MAP_FIX` on top of `MEDAL_MAP` right after loading (comment: why, source `tmp\sp2b\g4\medal_mapping_audit.md`), so that Tier and the `mapped` set of the `KHUX_MEDALS_ALL` block use the right ids; after the real rows set `validEvolve 1, evolveId` from `EVOLVE_FIX` on the SE 6★ (before `blue-fairy.js`, which adds the cost). Verify where the strengthened copies 2xxxxxx are created (make-boosted-medals.js) and that they copy the Tier from the regenerated base.
- [ ] **Step 4:** regenerate on a copy in `D:\Progetto_Restauro_KH_UX\tmp\orgxiii\` with the full command, diff with the current master: expected only +13 rows [+] 6★, -13 duplicates, 23 SE rows (Tier/evolve), strengthened copies, `burst` of the new [+] (3000000 + id). Any other difference = stop and understand.
- [ ] **Step 5:** regenerate the real master, `node server/test-orgxiii-map.js` -> PASS; also `node server/test-skill-table.js`, `node server/test-base-buff.js`, `node server/test-medal-enhance.js` -> PASS. Revision 126 -> 127 in the 4 scripts.
- [ ] **Step 6:** commit «Medals: Organization XIII Tier 3 (corrected mapping), own 6★ [+], master rev 127».

### Task 2: images of the 6★ [+]

**Files:**
- Modify (if needed): `tools/ldplayer/session/build-resources.ps1` or the `fetch_medal_images.py --all` script used for the 300000+
- Test: check in the served resource index

- [ ] **Step 1:** for the 13 ids 301446...301782 check that `img/medal/<id>` (icon, cutin, art: as for the other 300000+) are in the served resources (`resource_data`, name index). The 7★ [+] (301447...) have them: if the 6★ image is missing, use the same graphics as the 7★ [+] (same medal, same art on khuxwiki) or download it with the existing flow.
- [ ] **Step 2:** if new files are needed: `build-resources.ps1 -Quick` (resources 41 -> 42), otherwise nothing. Check: the 13 entries appear in the index.
- [ ] **Step 3:** commit (only our own scripts/code, never the images in the repo).

### Task 3: banner catalog

**Files:**
- Modify: `recon/tools/make_banner_catalog.py` (`extend_medals` line ~655, `FAMILIES` line ~599), possibly `recon/tools/banner_overrides.tsv`
- Test: `recon/tools/test_make_banner_catalog.py`

- [ ] **Step 1: failing tests** in `test_make_banner_catalog.py`:
  - `axel` and `roxas` are not aliases of `sn++ - axel`/`sn++ - roxas`; subset 6.2 resolves to `axel a`/`roxas a` (ids 32236/33236 with date 2016-09-16);
  - the `x [+]` entries of the 13 members contain the 6★ [+] id with the EN date of the table, and the 7★ [+] of Vexen/Lexaeus not before 2018-05-25 (`firstRarity[7]`);
  - no duplicate 3004xx 6★ id in the catalog; the per-id Tier of the 23 SE ids is 3 (from the master);
  - SN++ Axel B and Roxas (302074, 302075) dated 2021-01-01.
  - Banners: B0280 and B0303 have the 6★ [+] in the pool; no Organization id with Tier 8 in the banner pools before the date of its [+] (`expandPool` of `server/gacha-data.js`).
- [ ] **Step 2:** run -> FAIL.
- [ ] **Step 3:** fix `extend_medals` (no alias towards a different family when the «x a» entry exists), [+] dates and ids, SN++ dates; regenerate `server/game_data/gacha_catalog.json`.
- [ ] **Step 4:** run -> PASS; `node server/test-gacha-data.js` and the other gacha tests -> PASS. Recalculate the pools of the G4 banners with the agent's script (`tmp\sp2b\g4\analyze.js`) and note the new counts.
- [ ] **Step 5:** commit «Catalog: Organization XIII A/[+] and SN++ aliases corrected».

### Task 4: save migration

**Files:**
- Modify: `server/server.js` (next to `migrateSkills`, line ~2528; call near line ~3773)
- Create: `server/test-orgxiii-migration.js`

**Interfaces:**
- Consumes: the table duplicate -> SE id (Task 1).
- Produces: `player.medalMapVersion = 1`.

- [ ] **Step 1: failing test** (child process like `test-bench-enemy.js`, fake save): a player with medals 300443 and 300644 and one 300444 (7★, stays) -> after the login 300443 -> 31176, 300644 -> 33236, 300444 unchanged; `userMedalId`, level, skills (`medalSkills`), locks, deck and guilt unchanged; `medalMapVersion === 1`; a second login changes nothing; new player: `medalMapVersion` 1 without migration.
- [ ] **Step 2:** run -> FAIL.
- [ ] **Step 3:** `migrateMedalMap()`: replaces `medalId` in the structures that contain it (search `server.js` for all the save fields with a medalId: `medals`, album/medals seen, pending rewards, support, etc.), log of how many copies.
- [ ] **Step 4:** run -> PASS; all server tests -> PASS.
- [ ] **Step 5:** commit «Saves: Organization XIII duplicates on the original ids (medalMapVersion 1)».

### Task 5: documents

**Files:** `docs/notes/medaglie.md`, `docs/ISSUES.md`, `HANDOFF.md`

- [ ] **Step 1:** `medaglie.md`: section on the mapping (table, evidence, why `MEDAL_MAP_FIX` lives in the repo). `ISSUES.md`: I-160 Organization XIII (CLOSED); I-161 SN++ «adjusted» 302008-302012 dated to 2020-09-07 and only with Fantasia Mickey B (open); I-162 167 original 6★ without evolution to the 7★ (open). HANDOFF: rev 127, status, then G4.
- [ ] **Step 2:** commit.

### Task 6: bench (serial, the user watches)

- [ ] **Step 1:** `relogin.ps1 -Tag ox` (rev 127). Login without crash, migration log (33 copies).
- [ ] **Step 2:** medal list: a migrated Lexaeus/Xemnas A 6★ shows Tier 3 (medal detail), skill and level unchanged; Evolve shows 5 Blue Fairy [3] towards the 7★ «X A».
- [ ] **Step 3:** Album: a 6★ [+] (e.g. Vexen [+]) with image.
- [ ] **Step 4:** Shop with `-GachaShow B0280` and the clock at 13-04-2018 if needed: banner details with the 6★ [+]. Screenshots in `D:\Progetto_Restauro_KH_UX\tmp\orgxiii\`.
- [ ] **Step 5:** HANDOFF updated, commit and push.
