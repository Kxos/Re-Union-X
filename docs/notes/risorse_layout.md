# Resources, missing layouts, textures

How the resources served to the 4.3.1 client are made and how the missing screens are
rebuilt. History: [../journal/fino-al-2026-10-11.md](../journal/fino-al-2026-10-11.md).

<a id="pacchetti"></a>
## BGAD packs and indexes

- The assets (`misc.mp4`, `extra.mp4`, `aliud.png`, OBB, `addnl`) are **BGAD** packs: records with a 24-byte header, encrypted with a key held by the client library.
  The names are in the `.png` index of the same name, with a second encrypted layer. Record names are
  obfuscated (`bgad_names.py`). The decoding tools (`bgad.py` and related) are kept private, outside
  the public repository (`recon/tools/private_tools.py`).
- The records with encryption 3 of the packs mounted as resources open with the session key
  (for us the 5.0.1 one): `BGAD_KEY=<hex> recon/tools/bgad_extract.py`.
- The client mounts: KHUX side `r/misc.png`+`r/misc.mp4` (slot 1) and `addnl.png`+`addnl.mp4` (slot 2,
  iOS only); Dark side `aliud.png` with [OBB main, OBB patch, `r/.misc.mp4`].
- **Version 3** = OBB 5.0.1 (`main.76` + `patch.87`, Dark Road data but with the complete graphics)
  + `addnl` of the iOS IPA 4.3.1 (KHUX layouts of 4.3.1) in a single pack
  (`resource_merge.py`; with equal names the first wins). From 4 onwards the generated pack is added
  (`resource_pack.py`), from 30 also the medal pack (`medal_gen`, second-to-last
  part). `--last-wins`: the generated pack can replace original files.
