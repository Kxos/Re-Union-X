# Events (non-raid event quests): what the client needs

Status: mapping done 6 November 2026 (Events Part 1, Task 1). Read-only: the 4.3.1 master types (`recon/out/master_types_ww431.json`),
our notes, the private client notes and a donated Worldwide master snapshot of 2021 (untrusted, read only, no row copied here).
Raids are already served through the same Events tab, see [raid.md](raid.md); this note covers what a quest event needs **beyond** a raid.
Anything not proven on the bench is marked **(unverified)**. Design: `docs/superpowers/specs/2026-11-06-events-design.md`.

## How an event reaches the screen

- The Events tab sends `GET /stage/event` with `eventCategory` 2 (Special is 1; no other value was ever seen from the 4.3.1 client).
  The reply is built by the server (`events[]`, each with `stages[]`, `eventStageId`, `showIcon`, `bannerUrl`, `eventType`, `status`,
  `endTime`, `newStageId`, `isLock`, `complete`; see [server.md](server.md#eventi)). The list is not filtered by master category, time or weekday.
- Every `eventStageId` listed (and every stage in it) must exist in the master `evStage` / `stage` tables, or the client crashes.
  The event list banner opens the quest list of the event; `/stage/start` carries `eventId` = the `eventStageId`.
- A master table that breaks the schema is dropped as a whole ([raid.md](raid.md), «evStage rows and the client's master»):
  `evStage.stageId` is `int[5]`, so one row with more than 5 stage ids kills the table. Rule from the raids: keep the first 5 ids and put the
  full range in `stageStartId` / `stageEndId` (the server lists the stages itself).

## `evStage` fields (one row per event, or per day of a daily event)

All fields are mandatory in the master. What a non-raid quest event sets:

| Field | Raid rows | Quest events (pilot rows of the donated 2021 master) |
|---|---|---|
| `eventCategory` | 2 | 2, 3 or 4 in the donor (3 = most quest events, 4 = High Score). The client never filters by it in the list; **on tap, 4 selects the High Score mode, anything else is a plain quest list** (bench 30-10). So our rows keep 2 except High Score (4) |
| `eventType` | 2 (raid button, Raid Boards: raids only), 0 (catalog banner), our events: the donor value (07-11) | 1 on most quest events (daily, coins, quiz, Org XIII, time attack), 3 on the countdown dailies, High Score, the keyblade and the character-return events, **(unverified)** what the client does with 1 and 3 (the 30-10 note says 1/2/4 are board/raid modes: check on the bench before relying on it) |
| `validStageId`, `stageId[5]` | count and first 5 ids | same; with more than 5 stages the donor uses `validStageId` 0 and the range |
| `stageStartId`, `stageEndId` | first and last stage | same; the range is contiguous in stage ids but not in every id between |
| `validStageWidthId` | 0 | 1 on range rows (the donor), meaning «use the range» **(unverified)**; 0 on a one-stage daily row |
| `parentEventStageId` | 0 | a shared parent id on later events (grouping under an earlier event row); 0 on the earliest. The client use is not known **(unverified)**; the server can leave 0 |
| `resetFlag` | 0 | 1 on most of the pilot rows (progress reset), 0 on COIN and on the daily countdown. Client effect **(unverified)** |
| `startTime`, `endTime`, `endDispTime`, `boardEndTime` | all must parse as dates | `startTime`/`endTime` in the original period; `boardEndTime` equals `endTime` on all pilot rows (1 hour after the end only on raid rows); `endDispTime` is a sentinel (a year-2015 date) on 1,013 of 3,103 donor rows |
| `weekMonday`..`weekSunday`, `benefit*` | all 1, all 0 | all 1, benefit 0 on the pilot; the client never reads them (bench 30-10) |
| `scoreMedalListId`, `scoreStartReward`, `scoreEndReward`, `rankingId` | 0 | set only on the High Score row (a medal list id and three reward/ranking ids) |
| `mypageBanner` | 0 | a banner id (per family: 5500, 5600, 5700...) |
| `bannerUrl`, `detailUrl` | ours | `detailUrl` not empty gives the banner a Details button (WebView, no `?` in the URL) |
| `groupPattern`, `validMinute` | 0 | 0 on **every** one of the 3,103 donor rows: the client has no time-window use we need. A window shorter than a day (e.g. 45 minutes) is expressed by `startTime` / `endTime` only |
| `benefitId` | 0 | 0 on all pilot rows (100 on 89 other donor rows: campaigns) |

Time zone: the donor rows start at 07:00:00 (midnight Pacific in summer) and end at 06:59:59; the daily rows run 07:00 to 06:59:59 of the next day.
A daily event is **one `evStage` row per day**, each with one stage (the pilot countdown has 6 rows for 3 names).

## `stage` fields an event quest uses

Same row shape as a raid fight stage ([raid.md](raid.md), «Fight stages»), `stageKind` 2. What the pilot sets beyond that:

- **Cost**: `useAp` (5 on the pilot rows; the cost of an event stage is changed by `evCampaign`, as for raids).
- **Continue**: `disableContinue` 1 forbids continue (popup text 103000017, as on Proud). Set on High Score and the Org XIII challenge.
- **Level add**: `addLevel` (+N to the enemy level, shown in the raid popup only; no battle use found on the story rows). Set on boss-style quests (Titan, Shiva, Ramuh: 499 / 1999 / 4999).
- **Keyblade held**: `holdKeyblade` = a keyblade **series id**; without it the popup says «You need this Keyblade» and Start is disabled (no crash), see [mappe_storia.md](mappe_storia.md). The pilot COIN event uses series 1000..10000 (five stages).
- **Conditions**: `hardmodeRequire` (+ `hardmodeName`, `hardmodeComparison`, `hardmodeNum`): the codes are those of the Proud conditions (2 attribute, 3 darklight, 5 rarity, 6 guilt tier, 7 level, 8 STR, 9 DEF ...). Values on the pilot: 0 and 1 (no limit) on most, 10 on the Titan and Shiva hard stages. This is where an **attribute** restriction lives. **Deck cost** has no field in `stage`: the player's deck cost is checked by the client against `maxDeckCost` of the user data (`/stage/start`).
- **Turn limit, time limit, no-continue, chests, keyblade**: not stage fields but **objectives** (`submission*`). The codes seen on the pilot are the ones `make-story-oltre.js` already knows: 3 defeat N enemies, 4 defeat an enemy N times (id type 1), 5 / 6 special attacks at least / at most, 7 turn limit, 8 battle limit, 9 no damage, 10 no continue, 12 defeat the target in N turns, 13 single-hit damage, 17 chests, 25 equip a keyblade (id type 5), 28 clear in 1 turn, 29 Lux, 32 hits at most, 33 hits at least, 37 time limit in seconds. `combinedSubmissionFlag` 1 (all together) on the countdown, quiz and Egg Hunt.
- **Objective rewards**: `submissionRewardType` / `submissionItemId` / `submissionItemNum` with `validSubmission` 3. Reward types seen: 3 medal, 7, 15 Event Coins, 26, 28 Skip Ticket+, 33 Spirit part, 40. 15 is **not paid** on event quests until the event boards exist ([bacheche.md](bacheche.md)); never as Raid Coins (see «Calendar and routes»).
- **First-clear reward**: `validClearGetItem` with `clearGetItemType/Id/Num`: **0 on all 16 pilot events** (19 of 3,852 event-range donor stages have one; `validClearGetSphere`, `validClearGetTitle` never). So a quest event pays only through its objectives.
- **Drama**: `validBeforeDrama` / `validAfterDrama` set on the Quiz (every stage), the Dark-Winged and New Friend events: the dialogue ids point at drama files (**unverified**: whether our resources have them).
- **Map**: `stageBinId` 0 on most pilot rows; the quiz sets bins 740260-740262. The client loads `mappoi_stg<stageBinId>`, or `mappoi_stg<stageId>` when the bin is 0; the donor `mapName` is a placeholder («...»).
- **Boss**: `raidBoss` is a `raidSetting` id of the 2016 table (2000 = Behemoth ...). The client does not dereference it from a story or event row ([raid.md](raid.md), audit): our event stages should set 0.
- Music: `bgmField`, `bgmBattle`, `bgmBoss` ids per world.

## The 16 pilot events

Rows (census id, family, period, `evStage` rows, stages, notable fields). All are in category 2, 3 or 4 of the donor, none is in our master (no `stage` or `evStage` row), and none sets a first-clear reward.

| Census | Family | Period | evStage / stages | Notes |
|---|---|---|---|---|
| EV-0753 | CELEB | 04-01..04-07 | 6 / 6 | daily, one row per day, type 3, 3 objectives incl. chests/no-continue, combined |
| EV-0759 | COIN | 04-02..05-01 | 1 / 3 | `holdKeyblade` objective (equip a keyblade, id type 5), turn limit, no-continue; reward type 15 |
| EV-0760 | EQ | 04-04..04-14 | 1 / 10 | `addLevel` 99..1499, turn-limit objectives, parent row |
| EV-0761 | CELEB | 04-07..04-10 | 3 / 3 | daily, no-continue only |
| EV-0763 | QUIZ | 04-07..05-01 | 1 / 10 | before/after drama on the stages, combined objectives, own `stageBinId` |
| EV-0764 | CELEB | 04-07..04-14 | 1 / 12 | 12 stages, "defeat all within 1 turn" |
| EV-0765 | EQ | 04-07..04-15 | 1 / 3 | Beginner/Intermediate/Advanced: `addLevel` 499/1999/4999, `hardmodeRequire` 10 on the hard tier |
| EV-0771 | HSC | 04-12..04-19 | 1 / 1 | **category 4**, `scoreMedalListId`, `scoreStartReward`, `scoreEndReward`, `rankingId`, `disableContinue` 1, objectives on defeats, specials, Lux |
| EV-0772 | CELEB | 04-14..04-21 | 1 / 25 | story-style, drama, mixed objectives, many maps |
| EV-0774 | COIN | 04-14..04-24 | 1 / 5 | `holdKeyblade` 1000..10000, `addLevel` 999..1999, `hardmodeRequire` 1 |
| EV-0775 | EQ | 04-15..05-01 | 1 / 4 | time-limit objectives (code 37), `addLevel` 1999 |
| EV-0776 | EQ | 04-15..04-22 | 1 / 3 | as the Titan layout |
| EV-0777 | CELEB | 04-15..04-22 | 1 / 5 | defeat-an-enemy-N-times objectives (id type 1), combined |
| EV-0781 | STORY | 04-20..05-01 | 1 / 12 | `disableContinue` 1, `addLevel` 499..4999 |
| EV-0783 | KEY | 04-21..04-28 | 1 / 34 | 34 stages over several days, equip-a-keyblade objective, drama; more than 5 stages so range |
| EV-0784 | EQ | 04-22..05-01 | 1 / 3 | as the Titan layout |

**Values our master does not have** (all of them, for the 16 events): the `evStage` and `stage` rows themselves; the `raidBoss` settings they name; the
maps in our own WW resources (`stage_gen` holds none of the pilot map keys). The stage tables do not name enemies or drops: those come from the map files
(`mappoi_stg<key>*.bin`) and the `enemy` / `reward` tables.

**Map presence in the Japan 4.3.1 data** (re-derived 6 Nov; this replaces an earlier claim from the census field `maps_in_jp431`, which counted the single
value 0 of `stageBinId` and so understated it). Key per stage = `stageBinId`, or the stage id itself when `stageBinId` is 0 (the client loads
`mappoi_stg<key>`, see [mappe_storia.md](mappe_storia.md)). Stages / keys found in the JP 4.3.1 `stage/` folder / missing: EV-0753 6/6/0, EV-0759 3/3/0,
EV-0760 10/10/0, EV-0761 3/3/0, EV-0763 10/10/0 (own bins), EV-0764 12/12/0, EV-0765 3/3/0, EV-0771 1/1/0, EV-0772 25/25/0 (15 own bins), EV-0774 5/5/0,
EV-0775 4/4/0, EV-0776 3/3/0, EV-0777 5/5/0, EV-0781 12/12/0, EV-0783 34/34/0, EV-0784 3/3/0: **120 of 120 pilot stages have a map file**.
**Unverified**: that each file is the same quest content as the Worldwide event (the donor stage ids equal the JP file keys, but the JP and WW versions of a
quest can differ in enemies and drops), and that the file loads on the WW client (checked only by name, not opened). Per-stage ids stay in the private notes.

## Id ranges

Checked on our master (`server/master_data`, 6 Nov 2026):

- `stageId` and `eventStageId` are `int` in the types, and the server validates `int` as signed 32-bit (-2147483648..2147483647). The donor's largest stage id is 201,609,281, also in range.
- `evStage` ids used: 7000-7999 (Special), 8000-8999 (raids and the Raid Catalog). **20000-29999 is free** in `evStage` (the donor uses 200xxx-210xxx and 9100, no collision with 20000+r).
- `stage` ids used: 1010-39159 (story), 970000-989999 (Special, raids), 1000000-1039159 (Proud and its copies). **4,000,000-4,006,500 is free** in `stage` and in every table with a stage-id column (`evCampaign`, `theater`, `colosseumStage`, `multi*`: none above 1,039,159). Other id spaces of the raids (raidEnemy 2,000,000+, boards 3,000,000+, raidReward 200,000,000+) are different tables.
- Proposal confirmed: `evStage` 20000 + r (r = event row index, room for 10,000 rows) and `stage` 4000000 + n (room for the ~6,500 stages of the census, 4,000,000 to 4,009,999 in all). The two key spaces do not clash: the server must not look up an `eventId` in the stage table or the reverse.

## Open points for the next tasks

1. What `eventType` 1 and 3 do on the tap (board button? plain list?). Plan: serve 1 and check the quest list on the bench; if a raid-style button appears, use a different value.
2. Whether `parentEventStageId`, `resetFlag`, `validStageWidthId` have any client effect; start with the donor's values.
3. Daily events as several `evStage` rows: confirm `/stage/event` lists only the day's row (server decision, not client).
4. Drama ids of each pilot event: found/missing per event goes into the data, not into this note. Maps: the JP files exist for all 120 pilot stages; compare their enemies and drops with the WW quests before serving.
5. `eventCategory` 4 for High Score rows: confirm the tap opens the High Score mode with a stage row of `disableContinue` 1.
6. Reward type 15 (Event Coins) is not paid on event quests until the event boards exist (Task 4; the raids keep paying their own coin
   tables as before).
7. Event card images: made by Task 6 (see «Cards and maps» below); served once the user approves them.
8. Event map POI and reward rows: written by make-events.js in the master run (Task 6, see «Cards and maps» below).

## Calendar and routes (Events Part 1, Task 4: tests only, bench pending)

- **Index**: `server/game_data/events.json` (make-events.js), read once by `server.js` (`KHUX_EVENT_INDEX` overrides the path for tests);
  absent: the Events tab lists only the raids.
- **Order of the Events tab** (`/stage/event` category 2, `server/events-tab-order.js`, user 10-11-2026): Raid Catalog banner, Event
  Catalog banner, kept raid, kept event, then the week's raids (routes-raid.js) and the week's events (`routes-events.js`), then
  `save/event.json` (bench only). A kept card is recognised by its `-kept` banner copy.
- **Which events are listed** (`event-calendar.js`, the Shop week `shopFrom` / `shopTo` of `storyCtx()`, as the raids): every entry with an
  `evStage` row whose dates overlap the week, all of them (an event of three weeks stays three real weeks; no largest-overlap rule as for
  the weekly raids), with its served quests only. A short-window event (`days`) opens on the real weekday (Pacific) of its day inside the
  Shop week, all day, closed the day after; a quest with `days` of its own only on them. A daily event (one quest per original day,
  24 h windows, no `days`) is listed with every served quest for its whole period: no weekday restriction (ruling of 6 Nov).
- **Card**: `bannerUrl` `/web/event/img/v<EVENT_IMG_VERSION>/<evStageId>.png` (`event_config.json` `imgVersion`, the value of the evStage rows),
  `eventType` of `event_config.json` (2), `endTime` the end of the real day for a short-window event, else of the real week; `useAp` the quest's;
  crown as the Special tab (objectives 1..min(3, `validSubmission`)).
- **Rewards** (`onStageClear`, from `/stage/clear`): first-clear items once per quest (first entry in `player.events.cleared`), each objective
  reward once; type 15 (Event Coins) never paid, only logged. `server.js` skips its own first-clear and objective payment for stage ids
  4,000,000-4,009,999. Drops: the usual path, on every clear, through the POI of the quest's map key (`poiStageId`: `stageBinId`).
- **Save**: `player.events = {kept: censusId | null, cleared: {stageId: [missionIds]}}`, created at the first clear or keep; listing never
  writes it. `keep(evStageId)` / `unkeep()` / `catalogCtx()` (shared `rowState` of `calendar-util.js`: only a past event can be kept) are
  ready for the Event Catalog (Task 5); the kept event is listed first with the `-kept` card, a short-window one on the real weekday of its days.

## Cards and maps (Events Part 1, Task 6: files staged, nothing served)

- **Cards**: `recon/tools/make_event_banners.py --fetch` downloads the banner image of each entry's own notice (`noticeIds`; the notice
  list of `reference\banners\notices.json`, first image key that is not the shared page header) into a private folder, one request every
  2 s, cached, giving up after two failures; without `--fetch` it writes the 640x140 cards `server/game_data/event_img/<evStageId>.png`.
  `make_special_banners.py --section event` then writes the Event Catalog banner (`catalogEvStage` 20000) and a «KEPT EVENT» copy of
  every card. The Event Catalog banner has its own design, never the Raid Catalog layout (user, 6 Nov): cyan to green background, the
  game's Event Coin icon as emblem, a large white «EVENT CATALOG», the subtitle and the small TRAINING sticker. The KEPT tab is at the
  top left, or at the top right for the cards listed in `event_config.json` `keptTab` (the Quiz card, whose top left holds art).
  After a change: bump `imgVersion` in `event_config.json`.
- **Maps** are the original JP 4.3.1 files, not generated: `recon/tools/import_event_stages.py` reads `event_maps.json` (every candidate
  event stage, served or held back for its map; `key` = the stage row's `stageBinId`), takes `mappoi_stg<key>.bin` + `_NN.bin` (highest
  JP revision) and copies them under the same names (the client loads `mappoi_stg<stageBinId>`: the stage id 4,000,000+n is never in a
  file name). A stage is left out when its STG or a part is absent, a room is not served, or a map enemy is not in the master.
  Output `stage_gen\event_stages\` (`stage\`, `stage_poi_events.json`, `report.json`); `--stage-dir stage_gen\files\stage` copies the
  files into the resource staging. `gen_story_maps.py` is not used for event quests.
- **WW enemy on two maps** (user, 6 Nov: «they must have the WW enemy»): `event_config.json` `mapEnemySwaps` names, per map key, an
  enemy id of the JP map and the WW enemy of our master that replaces it (Dark-Winged Warrior - 7/12: Gummi Hammer -> Morning Star;
  Agrabah Mission #2: Bag O' Coal -> Bag O' Jewels). The import tool changes only that id in the enemy records of its copy (position,
  count, level, drop slot and uid stay; the JP files are never changed); make-events.js swaps the same id in the quest and labels it
  `wwEnemy`. A WW enemy missing from the master leaves the quest unserved (no substitute).
- **Serving rule** (make-events.js, master run): a quest is served only when the import report says its map is `imported`
  (else `why: "map not usable: <status>, <reason>"`), and every reward id of its map is in the master or in the record's original drop
  rows (else `why: "reward rows missing: <ids>"`). make-events.js writes those reward rows with the original contents and odds and
  merges the POI of the served maps into `server/game_data/stage_poi.json` in the same run, so POI and reward rows land together
  (`events.json` `own.reward` / `own.poi`; the next run drops them first). `make-game-tables.js` leaves those POI keys and reward ids
  out of its own generic reward rows. The import report is read from `D:\Progetto_Restauro_KH_UX\stage_gen\event_stages`
  (`KHUX_EVENT_MAPS` overrides it); without it no event quest is served.
- If `stage_poi.json` is regenerated with `stage_poi.py`, the next master run puts the event keys back (make-events.js).

## Bench of the pilot (Events Part 1, Task 7, 6 November 2026)

Resources **106** (a full version: the 16 approved event enemy families are in the static `enemy_gen` pack, which `-Quick` never rebuilds),
master **rev 277**, built with `KHUX_EVENT_ENEMIES=1`. The server log shows 106 valid tables (as before) and no `evStage` line.
Master: +44 event enemy rows; 5 events and 49 quests served.
Save `events1`: `maxpower` without the story clears above Q850 and without `gacha.rot`, so the first login gives the Shop week
2019-04-04..04-10. Screenshots are in `D:\Progetto_Restauro_KH_UX\screenshots\`.

- `events1_tab`, `events1_tab2`, `events1_tab3` (Events tab), in this order:
  - Raid Catalog and Event Catalog: the new full-colour cards display correctly;
  - the save's kept raid, then the weekly raid;
  - Countdown, Daily Event and Dark-Winged Warrior, the three pilot events of the week.
- `events1_details`, `events1_details2`: the Details of an event show «On this server» and the original notice.
- `events1_quests`: the Dark-Winged Warrior quest list (Powerwild LV 100, AP 5, served quests only).
- `events1_catalog`, `events1_catalog_event`, `events1_catalog_event2`: the Event Catalog, with its row states, «Not restored yet» rows and
  «Not served yet» quests with their reasons.
- `events1_special`: the Special Catalog card.
- One real week later (`relogin -Save events1 -RealNow 2026-11-10T20:00:00Z`, Shop week 04-11..04-17):
  - `events1_w2_catalog`: «Past event — can be kept»;
  - `events1_keep`: Keep;
  - `events1_kept`: the KEPT EVENT card in the tab.

Open points:
1. The quest list of an event shows the Raid Boards button (`eventType` 2 of `event_config.json`). **Raid spawns from event quests,
   decided 07-11 by the author: none, by default.** Research (private `events/sources/EVENT_RAID_SPAWNS.md`): notice 49535 ends raid
   spawns outside raid events from 2019-01-24 00:00 PT, and khuxwiki `raid=` (2750 event quest pages) stops at that date; before it, event
   quests did spawn (Behemoth / Behemoth Ω from the January 2017 events). The April 2019 re-runs of the pilot fall after it, so «no spawn»
   is original for them; for 2016-2018 runs it is a declared simplification (all events are served as re-runs on the same rule). The
   server already behaves this way (event quests add nothing to the raid counter). **Raid Boards button: not original on non-raid events,
   fixed 07-11 (rev 278).** Frames of original videos (private `reference/event_quest_screen/sources.md`: JP 2017-01 cup event, WW
   2018-04 Hidden Menace, 2018-09 Dark-Winged Warrior 12/12 (4:3, probable), 2019-09 Defeat Titan) show nothing at the top right of a
   non-raid event's quest list; raid events (JP 2017-01, WW 2018-01) show «Raid Boards», and «Event Coins Galore!» (2019-08) shows
   «Event Boards». In the client, `/stage/event` `eventType` 2 is the raid mode that builds `AdventureTop2_Raid_Button`. make-events now
   writes the donor eventType per entry (pilot: 3, the Daily Event 1; fallback `event_config.json` eventType 1, never 2) into the
   evStage row and the index, and routes-events serves it. Bench (rev 278, `events1_dww_list_no_raid_button`): no button on Dark-Winged
   Warrior (type 3), the quest still starts and clears. Not benched: a type 1 list (the Daily Event is not in the 04-11..17 week), and
   which value maps to «Event Boards» (needed with the Event Coin boards, Part 2+).
2. ~~The quest counter says «1/12» on an event with 9 served quests.~~ Not a bug (07-11): «1/12» is part of the original quest NAME
   («Dark-Winged Warrior - 1/12», donor row and khuxwiki alike), the client shows no counter.
3. ~~«Complete without having to continue» twice.~~ Original (07-11): the donor row has objectives [28, 10, 10] and khuxwiki DWW 1/12 lists
   obj 2 and obj 3 with that same text (rewards Huey 5★ and Moogle 6★).
4. The Details page says «the reasons are with the quests below», but the Details view has no quest table; the catalog page has one.
5. The Story progress on the Quests menu reads 1% on `events1`.

**Keyblade event save (07-11, rev 278).** Save `events2` = `maxpower` with story quests 856-979 removed (last story quest 855, period
2019-04-18; script `tmp/events_p1/mksave2.js`, private), `relogin -Save events2` on the real clock: Shop week 04-18..24 lists the weekly
raid, «A New Friend? Returns!» and «Keyblade Wielders Summer Adventure Returns!» (EV-0783, 20012, eventType 3). The Summer Adventure card
loads a few seconds late (first download of `v4/20012.png`), then shows (`events2_tab`). Its quest list opens on «DAY 1 - 1/3» (Dual
Blade LV 150, AP 5, objectives 1 turn / no continue / Equip the Starlight Keyblade) with no Raid Boards button (`events2_key_list`).
Played by Claude (07-11, user asked): Day 1 - 1/3 (stage 4000094) with Starlight +60 (picked with the side arrows of «Select a
Keyblade»), pet Steal on: one turn, the 3 objectives ticked including «Equip the Starlight Keyblade» (`events2_key1_results`), first
clear paid once (Moogle 6★ 90146, Huey 5★ 90025, Huey & Dewey & Louie 6★ 90016, `events2_key1_objectives`); drops Moogle x1, x1 and x5
(Steal x4) = +7 Moogle 90011 in the save, same as the client (`events2_key1_drops`); `events.cleared` 4000094 = [1,2,3]; raid state
unchanged (the client reports raidPoint 1458, ignored for event quests). Day unlock: every quest of the 2019 re-run has the same donor
window (04-21 07:00 .. 04-28 06:59 PT), so all 17 served quests are open at once (Day 1 - 2/3 opens with «Equip the Treasure Trove
Keyblade»); 17 of 34 are not served yet (maps not imported, enemies 11547 / 11026 missing).

**Quest played on the bench (07-11, save `events1`, `-RealNow 2026-11-10T20:00:00Z`, deck of `maxpower`, pet Steal x4 open).**
Dark-Winged Warrior 1/12 (stage 4000030 on map 734910, Powerwild LV 100, AP 5):
- first clear in one turn: the 3 objectives ticked, «Objective Complete!» Moogle 6★, Huey 5★, Huey & Dewey & Louie 6★ paid once
  (`events1_dww1_results`, `events1_dww1_objectives`); Lux and Munny as the client reported; raid, Raid Coins, raid points and draw
  points unchanged;
- **bug found and fixed (d8339ed):** the original drop row 62202 (Moogle 15%, Louie, Dewey, Huey 5% each, odds independent per
  position) was paid whole, x4 by the Steal: 16 medals, while CONGRATULATIONS showed «Moogle x4» and a nameless silver bag
  (`events1_dww1_drops_before_fix`). Now the odds are rolled at `/stage/start` (`rollDropTypes`) and `/stage/clear` pays the rolled
  positions only (test `server/test-drop-odds.js`);
- 6 replays after the fix: objectives never paid again, AP 5 each; 5 runs «No items gathered.» (`events1_dww1_replay`), 1 run «Huey x4»
  (Steal) = 4 Huey 1★ in the save (`events1_dww1_steal_huey`).
- Pre-existing test failures on HEAD 98e60b1 (same without the fix, to check in the final review): test-enemy-attack, test-enemy-mechanics,
  test-enemy-oltre, test-enemy-start-state, test-medal-renumber, test-raid-routes, test-special-server, test-trait-medals; test-keyblades
  runs over 300 s.

## Weekly gem quests of 2017-09..2018-02 (Events Part 2, Task 4)

The 22 weekly gem quests and the Moon Gem Cup of 11 Jan 2018 (EV-0367) have no donor evStage row, but the donor stage table holds
the same quest in a later run (`No Continues: Weekly Gem`, stages in order of the weeks) with its JP 4.3.1 map. The private builder
accepts a stage only when its map has exactly the enemy names and counts of the khuxwiki page and the same target; the quest then
takes AP, gem, objectives and world from the wiki page and the map, level (999) and Moogle 6★ reward from that stage row (label
`laterRun`). They keep their `w1` keys of event_ids.json. A quest is served only when its map is imported and all its enemies
are in the master (no substitute): 9 of 23 are served today. The Almighty Challenge (EV-0417) has no map in any source: not served (`wikiEmpty`).

## Event enemy models and SP Chip & Dale (Events Part 2, Task 5a, 7 November 2026)

- **Models**: the 36 event enemy models the user approved on the rendered review (17 of the pilot: 12 Organization XIII members,
  1026 Queen Bee Ω, 1547 Assault Dragon, 1555 Titan, 1564 Ramuh, 2009 guest Keyblade wielder; 19 of the gem quests) and 96
  Circus Clown are served from `recon/tools/extra_donors_events2.tsv` (`events2_export.py` from the private reconstruction
  manifest of `tmp\events_enemies`; rows: published path, container, rule, declared size, short rule label). `make_jp_enemies.py
  --events2` (default on, `''` off) takes each animation of the table WHOLE, before every other source (override priority:
  the table is the exact recipe the user approved), never mixing in another table; a texture without a usable row leaves
  the animation incomplete. Rules: `events2-jp` (own JP file, category 1), `events2-copy` (2), `events2-recon`, `events2-cand`,
  `events2-rescale` (212 off-size copies rescaled to EXACTLY the declared size, like dedup-rescale) and `events2-blank` (89
  fully transparent pieces for the slots still missing in the mandatory animations of the accepted partial models 282, 1032,
  1033, 1034, 1607), all category 3. Container `events2` = `D:\Progetto_Restauro_KH_UX\enemy_gen_src\events2` (rescaled,
  blank, frozen copies of raid_gen/enemy_x sources). 65 Cloudy Sunrise is complete with the standard rules.
- **Standard dead**: rule `std-dead` of `extra_donors_whole.tsv` (`whole_export.py`, label «std-dead (user-approved 07-11)»,
  category 3): 1568, 1570, 1572, 1573 (no dead anywhere) and 96 take the whole enemy/1/dead (Shadow smoke cloud).
- **Optional animations**: an atkSp with holes is not served (19 families: the client falls back to wait), as for every
  family; the notice draft names them. **2009** is an event guest ally (team flag 0x20) and joins `ally_families.json`
  (wait + atk1_o; move/knockback/dead from wait).
- **185 Enraged Elk**: no own model (user decision 07-11): `server/make-event-enemies.js DISPLAY_AS` {185: 184} shows the served
  story model 184 on its event rows (the private row keeps the donor displayId; the drawn gate checks 184).
- **Families**: `event_enemy_families.json` now lists 53 families, all approved (`partial`, `std_dead`, `no_b2016` for 96);
  the 11 pilot families of the dedup pending list moved to `extra_donors_dedup_approved.txt`.
- **Event rows**: the private builder (`tmp/events_p1/pilot/work/build_event_enemies.py`) now also writes the gem rows and the
  12 later-run map ids of Task 4: 590 rows, none missing. Regen 07-11: 116 of 897 quests served (58 before; gem 32, was 9);
  not served: mapUnusable 620, enemyMissing 115 (map enemies with no id, label mapIncomplete), mapKeyUsed 45, wikiEmpty 1.
- **SP Chip & Dale 6★ (90346)**: `server/medal-restored.js` clones our 90056 «Chip» 6★ (name, flavor, advantage, album 1702,
  enhanceAttack/enhanceDefense 1000; cost/minCost 999 like the siblings) only when `medal_gen\files\img\medal\Medal_L/S_90346`
  exist (master and package together); art from the Roboloid render (`fetch_medal_images.py`, `medal_map.json` 90346 -> 1796),
  no cut-in. Served with resources 107.
- **Riku & Moogle 6★ (90296)** (Events Part 3, Task 7a2, 8 November 2026): Gift Shadow drop (6.35%, reward 190804; the EV-0894 Sparkler 1507
  drops it at 100%, reward 190805) of the four «Event Coins plus Riku & Moogle» events (EV-0885/0894/0909/0925, Aug-Sep 2019). A Sell Medal (type 3,
  attribute none, upright, album 1588, Roboloid 1638), no stats and no Special Attack, sold for 500 Jewels (khuxwiki «Riku &
  Moogle»: «can be sold for 500 Jewels each»); not a Subslot Medal (I-169, type 10), so no dependency on that feature.
  `medal-restored.js` clones our 90016 «Moogle» 6★ (name, flavor, advantage, album 1588, sell 0, sellJewel 500, materialExp 0).
  Art: the original JP 4.3.1 files (`img/medal/Medal_S_90296.png` and the texture of `mixture/medal/compose/90296/Medal_L`,
  which is the medal's Medal_L byte for byte), BTF-encoded into `medal_gen\files\img\medal`; `medal_map.json` 90296 -> 1638.
  `server.js respondMedalSell` now credits `medal.sellJewel` to the Jewels (`freeStone`; no other medal of our master has it).
  Regen 08-11: 628 of 798 event quests (616 before); coin quests 94 of 114 (82): EV-0885, EV-0909, EV-0925 4 each; EV-0894
  still waits for the 1507 Sparkler (Task 7b). Board sets handed out 9 (6 before): + 2019-08, 2019-09, 2019-09b; 2019-08b is
  EV-0894's. The «Subslot Medal» cells of those boards stay left off (268 cells, unchanged): they are I-169, not this medal.

## One card per original evStage row (Events Part 2, Task 5, 7 November 2026)

User decision: the original event list showed one banner per original `evStage` row, so a record that bundles several donor
rows (18 Monthly Gem Quests records, Battle VS Ramuh, the 3rd Anniversary Countdown, the Daily Gem events) is no longer one card.

- `make-events.js` builds one `evStage` row per donor row of the record with a served quest (`allocateRows`); a record with no
  donor row (wiki-only, weekly 2017-18) keeps its single row. A quest goes to its donor row by its `evStageId`, else by the
  row's stage list / range (`stageRange`, added to the private records by the builder from the donor table). A row whose
  quests are all not served is not built; the raid / Special rule stays per record.
- Ids: the record id (`event_ids.json` `rows`) stays on one donor row, frozen in the private sidecar as `<censusId>#row`: the
  row whose banner was the record's card (migration of 7 Nov), else the first donor row. The other donor rows are numbered in
  `subRows` (`<censusId>/r+<offset from that row>`, no donor id), same number space; quest stage ids never change.
- Index (`events.json`, git-ignored): the catalogue keeps one entry per record (its id, notice, quests) with `rows`
  [{evStageId, donorEvStageId, start, end, days?, eventType, origCategory, parentEventStageId, bannerKey, stageIds, available}];
  each quest has the `evStageId` of its row. A row of a record with several rows has its own Pacific dates (a donor window past
  the record end, as the category 1 rows until 2037, ends with the record; the entry widens to cover a row that starts
  earlier); a single row keeps the record dates. Our rows keep `parentEventStageId` 0 (the donor value is only in the index:
  some December 2019 rows are children of another row of their month; client effect untested, bench).
- Routes: `/stage/event` lists one card per built row of the week (`event-calendar.js currentCards`: own dates, days and
  quests; own `eventStageId`, card and `eventType`); the kept event lists one KEPT card per row. Keep, Details and the notice
  page accept a row id (it opens its record). The details page lists the rows (card, dates, quests) under «Cards».
- Cards: `make_event_banners.py` writes one card per card id (the entry id and every built row) from the row's donor banner key
  (fetched as `row_<key>.png` into `reference\event_banners_ww`, or any `*_<key>.png` already there), else `--extra`, else for
  the entry id its notice banner; `make_special_banners.py --section event` writes the KEPT copies of every card id.
- Battle VS Ramuh (fix of 7 Nov): the census gave it the notices of the Iron Giant week and of the permanent Daily Quests, so
  it held their rows. The private builder now corrects its notice (its own row: Defeat Ramuh 1-10, not served until the Ramuh
  enemies are in the master); its old quest keys stay reserved in `event_ids.json` under `EV-1360~old/` (numbers never
  reused, no record reads them). Every donor row of a record now has its notice among the record's notices.
- Row owners (controller ruling, 7 Nov): a donor row belongs to the census event whose content it is, not to every record of its
  notice. The private builder (`ROW_OWNER`) keeps on a Monthly Gem record only its own «Clear All Challenges» row; the rows of
  the other events of the monthly notice go to their census row: the gem drop events (Magic / PSM / Power Gem) to their own GEM
  records, which are no longer shared rows; Event Coins Galore, Defeat X, New Year's Challenge, Keyblade Challenges, Org. XIII
  avatars, Daily Enhancement / Avatar Coin to census rows not selected yet (not built); the raid rows (eventType 2) to the raids.
  Quests that moved to a record keep their stage ids (key moved); the others keep them reserved under `<censusId>~old/`.
  The three «Event & Trait Medals» rows of June-August 2020 belong to the medal event of the month (EV-1154 Stitch Screen Debut
  Celebration, EV-1198 SN++ Aeleus, EV-1232 SN++ Dilan): their banner sits under that event's heading in the monthly notice and
  their quest gives its SN++ medal (fix round 1); not selected, so not built.
- Full map import (Task 5 Step 2, 7 Nov): with the event enemies in the master, `import_event_stages.py` imports 373 of 418
  candidate maps (43 skipped: rooms not served; 2 missing). Served after fix round 1: 534 of 684 quests (gem 441, pilot records
  93; before: 117). New check in make-events.js: the rooms of the map must be of the quest's world (`event_config.json`
  `roomWorlds`, a prefix missing there is another world; `neutralRooms` {DG: 1}: the Corridor of Darkness / DG_0100 arenas fit
  world 1, where the original quests stand on DG rooms alone, or any world when the map also has a room of the quest's world;
  `worldExceptions` by map key: EV-0282 and EV-0293, donor world kept on the Enchanted Dominion rooms of the later run's JP
  map), else `worldMismatch`. A script check of the new quests (world, event enemy models, no substitution, reward rows, AP /
  addLevel against the donor row or the documented khuxwiki AP, one record per map key) found no failure. The resource staging
  (`stage_gen\files\stage`) holds exactly the event maps of the import.
- Fix round 1: every record freezes the row of its id (`<censusId>#row`, one row too); stored row keys without it stop the run.
  A quest that matches no donor row is flagged `rowGuess` (warning; none today). Quests whose AP comes from the khuxwiki page of
  their run (the private record's conflict) carry the label `wikiAp`. The details page draws a card only for built rows.

## Bench of the gem quests (Events Part 2, Task 6, 8 November 2026)

Resources 107, master rev 281. Saves made from `maxpower` with the `mksave2.js` pattern (story quests above LIMIT removed, Shop
rotation reset): `gem1` = LIMIT 690 (tranche 2017-10-05, first Shop week 10-05..10-11), `gem2` = LIMIT 825 (tranche 2019-01-10,
week 01-10..01-16).

- `gem1_tab`/`gem1_tab6`: the week lists both Weekly Gem Quests (Oct. 2 Speed Gem, 20019; Oct. 9 Magic Gem, 20020) after the raids.
  On the first visit the Oct. 9 card stayed black (heart placeholder) although `/web/event/img/v5/20020.png` was served 200 with the
  right bytes; it showed on the next visit: the client's first-download delay, as for Summer Adventure (07-11), not a server fault.
- `gem1_list`: «No Continues: Weekly Gem», Malicious Spider LV 999 (round 8 model), AP 25, three «no continue» objectives
  (Magic Gem, Jewels, Moogle). **Fixed (dd6a811, rev 281):** the list showed an «Event Boards» button: the client turns
  `eventType` 1 into the board mode. The weekly gem records have no donor row (fallback 1) and the pilot type-1 events had it too;
  original videos show no button on non-board lists (Defeat Titan has donor 1). Now `servedEventTypes: [3]`: every event row is
  served 3 (plain list) until the event boards are served (Part 3); the donor value stays in `origEventType`.
- `gem_catalog`: Event Catalog, 95 events / 79 with quests served. **Fixed (6e71fa5):** the three Gem Boards records (no banner in
  the original notice) showed a broken-image icon; now a box «No card in the original».
- `gem2_tab`, `gem2_list`: «Monthly Gem Quests!» card; list «No Continues: Monthly Gem», Iron Giant LV 500, AP 5, quest
  thumbnails in a row, no board button.
- **Weekly gem quest played (gem1, Oct. 9 Magic Gem, stage 4000134):** Begin -> «Select a Keyblade» -> friends -> map (two rooms)
  -> Results with the three objectives. First clear: Magic Gem +1 (material 50), Jewels +30, Moogle medal, drops (Spring Water,
  Iron Ore), munny 4,617; score and clear missions [1,2,3] saved. Three replays: no objective paid again (gem and Jewels unchanged),
  drops and munny only. A reward row that looks empty for a moment is the client's bonus animation (the text fills in), not a fault.
- **Monthly gem quest crashed on Begin, fixed (rev 283, -Quick on resources 107):** a stage with `holdKeyblade` != 0 (event/story mode)
  opens the fixed-keyblade start popup `StartDeckEdit3Scene_ver330`, which WW serves without its children: the client crashed in
  GUIReader (320 event quests: the 84 Monthly Gem rows and 236 «Quest - N/15» / «Clear All Challenges» rows). Proud quests use
  StartDeckProudScene and were not affected. Imported from JP 4.3.1 (`jp_coco_layouts.txt`): StartDeckEdit3_Panel_KB(_Ad)_ver240,
  StartDeckEdit3_Deck_ver240, StartDeckEdit2_NotChangeKB_ver240, StartDeckEdit3_Rules_ver240 (+ NotChange_panel01/02,
  MMode_Rule_Panel_A). `noPartner` only hides the friend list and adds «*No borrowed Medals.»; the right box (Rules) shows only
  when `hardmodeRequire` != 0, so the short-lived 1 -> 0 mapping was reverted (1 = «No special attack restrictions.», a valid
  «no limit» code). Original frames: private `reference/quest_start_screen/` (WW 2018-05 Monthly Gem: «CONDITION» box, orange
  «Stroke of Midnight +25 Cannot change» plate; WW 2017-12 weekly: empty right area, as ours).
  Bench (`gem2_begin`): «This quest must be played with this Keyblade.», box with the three lines, «Starlight +60 Cannot change», lock,
  no friend column. Differences left: the box header reads «RULE» (JP texture) instead of the WW «CONDITION», no yellow frame,
  red plate instead of orange (user 08-11: keep the JP version, to declare in the Events notice). Played: Iron Giant LV 500, objectives paid once (Power Gem +1, Huey, Moogle), clear [1,2,3].

## Event Boards spike (Part 3, Task 1, 8 November 2026)

Bench of the client side of the event boards (sphere `type` 4) before the generator is written. Temporary server code
behind `event_config.json` `spike` (off by default; `server.js` `EVENT_SPIKE`, Task 5 replaces it): the event `censusId`
is served with `eventType` 1, the two boards of `server/test-fixtures/event_board_spike.json` are added to the master
`sphere`/`sphereArray`/`sphereMasu` tables, handed out on `GET /user/sphere` and on a check whose `boardTypes` has 4, paid
in `userPoint.stageSpherePoint`. Fixture: layout, costs and `openId`/`openParam` of the donor WW type-4 rows «Event Board 1/2»
(numbers only), our test ids 4999901/4999902 (Board 1 `openId` 3 / `openParam` 0, Board 2 `openId` 5 / `openParam` 4999901),
every cell and the completion pay Jewels, no card picture, `boardId` 4. The plan named EV-0759, which is not a served record;
EV-0760 «Defeat the Pink Possessor!» (donor `eventType` 1) was used. Save: copy `evboard1` of `events1`,
`-RealNow 2026-11-10T20:00:00Z` (week 2019-04-11..17). Master revisions 284 (variant A), 285 (B, C), 286 (spike off).
Frames: `D:\Progetto_Restauro_KH_UX\reference\event_boards\spike_*.png`.

- **Button.** With `eventType` 1 the quest list of the event shows the «Event Boards» button (right of the list, where raid
  events show «Raid Boards»). The tap sends `POST /user/sphere/reset {}`, `POST /user/sphere/check/170119
  {"checkTypes":[3],"boardTypes":[1]}` (close), then `{"checkTypes":[1,2],"boardTypes":[4,7]}`, and opens the list.
  Back from a board screen to the list sends `{"checkTypes":[1,2],"boardTypes":[4]}`. The home check after the Notices sends
  `{"checkTypes":[1,2],"boardTypes":[1,2,3,4,5,6,7,8,9,10,11]}`.
- **«Unlocked an Event Board!» popup.** Every type-4 entry of `userSphereDatas` in a check answer opens one
  «CONGRATULATIONS! Unlocked an Event Board!» popup with the card and `boardName` (home and board list alike, one per entry,
  also for Board 2 while Board 1 is not complete). The spike sent both boards on every check, so the popups came back each
  time: the real server must send a board in a check once (as `sphereNotified` does for type 1), and the full list only on
  `GET /user/sphere`.
- **List.** «Tap a board to view its details.»; one card per type-4 board the client holds, both with the NEW tag, title
  bar = `boardName`, «Event Coins» box with the coin icon (`SpherePointIcon_EV`, the Event Coin of the event cards) and the
  `stageSpherePoint` balance (500), «To Complete» = sum of the board's cell costs (10450 / 45900), «Nodes 0 / 19». Cards
  without `img/sphere_incentive/<id>.png` are the plain lilac frame (as the raid boards before their art). Empty list
  (variant C, no type-4 board handed out): «No Event Boards.».
- **Board screen.** Title «Event Board N», marquee «Complete the boards while the event lasts! All Event Coins will be lost
  when the event ends.», costs on the cells, «Event Coins» balance, reward line («Jewels / Jewel x 10»), Unlock grey when the
  balance is below the Target cell cost. Unlock sends `POST /user/sphere/update {"sphereBoardId":4999901,"releaseMasuId":19}`
  (node numbers as for type 1/5, first node after START = 19 on this layout); the answer's `userPoint` is shown at once
  (500 -> 400) with the «You received Jewel x 10!» popup; Jewels in the header updated on the next screen.
- **`openId` 5 / `openParam` is not enforced by the client.** Board 2 (`openId` 5, `openParam` = Board 1) is listed, opens,
  and with 5000 coins its Unlock is red and works (3600 left) while Board 1 is 1/19. The chain must be enforced by the server
  (hand out Board 2 only when Board 1 is complete, and refuse updates on it before).
- **`boardEndTime` is not read for the list.** Variant B (`boardEndTime` of the EV-0760 row 2015-01-02, master rev 285): the
  button, the list and both boards stay as in A, progress kept (1/19). So, as for raid boards, the server decides which type-4
  boards exist by handing their ids out; `endTime`/`boardEndTime` do not hide them.
- Not seen: the client never sent `checkTypes` 3 with `boardTypes` 4, so closing event boards at the end of an event must go
  through `GET /user/sphere` (replaces the list) or a `checkTypes [3]` answer of the first Event Boards check
  (`closeEventSphereBoardIds`, which the client reads whatever `boardTypes` is: untested).

## Event Coins and Event Boards served (Part 3, Task 5, 8 November 2026)

`server/routes-event-boards.js` replaces the spike (removed with its fixture and the `event_config.json` `spike` key). Not benched
yet (Task 7).

- **Coins.** Reward type 15 of an event quest goes into the balance of its entry's board set (`events.json` `entry.boardSet`):
  objectives and first-clear items once (`routes-events.js`), enemy drops on every clear (`grantItem(15, .., {coinSet})` in
  `/stage/clear`; 15 is now one of the enemy drop types, no row outside events has it). Without a set: logged, not paid, never
  Raid Coins (`raidSpherePoint` is type 16 only). Save `player.eventCoins {[setKey]: n}`; coins never expire.
- **Focus.** `/stage/start` of an event quest with a set sets `player.eventCoinFocus`. A set is available while a feeder event
  (`boardSets[set].censusIds`) is listed in the story week or is the kept event. Focus = the last started set if available, else the
  newest set of the week, else the kept event's. `userPoint.stageSpherePoint` = the focus balance (all other userPoint keys kept:
  test `userpoint_keys`).
- **Boards.** Only the focus set's boards are handed out (`player.eventSphere`, kept for good); a chained board (`chains`) only once
  the board before is complete. Check: `checkTypes` with 3 answers `closeEventSphereBoardIds` = every type-4 board sent or ever handed out that is not handed
  out now; a check without 3 whose `boardTypes` has 4 sends each newly handed-out board once (`player.eventSphereSent`); `GET /user/sphere`
  lists the handed-out boards and replaces `eventSphereSent`. Update: refused with no change when the board is not handed out
  (window, focus, chain), the node is invalid or open, or the set's balance is short; each cell paid once, the completion (index 22)
  once.
- Test: `server/test-event-board-routes.js`.

## Bench of the coin events (Part 3, Task 7)

- **Content (Task 7b, 8 November 2026, f0cb34e).** 1507 Sparkler user-approved (event_enemy_families.json, whole_export.py label,
  extra_donors_events2.tsv +139 rows); `make_jp_enemies.py`: 1507 complete (category 3 for the standard ground shadow).
  The four EV-0894 maps use the original JP rooms DB_0026_09..12_00, which have no story door: `make_jp_rooms.py` `EVENT_ROOMS`
  builds them with `--story-only` (they also let DAY 9 - 1/2 and 2/2, stages 730190/730191, be imported). Regen: 634 of 798
  event quests served (628), EV-0894 4 quests, board sets 10 (+2019-08b), eventType 1 entries 22.
- **No card for EV-0579 (20181)** (user 08-11): an entry with `noQuests` 'board' (announcement notice played only on the boards, no
  quest and no evStage row) gets no card from `make_event_banners.py` (test in test_make_event_banners.py); the Event Catalog shows the
  «No card in the original» box. Cards written: 138 (25 new coin cards, identical to the reviewed ones), imgVersion 6.
- **Keeping an October event from April 2019**: only a past event can be kept (`rowState`: a later event is 'later'), so the
  October 2019 set cannot be kept on an April 2019 save; the focus test uses an October 2018 coin event (EV-0603, set 2018-10).
- **Riku & Moogle on the bench**: no save tool can add it (`grant-all-medals.js` skips medals with sell 0); its sale is benched only
  with a save that got it from a drop (August-September 2019 events).
- **Resources 108 / master rev 287** (6ee7982): full build 5.04 GiB (41 parts), installed with update-resources + Download.
- **Bench (8 November 2026, save `coin1` = copy of `events1`, `relogin -Save coin1 -RealNow 2026-11-10T20:00:00Z`, week
  2019-04-11..17; battles played by Claude with the save's deck, user «giocale tu»).** Frames: `reference\event_boards\t7b_*.png`.
  - Events tab: the April 2019 coin events with their cards (Event Coins Galore 20187, Banish the Heartless 20188, Pink Possessor,
    Titan, Boss Time Attack, Shiva, Egg Hunt, Quiz...); the last cards of the long list draw only after a moment (lazy load, no bug).
    The Event Boards button shows on the eventType 1 entries.
  - «Unlocked an Event Board!» popup: **bug fixed (3d0529a)**: the login `GET /user/sphere` marked Board 1 as sent before the home
    check, so the popup never showed; now the list does not mark new boards and the home check pops it once (not again at the next
    login). Board 2 popped once when Board 1 was completed (back to the list); the six 2018-10 boards popped once each when the focus moved.
  - Board list: Board 1 only (Board 2 chained), Event Coins = the set balance (0, then 200...), To Complete 4100.
  - **Crash fixed (7dc0cf4)**: after the first unlock (cell 19, 100 coins, Sora & Chip & Dale) the client crashed (SIGSEGV, native)
    on OK and again on reopening the board: its cursor went to a pass-through node (a Booster cell left off: cost 0, rewardSelect 0).
    Pass-through nodes are now handed out already open (`openPassThrough`, also for older states); the board opens with the cursor on
    the next paid cell. Side effect: with the boosters open several paid cells of Board 1 are reachable at once (the original path
    order had boosters in between); the Event Catalog shows them as «Not restored yet» / done.
  - Coins: EV-0774 quest 1 first clear 3 objectives = 150 + 50 coins (balance 200, shown on the board screen); second clear pays
    no objective again (200 kept). Objective coins of 5 EV-0774 + 3 Titan + 2 Shiva + 5 Pink Possessor quests; Event Coins Galore
    Beginner also paid **enemy coin drops** (Event Coin x15 lines in CONGRATULATIONS; +2015 with the pet's Steal x4, which
    multiplies the coin drops too). Egg Hunt 1/5 «Clear All Challenges Together»: objectives failed (eggs not on the target path).
  - Cells: cell 2 (300, Trait Medal #95) by Unlock, then Unlock All («Use 3700 coins to unlock all nodes?») -> «You completed the
    board! You got a Boost Medal!» (Magic Mirror), Jewels +500 from the 1000 cell (5889 -> 6389); Board 2 handed out (COMPLETE ribbon
    on Board 1), opens, first cell 1400 -> Jewel x100 (6389 -> 6489).
  - Focus: `POST /web/event/keep/20185` (EV-0603 «Event Coins Galore!» Oct 2018; an October **2019** event cannot be kept on an
    April 2019 save: only past events can be kept), Kept card at the top, quest Beginner played: focus 2019-04 -> 2018-10, the Event
    Boards list shows the six 2018-10 boards (Cherub x2, P/S/M Booster, Re: Halloween Medals Board), April boards closed
    (`closeEventSphereBoardIds` 4000009, 4000010), balance 8. Then a Boss Time Attack quest (2019-04): focus back, Board 1 COMPLETE,
    Board 2 1/19, balance 515 (265 + 250): April progress kept.
  - Event Catalog: feeder pages list the boards with cells, costs, done marks and «Your Event Coins: N. One balance per board set,
    shared by 12 events; Event Coins never expire.»; the 20181 card is absent (404) and the «No card in the original» box is drawn.
    **Fixed (52e747f)**: the EV-0579 page did not list its set's boards (it promises them); it now uses `boardSetKey` for board-only
    announcements (6 boards of 2018-10).
  - Not checked: Riku & Moogle 6★ sale (no save tool can give a sell-0 medal; coordinator: later, with an Aug-Sep 2019 save);
    the board card art (`img/sphere_incentive`) is still the plain lilac frame.

### Boards with unpayable cells, informative notices (Task 7c, 8 November 2026)

User decisions 08-11 (4c5ce3f, master rev 288, 8f87e7f):
- **No pass-through cells.** In the donor WW master every cell of every type-4 board has a reward and a coin cost (Booster cells cost
  150-1000 coins); no original board had an empty or pre-opened cell. The pass-through cells of Task 3 / 7dc0cf4 let paid cells open
  out of the original path order, so `event-boards.js` now skips a board with ANY cell we cannot pay (`report.skipped`: `unpayable
  cells (Boosters: Part 6)`, `unmatched medal`, a bad index, a grid node without a cell); a board chained behind a skipped one is
  skipped too (`chained to a skipped board`), a skipped Board 2 leaves Board 1 served. The pre-open logic of 7dc0cf4 is gone;
  `routes-event-boards.js` keeps a guard: a board with a rewardSelect 0 node is never handed out, opened or bought (logged once).
  A board held in a save but no longer in the master is closed by the next check and never listed (tests).
- **Medal names of the donor study.** A medal cell whose donor name has a variant letter our master lacks uses the study's `ourName`
  when it gives exactly one medal of the same rarity: 5★ Halloween Sora A -> 22095 (x2), 5★ Halloween Goofy A -> 21095, so the
  «Re: Halloween Medals Board» of 2018-10 is served whole.
- **Event Catalog = playable events only.** An informative notice with no quest and no original card (`noQuests 'board'`: EV-0579
  «New Event Coins Available in October!», EV-0223, EV-0280, EV-0396 Gem Boards announcements) has no row and no page (404); 52e747f
  is reverted. Playable events whose quests are not served yet stay with their reason; the 2018-10 boards are listed on the pages of
  the playable 2018-10 events (EV-0582, 0588, 0589, 0603).
- **Regen** (`KHUX_EVENT_BOARDS=D:/Progetto_Restauro_KH_UX/tmp/events/boards/board_sets.json`, log `tmp\events\t7c\regen.log`):
  83 donor boards -> 53 built, 30 skipped (19 `no matched cells` = all of 2019-12, 6 `unpayable cells (Boosters: Part 6)` = 3 of
  2018-10 + Board 1 of 2019-04 / 2019-06 / 2019-10, 3 `chained to a skipped board` = their Board 2, 2 completion Booster = 2019-02);
  265 cells left off, all Boosters. **7 sets handed out** (2018-10 with 3 boards, 2019-08, 08b, 09, 09b, 11, 11b; 41 type-4 rows);
  2020-01 / 01b built but not handed out (no coin quest served: `noCoinSource`); 2019-02, 04, 06, 10, 12 not served (`boardsLater`,
  their entries eventType 3). Entries by eventType {1: 10, 3: 106}; catalogue 110 events (was 114). No resource change (event boards
  have no card art in the resources).
- **Bench** (save `coin1`, `relogin -Save coin1 -RealNow 2026-11-10T20:00:00Z`, rev 288, Download tapped; frames
  `screenshots\t7c_*.png`): `[master] 106 tabelle valide`. Focus fell to the kept EV-0603 (2018-10): «Unlocked an Event Board!»
  popped for the three 2018-10 boards (Cherub x2, Re: Halloween Medals Board). The April 2019 events show no Event Boards button.
  Event Boards list of the kept event: 3 boards, coins 8. Cursor moved over all 19 cells of each Cherub board and all 11 cells of the
  Halloween board: no crash; cell 1 of Cherub unlocked (5 coins, EXP Medal Huey & Dewey & Louie), the cursor moved to cell 2, no
  crash. Event Catalog: 110 events, June 2017 Gem Boards (EV-0223) and Sept. 25 Gem Boards (EV-0280) gone, EV-0242 (coin, with card)
  kept; `/web/event/event/20181` 404. EV-0603 page (via its card Details -> «See this event in the Event Catalog»): Event Boards
  section with the Cherub cells, costs, «Not unlocked» / «Unlocked» (cell 19).
- **Leftover on the test save `coin1` only:** the Halloween board 4000006 holds cells 2, 3, 14 unlocked by the 7dc0cf4 pre-open
  (they were the Halloween A cells, now paid medal cells): shown unlocked, never paid. 7dc0cf4 was never released, so only bench
  saves can hold this; clear them by hand if the save is reused.
- **Coins into held sets (coordinator 08-11).** A set whose boards are held (not handed out) still collects its Event Coins:
  `boardSetOf` falls back to the entry's `boardSetKey` and `addCoins` accepts a set that has member entries; the set is never
  handed out nor the focus, its entries stay eventType 3 (test `coins_paid_to_held_set`). Master unchanged (rev stays 288).
  Save `coin1`: the 7dc0cf4 leftovers on board 4000006 (cells 2, 3, 14) cleared by hand.

## Part 3 summary (event coins and boards, 8 November 2026)

Final state (rev 288, resources 108; plan `docs/superpowers/plans/2026-11-08-events-part3-coins.md`, ledger
`.superpowers/sdd/2026-11-08-events-part3-coins/progress.md`):
- **Coins.** Event Coins = reward type 15; Raid Coins moved to type 16 (same amounts). Objectives and first-clear items pay once,
  enemy drops at every clear (kept events included), into `player.eventCoins[set]`: one balance per board set, never expiring (the
  original lost them when the event ended; the client's board marquee still says so). A served event whose set is held
  (`boardSetKey` without a `boardSets` entry) pays into its set too; the balance is not shown until the boards are served.
- **Focus.** One set listed at a time: the set of the last event quest started, else the newest set of the story week, else the kept
  event's; `userPoint.stageSpherePoint` = that set's balance.
- **Boards.** 83 donor boards -> 53 built, 41 handed out in 7 sets (2018-10 with 3 of 6, 2019-08, 08b, 09, 09b, 11, 11b); each cell
  and each completion paid once; chains and windows enforced by the server. No pass-through cells: a board with any unpayable cell
  (265 Booster cells) is held with any board chained behind it (30 boards: all of 2019-12, 3 of 2018-10, both boards of 2019-04 /
  06 / 10, 2 of 2019-02) until Part 6 (Boosters, I-166). 2020-01 / 01b have no served coin quest (`noCoinSource`).
- **Content.** 47 missing event enemies served as event rows, new model 1507 Sparkler (user-approved; defeat = Shadow smoke cloud,
  standard ground shadow, both declared); Riku & Moogle 6★ Sell Medal 90296 (500 Jewels, `sellJewel`); EV-0894 rooms
  DB_0026_09..12. 95 events / 634 of 798 quests served; Event Catalog 110 events (informative notices without a banner left out;
  «shared by N events» counts only listed events, Task 8).
- **Notice.** «Events» (11/08) section «Event coins and boards» (counts from `events.json` via `eventNoticeFacts().coins`) and the
  Sparkler line in «Enemy graphics».
- **Open:** pet Steal x4 multiplies coin drops (+2015 on one Galore clear: check the original Steal rule); EV-0603 objective rewards
  pay 1 coin each (check the records); board card art is the plain lilac frame (`img/sphere_incentive` art missing); the Riku & Moogle
  sale not benched in the client; test-make-special and the 8 known failing tests; deferred minors in the ledger.
- **Lessons for Part 4.** Check what the original paid before inventing a fallback (the pass-through cells had to be undone: every
  original cell had a cost and a reward); a missing enemy is found and approved on a rendered review, never substituted; a feature
  half-served (boards without Boosters) is held back whole and declared in the notice; memory-heavy steps (resources build,
  update-resources) can be killed by the host: stop, free memory, resume, never chain taps after a kill.

## Map coverage (Events Part 4, Task 2, 8 November 2026)

- **Event rooms list.** `import_event_stages.py --rooms-out` (default `D:\Progetto_Restauro_KH_UX\tmp\events\maps\event_rooms.json`)
  writes the rooms of every event map it could read (imported or left out for its rooms) with their map keys; `make_jp_rooms.py`
  reads it (`--event-rooms`, `event_rooms_from_list`) in place of the four hand-listed DB_0026_09..12 rooms and builds them with
  `--story-only`. A missing list or a bad room name stops the run (rooms_gen removes the files of the rooms it does not plan).
  Order: import (list) -> `make_jp_rooms.py --story-only` -> import again with `--stage-dir`. Test: `test_make_jp_rooms.py`.
- **Other copies.** An STG or part missing from the JP 4.3.1 copy is taken from the WW 2016 bundle copy of the same bin (byte for
  byte, `copies` in the stage's report); the WW 2018 name index is listed in `tried` (names only). A stage left out gets `cause`
  (`by_cause` in the summary: STG absent, part N absent, rooms not served, ...), a missing one `tried`.
- **Result.** 162 event rooms in the list; rooms_gen 251 -> 267 complete rooms (+16: AG_0009_01_00, AG_0010_00_01, AG_0018_00_00,
  BC_0004_00_00, CD_0016_00_00, DB_0020_02_00, DB_0020_03_00, DB_0022_00_01, DB_0023_02_00, DB_0025_00_00, DB_0026_05_00,
  DB_0026_06_00, DB_0029_00_00, DG_0006_00_00, OC_0001_02_00, OC_0001_03_00; 1,938 files, +65 MB). Import: 470 -> 510 of 520 maps
  imported; left out: rooms not served 47 -> 7 (all DB_0000_01_00: 4 base1 tiles of its last column exist in no copy on disk),
  STG absent 3 (735820, 740280, 740282: only part 00 in any copy). 42 of the 49 «rooms not served» quests now have their map
  (served at the next master run if the world and reward checks pass).
- **Incomplete records.** The 106 quests with the record map status «STG header absent» (98) / «part 2 absent» (8) use 60 map keys:
  no other copy holds the missing files (55 keys have no file at all in any copy; 740260/740262 have parts 00-01 of 3). Survey of
  every copy tried: private `tmp\events\maps\INCOMPLETE.md`. They stay unserved (`mapUnusable`).

## Generator rules for the challenge events (Events Part 4, Task 4, 10 November 2026)

- **Booster only.** A quest is held as `boosterOnly` when all its objective and first-clear rewards are Boosters. Drops are not
  counted: a quest with drops and only a Booster objective is held too (review ruling, behaviour kept).

## Challenge events (Part 4, Task 6 preparation, 10 November 2026)

Everything up to the live master regen; the regen, resources 109 and the bench follow.
- **Record corrections** (private, from the card verification `tmp\events\t5p4\verify_nobanner.json`). The records are rebuilt
  with `build_challenge.py` (same builder, inputs of today), so only labels and `eventEnemyRows` follow the Task 3 enemy rows.
  - EV-0990 is the WW «Daily Gem Event! (12/23)»: census.py `NOTICE_FIX` gives notice 60751, so it gets its donor rows
    200852..200860, 27 donor quests and 9 cards from banner 98XLNkmVW. Its raid row 10263 goes to the raids (rowsMoved RAID).
  - EV-1163: the census khuxwiki match «High Score Challenge #61» (HSC, Part 8) is dropped (`wikiMatchDropped`).
  - The six «Chasm of Challenges: new quest» lines carry `scheduleLineOf` (the EV-1300 row they announce), so they are never
    built twice.
  - `short_2020.json` (Surprise events, Time Missions) is written into the sibling folder `tmp\events\records_later` until
    Task 7: `KHUX_EVENT_SRC` reads every `*.json` of the records folder, so a config exclusion was not needed.
- **Enemies.** The 15 approved challenge models are `approved: true` in `event_enemy_families.json`. 25, 135, 156 and 157 are
  complete with the generator's standard rules (`events2_export.py` SKIP, like 65). `extra_donors_events2.tsv` has 48 families.
  `make_jp_enemies.py` reports 314 complete, 0 incomplete. `build_event_enemies.py` adds 105 rows that waited for these models.
  The 12 models still missing stay held.
- **Maps and rooms.** The dry regen lists 1,467 candidate maps. The import (against the dry master, which has the new enemy rows)
  takes 1,449. 15 are left out for DB_0000_01_00 and 3 for STG absent. The rooms list grows from 162 to 208.
  rooms_gen has 272 complete rooms, 5 more: AG_0003_12_00, BC_0007_00_00, DB_0029_01_00, DB_0030_00_00 and DB_0030_02_00
  (543 files). `stage_gen\files\stage` holds the imported maps.
- **Quiz boards.** `recon/tools/make_quiz_dramas.py` gives each quiz stage its own drama and board ids. The plan
  `recon/tools/quiz_dramas.json` has 75 stages and 78 boards: dramas 1906101..1906178, pictures 39401..39478.
  - It writes `img/light/SEQ/<drama>.l`: the JP quiz script with the picture id (int 13) changed.
  - It writes the boards `img/light/NPC/<picture>.png` (private) and a generated transparent `30300.png`.
  - It writes `stage_gen\event_dramas.json` for `KHUX_EVENT_DRAMAS`. build-resources.ps1 runs it before btf_fix.
  - `event_config.json` quizDramas has 85 quest keys (EV-0763 included). Labels: quizBoard (khuxwiki text), quizBoardFootage,
    quizBoardScreenshot.
- **Cards.** `make_event_banners.py --all-rows --extra extra_part4_staging.json` on the dry index wrote 479 cards; the 138 old
  ones are byte-identical. make_special_banners `--section event` wrote 439 kept copies. imgVersion is 7.
- **Event Catalog.** Game-year tabs like the Raid Catalog's. The Story week's year opens first, and only its cards load.
  Real index: 324 events, 57.5 KB.
- **Dry regen** (copy of server/ at the repository's depth `tmp\t6r`, records copied; nothing live written):
  - 2,012 of 2,896 event quests served (634 of 798 before); 247 events with a served quest.
  - Challenge records: 2018 453 served, 2019 295, 2020 532, 2021 56 (1,336 of 2,272 quests).
  - Not served: mapUnusable 597, enemyMissing 146, mapKeyUsed 79, wikiEmpty 38, objectiveMismatch 18, boosterOnly 5,
    rewardTypeUnknown 1.
  - Quizzes: 53 served (EV-0484 14, EV-0500 7, EV-0538 14, EV-0624 9, EV-0910 7, EV-0763 2); the others are on the
    incomplete maps 720520 / 740260 / 740262 (mapUnusable).
    - **Shared answer maps** (coordinator ruling): every original quiz run sent its stages to the same answer maps 720510 /
      720520 / 720530 (and 740260-62). A quiz stage of another quiz record may share such a map key when the drops are equal;
      any other second record on a key still waits (make-events.js, test quiz_answer_map_shared).
    - **Quiz pages pinned by their answers** (build_challenge.py `quiz_pages_pinned`, private test `test_quiz_pin.py`).
      EV-0484 / EV-0500 share their stage names with EV-0538, so the run rules could not pin their bare khuxwiki pages, and
      the WW check held them. The bare page is now the page of the run when every quiz stage of the record has its page in
      quiz_texts.json and each page's answer is the exit of the stage's WW answer map (20 / 10 independent checks). The WW
      check then runs on that page's enemy list: it agrees on 720510 / 720530. The 720520 quests stay held (map incomplete).
  - 106 of 106 tables valid. Changed tables: stage, evStage, reward, enemy, enemyAttack.
  - Every stage and evStage id served before is unchanged. Only 4000021 and 4000027 change (their board drama).

## Surprise events and Time Missions (Part 4, Task 7 preparation, 10 November 2026)

Everything up to the live master regen; the regen, the resources and the bench follow.
- **Records.** `short_2020.json` (57 records: 51 Surprise events, 6 Time Missions, 2020-02..2021-02) is now in the records
  folder; `build_challenge.py` writes it there. Do not rerun the builder against a master that already holds the challenge
  enemy rows (since the Task 6 regen): it reads the live master, marks those enemies as present and shrinks
  `missing_challenge.json`, and a later `build_event_enemies.py` would then drop the rows. The Task 6 outputs are kept in
  `tmp\events\t6p4\rebuild`.
- **Surprise events are one-day events.** The donor master has ONE row per Surprise event, from 08:00 UTC to 07:59:59 UTC the
  next day, and every WW notice gave that whole Pacific day («12:00 a.m. to 11:59 p.m. (PT)»; the «15-60 minutes» of the
  plan was wrong, see the follow-up section below). The 12 h rule (`shortWindowHours`) did not see them: the event was listed
  for the whole Shop week. The builder now marks these records `shortWindow`, and make-events.js treats every donor row of such
  a record as a one-day row: the record is open on the Pacific day where its row starts (test
  `short_window_record_whole_day`; since the follow-up `oneDay`, no wholeDay label). It uses the start day only, because in summer
  08:00 UTC is 01:00 Pacific and the row would touch the next day. Time Missions need no mark: their donor rows are the hourly
  windows (6 targets x 4 hours a day), merged into one row per day (`short_rows_one_per_day`). Each day row lists all 18 or 21
  quests.
- **Calendar.** `test-event-calendar.js` `short_rows_generated_shape` uses the shapes of the dry index. EV-1055 is listed on
  Thursday 2020-03-05 from 00:00 to 23:59 Pacific, and not on 2020-03-06, its census end day. The Time Missions rows change
  every day.
- **Maps.** The dry regen lists 40 new candidate maps; all 40 are imported (1,489 of 1,507; same 15 + 3 left out as before),
  80 files in `stage_gen\files\stage`. No new room (event rooms list 208, unchanged). The maps are part of the generated
  pack, so `build-resources.ps1 -Quick` (or a full version) carries them; no static pack changes.
- **Dry regen** (`tmp\t7r`, nothing live written): 2,130 of 3,070 quests served (2,012 before), 254 events.
  - short_2020: 118 quests served in 7 events: EV-1055 (1 quest), the Time Missions EV-1075 (18), EV-1111, EV-1148, EV-1189,
    EV-1224 (21 each) and EV-1271 (15 of 21). 75 evStage rows.
  - Not served: 29 quests `enemyMissing` (26 Surprise events + 3 of EV-1271). The Surprise ones carry the Task 1 marker «no
    WW enemy list»: no khuxwiki page pinned to the run, so the map enemies stay unconfirmed. 21 `mapKeyUsed`: every Surprise
    event uses map 741710, and EV-1055 holds it. 6 `mapUnusable` (EV-1389/1398/1408 on map 743840 carry the same marker;
    3 of EV-1271).
  - Tables (dry run at imgVersion 8): only stage (+118) and evStage (+75) change. No served stage or evStage id moves;
    106 tables valid. With imgVersion 9 the live regen also changes the bannerUrl of every event row (v9).
- **Cards.** `make_event_banners.py --all-rows --extra` on the dry index: 125 new cards, each byte-identical to an approved
  staging card (`t5p4\event_img_staging_short`, different ids then). The 479 old cards are unchanged. make_special_banners
  `--section event` adds 125 kept copies; the catalogue banner is unchanged. imgVersion 8 -> 9.
- **Notice.** «Challenge events» gains the Surprise events / Time Missions line (counts from events.json, the whole day
  declared as not original).

## Surprise events, follow-up: shared map, confirmed enemies, community goals (Part 4, Task 7, 10 November 2026)

User decisions of 10 November 2026; everything up to the live master regen (dry run in `tmp\t7f`).
- **One whole day is original.** Every WW Surprise notice gave «12:00 a.m. to 11:59 p.m. (PT)» (62306, 64147, ...; research in
  `private\events\sources\surprise_2020\FINDINGS.md`). A `shortWindow` record whose rows are all whole days now gets `oneDay`
  (entry field) and no wholeDay label; wholeDay stays on the Time Missions, whose targets appeared at four set hours a day
  (notice 67747): declared as not original in the Events notice.
- **Shared map.** Every Surprise run used map 741710 (Cave of Wonders: Treasure Room; 743840 Beast's Castle: Fireplace for the
  Holiday Draw Tickets). A quest of another `shortWindow` record now shares the map key whatever its objective rewards (test
  `surprise_map_shared`); each keeps its own stage row. The drops are in the shared map file, so they must still be equal: all
  51 Surprise quests have the same drops (Gift Shadow / Bag O' Gifts drop slot 1, one Attack Prize chest, reward 80).
- **Enemies confirmed.** The khuxwiki pages of the 29 held quests list every run date, so they are pinned to these runs: 26 gem
  quests Gift Shadow x1 (target, Lv10), EV-1389 / 1398 / 1408 Bag O' Gifts x1 (target, Lv10; enemy 157 is in our master). The
  records are patched surgically by `tmp\events\challenge\patch_surprise.py` (idempotent; backup in
  `tmp\events\backup\t7f_before`); a rerun of build_challenge.py writes the marker back, so the patch must follow it.
- **Why EV-1389 / 1398 / 1408 were «map not usable».** No file was missing: the marker «(no WW enemy list)» has no enemy id, so
  the quests stopped before they became map candidates, and map 743840 was never in `event_maps.json`, never imported. With the
  marker gone the regen lists it, `import_event_stages.py` imports it (JP `mappoi_stg743840.bin` + `_00.bin`, room
  BC_0005_00_00 already served) and the next regen serves the three quests on the shared key.
- **Community goals** (user rule). The events whose result notice gives the number of players who cleared all objectives pay,
  once per event, the tier the original reached. Private data `tmp\events\community_bonus.json` (written by
  `tmp\events\challenge\make_community_bonus.py`, every quote checked against the notice text); make-events.js reads it
  (KHUX_EVENT_BONUS, default: next to the records folder) into `entry.communityBonus`; routes-events.js pays it into the
  Presents when every objective of the counted quests is cleared (`player.events.bonus`, once per event, kept events too; at
  login for an old save). Seven events: EV-1026 Summon Rush (732 players, 740 Jewels: «based on round number»), EV-1058
  Savage Vanguard (7,237), EV-1100 Sephiroth (8,529), EV-1127 Dragon Maleficent (7,701, also Draw Ticket x10), EV-1175 Mean
  Maiden (3,931; only its «Defeat the Mean Maiden» quests), EV-1221 Flame Core (4,370), EV-1243 Heartless Battle (4,026): all
  on the top tier (30 Power, Speed and Magic Gems). Left out: the FFBE collaboration (58199: goals counted in FFBE), the Union
  Challenges (tiers by Union), and two fixed completion rewards (61226, 68893: open question).
- **Dry regen** (`tmp\t7f`): 2,180 of 3,070 quests served (2,130 before), 304 events (254). +50 stage and +50 evStage rows (51
  Surprise events, all served; the 3 Holiday ones after the map import); no other row changes, event_ids.json unchanged (the
  ids were numbered in the Task 7 regen), 106 tables valid. Not served by reason: enemyMissing 175 -> 149, mapKeyUsed
  100 -> 79, mapUnusable 603 -> 600. The cards (and kept copies) of the 50 rows exist since Task 7 (`--all-rows`): no
  imgVersion change. Map import 1,490 of 1,508 (+743840); rooms unchanged (208). The new map goes into
  `stage_gen\files\stage` with `--stage-dir`, so `build-resources.ps1 -Quick` carries it.
- **Not added:** the 2020-05-15 Moon Gems run (notice 65678). The donor master has its row (201584, 2020-05-15 07:00 to
  05-16 06:59:59 UTC, stage 742560 «[Surprise Event] Moon Gems», map 741710, banner of the other Surprise rows), but the
  event census has no row for it (the notice is filed as the Proud Leviathan update), so it has no census id yet.
- **Added later (round g, below):** the 2020-05-15 Moon Gems run is EV-1532.

## Surprise events and completion rewards, second follow-up (Part 4, Task 7, 10 November 2026)

User decisions of 10 November 2026; everything up to the live master regen (dry run in `tmp\t7g`).
- **Holiday Draw Tickets.** The official notices of the three runs (72001, 72216, 72706) all say «Complete the challenge and
  receive 10 Holiday Draw Tickets!» (4 + 3 + 3 per run), as khuxwiki. The objectives of EV-1389 / EV-1398 / EV-1408 now pay
  type 41 id 1 (our Holiday Draw Ticket, `drawTickets.holiday`) instead of the donor value type 41 id 41 (paid here as a
  plain Draw Ticket). Record patch in `tmp\events\challenge\patch_surprise.py` (step 3, with the notice quote in each reward
  `note`), so it survives a rebuild like the other Surprise patches.
- **The 2020-05-15 Moon Gems run** is census row **EV-1532** (appended: no EV id moves; the notice 65678 was filed as the Proud
  Leviathan update only) and a record in `short_2020.json` (step 4 of patch_surprise.py): donor row 201584 (2020-05-15 07:00 to
  05-16 06:59:59 UTC), stage 742560 «[Surprise Event] Moon Gems» (equal to stage 741890 of EV-1036 but for its id), map 741710
  (shared, same drops), Gift Shadow x1, Moon Gem x1 per objective; khuxwiki lists May 15, 2020. Its card is the banner of the
  other Moon Gems runs (9ayfNxJF8): the new card and kept copy are byte-identical to theirs, no existing card changes, so no
  imgVersion change (the version only renews URLs whose picture changed).
- **Fixed completion rewards** use the community-goal mechanism: a `community_bonus.json` event with `kind: 'completion'`, the
  same `rewards` for every finisher (no count, no tiers) and `quests` (the name prefixes of the counted quests). make-events.js
  writes `communityBonus {kind: 'completion', count: null, rewards, ready, missing?}`: ready when every prefix has a quest and
  all are served; label `completionReward` (an original reward: the entry label stays); paid once into the Presents
  («Completion reward: ...»). The «Community goals» line of the Events notice (plain) lists them, worded as original.
  - **The Keyblade War Challenge Campaign** (notice 61226, census EV-1009: «Complete all of the challenges by Jan. 20 to receive
    every type of 1 Tier 10 Subslot Medals!», 3,847 winners): the six Kyroo [SAB LV 10] (Spirit / NM x Lord / Chef / Sir: our
    medals 311905, 301908, 311913, 301916, 301920, 311925; khuxwiki «The Keyblade War» names the same six). Counted: the eleven
    quests of The Keyblade War (khuxwiki: Battle vs. Master Aced, Looking for Master Gula Pt. 1-4, The Darkest Darklings, The
    Worst Nightmare, The Ultimate Test Pt. 1-4, part 3 by Union). Attached to EV-0929, the only record of The Keyblade War
    (parts 1-2, seven quests): **not ready** — the record has no start date (not listed) and part 3 is in no record.
  - **JP 5th Anniversary KHUX & KHDR Campaign** (notice 68893, census EV-1266): WW content (WW notice in English with Pacific
    times, rewards «Distributed to only KHUX» into the WW gift box). The challenge is the ten «Genie Jafar - n/10» quests of
    donor row 202665 (Sep. 3-15, 2020: their objectives give exactly «up to 30 Draw Tickets, and 30 Gems»); that row has no
    record yet (EV-1266 is a CELEB row), so the reward is kept in `pending` of community_bonus.json with its full list
    (3,000 Jewels, Draw Ticket x50, M-type = Sir Kyroo upright / reversed LV 7 x10, LV 8 x6, LV 9 x3, LV 10 x1, Power / Speed /
    Magic Gem x10, Sun and Moon Gem x1; the KHDR-only rewards left out) until its record is built.
- **Checks kept:** the Mean Maiden bonus counts only its ten «Defeat the Mean Maiden» quests (test community_bonus_attached,
  `questPrefix`; dry index: 10 of 15 quests); quests on a shared Surprise map must still have equal drops (test
  surprise_map_shared, «other drops: still a clash»).
- **Dry regen** (`tmp\t7g`): 2,181 of 3,071 quests served (2,180 of 3,070), 305 events (304); +1 stage row (4003301), +1 evStage
  row (22627), the three Holiday stage rows change only `submissionItemId` (41 -> 1); no other row changes, no served quest
  moves; event_ids.json +1 row, +1 entry, +1 check; 106 tables valid. No map import (741710 is served), no resource build.

## Part 4 summary (challenge and battle events, 10 November 2026)

Final state (rev 293, resources 110 + a `-Quick` pack with map 743840; plan
`docs/superpowers/plans/2026-11-09-events-part4-challenges.md`, ledger `.superpowers/sdd/2026-11-09-events-part4-challenges/progress.md`):
- **Data.** Private records `challenge_2018..2021.json` and `short_2020.json` (census EQ, KEY, QUIZ; built by
  `tmp\events\challenge\build_challenge.py`, then `patch_surprise.py`, which must be re-applied after every rebuild). Every donor quest
  cross-checked against khuxwiki: an unpinned page never sets enemies, objectives that disagree hold the quest (`objectiveMismatch`,
  CROSSCHECK.md, I-251).
- **Served.** 305 events, 2,181 of 3,071 quests (challenge events: 213 events, 1,564 of 2,340 quests; 2018 44 events / 453 quests,
  2019 45 / 372, 2020 109 / 675, 2021 15 / 64). Not served: mapUnusable 600, enemyMissing 149, mapKeyUsed 79, wikiEmpty 38,
  objectiveMismatch 18, boosterOnly 5, rewardTypeUnknown 1.
- **Maps.** Event rooms list (`event_rooms.json`) read by `make_jp_rooms.py`; other original copies tried for incomplete maps (one copy
  per map, a mix only when the shared files are identical); 1,490 of 1,508 candidate maps imported.
- **Enemies.** 15 new models approved by the user on rendered reviews (two rounds; Demon Tide repeats tentacle frame 14, declared);
  atkSp of Leviathan, Metal Giant and Jack in the Box completed; 12 models still missing (I-250); renders to recheck (I-252).
- **Rewards.** Payable types widened to what the server pays; a Booster reward goes once into `player.pendingBoosters` for Part 6
  (I-166), a Booster-only quest is held; an unknown reward type holds the quest and never reaches the client.
- **Quizzes.** No original WW quiz file survives: 75 boards (5 original screenshots, 5 redrawn from footage, 65 rebuilt from the
  khuxwiki text, style and typo fixes approved by the user), each quiz stage with its own drama (1906101..178) and picture
  (39401..478), made by `recon/tools/make_quiz_dramas.py`; quiz stages share the answer maps 720510 / 720530 as in the original.
- **Short events.** Surprise events open their whole Pacific day (original, every WW notice) and share map 741710 (743840 for the
  Holiday Draw Tickets runs, which pay the Holiday ticket); the 2020-05-15 Moon Gems run is EV-1532; Time Missions open all day
  (not original, declared).
- **Community goals and completion rewards.** 7 events pay once into the Presents the tier the original reached
  (`community_bonus.json`, KHUX_EVENT_BONUS); fixed completion rewards use the same mechanism (`kind: 'completion'`): The Keyblade
  War waits for its date and part 3 (I-247), the 5th-anniversary Genie Jafar quests wait for their record (I-248).
- **Catalogue and cards.** 479 cards after Task 6 and 125 for the short events (imgVersion 9); Event Catalog with game-year tabs (the story week's year opens first);
  KEPT RAID / KEPT EVENT tabs top left in their catalogue colours (variant B).
- **Notice.** «Events» section «Challenge events»: counts by year from `events.json`, quiz boards and their sources, Boosters later,
  Surprise events (whole day, original) and Time Missions (not original), community goals and completion rewards.
- **Open:** I-247 .. I-252; map 743840 bench look (I-249); the Part 3 open points still stand.

## I-251: khuxwiki / donor objective conflicts decided (10 November 2026)

User decisions (evidence table private `tmp\events\i251\DECISIONS.md`), applied in the private importer so a rerun reproduces them:
- **Precedence rule (new).** A donor stage used by ONE run only is that run's own game data: the donor value wins over a khuxwiki
  transcription unless a contemporary notice or banner contradicts it. The old order (notice > khuxwiki > donor) stays for stages
  reused by later runs, decided case by case. Written as a comment where it is applied (private pilot `build.py`, `P4_OBJ_DECIDED`).
- **Decided for the donor (20 quests).** Group A (wiki copy errors: EV-1236 Heartless of Speed / Magic, EV-0853 Lady Luck (3),
  EV-0450 Mean Maiden 9/10), group C (single-use stages: EV-0513 Coco 4/10 and 10/10, EV-0522 #2, EV-0584 Equipment Cost Challenge
  Returns x7, EV-0641 10/10, EV-0670 1/10, EV-0795 #4, EV-0904 Shiva 10/10, EV-0917 Titan 10/10) and DAY 10 (stage 730200, Moogle
  O' Glory in the 2018, 2019 and 2020 runs: the series' 7-keyblade rotation). The record keeps the donor objective and reward and
  carries `objectiveResolved` (a note) instead of `objectiveMismatch` (a hold); make-events.js needs no change
  (`test-make-events.js` `objective_resolved_is_served`).
- **Page pin fixes (separate change, `P4_PAGE_PIN`).** EV-0948 (October 2019) used the «(November 2019)» pages of EV-0968: now
  the bare «Big Bonus Challenge n/7» pages (Savage Vanguard, within 4 turns, as the donor and notice 58881). EV-1300 Round 3
  stages 355200-355203 used the «(Round 2)» pages: now the «(Round 3)» pages (Sun Gem / Moon Gem, Round 3 targets). EV-0483 720470
  now uses the (06/11/2018) page (Queen Bee, Defeat 13); 720460 has no page. Group B (11 quests) needs no objective decision after
  these pins.
- **Rerun without drift.** The builders read «our master» frozen as the Task 6 records saw it (private `our_master_snapshot.json`):
  a rerun against the live master no longer marks the event enemy rows as ours. `KHUX_CHALLENGE_OUT` writes a rerun to a scratch
  folder; zero drift was proven before the I-251 changes. A private check (`tmp\events\i251\check_i251.py`) proves the values.
- **Dry regen** (scratch copies, live files untouched): `objectiveMismatch` 18 -> 0. The released quests' maps were never imported, so
  the served totals stay 305 events / 2,181 quests until `import_event_stages.py` runs; with the maps imported on the dry index:
  307 events / 2,210 quests (+29: 26 of the 30 and EV-1300 355200-355202). Still held: EV-0450 722690, EV-0853 740643 (JP map
  incomplete), EV-0522 729920 (room DB_0000_01_00 not served), EV-0483 720460 (no khuxwiki page, enemies unconfirmed).
  event_ids.json unchanged. Live order: regen, `import_event_stages.py`, regen, bench.
- **Lessons for Part 5.** Never run `make_jp_enemies.py --ids` (it pruned enemy_gen and a master regen during the rebuild served only
  393 quests); a builder rerun against a master that already has the new enemy rows shrinks the missing list; read the original
  notices before trusting the plan's window rules (the Surprise «15-60 minutes» was wrong); a shared map is allowed when the drops
  are equal; banner art and notices decide reward mixes over the wiki.

## Generator rules for the Org XIII events and The Keyblade War (Events Part 5, Task 3, 10 November 2026)

`server/make-events.js` (plan `docs/superpowers/plans/2026-11-10-events-part5-orgxiii.md`, report
`.superpowers/sdd/2026-11-10-events-part5-orgxiii/task-3-report.md`):
- **Objectives.** An objective with `code: null` holds its quest (`objectiveUnmapped`, the text in `why`); no stopgap code, no
  text-to-code mapper (Task 1 found none: the 2016-17 runs are donor stage rows).
- **Generated maps** (`map.source 'generate'`, label `wikiRoom`). stageBinId = the quest's own stage id. Enemies from `wikiEnemies`
  (target counted once) by the make-special.js name rule (event rows never answer); an objective on an enemy id puts that id on
  the map for as many members as it counts. Unknown name, or a JP «variant» target the record names without Ω: `enemyMissing`, no
  entry. «Collect all materials» on a generated map: held (`mapUnusable`). Every other candidate goes into
  `game_data/event_gen_maps.json` (gen_story_maps.py config key `events`, the «special» list shape plus `roomCodes`, `censusId`).
  Served only when the gen_story_maps.py report (`<KHUX_EVENT_MAPS>/gen_report.json` or `KHUX_EVENT_GEN_REPORT`) lists its stageId
  with `event: true`.
- **JP twins** (`map.source 'jpTwin'`, label `jpTwinMap`) are served on the JP key and may share it with another record's quest
  (equal drops). A `levelShifted` twin (label `levelShifted`) gets its own key (its stage id) with `fromKey` = the JP file and
  `levelShift {from, to, delta}` in `event_maps.json`; it is served only when the import report marks that key `levelShifted: true`
  (contract for `import_event_stages.py`, Task 4: copy `fromKey` to the stage id and shift every enemy level).
- **Data-hole records** (`rec.dataHole`): a quest whose original stage row loaded another stage's map (`map.stageBinId`, the Daily
  XIII quests on the monthly maps) shares that map (equal drops). Other records keep the Part 4 rule.
- **Second notices.** `scheduleLineOf` -> reason `scheduleLine`: no row, no card, no catalogue row. `datesOf` dates the target
  (EV-0913 -> EV-0929 from 2019-09-03; with no end, the Pacific day its last donor row ends: 2019-10-03).
- **Rewards.** `rewardTypeAliases {18: 20, 19: 20}`: avatar sets and style parts are paid as avatar parts (type 20), each id as the
  row lists it (the ♂ part on one objective, the ♀ part on the other, as the Special quests), once.
- **Unions** (The Keyblade War Pt. 3). `unionQuests` give each index quest its `union` (1 Ursus, 2 Anguis, 3 Unicornis, 4 Vulpes,
  5 Leopardus); routes-events.js lists only the player's own Union version. `stagesOf` lists EV-0929's built quests on the EV-0941
  card (`sharedWith`). The record's `completionReward` joins the bonus list: `communityBonus.byUnion` / `readyUnions`, paid to a
  player when the common quests and their own Union's quests are done. I-253 item 2 fixed: a counted quest without objectives
  counts once cleared (playStatus).
- **Catalogue.** `catalogName` renames the Event Catalog row and page (EV-1089 «Challenge Organization XIII Pt.1»).
- **Fix round 1 (review).** Generated-map enemy ids are never picked silently: an explicit record id (`wikiEnemyIds {name: id}`,
  `targets[0].id`) wins; else one row (or same-stat rows) of the name; rows with different stats hold the quest (`enemyAmbiguous`,
  the candidates in `why`): 42 of the 55 candidate quests until Task 4 pins the ids. `datesOf.quests` opens only those quests on
  the line's date; the others get `openFrom` (their own donor row's Pacific day, EV-0929 740905 / 740910 on 2019-09-20), read by
  event-calendar.js. The bonus check counts the stage being cleared (server.js writes its playStatus after `onStageClear`). JP-twin
  map sharing is limited to `dataHole` records, as `binShare`.
