# Raids

Design: [2026-11-01-raids-design.md](../superpowers/specs/2026-11-01-raids-design.md). Client analysis 1 November 2026, read from
the code, not yet run on the bench except where stated; details and addresses are in private notes.

## Routes

Every listed field is mandatory, or the client answers «200 ERROR». There is no retire route.

Shared: `Info` = `raidId` uint64, `level`, `useAp`, `timeLeft` and `feverTime` (date strings, against `ret.serverTime`), `feverFlag`,
`stageId`, `parts[]`. `parts[]` entry = `raidEnemyId`, `partsId`, `hp` uint64, `attribute`, `rare`, at most 6.
`User` = `userId`, `name`, `level`, `userAvatar`.

| Action | Route | Request | Response, in order |
|---|---|---|---|
| 240 | GET `/raid/list/181221` | | `selfRaid {raidStatus, raid: Info}`, `raids[] {raid: Info, discoverer: User, isRelief, isEntry}` |
| 122 | POST `/raid/start` | `raidId`, `supportUserId`, `userKeybladeId` | `userData.userPoint`, `raid`, `players[]`, `startRaidData {raidId, supportUserId, userKeybladeId}`, `vitalsLog[]`, `partsLog[]`, `discovererUserId`, `campaigns[]`, `supportUsers[]` |
| 123 | POST `/raid/clear` | `parts[] {raidEnemyId, partsId, hp, damage}`, `getPoint {exp, money, lux}`, `maximumDamage`, `guiltBurstMaximumDamage`, `burst` (no `raidId`: the server remembers it) | `userData.userPoint`, `userData.userDetail`, `raidTimeStatus`, `reliefFlag`, `userSkills[]`, `userTitles[]`, `userKeyblades[]`, `getLux`, `userData.stageResumption` |
| 120 | GET `/raid/reward/151101` | | `userData.userPoint`, `raidRewards[] {raidId, level, subdueId, mvpId, partAllId, parts[], userMedals[], userSkills[], userTitles[], userMaterials[], userAvatarParts[]}`, `guiltBurstFirstUserMedalIds[]`, `guiltBurstMaxUserMedalIds[]` |
| 121 | GET `/raid/member` | `raidId` | `cooperators[] {user, damage}`, `discovererUserId`, `mvpUserId` |
| 241 | `/user/notice` | | `raidNotice` drives the home Raid button (`isSelfRaid`, `isOthersRaid`) |

`/raid` (117) and `/raid/list` (118) look unused in 4.3.1.

## How a raid runs

- **Spawn.** The client does not learn it from `/stage/clear`: it asks action 240 entering the quest screen and the raid list.
  `selfRaid.raidStatus`: 4 plays `lwf/raid/demo/start_%04d` (boss just appeared), 3 active, 2 plays `escape_%04d`, 0 and 1 only run the
  reward check. The map shows the boss with status 3 or 4, `raidId` set, `timeLeft` in the future and `parts[0].hp` not 0.
  `/stage/clear` carries `getPoint.raidPoint` and `enemyDeadNumber`; the Eggcognito rule is the server's.
- **Damage kept between attempts.** The client keeps no HP between fights: each part starts from `raid.parts[i].hp` of `/raid/start`
  (absolute HP, same unit as `raidEnemy.hp`). HP 0 means the weak point starts broken. So the server can start a boss damaged, and
  the 3-minute weak point rule is the server's too. Confirmed on the bench, see below.
- **End of a fight.** Every end, Give Up included, goes through `/raid/clear`. Victory = `parts[0].hp` 0, All Points = every other part 0.
- **Timer and AP.** `bossUpTime` and `useAp` of `raidSetting` are server data. The client checks `Info.useAp` before starting and does not
  subtract: the server charges at `/raid/start`. At `timeLeft` the map hides the boss; the flee animation needs status 2 once, then 0.
- **Raid event.** `/stage/event` `events[].eventType` 2 creates the Raid button of the quest list.

## Data the client dereferences unchecked

