# Home, menu, Profile, Missions, pet

History: [../journal/fino-al-2026-10-11.md](../journal/fino-al-2026-10-11.md). Taps in
[banco.md](banco.md#tocchi).

<a id="home"></a>
## Home

- Background: only from the parts of `mypageBackground` (`validParts`, `partsId`,
  `dataType` 1 = `lwf/home/<id>/<id>.png`, 2 = `.lwf`, 3 = `img/home/<id>/<id>.plist`, positions,
  `zSort`); without the row of the `backgroundId`, crash. `make-game-tables.js` generates one row for every
  background with artwork (`lwf/home/{2..6,99,150911}`).
- With the tutorial finished the home creates pet and NPCs: the client loads
  `lwf/pet/motion/<30 nomi>` and `lwf/character/npc/<id>/wait/wait.lwf` (no file = crash)
  without checking: the package contains empty LWFs for the 30 animations (now our own LWFs with
  «end», `make_pet_motions.py`, see [pet](#pet)) and the 74 NPC ids of
  `img/stage_npc/npc_rule.bin` (except 4001). So Chirithy (NPC 999) was invisible (ISSUES I-016).
- 16-10: `import_jp_coco.py` imports the original JP 4.3.1 NPC animations (`lwf/character/npc/<id>/wait`):
  37 out of 93 (Chirithy included), those with all the parts or missing only the 97x24 shadow (identical to
  `4001/wait_7.png` served by the WW, read from resources 7). For the other 52 the local reference copy lacks parts
  (perhaps the identical files): they stay empty. JP speech bubble `MyPage_ChirishiBaloon` with WW `fontName`
  (`DFPSoGei-W5.TTF`): with the JP calligraphic font the «!» came out as «/». Bench: Chirithy and speech bubble ok (`chir_tap2`).
- Without a party, tapping the plaza (16-10): Rankings + Party Search; with the first-party bonus not collected
  (`userParty.flagFirstReward` 0) also the banner «Join a party and earn Jewels!» (`MyPage_JewelGet_Big_ver240`).
  Original placeholders in `MyPageScene_ver340` (inside RightUI x 350): JewelGet_Big -189/430, Rank_Solo1 -345/450
  (with the banner), Rank_Solo2 86/470 (without), RightUI_Solo 302/470 (Party Search). Rankings covers the left edge of the
  banner already in the original data: it is left as is (user's decision, I-097).
- Party members' bubble in the home (16-10, bench): the button with the two arrows changes the value shown
  (Quest Progress, Weekly Lux, Raid Support, PVE Ranking, PVP Ranking) from `partyUserList` of `/party/member/list`.
  Quest Progress = `lastStageId` shown as is (quest number, not the stageId: with the stageId «Quest 5020»):
  now the most advanced story quest (id 1-979 since 21-10) cleared (`lastStoryStageId`, «Quest 132»). Weekly Lux = `userRanking.lux`:
  previously the total Lux, now `player.weeklyLux` {period, lux} (week of the weekly missions, added at every
  /stage/clear). Raid Support `raidHelpNumber` 0, PVE/PVP «---» (`userColosseumRanking`/`userPvpRanking` 0): correct
  as long as raids, Colosseum and PvP do not exist.
- Tap on the plaza: whoever is not in a
  party (`userParty.isJoin` 0) sees Chirithy with the speech bubble `MyPage_ChirishiBaloon.json`
  (`Txt_Name`, text 101000022, «Join a party and make new friends!»), generated from
  `MyPage_AvatarBaloon_ver240`.
- White balloon above the avatar (ISSUES I-071): `MyPage_MpBaloon.json` (Panel_1 > Balloon >
  `Txt_Comment_Label`), two copies `avatarFukidashi_0/1`. The avatar's random
  action (10% of the cases) writes the **Profile message** into it: for one's own
  avatar `userData.user.comment` (up to 256 bytes), for
  the others the one from their record; no check for empty. With `comment` "" the balloon
  appeared empty. The server now sends `DEFAULT_COMMENT` («Nice to meet you!», or
  `KHUX_DEFAULT_COMMENT`) when the saved message is empty. In the originals there was the
  players' message there (`reference\home_bubble\`). It has nothing to do with Chirithy's red speech bubble
  above. To be tested on the bench.
- `GET /mypage` (action 59) now has its own route (`respondMyPage`):
  same fields as the schema (`backgroundId` 150911). `adminMypageTexts[]` {type, priority, text}
  stays empty: perhaps it is the scrolling strip under the top bar (original «Tap the face icon
  to customize your avatar. Tap the screen to view party members' progress.»), but where the client
  shows it is not known; to be tested with `KHUX_MYPAGE_TICKER=1` (type from `KHUX_MYPAGE_TICKER_TYPE`, 1).
- Button mapping (`sweep.ps1`, 9 October): Quests, Shop, Chat («You need to be in a party»),
  Presents, Equipment ok; Beginner's Guide opens empty (it is a WebView on the login's `beginnersGuide`
  URL, now `/web/beginner`: [missioni-schede](#missioni-schede)); the others solved later. Never tested:
  Beginner's Guide (content), Shop jewels, arrows ‹ ›, Other buttons, medal Share, title
  (Restore Resources, Save User Data, x3 [ex tres], KHDR START) (ISSUES I-018).
- Quests screen: `lastClearStageId` compared with
  `misc` 106 (130) for the Colosseum; buttons STORY, Special (quest 6), Events (14), Union Cross
  (24), Colosseum (130).

<a id="other"></a>
## Other menu

`MenuDialog_ver300` from the original `MenuDialog_ver150` (`other_menu` in `make_layouts.py`): the client
writes the texts and hides Support/Transfer/Movie; `TwitterButton` hidden (looked up by
the client). Buttons never tested.

Crashes without requests to the server (bench 14-10, same crash for the three cases): layouts not served,
loaded without checking (like Emblem_Base, I-123).
Names taken from the strings of the client (`func_strings.py`, `widget_lookup.py`); all
missing from names_v4, addnl and stage_gen. The JP 4.3.1 originals added to `jp_coco_layouts.txt`
(the originals have all the widgets looked up):
- **Transfer Unions** (I-107), real cause (bench 14-10): «Transfer Unions» is the **Union change**, not the account
  transfer. The client loads `cocostudio/publish/Union_Popup2.json` (file missing; only
  Union_Popup1/3 served). Imported the JP 4.3.1 original (Button_Close, Button_OK/Txt_OK, Txt_Cancel,
  Txt_Wording1/2, Txt_10Line_Label_0_1; texts 103700002 «You can transfer to a different Union.»,
  103700004 «Proceed?»). After OK: screen «Select a new Union.» (the current Union darkened), confirmation
  «Spend 100 Jewels to transfer to <Union>?», then `POST /union/change` {unionId} (action 74, same response
  as 71: only `userData.userDetail`) and `GET /user/stone`; «Transfer complete.» and back to the home.
  Server: `respondUnionChange` (-100 jewels, `player.unionId`; without a response «200 ERROR :74»). Tested on 15-10:
  Unicornus -> Leopardus, new emblem in the Profile, jewels 2660 -> 2560.
  The `MenuDialog_account_select*` copies below remain: they are needed by the account
  backup path, which is not this button.
- Transfer Unions, first hypothesis (wrong for this button): the first import (`Information2_TakeoverCheck.json`)
  was not enough, the crash stayed identical. The account backup path opens the account choice
  (`MenuDialog_account_select_ver401.json`; confirmation
  `MenuDialog_account_select_ok_cancel_ver401.json`).
  The client takes the `dark_` variant only in Dark Road,
  otherwise the one without prefix, missing from every resource and from the JP as well. Now
  `make_layouts.py` copies them from the served `dark_` ones (extracted with `res_get.py` into
  `layouts\orig`) with the KHUX frames; the Apple / SQEX Bridge buttons (textures missing, not
  9-slice) stay without an image as in the dark one.
- **Legal Information** (I-109): the client loads `Legal.json` (Close_Button, UserAgreementButton, Txt_Legal1,
  LicenseButton, Txt_Legal3); it works (bench 14-10). The two buttons open a WebView:
  UserAgreementButton (title text 104040001) on the `agreement` URL of the `/system/login` links,
  LicenseButton (text 104040003) on the `license` URL.
  Empty = white WebView: our own pages in
  `server/legal-pages.js` (terms of the restoration server; licences of the open source components
  whose strings are in the library: cocos2d-x, LWF, curl, OpenSSL, zlib, libpng, ogg/vorbis,
  Photon, RapidJSON, TinyXML-2, FreeType, Chipmunk2D).
- **Shop > Increase Storage** (I-100): medal limit popup
  (`PopupNormal_MedalPossessed1_ver350.json`: Txt_UpperLimit1/2, Txt_CrownPossessed, bar
  MaterialStock_bar with Button_stock_down/up, Button_OK, Button_Close) and confirmation
  (`PopupNormal_MedalPossessed2.json`: Txt_UpperLimit_before/after). The purchase request to the
  server (after OK) is not handled yet. On the bench «Current capacity: 2248» covered «(Max: 3000
  slots)»: in the JP the two labels (areas 310 and 230, 240..550 and 489..719) already touched and the
  WW texts are longer. New option `set=Widget.opzione=valore` of `jp_coco_layouts.txt`
  (import_jp_coco.py): labels at the sides (x -310 / 310, areas 330 / 280, 170..500 and 510..790),
  font 24.
Dry run (14-10): package at 81.6% of the reserve, index = installed: a `-Quick` is enough.
- Party (Other and the home's «Party Search» banner) and Rankings: crash and «200 ERROR :133» explained in
  [server](server.md#party-ranking) (layouts `PartyTopScene_ver131` and `Ranking*` missing from the WW
  resources, `GET /ranking/lux` not handled; 14-10).

<a id="profilo"></a>
## Profile

- It opens by tapping the home's avatar: hidden scene +
  `GET /user/profile` (action 5), then the layout.
  References `reference\profile\` (video 7-R0jhyzlso from 2017: profile_06, _11 Titles, _13
  Name/Message, _16 Play Style).
- Generated layouts: scene `AvatarInfoScene_A_ver131` (UnderUI = Titles/Name/Message/Play
  Style/Outfits = `Button_A..D`; LeftUI/RightUI = arrows), `AvatarInfo_Oneself_ver131` (frame),
  `AvatarInfo_User_ver260` (`RankTitle_Board`/`RankTitle_Name`, `Base_User` with
  `Union_Symbol` and `My_Name`, `Txt_Party`/`Party_Name`, `MVP_Crown`/`MVP_Trophy`;
  `FaceBook_PhotoPanel`/`FaceBook_Photo`), page 1 = `AvatarInfo_Txt_ver340` (original, 6 textures
  drawn in `make_textures.py`), page 2 = `AvatarInfo_Txt2`,
  `TresCommu_CommunicationUser/Other` empty.
- Server: default title Budding Newbie (with `titleLeft/Right/PlateId` 0 crash),
  starting keyblade `isFavorite` 1 (without it, crash), `img/union/Union_%02d` and
  `Union_L_*`.
- Titles (`Button_A`): copy of `Offline_AvatarTitle_Base`; `GET /user/title` (18)
  lists the category 1 titles + `player.titles`; `POST /user/title/update` {titleLeftId,
  titleRightId, titlePlateId} (41).
- Name/Message (`Button_B`): from `Offline_AvatarInfo_Comment`; `POST /user/update`
  {name, comment} (38). **The message is sent empty**: the client replaces the TextField
  `Txt_Comment_Label` with a native field and copies the text only at the end of
  editing; with `adb input text` (even with Enter or Back) the client sends `comment: ""` (the native
  EditBox does not receive the text): to be retried with a real keyboard (ISSUES I-015). Variant U13 if
  the age (from `GET /user/birthday`, action 9, YYYYMM, never requested) is <= 12.
- Play Style (`Button_C`): CheckBox `But16` (with a Button, crash);
  `POST /user/playstyle/update` {playTimezones, playFrequently} (40).
- **Passive Effects** (`Button_Passive`/`Txt_Passive` of page 1 `AvatarInfo_Txt_ver340`, at
  (372,88) of 960x640 = tap `778,932`; text 106220502; I-086). **It is not a WebView**: on tap it turns off the buttons and sends
  `PUT /passive/list` (249) with `isList` 1 and `userId` only if the profile is not one's
  own; with a valid response the client opens the passive dialog
  = original layout `Passive_Base_ver341` (Close_Button,
  Panel_TotalSwitch/Txt_TotalSwitch Total/Individual, Button_Update, Scroll_Area, Txt_None,
  Txt_PassiveInfo, Total_Area/Total_Score_01..15) with `Passive_Panel` cells (Panel_Passive,
  Icon_New, Txt_Passive_Label -> `Xml_Maximum` created by the client); someone else's profile:
  totals from that player's list. Layouts and images are all in the served resources, the server
  already answered (`keyblade-evo.js` `respondPassiveList`, I-065): no build-resources. Only the
  «Passive Effects» button INSIDE the dialog (`Button_PassiveInfo`) opens the web page
  `/web/passive` (already over http). Added: with `userId` in the body the response sends it back (own
  list if it is 1, otherwise empty), otherwise the dialog of another profile would read an empty
  list. Original: `reference\passive_effects\` (iOS screenshot from 2019 from the Profile, Total view
  with 15 boxes; khuxwiki 3.4.3 «Active Passives can now be verified through the Profile
  screen»). With the bench save (1 passive, 301350) the expected result is the Total view with one
  STR box per medal type different from +0 and, in Individual, one row. To be tested on the bench.
- **Boosters** (`Button_Emblem`/`Txt_Emblem` of page 1; text 106120211; I-123).
  The emblems are the event Boosters (khuxwiki: board rewards, «+25%», expiry). On
  tap `PUT /emblem/list` (188: `emblemIds[]`, also for someone else's profile); the server answers from the schema (`emblemIds: []`, «[?]» in the log),
  then the client loads **`Emblem_Base.json`** and the list
  always loads **`Emblem_Panel.json`** as cell: **both missing** from every
  WW resource (`catalog\missing_layouts.txt`) -> GUIReader null -> crash (log of 14-10: #148
  `/user/profile`, #149 `PUT /emblem/list`, then restart #150). Fix: JP originals in
  `jp_coco_layouts.txt` (drawn title «BOOST» in English, `MyEmblem_Title`; `MyEmblem_Panel1-4`
  from JP, Win22/Panel04/But_Close served). Names looked up: Emblem_Base `Close_Button`, `Scroll_Area`,
  `Txt_None` (106120213 «No current boosters.», visible with an empty list); cell
  `Emblem_Base` (checked), `Icon_New` (checked), `Txt_Emblem_Name_Label`,
  `Area_Ticker_Emblem_Name`, `mask`, `Panel_Emblem` (+ `PresentBOX_IconPanel_ver131`, icon type
  34 `img/ui/emblem/Emblem_%d.png`, `Base` hidden), `Txt_Emblem_Detail_Label`,
  `Txt_Storage_Date_Label`, `Txt_Storage_Date_Title` (106120212 «Expires»): all in the original.
  With an empty `emblemIds` no cell is created. To be tested on the bench after the next build.
- To do: Outfits (`Button_D`), page 2 (`Button_Change`), arrows ‹ › (they do not
  appear with a single profile) (ISSUES I-017).

<a id="missioni"></a>
## Missions (scroll)

- Scroll button under the avatar (`425,130`): `MyPageMission_Base_ver320`, row `MyPageMission_Panel` and `PresentBOX_IconPanel_ver131`
  rebuilt with the KHUX widgets; `ChallengeButton`/`ReceiveButton` are created by the client (do not put them in the
  layout). Rows 144 high (client cell 148, content +44), bar like the LUX one
  (`Gage_LUX_Base` + `Gage_LUX_Tip`), stamp `World_Stage_Clear` («COMPLETE») on the collected rows.
- Data: `server/tables/mission.json` (20 missions: 10 daily 30 jewels, 10 weekly party ones
  100 jewels; agent in `stage_gen\missions\NOTE.md`). `GET /user/mission/list` (189)
  -> `missions[]` {id, status 0/1/2, numUpper, numLower} **only with master ids** (otherwise crash),
  `beginnerLimitTime`; `POST /user/mission/receive` {receiveMissionIds} -> userData + missions +
  inventory. Counters per period in `player.missions` (day: time of startDate, 08:00 UTC);
  they count quests and Lux, not yet Raid/PVP/Union Cross (ISSUES I-014). Tested on the bench (Collect
  All: Jewel 3000 -> 3060).
- Look from `reference\other_menu\missions_list_01.jpg`: 176x50 tabs above the window; the client
  loads `img/ui/MyMission_Category_On/_Off/_Disable.png` on the tabs and
  `img/ui/MyMission_GroupIcon1/2.png` (1 = personal/Limited, 2 = party) in `GroupIcon`, all
  generated in `make_textures.py`. `Mask_Area` (the weeklies' «Join a party» notice) must cover
  only the list: stretched over the window it ate the tab taps (Daily dead after Weekly, I-058).

<a id="limited"></a>
### Rotating Limited (16 October, bench OK)

- `server/make-limited-missions.js` from `server/limited_missions.tsv` (khuxwiki originals): 207 rows
  missionType 4 (ids 4001-4207), 35 monthly Lux campaigns (M01-M35) and 6 short completable ones (W01-W06:
  «Complete quest x1/x2», «Nearly 10M downloads», «Defeat 100 enemies», Story Quest Campaign up to
  500, the two special ones on total Lux). Rotation in `server/limited_rotation.json`: the server
  (`limitedActive`) sends only the month's campaign and the week's one, from the **real time**
  (since 16-10 all periods are computed on the real time, server/clock.js); period = number of the real month/week
  (Monday 08:00 UTC), so a returning campaign starts again from zero.
- Conditions: 4 Lux of the period, 33 total Lux (special), 30 story up to quest N, 1 quest, 50
  enemies defeated (`enemyDeadNumber` of `/stage/clear`). `missions[].numUpper/numLower` are uint64:
  the 10/100 billion fit.
- Rewards: rewardType 33 = Spirit part (itemId = petPartsId),
  materials, medals, Jewels; the 4 parts without artwork have a substitute (SUBST). 40 Platinum
  Ticket -> `userPoint.limitedDrawTicket1`, 41 Draw Ticket (also Holiday Draw Ticket, Moogle Point,
  Spooky Cookie) -> `limitedDrawTicket2` (Shop banners payType 7/8, `/gacha/*` not done yet), 7
  title (12601 «With Gratitude»), 20 avatar part (Snuggly). Map and tests:
  `reference\missions\limited_rewards_map.md`.
- Real countdown since 16-10 (fake clock, `docs/superpowers/specs/2026-10-16-orologio-finto-design.md`):
  the server rewrites on the fly the `endDate` of the Limited rows (next occurrence of the group) and Weekly (series A
  3001-3010 even weeks, B 3011-3020 odd), in the fake time of the twin month. Bench 16-10 (Friday 09:58
  UTC): Daily «22 hours left», Weekly and weekly Limited «2 days left», monthly Limited «15 days left»; after
  a restart same values (21 h at 10:47) and master not downloaded again (`ck2_*`). Before: «28719 days left».
- **Uncollected rewards into the Presents**: at the change of real day/week/month (08:00 UTC; Monday; day 1)
  the Daily/Weekly/Limited missions completed and not collected go into the Presents («Daily Mission reward»,
  «Weekly Mission reward», «Limited Mission reward», 30-day expiry). Bench 16-10 with
  `relogin.ps1 -RealNow 2026-10-19T09:00:00Z`: the 3 Daily rewards (Jewel x30) completed and left on Friday
  appeared in the Presents («Expires in 29 days»), Daily reset, Weekly «6 days left», new short campaign
  («Special Campaign: Defeat 100 enemies!», 6 days), monthly «12 days left»; master downloaded again (106
  tables), no resources (`ck3_*`).
- Offline test `node server/test-limited.js`; on the bench the tab shows the parts' icons and names.

<a id="missioni-schede"></a>
### Daily / Weekly / Beginner / Limited tabs (14 October, offline)

- **The tab is decided only by the client, from the master.** Tabs are fixed categories 1-4, texts `Txt_Tab`
  (106120117 Beginner, 118 Daily, 119 Weekly, 120 Limited). The client puts every mission of the response
  into the list of the `missionType` of its master row (other values ignored) and creates `tab1..tabN` only for the
  non-empty categories.
- Tap on a tab: if the tab changes, the client saves the «seen» ones of the old tab (category 2 only) and redraws
  the list of the new category; `Mask_Area` is visible only with category 3 and without a party. On opening the
  same for the initial tab.
- So with the current master (2001-2010 missionType 2, 3001-3010 missionType 3) Daily and Weekly
  are necessarily different lists; the server sends all the rows in a single `missions[]`. On the bench of
  13-10 (`screenshots\r34_daily.png` / `r34_weekly.png`) they were indeed different. «Same list» of
  14-10: not reproduced offline; I suspect the tabs, which in the screenshots look the same on and
  off (`MyMission_Category_On/_Off` of `make_textures.py`), to be looked at on the bench.
- Timing: Daily = client countdown until `startDate + k*86400`, so
  the server resets at the same instant (time of `startDate`, 08:00 UTC); Weekly = the client shows
  `endDate` (2099, «28719 days left»), the server resets every `startDate + k*7 giorni` (Monday 08:00
  UTC). The user's guide says 9:00 Italian time for both: with the server time (May 2021,
  CEST) it would be 07:00 UTC. **Master change to be coordinated (not done)**: `startDate` time
  07:00 if the summer 9:00 is wanted; for a real weekly countdown, `endDate` of the
  weeklies = next reset, regenerated every week (new revision).
- Beginner (missionType 1) and Limited (4): no rows in the master, so the tabs do not appear.
  The server now handles them if they arrive: rows 1-4 active (`startDate <= ora < endDate`), period
  without reset for 1 and 4, `beginnerLimitTime` = first listing (`player.beginnerSince`) +
  `KHUX_BEGINNER_DAYS` (30, hypothesis), null without Beginner rows (the client uses it only for
  the label of missionType 1). Adding them = new master rows (khuxwiki: 34 Beginner) and
  revision bump.
- **Beginner (15-10, I-118, tested on the bench)**: the 34 from the khuxwiki («Mission», 2019; sources and Limited in
  `reference\missions\beginner_limited.md` and `limited_all_khuxwiki.tsv`), `server/make-beginner-missions.js` (rows
  1001-1034 in `tables/mission.json` and `master_data/mission.json`, master revision 111). Tab valid for 30 days
  (official notice «Introducing Missions!», 9-11-2017). Original conditionIds unknown: 30-44 (no effect in the
  client), progress computed from the state (`MISSION_DERIVED`: 30 story, 31 STR of the favourite keyblade, 32 level
  of the keyblade series, 33 Lux, 34 Special Attack Bonus maxed, 39 Nova = Guilt Burst level, 40 Spirit
  rank = Gear rank) or counter (35 Draw Medal: one per successful `/gacha/draw` draw, not retroactive).
  They stay at 0 because the feature is missing: 3 Raid Boss, 36-38 special quests and Proud Quest, 41 Proud Mode, 42 events,
  43 Colosseum, 44 Union Cross (16-10, `test-beginner.js`; 30 uses the most advanced story quest, not lastClearStageId which the
  Tours push further; bench 16-10 evening: Nova, Spirit and Draw advance and are collected correctly, verified
  by the user). Reward «Skip Ticket+» = **type 28** (client 4.3.1 reward
  icon/name switch: 26 = «Skip Ticket», text 102600058, JP スキップチケット; 28 = «Skip Ticket+», text 102600065, JP
  スキップチケットⅡ), `player.superSkipTicket` («Force Skip», [mappe_storia](mappe_storia.md#proud-start-popup-check));
  until 23-10 it was type 26 (shown as «Skip Ticket» with a jewel icon). Bench 23-10 (rev 180, save `skiptest`): Draw Medal
  x 3 shows «Skip Ticket+ x 5» with the rainbow ticket, Collect -> «Received Skip Ticket+ x 5!», superSkipTicket 2 -> 7. Bench: 12/34 complete
  on the test save, Collect All -> +1000 jewels and «All rewards have been collected.». Limited not added
  (all tied to 2017-2021 dates: to be decided).
- `GET /user/mission` (action 187, on entering the home) **is not the Missions window**: for 187
  only `id` (`day`/`isFinish` only for 183 `/user/mission/update`); it points to a row of another table
  (stage and interval). `id` 0 =
  none; the server answers `{id: 0, day: 0, isFinish: false}` (`respondUserMission`).
- **The home's Beginner's Guide = WebView**, not missions: the home opens a WebView (title 106210101)
  with the `beginnersGuide` URL from the `/system/login` links. With the
  empty string the window stayed empty. Now it points to `http://.../web/beginner`
  (`respondBeginnerPage`: Daily/Weekly missions from the master with rewards and times, like `/web/passive`).
  `/user/mission/list` is requested only by the Missions window (from the scroll button). To be tested on the bench.

<a id="pet"></a>
## Pet («Spirit»)

- References `D:\Progetto_Restauro_KH_UX\reference\pet\` (NOTE.md + 14 screenshots): unlocked after
  Story Quest 14, dialog with rank, 6 medals, Name/Outfits/Gear/Tricks.
- **6th slot = pet slot** (verified, `reference\pet\NOTE.md` §8): every deck has 5 `deckMedals`
  (at most 5) + `petBaseSlotMedal` (uint64); the Equipment revolver
  creates 6 cells «Medal1..6». The sixth cell's multiplier = the keyblade's `partnerRate`
  + the pet's `magnification`;
  in pet-mode the cell loads `img/ui/Minfo_Pet01.png`, missing like `Minfo_Def09`.
- Everything switches on with `userData.userDetail.isPet`. With isPet 1:
  - startup: after `GET /user/option` (149) the client requests `GET /pet/profile` (170),
    `GET /pet/coordinate/parts` (171), `GET /pet/coordinate/all` (172), then continues;
  - Equipment: `DeckEdit_PetMedal_ver230` (it exists:
    frame `DeckEdit_Pet1`, `Button_PowerUp` «スピリット強化» -> Spirit dialog) in
    `Area_PetMedal`/`Area_RevolverPet`, and reads WITHOUT checking `pet.petSubslot.magnification`:
    the session pet must exist.
- The session pet is created only by action 170, all keys
  mandatory: `pet.petSubslot` (`subslotUserMedalIds` uint64 <= 6, `openSkillIds`
  <= 15, `rank`, `pt`, `magnification`), `pet.userPetCoordinate` (12 int),
  `pet.petName`, `pet.userSkills`, `pet.userMedals`, `pet.initCoordinate` (0 = the PetEdit scene
  loads `Tutorial_Pet01.json`, missing: 1 is sent) and on the root `recoverDatetime`,
  `recoverStoneNum`, `expeditionTotalNum`, `expeditionMonthlyNum`.
- Crash explained: the response of 237 (`/user/medal/remove`) with `petSubslots[0]` is applied to the
  session pet without checking it exists; same for 175 (`/pet/subslot`) and 174
  (`/pet/name`). 55/56 do check. With isPet 0 the pet never
  exists, so `petSubslots` must stay [].
- Actions: 170 GET `/pet/profile`, 171 GET `/pet/coordinate/parts` (`pet.userPetParts[]`), 172 GET
  `/pet/coordinate/all` (`pet.userPetCoordinates[]`), 173 POST `/pet/coordinate/update` (response
  `pet.equipCoordinateNo` + `pet.userPetCoordinates`), 174 POST `/pet/name` (`pet.petName`), 175
  POST `/pet/subslot` (body `subslotUserMedalIds`, response `pet.petSubslot`), 176 POST
  `/gacha/petdraw`, 177 GET `/pet/coordinate/members`, 236 GET `/user/medal/preremove` (body
  `removeUserMedalId`; `isPetSlot`, `petRank`, `updatePetRank`).
- Server: `server/pet.js`, switched on with **`KHUX_PET=1`** (default off = previous behaviour).
  State in `player.pet` ({name, subslot, coordinateNo, coordinates}) and `player.petBaseSlots`
  [userKeybladeId]. Tables `server/make-pet-tables.js` (petRank 17 ranks, magnification
  22000+1000·rank = Rank 5 ×2.7 / 15 ×3.7 / 16 ×3.8 as in the screenshots; petSkill = the khwiki's
  Tricks; `medal.addPetPt` estimated from rarity + tier), also called by make-game-tables.js.
  OUR OWN values (no dump: petRank/petSkill removed in 5.0.1).
- Pet dialog: missing
  `PetInfoScene_ver320` and the sub-screens (`PetInfo_PetSkill_Panel_ver230`, `_Rename_ver230`,
  `_Training*`, `PetEditScene_ver230`, `PetEdit_Panel/Check2_ver230`, `Tutorial_Pet01`), the armature
  `PetInfoAnim.ExportJson`; of `lwf/pet/part` there are only the 9 parts of `001` (names_v4 and
  names440), no `lwf/pet/motion` nor `lwf/ability/hit_effect/pet_eff_*`. Widgets looked up by the client: Pet_LvUp,
  Panel_img, Button_A/B (Txt_A/B), PowerUp_Button, PetSkill_Button, PetTraing, PetTraing_But,
  PetTraing_ChargButton, PetTraing_Slot, Txt_TotalTitle, TotalNum_Label, Txt_MonthTitle,
  MonthNum_Label, Txt_PetSkill, Txt_Training, Txt_TrainingCharg, Icon_New, Txt_PowerUP, Txt_Time,
  Pet_Info (Txt_Pet_Name, Txt_Pet_Rank, Txt_Pet_Rank_Num, Txt_5), Pop_MedalForm,
  Pop_PetSkill_Info, PetInfo_Medal, Area_Arrow1/2, AtlasLabel_EXP, Close_Button, Dummy, MedalArea,
  Win_under. Not generated yet: the children of PetInfo_Medal/Pet_LvUp still to be worked out.
  As long as it is missing, Equipment's `Button_PowerUp` and the home's pet icon crash.
- **Sub-screens of the SPIRIT dialog** (I-082, 12 October, to be tested on the bench). Generated in
  `make_layouts.py` (functions `pet_*`), widget names and types as the client expects them:
  - **Name** (`Button_A`): `PetInfo_Rename_ver230` = Name popup
    of the offline Profile (`Offline_AvatarInfo_Comment`): `Txt_Name`, TextField `Txt_Name_Label`
    (replaced by a native field), `Txt_Limit1`, `Txt_Caution`, `Button_Close`/
    `Txt_Cancel` (cancel), `Button_Ok`/`Txt_OK` (empty name ->
    102300003, then `POST /pet/name`, already served).
  - **Tricks** (`PetSkill_Button` on `Pop_PetSkill_Info`): the client
    looks up `PetSkill_Info` (detail, hidden: missing = crash) and `PetSkill_List > Area`/`Txt`. The
    list = `openSkillIds` of the **petRank row of the rank**,
    not the server's ones; cells `PetInfo_PetSkill_Panel_ver230` 304x68 placed at
    (152, 0): `PetSkill_Panel` (ImageView: the client loads into it
    `img/ui/But13_Off.png` with loadTexture, copy of But16 in COPIES), `Txt_PetSkill`, `Icon_New`;
    `SkillButton` must NOT go into the layout. Tap on a trick: `PetSkill_Info` with
    `Txt_PetSkill_Title`, `Txt_Efficacy_Title` (106110901), `Txt_Efficacy`, `Txt_Trigger_Title`
    (106110902), `Txt_Trigger`; tapping it again closes it.
  - **Spirit Training**: actions 243 `GET /pet/expedition` (`openMedalSlotDatas[]`
    {`openMedalSlotNumber` 1-4, `openMedalSlotLimitDatetime`}, `limitDateimeWeekEnd`,
    `limitDateimeMonthEnd`, `remainingDrawCount`, all mandatory), 244 `POST /pet/expedition`
    {userMedalIds} (`userMedals` + `medalResumption {userShuffleSkills[], resumptionStatus}`, then
    `GET /pet/profile`), 245 `PUT /pet/expedition/recover` {stoneNum} (only ret). Previously the generic
    route answered 243 with the schema of 244: the client rejected it. `server/pet.js`
    `respondExpedition`: slot 1 always open, 2..`KHUX_PET_TRAIN_SLOTS` open
    until the end of the month, wait `KHUX_PET_TRAIN_HOURS` (20) in `recoverDatetime`, counters
    `expeditionTotalNum/MonthlyNum` in `player.pet.training`, `recoverStoneNum` =
    `KHUX_PET_TRAIN_STONES` (0, not deducted); no Spirit Trait (userShuffleSkills []).
    **server.js must dispatch the kind `petexpedition`** (line to add next to the other
    pet ones: `if (kind === 'petexpedition') return pet().respondExpedition(res, req.method,
    entry.bodyDecoded, req.url.split('?')[0]);`), as long as it is missing the generic response remains.
    «Train» -> 243 -> `PetInfo_TrainingEdit_ver320`: `Win_under` (Button_Sort >
    Txt_Sort, Txt_Sort_Label, Txt_Filter_On, Scroll_Area, Txt_Possession, Txt_Cost/Slash/CostMax_Label),
    `Win2A`, `Close_Button`, `Button_Training > Txt_Training` (106200426), `Arrow01`, `MedalArea`
    with the training slot view: `Medal1..4`, `MedalLock_Panel1..4 > Txt_Caution`,
    `Period_NamePanel1..4 > Txt_Period`. «Training Slots» -> 243 ->
    `PetInfo_TrainingSlotCheck_ver320` (`MedalArea`, `Win_under`, `Close_Button`).
    «Train Now» while waiting -> `PetInfo_TrainingRestartPop_ver320` (`Txt_Wording`
    (rich text `Xml_Txt_Wording` created by the client), `Txt_CrownPossessed(_Label)`, `Txt_Time`,
    `Button_Close/Txt_Cancel`, `Button_Ok/Txt_Ok`). Texts 106240102 and 106270102 missing everywhere
    (locked slots): our own in `TEXTS`. The slot view adds `cocostudio/publish/PetInfoAnim.ExportJson`
    (missing) with addArmatureFileInfo: the armature creation was not found, to be seen on the bench.
    After 244 the client requests /pet/profile and updates the dialog.
  - **Outfits** (`Button_B`): scene `PetEditScene_ver230`,
    twin of `AvatarEditScene_ver131`: nodes `CenterUI_Left` (tab1..tab6 with `Txt_Tab` 106110401-406
    and button «Av_Make_Win_But», `Area` = list of `PetEdit_Panel_ver230` 298x122,
    `Txt_NoPet` 106110409), `CenterUI_Right` (`KB_On`, `Avatar2`, `Pet`, `Pet2`; `Set_ChangeBut_New`
    optional and omitted: it loads missing `PetChangeBut_*.png`), `Decision` (`Button_PetSave`/
    `Txt_PetSave`, `Button_Remove`/`Txt_Remove`), `MyCoordinate` (`Box_Num` <- img/ui/Av_Box_Num%d,
    `Button_Switch`). Save -> 173 -> `PetEdit_Check2_ver230` (`Win_04` > `Txt_Wording` 106110410
    «Style saved!», `Pet`). `Button_Switch` cycles outfits 1..6 over a list made from the
    coordinates of 172 with myCoordinateNo 1..6: beyond the list = crash, so
    `/pet/coordinate/all` always sends the 6. Parts: `userPetParts` [] -> empty list, «There are no
    Spirit parts.»; the icons `img/petParts/pi%d.png` do not exist.
- With `isFinished` 1 at phase 995 the home created the pet (`lwf/pet/motion/...`) and crashed:
  solved with the empty LWFs.
- **Battle** (bench freeze of 11 October, 1010 with `-Pet`: first attack, avatar frozen in
  pose, enemy motionless, AUTO and medals dead, no crash). The pet takes part whenever
  `userDetail.isPet` is 1: no field of `/stage/start` turns it off. The pet plays the 30 motions of
  `lwf/pet/motion/<nome>` (wait, bwait, battle_normal, battle_all, deathblow_normal, battle_skill,
  recovery_skill, jump2, rolling1-3, ...) and changes state **only on the LWF event «end»**; the avatar
  waits for the pet to be ready before its attack: our empty LWFs never sent «end» = endless wait.
  Fix: `recon/tools/make_pet_motions.py` (called by make_layouts.py) writes 30 of OUR OWN
  LWFs (original LWF format) with STOP + EVENT «end_1» at the last frame (like
  atk2) for the 19 motions that end; wait/bwait/walk/run/win/waitb/
  rolling1-2/training are loops without an event. Previously they were invisible, now they animate the parts
  (see «How the pet is drawn» below). The regenerated resources are needed (build-resources).
- **How the pet is drawn** (11 October evening). The motion LWF has no artwork: in it, the movies whose
  INSTANCE NAME is one of 23 names (ac_mask, ac_hat1-4, ear_front1_am, ear_front2_am, ear_back_am,
  face_sp, ac_necklace1-3, left_front_leg, left_back_leg, right_front_leg, right_back_leg, bag_front,
  bag_back, body_main, tail_front, tail_back, ac_special, ac_mouth) get the part
  `lwf/pet/part/%03d/<nome>/<nome>.lwf` attached when they load, with %03d = id % 1000 (if < 400000); it is
  attached again if the outfit changes. The ids come from `userPetCoordinate`: accessoryMask,
  accessoryHat (hat1-4), earPartsId (3 ears), facePartsId, accessoryNecklace (1-3), legPartsId (4 legs),
  accessoryBackpack (bag_*), bodyPartsId, tailPartsId (2), accessorySpecial, accessoryMouth. Optional
  movies: `body_sp`, `spt_shadow` (shadow that shrinks with the jump), `head_sp`, `pet_center` (inside
  face_sp), `<parte>_top`, `spirit`. Extra positions/heights from the master (`petPartsOffset`, empty =
  rest values). The client moves the node (jump2 jumps next to the avatar) and flips it with
  scaleX +-1 like the avatar; the 001 parts face left (forward = -x). The resources contain only the 001
  series (9 parts, pink Kitstar): no `lwf/pet/motion`, no accessories, no ear_front2/
  tail_front/bag. `lwf/ability/hit_effect` has only eff_0001/eff_0002 (names_v4 and names_addnl).
- **Spirit parts** (16 October, bench OK): table `petParts` of 668 rows
  (`server/make-pet-parts.js` from `server/pet_parts.tsv`; khuxwiki names, method in
  `reference\pet\spirit_parts_names.md`). petPartsId 3TTNNN (series NNN = species+colour, folder
  `lwf/pet/part/NNN`) or 4TTNNN (accessory, folder with the whole id); TT = partsType = editor
  tab (4 Head, 3 Ears, 8 Body, 6 Legs, 9 Tail, 1/2/5/7/10/11 Accessories;
  combinationFlag 1 = excluded). `userPetParts[]` = {petPartsId, partsType, getDatetime};
  ownership in `player.pet.parts`, series 001 always, `-AllParts` for the tests;
  `grantPart` for the rewards. Artwork and icons from the JP (`recon/tools/jp_pet_parts.py`, from
  import_jp_coco.py): 445 LWFs that the local reference copy kept only once are taken back from the twin
  series (same texture and size); 38 accessories without textures even in the JP stay out
  (among them Starlight Bow/Glasses and almost all the Limited Balloons). Also **25 original
  motions** `lwf/pet/motion` (wait, walk, battle_normal...: they have the accessory movies; shadow
  97x24 = NPC_SHADOW) instead of ours; battle_all, pvp_start/total_*,
  recovery_skill, rolling3 stay generated (effect textures missing). `petPartsOffset` stays empty (rest
  positions). `GET /pet/coordinate/members` (pets of the party members) is not handled.
- **Visible pet** (11 October evening, to be tested on the bench): `make_pet_motions.py` writes every
  motion as a root with 9 empty movies named like the parts of 001 (only those: no
  load towards missing files) and one pose per frame (PLACE at the first, MOVEM afterwards; strings,
  instances, events and linkage in alphabetical order as in the originals): breathing in wait/bwait,
  legs in walk/run, little hop in jump*/win/recovery_skill, somersault in rolling*, leap with
  a forward headbutt of 80 in battle_normal (hit at frame 10 of 24), jump with a spin and
  thud in battle_all (14 of 26), long dash with a somersault in battle_skill (12 of 28).
  `pet_eff_0001-0003` are now visible: 4-pointed sparkle + trail (0001), ring + star
  (0002), golden ring + trail + star (0003), textures drawn in code (BTF type 8
  premultiplied, name starting with the LWF's name), 11-15 frames. `server/pet.js` sends
  ear/face/leg/body/tailPartsId = 1 if not chosen (with 0 the path is .../000/..., missing).
  Verified with our own reader (outside the repo): the LWFs read back, the parts attach by
  instance name and the events fall on the expected frames.
- **Home crash with the visible pet** (bench 11-10 night, -Quick + -Pet, part ids 1: two
  crashes in a row after /system/push/regist, during rendering). The home builds the pet's portrait
  centred on the head, using the positions of the movies `head_sp` and `pet_center` (inside the
  face_sp part); our skeleton had no `head_sp` movie, and the client checks only `pet_center`. With id 0
  the muzzle did not load and `pet_center` was missing too. Fix: empty `head_sp` at depth 0
  (it loads before face_sp) with the same matrix as the muzzle in all 30 motions. Fallback
  without rebuilding: `KHUX_PET_PARTS=0` on the server = id 0, pet invisible as before (motions
  with the events and visible pet_eff remain).
- **6th-slot medal in battle** (bench 11 October: «it does nothing»). The turn is already there: with the
  pet present the client takes `petBaseSlotMedal` of the deck of the battle's keyblade
  (`startStageData.userKeybladeId` -> userDeckId in `userDecks`) and adds it AFTER the deck's medals (medal
  not found -> master 1 like the empty slots). No other server field: no rank,
  `petSubslot` or `openSkillIds`. The multiplier is `pet.petSubslot.magnification` (x1 with medalId 1).
  The turn counter (all the slots minus the support one) counts it: 4/4 on the bench with 3
  medals (screenshots\pet2_*.png); the wheel (up to 7 cells) shows two of them at a time. (The support
  slot is a different one, `supportUsers` of /stage/start: today [] so absent.)
- On the pet's turn the avatar stays still and the pet attacks with battle_normal or battle_all. The damage
  comes ONLY from the events of the motion LWF, as for the avatar (lwf/avatar/motion/atk2: «knockback_2» +
  «effectStart_1» in the same frame, then «end_1»): the hit shows the effect
  `lwf/ability/hit_effect/pet_eff_0001..0003` (for battle_normal/all/skill). Our LWFs had only
  «end»: the turn passed without a hit. Fix (`make_pet_motions.py`): «knockback_2» +
  «effectStart_1» in the impact frame of battle_normal/battle_all/battle_skill and three
  of OUR OWN `pet_eff_000N` (a missing effect file = crash; the effect closes at the last frame of _root).
  Bench 11-10 evening: the hit lands on the 4th turn, without artwork (later made visible, see above).
- **Who moves on the 6th-slot turn**: single/all attacks -> the PET plays battle_normal / battle_all
  and the avatar stays still; special -> always the avatar, even on the pet's turn. In the original
  (2017 video, `reference\pet\NOTE.md` §9) the special
  of the medal in the Spirit slot is done by the avatar with its cut-in and its animation, with
  the orange «SPIRIT» label on the left; the Blast (Trick) is the pet curling up and
  dashing at the enemy with a golden trail and a burst of stars.
- Tricks in battle: the client puts each `petSubslot.openSkillIds` into the slot of its `invokeType`
  (petSkill row; 4 = by skillValue3) of the pet's 16 slots. Slots: 1 on an enemy's death
  (recovery_skill), 3 Blast (battle_skill), 6 HP Recovery, 7-9 boosts, 10 Combo (skillValue2/10000, then
  rolling1), 11-15 Steal per drop type. Our petSkill has invokeType 1
  for all: `server/pet.js` sends `openSkillIds` [] unless `KHUX_PET_SKILLS=1` (a pet that just follows
  along) until the trick -> slot/values map is verified.

<a id="presents"></a>
## Presents and Equipment

- Presents: `PresentBOXScene.json` with empty `CenterUI`/`LeftUI`, `PresentBOX_Base_ver400`/
  `_Panel_ver131`/`_IconPanel_ver131` copies of the `dark_PresentBOX_*`, texts 103500002/3/13 and
  106250103/4 (`reference\presents`). Dark Road purple frames to be replaced with the blue textures
  (ISSUES I-035).
- Presents protocol (14-10-2026, to be tested on the bench; `server.js` `respondUserPresent`/
  `respondPresentReceive`, save `player.presents[]`):
  - `GET /user/present` = action 20 (`assets431\json\server_api.json`), no parameters (`m=1&i=1`
    is the wrapper of all GETs). All mandatory: `userPresent {userPresentDatas[], presentCount,
    presentCountMax, stonePresentCount, stonePresentCountMax}` (int). Element: `userPresentId`
    uint64, `resourceType`/`resourceId`/`number` int, `limitDatetime` date, `comment` string,
    `created` date (the 1.0.1 client did not have the two `stone*` counters).
  - Scene `PresentBOX_Base_ver400`: all the rows in the scroll view;
    `presentCount`/`presentCountMax` next to «Other» (106250104),
    `stonePresentCount`/`stonePresentCountMax` next to «Jewels» (106250103).
    The server counts types 1/2 as «Jewels», the rest as «Other», maximum 200 for both
    (the jewel maximum is our own choice).
  - `resourceType`: 1/2 Jewel, 3 medal,
    4 Munny, 5 material, 6 Friend Point, 10 Raid Points, 11 Lux, 13 keyblade, 14-17 rewards,
    18-20/23 avatar parts, 25 sphere, 26 Skip Ticket, 28 Skip Ticket+. The server collects 1/2, 3, 4, 5, 11, 13, 14
    (`grantItem`, now also 11 = `player.lux`).
  - `POST /user/present/receive` = action 49: `{receivePresentIds: [uint64]}` (Collect and Collect All).
    All mandatory: `userData.userPoint`, `userMaterials`, `userMedals`,
    `userSkills`, `userKeyblades`, `userDecks`, `userAvatarParts`, `userTitles`, `pet`, `emblemIds`,
    sub-slots, Burst lists (like `/user/mission/receive`), then `lastUserPresentIds` [uint64] =
    gifts REMAINING: the client marks as collected those of its list that are missing.
    `userStone` is no longer read (1.0.1 did read it): the server sends it anyway.
  - `/mypage` `userPresentCount` = valid gifts (button badge). Expired ones (`limitDatetime`
    past, server time) removed at every read.
  - Test: `KHUX_TEST_PRESENTS=1` adds 6 gifts (300 jewels «Daily Login Bonus Reward», 1000
    Lux, 5000 Munny, 6 Avatar Coin, Dewey 90041, 3 Mythril Shard; expiry +29 days) when
    no test gift is left in the box (`test: true`).
- Equipment (`DeckEditScene`): needs `GET /keyblade/subslot` (see
  [server.md](server.md#catena)).

<a id="keyblade-tutti"></a>
## All keyblades: ownership, Level Up, evolution (I-087)

- 16 series in the master (rev. 95, 576 rows = 36 levels +0..+35 each, `make-keyblade-levels.js`),
  like the khuxwiki (`reference\keyblades\keyblade_levels.json`). Sources: Starlight at start; first-win
  reward in the master only for Treasure Trove (Q14, stage 1110), Lady Luck (Q24, 1210),
  Three Wishes (Q34, 1310), Olympia (Q130, 4100), Divine Rose (Q433, 15080). The other 10 in the original
  game came from Proud Mode (Sleeping Lion Q3, Counterpoint Q103, Fenrir Q203, Darkgnaw
  Q328, Missing Ache Q378, Diamond Dust Q428), from the Moogle Quests (Moogle O' Glory) and from quests beyond
  525 (Stroke of Midnight Q595, Fairy Stars Q683, Bad Guy Breaker Q880): none was in the master. Since 21-10 (quests
  526-979, I-009) the last three are first-clear rewards of their quests (stage 20100, 26080, 39060; `clearGetItemType` 13).
- Save of 12-10: Starlight +0, Treasure Trove +35, Lady Luck +0, Olympia +0. Three
  Wishes was missing with stage 1310 cleared (the reward recovery ran only with `player.keyblades`
  missing) and the 10 without a source.
- `server.js` `grantMissingKeyblades` (at startup with a created player and at `/user/create`): rewards
  already received (repair), series without a reward in the master (`KHUX_KB_UNOBTAINABLE=0` turns them off),
  with `KHUX_KB_ALL=1` also the story ones not yet reached (Divine Rose). One keyblade per
  series, never duplicates; new decks of zeros as long as the slots (5 for the Proud and BGB keyblades).
  On the current save: userKeybladeId 5 Three Wishes, 6..15 Moogle O' Glory .. Bad Guy Breaker.
- `node server\test-keyblades.js`: evolveId chains +0..+35 without gaps or cycles, slots and gauge never
  decreasing, materials = khuxwiki post 2.6.0 and present in `material`, Strengthen of every series up to
  +35 (exact materials removed, no munny: the khuxwiki has none, 3 design changes = 3
  `KeyBlade_Evolution` animations, no step beyond +35 nor without materials), userKeyblades/
  userDecks consistent, 120 sub-slots, 16 passives at +35, gauge cut at the row's maximum.
- Bad Guy Breaker +4/+9/+14/+19/+24/+29/+30: in the original only Trophy NI/CS/CK (missing from
  `material`): row with `validNeedMaterial` 0, the step is free (bench 15-10: empty materials list,
  Strengthen works, BGB reaches +35). **To be redone like the original when quests 880-915 exist**
  (user's decision, 15-10): the Trophies were obtained one at a time with the third objective («Complete without
  having to continue») of quests 880 and 885 (Trophy NI), 890, 895, 900, 905 (Trophy CS), 915 (Trophy CK);
  not sellable, used only by BGB (khuxwiki «Keyblade#Trophy»). The 3 rows in `material` and the rewards
  of the third objective of those quests are needed; BGB itself was obtained at quest 880.

<a id="keyblade-oltre-35"></a>
### Beyond +35 (15 October analysis, 16 October tested on the bench)

- In the original WW one went beyond +35: steps of 0.1 up to +60, Bad Guy Breaker in integers (screenshots
  `reference\equipment`: «Starlight +52.2», «Bad Guy Breaker +41»); data in `reference\keyblades\keyblade_levels.json`.
- Client 4.3.1 (agent, private notes): keyblade row of 25 fields, `lv` int, no decimal field; extra keys
  ignored. Title = `name` as is, no «+%d.%d». `lv` is used only for «Unlock +%d» of the locked slots and by
  action 54 (`lv == 30` -> an event). Maximum = only `evolveId 0` («Keyblade level max.», 101900006,
  Strengthen off); the window's materials are shown by `validNeedMaterial` even with evolveId 0 (that is
  why materials were visible at +35). The confirmation popup needs the `evolveId` row (no null check).
  No cap at 35/60 in the client. `passive`/`passivePower` of the keyblade row not read: the passives go through
  `passiveSetting` + `PUT /passive/list` (already generated up to +60 by `make-passives.js`).
- Server (15-10, not yet regenerated nor installed): `make-keyblade-levels.js` extracts all the levels and adds
  +35.1..+60 (id series*1000+216..465, BGB series*1000+lv*10; `lv` integer, `lv10` for the server; design of the
  +35 row; +60 with evolveId 0 and without materials); `keyblade-evo.js` uses `lv10` for the passives. ~3775 new rows.
  To do: regenerate (`node server\make-keyblade-levels.js <keyblade_levels.json>`, the reduced table must be redone
  from the reference), compare the master, raise the revision, test on the bench (loading times, title
  «+35.1», passives at +35.5, «Keyblade level max.» at +60).
- 16-10, **master 112**, tested on the bench: regenerated (4351 keyblade rows); the khuxwiki has a typo in Darkgnaw
  (50.6..50.9 written «50.1», the partner multiplier always grows by 0.0024): `extract` fixes it. Bad Guy
  Breaker +35 -> +60 in integers (comparison «+36», popup «You learned a passive effect!» at +37, «Not enough materials.»
  at +55 with the test save, at +60 «Keyblade level max.» and Strengthen grey); Starlight +35 -> +35.1 ... +35.5
  (title «Starlight +35.1», multipliers +0.02, passive 101355 at +35.5). `test-keyblades.js` now goes to +60 (OK,
  passives 791/791). Slower login at first startup (77 s with a bigger master, then 18 s). Bench script
  `D:\Progetto_Restauro_KH_UX\tmp\kb_loop2.ps1 -N <passi>` (also closes the passive popup). Test save:
  materials at 9999, copy beforehand in `tmp\player_before_kb60.json`.

### Unlock by quest (12 October, offline)

- Sources: khuxwiki (`D:\Progetto_Restauro_KH_UX\wiki\wiki_all.json`: keyblade page «obtained
  by completing ...» and field `nakeyblade`/`proudnakeyblade` of the quest page), the user's
  guide (`reference\guida_basi\Guida alle basi KHUX.pdf`, «Keyblade - Come ottenerli»: all
  except Bad Guy Breaker, which came later). They agree.

| Keyblade | Original quest | In the master (rev. 98) | How the server gives it |
|---|---|---|---|
| Starlight | starting | initItem | starting (userKeybladeId 1) |
| Treasure Trove | Quest 14 The Mine Pt. 2 | stage 1110, clearGetItem 13 = 2000 | first `/stage/clear` |
| Lady Luck | Quest 24 Escorting Alice Pt. 2 | stage 1210, 3000 | first `/stage/clear` |
| Three Wishes | Quest 34 The Search for the Red Bandit Pt. 5 | stage 1310, 4000 | first `/stage/clear` |
| Olympia | Quest 130 Preliminary Final Round | stage 4100, 5000 | first `/stage/clear` |
| Divine Rose | Quest 433 The West Wing Pt. 6 | stage 15080, 6000 | first `/stage/clear` |
| Moogle O' Glory | Special Quest «A New Keyblade: Moogle O' Glory» | missing | `grantMissingKeyblades` |
| Sleeping Lion | Proud Quest 3 Combat 102 | stage 1016 normal only, no reward | `grantMissingKeyblades` |
| Counterpoint | Proud Quest 103 | stage 3220 normal only | `grantMissingKeyblades` |
| Fenrir | Proud Quest 203 | stage 7030 normal only | `grantMissingKeyblades` |
| Darkgnaw | Proud Quest 328 | stage 11280 normal only | `grantMissingKeyblades` |
| Missing Ache | Proud Quest 378 | stage 13030 normal only | `grantMissingKeyblades` |
| Diamond Dust | Proud Quest 428 | stage 15030 normal only | `grantMissingKeyblades` |
| Stroke of Midnight | Quest 595 | stage 20100, 10000 (since 21-10) | first `/stage/clear` |
| Fairy Stars | Quest 683 | stage 26080, 14000 (since 21-10) | first `/stage/clear` |
| Bad Guy Breaker | Quest 880 | stage 39060, 16000 (since 21-10) | first `/stage/clear` |

- Server: `respondStageClear` -> on the first completion (`stageId` missing from
  `player.stageScores`) and `validClearGetItem` > 0, `grantItem` of each `clearGetItemType`; type 13
  goes into `grantKeyblade` (one copy per series). The response carries `firstClearFlag` 1 and the full
  lists `userKeyblades`/`userDecks`/`userKeybladeSubslots` with the new keyblade (deck of zeros
  as long as the slots). No keyblade reward in the objectives (`submissionRewardType` 13: zero
  rows). `grantMissingKeyblades` at startup gives only the series that no stage rewards, plus the rewards
  already received but missing (repair): the 5 of the story never before completion (unless
  `KHUX_KB_ALL=1`, for tests only; in that case on completion the popup appears but no duplicate).
- Client (results scene of a normal stage): the keyblade popups come from the type 13 entries of
  (a) the `reward` rows of enemies and chests, (b) the new objectives, i.e. the response's
  `clearMissionIds` not already achieved, with `submissionRewardType/ItemId/ItemNum` of the stage row,
  (c) if `firstClearFlag` of the `/stage/clear` response is 1, the `clearGetItemType/Id/Num` of the row
  (`validClearGetItem` entries). For each entry the client opens the popup `BattleResult_KB` (image
  `KeyBlade_%06d`, name, «Set Medals in your new Keyblade!», label «Quest Completion Reward» 103010011/12
  for the completion, 103010001/02 for the objectives). No cutscene and no «new keyblade» field: the popup
  depends only on `firstClearFlag` and on the stage table; the real keyblade is the one in `userKeyblades`.
- `node server\test-keyblade-unlock.js`: new player (`/user/create`), then `/stage/clear` of
  every quest: right keyblade only once, simulated popup x1, second time and objectives with
  nothing, Proud in normal with nothing, restart without duplicates, repair of Three Wishes.
- Bench (save of 12-10: 1110/1210/1310/4100 already cleared, 15080 not, Divine Rose missing):
  `server\save\smoke.json` = {"stageId": 15080}, relogin, play The West Wing Pt. 6 -> RESULTS ->
  Divine Rose popup -> Equipment with Divine Rose (3 empty slots).

<a id="notices-album"></a>
## Notices and Album (Other menu, I-104/I-105; 14-10, offline)

- **Notices**: the button sends POST /system/information/list/151203 (action 31): `popUpViewUrl` =
  array of strings, mandatory. The client opens a WebView on the first element (with the session
  parameters added) without checks: with the generic response the client crashed (bench 14-10,
  tmp\repro\notices). At least one URL is needed.
- **News at login** (like the original): the same action 31 starts from the home, and the client shows in
  sequence one WebView for each element of popUpViewUrl (the first with the session parameters). With a
  single URL the news page opens at every entry into the home (894 requests 31 in the log: the client
  always asks for it).
- GET /system/information/list (action 30): viewUrl string; not seen on the bench, same page.
- WebView layout: Information2_Base.json, or dark_Information2_Base.json in Dark Road
  (the Beginner's Guide opens: probably the dark one applies today, to be verified).
  Information2_Base is not served: the JP original (identical to the one in the WW 4.4.0 IPA, same
  textures) is in jp_coco_layouts.txt.
- Our own page /web/notices (server/routes-info-album.js): list like
  reference\other_menu\notices_list_yt_02.jpg (date, coloured label EVENT/CAMPAIGN/UPDATE/
  IMPORTANT/INFORMATION, title, red arrow), detail like notices_detail_yt_03.jpg (subheadings
  with the little square, BACK). Restoration news (private server, Supernova and Dual Meow Wow, enemy
  artwork, buffs of the specials, quests), no invented original news.
  Two news items of 16-10: «About game data updates» (pinned at the top, title «Game data updated today» on the day
  of the update; countdown computed by the server on the real time, never absolute times) and
  «Differences from the original game». Rule: every feature that differs from the original has a news item.
- **Album**: GET /user/album/161102 (action 17):
  userAlbum {albumMedals[] {medalId uint, guiltStatus uint read as a byte}, allMedalCount
  int}, all mandatory (generic response = crash, tmp\repro\album).
  Scene AlbumScene_ver130 -> Album_Base_ver130 (Win_Bottom, Txt_MedalGet*,
  Txt_MedalComp*, Scroll_Area, Txt_Challenge, Button_Challenge), cell Album_Medal_ver140:
  medal owned = in albumMedals, otherwise Medal_S_0 and «?» in
  Txt_Medal_Label; icon AlbumGuilt_1/2/3 for guiltStatus 0/1/2, only if userDetail.isGuilt and the
  medal's tier (`guiltValue`) is not 0. Challenges: Album_Challenge_ver112, Album_Reward_Set_ver112;
  POST /user/album/challenge/update (action 168). **Not reachable in WW 4.3.1**
  (15-10): the client always hides and disables Button_Challenge, as in the videos of the original
  (`reference\album`): nothing to serve.
- No Album layout is served in the WW: the JP originals are in jp_coco_layouts.txt (test
  --check: 7 roots ok). The JP cell has no Txt_Medal_Label, which the WW code uses without checking:
  new option clone=Txt_Medal_Num_Label>Txt_Medal_Label@Medal_S of import_jp_coco.py (copy of the
  widget, new tag, at the position of Medal_S).
- Our own guiltStatus (the original values are not known): 0 = no copy with Special Attack Bonus,
  1 = at least one, 2 = one copy at the tier's maximum bonus (GUILT_RANGES of medal-guilt.js).
  allMedalCount = rows of the medal table except medal 1 (original: «Medals 1837/1930»,
  reference\album\album_yt_01.jpg).

<a id="notices-stile"></a>
- Notices, style and timing (19-10, user's request): detail like `notices_detail_yt_03.jpg`/`notices_dialog_01.jpg`
  (background #0d3350, wide line spacing, label and date at the top, subheadings with the little square, keywords «**x**» in
  orange, «## Sezione» = subheading with a bulleted list, blue BACK fixed at the bottom); «Differences» split into sections.
  Timing of the popup at login: measured with `D:\Progetto_Restauro_KH_UX\tmp\ntime_login.ps1` (server 3 ms; client:
  ~1 s of empty frame before it requests /web/notices, page drawn ~1 s later). The page calls
  `/web/notices/shown` as soon as it is drawn and the server writes «[notices] pagina disegnata N ms dopo la richiesta»:
  with the phases measured by the WebView (response, DOM, load). **Cause of the slow cases (~10 s)**: while the WebView prepares
  the page, Google Play Services downloads a font from `fonts.gstatic.com`; the TLS connection fails after seconds
  (device clock at 2021) and the page keeps waiting (response 0.6 s, DOM 9.4 s). `server/dns.js` answers
  NXDOMAIN to `fonts.gstatic.com` (list `BLOCK`): 3 re-entries out of 3 with the page in 1.1-1.5 s. Rare symbols (⤶, ▶) of the
  BACK and of the arrow replaced by CSS shapes.

<a id="tricks"></a>
## Tricks, points and ranks of the Spirit (I-137, 20-10)

Research: `D:\Progetto_Restauro_KH_UX\tmp\pettricks\RESEARCH.md` (tables and slots) and `reference\pet\medal_points_wiki.json` (points).
- `make-pet-tables.js`: 22 petSkills (invokeType = pet slot: 1 Steal, 3 Blast, 5 Esuna, 6 HP
  Recovery, 7/8/9 Poison/Sleep/Paralysis Boost, 10 Combo, 4 + sv3 1/2/3 = slots 11/12/13 P/S/M Attack Boost; sv1 =
  charges); petRank with needPt and multiplier from the wiki, **validOpenSkill = number of ids** (the client copies that
  number of ids into the list: with 1 the list showed only the first). Blast: medal 3-7 (copies of 2) with burst 12-16
  damageType 2, sp1 = damage x 10000, one hit; 25% threshold reconstructed. **`target 2`** (20-10): the targets are the enemies
  marked by the condition; with `target 1` the client took the enemy chosen by the player,
  none for the pet, and crashed on defeat. Bench 20-10 night
  (quest 524): Blast V, HP Recovery, Esuna and Combo seen, quest finished.
- `pet.js`: Tricks on (`KHUX_PET_SKILLS=0` turns them off), one id per slot; points = addPetPt +20% with at least one trait.
- `server.js`: Steal (isSteal at /stage/start -> 50% per enemy with a drop, the first marked stealType 1; /stage/clear x
  sv3). Multiplayer quests: no drops, no Steal.
- Medal points: `server/pet_points.json` (406 names with `|pet=` from the khuxwiki or the SN/SN+ 120 rule), the rest
  by SAB tier (15/15/15/20/20/20/30/80/180/270), below 6★ 15 (reconstructed). Notices «Spirit Tricks», «Spirit
  points and ranks».
- Bench 20-10 (`provetm`, rev 158): list with the rank's 11 tricks, rank 14 x3,600, «LV Up in 162» (1944 - 1782),
  SN++ MoM Riku 432 (360 + trait), the others 270.
- **Crash on Naminé's special** (bench 20-10): the P/S/M Attack Boost trick opens
  `lwf/ability/hit_effect/pet_eff_0005` (Esuna/HP Recovery = pet_eff_0004), missing from the resources:
  a missing effect = crash. Imported from JP 4.3.1 pet_eff_0004-0006 (`originals.tsv` section 34, 6 textures
  copied from the sibling folders; analysis in `D:\Progetto_Restauro_KH_UX\tmp\pettricks\CRASH.md`), `-Quick` on 49.

<a id="spirit-trait-scelta"></a>
## Training Special Trait: keep or replace (20-10)

User's report: the training replaced the Special Trait immediately. Original (NA notice 52202 v3.2.0 «you can
choose whether to keep or overwrite the current Special Trait», video kTJoSgXii1E; research in
`D:\Progetto_Restauro_KH_UX\tmp\pettrait\RESEARCH.md`): empty slot -> it goes in immediately; occupied slot -> window
`MedalInfo_SkillChangeWindow` with the «Special Trait» section (opened by «TAP SCREEN» if the client finds
in `medalResumption` status 1 a pending entry with the medal's userMedalId), OK «Replace X with Y?» / Skip «Y will be lost.
Okay?» -> action 57 like the fusion. Server (`pet.js spiritTrait`): occupied slot -> `player.traitPending` (type 1), the
244 response sends the pending entries of the trained medals first; `medal-trait.resumption` sends the whole queue.
Test: `test-trait-choice.js` (Special Trait section). Bench 20-10: tested by the user (training on SN++ MoM Riku/Xion
with a Special Trait already present: choice window), ok.

<a id="login-bonus"></a>
## Login bonus (I-176, 20-10)

Full research in `D:\Progetto_Restauro_KH_UX\tmp\loginbonus\RESEARCH.md` (sources in `reference\login_bonus\NOTE.md`).
- **Protocol**: `/khux/login` (and `/user/create`) `gameLogin.acquirableLoginBonus` -> with true the client calls
  action 65 `POST /login/bonus` (body `isTrackingEnabled`, `advertisingId`, ignored) and opens the login bonus scene.
  Response (all mandatory): `loginBonus {continue {loginBonusId, dayCount}, total {loginBonusId,
  dayCount}, specials [id]}`. No inventory in the response: rewards in the Presents.
- **Scene**: Daily panels = all the `bonusType` 1 rows (exactly 5 are needed,
  widgets `Area_Cont`.._5); stamps up to the `day` of the `continue` row; Total «Day N» = `total.dayCount`, icon of the
  `total.loginBonusId` row (0 = none), «Day %d Reward» = first type 2 row beyond N; `specials` = blue popup
  `LBonus_Memory`. Every id sent must exist in the master (missing row = crash).
- **Master** `loginBonus` (removed in 5.0.1, served empty until 20-10): `server/make-login-bonus.js` from a decoded
  1.1.3 table of the local reference data (`reference\login_bonus\loginBonus_1.1.3_decoded.json`, outside the repo): Daily 100-104 with
  100/100/200/200/300 jewels (v2.3.1, notice 32990; 1.1.3 had 50/50/100/100/200), Total 200-292 (93 milestones
  up to day 1850, jewels or titles 14001-14047). Specials (types 3/4) not served.
- **Rules** (`server/login-bonus.js`, user's choices 20-10): day = missions day (08:00 UTC; original
  4:00 a.m. PT), one login bonus per day, Daily = (Total - 1) mod 5 + 1 without reset if a day is skipped,
  rewards in the Presents («Daily Login Bonus Reward», «Total Login Bonus Reward»), state `player.loginBonus {lastDay,
  total}`. Only with the tutorial finished (the layouts arrive with the resources). `KHUX_LOGIN_BONUS=0` turns it off. Notices: «Login
  Bonus». Test: `node server/test-login-bonus.js`.
- **Assets**: none in the WW 5.0.1/4.3.1 resources; from the 2016 WW package (`originals.tsv` section 33: 6 layouts
  `LBonus*`, `LoginBonus_*.png`, `Result_Num.png`, `LBonusAnimation*`, the 3 LWFs of `lwf/loginbonus`, 58 files). Texts
  `text/ui` 104500001-008 already served. Stamp: the 2016 LWF (= JP .00103151) ends big in the centre; the one in the
  2020-21 screenshots (small at the top right, also on Total and the special popup) is the JP revision 00191275 (scale
  0.439), with the 5 textures from 2016. Sound: no event in the LWFs, the scene plays `audio/509100630.akb` at every stamp,
  missing in the WW resources: from 2016. No BGM of its own.
- **Bench 20-10** (`provetm`, -RealNow 8-12): the scene starts after the Notices are closed; day 1 (stamp 1,
  Total «Day 0001» 300 jewels, «Day 2 Reward»), day 4 (title 14001 x1, «Received a title!» from the Presents). After a
  revision change the first login («Download» popup of the master) does not open the scene: it opens at the next login.
  Day 5 with the JP stamp: small at the top right on all the panels and on the Total, like the screenshots; sound at every
  stamp (confirmed by the user).
