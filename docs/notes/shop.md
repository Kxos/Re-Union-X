# Shop > Draw: medal draws

Sub-project 1 of the draws (16-10-2026): «Banner Catalog» plate + three original first-year banners
(DAILY DEAL!, SMALL DEAL!, Epic Medal Carnival) paid in jewels, ticket test banner (Platinum Ticket Draw,
only with `KHUX_GACHA_TEST=1`, replaced in sub-project 2 by `KHUX_GACHA_SHOW`). Sub-project 2 (17-10):
list of the original banners, [below](#sp2). Code: `server/gacha-data.js` (pure functions), `server/gacha.js` (list, checks,
payment, web pages), routes in `server/server.js`. Generators (since sub-project 2): `recon/tools/make_banner_catalog.py`
-> `server/game_data/gacha_catalog.json` (the catalogue), `recon/tools/make_banner_images.py` -> `server/game_data/gacha_img`,
`server/make-banners.js` -> `server/master_data/drawMedalType.json` (the master; the `gacha_banners.json` of sub-project 1
is no longer written). Tests: `node server/test-gacha-data.js`, `node server/test-gacha.js`, `node server/test-gacha-server.js`,
`python recon/tools/test_make_banner_catalog.py`. Plan and spec: `docs/superpowers/plans/2026-10-16-shop-estrazioni.md`.

<a id="protocollo"></a>
## Protocol (WW client 4.3.1)

### GET /gacha/list (action 75)

- The response needs `gachaList` **and** `petGachaList`: without `petGachaList` -> «200 ERROR :75».
- One plate per `gachaList` element, ordered by the list's `sortId` (ascending), then drawMedalTypeId (the master's
  sortId does not count). Element fields used: drawMedalTypeId, price, lotCount, bannerUrl, drawType, payType,
  isDayLimited, userLimitedCount (draws LEFT today), userWarrantDisplayOfTime, warrantMedalIds.
- The **DrawMedalType** master row of every plate is mandatory: the plate reads it without checking
  (displayTimeLeft, detailUrl). Every change to
  `drawMedalType.json` = master revision (BASE 118 since 16-10, 119 since 17-10 with the banner catalogue, 120 since
  17-10 with the limits of the free ones in the `comment`).
- `bannerUrl` downloaded over http by the client, 640x140: `/web/gacha/img/<id>.png`.
  The images of off-screen plates are downloaded only when the plate enters the view (bench: the
  Platinum plate showed the placeholder heart until `GET /web/gacha/img/10456.png` had arrived).

### POST /gacha/draw (action 76)

- Tap on DrawButton1/3 (drawType in {1,3,5,6}; isDayLimited with userLimitedCount 0 -> no action): the client checks
  jewels or tickets locally, a full box gives a popup; price 0 -> direct draw without confirmation (never use price 0),
  otherwise a confirmation, then the request and the draw scene.
- Request `{"drawMedalTypeId", "count"}` (count = lotCount); payType and price are taken by the server from its catalogue.
- Response: `userData.userPoint`,
  `userMedals`, `userSkills`, `userMaterials`, `gachaBonus` `{addType: 1, number: 0, userMedalIds: []}` (addType 0
  opens the bonus popup with a missing layout), `firstGetUserMedalIds`, `userMedalIds` (every id must exist after the
  merge of `userMedals`), `effectNumbers` (one per medal, only 0: 1/2 look for missing LWFs),
  `guiltBurstFirstUserMedalIds`, `guiltBurstMaxUserMedalIds`. No jewels in the response: after the response the client
  requests `GET /user/stone`; OK in the result -> `GET /gacha/list` and back to the Shop.
- Scene: `lwf/raisedraw/demo/raidgacha_result_display_%02d` with %02d = number
  of medals (missing = crash; no _11, maximum 10), per medal `lwf/raisedraw/Medal/Medal_D_Up|Rev|None<rare>`.
- WebView Details (url from the master `detailUrl`): closing it sends
  **no new /gacha/list** (confirmed on the bench, below).
- Draw Odds: global `odds` link from `/system/login`; the client **appends the plate's
  drawMedalTypeId** to the url (bench: `GET /web/gacha/odds9001`), so the link is `/web/gacha/odds/` and the route
  `/web/gacha/odds/<id>` shows the rates of that banner (all of them for the Catalog plate 9001).

<a id="piastre"></a>
## Plate rules

- **payType**: 1 jewel (free+pay, the only one used for jewels), 3 payStone only (always 0: never), 4-6 drawTicket1-3
  (always 0), 7/8 limitedDrawTicket1/2 (Platinum/Draw Ticket, from `userPoint`), **9 = crash** when drawing (text
  106240303 missing). payType 1 -> DrawButton1 with the price text; 4-9 with tickets < price -> grey
  button (`But07_Disable`, since resources 39).
- **price** never 0 (draw without confirmation); **benefitId** always 0 (locked plate: padlock, the tap
  crashes, I-134).
- The master's **comment** as a printf format with userWarrantDisplayOfTime (scrolling strip under the banner, with
  warrantDisplayOfTime 1, userWarrantDisplayOfTime 1, validComment 1); the list's name/description do not appear.
- Button text: drawType 1/3/5 + payType -> texts 1061404xx / 1061803xx; the Catalog uses the Gold Ticket
  (payType 6, price 1, nobody has any) with texts 106140420-424 rewritten by `recon/tools/make_shop_art.py`
  («Open Details to browse the Banner Catalog») and the Star7_Ticket_39 icon without «仮».
- Catalog plate: tap on the grey button = no action, no request (bench).

<a id="risorse"></a>
## Raisedraw resources

- `recon/tools/import_jp_raisedraw.py` (run by `build-resources.ps1` in full versions or if the
  folder is missing) copies from the JP 4.3.1 data the LWFs `raidgacha_result_display_02..10` and `Medal_D_*` complete with textures (the
  textures removed from the JP extraction taken from the served `_01` by aligning the texture tables) into
  `D:\Progetto_Restauro_KH_UX\raisedraw_gen\files`; report in `raisedraw_gen\raisedraw_report.json`.
- **Static package `raisedraw_gen`** (like enemy_gen): ~33 MB (701 files, 72-78 textures per folder), in the
  generated package they brought it to 136.5 MB, over the 128 MiB reserve. Piece d0038 of resources 40, generated
  d0039, `packs.txt` with `raisedraw_gen`; `-Quick` puts it back in the index if the installed version contains it;
  `-NoRaisedraw` for a version without it.
- Resources 40: `_02`..`_10` ok, Medal_D_Up1-12, Rev1-7, None7 ok; **Medal_D_None1-6 incomplete** (texture missing:
  with a darklight 3 medal below 7★ the result scene would crash). None of the 44 darklight 3
  medals of `medal.json` is in the catalogue: `recon/tools/test_make_banner_catalog.py` checks it. `KHUX_GACHA_SIZES = "1,2,3,4,5,6,7,8,9,10"` in `run-server.ps1`.

<a id="avvio"></a>
## Startup

- `run-server.ps1` / `relogin.ps1 -GachaShow B0306,B0456` (since 17-10, instead of `-GachaTest`): `KHUX_GACHA_SHOW`,
  catalogue rowIds added to the list even if locked or out of date; without it, the list is the story one.
- `KHUX_GACHA_SIZES`: numbers of medals per draw with a complete animation; a banner with a lotCount outside
  the list cannot be drawn.
- Tickets for the tests: with the server stopped, `limitedDrawTicket1` in the save (`server\save\player.json`); at the end of the
  test set it back to 0.

<a id="prove"></a>
## Bench tests (16-10-2026, resources 40, master BASE 118)

