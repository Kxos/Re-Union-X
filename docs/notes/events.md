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
- **Order of the Events tab** (`/stage/event` category 2): Raid Catalog banner, kept raid, the week's raids (routes-raid.js), then the
  kept event, then the week's events (`routes-events.js`), then `save/event.json` (bench only).
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
  Quests that moved to a record keep their stage ids (key moved); the others keep them reserved under `<censusId>~old/`. Three
  «Event & Trait Medals» rows (June-August 2020) stay on their Monthly record, owner not certain.
