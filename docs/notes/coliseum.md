# Coliseum (PvE) - spec summary

Research for the next game mode after raids (I-054 entry screen done, I-059 gameplay open). Facts only; the detailed
per-month data and the sources stay in the private event catalogue (`private\events\sources\coliseum\COLISEUM.md`).
Tags: **proven** = read from original data/code or two agreeing primary sources; **probable** = one good source or
strong inference; **unknown** = not found yet. Current server state: [server.md](server.md#colosseo) (`respondColosseum`
answers status 2 «This event is unavailable.»).

## Rules

| Rule | Value | Tag |
|---|---|---|
| Unlock | story quest 130 | proven (notices, bench) |
| Season | one per calendar month, day 1 00:00 PT to month end (UTC 07:00/08:00 with DST) | proven |
| Structure | Tiers (client `rank`) of N Rounds (`stageCount`); one round = one Coliseum stage `cl_stg<YYYYMMNN>`, room `OC_0001_00_00`, one map part, 1-4 waves (map teams) | proven |
| Stage set | 10 stages per month (9 from 2020-02), rounds cycle through them | proven (data), cycle probable |
| Enemy strength | 1.0.1 client: level rise = rounds of all previous tiers + `lvPerLoop` x floor((round-1)/`loopStageCount`) (10 / 10 in the master); stage files carry levels 1..10 ; the 4.3.1 client uses (rounds of previous tiers + round) x floor(`lvPerLoop`/`loopStageCount`) | proven (1.0.1 and 4.3.1 code) |
| Last tier | endless; the 2016 master writes 999, the 4.3.1 client shows «∞» only for `arrivalStageCount` 0 | proven |
| One-turn shortcut | clearing all waves in one turn unlocks the next rounds at once («Unlocked Round %d!», «Shortcut Unlocked!»); clearing a round locks the skipped ones again; size per tier = master `excellentUnlockCount` (= wiki "skip limit") | proven that the values match, exact rule probable |
| AP | 3-5 per round until 2017-04 (1 AP / 0 AP campaigns), 0 at every tier from 2017-05 | proven (notices + wiki) |
| Currency | Coliseum Coins (`userPoint.colosseumSpherePoint`, reward type 17) per round and per tier clear; spent on Coliseum boards | proven (type 17 in the 4.3.1 client) |
| Ranking | monthly ranking by progress (total rounds cleared), brackets with rewards | probable (metric) |
| Loss | the client sends `/colosseum/retire` by itself; progress kept or not is the server's rule | client proven, original rule unknown |

## Numbers per era (WW)

| Era | Tiers | Rounds per tier | Tier-clear coins |
|---|---|---|---|
| 2016-04 (launch) | 6 | 20, 15, 15, 10, 10, 999 | 30, 40, 50, 70, 100 |
| 2016-05 .. 2016-10 | 10 | 20, 15, 15, 10 x6, 999 | 30 .. 100, then 600 (900 in 2016-06) |
| 2016-11 .. 2017-04 | 11-12 | + one 10-round tier | + 900 |
| 2017-05 .. 2018-03 | 14-19 | ..., 50, 100, 300, 500, 999 | + 900, 1500 |
| 2018-05 .. 2018-12 | 13-19 | as above | lump sums 50 .. 3000 (sum 8100), per-round coins dropped in 2018-12 |
| 2019-05 .. 2021-06 | 11-15 | 200, 400 x6, 300, 200, then 100 | 100 .. 700; tier 10 gives the title "<Month> Victor" |

Coins per round were 1, 3, 5, 7, 10 (later 0/10/30). Tier rewards also carried support medals (Moogle, Cid, later
Magic Mirror and others). Values: 2016 seasons from the 1.1.3 master, the rest from the English wiki (probable).

## Timeline

- JP: master rows from 2015-06-29; JP wiki data from 2015-09.
- WW: Coliseum present at launch (2016-04); first monthly update 2016-05-01; +1 tier 2016-11; 0 AP from 2017-05;
  lump-sum coins 2018-05; renamed "PvE Coliseum" when the PvP Coliseum started (2018-09, WW titles from 2019-05);
  structure revamp 2019-05; last month on record 2021-06 (service end 2021-06-30).
- WW reused older JP stage sets: 2016-04..2016-11 per the master (JP 2015-07 .. 2016-03), 2016-12..2018-06 about
  7-10 months behind JP (enemy-name match), same month as JP from 2018-07.
- Side events at the Coliseum (Hercules tag team, Moon Gem Cup, Cloud battles, Keyblade Challenge) were event quests,
  not this mode.

## Data on disk

