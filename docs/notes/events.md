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
| `eventType` | 2 (raid button, Raid Boards), 0 (catalog banner) | 1 on most quest events (daily, coins, quiz, Org XIII, time attack), 3 on the countdown dailies, High Score, the keyblade and the character-return events, **(unverified)** what the client does with 1 and 3 (the 30-10 note says 1/2/4 are board/raid modes: check on the bench before relying on it) |
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
- **Objective rewards**: `submissionRewardType` / `submissionItemId` / `submissionItemNum` with `validSubmission` 3. Reward types seen: 3 medal, 7, 15 Event Coins, 26, 28 Skip Ticket+, 33 Spirit part, 40. 15 is paid into Raid Coins until the event boards exist ([bacheche.md](bacheche.md)).
- **First-clear reward**: `validClearGetItem` with `clearGetItemType/Id/Num`: **0 on all 16 pilot events** (19 of 3,852 event-range donor stages have one; `validClearGetSphere`, `validClearGetTitle` never). So a quest event pays only through its objectives.
- **Drama**: `validBeforeDrama` / `validAfterDrama` set on the Quiz (every stage), the Dark-Winged and New Friend events: the dialogue ids point at drama files (**unverified**: whether our resources have them).
- **Map**: `stageBinId` 0 on most pilot rows; the quiz sets bins 740260-740262. The client loads the map from the stage or bin id; the donor `mapName` is a placeholder («...»).
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
maps. From the census, the Worldwide 2021 master references 1 map per event (a few 3 to 16), of which the Japan 4.3.1 resources hold only the quiz
(3 of 3) and the "New Friend" event (15 of 16); the others are missing and have to be found. The stage tables do not name enemies or drops: those come
from the map files (`mappoi`) and the `enemy` / `reward` tables, so each map must be found with its enemy list (no substitutes, as decided in the design).

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
4. Drama ids and maps of each pilot event: found/missing per event goes into the data, not into this note.
5. `eventCategory` 4 for High Score rows: confirm the tap opens the High Score mode with a stage row of `disableContinue` 1.
6. Reward type 15 (Event Coins) stays paid into Raid Coins until the event boards exist.
