# Story quests and maps (original stages, generator, rooms)

History: [../journal/fino-al-2026-10-11.md](../journal/fino-al-2026-10-11.md) («Mappe generate e
risorse aggiuntive», «Missioni di storia in automatico»). Agent documents in
`D:\Progetto_Restauro_KH_UX\stage_gen\` (`exits\NOTE.md`, `reach\REPORT.md`, `multiroom\`,
`story\`, `quest_thumbs\`).

<a id="stati-elenco"></a>
## Quest list states: NEW, objective marks, COMPLETE (I-201)

Protocol facts for `/stage/160310` (Story) and `/stage/hard` (Proud), checked against the client and the original
screenshots in `reference\proud_mode` (22-10):

- `playStatus` of a `stories[]` element: **0** = never cleared, the Story cell shows «NEW»; **2** = cleared, the Story
  TARGET panel shows the «COMPLETE» stamp. The stamp depends only on the quest being cleared, **not on the objectives**
  (originals: Story Q979 with 2 of 3 objectives, Proud Q321 and Q940 with 0 of 3, all «COMPLETE»).
- `clearMissionIds`: the objectives already done; the client lights the three Mickey marks under the cell and in the
  OBJECTIVES panel from it (no other effect).
- Proud list: «NEW» marks the cell whose `stageId` equals `newStageId`; «COMPLETE» is shown on every cell before
  `newStageId`, or on all of them when `newStageId` is 0.
- `newStageId` **0** = every quest of the list is cleared: the cursor goes to the last cell, and (with the last element at
  `playStatus` 2 in the Story list, always in the Proud list) the locked cells after it show «Coming Soon!» instead of «?».
- The server sends 2 for every cleared quest, the merged objectives of `player.clearMissions` (Story and Proud stageIds are
  separate keys; Proud 801+ objectives count only all together, enforced at `/stage/clear`), and `newStageId 0` when the
  whole list is cleared.

<a id="dati"></a>
## Quest data

- Story quests 1-525 = `stageBinId` 1..525 of thethiny's rows (`stage_dec`, 1,140 stages; no
  gaps); `make-game-tables.js` merges them into the `stage` master (missing fields derived). Quests
  526-979 (the final version went up to 979): rows from the wiki and the 1.1.3 master (`make-story-oltre.js`)
  with the original JP 4.3.1 stages ([oltre525](#oltre525), I-009 closed on 21-10). All 1-979 are played
  on the original stages and rooms (`import_orig_stages.py`, `make_jp_rooms.py`), not on generated maps.
- `wiki_quests.py` -> `quests.json` (978 quests 1-979 with objectives, rewards, treasures and enemies per
  room; parser of the nested `{{EN|...}}` enemies to be fixed). wikiwiki.jp/khux has quests
  1-750 (AP, target, Lv, objectives, rewards): useful to check the rows.
- STORY list: `/stage/160310` (108) `stories[]` (`stageId`, `useAp`, `score`,
  `playStatus`, `clearMissionIds` <= 3), `newStageId`, `luxRank`, `openRankingId`. Going back to the
  list the client opens the STG header of the **next quest** and looks up its
  target in the `enemy` table: a missing header = crash.
- Thumbnails of the Story list (ISSUES I-003, I-064): the «Panel» box of every quest
  loads `img/adventure/stage/stage_select_ico_%d_%d.png` with
  `worldId` and `thumbId` of the `stage` master row; the locked quests
  `stage_select_ico_Blank` («?») or, with flag 1, `stage_select_ico_Soon`.
  `thumbId` = room*10000 + variant*100 + sub-variant of the map `<XX>_<stanza>_<var>_<sub>`
  (1_40000 = DB_0004_00_00 1st District): the values are the real ones (thethiny), there is no need to touch
  the master. The resources had only 1_0, 1_40000, 2_0, 2_10000 (+ Blank) of the 99 pairs of
  quests 1-525. With the file missing the box **keeps the previous texture**: the carousel recycles the boxes, so
  scrolling with the arrows the quests show the thumbnail of another quest (Agrabah with
  Daybreak Town) or the «?» left over from a locked quest. No server field is involved.
- `recon/tools/make_quest_thumbs.py` (in the resource build, after `make_textures.py`) generates the
  95 missing ones in `stage_gen\files\img\adventure\stage` (palette BTF, ~630 KB in all) from
  Roboloid's room previews (`images/map`, cache in `external\roboloid\cache\map`):
  1200 px crop of the room chosen where it is full, 145x132 with alpha and the border of the
  originals; `CROP` in the script to correct by hand. 87 exact rooms, 8 from the same room
  in another variant (Corridor of Darkness 0100 for the 5 variants, Waterfront Park 0008_01,
  Dwarf's Cottage 1F 0006_01, Frozen Forest 0012_01). `stage_select_ico_Soon` = copy of Blank.
  Check sheets and `report.json` in `stage_gen\quest_thumbs`, note in
  `reference\story_thumbs`.

<a id="formato"></a>
## STG and MAP format

Exact parser: `recon/tools/mapfile.py` (`parse_stg`, `parse_map`, `load_stage`, `check_stage`; from the command
line `mapfile.py <cartella|file> [--json out] [--quiet]` checks every stage against the STG). It is
used by `import_orig_stages.py` and `stage_poi.py`. Field names and meanings were checked against the client behaviour and on the bench (details in the private
notes).

**Versions** (`STG +0x04` = `MAP +0x04`, the year of the file's last change, not of the client: the client
**does not read** the version). 13, 14, 15, 16, 17 have **the same format** (the one below). Check:
all the 9,173 JP 4.3.1 parts (every revision) and the 1,300 of 2016 have the five sections contiguous,
without gaps and without a tail, and squads/enemies = STG totals on all complete stages (4,510 JP); the
old heuristic parser got the 13 ones wrong because of the record shape, not the format. Files 4, 6, 7, 8
(only 2016 events and superseded JP revisions, none among the 525) are different and the 4.3.1 client would
read them wrongly: STG v4 of 28 bytes (7 int), v6/v7 of 40 (10 int); MAP 6/7 squads of 0x24 (9 int, without
polygon); MAP 4 also exits of 0x1c (7 int) and npcs of 0x1c; 8 only empty files.

`stage/mappoi_stg<id>.bin`, **STG** (64 bytes always read, then the alternative starts):

| int | byte | field |
|---|---|---|
| [0] | +0x00 | `STG\0` |
| [1] | +0x04 | version |
| [2] | +0x08 | low short = parts, high = start part |
| [3],[4] | +0x0c,+0x10 | start x, y |
| [5] | +0x14 | low short = direction (1/3 -> +1, 2/4 -> -1; 3/4 fixed), high = n alternative starts (4.3.1 only: n x 4 shorts at +0x40: part, direction, x, y) |
| [6] | +0x18 | enemyId of the target |
| [7] | +0x1c | ? (WW 1, JP 40/41/43...) |
| [8] | +0x20 | squads, **without** those with bit 0x20 of [4] (91 JP stages out of 91); the server can remove some («random» squads) |
| [9] | +0x24 | enemies of the counted squads; «defeat all» counts [9] - [13] |
| [10] | +0x28 | enemyId of the target's card (0 = [6]) |
| [11] | +0x2c | level bonus of the card |
| [12] | +0x30 | ? |
| [13] | +0x34 | enemies not to be counted |
| [14] | +0x38 | chests, [15] +0x3c materials: **not maintained** (89 of the 518 imported and 125 of the 4,793 JP have larger sums of the parts, also in 2016); used only by objectives 17 «Open all treasure chests» / 18 «Collect all materials» (none of the 5 stages with those objectives is out of step) |

`stage/mappoi_stg<id>_NN.bin`, **MAP** (part = room): 0x34-byte header, then five sections
at the offsets written in the header (+ 0x34), in this order and contiguous:

| byte | field |
|---|---|
| +0x00 | `MAP\0` |
| +0x04 | version |
| +0x08 | 40 (not read) |
| +0x0c | room name, 16 bytes (`DB_0000_00_00`: `map/<stanza>/..._info/_cls/_chp/_jmp.bin`) |
| +0x1c | weather short (1 rain, 2/3 snow; only if short +8 of `_info` is 0) |
| +0x20 | exits - 0x34 (always 0: block at +0x34) |
| +0x24 | squads/enemies - 0x34 (the block starts with n squads, n enemies) |
| +0x28 | chests - 0x34 |
| +0x2c | materials - 0x34 |
| +0x30 | npcs - 0x34 |

| section | content |
|---|---|
| exits | u32 n, n x 36: `x, y, angolo freccia, distanza residua al bersaglio, [4] (mai letto: 1 + passaggi fino alla parte del bersaglio), arrivo x, arrivo y, parte di destinazione, verso` (arrow angle, remaining distance to the target, [4] (never read: 1 + steps up to the target's part), arrival x, arrival y, destination part, direction); they trigger within 96 units |
| squads/enemies | u32 n_squadre, u32 n_nemici, n_squadre x 0x44, n_nemici x 0x20 |
| squad (17 int) | `[0]` first enemy (index in the part), `[1]` how many, `[2]` 128, `[3]` ?, `[4]` flags (bit 0 leader/target, bits 2-3 behavior, bit 5 = 0x20 second list: not counted in the STG, bit 6), `[5]` uid of the squad, `[6]`,`[7]` parameters of the symbol, `[8]` direction, `[9..16]` 4 points of the encounter polygon |
| enemy (8 int) | `x, y, enemyId, f3 (0; 1 nelle missioni JP ridisegnate), f4 (1), livello, rewardId, uid` (f3 0, 1 in the redesigned JP quests; f4 1; level) |
| chests | u32 n, n x 0x14: `x, y, rewardId, aspetto (look: pari = specchiato, (look % 6) >> 1 e look / 6 = grafica; 0..19 negli originali), uid` (appearance: even = mirrored, (look % 6) >> 1 and look / 6 = graphics; 0..19 in the originals) |
| materials | u32 n, n x 0x10: `x, y, materialId, quantita'` (quantity); uid computed `(32*parte + 32) | ((i+1) << 10) | 6` |
| npcs | u32 n, n x 0x20: `x, y, id, short tipo (3, 4; 5 = dentro un livello grafico), short ?, short verso, short livello, int talk, int talk2, int ordine` (short type (3, 4; 5 = inside a graphic layer), short ?, short direction, short layer, int talk, int talk2, int order); graphics `lwf/character/npc/<id>/wait/wait.lwf`; talk/talk2 = dialogue texts (see [Cutscenes and dialogues](#filmati)) |

- `uid` of squads, enemies and chests **global across the parts**; it is the id space of `userTreasures`/
  `userEnemyDropItems` and of `getTreasures`/`getEnemyDropItems`. The squad uids have no enemy
  record (e.g. 1 in the Prologue).
- Collision: `map/<stanza>/<stanza>_cls.bin` ('CLS', width, height, bytes per row, 1 bit per
  pixel, high bit on the left, 0 = walkable).
- The original maps after the tutorial came from the CDN: in the WW resources only 1010-1040 (1040_00
  opens with the 5.0.1 key in `BGAD_KEY`); the others come from the JP 4.3.1 data and from the 2016 pack
  (`recon/tools/import_orig_stages.py`, I-116). JP redesigned 17 quests (single boss, JP-only enemyIds
  1027/10240/10242/10261/11025/11028/11029/11033/11530, master objectives no longer
  satisfied): for those the importer takes the 2016 one, which matches the WW master.

<a id="generatore"></a>
## Generator

- `recon/tools/gen_story_maps.py <stage_gen\story_cfg.json>` (~75 s; with `world_links` exits on the
  doors and Tour quests, see [collegamenti](#collegamenti)): for every quest a room from
  `recon/tools/story_rooms.json` (84 verified rooms) or one from the same world, enemies and treasures
  from the wiki, positions on the collision. With `"multiroom": true` one part per wiki room,
  exits forward and back, global uids, target in the last room (95 quests: 86 with 2 parts, 9
  with 3). With `cfg['poi']` it writes enemies and chests into `server/game_data/stage_poi.json` (adds to the
  existing file: copy it first into `reach\stage_poi.json`). Output in `stage_gen\story`, to be copied
  by hand into `stage_gen\files\stage` (it does not overwrite 1010-1050).
- `walk_grid` kept only points with 80x80 free: corridors of 33-80 broke the grid and
  the entrance pocket was taken. Now, if the piece reaches less than 0.4 of the component, walking distances
  on the pixels (`geodesic`). 132 files / 88 stages regenerated.
- `recon/tools/validate_maps.py <cartella stage> D:\Progetto_Restauro_KH_UX\maps_x --json r.json`
  (numpy/scipy): flood-fill on the collision (game 16, snap 48, detour warning beyond 1.5x and 800
  units). 0 errors at 11 October. 46 stages with detour >= 1.25 (`detour125.json`); 0 «long
  detour» warnings after the `short_exit` rule ([collegamenti](#collegamenti)).
- Others: `mappoi_gen.py <modello> <spec.json> <uscita>`, `mappoi_room.py` (room without a template,
  spec e.g. `stage_gen\spec_1050.json`), `stage_poi.py` (POIs of the real maps ->
  `server/game_data/stage_poi.json`), `server/check-stage-data.js [--verbose]` (offline check of
  rewards, chests, materials, comparison with the wiki: to be run after every change).

<a id="stanze"></a>
## Rooms

- 86 `map/` folders in the resources. Scheme `XX_NNNN_VV_00` = Roboloid `<Mondo>_NNNN_VV` (VV =
  day/night variant). Notes: DB_0000 Fountain Square, DB_0004 1st District, DB_0004_01_00 2nd
  District, DW_0000 Flower Glade, DW_0001 Dark Forest: Entrance, **DW_0003 = Path to the Mine** (not
  Dwarf's Cottage). Prefixes: CS Game Central Station, HD Cy-Bug Sector, NL Niceland, SR Candy
  Kingdom, DG_0200 Corridor of Darkness, AG Agrabah.
- Coverage: 18 of the 86 rooms of quests 1-525 exact, 154 quests out of 525 with all rooms
  exact. Missing from the resources: West Wing, Boardwalk, Market, Dwarf's Cottage, Waterfront Park,
  Avenue, Morning Dew Grove, Garden Maze... (replaced with a room of the same world: ISSUES
  I-036). Quest 8 (1050) uses DW_0003. This is the coverage of the WW resources alone: since version 35 the
  rooms recovered from the 2016 and JP 4.3.1 data are served by `rooms_gen` ([below](#stanze-jp)).
- Roboloid has 379 room previews (`images/map`, reference only).

<a id="incomplete"></a>
### Incomplete rooms (ISSUES I-074)

- `map/<S>/<S>_info.bin` («BMI»): `0x0a` u16 tiled layers, `0x0c` u16 whole images, `0x0e`
  u16 objects, `0x10` name, `0x20` W, H of `base1`; then records of 60 bytes (stanza[16], livello[16],
  W, H, x, y, W2, H2, flag), of 52 (stanza[16], livello[16], w, h, x, y, flag) and of 52 (nome[32], x,
  y, ...). Paths: `map/%s/%s_base1/%s_base1_%03d.png`,
  `map/%s/%s_%s/%s_%s_%03d.png` (256 tiles, from 001, ceil(W2/256) x ceil(H2/256)),
  `map/%s/%s_%s.png`, `lwf/map/%s/%s.lwf`. The «room» of the records can be another folder.
- Missing tile = crash.
  Missing whole images and lwfs are tolerated: 43 rooms
  have some, among them DW_0001/DW_0003 played on the bench.
- `recon/tools/check_rooms.py` (~25 s, cache in `stage_gen\rooms_info`) checks every room against
  the installed index (`names_v4.tsv` + `ipa431\names_addnl.tsv` + `medal_gen\files` +
  `stage_gen\files`; `rooms_gen\files` only if the latest version of `resource_data` contains it, that is
  `packs.txt`, or with `--rooms-gen`; base1 from the name in the BMI at +0x10) and tells which stages use it ->
  `stage_gen\rooms_check.json`. With `rooms_gen` ([#stanze-jp](#stanze-jp)) the two incomplete ones
  below become complete. Incomplete up to 34:
  **DB_0018_01_00** (Underground Waterway: sky2, spover, over of `DB_0018_00_00`, 172 tiles) and
  **ED_0011_01_00** (over, sky of `ED_0011_00_00`, 171 tiles); no original quest uses them.
- `gen_story_maps.py` with `"rooms_check"` (or `"exclude_rooms"`) in the config treats them as missing
  (I-036; the choice for the other quests does not change). Regenerated 991001 (11 parts: the door
  «Underground Waterway Entrance» leads to Waterfront Park: Dock), 991008 (17), 12210-12250,
  14230-14250 (Fountain Square/Warehouse); removed the extra parts 991001_11, 991008_17.

<a id="stanze-jp"></a>
### Rooms recovered into the resources (`rooms_gen`, version 35)

- `recon/tools/make_jp_rooms.py` (Pillow: without `-I`; ~10 min the first time, then incremental)
  writes into `D:\Progetto_Restauro_KH_UX\rooms_gen\files\` all the files the client opens for the
  rooms of `<ref_work>\rooms_merged\` not yet served (folder by folder; what is missing
  there from the JP 4.3.1 data, highest revision). Mandatory: the 4 `.bin`, the base1 tiles of the
  room written in the BMI at +0x10 (97 rooms are graphic aliases of another) and those of the tiled
  layers, from 001 to ceil(W/256)*ceil(H/256); a room gets in **only if none is missing**. Optional:
  whole images and objects `lwf/map/<O>/` (lwf + all the cited pngs; the `.res` is not needed). Files
  already served are never rewritten. Report in `rooms_gen\report.md/.json`.
- Textures: JP PNG (non-premultiplied alpha) -> BTF type 8 with `btf.encode` (verified: decoding
  identical to the PNG on the opaque pixels); fully transparent tiles -> the 45-byte BTF type 1 placeholder
  of the originals (the served empty tiles are like that: 588 of 592 have the transparent JP PNG,
  the other 4 alpha <= 3); 2016 BTFs copied. lwf textures missing as stubs in the local copy: the
  same original name (`<oggetto>_<esadecimale>.png`) is taken from another JP object only if
  all the candidates have identical content (79 textures).
- **Outcome** (14-10): 413 rooms; **319 new complete**, 34 served completed (whole images, lwfs
  and the missing layers: DB_0018_01_00 and ED_0011_01_00 now complete), 52 served already complete, 8
  discarded: 7 without `_info.bin` (DB_0000_00_01, DW_0100_00/01_00, ED_0020_00_00, SR_0009_01_00,
  WL_0004_00_01, WL_0100_00_00: the INFO is opened from the folder, using them = crash) and DB_0000_01_00 (4
  base1 tiles missing everywhere). 39,816 files, **1,035 MB** (map 994, lwf 41). lwf objects: 203
  added, 22 already served, 116 not copied (missing textures: the object is missing, tolerated as in
  DW_0001).
- <a id="segnaposto-46"></a>**Crash in the generated rooms (I-182, 20-10)**: the placeholder of `make_jp_rooms.py` had an
  extra `00` at offset 16 (46 bytes instead of the 45 of the original `DB_0000_00_00_base1_001.png`): BTF fields
  shifted, so the client read a compressed size of ~80 MB from a file of
  46 bytes and went out of memory (SIGSEGV at the end of the mapping) on entering one of the **86 generated rooms** with transparent
  tiles (3,208 tiles; quest 13 DW_0004_00_00, 524 BC_0012_01_00). Since 14-10 (resources 35): not seen before
  because from 18-10 `save/smoke.json` left only quest 132 (WW rooms). Found with the private crash capture tools (tile name at the crash).
  Constant fixed (`assert len == 45`), the tiles with the wrong placeholder are rewritten; resources 51.
- **Story rooms** (doors with story `scope` of `schema_v2\schema_mondi.json`, room and destination):
  231; with `rooms_gen` **230 complete** (`check_rooms.py --rooms-gen --out rooms_gen\rooms_check.json`:
  405 rooms, 0 incomplete; without, as before: 86 rooms, 2 incomplete). Only **SR_0009_01_00** is missing (door SR_0008_00_00 <-> SR_0009_01_00, only
  `storia_oltre`, outside the master): no INFO in any source.
  **21-10 (quests 526-979, I-009)**: `make_jp_rooms.py` also takes the rooms of the `storia_oltre` stages (+27 rooms, all
  complete) and `INFO_ALIAS` builds the INFO of SR_0009_01_00 (user's decision): byte-for-byte copy of the INFO of
  SR_0009_00_00 (the BMI already cites 00_00 by name, layers and objects), with its own `_cls` and `_chp` (identical to those of 00_00)
  and its own JP `_jmp` (16 bytes, zero jumps). Pack: 35,326 files, 853.7 MB (was 30,465, 728.9 MB; +124.8 MB).
- `--story-only`: only the rooms of the story doors (24,406 files, 615 MB). Default: all the
  complete ones. `build-resources.ps1` makes the static pack `rooms_gen\gen.*` from it
  ([risorse_layout.md#pacchetti](risorse_layout.md#pacchetti)). Until 35 is built
  `check_rooms.py` (and hence `"rooms_check"` of `gen_story_maps.py`) does not see these rooms: the maps
  that use them must be generated only after 35. To be tried on the bench: an alias room (e.g.
  DB_0020_00_01), one with added lwfs, DB_0018_01_00.

<a id="collegamenti"></a>
## Links between the areas and «Tour» quests

ISSUES I-072. Tests and images in `D:\Progetto_Restauro_KH_UX\reference\world_links\` (`NOTE.md`,
`wiki_worlds.txt` = wiki pages of the worlds, `doors\` = tips of the paths on the graphics,
`tour\` = exits and arrivals of every part of the Tour quests, `previews\` = Roboloid previews).

- **Cause of the wrong flow**: the wiki's room sequences are consistent (102 pairs out of 104
  adjacent in the graph, 2 skip a floor), but the generator put the «forward» exit at the point farthest
  from the start and the «back» one at the leftmost point, without looking at the doors: e.g.
  quest 93 (Fountain Square -> 1st District) exited from the stairs on the right (which lead to the 2nd
  District) and arrived in the 1st District from the wrong side. Moreover 95 pairs out of 104 have at least
  one replaced room (I-036).
- **Graph** `recon/tools/world_links.json`: per world the areas (name, code `XX_NNNN_VV_00` from the
  `thumbId` of the quests, `res` = in the resources, `variant_of` for the day/night variants, aliases of the
  wiki names), the doors of the rooms in the resources (`{area vicina: [x, y]}` on the CLS bitmap) and the
  links with `conf` (high = original exits 1010-1016 or explicit wiki, medium = wiki + door
  chosen on the graphics, low = deduced, none = `tour: true`, only to connect the isolated groups in the tour)
  and the source. Main source: the world pages of the KHUX wiki («The northeast exit of the Flower
  Glade leads to...»), in the dump `wiki\wiki_all.json`. The real exits confirm the convention: the
  stairs at the bottom left of Fountain Square lead to the top right of the 1st District, the one on the
  right to the bottom left of the 2nd District.
- **Doors**: the exits are at the end of the paths of the walkable zone (tips), not on the edge
  of the image. The Roboloid preview has the same width as the CLS and is bottom-aligned
  (`y_grafica = y_cls - (H_cls - H_anteprima)`). The candidate tips (geodesic relief + extremes in the
  8 directions) are in `doors\*.png`; the door of every link is chosen by hand with the direction
  from the wiki.
- **Generator** (`gen_story_maps.py`, config `"world_links"`): in multi-room quests the exit
  of room k goes on the door towards room k+1 (or towards the first step of the path in the graph) and
  the back exit on the door towards k-1; in substitute rooms any door (the farthest
  from the other exit). Doors snapped to the walkable pixel (the 40 grid does not fit in narrow
  corridors), arrivals at ~240 walking units from the door and more than 160 from the other exits, arrow with
  the angle towards the outside of the walkable zone (average of the blocked pixels within 160). Bench
  991001: the «Moogle Shop» exit on the edge of the fountain did not trigger: the arrow (believed ~100
  units beyond the exit; actually 40-80 before it, towards the inside: [schema-mondi](#schema-mondi), check
  corrected on 14-10) fell on the fountain, tapping it the player jumped onto the top of the fountain
  (free island of the CLS detached from the square) and stayed outside the 96 radius. Now the exits are
  at >= 240 from the free islands of >= 1000 pixels and the arrow tip at > 200 (angle rotated up to
  90 degrees); the shop door is on the top edge of the square to the left of the fountain (the real door
  is behind the fountain, outside the CLS). Without `world_links` the exit is byte-for-byte identical to before. Report
  of the pairs in `stage_gen\world_links_story.json` (relation in the graph, notes on the doors); 205
  exits moved, 55 onto the right door (37 by more than 300 units).
- **Long detour** (bench 991001, part 2 «2nd District»): the «Underground Waterway Entrance» exit at
  (2020,2068), on the low walkway between the canals, from the arrival from Fountain Square (820,2100) could
  be reached only with ~4500 walking units against 1200 as the crow flies (up the stairs, door on the
  right, down behind a building covered by the occluders): the player does not find it, the bot stays
  against the railing. Rule (`short_exit`): with the same measure of the long detour as
  `validate_maps.detour` (cells of 8, Dijkstra), if from the main entrance of the part (start or
  first arrival, in the validator's order) the path to an exit is > 1.5 times the straight-line distance
  and > 800, the exit goes to the point of the component with path <= 1.5 times the straight-line distance closest
  to the door, at >= 300 from the entrance and from the other exits, at >= 240 from the other arrivals and at >
  240 from the free islands (arrow recomputed). Only the return arrival next to
  that door is recomputed; the remaining distances [3] of the quest's exits change accordingly. If there
  is no good point the door stays and the note goes into the report (`doubts` / `notes`). Moves in
  `worldtour_report.json` (`moved_exits`) and `story_report.json` (`doubts`). Outcome: 991001 part 2
  (2020,2068) -> (1616,1640), at the top of the railing above the walkway (path 988, straight-line
  distance 919); 991008 parts 6, 12, 15 (4 exits); 13 story quests (rooms WL_0004, DB_0001,
  DW_0001). Validator: «long detour» warnings from 15 stages to 0, errors 0.
- **Tour quests** (config `"worldtour": true`): one per world, all the rooms of the world in the
  resources (variants excluded), one part per room; every door leads to the nearest resource room
  in the graph crossing the missing areas (e.g. Fountain Square, big door on the left ->
  Warehouse via Market). A single Shadow (target) in the room farthest from the start; no
  chests. Report `stage_gen\worldtour_report.json` (exits, arrivals, `via`).

| stageId | Tour | parts | target |
|---|---|---|---|
| 991001 | Daybreak Town | 11 (with Corridor of Darkness) | Beach D |
| 991002 | Dwarf Woodlands | 3 | Path to the Mine |
| 991003 | Wonderland | 2 | White Rabbit's House |
| 991004 | Agrabah | 17 | Cave of Wonders: Monkey Statue |
| 991005 | Olympus Coliseum | 2 | Coliseum |
| 991006 | Beast's Castle | 2 | Fireplace |
| 991007 | Castle of Dreams | 2 | Castle: Ballroom |
| 991008 | Enchanted Dominion | 17 | Tower Room |

- Master: `KHUX_WORLDTOUR=1` in `make-game-tables.js` adds the rows 991001-991008 (copies of
  1050 like the zoo ones, `id` 9101-9108, name «Tour <mondo>», world/thumbnail/music from the first quest
  of the world, AP 0). They are started like the zoo ones: `server/save/smoke.json` `{"stageId": 991001}` -> the Story
  list shows only that quest; `{"stageIds": [991001, ..., 991008]}` shows all the tours
  together (bench 13-10: 9101-9108 in the list, all NEW). Maps from `stage_gen\story` into `stage_gen\files\stage`.
- Almost all the areas of worlds 2-7 are missing from the resources (Dwarf's Cottage, Market, West Wing...):
  the tours of DW, WL, OC, BC, CD have 2-3 rooms.

<a id="schema-mondi"></a>
## Exact world schema (ISSUES I-116)

Outcome of the user's tests on the tours 991001-991008 (13-10): **position of the markers for
moving between the areas very imprecise**; in the worlds that lack areas the doors lead to substitute
rooms and the player does not understand where he is. The same defect carries over to the generated story
quests. The current graph (`world_links.json`) mixes certain links (`high`) with deduced
links (`medium`/`low`/`none`) and doors chosen by hand on the graphics: it is not enough.

**User's rule**: first an exact and verified schema of the structure of every world, then the
quests. No standard (story) quest is regenerated until the schema is confirmed.

Order of the work:
1. **Inventory of the areas** per world: all the areas of the original game (name, code
   `XX_NNNN_VV_00`, day/night variants), with the source of each; mark which ones are in the
   resources (OBB 5.0.1, `addnl` of the IPA 4.3.1, our pack) and which are missing.
2. **Certain links**: a link enters the schema only with direct proof: exit of
   an original quest (`.stg` 1010-1016 and others recoverable), video/screenshot of the original game
   showing the passage, or explicit wiki text confirmed by an image. Every edge carries
   its source; edges without proof stay out, they are not deduced.
3. **Exact position of the markers**: for every door the exit coordinate and the arrow angle
   taken from an original quest when one exists; otherwise from the door visible in the room
   graphics, compared with videos/screenshots of the original (saved in
   `D:\Progetto_Restauro_KH_UX\reference\world_links\`). To be verified on the bench door by door
   (screenshot of the marker and of the arrival), not only with the validator.
4. **Missing areas**: look for them first (other client versions: JP, earlier OBB/patch, IPA,
   community archives, Dark Road; record in [ricerca_esterna](ricerca_esterna.md)); only if
   they cannot be found, regenerate them with the highest precision from the original (graphics, CLS walkable zone,
   tiled layers, doors) and document how.
5. **Final schema** in a single file (areas, links, doors, sources) to be **confirmed
   by the user**; then the tours are regenerated, the user tries them, and only after that are the story
   quests regenerated.

Results (13-10, in `D:\Progetto_Restauro_KH_UX\reference\world_schema\`):
- **Local data** (`dati_locali.md`, `exits_original.json`): the only original exits are the 6 of
  1010/1013/1016 (FS bottom-left <-> 1st District top-right, FS right <-> 2nd District
  bottom-left); 1019/1020/1030 a single part, 1040 header only. No room file
  (`_chp` 0/1/2 grid with cells of 60, `_jmp` internal jumps, `_info` graphics only), table or text
  encodes doors or destinations; on the passage only the `wipe_<mondo>` wipe and the `next_map.png` arrow, never
  the area name. The exits are per quest (1013 and 1016: same door, different coordinates). The
  tips of the walkable zone are a necessary condition (6/6 real exits at 12-86 from a tip) but
  not sufficient (~5 tips per room, 1-2 used): hence the imprecision of the tours.
- **Archives** (`fonti_risorse.md`): no known client build (IPA WW/JP 1.0.1-5.0.1, APK JP/TW, 5.0.1 web
  edition) has additional quests or rooms: they came from the CDN in `files/r/misc.mp4`.
  Public: only `stage_maps.json` of thethiny's repositories (enemies/chests per stage, without exits).
- **Videos** (`video\`): 186 videos catalogued (gothwood9 1-760 complete); the light blue arrow is visible and,
  registered on the preview, finds the 4 real exits of Daybreak Town again (arrivals at 9-46 units). The
  wiki pairs are not always different parts (DW quests 8 and 11: wide maps without a wipe).
  In the video the arrow is 52-124 units towards the inside relative to the exit.
- **Exit arrow** (`freccia_uscita.md`): the client puts the marker on the point
  of the exit without offset, rotated by the exit angle; the two sprites `map/next_map.png` sit at y = -80
  and oscillate between -80 and -40, the trail goes from -40
  to 0. From map to screen y is inverted; 0 degrees = up, clockwise. In CLS: **arrow =
  (x - d·sin a, y + d·cos a), d in [40,80], pointing towards (sin a, -cos a)**, that is 40-80 units BEFORE
  the exit towards the inside; hence exit ~ arrow + 60·(sin a, -cos a). Verified on the videos
  (3 exits of 1010/1013). The generator has the right angle convention (deviations 1-21 degrees
  on the original exits) but **checks the arrow 100 units beyond the exit** (`gen_story_maps.py`
  lines 602-623, `tx = p + 100·sin`): it must be corrected to d = 40..80 towards the inside before regenerating.
  **Applied on 14-10** in `exit_angle` (points d = 40/60/80 before the exit farther than 200 from the islands;
  maps not yet regenerated, I-116).
- **Daybreak Town from the videos** (`video\daybreak_town.md/.json`): 27 passages with 3 frames each
  (FS-2nd, FS-1st, FS-Corridor of Darkness, Market-Warehouse, Market-Avenue, Avenue-Boardwalk,
  Boardwalk-Waterfront Park (two links: upper promenade and park at the bottom left),
  WP-Office, Office-Dock, Attic-Moogle Shop, Rooftop-Attic, Underground Waterway-Clock Tower Level).
  Derived exit = arrow + 60·(sin a, -cos a): 26-31 units from the real exits. CLS coordinates
  only for the rooms in the resources; for Market/Avenue/Boardwalk/WP pixels of the wiki image. The
  wipe changes after ~230 («claws», not black). Not covered: Q351-375 and Q401-425 (YouTube asks
  for login), Q846-869 (no video), interiors of the Clock Tower (Q541-555, 20 wipes not attributed).
- **thethiny** (`thethiny_repos.md`): his tools read enemies and chests, not the exits; keys
  equal to ours; the 1.x tutorial is different from 4.3.1 (1010: target 89001 and 7 enemies against
  81020 and 14) -> exits to be taken from the 4.4.0 WW / final JP data. Repos without a license: only technical
  facts until he gives permission.
- **Local reference data** (13-10): from here on a local reference data folder (not provided by this project:
  `KHUX_JP_DATA`, `KHUX_REF_WORK`, see [SETUP.md](../SETUP.md)) with a 2016 resource bundle and the JP 4.3.1 data.
- **Format confirmed** (13-10): exit record = 9 int: x, y, angle, remaining distance, [4], arrival x, arrival y,
  destination part, direction; trigger radius 96; section B = materials, C = NPCs. Corrections to
  `stage_gen\exits\NOTE.md`: exit [4] not read (= 1 + steps from the destination part to that
  of the target, 635/681), direction [8] 0 = free; STG [13] = enemies excluded from «defeat all», [1] =
  format version (13/14 in 2016, 16 in 4.3.1), MAP +0x1c = weather; NPC with one more short.
  No table of the room names in the code.
- **Extractor** `reference\world_schema\scripts\extract_all_exits.py` (CHECK OK on the 6 exits of
  1010-1016, loose folders with revisions, BGAD packs). **2016 pack**: 923 stages, 1,300
  parts, 236 with several parts (up to 23), **697 exits, 241 links between 119 rooms** with original
  coordinates -> `stages_2016.json` (superseded, see below).
- **2016 pack inventoried**: `misc.mp4` = 27
  BGAD packs in a row (base rev. 8 + updates 9-34), 161,651 mode-2 records; with a repeated name
  the last one counts. **Stubs**: int32 counted from the first real record of its *own* update block
  (negative = previous block), not an absolute index (82,736/82,736
  consistent). `misc.png` opens with KEY_DOWNLOAD and is from a later revision. **150 rooms (144 complete)**: recovered 93 rooms that were missing (DW 20,
  WL 17, BC 15, DB 14, AG 13, OC 9, DG 5) + 38 new codes; the 19 in common with ours have identical CLS/CHP/JMP;
  DB_0018_01_00 complete in 2016 (closes the gap of I-074); OC_0001_00_00 ours is newer.
  `base1` is loaded from the room name in the BMI at +0x10 (28 rooms use the graphics of another):
  `check_rooms.py` must be adapted. Still missing 139 rooms (CD, ED, Ralph's worlds, DB_0020-0031,
  AG_0005-0023): JP 4.3.1 data. **Quests**: all the 525 story quests of the master are in 2016;
  exits in `stage_exits_2016.json` (744 exits, more recent versions). Tutorial 1010-1030 different
  from 4.3.1 (same rooms, different content): for the contents the closest version counts.
- **World schema v1** (`reference\world_schema\schema\`: `schema_mondi.json/.md`, local `index.html`,
  `img\<mondo>\` = room with doors, arrow and arrivals + `_grafo.png`; scripts `schema_mondi.py`,
  `schema_report.py`, `room_render.py`): from the 2016 exits, 695 valid exits, **277 doors in 90
  rooms, 118 links**, 5 one-way, 42 pairs with several doors. Discarded 45 exits of «leftover
  parts» (part files beyond the number declared in the STG: wrong destination, e.g. 72020) and 4
  of old STGs. Checks: 6/6 4.3.1 exits agree; Daybreak Town videos 17 agreeing, 7
  discrepancies all on unreliable arrivals in the video or angles (doors always coinciding). BC without
  doors (2016 quests all single-part); CD, ED and Ralph's worlds await the JP 4.3.1 data.
  Image background = base1 recomposed from the BTF tiles, aligned to the CLS. Do not publish:
  Square Enix graphics. To be confirmed with the user after merging with the JP 4.3.1 data (user's
  decision 13-10: review only the merged schema). **Links between different worlds** (only event
  stages 91000 and 16160: Boardwalk <-> Mine: Corridor <-> Dreadful Dunes, Path to the Mine <-> Scarab
  Sands, FS -> Corridor of Darkness): kept apart, not used for the story quests (user
  13-10).
- **JP 4.3.1 data** (`stage_exits_jp431.json`): 272,673 files,
  4,793 stages, 7,701 parts, 5,763 exits, 392 rooms. The local copy **lacks the stubs**:
  missing `_jmp` of 265 rooms, CLS/CHP of ~70 variants, 8 STGs and parts of 272 stages, 3 rooms
  DG_0100_*; rebuildable (empty 16-byte jmp or that of the geometry room: 133/133; CLS/CHP from a room
  with the same dimensions chosen with the quest points: 15/15, 38 rooms still ambiguous). Our 86
  rooms are identical in JP; tutorial exits identical to our WW ones: **the JP 4.3.1 map data
  are the WW ones**. Recovered 132 of the 139 missing rooms; only DB_0001_01_00,
  DW_0026_00_00, SA_0000/SA_0004_00..03 remain missing (no stage uses them). All the 525 quests of the master
  present with the same stageId; in those common with 2016 identical doors; 5 quests with different rooms
  (2060, 3310, 5300, 7170, 11220): for WW the 2016 one counts (it agrees with mapName and thumbnail of the
  master). 507 pairs of linked rooms (113 in 2016).
- **World schema v2** (`reference\world_schema\schema_v2\`, local `index.html`; scripts
  `rooms_merge_v2.py`, `exits_merge_v2.py`, `schema_mondi_v2.py`, `schema_report_v2.py`): rooms merged
  in `<ref_work>\rooms_merged\` (413: our 86 + JP + 2016; 633 files rebuilt with the rule in
  `_manifest.md`; 38 with uncertain geometry left without CLS/CHP). Merged exits: 5,849 stages, 8,516
  exits (2016 for 2060/3310/5300/7170/11220, JP for the rest, + multi_stage); types storia_master 525,
  storia_oltre 459, storia_variante 28, event 3,808, raid/trial 47, multi 982. 1,747 doors: **P =
  story 497** (certain geography), E = only events/raid/multi 694, X = between worlds 556 (apart).
  Checks: 6/6 4.3.1 exits, DB videos 19 agreeing / 8 disagreeing (arrivals and angles). Graphs per world
  (`_grafo_storia`, `_grafo_completo`, subgraphs per zone, PNG+SVG) readable. 15 doubts for the user
  in the report (Underground Waterway DB_0020-0023 and DB_0010 with uncertain geometry, missing names,
  classification of the stages, different angles between quests, median story/all).
  **User's decisions (13-10)**: variants 9060-10390 = story; 3xxxxx = events, 80000-99999 and
  9000xxxx = raids/trials; every quest uses its own original angle (the schema shows the most
  frequent); door position = median over the story quests only; AG_0000_00_00 with our
  INFO (WW client). The 38 rooms with uncertain geometry are resolved only with proof from the data
  (`reference\world_schema\stanze_incerte.md`).
- **38 uncertain rooms resolved** (`stanze_incerte.md/.json`, `scripts\stanze_incerte.py`, rules R3/R4 in
  `rooms_merge_v2.py`): decisive proof = the 2016 `misc.png` index (later global revision):
  same offset as a deduplicated name = same file (verified CLS 58/58, CHP 54/54, JMP 9,595/9,595,
  0 contradictions). 26 certain (e.g. DB_0020_* -> DB_0020_01_03, DB_0021_* -> DB_0021_01_03, CD_0012_04/06/07
  -> CD_0012_05_00, where the points rule would have been wrong), 12 very probable (DB_0010_0x_0y ->
  its own _00 with identical BMI; DB_0026_01_00 -> DB_0026_06_00; NL_*). Calibrations: with the real geometry
  blocked 0% chests, 0.24% enemies, 0.23% arrivals; exits 45% (they do not discriminate). Fixed 18 empty
  jmps contradicted by the index; HD_0002_00_00 and SR_0009_01_00 remain to be reviewed (empty jmp without
  proof). Schema v2 regenerated: 0 uncertain rooms, doors unchanged. Story beyond the master 18010-39xxx; `text\`
  Japanese only, no table of the area names. Rerun with two sources: `schema_mondi.py --exits stage_exits_jp431.json
  stage_exits_2016.json --rooms jp431=... 2016=... nostre=...`, then `schema_report.py`.
- **Inventory** (`areas.md`/`areas.json`): wiki galleries (343 images) compared with the 379
  Roboloid previews `images/map` (file name = room code) + thethiny's thumbId/mapName + original
  stages. Worlds 1-8: ~166 named areas, ~247 rooms (codes), **only 59 complete rooms in the
  resources** (84 of 86 in total; incomplete DB_0018_01_00, ED_0011_01_00). Almost all the
  areas of DW, WL, OC (Underworld), BC, CD, the desert and the Bazaar of AG, half of Daybreak Town are missing.
  Roboloid has the whole graphic preview of many missing rooms: a basis for a possible
  regeneration. Doubts: AG_0003_01_00 with three names, thumbId different from the named room in some
  rows (OC_0001_00, WL_0001/0002, DW_0004, DB_0007), prefix of the Corridor of Darkness deduced.

<a id="smoke-2110"></a>
## Test of the generated rooms after I-182 (21-10)

- Offline: `recon/tools/btf_check.py` (declared length = file length; type 8 `0x26 + u32@0x22`, types 1 and 9
  `0x28 + u32@0x24`; type 1 is not only the 45-byte placeholder: it is a palette without zlib) on rooms_gen,
  stage_gen, enemy_gen, medal_gen, raisedraw_gen: ~57,800 BTFs, **0 inconsistent**.
- The 86 rooms with the placeholder are used today by 42 quests (40 as first room, 10400 and 16160 only as second);
  44 are needed only by 526-979.
- Bench (`smoke_quests.ps1`, save `provetm`, resources 51, rev 166; the script now closes the Notices if they are
  open at startup): **34 out of 40 alive**. Crashes: signature A (I-183) 1160, 11170, 15050, 15340; signature B (I-184) 2140,
  10400. None in the BTF decoder. Outcomes in `D:\Progetto_Restauro_KH_UX\tmp\i182_smoke.json`.
- Fixes (resources 51 with `-Quick`): I-183 = `cocostudio/publish/ActionMapCoerceEnmAnim.*` («Coerce» warning
  of the Armored Archer), I-184 = `lwf/map/hole_rain/` (rain); from 2016 in `originals.tsv` #37-38.
  The 6 redone quests: all alive. The other unserved `.ExportJson` armatures (MedalEvoAnimation, Z_SpIcon_*...)
  are not opened by the WW client (it uses the LWFs).
- 16180: Bag O' seen as a hand (I-185).

<a id="oltre525"></a>
## Quests 526-979: original JP stages and user's decisions (20-10)

Report: `D:\Progetto_Restauro_KH_UX\reference\world_schema\oltre525\RAPPORTO.md` (tables in `_tables.md`,
matches in `oltre525.json`, script `match_oltre525.py`). All the 453 battle quests 526-979 have the
original stage in the JP 4.3.1 data (330 exact, 39 good, 83 probable in Ralph's worlds, 979 <-> 39159 by hand;
978 cutscene only); 526-555 identical in 2016. 253 rooms (203 new, 225 served, 27 to be added to the
pack: `make_jp_rooms.py --story-only` excludes them), 386 exits all P doors of schema v2.
User's decisions (20-10):
1. where the originals exist the originals count: the JP stages are imported, no tours first;
2. Q617 (20320) and Q661 (23010), part 1 missing: only that part is rebuilt in the room of the original door;
3. Q555 (18300-18304): you face the master of **your own Union** (user; confirmed 20-10, exception Vulpes -> Ira):
   stageId = 18300 + unionId - 1 (Ursus 1 Aced, Anguis 2 Invi, Unicornis 3 Ira, Vulpes 4 Ira, Leopardus 5 Gula). The
   client chooses it: master row 18300 with `branchType: 1` (loads mappoi_stg stageId + unionId - 1) + the 5 JP stages. Evidence: client
   behaviour, master 1.1.3 (one row 18300, 5 maps in stage_maps.json), wiki Q555, JP texts of the drama. No other
   quest 526-979 changes per Union;
4. SR_0009_01_00: graphics of SR_0009_00_00 with its own geometry;
5. room names (mapName): only **originals**, with in-depth research where they are missing or diverge.
   Research 20-10 (`oltre525\RICERCA_Q555_NOMI.md`): 37 rooms, 9 certain from the WW mapName (AG_0003_04/05_00 Tortuous/Parched
   Sands, DB_0010_* Clock Tower: Level, DB_0013_00_00 Clock Tower: Elevator), 27 probable (room1 of the wiki, which matches the
   WW mapName in 537/555), 1 not found (DB_0011_01_00). mapName of rows 526-979: room1 of the wiki per quest
   (526-555: mapName of the 1.1.3 master).
Technical work: 312 enemyIds missing in the master (`enemies_oltre525.json`), master rows 526-979 from the wiki (Lv from the
wiki, 87 STGs with Lv 1), worldId and wipe of Ralph's worlds (I-027).

Server and master (Task 6, 21-10): story up to 979 in `server.js` (`STORY_LAST`: `lastStoryStageId`, Beginner 30,
Shop/tickets; `gacha.js` `RESTORED_QUEST` 979); the list goes 525 -> 526 and 979 -> tour 991001 (order by `id`).
Q555: `stageRowOf` makes row 18300 apply to the variants 18301-18304 (AP, rewards, objectives, `stageScores`), drops and
chests from the received id; `ensureUnion` sets to 1 (Ursus) a `unionId` 0/missing of a created player (at
load, at `/user/create`, in `userDetail`): with 0 the client would look for 18299. Q978 (`onlyDrama`): no POI,
`/stage/start` without drops or chests, `/stage/clear` records the quest and gives the rewards; fallback: a `/stage/clear`
without `/stage/start` (`stageInProgress` off) with the current quest already finished and the next one `onlyDrama` records
that one. Objectives are counted by the client per `submissionId` (each objective counts only for its own id): 555 has 5 different targets, so its two «Defeat
the target enemy within 2 turns» are 7 «Complete within 2 turns» (same reward, in the Notices). 1.1.3 objectives of 542-544,
546, 548-552, 555 (enemy outside the JP stage) replaced with those of the wiki (`make-story-oltre.js`, ruling of the
controller). Master redone with
`KHUX_MEDALS_ALL=1 KHUX_WORLDTOUR=1 KHUX_STAGE_POI_EXTRA=<stage_gen\orig_stages\stage_poi_orig.json>;<stage_gen\orig_stages_oltre\stage_poi_oltre.json> node server/make-game-tables.js <wiki\medals.json>`
(+454 stages, +4 world, +312 enemy, +96 reward; -37 boosted rows left over from an old catalog, no references) and
`stage_poi_oltre.json` merged into `server/game_data/stage_poi.json` (457 stages, 1041 in all).

<a id="tour-v2"></a>
## Tour v2: one tour per zone on the original doors (I-116)

They replace the tours 991001-991008 (guessed doors). `recon/tools/gen_tours_v2.py [config.json]
[--available stanze.json] [--worlds DB,AG] [--out DIR]` (~4 min, numpy/scipy) reads the approved schema v2
(`reference\world_schema\schema_v2\schema_mondi.json` + `_graphs.json`), the rooms of
`<ref_work>\rooms_merged\` and the JP STG headers (original starts). Output in
`D:\Progetto_Restauro_KH_UX\stage_gen\tours_v2\` (NOT in `stage_gen\files`): `mappoi_stg99xxxx*.bin`,
`reports\<id>.json/.md` (rooms, doors used with door id, original and used coordinates, omitted doors
with the reason, notes), `tours.json` (index and master rows), `stage_poi_tours_v2.json` (the Shadow of every
tour, to be merged by hand into `server/game_data/stage_poi.json`), `available_rooms.json`, `validate.json`.

- **Zones**: `zone_storia` of `_graphs.json` (DB 6, AG 4); in the other worlds the connected components of the graph
  of the story doors (labels `c1`, `c2`...). Only doors with `scope = storia` between rooms of the same world and
  of the zone; omitted (in the report) the doors towards rooms outside the zone or not available, those towards the same
  room (loops: the tour has one part per room) and, among doors of the same room within <= 96 towards different
  rooms (variants, e.g. the DB_0010 labyrinth), all except the one with the most story quests.
- **Door** (decisions 13-10): exit = `story_median`; angle = the most frequent among the story quests
  (on a tie that of the quest closest to the median); arrival = median of the largest group of arrivals (chained
  within 96) of the story quests, direction = the most frequent in the group (almost always 0 =
  free: the validator flags it as a warning, it is the original value). [3] = remaining distance to the target,
  [4] = 1 + steps from the destination part to that of the target (as in the originals).
- **Snapping**: the original exits are often on a blocked pixel (edge). The original point is kept if
  it is walkable and snaps to a component reached within 48 (rules of `validate_maps.py`), otherwise the
  nearest pixel with free space > 16 of a reached component, at most 96 (trigger radius of the
  client; beyond that, door omitted): 14-10, 206 exits out of 346 moved, at most 85, median 35. Arrivals within <= 120
  of an exit of the destination part moved into the same component at >= 140 from all of them (10 arrivals,
  24-167 from the original). Omitted doors: 55 «same door», 24 unreachable, 19 loops, 16 towards rooms not
  available (plus those outside the zone). Components reached as a fixed point from the start following the active exits, **with the internal
  jumps** (`_jmp.bin`: records {CHP cell, k, k x (x1, y1, x2, y2, h)} of integers, steps between layers,
  taken in both directions): `validate_maps.py --jmp` does the same (without `--jmp` unchanged).
- **Start**: room with the most story-quest starts among those that reach at least 3/4 of the
  rooms of the piece (e.g. DB z2 = Fountain Square); point = medoid of the original starts in that room
  (moved to >= 300 from the exits if at < 200). The rooms not reached (one-way, unreachable exits)
  make a separate tour (zone `z1.2`...). Order of the parts = BFS on the active exits.
- **Target**: one Shadow (10001) in the farthest room (steps), at the point farthest on foot
  from the entrance at >= 240 from the exits, preferring the points without a long detour; no other enemies, no
  chests.
- **stageId** = 992000 + world index x 100 + progressive number of the tour in the world (DB 1 ... ED 8, DG 9,
  CS 11, HD 12, NL 13, SR 14): 992101-993406; master `id` = stageId - 900000. Name «Tour <XX><n> <stanza
  di partenza>» (start room).
- **Available rooms**: served today (`names_v4.tsv`, `ipa431\names_addnl.tsv`, `stage_gen\files`, minus the
  incomplete ones of `rooms_check.json`) + complete in `rooms_merged` (`_manifest.json` status `completa`): 399.
  When `rooms_gen` (resources 35) is ready rerun with `--available <lista finale>` (JSON list or
  `{"available": [...]}`). Today only 992112, 992802, 993102 use only rooms already served.

Outcome 14-10: **57 tours, 207 parts** (2: 23, 3: 13, 4: 8, 5: 5, 6: 4, 7-9: 3, 17: 1); 19 available rooms
without usable doors (in `tours.json` `single_rooms`). `validate_maps.py <tours_v2> <cartella con map\ ->
rooms_merged> --jmp`: **0 errors**; warnings: arrival direction 0 (original), «long detour» in 8 tours (9 towards original
doors, left where they are: e.g. 992101 labyrinth DB_0010, 992502 Underworld; 1 towards the target, 993402),
a target at 163 from an exit (992201, small room). Without `--jmp` 14 tours have doors reachable only with
the jumps. For the validator: junction `D:\Progetto_Restauro_KH_UX\tmp\tours_v2_cls\map` -> `rooms_merged`.

Master: `KHUX_TOURS_V2=1` (or the path of `tours.json`) in `make-game-tables.js` adds the tour rows
(copies of 1050 like the 99100N; worldId of the tour, Ralph's worlds -> 1; music and thumbnail from the first
quest of the world, thumbnail of the start room if a quest has the same thumbId). Tried on a
copy: +57 rows, no existing row changed. Command (then raise the master revision):
`$env:KHUX_MEDALS_ALL='1'; $env:KHUX_WORLDTOUR='1'; $env:KHUX_TOURS_V2='1'; node server\make-game-tables.js
D:\Progetto_Restauro_KH_UX\wiki\medals.json`. Start: `server/save/smoke.json` `{"stageIds": [992101, ...]}`
(server.js already accepts the master stageIds); maps to be copied into `stage_gen\files\stage` and POIs to be merged.

<a id="nemici"></a>
## Enemies in the maps

- Graphics `lwf/character/enemy/<displayId>/` only for 1, 6, 7, 8, 17, 37, 1020 (Shadow, Soldier,
  Large Body, Nosy Mole, Armored Knight, Dire Plant, Mega-Shadow) and the Dark Road series 5001-5086,
  7001-7005, 8001-8022. `make-game-tables.js` assigns by name the Dark Road graphics
  (`recon/tools/enemy_display_map.json`: 312 enemies, 51 graphics) or a substitute
  (`DISPLAY_SUBSTITUTE`, then by size); real displayIds in `enemy_display_orig.json`.
  `make_enemy_moves.py` (in the build) creates `move` by copying `wait` (the Dark Road graphics do not have
  `move`).
- Appearance effect `show_effect<showSwf>` present only for 1-4, 100, 501-506, 1000: the others ->
  the Shadow's one. «Defeat <nemico>» objectives on missing enemyIds -> Shadow.
- «Zoo» quests (`KHUX_ZOO=1`, stages 990001.., copies of 1050 in Fountain Square, areas of 5):
  one start checks dozens of enemies. Outcome: 50 quests out of 51 start (990018: tap lost, to be
  retried).
- Dark Road examples: 5002 Large Body, 5075 TopOperaY = Yellow Opera, 5054 Ifrit, 5063 Yeti, 5070
  Shiva, 8001 Flame Core, 5008 Bandit, 5004 Red Nocturne.

<a id="filmati"></a>
## Cutscenes and dialogues

Before/after cutscenes without `img/light/SEQ/<id>.l` or `lwf/drama/<id>/` disabled (base in
`stage_base.json`). Of the 116 lwf cutscenes (2xxxxxx) 5 are missing (all 2999951); the 175 dialogues
(SEQ scripts 1xxxxxx) almost all missing: the missing ids are removed (ISSUES I-014).

<a id="npc-talk"></a>
**NPC texts** (I-154, 18-10). Symptom on the bench: quest 132 (stage 5020, Agrabah), the guard has the
yellow balloon but tapping does nothing (no text, no request). Client: the npc record of the map holds two talk ids; the client uses the first with type 3, the first or the
second with type 1, none with the others; balloon `img/stage_npc/NPCTalkIcon.png` for `(tipo|2) == 3`. The talk window
reads `text/drama/<n>.txt` with n = id % 200000000 + 200000000 (pages separated by 0x0C) and without the
file it closes silently. The texts `2040xxxxx` (= 4 + 4-digit stage + 2-digit npc) came
from the CDN: in the WW resources there is only `204010301`. 5020: one npc (730, 690, id 2005, type 3, talk 4050201)
-> `204050201.txt`, missing. Served maps: 178 texts cited, 1 served, 177 in the 2016 pack in
English (176 also in JP). Fix: `recon/tools/import_npc_talk.py` in `build-resources.ps1` (after
the ui texts, before `resource_pack`) copies into the generated pack the current revision of 2016, failing
that the JP one (flagged), report `stage_gen
pc_talk.json`. The type 4 npcs have 1/2 in those
fields: they do not talk.

<a id="prove"></a>
## Tests on the bench

- Quests 1-8 played; 1060 (Dark Forest, 2 parts) in full twice (`route_1060.ps1`); 1240
  (Agrabah, 3 parts, wipe_4) with moved starts; 1050 fixed (chest uid 4 moved, STG totals
  1,1,2,4) up to `/stage/clear`.
- Crash on the part change: it was the missing `wipe_N` wipes (see
  [risorse_layout.md](risorse_layout.md#wipe)).
- `-Seek` does not work on the dark maps (ISSUES I-008): 1070 must be played by hand.

<a id="npc-senza-waitlwf-i-197"></a>
## NPCs without wait.lwf (I-197)

The client loads `lwf/character/npc/<id>/wait/wait.lwf` for every NPC of the map; if it is missing the room crashes. Stages 526-979 use 124 NPC ids (only 4001 is served by the original); `recon/tools/npc_placeholders.py` writes the empty LWF of `recon/tools/empty_lwf.py` for all those without an LWF, before `import_jp_coco.py`, which puts the JP 4.3.1 one where it has all the textures (13 NPCs out of 65 new ones). The remaining 52 (and 1 old one) are invisible but do not crash: to show them the original textures are needed.

<a id="musiche-per-missione-i-198"></a>
## Music per quest (I-198)

The columns `bgmField`/`bgmBattle`/`bgmBoss` of 556-979 no longer come from the world rule but from
`reference\world_schema\oltre525\bgm_per_quest.json` (423 quests, all except 978; ids, AKB names, evidence and confidence per row).
Source: khwiki «Forum:Notes 29 (Project Music: Where songs play) - KeybladeSpyMaster», tables of the Union X bosses per quest,
cross-checked with the masters 1-555 (area theme of the first room; default boss dw_bgm_000003). `make-story-oltre.js` requires it
(`KHUX_BGM_OLTRE`); the world rule (`WORLD_BGM` / reference row) remains only for the quests missing from the file.
Applied in place with `node server/make-story-oltre.js`: 30 rows changed (only bgm columns). 979 «The Key» = BBS_73_TheKey
(501006057) in the three columns; 977 boss bgm_raid_0001 (501001010). To be verified: 979 against the video, field/battle (medium confidence).

<a id="proud-mode"></a>
## Proud Mode (I-200, research and implementation 22-10)

Hard version of the story quests. Work files: `D:\Progetto_Restauro_KH_UX\tmp\proud\` (wiki table
`proud_quests_wiki.json`, scripts); screenshots and sources: `reference\proud_mode\README.md`.

### What the original was (evidence)

- **khuxwiki «Proud Mode»** (`wiki\wiki_all.json`): story quests at a higher level and with special rules: higher-level
  enemies, **every** quest has a fixed Keyblade and a condition on which medals may use their special attack; no continues,
  no Friend Medals. Opened with the «Proud» button of the Story Quests page. From quest 800 all objectives must be completed
  together (badge «Must clear all together», screenshot `rd_vsrxydhxfux51.jpg`). Rewards: 6 keyblades (Sleeping Lion Q3,
  Counterpoint Q103, Fenrir Q203, Darkgnaw Q328, Missing Ache Q378, Diamond Dust Q428), Power/Speed/Magic Gems, Dark Matter
  and Electrum Ore (Proud keyblades), Magic Mirror 6★ (+1% special attack bonus), Sun/Moon Gems (685+), Avatar Coins, Huey/Dewey/Louie.
- **Per-quest data** in the `proud*` fields of 978 quest pages (1-979 except 978, cutscene only): `proudlvl` (target level),
  `proudkey` (required keyblade, all 16 series, 13-90 quests each), `proudcon` (41 kinds of condition), 3 objectives with rewards
  (Magic Mirror 1127, Avatar Coin 767, Electrum Ore 300, Dark Matter 300, ...), `proudnajewel` (150 every 5 quests, 300/600 late),
  `proudall` (800+), `proudap` (template default **10**, «zero» on 801-979; the screenshots of 2019-2021 show AP 0 also on Q300/321).
  Level offset = `proudlvl - lvl`: +209 on the first quests, ~+110 at 300-500, +2000/2100 at 800-979.
- **User's guide** (`reference\guida_basi`): «Story e Proud: every 5 quests 150 Jewels; Proud stays at 150 after 525»; the
  6 Proud keyblades; Sun/Moon Gems strengthen the Proud keyblades.
- **Screenshots** (`reference\proud_mode`): the list is the same AdventureTop2 screen as Standard but **red/magenta**
  (PROUD logo, red panels, red cursor, «Standard Mode» button instead of «Proud Mode»), ticker
  ui text 100620055 (Proud Mode: limited special attacks, one fixed Keyblade per quest). The start popup
  (StartDeckProudScene) shows «This quest must be played with this Keyblade.» (103000016), CONDITION, «The option to Continue
  is not available in this mode.» (103000017), the fixed keyblade without «Change», Skip/Start/Optimize/Equipment.

### How the data identify a Proud stage (master)

- **Separate stage rows, same map**: `stageKind` **4**, `stageId` = **1 000 000 + story stageId**, `id` = 1 000 000 + quest number,
  `stageBinId` = the story stageId (the client loads `mappoi_stg<stageBinId>`: same maps, same enemies and chests). The
  JP 4.3.1 data have no other range of `mappoi_stg` for Proud (story 01xxx-39xxx only); the khuxwiki Proud targets equal the
  story ones (18 differences out of 978, all spelling).
- The only complete original row is in our base: `server/master_data/stage_base.json` (offline 5.0.1) row **1001010**
  «Prologue» (`check-stage-data.js` skips it): `stageKind 4`, `stageBinId 1010`, `useAp 0`, `validStopStage 0`,
  `disableContinue 1`, **`addLevel 209`** (Lv 1 + 209 = LV 210 of the wiki), **`holdKeyblade 4000`** (series id of Three Wishes),
  **`hardmodeRequire 13`**, `hardmodeName` «Only special attacks with a\nbonus value of %d%% or\nhigher allowed.»,
  `hardmodeComparison 3`, `hardmodeNum 4000` (40.00 %), own objectives (`submission*`). Wiki Q1 Proud: LV 210, Three Wishes,
  «bonus value of 40% or higher»: identical. `noPartner` is 0 in this row (the friend ban must come from the client).
- thethiny's master (`external\thethiny_2026-10-13\KHUx-Server\data\stage.json`, the one called 1.1.3 in these notes) has
  **50 rows stageKind 4, 1001010-1002130** (quests 1-50), `useAp 10`; 1001016 (Q3) has the first-clear reward type 13 id **8000**
  (Sleeping Lion). Read with an older 46-field schema, the rest of the row is misaligned (texts «Only special…» inside the drama
  arrays), so the hardmode fields cannot be recovered from it; the raw file `stage_raw.json` has only the 1140 story rows.
- 4.3.1 schema (`recon/out/master_types_ww431.json`): `addLevel`, `holdKeyblade`, `hardmodeRequire`,
  `hardmodeName` string(128), `hardmodeComparison`, `hardmodeNum`, `disableContinue`, `noPartner`, `combinedSubmissionFlag`.
  Only kind 13 of `hardmodeRequire` is known with its values; the codes of the other ~40 conditions had to be
  established from the client behaviour or rebuilt.

### Client 4.3.1 (protocol)

- The Story screen loads `AdventureTop2_Proud_Button.json` (Button_EV / Button_Standard / Button_Proud). **Button_Proud**
  («Proud\nMode», 102900042) is shown when **misc 125 != 0** (ours = 940: it is shown today, bench screenshot
  `reference\quest_list\bench_bug_lb5_now.png`). Button_EV needs a `userDetail` value >= misc 123 (14).
- Tapping Proud: **GET `/stage/hard`** (action **110**), then GET `/party/lux_up_time` (105) and GET `/user/mission/list`
  (206); then the Proud list (ticker 100620055, Button_Standard «Standard Mode» 102900041). UserDefault key
  `proud_select_filter_state` (Proud filter). Action ids from `assets431\json\server_api.json`.
- `/stage/hard` response: the same shape as `/stage/160310`:
  `stories[]` (`stageId`, `useAp`, `score`, `playStatus`, `clearMissionIds`), `newStageId`, `luxRank`,
  `openRankingId`. So the Proud list = the kind-4 stageIds unlocked so far. Start/clear go through the usual `/stage/start`
  (113) / `/stage/clear` with the 100xxxx stageId (no separate endpoint found).
- `/stage/achievements` (169) has `strengthNumerator/Denominator` next to `main*`: most likely the Proud completion of the
  Story screen (khuxwiki changelog: «completion percentage for Standard Mode and Proud Mode»).
- Start popup: the client loads `StartDeckProudScene_ver260.json`, `StartDeckProud_Deck_ver230`,
  `StartDeckProud_Panel_KB(_Ad)_ver230` (keyblade without «Change»: `NotChangeKB_Name`) and
  `AdventureTop2_Proud_RaidInfo_Start.json`; strings `PMode_Panel`, `PMode_Ability_Txt`.
- Unlock rule: decided by the server (the list is whatever `/stage/hard` sends), not found in the wiki. Screenshots: after the
  last released Proud quest come «Coming Soon!» cells (Q940 in 11-2020, Q977 in 05-2021: Proud releases lagged behind the
  story). Per-player rule (Proud N after story N? after Proud N-1?) to be decided with the user.

### Layouts and textures

- Served today (catalog = WW resources): `AdventureTop2_Proud_Button`, `_Proud_Story_Title`, `_Proud_Story_Drama_Title_ver350`,
  `_Proud_RaidInfo`, `_Proud_RaidInfo_Drama_ver350`, `_Proud_SubMission_ver131/270`, `StartDeckProudScene_ver230/260`,
  `StartDeckProud_Deck_ver230`, `_Panel_KB_ver150/230`, `_Panel_KB_Ad_ver230`, `_Button_ToDeck_ver260`; textures `PMode_But1A/1B/2A/2B`,
  `PMode_Logo`, `Panel11_pm`, `Panel11B_pm`, `Panel_Target_Mask2_pm`, `Plate01_pm`, `Plate09_pm`, `Win23_pm`, `Ch_Micon_Base_pm(2_*)`.
- **Missing** (all present in the JP 4.3.1 data, `jp_final_4.3.1\cocostudio\publish\`): sub-layouts of the start scene
  `StartDeckProud_Base_ver131`, `_Button_Skip_ver131`, `_Button_Start_ver131`, `_Rules_ver131`, `AdventureTop2_Proud_RaidInfo_Start`
  (in `catalog\missing_layouts.txt`); textures `Panel03_pm`, `Panel04_pm`, `Deck_Panel_StartDeck_pm` (9-slice: **crash 0x2c** if
  missing, layout_triage REPORT), `Win01_pm`, `Win16_pm`, `Plate11_pm`, `Plate18_pm`, `PMode_Rule_Logo`, `PMode_Rule_Panel_A`,
  armature `Cursor_Anim_Proud` (red cursor; not cited by name in the binary, to verify). The ui texts are already there
  (100620055, 102900041/42, 103000016/17, 104810145).

### Implementation (22-10, user decisions of 22-10)

Files: `server/make-proud.js` (called at the end of `make-game-tables.js` after `make-story-oltre.js`; idempotent; applied
in place with `node server/make-proud.js`, `KHUX_PROUD=0` turns it off), `server/server.js` (`/stage/hard`, POI, clear),
`server/test-proud.js` (`node server/test-proud.js [master]`), `server/check-stage-data.js` (Proud rows checked on the
story map), `server/test-keyblade-unlock.js` (Proud keyblades from the Proud rows), notice «Proud Mode» (IMPORTANT).

- **Rows**: 979 rows `stageKind 4` (quests 1-979; 978 «What Comes After» is cutscene only also in Proud: the wiki page has
  `proudnajewel 600`, Power Gem and Speed Gem), `stageId` 1 000 000 + story stageId, `id` 1 000 000 + number, `stageBinId` =
  story stageId; name, map, world, thumbnail, cutscenes, branchType, onlyDrama, raidBoss and music copied from the story row
  (as 1001010 and thethiny's 1001016). Row **1001010 of the 5.0.1 base is kept as it is** (identical to the wiki data).
  Source: `wiki_all.json`, `proud*` fields of the pages «Quest N: ...» (the «/Archive» pages are skipped). Q3 comes out
  identical in shape to thethiny's 1001016 (13/8000 Sleeping Lion, Huey 6★ 90026).
- **Unlock** (decision 1): the client has no rule. Button_Proud is a pure flag (misc 125 != 0, used nowhere
  else; misc 124 = 1 000 000 is the Proud stageId offset used by the client) and the list is exactly `stories[]` of
  `/stage/hard`. So the server decides: closed (`stories []`, `newStageId 0`) until story Quest 500 is cleared
  (`KHUX_PROUD_UNLOCK_QUEST`), then the cleared Proud quests + the next one, like `/stage/160310` (Proud N after Proud N-1;
  the 2019 screenshot rd_tharuko53wk31 shows the same pattern: cleared cells + one «NEW»). When every Proud quest is cleared
  the server sends `newStageId 0` (see [list states](#stati-elenco)): the client then shows «Coming Soon!» on the locked cells
  after the last one, as in the screenshots of Q940 and Q977.
- **AP** (decision 2): **0 on every Proud quest**, the final online value. The client charges the `useAp` of the
  `/stage/hard` list entry, taken from the row. Evidence: 5.0.1 row 1001010 `useAp 0`;
  screenshots 2019-07 Q300, 2019-09 Q321, 2021-05 Q977 show «AP 0»; thethiny's master (2017) has `useAp 10` on its 50 rows
  and the wiki template default is 10 (pages say «zero» only from 826): the value of the launch, changed later.
- **Jewels** (decision 3): the per-quest wiki value `proudnajewel`: 150 every 5 quests up to 800, 300 for 805-880, 600 for
  885-979 (+600 on 976, 977, 979). The user's guide («Proud stays at 150 after 525») agrees up to 800 and predates the 800+
  quests; the wiki table is per quest and later, so it wins.
- **Conditions** (decision 4): a medal that fails the condition cannot use its special. Fields: `hardmodeRequire`,
  `hardmodeName` (up to 1025 bytes), **`hardmodeComparison`, `hardmodeNum`**, `combinedSubmissionFlag`. Require 0/1 = no limit, >= 15 = always false. Comparison 1 `==`,
  2 `<=`, 3 `>=`. Codes: 2 attribute (1 Power, 2 Speed, 3 Magic), 3 darklight (1 Upright, 2 Reversed), 4 medal source
  (unused by Proud), 5 rarity, 6 guilt tier («N-tier or more boosting»), 7 medal level, 8 STR (with fusion, no keyblade),
  9 DEF, 10 gauges of the special, 11 hits of the special, 12 special attack bonus «+N» (fusion), 13 bonus % x100,
  14 target (1 single, 2 all, 3 random). The start popup formats `hardmodeName` with Num (Num/100 for 13): one `%d`, `%%`.
  All 89 condition texts of the wiki map to a code (`CONDITION_FORMS` -> `CODES`); the texts are the wiki ones with the
  number as `%d`, wrapped at 28 characters like 1001010 (whose text is kept). **Nothing reconstructed** except the 3 quests
  without a condition (891, 892, 913: no `proudcon`, «—» in the «Proud Mode» page): `hardmodeRequire 0`.
- **Objectives**: wiki texts with the codes of `make-story-oltre.js`, plus 32 («Deal N or less hits»), 34/35 («Equip N or
  more Upright/Reversed Medals», own medals only; «Use N or more Reversed Medals (No borrowed Medals)» = 35); 0 stopgaps. Rewards: Electrum Ore 55, Dark Matter 58, Power/Speed/Magic Gem 48/49/50, Sun/Moon Gem 51/52,
  medals by name and rarity; medal rewards with `submissionSkillType 1 / SkillLv 1` like 1001010.
- **Must clear all together**: `combinedSubmissionFlag 1` from 801 (`proudall`; the «Proud Mode» page says «from 800» but
  Q800 has no flag). The client shows the badge (106150400) but reports each objective alone: `respondStageClear` keeps the
  objectives of a run only if all of them are there.
- **Friends / continue**: `disableContinue 1` (popup line 103000017). `noPartner` stays 0 as in 1001010: the Proud start
  flow has no friend step.
- **Keyblades** (decision 5): `holdKeyblade` = series id (keybladeId of the lv 0 row); the client uses the player's own
  keyblade of that series at its level; without it the popup shows 103000018 «You need this Keyblade to play this quest.»
  and Start is disabled (no crash), e.g. Proud 216 (Stroke of Midnight, story 595), 444 (Fairy Stars, 683), 885 (BGB, 880).
  The 6 Proud keyblades are the first-clear reward (type 13) of Proud 3/103/203/328/378/428, each needed only after it is
  earned; `grantMissingKeyblades` no longer gives them (they are master rewards now), saves that have them keep them,
  `grantKeyblade` never duplicates a series.
- **Server**: `/stage/hard` (`respondProudList`), `poiStageId` (drops and chests of the story map: `stageBinId` +
  variant; the client loads `mappoi_stg` = stageId - misc 124, replaced by `stageBinId`, + unionId - 1 with branchType 1), separate `stageScores`/`clearMissions` (key 100xxxx), `lastClearStageId` not moved by Proud clears,
  Q978-without-start fallback also for Proud, Beginner 41 derived (`lastProudNumber() >= 3`).
- `/stage/achievements` `strength*` = the Special quests category (panel Achieved3, opens at Quest 6,
  misc 122), **not** Proud: not touched (I-037).
- **Open (bench)**: `addLevel` is shown only in the raid-boss popup (level + addLevel); no battle use found, so
  whether Proud enemies really are stronger must be checked on the bench (Proud 1 vs Story 1 enemy HP/level). Which stageId
  `/stage/start` sends for the Proud 555 (1018300 or 101830x; the server accepts both).
- Resources (fork commit 77cee4c): root `StartDeckProudScene_ver260` in `jp_coco_layouts.txt` with its 5 JP sub-layouts and
  10 textures (`Deck_Panel_StartDeck_pm` 9-slice included), `Cursor_Anim_Proud` on the slot `ActMapTreasureBoxExAnim0`;
  `PMode_Rule_Logo` JP reads «RULE» (global «CONDITION»: to redraw); needs a new resources version.

### What we served before 22-10

- `/stage/hard` has no route: the generic answer from `api_responses_auto_ww431.json` (`stories: []`, `newStageId 0`, ...).
  The master has only row 1001010 (Prologue, from the 5.0.1 base), never listed. Tap on «Proud Mode» never tried on the
  bench: expected empty list or crash (`newStageId 0`, missing sub-layouts/9-slice textures of the start popup).
- `respondStageStart`/`respondStageClear` know nothing of kind 4 (no POI for 100xxxx: no drops/chests, `useAp` from the row);
  `/stage/achievements` all 0 (I-037); Beginner mission 41 «Complete up to story quest 3 in Proud Mode» and the 6 Proud
  keyblades given by `grantMissingKeyblades` (home_profilo, I-087) wait for this feature.