- JP 4.3.1: 546 `cl_stg` stage files (2015-07 .. 2021-06 with gaps: 2016-01..04, 2016-11..2017-05, 2019-07, 2020-01,
  2020-10 absent). Readable with `recon/tools/mapfile.py`.
- WW months whose JP set is not on disk: 2016-08..11, 2017-06..12, 2018-04/05, 2019-07..09.
- Coliseum enemy id = 20000 + base enemy id (later also 21xxx/22xxx); these variants have their own stats. 202 of
  the 305 ids used by the stages are not in `server/master_data/enemy.json`.
- Master `colosseum` (21 fields: tier row per season with `round`, `ap`, `arrivalStageCount`, `excellentUnlockCount`,
  per-round and tier-clear reward slots) and `colosseumStage` (11 fields: season dates, head/term tier ids,
  `rankingId`, `validStage`, `stageId[10]`, `loopStageCount`, `lvPerLoop`): rows exist only for 2015-06..2016-11.
- JP 4.3.1 layouts cover every Colosseum layout the server is missing (`AdventureTop2_Colosseum_Button/Panel/Target`,
  `Colosseum_MainPanel`, `BattleResultColosseumScene`, ...).

## Client schema (WW 4.3.1 client, analysed 5 November 2026)

The bench runs the unmodified **WW 4.3.1** client. It **does** read the master tables `colosseum` and `colosseumStage`
(the 5.0.1 offline client dropped them together with the whole Coliseum UI; that build is not what we run). Our
`server/master_data/colosseum.json` and `colosseumStage.json` are empty, so the season and the tiers must be served
there. Every key below is required (a missing or mistyped key makes the client reject the response) unless marked.

### Master rows

| Table | Fields (all int unless noted) | What the client uses them for |
|---|---|---|
| `colosseumStage` (one per season) | `colosseumStageId`, `openDate`, `closeDate`, `rankingCloseDate` (date strings), `headColosseumId`, `termColosseumId`, `rankingId`, `validStage`, `stageId` (array of 10), `loopStageCount`, `lvPerLoop` | `closeDate` -> «Ends in %s»; head..term = the tier rows of the season; `lvPerLoop / loopStageCount` = level gain per round |
| `colosseum` (one per tier) | `colosseumId`, `colosseumStageId`, `round` (= tier number), `ap`, `arrivalStageCount` (rounds in the tier, **0 = «∞»**), `rankId` (string), `excellentUnlockCount`, `validStageReward`, `stageReward{Type,Id,AssignType,SkillId,SkillLv,Num}`, `validReward` (slots used), `reward{Type,Id,AssignType,SkillId,SkillLv,Num}` (arrays of 4) | tier labels and «Round x/y», per-round reward, tier rewards, shortcut size |
| `stage` (existing story table) | one row per round stage id (the 2016 master used `stageKind` 3, `mapName` "Coliseum", world 5) | the round list reads it for the AP display |

The client finds a tier by scanning head..term for the row whose `round` equals the response `rank`.

- **Enemy level rise** (client side): (rounds of all previous tiers + current round) x floor(`lvPerLoop` /
  `loopStageCount`), added to the levels in the stage file. With the 2016 values (10/10) every round adds +1 level.