- **Parts of a complete version** (`build-resources.ps1 -Version N`): `d0000`-`d0034` of 7
  (hard links: OBB 5.0.1, `aliud`, `addnl` 4.3.1), then the static packs, rebuilt only in the
  complete versions: `d0035` medals (`medal_gen`, ~850 MB), `d0036` **recovered rooms**
  (`rooms_gen`, `make_jp_rooms.py`, 732 MB in 35; `-NoRooms` to do without), from 36
  `d0037` **original enemy graphics** (`enemy_gen`, `make_jp_enemies.py`, 53 MB;
  `-NoEnemies` to do without, with the master regenerated with `KHUX_NO_ENEMY_GEN=1`:
  [battaglia.md#nemici-jp](battaglia.md#nemici-jp)), then the generated one (`stage_gen`, `d0037` up to
  35, `d0038` from 36, `d0039` from 46; reserve 176 MiB in 47, 168 MiB from 48) which wins over all. List of the static packs in
  `resource_data\<N>\packs.txt`: `-Quick`/`-DryRun` put back into the index those of the installed
  version (without `packs.txt`, versions <= 34: no rooms) and never rebuild `rooms_gen`
  or `enemy_gen`.
  The client splits the data into `misc.mp4`, `misc.mp4.1`, `misc.mp4.2` ... at 2 GiB: 47 has
  4,286,993,546 bytes (3.99 GiB, **7.6 MiB under 4 GiB**); limits and measurements in [Parts and 4 GiB](#pezzi).
  Rooms: [mappe_storia.md#stanze-jp](mappe_storia.md#stanze-jp).
- Tools: `res_get.py <nomi.tsv> <resource_data\N\data> <uscita> <nome>...` (extracts by name into
  `D:\Progetto_Restauro_KH_UX\layouts\orig\`), `res_bulk.py` (bulk extraction, 16 s for 4000
  files), `catalog.py` (catalog, 2 min), `asset_coverage.py` (assets cited by the binary against an
  index), `resource_split.py` (64 MB parts).

<a id="pezzi"></a>
## Parts and 4 GiB (I-171)

Client behaviour (WW 4.3.1, 20-10):
- The downloaded "data" are appended to `files/r/misc.mp4` and, every 2 GiB (0x80000000), to the next part:
  `misc.mp4.1`, `misc.mp4.2` ... The client reads at
  most **10 files** (`misc.mp4` .. `misc.mp4.9`): ceiling **20 GiB** (21,474,836,480 bytes). Beyond that, the
  writer creates `misc.mp4.10` which nobody reads: different sizes at startup, resources deleted and
  downloaded again at every startup.
- Offsets, positions and totals are 64-bit: part = offset >> 31, local offset = offset & 0x7fffffff.
  The record offsets in the BGI index are **absolute
  u64** in the concatenated stream (the split into parts is not visible from the index). Saved size
  `resource_size_64` (8 bytes).
- Every file of `/system/resource` has `size` read as an int: **every served part under 2 GiB** (ours:
  64 MiB for OBB/addnl, medals ~0.96 GB the largest).
- The index `size` record is valid only if < 2^32: beyond 4 GiB it is ignored (no error, just one
  check less).
- **No free-space check** before the download: full disk = «Save error. Please check the
  storage space on your device.» (short `fwrite`). Peak = installed data + one cached part.
- Still to be tried on the bench: a download with `misc.mp4.2` (recipe in
  `D:\Progetto_Restauro_KH_UX\tmp\res4g\bench-recipe.md`): `build-resources.ps1 -Version N -TestStraddle <nome>`
  puts a part of zeros before the generated one (`resource_parts.py --straddle`, name of the part in
  `resource_data\<N>\testpad.txt`, honored by `-Quick`) so that the record <nome> of the generated pack straddles
  the 4 GiB; the next version, without it, goes back under.

Measurements of 47 (`D:\Progetto_Restauro_KH_UX\tmp\res4g\inventory.md`): 40 parts, 4,286,993,546 bytes; OBB
main+patch 2,185,902,806, addnl 132,056,004, medals 965,832,467, rooms 731,805,396, enemies 53,227,192,
raisedraw 33,620,305, generated 184,549,376 (content 138,817,141 + 45,732,235 of reserve zeros).

Tools (20-10):
- `bgad.py read_index` reads the u64 offsets (before u32: beyond 4 GiB truncated).
- `-Quick` writes the generated pack into the guest part `offset >> 31` and, if it crosses it, into the next one
  (`resource_parts.py`); first it checks that the packs before the generated one are as long as the installed
  parts.
- **Compaction** (`resource_compact.py`, by default in the complete versions from 48, `-NoCompact` to
  do without): OBB, addnl and medals rewritten with only the records citable from the merged index (a record is
  alive if a name of its pack cites it and no earlier pack has that name; those of the names
  that the generated pack replaces remain, so a `-Quick` that stops replacing them finds the original again). On the
  inputs of 47: OBB -30,080,308, addnl -54,662,654, medals -4,911,439 bytes (rooms, enemies,
  raisedraw: 0). `resource_compare.py` verified that every name (396,297) has the same bytes. Cache
  in `D:\Progetto_Restauro_KH_UX\compact` (OBB and addnl parts shared with hard links across versions),
  list in `resource_data\<N>\compact.txt` with the fingerprint of every compacted pack (data bytes,
  SHA1 of the index, fingerprint of the inputs): `-Quick` recomputes it and stops if a later build has
  redone them.
- Reserve of the generated pack **168 MiB** (was 176): content 132.4 MiB in 47, ~35.6 MiB remain for `-Quick`
  (more than the block of originals of I-170, ~33 MB). A complete version with these rules: **~4,188,950,537
  bytes (3.90 GiB), ~101 MiB under 4 GiB**, before new content.
- Not removed: the 41 medal images without `imageId`/`thumbId`/`cutinId` in `medal.json` (16 MB): 17
  still have a row (the 1xxxxx copies of Organization XIII, remapped by `MEDAL_MAP_FIX` of
  `make-game-tables.js`), 13 are the 3004xx duplicates of `server.js`; only 10 (2.6 MB) are cited by
  nothing.

<a id="btf"></a>
## BTF textures

- `\x89BTF`, 38-byte header (canvas size, crop rectangle x/y/w/h, compressed size), then zlib RGBA (type 8 RGBA8888, type 9 palette + indexes; also RGBA4444).
  `recon/tools/btf.py` decodes and encodes, `btf_to_png.py` converts.
- **The originals have premultiplied alpha**: `btf.encode` premultiplies, `decode` removes it;
  `btf_fix.py` (in the build) converts old PNGs and BTFs. Without it: white edges (e.g. Donald).
- `Result_LU_Win_Star.png` used as an ImageView shows up striped: do not use it.

<a id="regole"></a>
## Discovered rules (valid for every screen)

- **New plists are not loaded**: the client reads only plists with names already present and uses the
  texture with the plist's name (`X0.plist` -> `X0.png`). A new armature with its own frames replaces
  the plist+png of an armature that the binary does not cite: free ones `EquipmentBGAction0` (used by
  `Cursor_Anim_MedalSell`), `MyPageAnime0` (used by `Cursor_Anim_Ranking/Ranking2`), `AdventureTopAnima0`, `GlobalNaviAnimation0`,
  `LuxUpPanelAnimation0`, `ActMapTreasureBox*0`, `Cursor_Anim_QuestPanel0`/`QuestArrow0`. Check of 22-10 (I-200):
  `AdventureTopAnima`, `GlobalNaviAnimation`, `LuxUpPanelAnimation`, `Cursor_Anim_QuestPanel/QuestArrow` are cited by
  served scenes (AvatarEdit, GlobalNavi, AdventureTop2), so taking them changes those screens; only
  `ActMapTreasureBoxAnim0` and `ActMapTreasureBoxExAnim0` are cited by no served or generated layout and not by the binary.
  `ActMapTreasureBoxExAnim0` now carries `Cursor_Anim_Proud` (JP_ARM of `import_jp_coco.py`); `ActMapTreasureBoxAnim0` is the last free one.
- Playing an armature movement that does not exist = crash.
- Many buttons load `img/ui/<nome>_On.png` on tap: without it, crash (46 copied).
- The template's ImageViews have 9-slice (border 50): for icons at natural size `s9=False`.
- **9-slice + missing texture = crash** in GUIReader (setScale9Enabled recreates the Scale9Sprite on the missing
  file, SIGSEGV at 0x2c, bench absmax). Without 9-slice the missing texture is tolerated. It was the
  `Countdown_panel` (Plate21) of `PopupNormal_Continue_Multi` (Continue, AP_Recovery, Ability_MAX)
  and `Win_Over` (Panel07) of `MedalInfo_ReleaseWindow`; same trap in the served originals
  `PassiveResult`, `DeckEdit_SubSlot_Select_Medal_ver260`, `StartDeckProud_*`, `ActionMap_Multi*`.
- **Textures loaded by the client by name and missing = crash**, even outside layout loading. Case: the plate of
  Shop > Draw always loads into `Lock_icon` (118x118, child of `LockMask`) `img/ui/ShopBut_Lock.png`
  or `ShopBut_Lock_Disable.png`, even without a lock; Dark Road
  renamed them `dark_Icon_Lock` / `_Disable` (same graphics as `QuestBut_Lock`): `make_shop_lock.py` copies them
  from the catalog (resources 39, I-133). A locked plate turns off the draw buttons,
  which loads `img/ui/%s_Disable.png` (also `_Off`/`_On`) onto an ImageView
  with 9-slice: `But07_Disable` was missing (copy of `But24_Disable`, same shape). Tap on the padlock: I-134.
- An ImageView whose texture the client replaces (e.g. `Image_3`
  of the Events banner) must be without 9-slice and with a served texture.
- Arrow buttons accept the tap in a rectangle as large as the target but **centered on its
  origin**: button panels must have their origin at the center of the arrow.
- When the code takes «the first child» of `LeftUI`/`RightUI`/`CenterUI`, an empty panel
  crashes; a full-screen touchable Panel absorbs the taps.
- An empty LWF (`waist_c.lwf` of the outfits, 492 bytes) avoids the crashes of missing LWFs, but an LWF that
  must have a label (e.g. `SpIcon_Open`) must be copied from one with the label (Result_Reward).
- But01 buttons taller than 68: vertical 9-slice at half height (`TALL9`, capInsetsY 32); with`n  capInsetsY 0 the almost transparent first row stretches into a light band (PvP_SelectWindow).
- Texts: the client reads `text/<categoria>/<id>.txt` (ui/drama/audio); a missing id =
  crash. 856 constant ids cited (`ui_text_ids.py`, `layouts\ui_text_ids.tsv`); 2,332 originals
  imported from the `misc` of the IPA 4.4.0 (`import_ui_texts.py`). Missing there too: 102850008,
  106260102, 1062402xx (filters, now «%d»/«%d+»), 106240301 «Tickets», 101210001-003 (space in the
  English resources).
- Widgets are looked up by name; for some Labels the client creates a CustomRichText from the Label
  (`Txt_X` -> `Txt_X_Cus`: do not put it in the layout), and some TextFields are replaced at runtime.

<a id="make-layouts"></a>
## `recon/tools/make_layouts.py` and `make_textures.py`

- Entry types: `copy` (from an existing layout, with `retex` dark_* -> KHUX via `DARK_TO_KHUX`, changed
  names, `('text', nome, testo)`, `('clone', sorgente, nome, genitore)`), `scene` (empty nodes or a
  `GUIComponent` that loads a layout: `('CenterUI', 'publish/X.json')`), `build` (from a description:
  `P` panel, `I` image, `B` button with Label, `L` label; `scale`; `('frame', ...)` 9-slice
  frame with 8 bones), `armature` (renamed copy of `ArrowAnim.ExportJson`), `func`.
- Writes into `D:\Progetto_Restauro_KH_UX\stage_gen\files`; then `build-resources.ps1 -Quick`.
- `make_textures.py` (Pillow): textures that do not exist in any resource, drawn from the
  original screenshots (Sf_Switch, arrows, rare_star, Buff, But23, MedalInfo_Guilt9 = copy of 8,
  Mogshop_plate1, But29/31, Profile pages, Sphere_*, wipe_N...).
- Often used KHUX equivalents: `Panel04` (dark blue box), `Plate12`/`Plate13`, red `But16`,
  orange `But17`, `Win01`/`Win11`, `Win09` (9-slice with an elastic central zone),
  `Plate18`, `But06`.
- Cycle for a missing screen: `func_strings.py` + `widget_lookup.py` (names looked up by the
  code), `text_ids.py` (missing texts), layout in `make_layouts.py`, textures in
  `make_textures.py`, test with `-Quick`, crashes with the recipe of [banco.md](banco.md#crash).
  `layout_tree.py` (tree of a UI 1.6 layout), `scene_tree.py` (SceneEditor scenes).

<a id="mancanti"></a>
## Missing layouts

- Of the 601 cocostudio layouts cited by the 4.3.1 binary, 441 were missing with the OBBs alone, 285 with
  `addnl`, ~307/250 in later measurements; current list in
  `D:\Progetto_Restauro_KH_UX\catalog\missing_layouts.txt` (254 at 11 October: Album, Chat, Party,
  Ranking, PvP, Pet, TresCommu, ShopBuyItem_*, Purchase_Pop, Information_Save...). Every screen that
  uses them crashes in GUIReader until they are generated (ISSUES I-002, triage in progress).
- The offline 5.0.1 removed the online features and their assets; the online assets of 4.x
  came from the CDN (`r/misc`), of which no public copy is known.
- Generated so far (see `make_layouts.py`): Presents, Medal List/detail/Sort/sale, Evolve,
  Sell Materials, Moogle Shop, Profile, Avatar Boards, Other (MenuDialog_ver300), Missions,
  MyPage_ChirishiBaloon, PopupNormal_Continue, BattleResult_LB_ver120, BattleResult_KB,
  BattleResult_Skill_ver130, PopupNormal_Cost_Over/AP_Recovery/MedalOver/Ability_MAX,
  DeckEdit_Cost_Over_ver131, Events tab (AdventureTop2_EV_Banner_ver220, _EV_Button, _Raid_Button)
  and others. Triage of the 254 in `stage_gen\layout_triage\REPORT.md`.
- Still missing: all the `PartyTop_*` (scene `PartyTopScene` requested also on KO in solo: ISSUES
  I-001/I-006), `PetInfoScene_ver320`, `PetInfoAnim`, `lwf/pet/motion` (generated by
  `make_pet_motions.py`, our LWFs with «end»: [home_profilo](home_profilo.md#pet)); of
  `lwf/pet/part` there is only `001`.
- **thethiny's JP 4.3.1 data** (13-10, ISSUES I-117, `D:\Progetto_Restauro_KH_UX\reference\world_schema\jp431_cocostudio.md`):
  `jp_final_4.3.1\cocostudio\` has 1,596 layout jsons (current revision = highest entry id), non-premultiplied PNGs
  (convert with `btf_fix.py`); 243 of the 256 missing, all online screens complete; the JP layouts are
  the WW ones (284/466 identical). The WW localized textures (11, e.g. Ch_Logo, World_Stage_Clear) always
  win. The layouts use free text (Japanese placeholders, also in the WW ones: the code overwrites them
  from the text/ui ids). Without a source only 13 layouts specific to WW.
- Since 13-10, 74 of our generated layouts are replaced by the JP originals: see
  [below](#jp-originali).

<a id="jp-originali"></a>
## Original JP layouts in place of the generated ones (I-117)

User's decision (13-10): where we have a generated layout and the original is in the JP 4.3.1 data,
the original is used. Source: `cocostudio\` of the local reference data folder (`KHUX_JP_DATA`; not provided by this project,
read-only, never in the repository).

**Tool** `recon/tools/import_jp_coco.py` (Pillow: without `-I`), launched by `build-resources.ps1`
after `make_layouts`/`make_textures`/texts and before `btf_fix`. It reads the versioned list
`recon/tools/jp_coco_layouts.txt` (one root per line; options `rev=N`, `need=a,b`, `+absent-ok`, `clone=`, `set=`, `graft=`;
`? Nome # motivo` = to be decided) and for every root takes the closure (sub-layouts of the scenes,
armatures, textures) and writes it into `stage_gen\files\cocostudio\publish\` over the generated one.
- Revision: highest entry id, unless `rev=`. **Warning**: the extractor sometimes gives a
  revision the content of another layout (`PresentBOX_Panel_ver131.00265720` is a panel of
  icons): if the chosen revision has fewer than half of the names of the first, the root stops.
- Names already served (`names_v4.tsv`): never copied, WW wins (including the 11 localized textures).
- Armatures of `JP_ARM` (new plists do not load, [rules](#regole)) found in a root's closure do not stop it: the
  JP `ExportJson` is written by the JP_ARM block on its free plist slot. Proud Mode (I-200, 22-10): root
  `StartDeckProudScene_ver260.json` (served WW scene without its sub-layouts) brings `StartDeckProud_Base/Button_Skip/
  Button_Start/Rules_ver131`, `AdventureTop2_Proud_RaidInfo_Start` and the textures `Win01_pm`, `Panel03_pm`, `Panel04_pm`,
  `Plate11_pm`, `Plate18_pm`, `Deck_Panel_StartDeck_pm` (9-slice), `PMode_Rule_Logo`, `PMode_Rule_Panel_A`,
  `Charge_CloseBut_Off/On`; `Cursor_Anim_Proud` (frame `PMode_Rule_Panel_B`, yellow frame of the condition panel) on
  `ActMapTreasureBoxExAnim0`. Open: the JP `PMode_Rule_Logo` reads «RULE», the global client showed «CONDITION» in the
  same yellow style (reference\proud_moded_x94ey7mwud141.jpg); the WW texture is not in our resources (to redraw).
  Served WW root that make_layouts overwrote (`MedalInfo_ReleaseWindow`): the WW one comes back,
  copied only to translate its texts, with the missing textures from JP (Panel07, 9-slice of I-049).
  Exception `graft=W1,W2` (only served WW roots): grafts into the WW the widgets W1, W2 of the JP revision
  (`rev=`), under the parent with the same name and in the same position; new tag if already used; already
  present = nothing. Used for `BaseBuff_Avt_Null1/2` of `ActionMap_PlayerStatusField_new` (rev. 00360289,
  I-155, [battaglia](battaglia.md#basebuff)): the rest of the layout stays WW.
- Our sub-layouts not in the list stay ours; textures drawn by us replaced
  by the JP original (same canvas or no other generated layout uses them; never the armature
  atlases). Textures of `publish/` that the extractor removed as duplicates: they are taken with the
  same name from JP `cocostudio/` or `img/` (Panel10, BG_Black, MD_Guilt4_On, Complete_icon1...).
- JP PNG (straight alpha) -> premultiplied BTF with `btf.encode`.
- Textures with drawn Japanese (QuestBut6/7_Title, Rank_Title_3, Comeback_Tutorial_*,
  Camp_Balloon3, TresXTresStartUp_*_Logo): never imported, they count as missing.
- Texts: Japanese label equal (spaces excluded) to a JP `text/ui/<id>` -> English of the same
  id if all the candidate ids give the same text; hand-made texts in `recon/tools/jp_coco_texts.tsv`;
  the rest stays a placeholder (the code writes it). On the 74: 198 replaced (1 from `jp_coco_texts.tsv`), 99 placeholders left
  (list in `stage_gen\jp_import\report.json`, `texts_left`).
- It stops (the generated one stays): 9-slice on a texture that would not be there, plist not served, missing
  texture (unless `+absent-ok`), widget `Txt_*_Cus`, missing `need=`, layout absent in JP.
- Reversible: `stage_gen\jp_import\manifest.json` (provenance and sha1) and `orig\` (copies of our
  replaced files). Removing a line from the list = at the next build the files no longer requested are
  removed or go back to how they were (only if no generator rewrote them). Tried: import, import
  again (identical), `--none` -> tree identical to before (sha1).
- `build-resources.ps1 -NoJp`: build without originals (cleans the imported ones). `-DryRun`: all the
  generators on a copy (`tmp\stage_gen_dry`), pack and index compared with the `-Quick` reserve
  of the latest version; no login, no guest, no `resource_data`.

**Check of the widgets looked up by the client** (13-10): the widget names the client looks up in each layout were
listed (private analysis; public helpers `widget_lookup.py`, `jp_coco_widgets.py` for names of ours absent from the
original), compared with `make_layouts.py` and the original classes. The remaining names belong to other screens or
are optional (FaceBook_PhotoPanel, Count_Label, ImageButton_Buy1/LockMask, Button_Change, Button_Passive;
Txt_Countdown only in multiplayer; «Count_Rare» is part of Plate_Count_Rare, present in the original).
**JP 4.3.1 is not always WW 4.3.1**: JP `Sphere_Popup_Get_ver240` does not have Button_Ok/Txt_Ok, which the client
requires.

**Outcome** (`-DryRun`, 13-10): 74 roots replaced, 9 to be decided; 324 files (102 json, 222 BTF
textures, 219 new names); all json readable, no 9-slice on a missing texture, missing only
Camp_Balloon3 (Guilt, campaign balloon) and LB_Charge (board card), both without
9-slice. Generated pack 24.5 MB out of 32 MiB; **index beyond the `-Quick` reserve** (30,058,100
> 30,049,366 bytes, the remaining reserve was ~3.6 KB): a complete version is needed, `-Version 34`
(index 30,123,635 with the new 64 KiB reserve). Until then `-Quick` only with `-NoJp`.

Replaced (complete list in `jp_coco_layouts.txt`): Presents (scene, Base, Panel `rev=0`,
IconPanel), Medal List and sale (scenes, Check/Ok, RareCaution and Panel, Guilt, MaxEnhanced), Evolve
(scene, Evo_Medal), ReleaseWindow (WW), Sort, SlideMedalInfo, MedalOver, Cost_Over, DeckEdit
Cost_Over, Subslot (scene and 5 layouts), Moogle Shop (scene, Traits/Items rows, IconPanel, MedalSelect,
AddCheck, OverwriteCheck), Sell Materials (scene, Block, Step1/2, Medal_Step1), Avatar Boards
(list scene, card, board scene, Sphere_Incentive and _ver240, SphereCoinCheck), Profile (scene,
Oneself, User, Txt2, Comment and U13, PlayStyle, AvatarTitle_Base, TresCommu User/Other), Chirithy,
Missions (Base, Panel), Other (MenuDialog_ver300), Pet (PetInfoScene, PetSkill_Panel, Rename,
TrainingEdit, TrainingProduction, TrainingRestartPop, PetEditScene, PetEdit_Panel, PetEdit_Check2),
results (KB, LB, Skill), Continue, AP_Recovery, Ability_MAX, EV_Banner.

To be decided (the generated ones stay, reason in the list): MedalInfo_Information_R1 (crash after Evolve
without Panel_MixResult_Area/Tap_Screen_Area), PetInfo_TrainingSlotCheck_ver320 (Win_under required
by the client), Sphere_Popup_Get_ver240 (Button_Ok/Txt_Ok), Sphere_Popup_Comp_ver310
(SphereMap_Complete missing, frame different from the reference), PvP_SelectWindow (titles with
drawn Japanese), AdventureTop2_EV_Button and _Colosseum_Button (World_Ico7/8 missing),
AdventureTop2_Colosseum_Panel and _Raid_Button (names looked up by the cells; online, not testable).

<a id="wipe"></a>
## Wipes of the part changes

On the exit between parts of a quest the client shows `img/wipe/wipe_%d.png` with %d = worldId
of the `world` table whose worldName is the prefix of the room (no match -> 1). In the resources there is only
`wipe_1` (DB): without the file the client crashes.
`make_textures.py` copies `wipe_1` into `wipe_2..14`, `10000`, `10001` (safety net: the originals come later and win). The per-world originals cannot
be found online (ISSUES I-027). Then `recon/tools/originals.tsv` puts the JP 4.3.1 originals of
`wipe_2..8` (section 13) and `wipe_11..14` of Ralph's worlds (section 40: `world` rows 11-14 NL/HD/CS/SR added by
`server/make-story-oltre.js`).
I-196: `import_originals.py` took globs with `[..]` as single files (a literal file `wipe_1[1-4].png`, no wipe_11..14 -> crash
at every part change in Ralph's quests); now `*`, `?` and `[` are globs.

<a id="addnl-431"></a>
## OBB 5.0.1 versus addnl 4.3.1 (I-091)

In the merged index (`resource_merge.py`) with equal names the OBB 5.0.1 wins, since it precedes the addnl
of the IPA 4.3.1; only the generated pack (last, `--last-wins`) replaces. Of the 19805 names
of the addnl, 13148 are served by the OBB and 2376 of these have different content (mostly
`lwf/drama`; in `lwf/avatar/motion` 19 files). The visible case: `lwf/avatar/motion/wait/wait.lwf`,
which the 4.3.1 client uses for the avatar standing still in the field (walking uses walk/move/run).
The keyblade attaches to the movie with instance name `key` (path
`lwf/avatar/keyblade/keyblade_%04d_%02d` from displayId). The 5.0.1 wait is a frontal pose
(`serious_o_c`) without `key`, `shadow`, `mark`; the 4.3.1 wait has `key`, `shadow`, `mark`,
`face_normal_o_c`, as in the original videos (`reference\field_idle`). The 5.0.1 `win_levelup` also does not
have `key`/`shadow`/face. `recon/tools/prefer_addnl.py` (in `build-resources.ps1`) copies into
`stage_gen\files` the 4.3.1 versions of wait and win_levelup with their textures. The other differing
motions (bwait, btlEnd, knockback, dead1-3) have `key` and `shadow` in both versions.

<a id="suoni-jp"></a>
## Sound effects of the LWFs from JP 4.3.1 (I-152)

- **Client**: an LWF event `se_<nome>` plays a sound: id = the number in `text/audio/<nome>` (e.g.
  `ui2_se_000039` -> `509000390`), otherwise `<nome>` read as a number; then it loads `audio/%09d.akb`. Without the
  file nothing plays and there is no error. `playBGM_<nome>` resolves the same way.
  No server field involved.
- **Observed case** (17-10): the x10 draw (`raidgacha_result_display_10`, event `se_ui2_se_000039`) and the
  Nova popup (`GuiltBonus_BurstLvup`, `se_ui2_se_000074`) were silent; x1-x9 use `509000370`, served.
  The LWFs are identical to the JP ones; the AKBs 509000390 and 509000740 are missing from OBB 5.0.1 + addnl. Only
  40/90 `ui2_se` and 4/80 `ui_se` served. Investigation: `D:\Progetto_Restauro_KH_UX\tmp\sound_draw\report.md`.
- **Tool** `recon/tools/jp_sound_effects.py` (test `test_jp_sound_effects.py`), called by
  `import_jp_coco.py` after all the other choices (also with `-NoJp`), like the BGM Medals
  ([medaglie.md#bgm-medals](medaglie.md#bgm-medals)):
  - effective LWFs: the served ones of `names_v4.tsv` (read from `resource_data\7\data`), then `medal_gen`,
    `rooms_gen`, `enemy_gen`, `raisedraw_gen` (`files\`), then `stage_gen\files` and the JP LWFs that the import is
    about to write (with a repeated name the last wins, as in the merged index);
  - events from the `eventName` section (index 25 of the header: one string id per event), names
    `se_*` and `playBGM_*`; ids like the client (served text, then the generated one, then JP; if 0 `atoi`);
  - `audio/%09d.akb` already served, in a static pack or written by another generator: nothing;
    otherwise the highest JP revision (`<id>.<8 cifre>.akb`) in the generated pack. If the served
    `text/audio/<nome>` is missing that is copied too (without the text the id would be 0);
  - **order in the build**: `make_nova_logo` + `import_jp_raisedraw` (raisedraw_gen\files) now run *before*
    `import_jp_coco`, so even starting from an empty raisedraw_gen the LWFs of the x10 draw and of the
    Nova are there when the sounds are looked up (with `-Quick` same condition as before: only if
    `raisedraw_gen\files` is missing). The `files\` folders of rooms_gen and enemy_gen are written by `make_jp_rooms.py` and
    `make_jp_enemies.py`, outside the build: they are already there at the start, the build only makes the pack;
  - excluded static packs: `--no-static <nome>` (from the build with `-NoRooms`/`-NoEnemies`/`-NoRaisedraw`
    and, with `-Quick`, for those absent from `packs.txt` of the installed version): their LWFs and AKBs do not
    count;
  - **addnl**: `names_v4.tsv` is the merged index of version 7 and contains all the 19,806 names
    of the addnl: 13,148 with the offset of the OBB copy (it wins, as in the served index) and the others with
    that of the addnl copy (among these 175 LWFs). Reading names_v4 therefore gives the copy that the client
    really loads; the 654 losing addnl copies are never loaded (the two that are needed, wait and
    win_levelup, are put by `prefer_addnl.py` into stage_gen, read as generated). Without
    `resource_data\7\data` or `names_v4.tsv` a warning: only the sounds of the generated LWFs are looked up;
  - deterministic (sorted names), manifest and cleanup of `import_jp_coco.py`; with `--check` no
    `sound_effects.json` and cache only read; report
    `stage_gen\jp_import\sound_effects.json` (ids, bytes, LWFs citing them, missing, unresolved); cache
    of the events of the served ones in `served_lwf_sounds.json` (fingerprint of index and data; first run ~45 s,
    then ~5 s). On its own (`python -I recon/tools/jp_sound_effects.py`) it is a report that writes nothing.
- **Dry run** (17-10, copy of `stage_gen` in `tmp\se_dry_r1`, resources 41; repeated after the review with the same outcome): 1,395 LWFs with sounds, 627 names;
  **216 new AKBs, 4,327,702 bytes**: 509000390/740 (x10, Nova), 509000700 (`BurstGauge_Recovery`),
  509100190/220 (avatar motions `dash`, `excavate`), 509100250 (`Sburst`), 509100310/320
  (`card_evolution_result_*`, Evolve animation), 508000020-080 (eff_se of the
  enemies), 198 ids 504xxxxxx (ene_se of the JP enemies of `enemy_gen` and `hit_effect_fla` effects), 503005003,
  505001110, 506002010/020 (bosses 7002-7005 and 1023); plus 4 `text/audio` texts (ene_se_153401-403, npc_se_000503); no AKB missing also
  in JP. Unresolved (no text nor id, silent also in the served original): `bgm_boss0112`,
  `kh2_Laughter` (drama), `ene_se_165101` (enemy 8021), `player_se_000101` (dutch_roll). Generated
  pack 108,128,458 bytes out of 134,217,728 of reserve (80.6%); index: it fits in the installed size
  of 41 (~57.6 KB of reserve remain): a `-Quick` is enough.
- The sounds are original: no line in the Notices.

<a id="icone-numerate"></a>
## Images with numbered names (check of 18-10, I-158/I-159)

The client composes many `img/...` paths with `sprintf` from a master id or from a number; if the file is missing
the client keeps the previous texture (wrong icon, no crash: case
`Skill_Icon3`, I-158). **Offline** check: 119 `img/` and `cocostudio/publish/...%d` formats from the strings of the
4.3.1 library, values from the served master
(`server/master_data`), served files = `names_v4.tsv` + `medal_gen`/`rooms_gen`/`enemy_gen`/`raisedraw_gen`/`stage_gen`
`files\` (a file only in `cocostudio/publish/` does not count for `img/`). Work and scripts in
`D:\Progetto_Restauro_KH_UX\tmp\icons\` (`check.py`, `fmt_other.py`, `seq.py`).

| Format | Number from | Values used | Missing | Source / outcome |
|---|---|---|---|---|
| `img/skill/Skill_Icon%d` | `skill.thumbId` | 5 | 0 (3 from 2016, I-158) | - |
| `img/medal/Medal_S_%d` / `Medal_L_%d` | `medal.thumbId` (reward type 3) / `medal.imageId` | 2090 | 0 | - |
| `img/Cutin/Cutin_%d` | `medal.cutinId` (carousel of the special attacks) | 2088 | 173 | none (I-159) |
| `img/art/Art_%d` | `medal.artId` (scene `MedalArtAnim`) | 2088 | 2088 | none; JP 55 ids Japanese only (I-159) |
| `img/material/material_%d` | `material.materialId` (reward type 5) | 53 | 54 | 2016 |
| `img/avatarParts/ai%d` / `ai%03d` | part id (reward 0x12-0x14/0x17) | 2824 | 103 (partsType 7) | not requested: sub-parts of `setCloth`, never a reward |
| `img/petParts/pi%d` | `petParts.petPartsId` (reward 0x21, missions type 33) | 668 | 0 | - |
| `img/sphere_incentive/%d`, `sphere_board/Board_%04d`, `sphere_kind/Kind_%04d` | `sphere.sphereBoardId` / `boardId` / `kindId` | 118 / 1 / 2 | 0 | - |
| `img/keyBlade/KeyBlade_%06d` | `keyblade.displayId` (reward type 13) | 64 | 0 | `make_keyblade_images.py` |
| `img/carouselDeck/*%03d`, `img/ui/Subslot_MedalSlot%03d` | `keyblade.displayId / 100` | 16 | 0 | `make_keyblade_decks.py` |
| `img/kakusei/Kakusei_Icon%04d` | `shuffleskill.category`  | 11 | 0 | - |
| `img/userTitle/title_%04d` | `title.label` | 102 | 0 | - |
| `img/Theater/World_Icon_%d`, `img/wipe/wipe_%d`, `stage_select_ico_%d_%d` | `theater.worldId`, `world.worldId`, `stage.worldId`+`thumbId` | 14 / 10 / 99 | 0 | - |
| `img/light/{BG,NPC,NARRATION}/%d` | command 4002 of the 40 served SEQs `img/light/SEQ/*.l` (slot 5003 BG, 5004 narration, 5008-5012 NPC) | all cited ids | 4 | 39994/39996/39997 from 2016; 30019 none (I-159) |
| `img/incentive/IncentiveIcon_NN` | constants per reward type: used 7, 8, 9, 26, 40, 41 (reward, mission) | 27 names | 24 | 06-29 from 2016 (not 10/12: drawn Japanese), 30-41 JP (highest rev.), 42 = `cocostudio/publish/IncentiveIcon_42` |
| `img/incentive/Star7_Ticket_%02d`, `draw_Ticket_%02d` | reward type 37-42 | 6 | 0 | served with «仮» (WW placeholder, Star7 39 in `make_shop_art.py`) |
| `img/prizes/Prize_Treasure%02d` | a reward field | 1-4 | 02-04 | 2016 |
| `img/ui/AvtInfo_CrownIcon%d`, `AvtInfo_trophyIcon%d` | Profile: `(mvpCount-1)/50+1`, `(pvpMvpCount-1)/50+1` unsigned, max 4; with our 0: Crown1 and trophy4 | 1-4 | all | 1-3/1-2 JP, Crown4 and trophy3/4 from `cocostudio/publish/` (WW) |
| `img/ui/Topinfo_BarBut%d_Off/_On` | tab index + 1 (`Button_%d`, Missions window) | 1-7 | 1, 3-7 | 2016 (byte-for-byte equal to `publish/Topinfo_BarBut*_Off`) |
| `img/ui/Deck_Arrow_U%d` / `R%d` | attribute 1-3 (deck) | 1-3 | all | 2016 |
| `img/tutorial/tutorial_%d` | constant ids 1-65 (12/41 -> 40, 44 -> 6; 100-120 elsewhere) | 34 from the constants | 25 | 19 from 2016 (English, 2016 graphics: the served 5 is different); 49-55, 57-59, 61, 65 only Japanese JP (I-159) |
| `img/damage/dmgGuardBreak_num%d`, `dmgReflection_num%d` (+ `_comma`) | damage type 5 and 6 | 0-9 | all | JP |
| `img/download_background/image_%02d` | constant 9 | 9 | 09 | none (I-159) |
| `img/ui/guilt/*%d*`, `Deck_Medal%d`, `Deck_Slot_Num_%d`, `Av_Box_Num%d`, `damage/dmg*_num%d`, `LoginTime_Icon%02d`, `KeyBlade_type_%02d` | levels, slots, hours | - | 0 | - |
| `talkstamp_%d`, `Emblem_%d`, `gesture/m_act%d`, `Shop_BuyItem_%02d`, `Rank_Title_%d`, `Comeback_Tutorial_%d`, `raid_boss_%d`, `xtres/*`, `union/*`, `colosseum/*`, `result/Result_PvPRank*`, `dark_*` | empty tables or online / Dark Road features | - | - | not checked further (JP has talkstamp, Emblem, m_act0-13, raid_boss) |

- The icons of `IncentiveIcon_40/41` in JP have several revisions (seasonal tickets; the extractor swaps
  some of them): the highest is taken (40 = platinum ticket, 41 = light blue ticket), as in `import_jp_coco.py`.
- `tutorial_%d` with id >= 53: `popupFlag` is 2^53 - 1 when the tutorial is finished (`server.js`), so the windows
  beyond bit 52, if the bit is the id, would still open; to be seen on the bench whether they appear (all without an English source).
- No line in the Notices: they are original graphics (2016, JP or WW under another path).
