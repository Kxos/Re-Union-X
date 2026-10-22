# Medals: Medal List, detail, sale, Level Up, Evolve, graphics

History: [../journal/fino-al-2026-10-11.md](../journal/fino-al-2026-10-11.md) (sections of 9-10
October). Taps in [banco.md](banco.md#tocchi).

<a id="dati"></a>
## Medal data

- Id: first digit the rank (1 bronze, 3 silver, 9 special), second the attribute (1 Power, 2
  Speed, 3 Magic). Starting deck: 13021 Donald A, 11021 Goofy A, 13031 Yuna; 90041 Dewey.
- `medal` (63 fields): from thethiny's binary rows (522 real medals, `raw_master_old.py`) +
  Roboloid (`external\roboloid\medal_db.json`, 2,100 medals with evolutions) with
  `KHUX_MEDALS_ALL=1` (medalId 300000 + Roboloid id). `imageId` = medalId (the client composes
  `img/medal/Medal_L_%d.png`).
- Missing medal -> fallback to **medal 1**: `make-game-tables.js`
  adds row 1 (master 1 = blue Donald without cost).
- Stacked support medals: `validPack` (thethiny `unk_1116`), red badge.
- <a id="tier"></a>**Tier** (SP Attack Bonus, «SAB Tier» of the khuxwiki, 1-10) = `guiltValue`
  of the medal row. The detail loads `img/ui/guilt/MedalInfo_Guilt<guiltValue>.png` (0 = icon hidden;
  if 0 and `validEvolve` it follows `evolveId`); a missing file leaves
  the layout's texture, that is **1** (this is why all tier 9-10 looked like tier 1). Source:
  Roboloid's `Guilt` field, identical to the khuxwiki (checked SN++ - MoM Kairi 10, Illustrated
  Leon 6★ 5, KH CoM Naminé 6★ 3). thethiny's rows had 0: now taken from Roboloid via
  `medal_map.json` (480 medals changed, rev. 82). Distribution: 0 (support) 186, 1:146,
  2:274, 3:461, 4:127, 5:163, 6:58, 7:131, 8:241, 9:125, 10:182. The bonus per tier (khuxwiki):
  1 +25%, 2 +50%, 3 +100%, 4 +130%, 5 +150%, 6 +180%, 7 +200%, 8 +230%, 9 +280%, 10 +320% (the
  user's guide stops at 8, written before tiers 9-10). The multiplier of the
  subslots depends on the tier (computed by the client; subslots not yet served: `subslotMaxNum` 0).
  `userMedal.guiltFactor` (unlocked bonus of the copy, hundredths of %) from the Level Up; `guiltProb`
  = khuxwiki ranges per tier ([guilt.md](guilt.md), 12-10, to be verified on the bench).
  Icons (`reference\medal_tier\NOTE.md`): detail and filter = original `MedalInfo_Guilt1-8`
  (blue circle with the digit, not placeholders) + 9-10 generated; the square icons of the user's
  guide are the `Guilt<n>_On` of the keyblade screens (which also loads
  `_Off`, `_Err`, `_num`, `MD_Guilt<n>_*`): in the resources only `Guilt4_On`, `Guilt5_On` and
  `Guilt1-8_Err`; `make_textures.py` generates the others (On/Off from the khuxwiki; `_num` and `MD_*` copies).
- Shuffleskill/trait: `shuffleskillSlot` and `spShuffleskillSlot` do not exist in the
  old format. `make-game-tables.js` (`traitSlots`, khuxwiki «Trait Slots»): tier 1-3 -> 1,
  4-5 -> 2, 6-10 -> 3, SN/Supernova and Prime 7★ -> 5, Prime 6★ -> 3, support 0; 1 special slot for
  all attack medals. Wiki exceptions (some 6★) not applied. Roboloid's «7★»
  without prefix (561, e.g. Wakka) have a suspicious rarity: not used for the slots.
- `userMedal` element: `userMedalId` uint64, `medalId`, `number`, `level`, `exp`,
  `attack/defense/burstUpperNumber`, `lock`, `upperCost`, `guiltFactor`, `userSkills` <= 2,
  `userShuffleSkills`, `getDatetime`.
- <a id="boosted"></a>**Boosted** (sub-project 2b, Task 3, 17-10): a separate row of the `medal` master
  (`server/medal-boost.js`, `server/make-boosted-medals.js`, at the end of `make-game-tables.js`), not a field of
  `userMedal`. medalId = variant x 1,000,000 + normal (1 = +1000 STR, 2 = +1000 STR/DEF, 3 = +2000 STR/DEF);
  `displayId` = normal + 1 if the normal one is in {0, 100, 200, 300, 1100, 1200, 1300}, otherwise 1; `groupId` =
  normal (the normal one stays 0); base and maximum STR/DEF + str/def; `cost`/`minCost` - 10 (minimum 0; video LFJ5:
  SN++ - Master Eraqus 46 -> 36; `minCost` proposed); `validPack` 0; everything else (images, name, `sortId`,
  burst, `guiltValue`, `addMaxAttack/Defense`, Evolve) the same. Rows from the `enhance.boosted` entries of the catalog:
  **1125** (1000/1000: 1023, 1000/0: 95, 2000/2000: 7; by name 442 pairs, by Tier 1003, by slot 140, already
  covered by the other two); `medal.json` from 2108 to 3233 rows (2,435,784 -> 3,770,561 bytes). Catalog names
  without a row: «launchpad mcquakc», «webby vanderquakc», «axel [ex]», «kairi [ex+]», «sn++ - master eraqus
  supernova+ - ava» (typos/phrases of the catalog, no row). `make_banner_catalog.py` ignores the boosted ones:
  regenerated after the patch, identical catalog (sha1 47861a1a).
  **Check of the client (U5/U6, WW 4.3.1)**: the client uses `displayId` of the medal row only to classify the
  medal: boosted if 1/101/201/301/1101/1201/1301; badge when `displayId - 100/200/300/1100/1200/1300 < 2` (n and n+1
  equal); SN/SN+/SN++ with the same scheme `- n < 2`. None uses `displayId` as an image or table index; 1 falls in no
  badge interval (like 0). `medalId` is read as a 32-bit integer: the ids up to 3,301,993 are well below 2^31.
  Outcome: no blocker.
  Other lookups by name that would see the boosted ones (to be filtered with `isBoosted` in the tasks that touch them):
  `make-limited-missions.js` (name -> row map at maximum rarity: the boosted one, at equal rarity and later, does not
  replace the normal one), `grant-all-medals.js` (would also give the boosted ones), album/Medal List in `server.js`.
  `supernova.js` and `blue-fairy.js` look up by id and run before the patch: no filter.
  **Regeneration**: the boosted ones copy the normal one at the end of `make-game-tables.js`; running on their own
  `supernova.js`, `blue-fairy.js` or `make-pet-tables.js` leaves the boosted copies with the old values until
  `make-game-tables.js` runs again (with `KHUX_MEDALS_ALL=1`: without it, the master drops to 522 medals).
  **On the bench (Task 10, 17-10, resources 41, rev 121)**: BOOSTED band in the result, detail with yellow STR/DEF/Cost,
  Cost 36 (46 - 10) and the No. of the normal one, red LV plate in Medal List and Level Up; Level Up normal ->
  boosted with the dot (U2), Cid on the boosted one (U1), Medal List/detail/Evolve without crash (U6); outcomes in
  [shop.md#sp2b](shop.md#sp2b).

<a id="burst"></a>
## Special attacks (`burst`)

The real table has 11 rows (`master_data/burst_base.json`). `make-game-tables.js` generates the
others: clone of the family (burstId/10) with «+k» and +300 power per level, or a template per
attribute with name, gauge, target, description and multiplier from the khuxwiki (85 families out of
109). 63 rows stay «Special Attack»; animations and effects are those of the template (Thunder
Raid, Thundaga, Heaven's Sword) (ISSUES I-033).

<a id="grafica"></a>
## Graphics

- `recon/tools/fetch_medal_images.py` (`--all`): images from Roboloid/khux (original game files)
  matched by name and stars -> Medal_L/Medal_S/Cutin in `D:\Progetto_Restauro_KH_UX\medal_gen\files`
  (2,130 medals from 18-10, including the 13 6★ [+] 301446...301782 obtained from the regenerated master, same Roboloid
  row by name+stars: the boosted copies 2301xxx reuse the base's imageId; names with `%23` decoded).
  Second-to-last pack of the complete versions: `-Quick` does NOT rebuild it, for new images `-Version N+1` is needed
  (offline, does not touch the guest; then `update-resources.ps1`).
- Agent's check (`stage_gen\medal_check\REPORT.md`): the 21 Medal_L and 5 Cutin that existed
  are identical to the originals; limits of the source: 185 Cutin missing (41 in the master), 419 added
  medals share the Medal_L, 590 Cutin without the white glow, Medal_S slightly softer
  (ISSUES I-039).

<a id="medal-list"></a>
## Medal List and detail

- Scene `MedalListScene_ver130`; `LeftUI` = `MedalSell_Back.json` (original). Widgets the client looks
  up: `Win_Bottom` (`Txt`, `Txt_Button`), `Medal_Sell_Panel` (only the top
  bar), `Scroll_Area`, `Button_Back`, `Button_Sort`, `Button_Sell1`/`Txt_Sell1`; counter
  `Txt_MedalGet` («Slots», 101200050), `Txt_MedalGet_Num_Label` / `Txt_MedalGet_All_Label`;
  generic sort bar (`Txt_Sort`, `Txt_Sort_Label`,
  `Txt_Filter_On`).
- Grid: scene scaled 1.6875 and centered (x_screen = 960 + (x - 480)·1.6875), cells 120x164;
  7 whole columns: `MedalList_Gen` `Scroll_Area` 954 px from x=3, sale 942 px from
  x=9 (stride 126, first at 33 from the edge). Buttons scaled 0.765, first row below the bar.
- Detail: `SlideMedalInfoScene_ver341` over `MedalInfoScene_ver320`; the first child of `LeftUI`/`RightUI`
  becomes a button (scrolling like the swipe).
  `Panel_Left`/`Panel_Right` with origin at the center of the arrow (30,320 and 930,320; 120x220).
- Grid cursor: armature `Cursor_Anim_MedalSell` (movement `Animation1`) =
  copy of the fusion cursor `Cursor_Anim_MdalMix_ver103` (glow `Medal_Syn_Select_Eff02`,
  144x172). Selection: `MedalSelectAnimation` (`Medal_Select01`).
- Plate under the medal: follows the sorting; on the support medals it alternates the price with
  the texts 101210001-003, which in the English resources are a space (original «FOR SYNTHESIS»)
  (ISSUES I-022).
- Plate animation (ISSUES I-047): no STR -> DEF -> cost cycle, neither in the original
  nor in the client. A single value per sort mode; medals with a state alternate value and label:
  the value 2 s, 1 s fade, 2 s the label, 1 s fade (period 6 s). Label: medal in a
  deck of `userDecks` -> «Equipped» (101210004); Spirit 106110305; Subslot
  101210010. Original video (2019): same timings measured to a tenth of a second
  (`reference\medal_list_plate\`). On the bench the deck is [1, 0, 3] (starting medals, at the bottom
  of the list by Strength): the medals in view are not equipped and stay still, as
  in the original.

<a id="sort"></a>
## Sort/Filter popup

The client loads `PopupNormal_SortButton_ver350` (generated from ver320) and looks for `Dummy_Sb` with
~30 `Filter_Sb*`, `Txt_TitleSb`, `Txt_SubTitleSb01/02`, `Filter_Subslot`, `Filter_Trait`,
`Filter_Evo_Set`, `Filter_Ability_*`: hidden clones of a CheckBox (`Filter_Sb` inside `Dummy_Sb`).
Textures rebuilt in `make_textures.py` (references
`reference\medal_list\sort_filter\`). To be compared with the original: «Favorite», «SP Attack Bonus /
No Bonus» gray, «Imitation», «Special Traits» with 11 icons and «None» twice (ISSUES I-023).

«SP Attack Bonus» row (tier): the original ver320 layout has `Filter_Guilt1..9` (8 at the top, 9
below on the left) with `Logo_01` = `MedalInfo_Guilt<n>.png`; the client looks for
`Filter_Guilt%d` from 1 as long as it finds them, and ver350 wants 10 of them (clone of `make_layouts.py`). Before,
10 was hidden under 9 and `MedalInfo_Guilt9` was a copy of 8; now 9 and 10 are drawn
(`make_textures.py`, style of the original 1-8) and 10 sits next to 9 (x 185). Tiers 9-10
exist (khuxwiki: 307 medals): the row does not stop at the guide's 8. Icons and comparisons:
`D:\Progetto_Restauro_KH_UX\reference\medal_tier\NOTE.md` ([tier](#tier)).

<a id="filtri"></a>
**Supernova** section (visible since the medals have `validSuperBurst`, master 108). Texts
106240205-227 missing everywhere (IPA 4.4.0 and JP 4.3.1: placeholder «[id]»): ours, in
`make_layouts.py` (TEXTS). The filters combine in AND (15 checks); «SN» row = `burst` of `superBurstId`
(no limit on the ids 4000000+).

| Button | Text | Condition |
|---|---|---|
| Filter_Sb / SbPlus / SbPlusPlus | SB icons | medal `displayId` 100/200/300 (+1, +1000, +1001), `validSuperBurst` 1 |
| Filter_Sb_NotSet | None | none of the three |
| Filter_Sb_Single/All/Random | Single/All/Random | SN row `target` 1/2/3 (in OR) |
| Filter_Sb01-08, 09, 12 | icons (under «Types», 106240205) | buffs/debuffs of the SN row (`bufAttack*`, `debufDefense*`, ...) |
| Filter_Sb_Guard / BaseAttack / BaseDefence | Pierce DEF / Base STR / Base DEF | `penetrate` > 0 / `addBaseAtk*` / `addBaseDef*` != 0: `penetrate` always 0; `addBase*` from the descriptions since 18-10 ([battaglia](battaglia.md#basebuff), I-155) |
| Filter_Sb_Recovery | Heal | `heal`, `cure*`, `recovery` |
| Filter_Sb_Special | Special | buff copy/reset, counter, reflect |
| Filter_Sb_Recovery2 | SN Renew | `recurringAttribute` > 0 |
| Filter_Sb_AttackOnly | Attack Only | `specialPowerType` 1 and no effect |
| Filter_Sb_Timing1-7 | 1-7 under «PvP Timing» (106240220) | `superburstTiming` == n |

106240206-208 = Pierce DEF / Base STR / Base DEF of the Special Attacks section (`burstId` row).
Only 106240201-204 (Hits/Gauges) stay at `%d`/`%d+`. Bench 14-10 (one filter at a time): SN+,
None, Single, SN Renew (the 16 SN++ «R», green icon) correct. Warning: a swipe that starts on a
button activates it (Hits/Gauges out of view gave empty lists or only Moogle): scroll on the right
edge (x 1722) and check that Undo is gray. To do: `target` 3 for the random Supernovas
(Roboloid has only Single/All) and `penetrate` (no source with the original values; `addBase*` rebuilt from the descriptions, [battaglia](battaglia.md#basebuff)).

<a id="vendita"></a>
## Sale (Sell Medals) and lock

- `MedalSellScene_ver350`: CenterUI `MedalSell_Gen.json`, LeftUI `MedalSell_Back.json`, RightUI empty
  panel (the client uses the first child of the three). Widgets:
  `Txt_Money`/`Txt_Money_Label`, `Txt_Money_Total`/`Txt_Money_Total_Lavel` (sic),
  `Txt_A_Coin(_Label)`, `Plate_A_Jewel`/`Plate_A_Ticket`, `BoxNow`, `BoxMaxLabel`, `DeckBase2`.
- Confirmation `PopupNormal_MedalSell_Check_ver350`, outcome
  `PopupNormal_MedalSell_Ok_ver350`: copies of `PopupNormal_Text_34_4Line_OkCancel/
  Ok`; rewards `Panel_1..4` with `Obtain_Plate_a..d` (`Txt`, `Txt_Label`, `Icon`);
  rare medals: `Alert_Area` <- `PopupNormal_MedalMix_RareCaution_Panel.json` (generated).
- `POST /user/medal/sell` (51) `{"userMedalIds":[..],"numbers":[..]}` -> `userData.userPoint`,
  `userSkills`, `userMedals`, `sellUserMedalIds`.
- Quantity popup `EquipSell_Medal_Step1_ver131`: «1/N» = `Txt_MaterialStock_Fix_2`,
  `Txt_data3` «/», `_Fix_3` maximum; red band «Includes ★★★ Medals or higher.» (Panel
  233,18,38, borders 255,2,0, `rare_star.png`) if the stack has more than 2 stars.
- Lock: `POST /user/medal/lock` (46) `{"userMedalIds":[..],"isLocks":[..]}`, sent **only
  when leaving Medal List**; response `userMedals`, `deleteUserMedalIds`,
  `isSubslotUpdate`. Saved in `player.medalLocks`.

<a id="level-evolve"></a>
## Level Up, Evolve, Unequip

- Level Up: `POST /user/medal/enhance`, client EXP curve, rare materials popup. Special medals
  and copies (`server/medal-guilt.js`, 12-10, verified on the bench 12-10 and 19-10: I-079, I-080, I-083): special attack dots
  (`burstUpperNumber`, up to `burst.maxEnhanceCount`: 6★/7★ 5), guilt unlock/reroll
  (`guiltFactor`, with `isGuilt` = Quest 34), Magic Mirror +1%, Chip/Dale STR/DEF (up to
  `addMaxAttack/addMaxDefense`), Cid cost (up to `cost - minCost`, 6★/7★ 20), Fantasia Mickey B
  (300913, type 8) +1 dot; Magic Broom (300948) and Fantasia Mickey A -> B with 5 Brooms. Saved
  in `medalState`, served in `userMedal`. Details and tests: [guilt.md](guilt.md#stato).
- Guilt reroll confirmation: `PopupNormal_Guilt_ver130` was missing (crash on
  tapping Level Up with a copy on a medal with guilt), generated from `PopupNormal_Text_34_4Line_
  OkCancel`: `Win` > `Txt_Wording1` (101300035), `Txt_Wording2` (101300036, equal ranges) or
  `Dummy` > `Txt_Wording4` «Bonus range:», `Txt_Wording5` -> `Syn_Arrow02` -> `Txt_Wording6`
  (101300055: old range -> new range) with `Dummy_Announce` > `Txt_Announce` (101300056,
  blinks), `Txt_Wording3` (101300037). Texts all already served. No original screenshot.
- Rare materials warning: the `_Panel`s are in `Alert_Area` with x = 0, so
  `Alert_Area` is 600 wide and centered; case 1 = rarity > 2, «Includes ★★★
  Medals or higher.» with the stars as children of `Star1`.
- Evolve (action 56): the medal becomes `evolveId` at level 1, materials consumed (also from the
  stacks), cost `evolveMoney`; response `before/afterEvolveUserMedal`, `pet`, `attachmentMedalIds`.
  Scene `MedalEvoScene_ver320` generated (style `reference\medal_evolve\`); `MedalInfo_Information_R1`
  with `Panel_MixResult_Area`/`Tap_Screen_Area` of R3. The LWFs
  `lwf/medal/compose/evolution/card_evolution_result_01..05` are missing: copies of the Level Up (ISSUES
  I-024). Tried on the bench: Donald 1★ LV20 + Cheshire Cat -> Donald 2★.
- Evolve with required medals (client 4.3.1, 14-10; Supernova: 5 Dual Meow Wow [SAB LV 7/8/9]
  of the same type, khuxwiki): medal row fields `validEvolve`, `evolveId`, `evolveMoney`, `validEvolveNeed`
  = **number** of required medals (up to 5), `evolveNeedId[5]` = required medalId for every place (5
  identical Dual Meow Wow = `[X,X,X,X,X]`). The client groups the equal consecutive ids and counts the
  owned copies. `validEvolve` is not only 0/1 (3 = different branch, 1 = sounds/tutorial), to be verified.
  The request (action 56) has only `baseUserMedalId` and `attachmentMedalIds`: the required medals arrive in
  `attachmentMedalIds` together with the materials (to be confirmed on the bench, also for the `validPack` stacks:
  same userMedalId repeated?). The server must consume them and reply as for the normal Evolve.
<a id="blue-fairy"></a>
- **Evolve 6★ -> 7★ with the Blue Fairies** (15-10, user's source and khuxwiki «Blue_Fairy»): 5 Blue Fairy [SA Bonus LV n]
  of the same tier as the medal (`guiltValue`), Set 26 EN (May 2018), from the PvP ticket draws. `server/blue-fairy.js`:
  8 rows (Roboloid 1495-1502 -> medalId 301495-301502, album 1447-1454, copied from Magic Broom; graphics already in
  medal_gen) and `validEvolveNeed` 5 / `evolveNeedId` [fairy of the tier x5] on the 397 6★ rows evolvable into 7★ that
  had no required medals (`evolveMoney` 99999 unchanged). Master revision 109.
  The client enables Evolve only with: maximum level, all the required medals, munny >= `evolveMoney` and, if
  the 7★ has a higher tier, guilt of the user medal at the **maximum** of the tier range: the «Max Guilted» of
  the source is enforced by the client.
  Bench 15-10: Lexaeus A 6★ LV100, 5 dots, guilt 10000 (max tier 3) + 5 Blue Fairy [3] -> Lexaeus A 7★ (No. 1111),
  request `{baseUserMedalId:723, attachmentMedalIds:[2313 x5]}` (the stack repeats the first id), the server consumes
  2313-2317 and 99999 munny. How to get them without PvP: I-126 (decision postponed).
<a id="bgm-medals"></a>
- **BGM Medals** (15-10, `reference\bgm_medals\`, khuxwiki «Category:BGM_Medals»): 37 medals with a track that
  plays in the medal detail and in the home when it is shared (Share). Client: `medal.bgm` int = sound id,
  played with a 500 ms fade by loading `audio/%09d.akb` (SQEX AKB v2 bank with Ogg Vorbis; without the file
  nothing plays, but the ♪ icon `Support_Bgm` appears anyway). `text/audio/<nome>` is only text (name -> id).
  Server: `server/medal_bgm.json` (name -> id, uncertain matches in `_incerti`) applied by `make-game-tables.js`
  (71 rows, master revision 110); the 20 AKBs not served taken from JP 4.3.1 (`import_jp_coco.py`, `audio/` outside
  cocostudio/publish), reserve of the complete versions raised to 128 MiB (resources 37). Share = `POST
  /user/support/update` {supportMedalId} (action 47, same response as 19): `player.supportUserMedalId`,
  served by `GET /user/support`. Bench 15-10: HD Roxas -> Another Side in the detail and, shared, in the home;
  Sephiroth [EX] -> One-Winged Angel (heard by the user). Without the file: HD King Mickey [EX] (Vim and Vigor).
  Intermittent crash of the home after the -Quick (pet `wait.lwf` not loaded): not reproduced
  with the same resources after a restart, to keep an eye on.
  16-10 (master 113): the Supernovas (SN/SN+/SN++ - X) take the track of the base medal X (user's
  decision; in the original only Supernova - Sephiroth is documented): +7 rows (SN++ - Final Boss Xion, SN++ - HD
  Roxas, SN++ - Illustrated Xion, SN/SN+ - Casual Roxas, SN/SN+ - HD Xion [EX]), 78 in all. Targeted test:
  `D:\Progetto_Restauro_KH_UX\tmp\bgm_save.js` (with the server stopped) leaves in the save only the 78 medals with
  music; real save in `tmp\player_before_bgmtest.json`, to be put back after the test.
  **Bench 16-10: all 78 play** (heard by the user), also Dearly Beloved (501006001) and HD Ventus [EX]
  (501006019): their AKBs are already in the served OBBs. Only HD King Mickey [EX] stays without a track (Vim and Vigor, bgm 0).
- Unequip: `POST /user/medal/remove` (237); first the client requests `GET /user/medal/preremove`, to which
  the server gives a generic response (ISSUES I-038).

<a id="materiali"></a>
## Sell Materials

`EquipSellScene`: `Panel_1` > `EquipSell_Scroll_Area`, row `Panel_On`, popup
`EquipSell_Dialog_Step1` (`Txt_data4`), confirmation `EquipSell_Dialog_Step2` (needs
lowercase `Txt_cancel`). `POST /user/material/sell` {userMaterialId, number} (50) ->
`userData.userPoint` + `userMaterial`. khuxwiki prices: Mythril Stone 50, Gem 100, Crystal 150, others
10; Mythril Shard and Orichalcum not sellable. Material icons: `fetch_material_icons.py` (44 of 45,
Remembrance Gem missing).

<a id="trait-medal"></a>
## Trait Medal (I-084)

Sources in `reference\trait_medals\NOTE.md` (Square Enix notices 38128, 46740, 54963; user's guide
p. 21-23; khuxwiki). «Dedicated Awakening Medal»: each one is tied to a medal (e.g. Trait Medal #1
-> Illustrated KH Riku [EX]), 6★ in black and white with the same image, same Album entry;
STR/DEF 1, cost 999, 15 Pet Points, «Lesser Attack» x1.00 at 1 gauge. About 313 (khuxwiki: 189).
- Fused onto its medal: +1 random trait and +1 dot; with the dots full it unlocks or rerolls
  the guilt (like an identical copy or Mickey & Brooms; the +1% is the Magic Mirror). On other
  medals only EXP. Trait slots full: the player chooses which one to replace or discards the new one.
- From 3.3.0 they stack up to 99, no spirit slot nor sharing. Obtained from dedicated
  deals, events, Moogle Shop («Trait Medal #N x10», 1,000 jewels).
- Client 4.3.1: Medal List filter with types 1, 2, 4/8, 5, 6, 3, 9, 10 =
  Attack, EXP, Boost, Cost, Evolve, Sell, Trait, Subslot (Trait = type 9, to be confirmed);
  9 and 10 are excluded from the Special Traits. «Dot» material:
  same groupId, groupId in `burstEnhanceCategory` of the base, or type 8: the Trait Medal must be
  linked this way. The trait is decided by the server: `afterEnhanceUserMedal.userShuffleSkills`,
  `overwriteSkills`, `successOverwrite`, `medalResumption {userShuffleSkills, resumptionStatus}`;
  slots full -> `POST /user/medal/shuffleskill` (action 57) `{userMedalId, userShuffleSkillId,
  enableUserShuffleSkillId}` (texts «Choose a trait to replace.», «There are traits that have not
  been set.»).
- Status: no row in the local master; `shuffleskill.json` has `rate` 0 (weights unknown). The server
  gives no traits from fusion (nor from identical copies) and `medalResumption` is always empty.

- **Part A, step 1 (19-10, revision 142)**: `server/make-trait-groups.js` (at the end of make-game-tables.js,
  idempotent) sets `shuffleSkillGroupId` = lowest medalId with the same name (1,114 groups) and brings the wheel
  to the 11 original traits (new rows 14-17: Max HP +800, Poison/Sleep/Paralysis Resist 20%, copied from the Special
  Traits 1024/1029/1032/1035; rate 100 only on the 11, 0 on Max HP +300 and on the 5 of 4.1.0). make-pet-tables.js
  no longer puts rate 100 back on the shop-only traits. Test: `node server/test-trait-groups.js`. After a regeneration
  of the banners: `make-boosted-medals.js`, `make-nova-rows.js`, `make-trait-groups.js` (the new boosted ones take the group).
- **Steps 2-4 (19-10)**: `server/medal-trait.js` (pure rules), fusion (`respondMedalEnhance`: one trait per fusion with
  a copy of the same group, slots full -> `player.traitPending`), action 57 `POST /user/medal/shuffleskill`
  (`respondMedalShuffleSkill`: Replace/Skip), `userData.medalResumption` at login, pet training that does not reset the
  queue. Tests: test-medal-trait.js, test-medal-enhance.js (section 11), test-trait-choice.js.
- **Step 5 (19-10, resources 44 with -Quick)**: from the JP data the original LWFs `lwf/medal/Kakusei/Kakusei_Get1`, `Kakusei_Get2`
  and the 11 `Kakusei_Icon0010-0100` (in place of ours from make_pet_training_fx.py, now a fallback) and the layout
  `MedalInfo_SkillChangeWindow.json` («Choose a trait to replace» window, with Kakusei_New/Kakusei_Get_Eff).
  Shared textures: those of Get1 are in Kakusei_Get2, icon 0090 in its folder without the png_ prefix
  (`import_jp_coco.py`, LWF_FILL and fill_idx).

<a id="trait-medal-b"></a>
- **Part B (19-10, rev 150, resources 45)**, plan `docs/superpowers/plans/2026-10-19-trait-medal-B.md`:
  - **Same medal = Album line** (`make-trait-groups.js`): group = connected components with the same name and the same
    sortId > 0 (949 groups). Evidence: the deal «SN+ - KH III Xemnas Trait Medal Deal» (notice 2019-08-05) sells Trait
    Medal #130, which the khuxwiki ties to «SN - KH III Xemnas»; the 138 multi-name lines of the master are all
    Evolve chains. It also applies to part A (SN fused onto SN+ gives a trait).
  - **List** `server/trait_medals.json` (313 entries) from `make-trait-medal-list.js`: #1-#188 and #274 from the khuxwiki
    table (first column = EN Album number = sortId); #189-#313 from the khuxwiki «Trait Medal N» pages, which
    point to the medal (the wiki says Trait Medal #190 adds or re-rolls a trait of SN++ - KH III Roxas;
    `reference\trait_medals\khuxwiki_trait_medal_189_313.json` and `_RESULT.md`). The notices of the SN++ deals do not print the
    number; the 46 numbers that appear in other notices (VIP, events, Moogle Shop) do not contradict the wiki.
  - **Rows** (`make-trait-medals.js`, after make-trait-groups): medalId 9,000,000+N, type 9, 6★, STR/DEF 1, cost 999,
    15 Pet Points, sortId of the medal, stackable, without trait slots, `shuffleSkillGroupId` of the line; burst
    9,000,000 «Lesser Attack» (1 enemy, 1 gauge, x1.00, 5 dots); EXP, sale and guilt tier from the medal
    (rebuilt). Dot: `burstEnhanceCategory[0]` of all the rows of the line = medalId of the Trait Medal.
    Album: type 9 is not an entry. The fusion has no new code (test-medal-enhance.js sect. 12).
  - **Images** (`recon/tools/make_trait_medal_images.py`, in build-resources on stage_gen): luminance of the medal
    (Medal_L/S and Cutin), mean and deviation within 7% of the 3 originals (`--check`). ~180 MB: they go in the
    `medal_gen` pack (complete version), beyond the 128 MB reserve of the generated pack.
  - **Banners**: the Trait slot reads #N («Guarantees one Trait Medal #23»), the catalog has the entries «trait medal #N»
    (cls LIST, outside the standard pools), the server draws them only in the slot (not in the generic pool), in the lists
    (B0324 #18) and in the «within 5» pities (B0259...B0292). No banner stays with the fallback (before 38, with the numbers
    #189-#249 before the research of 19-10). Details and Draw Odds: «Trait Medal #N (for <medaglia>)». The «boosted Trait Medal» of the
    notices are ignored (no boosted row).

- **Bench 20-10** (save `provetm` = prove525 + gifts #106 x3, #108 x2, #131; `-GachaShow B0513`): gifts in black and
  white, «Trait» filter of the Medal List, details (STR/DEF 1, cost 999, Lesser Attack x1.00), no Level Up on the Trait
  Medal; in the Level Up of Illustrated Sora A #106 is among the dot materials, preview «Trait», fusion ->
  Paralysis Resist 20% (slot 1/2) + 1 dot + EXP (Great x1.5). Deal B0513: Details «Guarantees one Trait Medal #106», the
  draw gives the 7★ and #106. In the Level Up the materials are added by dragging them onto the slot (`Swipe 1430 410 240 630 900`).
- Limit (until 21-10): the Trait deals (from 13-3-2018) were beyond the date of the story (quest 525 = 8-12-2016), so they
  could not be reached by playing (only with `-GachaShow`); with quests 526-979 they unlock with the story (e.g. B0259,
  `unlockQuest` 725 in `server/game_data/gacha_catalog.json`), not yet seen on the bench; the original Moogle Shop also sold them («Trait Medal #N x10», 1,000
  jewels, in the deal window; khuxwiki for #189-#313): not done yet.

<a id="skill"></a>
## Skills and Overwrite Skill of the Level Up (I-088)

Sources (`reference\medal_overwrite\NOTE.md`): khuxwiki «Medal» (Skills section) and «Scrooge»
(`reference\guilt\khuxwiki_raw.md`), kingdomhearts.fandom «Medals», khwiki «Skill», GameFAQs
(thread 74095652), Reddit r/KHUx (`reference\optimize\reddit_subslot_pet_levelup_optimize.md`),
client texts 101300020-032 and 100620003.
- Skill = passive ability of the medal (`skill` table, 163 rows since 18-10: see «Skill table»
  below; maxLv 10/15/20). One per medal (khwiki; the client reads 2). It levels up by using the
  medal in battle (skill EXP, table `skillExp`). Rare on deal medals; the
  **Scrooges** (EXP medal 3/5/6★, Colosseum and events) always bring it at the maximum level.
- Overwrite (wiki): the skill of the **leftmost** material passes to the base; 20% at skill level 1,
  up to 100% at the maximum (Scrooge always 100%); often the base keeps its own. With «Overwrite
  Skill» off the skills of the materials are lost (101300031 «"Overwrite Skill" is OFF. Skills will
  be lost!», 101300032). The level passes with the skill (the Scrooges give it at the maximum); Evolve
  keeps the level (101400007). Cost: nothing extra (the Level Up munny stays medalMisc 115).
- Client 4.3.1: request = `{baseUserMedalId, componentUserMedalIds, isOverwriteSkill (0/1, button
  `Button_Overwrite`), numbers, isGreatSuccess}`: no skill chosen. Probability («Success Rate %d%%» 101300021):
  skill of the first material (`Txt_SkillName_Label`, `Icon_Skill`); for every skill of the materials with the
  same `categoryEvolve` it adds `121 + (122 - 121) * (lv - 1) / (maxLv - 1)` (medalMisc 121 = 2000, 122 =
  10000) times the campaign multiplier («Increased probability of skill overwrite» 104600016) / 10000; cap
  100%. Response: `overwriteSkills` = userSkill elements, `successOverwrite`: the result shows the name of the
  base's skill after the fusion.
- **Action 55 (Level Up): `userSkills` = skills to DELETE** (bench 18-10, crash on tapping the result):
  the client removes the `userSkillId`s of the list from its skill table, then merges `overwriteSkills` and
  the medals; `componentUserMedalIds` removes only medals. Sending the whole list, the client emptied the
  table and the «Skill» sorting of the Medal List crashed (skill row 0). The
  server sends only the skills of the consumed materials; the base with a skill keeps its `userSkillId`. Other
  branches: sale (51) upsert, `GET /user/skill` (13) replaces everything. Test: Level Up of Leon with a
  material without a skill, list by «Skill», no crash and skills of the other medals intact.
- «Overwrite Skill» button always gray (I-157): switch `skill_mix_button` (
  `img/ui/skill_mix_button_On.png` / `_Off` / `_Disable`); when on it also changes the slot frames
  (`img/ui/Medal_Syn_Select_Panel02.png`). We serve only `_Off`: missing `_On` (light blue in the 2016
  pack) and `Medal_Syn_Select_Panel02` in `img/ui/`.
- userSkill element: `userSkillId` uint64, `skillId`, `level`, `exp`, `userMedalId`,
  `getDatetime`; `userMedal.userSkills` = ids only (int). The client looks up every id in its skill table
  (filled from the `userSkills` lists): id without an object = skill row 0 = crash; with the object it reads
  `skillExp` by `expType` (no null check).
- `skillExp` curve (I-146, 18-10, from the client): the level is capped at `maxLv` of the skill row; the
  `skillExp` row of `expType` (`expId`, `value` int[3]) gives, computed in float,
  `soglia(L) = trunc(value[1] * powf((L - 1) / (value[0] - 1), value[2] / 10000.0f))` (threshold)
  for the current level and `L` in place of `L - 1` for the next one; the skill EXP
  is therefore **total** (0 at LV 1). Real rows: `[30,12132,13500]` = 12132 EXP at LV 30, exponent 1.35
  (LV 2-4: 128, 328, 567; LV 8: 1780; LV 10: 2499). `maxLv` does not enter the curve. Server: `expToReach`,
  `levelForExp`, `addSkillExp` in `server/medal-skill.js`, test `server/test-skill-exp.js`.
- Check against the wiki «Skill EXP» (maxLv 10 from LV 1 to LV 8 in two runs, 15 -> LV 7 and 20 -> LV 6 in four): it
  does not match the `exp` of the enemies. Stage 82003 (601001 x3 + 611001, `exp` 200/1200) gives 1800 EXP per run: one run
  already brings a maxLv 10 to LV 8 (expType 1), two runs to the maximum; 11001-11006 at the highest level (5/20) give
  15-35 EXP per run, LV 1-2. No `skillExp` row explains both LV 8 (maxLv 10, 2 runs) and LV 7 (maxLv 15,
  4 runs): the amount of EXP given by the original remains to be understood (Task 3), not the curve.
- Server (`server/medal-skill.js`, 12-10): `player.medalSkills[userMedalId]` after a successful Overwrite
  (userSkillId from `player.nextUserSkillId`); the Scrooges have a computed skill (id
  1000000000 + userMedalId, maximum level; which skill each Scrooge had is not known: hypothesis 3★
  rank 1, 5★ rank 2, 6★ rank 3, chosen with userMedalId; see «Scrooge and wiki» and «Migration» below). Whole `userSkills` at login, inventory,
  Level Up, sale, trait; the support sends the skill of its medal. `skillExp` = the 4 real rows
  (see «Skill table»; the old invented `server/tables/skillExp.json` was removed). Test: `server/test-medal-enhance.js`
  (point 9).
- Scrooge and wiki (I-146, 18-10, search in `wiki_all.json`): the «Scrooge» page only says «grants a skill»
  (3★/5★/6★, EXP 1400/5150/15150, from the Colosseum or the events) and the master has one row per rarity (90123/
  90125/90126, name always «Scrooge»): the skill **does not depend on the medal but on the reward**. The wiki writes it
  next to the reward: boards (`6★ Scrooge (Board)`: «Scrooge 5★ (Paralysis)», «Scrooge 6★ (Attack Boost II)»),
  Shop/2016-2017 («Scrooge Medal with the [[Attack Boost III]] Skill»), Moogle Shop (Scrooge 6★ with «ATK B XIV
  Max & Sleep», «Second Chance IV», ...), gifts (Organization XIII A: «ATK B III Max & SP GA II»). Rewards
  counted on the boards: 3★ = Poison/Paralysis/Sleep/Attack Boost I/All I/Defense Boost I (all rank 1);
  5★ = Boost II, All II, Defense Boost II, statuses and «+» statuses (rank 1-2); 6★ = Attack Boost II, No Cost, Attack
  Prize Plus, «Max» and combinations (rank 2-3). No match by name is possible: the rule by
  rarity remains (3★ rank 1, 5★ rank 2, 6★ rank 3, `pool[userMedalId % pool.length]` by skillId, maximum level)
  on the complete table: 3★ unchanged (the 6 rank-1 ones were already all in the master), 5★ from 5 to 14 skills, 6★ from
  1 (No Cost) to 143.
- Migration (I-146, `migrateSkills()` in `server.js`, `player.skillVersion` 1, at startup after the tables): the
  Scrooges already owned without an entry save the previous skill (`scroogeSkillV1` = same rule on the 12 skills
  of that time 1100-1113, same `userSkillId` 1000000000 + userMedalId, `getDatetime` of the medal); every
  saved skill keeps the shown level and takes `exp` = real threshold of that level (`expToReach`, capped at
  maxLv: the invented curve gave other numbers). Medals without a skill stay without; new Scrooges = rule
  on the complete table, computed (exp = threshold of the maximum level, like the migrated ones; guard: with an old or reduced master the migration is postponed with a warning `[skill] migrazione rimandata`). New player: `skillVersion` 1 immediately. Test:
  `server/test-skill-migration.js`.
- Skill table (I-146, 18-10, `server/make-skill-table.js`, called by `make-game-tables.js` after
  `make-pet-tables`; test `server/test-skill-table.js`; report `D:\Progetto_Restauro_KH_UX\tmp\skill\report.md`).
  Sources read at build time, outside the repo: 25 real rows from thethiny (1100-1126, `D:\Progetto_Restauro_KH_UX\external\thethiny_2026-10-13\KHUx-Server\data\skill.json`), the 4
  real rows of `skillExp` (expId 1-4) and the «List of Skills» list of the wiki's «Medal» page (163 skills,
  no duplicates). Rules:
  - real rows: thethiny's numbers unchanged (also `thumbId` 1-5; 5.0.1 uses 6-9 and Lux Plus `luxUp` 15000
    against 30000); the 4 fields of the 4.3.1 layout that thethiny does not have (`value1`, `burstLock`, `pvpConditionTurn`,
    `pvpConditionCount`) from the 5.0.1 row of the master if it exists (1100-1113: e.g. Poison `value1` 1000,
    `pvpConditionCount` 3), otherwise from the description: `value1` 1000 for the statuses (1120-1122) and 10000 for the
    others, `burstLock` 10000/20000 for SP Attack Gauge I/II (1124/1126), `pvp*` = `condition*`. The master rows
    beyond 1113 are generated and do not count as a source for these fields;
  - match with the wiki by normalized name (capitals, «Plus»/«+», «ATK»/«Attack», Roman numerals, order
    of the «&» parts: «ATK Prize+ & ATK Boost II» = «ATK Boost II & ATK Prize+»);
  - rebuilt (138, ids 1127-1264 in wiki order, `sortId` = `skillId`, unique `categoryEvolve` from 31):
    copy of the sibling = real row of the same family (from the description: Attack Boost, Attack Boost All,
    Defense Boost, Second Chance, status, «+» status, SP Attack Gauge, ATK & Lux, ATK & Prize, No Cost) closest
    by maxLv, «Max», status, probability and power; `rank`/`expType` of the sibling if it has the same maxLv,
    otherwise of the most common real row with that maxLv (20 -> 3/3); power from the description (`attackUp`
    N*10000, `damageCut` 10000*(1-a/b), `luxUp` 30000 or 50000 for «vastly» (estimate), `prizeBurstUp` 220000,
    `add*` 10000 and `conditionTurn` 1 with «1 turn», `value1` 1000 for the statuses (500 with «Effective on enemies
    up to LV 1999»), `burstCancel` 1 with «no special attack gauges», `burstLock` N*10000 with «uses only N»);
    `invokeProbPerLv` of the sibling (the «Max» ones with a non-«Max» sibling: 10 like Attack Boost II Max),
    `invokeProb` from the wiki's trigger%, which is **truncated** (real: 47.2% -> 47, 44.5% -> 44, 54.25% -> 54): that
    of the sibling if it gives the same trigger%, otherwise the only multiple of 100 that gives it (`baseProb`, finds again
    all 25 real ones); the exact 100% stay 10000 - perLv * (maxLv - 1) (9810, Defense Boost I Max 9860);
  - families without a real row, sibling with the closest activation type: ATK & status (13, Poison+/Paralysis+/
    Sleep+), Triple Threat (2, Poison+, all three statuses), ATK & SP Gauge (42, Attack Boost III Max with
    icon 5 of the SP Attack Gauges, `invokeType` 1 and `invokeShowTiming` 6: see below);
  - texts <= 71 bytes (`string(72)`): whole sentences of the wiki, fixed abbreviations if they do not fit (also 6
    real rows: 1114, 1117, 1120-1123).
- Units of the effect fields (check of 18-10 on the client 4.3.1). 10000 = 1.0:
  | field | unit / effect |
  |---|---|
  | `invokeProb`, `invokeProbPerLv` | probability in 1/10000: `invokeProb + perLv * (min(lv, maxLv) - 1)` (Attack Boost I LV 10 = 47.2%), times (1 + battle bonus) |
  | `invokeShowTiming` | moment: 1 medal attack, 2 damage taken, 3/4 start of turn (4 also Second Chance), 5 special attack, 6 = 1 or 5 (one roll per battle, then always or never), 7 = 2 or 5 |
  | `invokeType` | filter on the attack type: 4 special only, 5 «all» medals only, 7 everything except «all» and special (base statuses: single target only), 3 timing 4 only, 0 never, 1/2/6 no filter |
  | `attackUp` | damage multiplier /10000: 24000 = damage x2.4 (not +40%) |
  | `damageCut` | damage taken * damageCut / 10000 (minimum 1; among several skills the lowest wins): 10000 no reduction, 5000 = -1/2, 3333 = -2/3, 2000 = -80% |
  | `dokonjo` | flag: with HP at 0 it stays at 1 HP, once |
  | `burstCancel` | 1 = free special |
  | `burstLock` | with `burstCancel` 0: fixed cost of the special in gauge*10000 (10000 = «only 1 gauge», 20000 = «only 2»); **0 = free** |
  | `add*` | flag (10000 is not a probability): success = activation * enemy rate * `value1` |
  | `value1` | statuses only: factor clamp(1 - X * value1 / 1e6, 0, 1); X = enemy level (deduction: 1000 = up to LV 999, 500 = «up to LV 1999»; 10000 = nothing beyond LV 99) |
  | `conditionTurn` / `conditionCount` | duration in turns / in actions; with turn > 0 count is reset; reapplication = maximum |
  | `prizeHpUp`, `prizeBurstUp` | multipliers /10000 of the HP / gauge prizes of the enemy hit (220000 = x22 on the gauge points, not a probability) |
  | `luxUp` | multiplier /10000 of the Lux (per hit, final hit, raid): 30000 = x3, 15000 = x1.5 |
  | `pvpConditionTurn/Count`, `moneyUp`, `raidUp`, `counter`, `addAction` | **never read** in 4.3.1 (neutral) |
  Lux and prize apply only if the skill triggered on the attack that hits the enemy.
- Row-by-row check of 18-10 (row description and wiki against the numbers, 163 rows):
  - fixed in the generator (master regenerated, 98 rows changed): `invokeProb` of 30 rebuilt ones (Attack Boost
    IV-XII, non-Max ATK & Lux and ATK & AP & Lux 3975 -> 4000, Defense Boost IV-VI 2950 -> 3000, ATK & AP+ 3950 ->
    4000, Second Chance II/III 5950/7950 -> 6000/8000: the old computation took the wiki's trigger% as
    exact); `burstLock` of SP Attack Gauge I/II (0 -> 10000/20000: they were free like No Cost) and of the 29
    «GA 1/2» combos; `invokeShowTiming` 1 -> 6 of the 42 ATK & GA combos (with 1 the cost of the special, read at timing
    5, never changed; 6 is a deduction, no real row uses it: to be tried on the bench); `value1` 10000 ->
    1000 of the 3 real «+» ones (with 10000 the status did not succeed on enemies from LV 100) and 500 of the 21 rebuilt
    «up to LV 1999» ones (the other status ones 1000).
  - **4.3.1 state (18-10 evening, `ERA_431` in make-skill-table.js, research in `tmp\skill\suspicious_rows.md`)**:
    thethiny is the master of Feb.-Mar. 2017, 5.0.1 (2021) the source closest to 4.3.1 (spring 2021).
    Lux Plus 1109 `luxUp` 30000 -> 15000 (x1.5 as 5.0.1); Lux grades of the rebuilt ones: «increases» 15000,
    «greatly» 30000 (real combos), «vastly» 50000 (estimate). Icons: the WW 4.3.1 resources have Skill_Icon1,2,4-9 and
    not 3 (it is false that 4.3.1 did not have 6-9): 6 attack on all (1102/1103), 7 prize (1107/1117), 8 Lux
    (1109/1114/1123), 9 gauge cost (1110/1124/1126; the last 5 by deduction). The 2016 Skill_Icon3 served
    by I-158 is no longer used by any row. SP Attack Gauge II and Attack Prize Plus x22 stay (the same in the sources).
  - (historical) suspicious real rows: Lux Plus 1109 `luxUp` 30000 (x3) in thethiny's data (era 1.1.3) against
    15000 (x1.5) in 5.0.1, same description; the «greatly increases Lux» combos (1114, 1123) have 30000 and
    4.3.1 might have the 5.0.1 values; SP Attack Gauge II 1126 has `maxLv` 15 with `expType` 3 (the other
    maxLv 15 have 2) and `categoryEvolve` 29 like I; Attack Prize Plus `prizeBurstUp` 220000 (x22) is much
    more than «increases», but it is the real number. The other 25 match description and wiki.
  - remaining estimates: Lux++ `luxUp` 50000 («vastly», no real row), the «GA» combos (timing 6).
  Open: X of `value1` (enemy level) and timing 6 of the ATK & GA combos, to be tried on the bench.
- Level Up Optimize (`Button_MaxEnhanced`):
  all in the client, which chooses the materials and sends the same `/user/medal/enhance` (with `numbers`
  for the stacks); no extra data from the server. From 3.3.0 it uses Huey & Dewey & Louie and not the attack
  medals, it fills the EXP bar; it does not touch the Scrooges put in by hand (Reddit).

<a id="optimize"></a>
### Optimize popup (I-090)

- The crash on tapping Optimize (bench 12-10) is a missing layout: the client loads
  `cocostudio/publish/MedalInfo_MaxEnhanced_ver340.json`, which is not in any resource. Server,
  master and responses are not involved (the request arrives only after the popup).
- Widgets looked up (all without checks except `Announce`): `Scroll_Area` (list of the chosen materials),
  with the chosen materials), `Txt_Title` (106220300 «Choose a parameter to max out.»), `Txt_attention`
  (106220301), `Base_Money1`/`Base_Money2` > `Txt_Money` (100300002/3) and `Txt_Money_Label` (cost and
  owned), `Button_Mix` (adds the But01 button to it) > `Txt_Mix` (106220314 «Level Up»),
  `Close_Button`; for MaxLv/MaxAtk/MaxDef/MaxCost/MaxGuilt a node with `CheckBox_<p>` (real CheckBox),
  `Plate_Max` (blinks), `Txt_<p>` (106220304/306/308/310/312) and
  `Txt_<p>_Label` (value «%d», «+%d», «Maxed Out»...). The choices are recomputed at every tap; Level Up
  sends the normal `/user/medal/enhance`.
- Layout generated in `make_layouts.py` (12-10): window Win04, But16 filters on the left, grid on the
  right, Munny and Level Up plates like `MedalInfo_Mix_ver340`. No original screenshot found.
  Bench 12-10: the popup opens, but «No Medals» on every parameter.
- Candidates (client rule): the medals of the Level Up list (probably already filtered by the Sort/filter)
  whose row has `autoEnhance` != 0 and `type` 2, 4 or 5; medalId not excluded; medal not locked and not in
  use. For every parameter **not** ticked the medals that would give it are discarded: LV -> `materialExp`,
  STR -> `enhanceAttack`, DEF -> `enhanceDefense`, Cost -> `enhanceCost`, SP Attack Bonus -> `enhanceGuilt`.
  Then it sorts and chooses up to the maximum of every parameter.
- `autoEnhance` was 0 on the whole master: the old format does not have it. Rule in
  `make-game-tables.js`: 1 if `validPack` (unk_1116 of the old format) and type 2/4/5, that is Huey/
  Dewey/Louie and HDL, Chip, Dale, Magic Mirror, Cid/Cid 5/Cid 10 (23 rows). The
  Scrooges stay out (type 2, unk_1116 0), as in the original (Reddit: Optimize does not use the Scrooges). Original
  values not found: rebuilt rule.

<a id="skill-banco"></a>
### Bench test of 18-10 (rev 124, full save)

- Migration at the first start: `skillVersion` 1, 15 skills (8 saved + 4 test ones + 3 fixed Scrooges).
- Details: Attack Boost VI (rebuilt) 1/20 at 39% (`invokeProb` 3975), Second Chance (real) 15/15 at 32%; correct icons and descriptions.
- Growth: Combat 101 gives `getPoint.exp` 14 with 17 enemies; with EXP at 595 the quest brings the skill to LV 3 and the RESULTS show
  «Supernova+ - SP Roxas's Attack Boost VI leveled up!» (the client compares the level of `userSkills` before and after the response of
  `/stage/clear`; no dedicated field, `D:\Progetto_Restauro_KH_UX\tmp\skill\popup\answer.md`).
- Overwrite: material Donald Ver. A with Attack Boost VII 20/20 on the left -> «Success Rate 100%», popup «Overwrite Attack Boost VI with
  Attack Boost VII?», base with Attack Boost VII 20/20. «Skill» sorting of the list: medals with a skill at the top.
- «& GA N» combos (18-10, user's bench): `burstLock` = fixed cost of the special in gauge x 10000; AB VIII Max &
  Lux++ & GA 1 on SP Roxas (3-gauge special) -> the special costs 1 gauge. `invokeShowTiming` 6 works.
- Activation in battle (18-10, live, `relogin.ps1 -EnemyAtk 10`): SP Axel's Second Chance triggers, the
  player stays standing at 1 HP (`screenshots\sc_live.png`, quest 132); the name of SP Roxas's Attack Boost
  appears on screen. To be measured: the real damage increase of Attack Boost; the «& GA 1/2» combos.
- Pitfalls: `Select-Object -First N` on a node script closes it before writing (test skill lost); a crash of the
  emulator's sensor service (`android.hardware.sensors`) is not a game crash.

<a id="mapping-orgxiii"></a>
## Organization XIII and Roboloid mapping (I-160, 18-10, rev 128)

- Problem: `make-game-tables.js` takes the Tier from the Roboloid row `MEDAL_MAP[id]` and with `KHUX_MEDALS_ALL` adds as
  `300000+ID` every unused row. For the 13 SE ids of Organization XIII `medal_map.json` pointed to the «X [+]» (Tier 8): the
  «X A» 3004xx/3006xx became our duplicates and the 6★ [+] had no row. Evidence: `tmp\sp2b\g4\medal_mapping_audit.md`
  (group 1), `orgxiii_migration.md`.
- Fix in `server/make-game-tables.js`: `MEDAL_MAP_FIX` (23 keys: 13 SE ids + 10 copies 1xxxxx -> «X A» 6★, Tier 3) applied
  with `Object.assign` after loading `MEDAL_MAP`; `EVOLVE_FIX` (same 23 keys -> 7★ «X A», `validEvolve` 1, 5 Blue Fairy [3]
  from `blue-fairy.js`). It is in the repo because `medal_map.json` is external (`D:\Progetto_Restauro_KH_UX\medal_gen`) and not
  versioned: without the table in the generator a regeneration would bring the error back. Only Roboloid/SE ids, no SE data.
- Table (SE -> correct «X A» / 7★ «X A» / new 6★ [+], EN date): 31176 Lexaeus 443/300444/301491 2018-05-13; 31196 Xaldin
  483/300484/301601 2018-09-24 (event only); 31206 Saix 486/300487/301531 2018-07-13; 31226 Xemnas 638/300639/301680 2019-01-13;
  32186 Marluxia 446/300447/301634 2018-11-13; 32196 Larxene 449/300450/301658 2018-12-13; 32216 Xigbar 489/300490/301745
  2019-02-13; 32236 Axel 641/300642/301563 2018-08-13; 33176 Vexen 452/300453/301446 2018-04-13; 33186 Zexion 455/300456/301511
  2018-06-13; 33206 Demyx 492/300493/301595 2018-09-13; 33216 Luxord 495/300496/301616 2018-10-13; 33236 Roxas 644/300645/301782
  2019-03-13. The boosted 20xxxxx/21xxxxx of Org XIII are not regenerated (they came from the [+] deals): now they are the 2301xxx.
- Tests: `server/test-orgxiii-map.js` (hand table against the master), `server/test-orgxiii-migration.js`.
- Catalog (`recon/tools/make_banner_catalog.py`, 4f1c8a7): aliases of Axel/Roxas/Vexen no longer on SN++, 6.2 on «axel a»/«roxas a»,
  `clamp_plus_dates` (the [+] not before `firstRarity`), `medal_date` in `banner_overrides.tsv` (302074/302075 at 2021-01-01);
  B0280/B0303 give the 6★ [+]. Installed with the skill promises of the 98 banners (`maxSkill`).
- Images (ba2922d): graphics and cutins of the 13 6★ [+] 301446...301782 (imageId = medalId), resources 42. On the bench the SE 6★ had the
  graphics of the [+] (wrong color in the filters): `norm()` of `recon/tools/fetch_medal_images.py` removed the «+», «Vexen [+]» 6★ and
  «Vexen» 6★ had the same key. Fixed in 989d5de; in `medal_gen` the 23 images (Medal_L, Medal_S, Cutin) are those of the
  6★ «X A» 3004xx/3006xx and `medal_map.json` points there; resources 43. Check on all the 2106 medals with graphics: attribute, name and
  stars equal to Roboloid.
- Names (e53b3d4, rev 128): thethiny's master (2017) calls the SE 5★/6★ just «Lexaeus»; in 4.3.1 they are «X A» since the release of the
  «B». The 36 rows take the name of the 7★ «X A» at the end of the Evolve; catalog regenerated (5 banners: only name keys).
- Names of 6★ «Illustrated Sora A»/«Riku A» (20-10): 41036 and 42036 (and the boosted 2041036/2042036) were «Illustrated Sora»/«Riku»; like the 7★ 300572/300576 and the khuxwiki
  (sortId 448/449) they are «... A». `server/medal-name-fix.js` (`NAME_FIX`, called by make-game-tables.js; on its own it fixes the master in place); `make-boosted-medals.js`
  adds 1041036/1042036 (+1000 STR) for B0362/B0363 and the other banners with those names. The catalog already resolved them by id. Evolve to the 7★: I-162.
- Save (247fbed, `migrateMedalMap` in `server/server.js`, `medalMapVersion` 1-2): `ORGXIII_MEDAL_MAP` (36 entries) moves 3004xx/3006xx
  to the SE id and the boosted 20xxxxx/21xxxxx to 2301xxx; fields with `medalId`: `medals[]`, `medalState`, gifts `resourceType` 3;
  the rest follows `userMedalId`. Bench save: 14 copies, no boosted ones. Version 2 (final review): the record of the
  Nova level (`guiltBurst.first`/`max`, per medalId, never decreases) takes the new id in place of the old one only if it is not already there
  (no second +5 with popup for the same medal, level that does not go down); the migration runs before `migrateSkills`.
- Open follow-ups from the audit: I-161 (SN++ 302008-302012 «adjusted» of 07-09-2020, evolution with Fantasia Mickey B 300913) and I-162
  (167 original 6★ without `validEvolve` towards the 7★).

<a id="danno-variabile"></a>
## Variable-damage specials (I-189, analysis and fix 21-10, to be verified on the bench)

User's report: Cloud II EX in the video https://www.youtube.com/watch?v=eLmkNDzwuPE (2:02) shows «x7.12 - 8.64»,
ours «x6.90». Offline analysis of the client (private notes):

- Burst row fields used: displayPower (int64), displayPowerPerEnforce (5 int64), **displayMaxPower** (int32),
  displayMaxPowerPerEnforce (5 int32), basePower, basePowerPerEnforce, damageType, **specialPowerType**, sp1,
  sp2 (int64), sp1PerEnforce, sp2PerEnforce.
- Detail: dots from `userMedal.burstUpperNumber`, displayPower or displayPowerPerEnforce[dots-1] / 10000 times the
  guilt factor. damageType 2 = fixed-damage text; otherwise
  specialPowerType 1 = one value, **every other type = range** «x a - b» with b = factor x displayMaxPower(PerEnforce)
  / 10000 (the max only if the type is neither 1 nor 2).
- Our data: all the 2276 burst rows have specialPowerType 1/2 and displayMaxPower 0: they are copies of the templates of
  `burst_base.json` (type 1) and `medal-power-fix.js` copies from thethiny only the base/display powers. Cloud II EX 7★
  (300999 -> burst 3000999) = type 1, 69000 (x6.90; x7.12 at 5 dots).
- Originals: thethiny `burst.json` has 173 variable rows, all with displayMaxPower; types 3 (less HP) and 4 (more HP),
  38/38: displayPower = basePower*sp1/1e4, displayMaxPower = basePower*(sp1+sp2)/1e4, sp2 = 10000. Roboloid (ID 999):
  LowMulti 7.12, HighMulti 8.64, Condition HigherHP (the numbers of the video at 5 dots).
- Roboloid conditions -> type (matched by attack name): LowerHP 3, HigherHP 4, DrainsHP 5, MoreTurns 6, SPSuccession 7,
  DrainsDEF 16, Poison 20, Sleep 21, Paralysis 22, GaugesFull 23, GaugesUsed 25, LessLUX 27, MoreGaugesPrevMedal 28,
  MoreLUX 30, HigherSlot 40 (HigherSlot also 5 and MoreEnemiesDefeated 28: probable collisions).
- Affected rows: **661** Roboloid bursts with Low/High flattened (146 HigherHP): 548 with the low value, **104 with the high
  value** (`make-game-tables.js:189` uses `Multi || HighMulti`: today they do too much damage), 9 neither of the two; 391 with a
  mapped condition, 270 not (OneEnemy 130, LowerSlot 69, Critical, MoreParty, Slot3-6, MoreSkillsStage: type to be found
  in the damage code). Another **65** rows with an id in thethiny of type > 2 lost their type.
- Proposed fix (not applied): `variablePower` step after `burstPowerFix` (verbatim copy of the variable fields from
  thethiny for the 65; for the 391 type from the map and, for 3/4, bp = hi - lo, sp1 = lo*1e4/bp, sp2 = 10000, per dot
  bp_i = lo_i*1e4/sp1); line 189 from LowMulti. To be verified in battle: the use of specialPowerType/sp1/sp2 in the damage
  is deduced. Rebuilt formulas -> Notices.

**Applied (21-10)**: `server/variable-power.js` `variablePower(bursts, {origBursts, robo, medals})`, called in
make-game-tables.js right after `burstPowerFix` and from the command line of `medal-power-fix.js` (which puts back basePower =
display: for types 3/4 basePower is the gap, so the two steps must always go together); on its own
`node server/variable-power.js [master] [--rows]`, idempotent. Test: `node server/test-variable-power.js`.
- a. **65** rows with an id in thethiny of type > 2: specialPowerType, sp1, sp2, displayMaxPower verbatim; sp1/sp2PerEnforce and
  displayMaxPowerPerEnforce extended to the row's dots like `ext()` (0 beyond).
- b. Roboloid with a mapped condition, 391 rows:
  - **157** type 3/4 (LowerHP/HigherHP): lo = LowMulti*1e4, hi = HighMulti*1e4 at the maximum dot, bp = hi - lo,
    sp1 = round(lo*1e4/bp), sp2 = 10000; per dot bp_i = round(lo_i*1e4/sp1), max_i = lo_i + bp_i, display = lo_i
    exact (deviation of base*sp1/1e4 from the display up to sp1/2e4 because of rounding). Cloud II EX 7★: sp1 46842,
    0 dots 69000 - 83730 (x6.90 - 8.37), 5 dots 71200 - 86400 (x7.12 - 8.64).
  - **17** type 20/21/30 (Poison/Sleep/MoreLUX): on the originals (6/6/14 rows, also per dot) max = base + sp1 with
    constant sp2 0/0/1e8: base = display = lo_i, sp1 = hi - lo, max_i = lo_i + sp1.
  - **217** type 1 because the relation cannot be verified on the originals of the same type: 5 (7, sp1 9000/9990 not
    derivable), 6 (12), 7 (39), 16 (8), 22 (7, Dark Blizzaga 10511 has max - base 6000 with sp1 8500), 23 (52), 25 (14),
    27 (3), 28 (9), 40 (66).
- c. **270** conditions without a known type, type 1: OneEnemy 130, LowerSlot 69, MoreParty 20, Critical 18,
  MoreEnemiesDefeated 7, Slot5 7, MoreSkillsStage 6, Slot4 6, Slot3 4, Slot6 2, without condition 1.
- Line 189 of make-game-tables.js and `multiOf` of burstPowerFix (make-game-tables.js and medal-power-fix.js): `Multi ||
  LowMulti` instead of `Multi || HighMulti`. On the master: **104** rows change (only base/display and PerEnforce), the
  rest identical; medal.json unchanged. One Roboloid type 4 row (3000701) has from the khuxwiki 66500 at full dots instead
  of LowMulti 6.64: the row's display kept, sp1 from Low/High.
- IMPORTANT notice «Variable Special Attacks» (routes-info-album.js) declares the 174 rebuilt ones and the others at the low value.

<a id="danno-variabile-tipi"></a>
### Variable power types from the battle code (I-189b, analysis 21-10)

Damage formula (client, by `specialPowerType`; private notes). S1 = sp1 (or sp1PerEnforce[dots-1]) / 1e4,
S2 = sp2 / 1e4, B = basePower(PerEnforce) / 1e4 (damageType 2: B = S1); then attribute factor and (guilt + skill + 1e4)/1e4.
**f(x) = x² / (S2 + x²)**.

| type | condition | formula | proof |
|---|---|---|---|
| 3 | less HP | B·S2·(S1 + 1 − hp/maxHP) | client + 8 originals |
| 4 | more HP | B·S2·(S1 + hp/maxHP) | client + 30 originals |
| 5 | pays HP | hp <= S1: HP to 1, bonus S2·hp/S1; otherwise costs S1·maxHP; M = B + S2 | client + 15 originals |
| 6 | turns passed | B + S1·f(turns), detail x 1→10, S2 5 | verified |
| 7 | specials in succession | B + S1·f(x), x 1→10, S2 6 | verified |
| 8-15 | counters of the buff tiers | B + S1·x | client only, no condition |
| 16 | pays DEF | B + S1·(DEF tiers lost), sp2 30000 | verified on the gap |
| 20/21/22 | target poisoned/asleep/paralyzed | B + S1 if true | verified |
| 23 | gauges full before use | B + S1·f(gauge), x 1→20, S2 10 | verified (Final Boss Xion) |
| 24 | fewer full gauges | B − S1·f(gauge) | client |
| 25 | gauges used in the turn | B + S1·f(x), x 0→20, S2 10 | verified (HD Larxene) |
| 26/27 | gauge cost of the previous/next medal | B + S1·f(gauge) | client |
| 28 | enemies defeated in the quest | B + S1·f(x), x 0→100, S2 50 | verified |
| 29 | fewer enemies defeated | B − S1·f(x) | client |
| 30 | more Lux (max 262143) | B + S1·f(x), sp2 1e8 | verified |
| 31 | less Lux | B − S1·f(lux) | client |
| 32/33 | more/fewer attacks made | | client, no condition |
| 34 | current slot == a deck value | B + S1 | meaning unknown |
| 35 | target at full HP | B + S1 | client |
| 36 | only one enemy alive | B + S1 | client |
| 37 | skills triggered | B + S1·f(x) | client |
| 38 | slot index (from 0) == S2 | B + S1 | client |
| 39 | lower slot, x = n−1−idx | B + S1·f(x) | client |
| 40 | higher slot, x = idx | B + S1·f(x), x 1→10, S2 5 | verified (Jafar) |
| 41 | a deck value (probably party size) | B + S1·f(x) | deduced |
| 42 | gauges before use, then all spent | B + S1·f(x) | client |

Roboloid Low/High = displayPower/displayMaxPower at full dots (~80 rows matched by name); max − display equal at
every dot. Reconstruction (lo, hi x 1e4): saturation types sp1 = (hi−lo)/(f(x_hi)−f(x_lo)), sp2 = S2·1e4,
base_i = lo_i − sp1·f(x_lo), max_i = lo_i + (hi−lo) (reproduces 42 originals out of 56; the 14 wrong ones are broken copies from
thethiny: Dark End, Radiant Glory, Gale Assault); flag types (20/21/22/35/36/38) base = display = lo, sp1 = hi−lo, sp2 0
(38: sp2 = (slot−1)·1e4); type 5 base lo, sp2 hi−lo, sp1 9000; type 16 base lo, sp1 (hi−lo)/6 (or /3), sp2 30000; type 31
base hi, sp1 hi−lo, sp2 1e8. Conditions: MoreGaugesPrevMedal = 26 (6 rows «previous») and 27 (3 «next»), LessLUX = 31,
MoreEnemiesDefeated = 28, OneEnemy = 36 (130), LowerSlot = 39 (69, convention of 40), Slot3/4/5/6 = 38 (sp2
20000/30000/40000/50000), MoreSkillsStage = 37, MoreParty = 41 (deduced). **Critical (18)**: no type, it uses
criticalPower (multiplier; a second field gives the probability): our rows have 10000 = no effect; proposal
criticalPower = hi/lo·1e4. Curves (S2 and range of x) of 26, 27, 31, 37, 39, 41 without an original: rebuilt shape.
To be verified on the bench: what the counters of types 6, 28 and 30 and the deck value of type 41 contain.

**Applied (I-189b, 21-10)**: `server/variable-power.js` (same step after `burstPowerFix` in make-game-tables.js and
in the command line of `medal-power-fix.js`) now rebuilds every condition with a type; test
`node server/test-variable-power.js`. Served master fixed in place with `node server/medal-power-fix.js` (byte-for-byte
equal to the test on a copy; copy of the before state in `D:\Progetto_Restauro_KH_UX\tmp\i189b\backup-master\`): **486** rows
changed (468 new variable + 18 Critical), displayPower and medal.json unchanged; rows with type > 2: 239 -> **707**.
- Roboloid rows per type (642): 3: 11, 4: 146, 5: 7, 6: 12, 7: 39, 16: 8, 20: 2, 21: 2, 22: 7, 23: 52, 25: 14, 26: 6,
  27: 3, 28: 7, 30: 13, 31: 3, 36: 130, 37: 6, 38: 19 (Slot3 4, Slot4 6, Slot5 7, Slot6 2), 39: 69, 40: 66, 41: 20.
  Plus 65 copied from thethiny (precedence), 18 Critical (criticalPower = round(hi/lo·1e4), type 1, `critical` = the
  probability untouched), 1 without condition (3002089) type 1.
- Saturation (6, 7, 23, 25, 26, 27, 28, 37, 39, 40, 41): sp1 = (hi−lo)/(f(x_hi)−f(x_lo)) computed in rationals,
  base_i = lo_i − sp1·f(x_lo), max_i = lo_i + (hi−lo). Conventions [S2, x_lo, x_hi]: 6 [5,1,10], 7 [6,1,10],
  23 [10,1,20], 25 [10,0,20], 27 [7,0,14] (Zone of Ruin), 28 [50,0,100], 40 [5,1,10]; **rebuilt curve**: 26 like
  27, 37 like 25, 39 and 41 like 40, 31 like 30 (sp2 1e8, base = maximum). It reproduces 42 originals out of 56 within 15
  also per dot (the 14 do not: Dark End, Radiant Glory, Gale Assault +4/+5). Final Boss Xion 6★ (3001131): 23, sp1 14016,
  sp2 100000, base 28826, «x3.01 - 4.25»; HD Larxene 6★ (3001223): 25, sp1 19168, base = display 29900, max 48600.
- Type 16: sp1 = (hi−lo)/6 if the attack is Cyclone Sword (originals 10571-10576), /3 for the others (originals Blitz and Swift
  Hero; Wheel Smash of KH III Go Go without an original follows the majority). Type 5: sp1 9000 (also for Dark Arcanum, which
  in the original +5 has 9990), sp2 = hi−lo. Type 38: sp2 = (slot−1)·1e4.
- MoreGaugesPrevMedal: 27 if the text says «next Medal» (Glacial Arrows, 3), otherwise 26 (Wind Dash, 6). Warning:
  in thethiny Wind Dash (original) is type 28 and Gale Assault type 27, against the code's map (28 enemies defeated,
  27 next medal, 31 less Lux): the code is followed, to be verified on the bench.
- 9 rows with the display at full dots (khuxwiki) different from LowMulti (3000545, 3000701, 3001893, 3001981, 3002008-3002012):
  display kept, gap hi − lo.