- The fight's boss comes from `Info.stageId` -> `stage.raidBoss` -> `raidSetting.bossId`/`rareBossId`, not from `parts[0].raidEnemyId`:
  **every raid, catalogue included, needs a `stage` row with `raidBoss`**. Its `worldId` picks `world.raidBackground` (`lwf/raid/bg/%s/%s.lwf`).
- Missing `raidEnemy` rows (sub-parts too) and `raidReward` rows crash. `subdueId`, `mvpId`, `partAllId` are 1-based; a bad value throws, and
  action 120 runs opening the quest screen, so a bad pending reward could block that screen.
- `raidEnemy.weakness` is the part's slot: send `parts[]` sorted so that index = `weakness - 1`, `partsId` = `weakness`.
- The model is `raidDisplayId % 10000`. Part positions come from movies named in the model's LWF, so there is no hitbox table to serve.

## Resources

Missing in the WW data, LWF and layout present in JP 4.3.1 (textures: see Texture coverage): `AdvRaidListScene_ver320`, `Adv_Raid_Boss_List_ver320`, `Adv_Raid_Boss_Block_ver320`,
`Adv_Raid_Boss_Dialog_Entrant_ver104`, `Adv_Raid_Boss_Dialog_Result_ver104`, `Adv_Raid_Boss_List_Reward`, `AdventureTop2_RaidInfo2_Start`;
`lwf/character/raid` (68 ids), `lwf/raid/demo`, `lwf/raid/bg`, `lwf/raid/bossbtn`, `lwf/battleresult/Raid_Result`, 53 `raid_boss_*` images.

### Texture coverage (measured 1 November 2026)