- **Stage files**: battle loads `stage/cl_stg<stageId 8 digits>.bin` + `_00.bin` for the `stageId` of
  `startColosseumData`. They only hold the waves and the enemies (id, level) plus the room name; the arena is the shared
  room `OC_0001_00_00` (proven in code and data, and it matches the user's memory). A missing month only needs its
  enemy lineups.

### Requests and responses

| Action | Path | Request | Response keys |
|---|---|---|---|
| 124 | GET `/colosseum` | - | `colosseumInfo{colosseumStageId, status}` (2 = «This event is unavailable.»), `colosseumStages[]{rank, stageCount, stageId, useAp}`, `colosseumRank` (uint), `userColosseum{userRank, userStageCount, userStageTotalCount}` |
| 125 | GET `/colosseum/reward/list` | - | `getRewardRankIds`: int array of tier numbers whose tier reward was obtained, **sorted ascending** (the client binary-searches it); drives the clear mark in the Tier Rewards list. No board data |
| 126 | POST `/colosseum/start` | `rank, stageCount, stageId, userKeybladeId` (the chosen element) | `userData.userPoint`, `colosseumInfo`, `userColosseum` (stages and `colosseumRank` not read here), `userTreasures[]`, `startColosseumData{rank, stageCount, stageId, userKeybladeId (uint64)}`, `campaigns[]` (int array) |
| 127 | POST `/colosseum/retire` | `burst` | `userKeyblades[]`, `userData.stageResumption{resumptionStatus, stageId, raidId, colosseumStageId}` |
| 128 | POST `/colosseum/clear` | `isSkip` (bool, = all waves cleared in one turn), `enemyDeadNumber`, `mimicDeadNumber`, `maximumDamage`, `guiltBurstMaximumDamage`, `userKeybladeId`, `burst`, `lux`, `rank`, `stageCount`, `stageId` | `userData.userPoint`, `userData.userDetail`, `clearColosseums[]{rank, stageCount}` (**never empty**), `userMaterials[]`, `userMedals[]`, `userSkills[]`, `userTitles[]`, `userKeyblades[]`, `userDecks[]`, `userAvatarParts[]`, `userKeybladeSubslots[]`, `getLux` (uint64), `userData.stageResumption` |
| 139/140/180 | GET `/ranking/colosseum`, `/own`, `/border` | - | `{rankingDatas[], rankingStatus, rankingTermStart, rankingTermEnd}`; each entry = the usual ranking user fields + `userColosseum{userRank, userStageCount, userStageTotalCount}` + `arrivalTime` (date) |

Behaviour read from the client:

- Each `colosseumStages` element is one selectable round (list row «Tier» / «Round stageCount/arrivalStageCount» /
  «AP Cost useAp», map panel, enemy preview). The in-game help says «Select a round to play. You cannot replay rounds»:
  the server decides which rounds are playable.
- **Loss**: the client sends 127 by itself when the battle is lost and reads nothing Coliseum-related back, so what
  happens to progress is entirely the server's rule (the original rule is still unknown).
- **Shortcut**: with a one-turn clear the client plays the «All 1 Turn» animation showing the tier's
  `excellentUnlockCount`, then sends 128 with `isSkip` 1. The jump itself is done by the server (the next 124 must list
  the unlocked round). The texts «Unlocked Round %d!» / «Shortcut Unlocked!» are not loaded by client code.
- **Result**: for each `clearColosseums` entry the result shows «Tier %d, Round %d Complete!» with the round reward
  (if `validStageReward`), and the tier rewards when `stageCount` = `arrivalStageCount`; the tier-up panel
  (`BattleResultRankUPScene_ver103`) shows the first and the new tier. The server must actually grant what the master
  rows say.
- **Ranking**: tier/round progress with `arrivalTime` as tie-break.
- **Reward types**: 17 = Coliseum Coins, **32 = Cross Coins** (Union Cross currency); in the 2016 master 32 only appears
  with amount 0 as an end marker.
- `Base_Colosseum_Rank` / `base_colosseum_rank` is just the Coliseum-rank widget of the profile page.

Screens the client loads that are still missing on our server: `AdventureTop2_Colosseum_Button/_Panel/_Target`,
`Colosseum_MainPanel`, `BattleResultColosseumScene`, `RankingColosseumScene_ver1301`, plus the non-layout assets
`ActMapColosseumAnim` (armature), `img/colosseum/*` (Colosseum01-03 plists, ClassNum, RoundNum, Rank_Num) and
`img/adventure/stage/OC_Colosseum_Panel(B).png`. Present: `BattleResultRankUPScene_ver103`, `Colosseum_FieldMenu_ver350`.

Also: `/mypage rankingRewards.rankingColosseum`, profile `userColosseumRanking`, record `colosseumRankingHighest`,
`stageAchievement.colosseumRank`, `lastPlayColosseumSphereBoardId`.

## Missing before implementation

1. Bench probe: what the colosseumStages elements are exactly (one per tier, or current round plus the shortcut target),
   where 125 is called, the screen after an `isSkip` clear, status 1 with an empty list.
2. Stats for the Coliseum enemy variants (rebuild as for raids).
3. Stage files for the WW months not in the JP data (regenerate from the wiki lineups, mark as a deviation).
4. Coliseum boards (rows, node costs).
5. Original loss rule (not decidable from the client).

## Gap research (5 November 2026, night)

Web and data side; details and per-id tables in the private dossier.

- **Arena.** 545 of the 546 JP stage files use room `OC_0001_00_00` with one part (the other is a test id); every enemy
  has level = round number (one exception). A missing month needs only its lineup (proven; matches the user's memory
  that the map never changed).
- **Wiki lineups are exact.** On the 18 WW months whose JP stage set is on disk, one khuxwiki enemy row = one wave:
  wave count equal in 180 of 180 rounds, enemy count per wave 177 of 180 (proven).
- **Gap months.** WW 2017-06 .. 2017-12 = JP 2016-11 .. 2017-05 (khuxwiki and the JP wiki agree round by round, 10 of 10
  in all 7 months: proven). WW 2018-04 = JP 2017-09 and WW 2018-05 = JP 2017-10, both on disk (proven). WW 2019-05, 06,
  08, 09 = the same JP month, on disk (proven). Still lineup-only (wiki, probable): WW 2016-08 .. 2016-11 and 2019-07.
- **Enemy variant rule** (1.1.3 master, 110 Coliseum rows with their base): same level knots and ATK (110 of 110), same
  DEF (103), same HP at LV 1/35/100 (90 of 95 changed rows), HP at LV 300 = 3 x base (78 of 95), HP at LV 999 =
  40/11 x own LV 300 (81 of 95), no munny or raid points (proven). Applied to the 202 missing ids: 3 derivable by
  the rule, 34 month-specific copies of a 1.1.3 row (probable), 15 weak (2019 ids), **150 unknown** (no original row
  for the model anywhere on disk; KHUX shows no enemy HP numbers, so only estimates as for raids).
- **Tier rewards.** The 1.1.3 master does carry the tier medals (reward slots 1-2, Moogle and Cid medals) and matches
  the 2016-05 notice exactly (proven); 2016-12 .. 2018 from the wiki templates (probable). Reward type 32 appears only on
  the endless tier and on a trailing 0-round row of every season (an end / no-reward marker).
- **Boards.** Node lists with costs for every WW Coliseum board 2016-04 .. 2021-06 are on the English wiki (avatar boards
  19 nodes / 1100 coins in 2016-2017, 3500 in 2018, 1230 from 2018-12, 4900 + 260 from 2019-05; Tier 10 Bonus 3090
  coins, 3390 in 2016-05). Contents of one board checked against its notice: equal (proven); costs probable.
  The 1.1.3 master board tables (`sphere`/`sphereArray`/`sphereMasu`, `type` 3) hold the WW Coliseum boards 2016-04 .. 2016-10
  with exact cells, costs and grid (proven). The three «???» boards of the wiki (Cid SR+, KH Cloud/Yuffie Costume) are JP-only
  (2015-09, 2015-12): Cid SR+ = the WW 6★ Cid board (probable); KH Cloud/Yuffie ran in WW only as 3000-Jewel boards (2016-07,
  proven), their JP Coliseum cells are unknown.
- **Ranking.** Metric progress (rounds cleared), ties broken by the time the round was reached (JP 1.0.5 change,
  probable). **Loss rule still unknown** from web sources.

## Probable data check (6 November 2026)

Cross-check of the wiki-only data against the official WW notices, period reddit threads (via the Wayback Machine) and
WW gameplay videos of 2016-2017 (round-select screens, boards, ranking screens).

- **Lineups.** WW 2016-08 .. 2016-11: every round visible in the videos (10 rounds over the four months) matches the
  English wiki; the other rounds stay wiki-only. The 1.1.3 master row for 2016-11 (stage set of 2016-03 again) is not what
  WW played (refuted). WW 2019-07: a period infographic matches the wiki in all 10 rounds, waves, counters and buffs
  (proven). WW 2017-05 = JP 2016-10 stage set (proven on video).
- **Enemy level** shown in battle = rounds of all earlier tiers + current round number (9 readings, 2016-08 .. 2017-05);
  the stage is the round within the tier cycled by 10 (proven).
- **Shortcut.** A one-turn clear unlocks exactly the tier's skip value (18 / 12 / 8 in tiers 1 / 3 / 5 of 2016-11); the
  next round is the cleared round + that value, also across tiers ("Tier 1 > 3"), and the skipped rounds are reported as
  complete with their per-round coins (proven).
- **Boards.** Node costs of the 2016-2017 avatar boards (19 nodes, 1100 coins) and of the Tier 10 Bonus board (3090) are
  proven on video (August, October, November 2016). Tier 11 Bonus present in 2017-05 (proven). Totals of the boards from
  2018-12 (1230 / 1470 / 1900 / 3500 = 8100 = all tier-clear coins) and from 2019-05 (4900 + 260 + 3 x 8580 = 30900 =
  all coins up to tier 9) close exactly and agree with the JP wiki / a 2019 player report; their per-node costs and the
  2018 3500-coin boards remain wiki-only (probable).
- **Ranking.** Ordered by progress (tier, round): proven on a 2016 Top 10 screen, each entry shows the time the round was
  reached; tie-break by that time still probable. Notice brackets 2016-06 .. 2016-11 equal the wiki except the two lowest
  brackets of 2016-07 (notice: 5-star Chip/Dale x1).
- **Enemy stats.** No other enemy master exists on disk; the 2019 ids and the month-specific copies stay probable/weak.