Save copy beforehand: `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-gacha\`; before the ticket
test: `tmp\player_before_gachatest.json`. Screenshots in `D:\Progetto_Restauro_KH_UX\screenshots`.

1. **Plates** (`shop_t6_shop0`, `shop_t6_s1_scroll`): Catalog at the top with our banner, grey button «Open
   Details to browse the Banner Catalog» with the new icon and counter 0, strip «Open Details to browse all
   banners»; below DAILY DEAL! («Spend 600 Jewels to get 3 Medals», «Chances left today: 1»), SMALL DEAL! («Spend
   300 Jewels to get 1 Medal»), Epic Medal Carnival («Spend 3000 Jewels to get 10 Medals») with images and scrolling
   captions («3 Medals: 1x 4★+, 2x 3★+ - once per day», ...).
2. **Grey Catalog button** (`shop_t6_s2_greytap`): no popup, no request in the log.
3. **Catalog Details** (`shop_t6_s3_catalog`, `shop_t6_s3_bannerdetail`, `shop_t6_s3_closed`): `GET
   /web/gacha/catalog`, tap on DAILY DEAL! -> `/web/gacha/detail/10001` (reconstructed rates, pool). Closed
   with the X: **no new `GET /gacha/list`** (as in the static analysis): choosing a group from the catalogue
   (sub-project 3) will have to say «leave and re-enter the Shop».
4. **Draw Odds** (`shop_t6_s4_odds`, `shop_t6_s4_odds2`): first «Banner not found.» (`GET /web/gacha/odds9001`, id
   appended by the client); link fixed (`/web/gacha/odds/`), then `GET /web/gacha/odds/10001` = page with the
   rates of the DAILY DEAL!.
5. **SMALL DEAL! x1** (`shop_t6_s5_confirm`, `shop_t6_s5_anim1-5`, `shop_t6_s5_back`, `shop_t6_s5_medallist`):
   confirmation «Spend 300 Jewels to get 1 Medal? 2076/2263 Held 3560», Moogle animation, result with 1 medal
   (Yuffie 3★, already owned: no NEW, correct), OK -> Shop, jewels 3560 -> 3260. Log: `POST /gacha/draw`
   («B0027 SMALL DEAL!: -300 freeStone, medaglie 32043»), `GET /user/stone`, `GET /gacha/list`. Medal List: slots
   2095/2267 after all the tests (2076 + 1 + 3 + 10 + 5).
6. **DAILY DEAL! x3** (`shop_t6_s6_confirm`, `shop_t6_s6_anim1-6`, `shop_t6_s6_back`, `shop_t6_s6_greytap`): 3 medals
   (4★ + two 3★) in one row, jewels 3260 -> 2660. Back in the Shop the DAILY DEAL! button is **grey** and
   without «Chances left today»; the tap does nothing (no request). It stays grey even after a relogin.
7. **Epic Medal Carnival x10** (`shop_t6_s7_confirm`, `shop_t6_s7_anim1-8`, `shop_t6_s7_back`): +1000 jewels given with the
   server stopped for the test (3660), confirmation 3000, 10-medal animation, **two rows of 5 tiles** (5x 3★, 4x 4★, 1x
   5★), jewels 660.
8. **10 Shop openings** (Home <-> Shop with MENU > Home; `shop_t6_s8_shop1-10`, `shop_t6_s8_home0-10`): no
   crash.
9. **Tickets** (`relogin.ps1 -GachaTest`, `limitedDrawTicket1 = 2`; `shop_t6_s9_plate`, `shop_t6_s9_confirm`,
   `shop_t6_s9_anim1-8`, `shop_t6_s9_back`): Platinum Ticket Draw plate with 2 tickets (icon with «仮», I-135),
   confirmation «Use 1 Platinum Ticket to get 5 Medals», 5 6★ medals in one row, tickets 2 -> 1 («-1
   limitedDrawTicket1» in the log). Then tickets to 0 and normal relogin (revision 118, without GachaTest).
10. **Notices** (`shop_t6_s10_notices`, `shop_t6_s10_shopnews`, `shop_t6_s10_diff`): «Shop» notice (Catalog and
    rates) and in the «Differences from the original game» the line «Shop draw rates are reconstructed...».

Effects on the save: -3900 jewels (+1000 given for the test: 3560 -> 660), 19 new medals, DAILY DEAL! already
used today, tickets 0.

### To verify on the bench (static analysis): outcomes

1. The scene change waits for response 76: yes (no error, the scene starts with the response data).
2. Missing Medal_D_*: not observed (pool without darklight 3; None1-6 are not needed).
3. Raisedraw LWFs in the index: served by resources 40 (raisedraw_gen), animations for 1, 3, 5 and 10 seen.
4. Repeated ids and Icon_New: not observed (no new medal in the draws done; no repeated id).
5. Full-box popup, /user/stone error: not tested.
6. Analytics call of the client: no visible effect with payType 1.
7. Server rejection («200 ERROR :76»): not tested on the bench (covered by `test-gacha-server.js`).

<a id="sp2"></a>
## Sub-project 2: list of the original banners (17-10-2026)

Spec: [shop-banner-design](../superpowers/specs/2026-10-16-shop-banner-design.md) section 9 (binding); plan:
`docs/superpowers/plans/2026-10-16-shop-banner-originali.md`. Research and support scripts outside the repo in
`D:\Progetto_Restauro_KH_UX\tmp\sp2`.

### Generated catalogue

`server/game_data/gacha_catalog.json` (2.7 MB, outside the repo) written by `recon/tools/make_banner_catalog.py` from the sources
(wiki table, notices, `recon/tools/banner_overrides.tsv` with the source of every number): `version`, `firstRarity`
(first date of each rarity: 6★ since 15/07/2016, 7★ since 25/05/2018), `story` (quest tranches with their date), `subsets`,
`medals` (by name: `ids` [id, rarity, date], `std`, `alias`, `origin`, `att`) and 808 `banners`: `rowId` B0001-B0808,
`drawMedalTypeId`, `name`, `type`, `start`/`end`, `unlockQuest` (first quest of the tranche running at the start of the
banner - 1, user's decision of 17-10; 85 unlocked by quest 525), `payType`/`currency`, `prices`
(steps), `lotCount`, `rarityMix`, `dayLimit`, `totalLimit`, `vipFree`, `pool` (`mode` sets/inherit/released/list/
evolve, `filter`), `guarantee` (list, count, slot, pity, every), `skill`, `bonus`, `catalogOnly`. **Drawable only with
`catalogOnly === null`** (never look at `flags`, which can keep INCOMPLETE on rows completed by the overrides).

Fields added during sub-project 2 (beyond the plan):

- `medals[n].std`: `true` only for the standard medals of the `released`/`inherit` pools (wiki entry, not an alias, not
  SN/Supernova/SN+/SN++/Prime, cls '', SR, L-SR or L, class2 Attack, '', Rare or Super Rare); every medalId in only one
  std entry. In the released/inherit pools the server takes the std ones released by the date.
- `medals[n].alias`: entry added from `medal.json` to resolve a showcase or guarantee name (SN+/SN++, Key Art,
  wiki redirects); always `std: false`, usable only by name (showcase, lists, `pool.names`, sets).
- `medals[n].origin` (`disney`, `ffkh`, '') and `medals[n].att` (`power`, `speed`, `magic`): for the set filters.
- `pool.filter` (list, `[]` if none; `disney`, `ffkh`, `power`, `speed`, `magic`): the medals of the sub-sets enter
  only if `origin` or `att` is in the filter; showcase and lists always enter (B0005, B0006, B0012-B0014, B0026).
- `dayLimit`: also 5 or 10 (the written number); 1 for every free one (FREE or price always 0) with no other limits.
- `totalLimit` (integer, 0 = none): draws in total, counted on `player.gacha.count`; 1 for «Available once»
  (15 banners: B0510, B0511, B0525, B0542, B0550, B0555, B0562, B0564, B0569, B0572, B0576, B0589, B0592, B0594, B0604).
- `guarantee.slot` (default 0): index in `slotRarities` of the first list slot (the other `count - 1` follow); 1 on
  B0306-B0308 and B0355, where the 7★ slot belongs to a star guarantee with Tier and the list is on the 6★ slot.
- `skill` `{"table": "72415", "slots": "all"}` on the SN/SEVEN banners since 17/12/2020 (date of notice 72415).
- Organization XIII (plan 2026-10-18-orgxiii-mapping, Task 3): the master names «Axel», «Roxas», «Vexen» (rows of
  «X A») have no entry of their own nor an alias to SN++ and resolve to «X A» until the family variant has
  been released (sub-set 6.2, B0064, B0083); the 7★ of the «X [+]» entries never before `firstRarity[7]`; field `medal_date` of
  `banner_overrides.tsv` (value = name, date = start of the row's banner): SN++ - Axel B and SN++ - Roxas on
  01/01/2021 (B0774, notice 72833).
- `catalogOnly`: VIP_TWIN, INCOMPLETE, DRAW_POINTS, PVP_TICKETS from the generator; `NO_MEDALS` is set by the server
  (`sanitizeBanners` in `server.js`) on banners with a slot without medals (B0370/B0418 Blue Fairy Deal, I-142).

As of 17-10: types SN 213, FEATURED 168, FALLING 129, SKILL 69, DAILY 64, SEVEN 48, FREE 36, STANDARD 23, T_TICKET 21,
ITEM 20, T_POINTS 7, BEGINNER 5, T_EVOLVE 5; `catalogOnly` VIP_TWIN 39, INCOMPLETE 24 (I-139), DRAW_POINTS 7,
PVP_TICKETS 4, plus NO_MEDALS 2 set by the server (B0370/B0418 Blue Fairy Deal, I-142). 17 Free Deal VIP; 15 banners
with `totalLimit` 1; 4 with `guarantee.slot` 1.

### Commands, in order

```powershell
python recon/tools/make_banner_catalog.py              # gacha_catalog.json
python recon/tools/make_banner_images.py --mode palette # 808 images 640x140 in server/game_data/gacha_img (31.5 MB)
node server/make-banners.js                            # master drawMedalType.json (809 rows) -> raise the revision
.\tools\ldplayer\session\relogin.ps1 -Tag x            # revision 120 (scripts' default since the final fix)
```

**Images: «palette» decision** (Task 1, bench): 256-colour PNG quantized in RGBA (mode P with tRNS), corners
transparent like the original; 43 KB instead of 161 KB, no crash. With `convert('RGB')` the corners turn green.

**Image cache in the client**: the client keeps every banner image in
`/data/data/com.square_enix.android_googleplay.khuxww/cache/MM_...` (one file per URL, PNG + ~100-140 bytes): a PNG
changed on the server is not seen as long as that file remains. Before testing new images:

```powershell
. .\tools\ldplayer\bench_lib.ps1; Sh "rm /data/data/com.square_enix.android_googleplay.khuxww/cache/MM_*"
```

then relogin (or leave and re-enter the Shop: the client downloads the missing files again).

### Provisional list and rules (until sub-project 3)

- `shopBanners` (`server/gacha.js`): drawable banners (payType 1/7/8, `lotCount` in `KHUX_GACHA_SIZES`) unlocked
  (`unlockQuest` <= last quest cleared) and active at the date of the player's tranche, plus those of
  `KHUX_GACHA_SHOW`; at most 8, the most recent first; never two payType 8 currencies together. Catalog plate always
  first (9001, payType 6).
- Prices (9.4): never 0 (free = 1 Jewel); FIRST_FREE and FALLING from the player's counter (`player.gacha.count`).
- Currencies (9.6-9.7): jewels = payType 1; Platinum = payType 7 (`limitedDrawTicket1`); payType 8 = seasonal currencies in
  `player.drawTickets` (draw, holiday, spooky, moogle); payType 4/5/6/9 only in the catalogue.
- Limits: `dayLimit` per banner, `totalLimit` overall (rejection «limite totale raggiunto», without charge), only one
  free Free Deal VIP per day across all of them (`player.gacha.used.vipFree`). The plate has `isDayLimited` 1 with any
  of the three and `userLimitedCount` = draws left (the lower of day and total).
- Pity and guarantees (9.2): list slots and showcase first choose the medal by name, then the variant at the slot's
  star; `every` = every N draws.
- Rarities and medals only if released by the banner's reference date (9.3).
- Abilities (skills) from the original tables, bonuses in the Presents.
- Notices: «Banners unlock as you progress through the Story; in the original game they followed the calendar.»
  (Shop) and the new lines of the «Differences» (Free Deal at 1 Jewel, VIP Free Deal for everyone, seasonal currencies,
  bonuses in the Presents).

### Bench tests (Task 9, 17-10, resources 40, revision 119, quest 132)

Save copy: `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-sp2-t9` (and `save-backup-before-sp2` from
Task 1). `MM_*` cache deleted before the tests. Screenshots in `D:\Progetto_Restauro_KH_UX\screenshots`.

- Master: `GET /master/drawMedalType` at login, revision 11900051, home reached (`sp2t9_home`).
- **Notices (test 8, part)**: `sp2_notice_shop` (new Shop text), `sp2_notice_diff`, `sp2_notice_diff2`
  (new lines of the differences). OK.
- The first Shop test failed on I-138 (plates without `sortId`, «200 ERROR :75», `sp2_t9_shop1`); fixed with
  commit 264a8a6: the client sorts the plates by the list's `sortId` (ascending, then drawMedalTypeId; it does not read the
  master's one) and `gachaListData` sends Catalog 1, then 10, 20, ... in the order of `shopBanners`. Details in
  [ISSUES](../ISSUES.md) I-138.

#### Resumption after I-138 (17-10, commit 264a8a6, revision 119, `MM_*` cache emptied)

1. **Shop at quest 132**: OK. Catalog + DAILY DEAL! (grey, already used today), Daily Deal!, Get a 3★-5★ Medal!,
   Get at least one 5★ Medal! (B0001-B0004), images downloaded again (`GET /web/gacha/img/9001..10004`) and correct
   (`sp2r_shop1`, `sp2r_shop1_scroll2`).
2. **Catalogue**: `sp2r_catalog1`, fast scrolling of the whole list back and forth without freezes or crashes
   (`sp2r_catalog_scroll1-5`); states seen: «In the Shop now», «Unlocks after Story Quest 805/815 — coming with a
   future update», «Medals not available yet — coming with a future update» (Blue Fairy Deal, `sp2r_catalog_bluefairy`).
   Details: Tier 6-7 Deal 2018 locked (`sp2r_detail_a`..`a3`), Platinum Ticket Draw 2019 locked with Dual Meow
   Wow LV7 45% / LV8 45% / LV9 10% (`sp2r_detail_plat`), Skills to Thrill SKILL (`sp2r_detail_skill`, `..3`: slots,
   ability table on the first slot, medals by rarity). VIP_TWIN not seen on screen.
3. **DAILY DEAL! x3** (B0001): confirmation 600 = plate (`sp2r3_confirm`), result Selphie 4★, KH II King Mickey 3★,
   KH II Leon 3★ (`sp2r3_anim5`), all from 07/04/2016 (tranche date 2016-04-07); jewels 20000 -> 19400, plate
   then grey (`sp2r3_back`).
4. **7★ Medal Deal x10** (`-GachaShow B0306,B0008`, mandatory test): confirmation 3000 (`sp2r4_confirm`), animation and
   result without crash (`sp2r4_anim1-8`): The World Ends with You Art 2 7★ (14/05/2018), Saix 6★ and eight 5★, all
   released by 25/05/2018; jewels 19400 -> 16400 (`sp2r4_back`).
5. **Platinum Ticket Draw** (`-GachaShow B0456,B0116,B0713,B0727`, `limitedDrawTicket1 = 2` with the server stopped): confirmation
   «Use 1 Platinum Ticket» (`sp2r5_confirm`), 5 Dual Meow Wow LV7/LV8 with NEW (`sp2r5_anim7`); the box goes from 2119 to
   2121 slots (one cell per level, stacked); second draw (`sp2r5_confirm2`, `sp2r5_result2`: LV7, LV9,
   LV8) without crash and without extra slots (2131 before and after: the cells grow), tickets 2 -> 0 (`sp2r5_back2`).
6. **Falling Price Deal x10** (B0116, 3000/2500/2200/2000/1900): confirmation 3000 (`sp2r6_confirm`), 10 5-6★ medals
   from 2016 (`sp2r6_result`), then the plate shows **2500** (`sp2r6_back`).
7. **Free Deal VIP** (B0713 and B0727): confirmation «Spend 1 Jewel to get 10 Medals» (`sp2r7_confirm`), result with SN++
   KH III Kairi 7★ and nine 5★ (`sp2r7_anim8`), jewels -1; then **both grey** (`sp2r7_back`, `sp2r7_back2`). The
   return on the next day was not tested on the bench (covered by `test-gacha.js`).
8. **Ten Shop openings** (MENU > Home > Shop, `sp2r8_shop1-10`): one `GET /gacha/list` per round, no crash.
   **Notices**: new lines (Epic Medals, Blue Fairy Deal, unlocking with the story) in `sp2r_notices`, `sp2r_notice_diff`.

**Plate order** (with `-GachaShow`): 7★ Medal Deal (2018) above Skills to Thrill (29/04/2016) above DAILY
DEAL! (`sp2r4_shop`, `sp2r4_shop_s1`); Free Deal VIP 2020-10 and 2020-09 above Platinum 2019, Falling 2017 and DAILY
DEAL! (`sp2r5_shop`, `sp2r7_back2`): the most recent at the top.

Restore: `freeStone` 360 and `limitedDrawTicket1` 0 as in the backup `save-backup-before-sp2-t9` (20000 jewels and 2
tickets given for the tests). The 43 drawn medals and `player.gacha` remain in the save (today's counters: DAILY
DEAL!, Free Deal VIP, Falling at 2500). Then normal relogin (revision 119, without `-GachaShow`, `sp2r_end_shop`).

<a id="correzione-finale"></a>
### Final fix (17-10, commit b9e23cc, revision 120; tested on the bench on 17-10)

- **A. Showcase and list of the debut banner.** The date of each variant (`rare_date` of `banner_sources.medal_release`)
  is interpolated from the NA number and fell 3-11 days after the start of the banner that had introduced the medal: in 15
  banners (B0054, B0068, B0084, B0086, B0089, B0106, B0176, B0184, B0199-B0203, B0230, B0246) showcase or list were
  empty at their date and the pity silently switched off. `align_debut_dates` (`make_banner_catalog.py`): for every name
  in `pool.featured`/`guarantee.list` of a drawable banner starting on day S, if the medal was released by S
  (or S is the first drawable banner naming it: B0199-B0203, medals dated 24/11, banner of 17/11), the variants
  dated after S take S, only at the stars of the mix already released and at the star above if already released (22 variants). The
  other medals do not change; no 6★ before 15/07/2016 nor 7★ before 25/05/2018. Showcases still empty, by
  reason (listed in the test): star outside the mix (B0023, B0029: 6★ before 15/07/2016; B0280 Vexen [+], B0303
  Lexaeus [+]: only 7★ before 25/05/2018; SN++ only 7★ on the [[5,10]] banners B0663, B0732, B0746, B0759, B0787, B0801)
  and names without attack variants (Cid, Chip, Moogle, Blue Fairy, Magic Mirror...).
- **B. Free ones without a limit** (Ruling 28): `totalLimit` 1 for «Available once» (the only wording in the notes; «can
  only be drawn once» is accepted but does not appear), `dayLimit` 1 for the free ones that had no limits (B0220, B0274,
  B0417, B0437, B0497, B0521 and the five «[WJE] Monday Only Free Deal!»). `limitText`: «once», «N times in total».
- **C. List in the right slot**: `guarantee.slot` = index of the first slot of the next star of the mix when the
  text, before the list, guarantees an explicit star that is not a list (B0306-B0308, B0355: slot 1, the 6★).
  `rollDraw` and `slotOdds` use the slots from `slot` to `slot + count - 1`; the pity stays on slot 0. The Tier limit
  of the 7★ slot is not applied (sub-project 2b, [guarantees](#garanzie)).
- **D.** If `guarantee.list` is not empty but `listNames` is, or there is a pity and `featuredNames` is empty, details and
  Draw Odds add «This guarantee is not reproduced yet.».
- **E. Notices** (Differences): Tier limits not applied; Traits, boosted, reinforced Special Attacks and maxed skills
  replaced by a normal medal of the same rarity; the free ones «once» or «one per day» keep the
  limit.
- Master: 23 comments changed (the new limits in the strip) -> BASE 120 in the session scripts.

**Bench tests (17-10, revision 120, no crash).** Save copy in
`D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-sp2-final`; with the server stopped `freeStone` 360 -> 20000, at the end
brought back to 360 from the copy (`limitedDrawTicket1` 0, unchanged). The first relogin with 120 downloaded the masters
(`GET /master/drawMedalType`) without crash. Screenshots in `D:\Progetto_Restauro_KH_UX\screenshots\`:

| Test | Outcome | Screenshot |
|---|---|---|
| 1 B0306 x10 (`-GachaShow B0306`) | OK: Details with the list on «Medal 2» (6★ 97%, 7★ 3%), Medal 1 7★ 100%; `[gacha]` log: slot 0 SP Roxas 7★, slot 1 **HD Zexion 6★** (from the list), eight 5★; stars counted in the result: 7, 6 and eight 5s; jewels -3000 | sp2f_f1_details, sp2f_f1_details2, sp2f_f1_confirm, sp2f_f1_anim2, sp2f_f1_back |
| 2 B0054 Epic Medal Carnival 2016 | OK: «Featured Medal guaranteed within 10 draws (original).» without «not reproduced» (showcase = Illustrated Sephiroth); x10 without crash (three 5★, seven 4★) | sp2f_f2_shop, sp2f_f2_details..3, sp2f_f2_result2 |
| 3 B0604 and B0511 free «Available once» | OK: plates at 1 Jewel with «Chances left today: 1» (the client writes «today» for `totalLimit` too); after the draw grey plate, strip «... - once», a second tap sends no requests and does not change the jewels. B0604: slot 0 Supernova - KH III Zeus 7★ (from the list) | sp2f_f3_shop, sp2f_f3_result, sp2f_f3_back, sp2f_f3_tap2, sp2f_f3b_confirm, sp2f_f3b_result, sp2f_f3b_tap2 |
| 4 «not reproduced» + Notices | OK: B0663 Ticket Draw x10 «Featured Medal guaranteed within 3 draws (original). This guarantee is not reproduced yet.»; Differences with the three new lines (Tier, Trait/boosted/SA/skill, free once) | sp2f_f4_details2, sp2f_notice_diff2, sp2f_notice_diff3 |

- After fix A no drawable banner has `guarantee.list` with an empty `listNames` at its date any more: the
  sentence appears only for the pity with an empty showcase (25 banners, e.g. B0663, B0023, B0280, the Ticket/Cookies Deals).
- The 40 drawn medals and the `player.gacha.count` counters remain in the save (10511 and 10604 at 1: with
  `-GachaShow` those plates stay grey).
- Final state: normal server rev 120 without `-GachaShow`, home reached (`sp2f_end_home2`). Doubts in I-145.

<a id="garanzie"></a>
## Banner guarantees: audit and slot-by-slot model (sub-project 2b, I-144)

Read-only audit of 17-10 (scripts and intermediate data in `D:\Progetto_Restauro_KH_UX\tmp\gaudit\`): 734 drawable
banners, 701 with a guarantee or a showcase. Today's server puts `guarantee.list` in `count` slots from
`guarantee.slot` (usually 0, the highest star), chooses by name and then the variant at the slot's star; the pity
replaces slot 0 with the whole showcase; Tier, Trait, reinforced Special Attack, boosted and skill are not read.

Patterns of the original (from the banners' texts and images) and comparison with the server:

- **they match**: showcase only without guarantee (97 banners); list on the highest star with enough slots (213);
  pity on the showcase at slot 0 (251 of the 386 with pity); «every N draws» already coded (B0742, B0765);
- **171 banners with reproducible discrepancies, in 12 classes** (a banner can be in several classes): D1 list on the
  wrong star (4, fixed with `guarantee.slot`); D2 list plus one named medal on the same star (2: B0241,
  B0354); D3 two lists in the same banner (3: B0629, B0740, B0750); D4 number of list slots different
  from the image (1: B0678); D5 list in the text but not in the catalogue (9: B0049, B0055, B0372, B0695, B0721, B0725, B0726,
  B0734, B0739); D6 list empty at the date (2: B0230, B0246, fixed in A); D7 single named medal not coded
  (42); D8 pity switched off (37: 14 because of the dates, fixed in A except B0280/B0303, 8 for a star outside the mix, 15 with a
  target that is not an attack medal); D9 pity at a star different from slot 0 (11); D10 pity on a
  subset of the showcase (28); D11 pity stealing a list slot (29); D13 official notices «every N-th
  draw» rendered as pity (31);
- **178 banners with a Tier limit** (D12), reproducible: `medal.json.guiltValue` is the Tier (verified on the 24
  7★ medals of the B0306 reserve, all Tier 4);
- **boosted (40), to be studied**: «with 1000 more base strength and defense». User's correction (17-10): the +1000
  was **on top of** the enhancement with Chip/Dale, which remained fully available. So it is NOT the medal at the cap of
  `attackUpperNumber`/`defenseUpperNumber` (cap `addMaxAttack`/`addMaxDefense` of the master, `server/medal-guilt.js`):
  another way is needed to raise the base by +1000 while leaving Chip/Dale free (a field of the player's medal to
  look for in the decompiled code, or distinct medals in the master: to verify). The probability is also missing («small
  chance» in the notes);
- **maxed skill (62), partly reproducible** (user's decision of 17-10): ability of the list created at
  `level = maxLv` of `skill.json` instead of 1; it applies only to the abilities present in the master, which today has 12
  of them (the others: I-146);
- **not reproducible**: Trait Medal (89), reinforced Special Attack (104), Imitation (3), Epic and 2016 sets (17 +
  17): written in the Notices.

Proposed fields (backward compatible: `guarantee.list/count/slot` remain the first list reserve):

- `guarantee.slots[]`: reserves in the order of the text, `{kind: list|tier|trait, slot, count, star, names, tierMin,
  tierMax}` (`trait` = reserved slot that the server treats as generic);
- `pityNames` (default `pool.featured`), `pityStar`, `pitySlot`, `pityMode` (`reset` as today or `every`);
- Tier as the fourth field of `medals[n].ids` (`[id, rarity, date, tier]`) from `guiltValue`;
- slots assigned deterministically: the reserves with a star take the first free slots of that star, the others
  the first free ones from the top; manual override for the cases seen only in the images (B0678, B0740, B0733, the D5s).

Open questions for the user (before the 2b spec): (1) 6★ slot of the «KH III Medal+» lists with SN/SN+ that exist
only at 7★ (about 100 banners of 2019-20): leave the 7★ or limit to the names with a 6★ variant; (2) B0733: split the
list in two (3 SN+/SN++ and 7 KH III) as in the image; (3) the 31 D13 banners: «every N-th» like the notices or pity like
the wiki; (4) B0419/B0421 (Gula/Aced swap declared as an error by the notice): reproduce the error or the corrected
version; (5) B0319, B0402, B0403, B0412 (pity at 6★ with slot 0 at 7★): which slot the pity replaces.

User's decisions already taken for 2b (17-10): boosted medals reproduced as above; start date of
B0199-B0203 (deal of the HD [EX], November 2017) corrected to **24/11/2017** with an override from the notice, instead of the
widened rule of `align_debut_dates` («first drawable banner naming them»).

The full audit report (tables per pattern, draw rules, expected outcomes) is outside the repo:
`D:\Progetto_Restauro_KH_UX\tmp\sp2\audit-guarantees.md`.


<a id="sp2b"></a>
## Sub-project 2b «Guarantees» (17-10, I-144 closed)

Spec [2026-10-17-shop-garanzie-2b-design.md](../superpowers/specs/2026-10-17-shop-garanzie-2b-design.md), plan
[2026-10-17-shop-garanzie-2b.md](../superpowers/plans/2026-10-17-shop-garanzie-2b.md) (10 tasks, commits cf1030b..fe280d8, fixes from the final review and decision 13-bis included).

**Catalogue contract v3** (`server/game_data/gacha_catalog.json`, `version` 3; details in the plan):
`medals[n].ids[i] = [id, star, date, Tier]` (Tier = `medal.json.guiltValue`); `guarantee.slots[]` = reserves
`{kind: list|tier|trait, slot, count, star, names, tierMin, tierMax}`; `pityNames`, `pityStar`, `pitySlot`,
`pityGift` (`[3, medalId, 1]` for support medals: it goes into the Present Box), `pityLabel` (category of the strip
beyond the client's limit, I-153: [#i153](#i153)), `erratum`, `source`;
`enhance.preset` (`dots`, `guilt: 'max'`), `enhance.boosted` (`str`/`def`, `chance: small` = 5% reconstructed per eligible
slot, `guaranteed`), `enhance.maxSkill`, `enhance.notReproduced`. `guarantee.list/count/slot` remain (first
list reserve) for compatibility.

**Commands, in order** (master -> new revision; full resources only with the bench stopped). Order verified
by reading the scripts (final review, I2): the catalogue reads the master's `medal.json`/`material.json`/`skill.json`; the
images read the catalogue; `make-game-tables.js` rewrites `medal.json` and at the end calls `make-boosted-medals.js`
and `make-nova-rows.js`, which read the catalogue; `make-banners.js` reads catalogue and master.

```powershell
python recon/tools/make_banner_catalog.py                    # server/game_data/gacha_catalog.json
python recon/tools/make_banner_images.py --mode palette      # server/game_data/gacha_img/<id>.png
$env:KHUX_MEDALS_ALL='1'; $env:KHUX_WORLDTOUR='1'; node server\make-game-tables.js D:\Progetto_Restauro_KH_UX\wiki\medals.json   # boosted and Nova at the end
Remove-Item Env:KHUX_MEDALS_ALL, Env:KHUX_WORLDTOUR          # do not leave them in the PowerShell session
node server/make-banners.js                                  # drawMedalType: strip, validComment, warrant
.\tools\ldplayer\session\relogin.ps1 -Tag x -Revision <BASE+1>   # today BASE 123 -> 124, also in the 4 session scripts
```

Only if the client's LWFs or images change: `build-resources.ps1 -Version <N+1>` with the bench stopped (current installed version in
[HANDOFF](../../HANDOFF.md#restarting)), then `update-resources.ps1 -Revision <BASE>`.

Variables of `make-game-tables.js` (read in the script, lines 148-215 and 616-690): `KHUX_MEDALS_ALL=1` (without it: 522
normal medals instead of 2,107, 3,233 rows with the boosted ones; with them the boosted and Nova rows disappear); `KHUX_WORLDTOUR=1` (rows 991001-991008 of the world
tours: without it, `stage.json` loses them, because the script redoes it every time from `stage_base.json`); `KHUX_STORY_MAX`
(default 525, the one in use: thethiny's rows; quests 526-979 are added by `make-story-oltre.js` in the same run). `KHUX_TOURS_V2=1` must **not** be set to rebuild the master in use: it adds 57
992xxx rows of the v2 tours (`stage.json` from 535 to 592 rows), which are set aside, only for tests of the original components
(user's decision, journal fino-al-2026-10-16): the command with `KHUX_TOURS_V2` in
[mappe_storia.md#tour-v2](mappe_storia.md#tour-v2) is the test one; guilt.md uses the same two variables as here. No `KHUX_ZOO` (0 rows 99000x in the master in use).

After `make-game-tables.js` no fix-up script is needed:
- `stage.json`: written only by `make-game-tables.js` (from `stage_base.json`, thethiny's story quests, tours
  from the variables above); no other script touches it. `import_orig_stages.py` and `make_quest_thumbs.py` work
  on the resources (`stage_gen`), not on the master;
- the master's `keyblade_levels.json` is only the copy of `server/tables/keyblade_levels.json` (the script copies
  the whole `server/tables`): it is not a client table and the server does not serve it (`masterBody` accepts only names
  `[A-Za-z0-9]`). The real keyblade tables (`keyblade`, `keybladeSubslot` from `make-keyblade-levels.js`;
  `passive`, `passiveSetting` from `make-passives.js`) are not touched by `make-game-tables.js`;
- `mission.json` copied from `server/tables` is already identical to the master (`make-limited-missions.js` writes both).

Test (17-10, final fix): `make-game-tables.js` with `KHUX_MEDALS_ALL=1 KHUX_WORLDTOUR=1` on a copy of the master
(`D:\Progetto_Restauro_KH_UX\tmp\master_fix_i2`): all files byte-for-byte identical to the master in use, except
`keyblade_levels.json` (inert copy, the master's one was from 11-10). With `KHUX_TOURS_V2=1` as well
(`tmp\master_fix_i2b`): `stage.json` +57 rows. The real master was not rewritten.

Shorter route, if only the banner catalogue changes: on the master in use `node server/make-boosted-medals.js`
and `node server/make-nova-rows.js` and `node server/make-trait-groups.js` are enough (idempotent; the third gives the trait group to the new boosted ones), then `make-banners.js` and the new revision. If instead
`make-game-tables.js` changes the normal rows (new medals or Tiers), rerun it after `make_banner_catalog.py`
(Tier = the master's `guiltValue`), then the two patchers and `make-banners.js`.

**Rules** (server/gacha.js, gacha-data.js, medal-boost.js):

- slots: the `tier` reserves filter by Tier (`tierMin..tierMax`, alternative names allowed), the `list` ones draw by
  name at the slot's star, the `trait` ones are generic slots; empty pool -> no filter with a log, never an exception;
  never a medal before its date;
- pity: after `pity` draws without the target, slot `pitySlot` becomes the target at `pityStar` (the highest
  variant already released at the date, otherwise the lowest above); `pityGift` puts it into the Present Box without
  touching the slots (Dual Meow Wow 301684, Blue Fairy 301502);
- yellow strip: `validComment 0` + `warrantMedalIds` (names from the medal table) -> «<nome> guaranteed in N
  tries!» / «1 try!»; with no target at the date the counter is 0 and the strip disappears (16 dates);
  `WARRANT_XML_SAFE` stays `false` (U3); one id per name and, beyond 900 bytes of names, `validComment` 1 with the
  category text (I-153, [#i153](#i153));
- boosted: the master's boosted row instead of the normal one (its own cell), `chance small` 5% per eligible slot;
  the Tier-family ones (+1000/+1000) are reconstructed (the sentence does not give the values), explained in the Notices;
- preset: dots up to `maxEnhanceCount`, guilt at the Tier's maximum (with `guilt: 'max'` the dots too); the preset's
  guilt counts for the Nova even before Power Bangle (probably like the original);
- 7★ of Tier 9-10 (decision 13-bis, original rule, at the notice dates): a Tier 9 7★ drawn from a banner
  dated from **2019-01-01** and a Tier 10 7★ from **2019-09-01**, from any banner, boosted included (Tier of the
  normal one via `groupId` if the boosted one does not have it), arrives with dots at `maxEnhanceCount` and guilt at the Tier's
  maximum (T9 28000, T10 32000). Draw date = the banner's `gacha-data.asOf`, the same as for the pool medals:
  the start of the banner, for the PERMANENT ones the story date limited to start-end. Dates and notices in a constant,
  `gacha-data.MAX_GUILT_FROM`. Before those dates the Tier 9-10 7★ arrive maxed only with the banner's preset.
  Sources: notice 48236 (01-01-2019, Birth by Sleep falling-price deals): the 7★ of Tier 9 come
  with the top bonus of 280%; notice 56838 (01-09-2019, Supernova+ Foreteller deals): the 7★ of Tier 10 come with
  the top bonus of 320%; research in `D:\Progetto_Restauro_KH_UX\tmp\sp2b\guilt-rule.md`. The 7★ of lower
  Tier stay maxed only with the banner's preset; preset and rule together: the maximum of the two
  (`respondGachaDraw` in server.js, test 13-bis in test-gacha-server.js). The Nova rises (+1/+5, `make-nova-rows.js` already has
  1/5 on all the 7★ with a Tier) and the popup appears. Original behaviour: no line in the Notices; in the
  Details, only where presets are listed on a banner with a 7★ slot and only from the rule's dates, the line «Any 7★
  Tier 9 Medal: ...» (from 2019-01-01) or «Any 7★ Tier 9-10 Medal: comes with its Special Attack Bonus maxed
  (original)» (from 2019-09-01), so that the preset on a single slot does not suggest the opposite;
- maxSkill: 80 drawable banners, 0 covered (skill.json has 12 abilities, none «... Max»): I-146 stays open.

**Bench tests (17-10, resources 41, master BASE 121, no game crash).** Copy of the reduced save in
`D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-2b`. Tests 1-6 and 8 were done on the full save
(`tmp\save-backup-before-nova-test`, `freeStone` raised to 100000). Test 3 was done on a copy of the
reduced one with added medals (`tmp\save-nova-fixture.json`, then 20 Magic Mirror, 5 Xaldin and munny). At the end of the tests the
reduced save was put back identical (hash). Banners: `-GachaShow B0306,B0629,B0076,B0651`. Screenshots in
`D:\Progetto_Restauro_KH_UX\screenshots\`:

| Test | Outcome | Screenshot |
|---|---|---|
| 1 B0306 x5 | OK: slot 0 7★ of Tier 3 (Owl, Hydra, Ice Titan, Alice), slot 1 from the 8 lists at 6★ (TWEWY Art 2, HD Larxene, Yuna & Rikku & Paine); strip «HD Axel guaranteed in 5 tries!» -> 4, 3, 2, «1 try!»; on the fifth HD Axel 7★ Tier 4 on slot 0 (log `pity`), then 5 again | 2b_t1_strip5a, 2b_t1_d1_result, 2b_t1_back1, 2b_t1_back2, 2b_t1_d3_back, 2b_t1_d4_back, 2b_t1_d5_result, 2b_t1_d5_back |
| 2 B0629 x2 | OK: 1 New Enemy 7★ (SN++ Rock Troll, SN+ Flood) + 3 KH III 6★ in every draw; strip from 10 to 9 after the target | 2b_t2_d1_result, 2b_t2_d2_result, 2b_t4_back |
| 3 Nova (Level Up) | OK after bad55f1 (draw: see fix 1 below): popup «NOVA LEVEL UP!» with NOVA logo, «LV 12 » LV 13», box «Unlocked Xaldin's Special Attack Bonus!» (U4: the +1 shows the box) and TAP SCREEN; +5 with «Maxed out Iago's Special Attack Bonus!». Before the fix «LV 6 » LV 1» and «LV 7 » LV 5» (the field is the arrival level). Not testable from a draw: I-148, I-149 | 2b_t3_a_6, 2b_t3d_max_5, 2b_t3f_5 |
| 4 B0076 (U3) | OK: «Illustrated Sora & Pals guaranteed in 5 tries!» readable, no change | 2b_t4_strip1..8 |
| 5 B0651 boosted | OK: BOOSTED band on all 10, detail with yellow STR/DEF/Cost, Cost 36, No. of the normal one (1743), red LV tag in Medal List and Level Up (like `reference\shop_boosted`) | 2b_t5_d1_result, 2b_t5_detail, 2b_t5_list, 2b_t5_listdetail |
| 6 maxed abilities | not testable: no drawable banner covered (I-146) | - |
| 8 Shop/Notices x10 | OK: 10 `GET /gacha/list`, no crash; Notices with the new lines (boosted 5%, maxed abilities, +1000, gifts in the Present Box) | 2b_t8_shop1..10, 2b_t8_notices1..10, 2b_t8_diff1..3 |

**Uncertainties U1-U7**:

- **U1** (`minCost` of the boosted = normal - 10): confirmed. Cid on the boosted Aqua: cost -5 (log `costo -5`),
  yellow Cost (2b_t5_u1_cid1, 2b_t5_u1_result). No change.
- **U2** (`groupId` and Level Up): the normal one is a «dot» material for the boosted one. Preview with a yellow dot
  and LV 1 -> 42; result dots 0 -> 1, LV 51 (client's Great Success, EXP x1.5); no crash
  (2b_t5_u2_preview, 2b_t5_u2_anim2). No change.
- **U3** («&» in the strip): readable, `WARRANT_XML_SAFE` stays off; the master does not change for U3 (revision
  122 comes later, from fix 1, for the Nova rows).
- **U4** (box of the +1): the +1 shows the «Unlocked ...» box, the +5 «Maxed out ...» (2b_t3f_5, 2b_t3d_max_5).
  The arrival number was wrong: fixed in `guilt-burst.js gained()` (commit bad55f1, no master change).
- **U5** (`displayId` 1 for the boosted ones without a badge): Iago boosted (displayId 1) shown without crash in Medal List,
  Level Up and detail; the SN+ (displayId 201) with the right badge.
- **U6** (medalId >= 1,000,000): Medal List, detail (the second page too, 2b_t6_down), Level Up and Evolve
  opened without crash (2b_t6_evolve).
- **U7** (Nova per group): Iago boosted guilted after the normal one: +80% without popup (2b_t7_b_*), record
  `first: [31056, 300930]` without new entries. The boosted one's maximum guilt gave the +5 (a maximum not yet
  recorded for the group), as expected from the key `groupId || medalId`.

**Postponed** (notes here; the real defects are in ISSUES):

- I-146 (maxSkill), I-150 (broken names in the catalogue), I-151 (lists rising to 7★, pity without a target at `pityStar` in 161 banners);
- 16 banner dates with the pity without a target: strip hidden;
- glow of the NOVA logo of 8 px versus the ~16-20 of the JP (Task 9, cosmetic only);
- during the U2 test on the full save, «Unequip» from the detail of a medal in a keyblade sub-slot
  opened «Remove all following Medals?» with an empty list: cancelled, to look at if it happens again.

### Fix 1 of Task 10: Nova from a draw (I-148, I-149; commit 2bf8b4b, master BASE 122)

- **B0306-B0308 with maxed guilt**: B0310 «Get a 7★ Medal in each Draw!» (INCOMPLETE, stays in the catalogue) is
  the announcement of the three 7★ Medal Deals (HD Axel, Illustrated Aqua A, Illustrated Ventus): the notice
  promises that the 7★ Medal drawn has its Special Attack unlocked and its Special Attack Bonus at the maximum. Before the fix the three
  deals had an empty `enhance.preset`. New field `preset` in `recon/tools/banner_overrides.tsv` (`slots=0;dots=max;
  guilt=max`, with the source), applied by `make_banner_catalog.apply_enhance_overrides`. It is the original
  behaviour (Details: «comes with its Special Attack Bonus maxed (original)»), no line in the Notices. They are no
  longer the only ones: since decision 13-bis the drawn Tier 9 (banners from 2019-01-01) and Tier 10 (from 2019-09-01) 7★
  arrive maxed from any banner (rule above, in the Rules); the preset of B0306-B0308 (2018) remains
  for their Tier 1-4 7★.
- **Popup levels after a draw**: with `guiltBurstFirst/MaxUserMedalIds` the client computes the levels from the
  medal rows of the listed copies (start = `userPoint.guiltBurstLv` - `addGuiltBurstLv` of the first ones -
  `addGuiltBurstLvMax` of the max ones, then added back at each step).
  With 0 in the master the popup showed the same level twice. `server/make-nova-rows.js` (at the end of
  `make-game-tables.js`, idempotent, `test-nova-rows.js`) puts 1/5 only on the attack rows with a Tier that a preset
  «guilt: max» can deliver and on their boosted ones: today 1669 rows, i.e. **all** the attack 7★ with Tier > 0 and
  their boosted ones (slot 0 of B0306-B0308). It is a deliberate approximation, wider than slot 0 of B0306 (Tier <= 4):
  filtering by `tierMin`/`tierMax` would have required another master revision (controller's decision). The
  popup starts only when the server sends the lists, so normal draws do not show it (except the Tier
  9-10 7★ from the dates of decision 13-bis, which arrive maxed); other uses of the
  field in the client were not understood: that is why 1/5 was not put
  on all medals.
- **Bench (17-10, rev 122, full save)**: normal draw on B0629 -> no popup (2bf_n1_after1-4);
  B0306 -> slot 0 Aladdin 7★ (Tier 3) with 5 dots and guilt 10000 (the Tier's maximum) in the save, popup «NOVA
  LEVEL UP!» «LV 1923 » LV 1928» (record: 1908 first + 3 max x5 = 1923, +5) with «Maxed out Aladdin's Special
  Attack Bonus!» and TAP SCREEN, then the Shop again (2bf_p1_after1-8, 2bf_p1_dismiss2). No game crash.
- State left for the user's test: reduced save, `relogin.ps1 -Tag 2bf_end -Revision 122 -GachaShow
  B0306,B0307,B0308`, home.

<a id="banco-finale-2b"></a>
### Final 2b bench session (17-10 evening, resources 41 with `-Quick` for the sounds, revision 122, code fe280d8)

`build-resources.ps1 -Quick` (216 AKB from the JP, package 108,128,458 bytes), `relogin.ps1 -Tag 2b_bench -Revision 122
-GachaShow B0619,B0637,B0306`, reduced save.
- **Sounds (I-152, closed)**: the x10 draw animation, the Evolve and the Nova popup are audible (confirmed by the user by
  ear; Nova repeated on B0637: SN+ - Second Form Sora 7★ Tier 10 from the pity at the second draw).
- **Rule 13-bis**: 10 draws on B0619 «SN++ - KH III Terra-Xehanort» (2019-11-15); 9 without 7★, the tenth with
  the pity (`, pity` in the log) gives SN++ - KH III Terra-Xehanort 301927 (7★ Tier 10): detail with 5 dots,
  **+320%** and Tier 10 (b2b_tx_detail). After the OK two Nova popups as in the original video LFJ5ikVkIhk: «LV 36 » LV
  37» «Unlocked ... Special Attack Bonus!», on tap «LV 37 » LV 42» «Maxed out ... Special Attack Bonus!»
  (b2b_nova2-4). The strip of B0619 goes down to 9 after the first draw and back to 10 after the pity.
- **Evolve with guilt**: HD Axel 7★ Tier 4 at +130% (guilt 13000, level 100; 5 copies added by hand to the reduced
  test save, backup in `tmp\save-backup-before-evolve-test`) -> SN - HD Axel Tier 9: keeps +130%, Traits 2 -> 5,
  no Nova popup; the next draw on B0619 closes without a backlog popup (b2b_evo8c, b2b_post_ok1).
  The Evolve preview shows +280% (maximum of Tier 9): it is the client, not the server.
- **B0637, long yellow strip (M1): BROKEN**. The client writes «A  guaranteed in !» (no names, no
  number; tmp\strip_all.png); with few targets (B0619, 7★ Medal Deal) the strip is correct. Cause: 1024-byte
  buffer of the client's format, 12 banners involved: I-153.
- Stumbles: after killing the server to edit the save, the relogin stopped at the title with «Launcher3 non
  risponde» (Wait, then KHUX START by hand); the first tap on MENU after the Notices is lost (I-143).

<a id="i153"></a>
#### I-153: pity strip with long lists, «Category text» (17-10, commit 086ab8e, master BASE 123)

Analysis (static, WW client 4.3.1) in `D:\Progetto_Restauro_KH_UX\tmp\strip_b0637\report.md` (with `measure.js`). With
`validComment` 0 and several names the client joins the distinct names of `warrantMedalIds` into
«<important>nome</important>» with «, » and «, or » before the last one and formats
`A ${1:%s} guaranteed in <important>${2:%d :#try:#tries}</important>!` into a 1024-byte buffer, then wraps it in
`<xml>%s</xml>` into another 1024 bytes: limit **J <= 963 bytes**,
beyond 1021 names and number stay empty («A  guaranteed in !»). J = sum(23 + UTF-8 bytes of the name) + 2·(k-2) + 5 for
k >= 2 distinct names (one name: its bytes). With `validComment` != 0 the client only formats the master
`comment` (up to 2049 bytes) with userWarrantDisplayOfTime and **does not read** `warrantMedalIds` (the same branch that the
banners without pity have always used, with an empty list).

User's decision: «Category text». Rules (`server/gacha.js`, `server/make-banners.js`):

1. `warrantFields(..., nameOf)`: **one id per name** (name of the medal row of the served master, the first id in today's
   order, i.e. ascending `ex.pityIds`), as the client already does: the text does not change, the packet gets shorter.
   `gacha.warrantStripBytes(ids, nameOf)` = J, the same function for server and generator.
2. `make-banners.js`: J on the pool at the banner's date (`gd.asOf(b, '2099-12-31')`: the limited ones at their start, the
   PERMANENT ones at the end, the worst case because the pool grows over time; `stripBytesOf`). **J <= 900**
   (`WARRANT_LIST_MAX`): as before, list of names and `validComment` 0. **J > 900**: `validComment` 1,
   `warrantDisplayOfTime = warrantNumberOfTime = pity` and the comment
   `A <important>{categoria}</important> is guaranteed! Draws left: <important>%d</important>` (`categoryComment`):
   an sprintf with only `%d` (= `userWarrantDisplayOfTime`, the draws still missing) and without plural, so the
   number goes at the end. Banners over 900 without a category: «featured Medal» and a log line from the generator.