A model is usable only if every texture its LWF names exists. The JP extraction keeps one copy of identical files, as for enemies ([battaglia.md](battaglia.md#nemici-jp)), so "present in JP" means the LWF, not the images. Counted with the 2016 LWF and its own textures, or the JP LWF plus the same-model duplicate rule:

- Complete, fight and demos: 27 models, `0001`-`0016`, `1000`-`1010`. These are the only ones the bench approach works for today.
- Fight animations incomplete: 37 models, `0017`-`0028`, `0030`-`0032`, `1011`, `1012`, `1016`, `2000`-`2018`.
- Only demos incomplete: `5000`, `9101`-`9103`.
- 13 of 204 demo folders have no image at all: `escape_0018`, `0022`, `2003`, `2005`, `2011`, `2017`, `9101`; `put_down_0018`, `2009`; `start_0027`, `0028`, `0031`, `2009`.
- `lwf/raid/bg`: `bg_CS1`, `bg_HD1`, `bg_KG1`, `bg_NL1`, `bg_SR1` have an LWF and no image. No `world` row uses them today.

By boss (22 of the links are inferred): 27 of 49 complete, 18 with fight gaps, 4 with demo gaps only.

Recovery measured 1 November on the real gaps of the 31 models the 2016 package has, filled without it and compared with it. Nothing was tried on the client:

| Level | Rule | Right |
|---|---|---|
| L2 | copies in the same model, by name or from other demos | 7468/7516, 99.36% |
| L3 | texture table aligned with a twin | 1608/1620, 99.26% |
| L4 | texture table aligned across raids | 1714/1730, 99.08% |

- These percentages are per level and leave out the recoloured model `9101`, which scores 90% at L3 and 9% at L4. Some single rules inside L2-L4 are below 99%, so the >= 99% bar of the enemy pipeline is not met rule by rule yet.
- Coverage is the limit: 0 of the 31 test models became complete at these levels. The 18 bosses with fight gaps still miss 4,559 texture slots, from 8 (`0017`) to 481 (`1016`).
- For the test models, every image left unresolved exists elsewhere in local data, mostly `character/raid` and `character/enemy` (by image signature, no pixel check). For the JP-era models this cannot be measured, as there is no reference.
- Rebuilding `wait` and `knockback` from `atk1` and `atk2`: only 85% of the images appear there, so it cannot give a whole animation.
- `put_down` plays on every win and is loaded with no visible null check: treat it as mandatory (crash inferred, not observed). `start` and `escape` can be avoided by never sending `raidStatus` 4 or 2.
- With `start` skipped, `9102` and `9103` make 29 bosses. All 49 is not proven. Estimated raid pack for all 49: 260-370 MB before compression, without the missing textures.

<a id="models"></a>
## Models the pack carries (Part 2, Task 1, 2 November 2026)

- `recon/tools/raid_models.txt` lists the 29 model ids; `originals.tsv` sections 48-49 import them. For each: the five fight folders (`atk1`, `atk2`, `knockback1`, `knockback2`, `wait`) and the demos `start`, `escape`, `put_down`, JP files first and the 2016 English package over them. `9102` and `9103` have no `start` (not in the 2016 package, no JP images): the server never sends `raidStatus` 4 for them. `5000` and `9101` stay out.
- `check_raid_models.py <files_dir> <out.json>` marks a model usable only if every texture its LWF names exists. Output `{"<id>": {fight, start, escape, put_down}}` in `server/game_data/raid_models.json` (not versioned). A boss is available when `fight` and `put_down`. Run with `--served` (the WW name lists `import_originals.py` skips: the LWFs and textures of `0001` are in the base resources, not in the pack) on the real `raid_geniles`: **29 of 29 available**; `start` is true for 27 (not `9102`, `9103`), `escape` for 29.
- **Inferred files.** 97 demo textures of `escape_9102`, `put_down_9102`, `escape_9103`, `put_down_9103` are absent from the JP extraction, which keeps one copy of identical files. They are copies of the same-model or twin-model file the texture table points to (rules `int-DD` 93 and `x-D` 4, measured 99.36% right on the 31 models the 2016 package has, see Texture coverage) and are listed one by one in `originals.tsv` section 49b. They are not original files; the 27 other models are whole from the 2016 package.
- **Text in images.** The raid screens' images were compared with the 2016 package: only `Result_Clear_Raid` differed (JP text, replaced by the 2016 English one in section 48d). Images with no 2016 copy hold no text (`RaidAlert_ReliefPanel01-04`, `Win16_pm`); `RaidAlert_txt01` (JP «Raid Boss») is served by the WW resources, English. The `9102`/`9103` demo textures read SUCCESS / FAILURE. Nothing went into `jp_coco_texts.tsv`.
- **Banners.** `img/adventure/boss_L/RaidBoss_<id>.png` exist for ids 1-14, 1000-1010, 9101-9103 (JP and 2016): **none for 15 and 16** (Queen Bee, Queen Bee Omega) in either source; those two keep the layout's default picture unless drawn.
- **Backgrounds** (`world.raidBackground` and `partsId`): complete for `bg_AG1`, `bg_BC1`, `bg_DB1`, `bg_DW1`, `bg_OC1`, `bg_WL1`, `RB_..._eff_back`, `_front`. **Incomplete**: `bg_CD1` (1 texture of 2 missing), `bg_ED1` (17 of 18), `RB_0003_00_00_eff_back3` (15 of 20); `RB_0003_00_00_eff_back2` has no folder in the data. A raid in worlds CD or ED, or world rows 10000/10001, would draw a broken background: use a complete one in `world` until recovered.
- **Pack.** `raid_gen` (static, `--cache`): see [risorse_layout.md](risorse_layout.md#pacchetti). Imported tree before packing: `character/raid` 112 MB, `raid/demo` 101 MB, `raid/bg` 27 MB (PNG, before BTF). The size against version 91 is measured with the build.

## ATK and DEF (Part 2, Task 5: deduced, not original)

No ATK or DEF of a raid is known after 2016. `server/raid_stats.json` holds our own deduction, rebuilt with `node server/make-raid.js --stats`; every entry of `raids.json` lists `atk` and `def` in `reconstructed`, and the Notices must declare them.

- **Ratio:** 75, the median of body ATK / reference story enemy ATK (plain Shadow row, same level), over the 96 knots of the 23 weekly bosses that have a 2016 row.
- **Story ATK of a period:** median ATK of the enemies on the maps of the story quests released on that date (Shop catalogue dates), at each quest's wiki level. Then the median of the last 5 tranches, because one tranche holds 10 enemies at about 4 times the others, kept at its running maximum so a later period is never weaker. A new period starts only 5% above the last. So a jump in story level reaches the table about 2 tranches late.
- **Tier (builder's call, no source):** the tier's wiki quest level (25, 75, 125, 175, 225) on the reference curve against Advanced: Beginner 0.348, Intermediate 0.696, Advanced 1, Legendary 1.308, Epic 1.617. The sources say only that higher tiers are stronger.
- **ATK = story ATK x 75 x tier share**, rounded to 100. Static in level from 2019-08-12.
- **DEF:** 1000, 1100 when `rare` is 2 (community calculators; the 2016 rows vary 800 to 2300). **Epic 50,000**: players report no damage below a stack of about 50,000 STR, read here as DEF. The damage formula was not read, so this reading is an assumption to check on the bench. Parts: the table's DEF times part / body DEF of the 2016 row at its first knot.
- **Before 2019-08-12** (one tier): the table gives the value at the cap; below LV 30 `singleEra.atkShare` in `raid_config.json` applies, which has no reading at all.

| Period from | Story ATK | Beginner | Intermediate | Advanced | Legendary | Epic |
|---|---|---|---|---|---|---|
| 2019-06-13 | 14,033 | 366,700 | 732,900 | 1,052,500 | 1,377,000 | 1,701,600 |
| 2019-12-19 | 15,457 | 403,900 | 807,300 | 1,159,300 | 1,516,800 | 1,874,200 |
| 2020-01-30 | 20,472 | 535,000 | 1,069,200 | 1,535,400 | 2,008,900 | 2,482,300 |
| 2021-03-25 | 40,244 | 1,051,700 | 2,101,900 | 3,018,300 | 3,949,000 | 4,879,800 |

**Not supported by the inputs:** the tier shares and the Epic DEF rest on no measured value; all the periods rest on the 2016 ratio, 3 to 5 years older than the raids. Not yet fought on the bench. Without a measured value these numbers can change freely if a tier proves out of reach; HP cannot.

Other values of `make-raid.js` that are not original: Lux, Munny and EXP of the boss rows are the 2016 values, far below the Lux reported later (about 2 billion on a 2019 boss); part HP comes from the 2016 ratio, or from JP screenshots of 5 bosses where derived; below the cap of the one-tier era HP follows `singleEra.hpShare`, fitted to three readings.

## Server routes (Part 2, Task 6: tests only, bench pending)

`server/routes-raid.js`, a factory wired in `server.js`; state only in `player.raid`. Choices the plan left open, ours unless a source is named:

- **Spawn.** Only clears of a raid event's quest count (stage ids 980000-989999; Task 11 adds the story). Points add up while a boss is stored, and it blocks a new one; at the threshold the counter restarts from 0, whatever was above it. Bonus hours and weekends are read in Pacific time, daylight saving included.
- **Boss level** starts at 1 and stops at 99. `entry.level` of `raids.json` is the quest's level (225 on Epic), not the boss's.
- **Quest AP** is charged at `/stage/start` and listed in `stages[].useAp` for the moment; the master row holds the weekday value. Before 2019-07-15, by the week's `ap`: `0 / 5` is bonus / the rest, `5 / 90` weekend / weekday, so bonus time costs the weekday value there.
- **`/raid/start` refused** (not enough AP, or a boss that is gone): the answer has `ret` and `userPoint` only, so we expect the client to stop on an error rather than play a fight that does not count; this has not been observed. The client checks AP itself first, so only a stale screen should get here.
- **`/raid/clear` with no fight running** (repeat, or the boss is gone): nothing changes, `getLux` 0, `raidTimeStatus` 5. Parts with an unusable `hp` are ignored: they keep their stored HP.
- **Titles** in a reward go out at `/raid/clear`, so the popup opens before RAID RESULTS; everything else is delivered at the first `/raid/reward` after the win, and the entry leaves the save with it.
- **A fight lost past `timeLeft`** answers `raidTimeStatus` 2 (the boss has escaped) and `/raid/list` still plays the flee; a win past it stays 3. An entry that throws at `/raid/reward` is logged and lost, so the quest screen keeps working and nothing is paid twice.
- **`/raid/member`**: `damage` is the sum of `parts[].damage` the client reported on that boss, kept in `player.raid.lastFight` after the boss is gone.
- **A stored boss whose `stage` or `raidEnemy` rows are not served** is dropped with a log line at `/raid/list`, since the client would crash on it.
- **Banner.** `/web/raid/img/<evStageId>.png` from `game_data/raid_img`, else `0.png` (the plain plate of `make_special_banners.py`), else 404.

## Open, for the bench

`getPoint.raidPoint` with Eggcognito rows, a fight outlasting `timeLeft`, 0 in `subdueId` or `mvpId`, `isEntry`/`isRelief`/`reliefFlag`, the home button's widgets, what the Raid button opens, fever.

Spike checks not observed, not to be assumed: the Eggcognito spawn (the boss was forced with `raidStatus`), AP actually charged at `/raid/start`, a new spawn after a flee, All Points absent when a part survives, Advanced tier with the same save's coins, the banner and the English victory image on screen.

## Bench 1 November 2026 (spike, save `raidspike`, resources 91)

- Spawn: `raidStatus` 4 once plays `start_0007`, then the list shows the boss (RAID BOSS ALERT, name, level, AP, Host, time left, HP). Works.
- **Damage kept between attempts: confirmed.** After Give Up the boss comes back from the `hp` sent by `/raid/start` (149,720,581 of 150,000,000).
- Model `0007`'s demo and fight images are missing from the JP data: the 2016 bundle has them, and the 2016 ones win in `originals.tsv`. That does not hold for every model, see Texture coverage.
- List banner: `img/adventure/boss_L/RaidBoss_<id>.png`; without it the layout's default picture stays (a Darkside on every boss).
- `/stage/clear` reports `getPoint.raidPoint` (192 on a normal quest) and `enemyDeadNumber`.
More bench results, 1 November (user):

- Broken parts stay broken on re-entering (the server sends `hp` 0). One anomaly: on the second boss spawned (Epic test) the user saw parts already broken while the server had sent each at 10,000,000 HP and the client later reported 10,000,000 damage on them. The likely cause is that they broke at the first hit, not proven: look at the screen before the first hit in Part 2. The boss stays stunned and attacks after the stun turns. Defeat and victory screens work; `BattleResultReidScene` and `BattleResultDefeatedScene` were missing and crash the client.
- The rewards popup calls `/raid/member`: `cooperators` must hold the player, an empty list crashes (`std::out_of_range`).
- RAID RESULTS draws the boss, level, MVP/Host, damage and the three reward columns from `/raid/reward`.
- `raidTimeStatus` seen on the bench: **3 = victory** (image `Result_Clear_Raid`: «Raid Boss Defeated!»), 2 «The Raid Boss has escaped», 0 leaves the layout's default texts, which read as a party member's win. Read from the client and the 2016 texts, not run: 1 retreat / support request sent, 4 «A party member defeated the Raid Boss!», 5 «No available Raid Boss»; 4 and 5 also show «Damage will not count toward MVP total».
Final results of the spike, 1 November (user):

- Title popup on a raid clear: `userTitles` in `/raid/clear` opens it before RAID RESULTS (`Clever`).
- Flee: `raidStatus` 2 once plays `escape_0007` and the boss leaves the list; the game stays usable.
- **Epic is within reach.** With 999,999,999,999 HP the `maxpower` deck removed 855,200,873,992 in a single attempt (best hit 30.6 billion), so the original timer can stand.
- **The HP bar's maximum comes from the `raidEnemy` row**, not from `/raid/start`: a boss above its row looks as if it never loses HP. Part 2 needs rows with the real HP of each tier and period.
- The first attempt's `useAp` 0 and a later one 10 work. The 3-minute return of weak points is not in the client: the server does it.
- Images: the JP data carries Japanese text in some raid images (`Result_Clear_Raid`); the 2016 bundle has them in English. Check them all in Part 2. Not yet seen: `getPoint.raidPoint` with Eggcognito rows, `isEntry`, `isRelief`, the home button's widgets, what the quest list's Raid button opens, fever.