3. `guardWarrant`: `validComment` 0 and J > 963 (`WARRANT_HARD_MAX`, master not regenerated) -> strip hidden
   (`userWarrantDisplayOfTime` 0) and only the first id, one log line per banner; `validComment` 1 with pity -> only the
   first id (the strip and the count remain).
4. Categories: **one place only**, field `pity_label` of `recon/tools/banner_overrides.tsv` (like the `preset`, with the
   source), which `make_banner_catalog.apply_pity_label` copies into `guarantee.pityLabel` (None for the other banners).

| Banner | J (bytes) | Category | Source |
|---|---|---|---|
| B0637, B0638 | 3089, 3086 | SN or higher Medal | notice 62458 «a SN or higher Medal is guaranteed on the 3rd draw!» |
| B0646 | 3272 | SN or higher Medal | notice 63619 «SN or higher medal guaranteed every 3 draws!» |
| B0523, B0526 | 1215 | Medal that can be upgraded to Supernova+ | notice 53775 / 53777 «a Medal that can be upgraded to Supernova+» |
| B0545 | 1350 | Medal that can be upgraded to Supernova+ | notice 55231 «a Medal that can be upgraded into a Supernova+ Medal» |
| B0548 | 1215 | Tier 8 or Tier 9 Medal that can be upgraded to Supernova+ | notice 55474 (targets: Tier 8-9 7★) |
| B0788, B0792, B0797, B0803, B0807 | 1041-1139 | boosted SN++ Medal | **derived** from the pityNames (all SN++, boosted per the wiki's Guarantees): the notices only say «one of the following Medals every 3rd draw» |
| B0678 | 933 | SN or higher Medal | **derived** from the pityNames (SN, Supernova, SN+, SN++): no pity notice in the audit |
| B0771, B0778, B0781 | 943 | boosted SN++ Medal | **derived**, like B0788 |

The 12 banners broken on the bench (J > 963) plus 4 correct but above the 900 threshold (B0678, B0771, B0778, B0781): 16 master
rows changed, all the others identical. B0768 (899 bytes), B0619, B0306 keep the names.

Regeneration (17-10, offline, live server not touched): the chain of [#sp2b](#sp2b) run on copies in
`D:\Progetto_Restauro_KH_UX\tmp\i153\shadow\` (backup of the previous master and catalogue in `tmp\i153\backup\`):
`make_banner_catalog.py` (output into a copy) -> identical to the previous catalogue except `pityLabel`;
`make-game-tables.js` with `KHUX_MEDALS_ALL=1 KHUX_WORLDTOUR=1` (without `KHUX_TOURS_V2`) -> master identical except the
inert copy `keyblade_levels.json`; `make-banners.js` -> 16 rows of `drawMedalType.json`. Then copied into the repo
`drawMedalType.json`, `keyblade_levels.json` and `gacha_catalog.json` (no file in git). `make_banner_images.py` not
rerun: the images do not read `pityLabel`. Revision **BASE 123** in the 4 session scripts.

Notices > Shop: new line «When a guarantee covers too many Medals to name them all, the yellow line names the kind
of Medal from the banner's original notice instead (...). This wording is written by this restoration.»

Tests: `node server/test-warrant-strip.js` (J, one id per name, 900 threshold, guardWarrant, the master's 16 banners with
`validComment` 1 and the comment, B0619/B0306/B0768 with the names, B0637 with an old master hidden), all
`server/test-*.js` and `recon/tools/test_make_banner_catalog.py` green. Planned bench test:
`relogin.ps1 -Tag i153 -Revision 123 -GachaShow B0637,B0619,B0771`: B0637 with «A SN or higher Medal is guaranteed!
Draws left: 3», which goes down to 2 and 1 and back to 3 after the pity; B0619 still with «SN++ - KH III Terra-Xehanort
guaranteed in 10 tries!»; B0771 with the category «boosted SN++ Medal».

**Tested on the bench on 17-10** (master 123 downloaded at login, resources 41): B0771 «A boosted SN++ Medal is
guaranteed! Draws left: 3»; B0619 still with the name; B0637 «A SN or higher Medal is guaranteed! Draws left: 2» (one
draw already done), 1 after a draw, the second gives the pity (SN+ Sephiroth 7★ NEW) and the strip goes back to 3
(i153_s0, tmp i153_d.png, i153_f.png). The user checked the category: the pity covers only SN, Supernova,
SN+, Supernova+ and SN++ medals (67 names), so «SN or higher» is right. I-153 closed.

<a id="sp2c-g4"></a>
## Sub-project 2c, G4: historical Tiers of the 2016-17 banners (19-10, revision 130)

Analysis in `D:\Progetto_Restauro_KH_UX\tmp\sp2b\notice_audit\g4_historical_tiers.md` (written before I-160) and
`tmp\sp2b\g4\pools2.json` (redone on 19-10 on the master with Organization XIII Tier 3): for the 2017 banners today's
Tier matches the historical one, so the notice's range is enough. Fixes in `recon/tools/banner_overrides.tsv`,
new fields of `make_banner_catalog.py`:
- `slot` = `0:tier=5-6` (minimum and maximum Tier of the slot) or `0:names=a|b|c` (the slot becomes a list):
  B0120/B0139/B0141/B0146 Tier 4-5, B0170/B0181 Tier 5-6 (B0170 was T4+), B0154 the 17 «recent Tier 5» of notice
  31346, B0046/B0047 the 10 Organization XIII of notice 20865 (previously T3+, with SP Roxas/Axel/Xion Tier 4 that the
  notice excludes). B0158 (INCOMPLETE, without slot) excluded.
- `boosted` = `slots=0;str=1000;def=0;chance=small`: B0046/B0047 «even rarer version ... 1,000 more base strength».
- Mix of B0046/B0047: the one of the **original banner art** (6★ x2, 5★ x3, 3★+ x5 + Huey & Dewey & Louie;
  XIII 6★ x1, 5★ x1, 3★+ x3) = wiki: the 5 (2) Organization XIII are in the 6★ and 5★ positions. A first
  reconstruction «7x 6★» from the notice text alone was removed (user's decision after the screenshot).

**Original SE rares** (id + 100000, +1000 STR: 10 Organization XIII 6★ and 7 other 6★ such as SP Axel 141026): in the
1.1.3 client they have `groupId` = the normal one, `make-game-tables.js` zeroed it and the catalogue counted them as normal
variants, so they came out one time in two instead of the normal one. Now `make-boosted-medals.js` restores the `groupId`
(`medal-boost.origBoostedBase`), `boostedIndex` recognises them from the STR/DEF difference, the catalogue excludes them
(`ORIG_BOOSTED`) and the «slots» family of the boosted ones creates rows only at the slot's star (no invented 5★/7★
rares). Simulation: B0046 = 2 Org XIII 6★ + 3 Org XIII 5★ per draw, rare in ~5% of the draws, 0 Tier 4.
Bench 19-10 (rev 130): Big XIII draw = Larxene A and Marluxia A 6★, Xigbar A, Xaldin A, Luxord A 5★, 5x 3★.

<a id="sp2c-g5"></a>
## Sub-project 2c, G5: «one Medal from set X» (19-10, revision 131)

Notices 23113, 23538, 24587, 24593, 24843 («guaranteed at least one of the new Medals»): previously no slot. Field
`slot` new value `new@<pos>x<n>/<stella>:names=a|b` (list reserve added, `guarantee.slot` updated):
- B0066/B0068/B0084: new medal on the first 5★ position (pos 2; the two 6★ with 3 dots stay random, «one of
  which could be HD Sora if you're lucky»); the 6★-only featured one (HD Sora, Illustrated Xemnas, Key Art #1) does not enter
  the 5★ list (decision 1). Preset `replace;slots=0,1;dots=3`: the dots only on the two 6★ of the art, not
  on the 5★ promoted to 6★ (previously 2.3 dots per draw).
- B0079: Atlantica Sora/Donald/Goofy at pos 2 after the two Tier 3+ 6★.
- B0082: one WoFF on the 6★ x1 of the art (pos 0), dots on the other two 6★ (`preset replace;slots=1,2`);
  `boosted names=world of ff sora;str=1000;def=1000` (notice: «1,000 more base strength AND defense»).
- Release dates from the notice (`medal_date`): Terra/Ventus/Aqua 09/12/2016, Atlantica 12/01/2017, Seifer/Fuu/Rai
  28/01/2017; `apply_medal_dates` now moves only the variants released with the entry (the 7★ stay at 14/05/2018).
- Parser (`banner_guarantees.SMALL_RE`): «small chance of drawing a **special** X with 1000 more base strength» (wiki
  2016-17) is now a boosted entry: 18 banners B0041-B0082 had lost the rare version. `make-boosted-medals.js`
  creates rows only for the variants already released at the banner's date (no boosted 7★ for 2016-17): 18 new rows.
- Simulation: 0 draws without the new medal out of 3000 per banner, 2.00 medals with dots. Bench 19-10: B0082
  = WORLD OF FF Cloud + 2 6★; B0084 = Rai in the guaranteed position.
- B0079 (EMC Illustrated Kairi, rev 132): mix of the original art, 6★ x2 + 5★ x1 + 4★ x7 (art 5★+ x3, 4★+ x7:
  the three 5★+ are the two Tier 3+ 6★ and the notice's Atlantica 5★). The art is the same as the EMC B0058 (reused for
  the rerun; the wiki uses the same file for both), the wiki says 6★ x2 5★ x8: the banner rules (user).
  Bench: Atlantica Donald 5★, Crocodile and Axel A 6★, seven 4★.

<a id="sp2c-g6"></a>
## Sub-project 2c, G6: Gem Deal 2017 (19-10, revision 133)

18 Gem Deals (B0142-B0144, B0160-B0162, B0177-B0179, B0191-B0193, B0209-B0211, B0232-B0234) write in the wiki
«Includes 3 Power Gems» without «bonus»: `make_banner_catalog.BONUS` now accepts the form without «bonus» only before
Power/Speed/Magic/Sun/Moon Gem. Sources: notices 30125/31604/32524/33510 (three Power, Speed or Magic Gems with every
pull) and the art (epic medal x1, 4★+ x4, Gem x3). Only those 18 banners change. The server
delivers the bonus into the Present Box (server.js, «Bonus: <banner>»): bench 19-10, B0142 -> «Power Gem × 3 — Bonus: Gem Deal».

<a id="sp2c-g7"></a>
## Sub-project 2c, G7: gifts only in the notice (19-10, revision 134)

Field `bonus` of banner_overrides.tsv (`tipo,id,numero`, several entries with `;`), added to the bonuses read from the wiki.
B0212 (EX Falling Price HD King Mickey [EX]): Magic Broom (300948) on every draw, notice 35138 and art (broom
x1). The audit's B0270 was a wrong pairing: notice 38660 is for B0271 (Illustrated Kairi [EX]), which already had the
broom; B0270 (Special EX Medal Deal, «One Draw Only!») has no gifts. Bench 19-10: Present Box
«Magic Broom — Bonus: EX Falling Price Deal».

<a id="sp2c-g8"></a>
## Sub-project 2c, G8: draw limits (19-10, revision 135)

- Parser: `day_limit` also reads «N times a day» (B0080/B0081), `total_limit` reads «Available N times» (B0651, B0660,
  B0683, B0696 = 3 in total; notices 66862/68371 «Up to 3 times only!»).
- New fields `day_limit` / `total_limit` of banner_overrides.tsv for limits only in the notice: B0035 (3/day,
  notice 19882), B0255/B0277/B0287 (3, INCOMPLETE), B0304 (1, 40169), B0334-B0338 (3, 41615), B0339 (1, 41617),
  B0413 (5, 46013). B0242 (Top-Drawer Deal) set to 1: the «three times a day» of the wiki's <ref> note are the
  campaigns B0255/B0277/B0287.
- The audit's B0741 (Free Deal VIP) was a false positive: `vipFree` already limits it to one per day (shared counter
  of the Free Deal VIPs, gacha.js).
- Bench 19-10: B0080 «Chances left today: 3» -> 2 after a draw, comment «3 times per day».

<a id="sp2c-g9"></a>
## Sub-project 2c, G9: «If you receive the following Medals ... 3 dots» (19-10)

Field `preset` extended: several entries with « || », `dots=1-3`, the by-name entries go first (the server applies the first
matching entry: the 3 dots by name win over the 1-3 of the Tier slot, even on the pity copy). 3 dots
by name on B0145 (30703), B0157 (31354), B0184 (33505), B0190 (33593), B0195 (33883), B0199-B0203 (34475), B0207
(34669), B0212 (35138). B0204 (notice 34471, row completed by hand with nothing): new Tier 4+ slot
(`slot new@0x1/6:tier=4-`), 1-3 dots on the slot, Illustrated Kairi [EX] with 3 dots, boosted +1000/+1000 «small»,
showcase (new field `featured`). B0158/B0182 (INCOMPLETE, twins) not touched. Simulation: every listed medal
comes out with 3 dots (B0145, B0190, B0199, B0207 also as pity), B0204 Kairi [EX] 63 out of 4000 draws, all at 3.

<a id="scrooge-bonus"></a>
## Scrooge with the skill of the Skills to Thrill (19-10, revision 136, user's report)

The 70 banners «Includes a bonus 6★ Scrooge Medal with the X Skill» (Skills to Thrill and similar, B0062-B0410) did not give
the Scrooge: the bonus regex did not recognise «Scrooge Medal with the ... Skill» (it discarded it among the «skipped
bonuses»). Now `make_banner_catalog.scrooge_bonus` produces the entry `[3, 90126, 1, skillId]` (4th field = skill;
wiki names different from skill.json in `SKILL_ALIAS`: «ATK Boost II & ATK Prize+», «SP Attack Gauge 1», «ATK B III
Max & SP GA II»). Server: the gift carries `skillId` and the name in the comment («Bonus: Skills to Thrill Deal (Attack
Boost III)»); on collection `giveSkill` saves the skill at the maximum level in `player.medalSkills`. Bench: B0080 ->
Present Box -> Scrooge 6★ «Attack Boost III 20/20, Trigger Rate 54%».
- Bench 19-10 (rev 136): pity of B0190 (save at 4 draws) -> Illustrated Neku 6★ with ●●●○○ in the detail; B0204 -> Illustrated Leon 6★ Tier 5 in the Tier 4+ slot with 3 dots, nine 5★.

<a id="sp2c-g10"></a>
## Sub-project 2c, G10: «0 Special Attack Dots» (19-10, revision 137)

By-name preset with `dots=0` first (wins over the slot's 1-3 dots, also for the pity copy): B0223-B0227
(the five Foretellers [EX], notice 35521 «This does not apply to EX Foreteller Medals»), B0273 HD Vanitas [EX+]
(38662), B0279 Key Art #16 [EX+] (39396), B0284 Sephiroth [EX+] (39400), B0288 KH II Cloud [EX+] (39402). Simulation:
targets always at 0, the other medals of the slot always 1-3. Details (gacha.js `presetText`): every preset said
«comes with its Special Attack Bonus maxed» even with 1-3 or 0 dots; now the text follows the entry. Bench: pity of
B0273 -> HD Vanitas [EX+] with 0 dots; Details with the «0» and «1 to 3» lines.

<a id="sp2c-singoli"></a>
## Sub-project 2c, single cases from the audit (19-10, revision 138)

New fields of `banner_overrides.tsv` (make_banner_catalog.py): `pity` («N;names=a|b;star=S;slot=K;mode=every»),
`max_skill` («pity;skills=a|b»), `exclude` (duplicate row) and the presets' `pity` selector («pity;dots=5»: only the copy
given by the pity; server `enhanceOn(on, ..., pitySlot)`). `pityMode: 'every'`: the counter is reset only when the
pity triggers, not when the target comes out on its own (`rollReserved`); Details «guaranteed every N draws ... the count
does not restart».
- B0353 Phantom, B0374 Illustrated Dusk (notices 42156, 43561): pity at 6★ (was 7★ on the Tier slot) on slot 2,
  among the «remaining 8 Medals» (slot 1 is the Trait Medal), with 5 dots only on the pity copy; B0374 also G1
  (SA and guilt maxed on the Tier 5 7★).
- B0435, B0452 Standard (48299, 48298): pity 5 at the 7★ Prime - Chernabog on slot 2 (the 6★ Chernabog of every draw
  remains), with the notice's 7 maxed abilities only on that copy (G2).
- B0447 (48293) pity 5 at Rai/Seifer/Fuu; B0645 (63324) pity 5 at SN++ - KH III Pooh 7★.
- B0584 Standard (56838): pity 5 that does not reset («will NOT reset even if you draw a Foreteller»); the VIPs B0579-B0583
  reset as before. B0770 (72828): «every 10th draw» (was pity 5).
- B0704-B0706: end on 01-09-2020 (notice 69285, withdrawn and refunded; replaced by B0708-B0710 from 03-09).
- B0507: excluded, duplicate of B0500 (same notice 52345, 15-19/04/2019, once per day). Catalogue: 807 banners.
- B0083 (24597): 3 dots on two copies (slots 0 and 1), not on all five.
- Postponed: B0418 Blue Fairy Deal (Tier 8 guaranteed) with the drawable Blue Fairies (I-142); B0082 was already done in G5.
- G2 (revision 139): the 7 maxed abilities («Attack Boost VI Max ... Triple Threat II») written only in the notice,
  field `max_skill`: B0319 (7★ Tier 4 guaranteed), B0490/B0491 and B0498/B0499 («Guaranteed A slot»: all the 7★ of the guaranteed
  slot), B0494/B0495 («Guaranteed and Stoppers slot»), B0502-B0504 (the three HD Supernovas by name), B0508/B0509
  (the four medals by name), plus B0435/B0452 on the pity copy. All the abilities exist (I-146).

<a id="sp2c-dubbi"></a>
### Doubts D1-D9 (19-10, user's decisions; revision 140)

- D1 Key Art #1/#2: it is NOT a master error. The English version swapped the names after January 2017 (wiki:
  «Key Art #1, previously called "Key Art #2" in the English version»): the master has the final names, the 2016-17
  notices the old ones. The overrides from the notices use today's names (B0084, already done; B0156 fixed).
- D2 (today's Tier), D4 (B0494 Standard, B0495 VIP), D6 (pity slot), D7 (B0228 without notice): closed.
- D3 from the notices and the art: B0126 Cloud & Magic Mirrors (6★ x1 Illustrated Cloud + 5★ x9, Magic Mirror x5, 3 per
  day, «ALL Epics» declared not reproducible: field `not_reproduced`); B0267 EX Medal Deal Sephiroth [EX+]
  (Tier 6+ with 1-3 dots, Sephiroth [EX+] at 5 dots and boosted, Magic Mirror x3; Trait Medal #2 not reproduced).
- D5 Frozen B0430/B0431 («Two 6 or 7★ Frozen Medals»): 6★ list slot with `up` (slot override «...;up»): rises to 7★
  with the probability of the normal slot (3%, reconstructed, written in the Details); at 7★ Supernova - Elsa enters too.
- D8 (revision 141): an agent tried 7,067 ids on cache.sqex-bridge.jp (56500-62699 and 2016-18 windows) and
  recovered 72 KHUX notices in English (copy in `reference\banners\notices_recovered_d8.json`, matches in
  `notices_recovered_d8_matches.tsv`): 20 of the 30 banners without a notice now have one. The catalogue already matched
  except B0590 (Standard: one of 5 medals within 5, notice 57597), B0591 (VIP: Supernova+ - Key Art #21 within 10)
  and B0618 (Foreteller within 3, counter that does not reset, 59825). Still without a notice: B0001-B0004, B0077,
  B0087/B0088, B0392; B0009 is the Zootopia Avatar Board campaign (17892), not a draw.
- D9 (catalogue-only rows with the same sentences): postponed to when they become drawable.

<a id="pagine-stile"></a>
## Style of the Details, Draw Odds and Catalog pages (19-10, user's request)

Original references in `D:\Progetto_Restauro_KH_UX\reference\shop_odds_details\` (NOTE.md: notice 46003 from Wayback
with the CSS, reddit screenshots of Draw Odds «6★Medals» and of the Boosted rows). `gacha.js page()`: background #043654, white
spaced text, «■» titles #00d4ed, key sentences orange #ffa500 and yellow stars #ffcd4a, tables with white borders
and header #365e76. Rates in a «Medal | Rarity | Probability» table (`oddsTable`, equal positions
grouped «Medal 4-10»); Draw Odds is called «Probabilities» like the original, yellow «[banner]» sections with
«↑PAGE TOP»; medals in three columns coloured by attribute (Power #ff4a74, Speed #5cd94a, Magic #62a7ff) like the
names in the notices, pity targets underlined. Bench: B0082 Details and Probabilities.
- Banner state in the Catalog and in the Details (19-10, user's request): «▶ In the Shop now» green in bold
  (box with a green border in the Catalog), «🔒 Unlocks after Story Quest N» grey with the image dimmed, «Not in the
  Shop now» blue, catalogue-only/size not available only bordered (`gacha.js`, classes `s-<stato>`).
- Details: box explaining the state (`STATE_WHY`: in the Shop, unlocked but out of the Shop, locked by the story);
  details opened from the Catalog (`?from=catalog`) with a fixed BACK at the bottom that returns to the banner in the list (`#c<id>`).
  Shop logic (user's question): each block of story quests corresponds to an original date
  (`catalog.story`), the Shop shows the banners active on that date (at most `SHOP_MAX`); 517 banners out of 734 never
  fall there (I-165).

<a id="rotazione"></a>
## Weekly Shop rotation (19-10, I-165, user's decision)

Previously the Shop showed the banners active on a single date per story tranche: 517 drawable banners out of 734 never
got in. Now (`gacha-data.shopWindow`, `server.js storyCtx`, `gacha.shopBanners`):
- the story tranche covers the original period from its date to the date of the next tranche (the last one: 7 days);
- the Shop shows one week of that period (every banner active on at least one day of the week) and advances by
  one every Monday (`clock.weekIndex`, like the data updates); when the period is over it restarts from the first
  week; `player.gacha.rot = {day, week}` starts the rotation from the week in which the tranche is entered;
- with the Shop full the banners lying entirely within the week go first; `SHOP_MAX` from 8 to 20 (up to 19 banners
  in the same week in the original, 2020-09-10; bench: list of 19+ banners scrolled to the bottom, no crash);
- simulation over all tranches and weeks: 734 drawable banners out of 734 reached;
- Details «Not in the Shop now»: in how many weeks the banner comes back, or «ran before your current Story period»;
  Shop notice with the «Weekly rotation» section. Banners from past periods remain only in the Catalog.
- Countdown under the button (19-10, user's request from the video Z_JRaJF7GbQ): the plate's original label
  `Plate_Limit` (if `displayTimeLeft` of the drawMedalType row is not 0, time until
  `endDate`; with payType 7-9 the label `Plate_Limit_LimitDraw` under 100 days). The server (`servedMasterRows`)
  sets `displayTimeLeft: 1` and `endDate` = the Monday 08:00 on which the rotation removes the banner from the Shop
  (`gacha.shopLeaveWeeks`), in fake time like the quests; banners that stay for the whole tranche period
  have no countdown. The master revision also counts the story tranche (`storyTranche`), so the client
  downloads drawMedalType again at login after a tranche change (within a session the master stays the login one).

Slow Notices at login (follow-up): experiment with 3 re-entries with a minimal page and 3 with the real page, all 1.2-1.4 s; the
slow cases (~9 s) are intermittent and coincide with a failing Google Play Services font update
(guest clock at 2021, mandatory for the client): they do not depend on the page. The DNS block shortens them.
- Details «Not in the Shop now» (19-10, user's request): «How the Shop works» in three steps with the real dates (tranche period with its quests, week shown, advancing on Monday and number of weeks) and the highlighted answer (next Monday / in N weeks with the dates / ran before your period / later period). Bench: Disney Friends -> next Monday, Apr 14 - Apr 20, 2016.

<a id="sp3"></a>
## Sub-project 3 (20-10, spec 2026-10-20-shop-sp3-design.md, plan 2026-10-20-shop-sp3.md)

- **JavaScript in the Shop WebView** (Task 0, bench 20-10): an inline `<script>` at the bottom of the Catalog page
  requested `GET /web/gacha/jsok?<Date.now()>` when opened from the Details of the Banner Catalog plate: JavaScript is
  enabled (as in the Notices). Filters and pinning can use inline scripts and `fetch`/`XMLHttpRequest` towards the server.
  Note: `Date.now()` in the WebView gives the guest's time (May 2021), not the server's.

- **Currency icons in the Catalog** (20-10): instead of the emoji, PAID WITH, filter tags and price rows use the original
  JP 4.3.1 icons (Jewel, Platinum Ticket, Draw Ticket, Spooky Cookie, VIP crown, Gold Ticket), served by
  `GET /web/gacha/icon/<jewel|platinum|draw|seasonal|vip|other>.png`. They are Square Enix assets: they are not in the repo, they live in
  `server/game_data/shop_icons/` (ignored by git). To regenerate them: `python -I recon/tools/shop_icons.py [BASE_JP] [CARTELLA_OUT]`
  (BASE_JP also from env `KHUX_JP_BASE`; reduces each icon to 48x48 RGBA). If an icon is missing the route gives 404 and the page stays intact.

- **What sub-project 3 does** (20-10, tested on the bench with `prove525`):
  - seasonal banners on the real calendar (`server/gacha-seasons.js`, 8 fixed windows in UTC, most recent edition
    unlocked), countdown to the end of the window, master revision that changes with the seasons;
  - one old pinned banner (`player.gacha.pinned`, `POST /web/gacha/pin/<id>` and `/web/gacha/unpin`), from the Details or
    from the Catalog list; Free Deals, 1 Jewel and seasonal ones excluded; in the Shop right below the Catalog, above the
    seasonal ones (the precedence of the payType 8 currencies stays season > pinned > rotation); plate with
    `/web/gacha/img/<id>-kept2.png` (label C3c, `recon/tools/kept_banner_badge.py`, cache in
    `server/game_data/gacha_img_kept/`; `KEPT_STYLE` in gacha.js to be raised at every new drawing);
  - Limited with Platinum/Draw Ticket only from quest 815/840 (thresholds from the catalogue, `ticketUnlockQuest`);
  - Catalog with GAME YEAR tabs (hidden if empty), Filters panel, search by medal (`/web/gacha/search`);
  - the draw also accepts the banners of the last `/gacha/list` sent to the client (Shop page not reloaded).
- **Test save `prove525`**: `prove.json` with `stageScores` of all 525 quests (created on 20-10 with a
  node script). It is used for seasonal, pinnable banners and thresholds; `prove.json` is at quest ~132.
- Postponed (plan's register): rotation countdown off by one week at the edges of a season
  or after pinning; a season starting within a session (countdown from the next login); boosted rows of
  Axel Art [EX] / KH II Kairi [EX+] in the master (B0238, B0362, B0363 without boost); summer only with size 4.
