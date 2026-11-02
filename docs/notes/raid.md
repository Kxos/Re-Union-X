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
- <a id="weak-points"></a>**Weak points.** At fight load the client searches `parts1`-`parts6` under the `char` movie of the boss LWF and,
  for each one found, takes the part in slot N (filled from the parts by `weakness`) and looks up its `raidEnemy` row to size
  the tap marker. An empty slot gives id 0, the lookup returns nothing and the client dereferences it: SIGSEGV, fault address
  0x10 (bench, 2 November: Queen Bee, Queen Bee Ω, Lion Headliner). So every weak point of the model needs a part of that
  weakness. A weak point is a `parts<N>` movie that holds a `center` or `attack` marker; `parts<N>` movies with only a picture
  (Jack in the Box, Darkside Ω `parts4`/`parts5`) are not found as weak points (26 of 26 smoked models agree with this rule).
  `check_raid_models.py` writes them as `slots`, and `make-raid.js` marks an entry `parts` (unavailable, `missingSlots`) when a
  slot has no part. An extra part with no weak point is harmless (Jack in the Box: 2 weak points, 3 parts).

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
- **Scourge Spider `9101`** (Task 8 fix): fight from the 2016 package (complete), demos from JP, and 188 demo textures the JP extraction keeps only once, as copies (`originals.tsv` section 49c): 180 by the texture table rule (99.36% right, as `49b`) and 8 pieces of shared demo art (ENCOUNTER banner, burst, background; one image of that size in 8 or more other demos, 102 of 102 right when held out). `check_raid_models.py` passes on the assembled tree. Inferred, not original files. The raid models live in the static pack `raid_gen`, which only a full version rebuilds, so `9101` is served from the next full version; until then `raid_models.json` leaves it out and its weeks stay `graphics`.
- **Text in images.** The raid screens' images were compared with the 2016 package: only `Result_Clear_Raid` differed (JP text, replaced by the 2016 English one in section 48d). Images with no 2016 copy hold no text (`RaidAlert_ReliefPanel01-04`, `Win16_pm`); `RaidAlert_txt01` (JP «Raid Boss») is served by the WW resources, English. The `9102`/`9103` demo textures read SUCCESS / FAILURE. Nothing went into `jp_coco_texts.tsv`.
- **Banners.** `img/adventure/boss_L/RaidBoss_<id>.png` exist for ids 1-14, 1000-1010, 9101-9103 (JP and 2016): **none for 15 and 16** (Queen Bee, Queen Bee Omega) in either source; those two keep the layout's default picture unless drawn.
- **Backgrounds** (`world.raidBackground` and `partsId`): complete for `bg_AG1`, `bg_BC1`, `bg_DB1`, `bg_DW1`, `bg_OC1`, `bg_WL1`, `RB_..._eff_back`, `_front`. **Incomplete**: `bg_CD1` (1 texture of 2 missing), `bg_ED1` (17 of 18), `RB_0003_00_00_eff_back3` (15 of 20); `RB_0003_00_00_eff_back2` has no folder in the data. A raid in worlds CD or ED, or world rows 10000/10001, would draw a broken background: use a complete one in `world` until recovered.
- **Pack.** `raid_gen` (static, `--cache`): see [risorse_layout.md](risorse_layout.md#pacchetti). Imported tree before packing: `character/raid` 112 MB, `raid/demo` 101 MB, `raid/bg` 27 MB (PNG, before BTF). The size against version 91 is measured with the build.

## Every boss served (Part 2, 2 November 2026: resources 95, master revision 235)

User decision (2 Nov): every raid boss is served. `raid_models.txt` lists 45 models; `originals.tsv` section 49 grows by three blocks, all appended after 49c so their single destinations win. Categories as in the enemy pipeline ([battaglia.md](battaglia.md), I-194): **1** original file at its own path; **2** original copy (the same image in another LWF of the same boss, its twin or the same Flash source, placed by a measured rule, 98.7-99.5% right); **3** reconstructed, a real file chosen by a rule below the 99% bar (common art, anchored alignment, unique size); **3c** reconstructed candidate, the best existing image of the declared size for a hole (never an invented shape).

- **49d, 15 reconstructed bosses** (render7, each approved by the user on rendered animations; `0020` with the icy orb, category 3 from the reference art): 120 folder lines (JP own files) and 9,022 single-file lines. Slots per category:

| Boss | Slots | 1 | 2 | 3 | 3c |
|---|---|---|---|---|---|
| 0018 Assault Dragon | 959 | 149 | 658 | 106 | 46 |
| 0019 Adventurer | 828 | 91 | 605 | 61 | 71 |
| 0020 Jewel Princess | 746 | 79 | 631 | 18 | 18 |
| 0021 Gear Golem | 582 | 232 | 178 | 118 | 54 |
| 0022 Heartless Tsum | 727 | 182 | 426 | 55 | 64 |
| 0023 Loudmouth Parade | 741 | 196 | 427 | 116 | 2 |
| 0024 Greedy Grouch | 611 | 133 | 355 | 22 | 101 |
| 0025 Mysterious Sir | 944 | 280 | 571 | 38 | 55 |
| 0026 Merry-Go-Rowdy | 1447 | 312 | 1002 | 105 | 28 |
| 0027 Holiday Sleigh | 664 | 150 | 381 | 94 | 39 |
| 0028 Demon Tide | 637 | 248 | 270 | 54 | 65 |
| 0030 Cranky Cake | 801 | 192 | 564 | 43 | 2 |
| 0031 Mischief Bouquet | 549 | 165 | 315 | 55 | 14 |
| 0032 Red-Nosed Chariot | 774 | 211 | 445 | 66 | 52 |
| 1011 Closehanded Captain | 819 | 199 | 451 | 116 | 53 |

- **49e, spiders 9101-9103** (1,107 lines, category 2): the JP LWF revisions that carry the Spinneret target `parts2` (9101 wait .00293431, atk1 plain, atk2 .00293425, knockback1 .00293427, knockback2 .00293429; 9102 and 9103 plain), as exact `=path` sources, and their textures (same folder by name and size, the served 2016 version or the twin rig 5000 by table alignment; for 9101 the image 9102/9103 share at that slot, its own image of that size, or the shared keyblade-hit run). The previously served revisions (the 2016 package) had only `parts1`, so no part could be targeted.
- **49f, Queen Bee 0015, Queen Bee Ω 0016, Lion Headliner 1005** (947 lines, category 2): the JP revisions whose part markers match the 2016 rows (bees: plain name, `parts1`-`parts2`, the abdomen; Lion: wait .00001097, atk1 .00001313, atk2 .00001198, knockback1 .00001275, knockback2 .00001164, `parts1`-`parts3`, the arms), as `=path` sources, plus 932 texture copies (the same model's 2016 files by table alignment, its own unique image of that size, the common keyblade-hit run). The 2016 package carries the 5-marker version that crashed ([Weak points](#weak-points)); with these the part rows stay as they are (11.25%; 60% and 33.3%) and the weak-point check passes on its own.
- **Spider parts (deviation, declared in the Raid Bosses notice).** In the weekly raids (Sep 2018 on) only the Spinneret had a bar (khuxwiki tabs, 2019-2020 footage). But every JP spider revision with `parts2` also marks the spiderlings `parts3`-`parts5` as weak points, and none has `parts1`-`parts2` only, so one part would crash at fight load. Coordinator ruling: `raid_config.json` `modelParts` 4 for the three spiders, the 2016 to July 2018 layout of 5000 (Spinneret 900/24,000 of body HP, spiderlings 25% each). `modelParts` caps a template's parts (first N); it stays in the config for a later era-faithful choice.
- **Checks.** `check_raid_models.py --served` on `raid_gen`: 45 checked, 45 available (`fight`, `put_down`, `escape` true for all; `start` false only for 9102/9103, as before: no `raidStatus` 4 for them). Slots: 0015/0016 [1,2], 1005 [1,2,3], 9101-9103 [1..5], each covered by the part rows.
- **Coverage** (master revision 235): 250 of 344 tier rows available, 96 census rows (was 230 / 87 at revision 234). The other 94 tier rows are `template`: the 15 reconstructed bosses have no 2016 `raidEnemy` row and no `modelTemplates` choice yet, so their weeks wait for one. Along the story 43 of the 150 Shop weeks from 2018-08-30 have no raid (was 46).
- **Templates of the 15 (master revision 236; render7/TEMPLATES15.md, coordinator ruling).** `modelTemplates`: a 2016 row whose part weaknesses equal the model's weak points, ties broken by equal frame counts, rare 1 preferred (Assault Dragon, Adventurer, Heartless Tsum, Greedy Grouch -> 9 Trident Tail; Jewel Princess -> 11 Savage Spider; Gear Golem -> 1001 Red Trident Tail; Mysterious Sir -> 1 Darkside; Merry-Go-Rowdy -> 15 Queen Bee; Loudmouth Parade, Holiday Sleigh, Demon Tide, Cranky Cake, Mischief Bouquet, Red-Nosed Chariot -> 3 Behemoth; Closehanded Captain -> 13 Fortress Crab). No rig is shared with a 2016 boss, so moves, part HP shares and rarity are inferred (medium to medium-low confidence). `bossAttributes` sets the body attribute from the khuxwiki infobox where the template differs; `make-raid.js` gives the parts the same attribute, so the wiki's per-part attributes are not followed. **Deviation:** Assault Dragon, Adventurer, Jewel Princess, Gear Golem and Closehanded Captain had fewer parts in later weekly weeks (khuxwiki tabs), but no LWF revision has fewer weak points, so they keep the full «Default» set (declared in the notice).
- **Coverage at revision 236:** 344 of 344 tier rows, 132 census rows; along the story 0 of the 150 Shop weeks from 2018-08-30 lack a raid. 94 new raid stages: `gen_story_maps.py` (344 stages, 188 new files, the others byte-identical), `validate_maps.py` 0 errors, copied into `stage_gen\files\stage`; they need a new full resource version (96), since 95 lacks them.
- **Maps.** The 7 Scourge Spider tier rows are new raid stages (980032, 980052, 980270-980274): `gen_story_maps.py` on `stage_gen\raid_cfg.json` (250 stages; the 486 files of the others byte-identical), `validate_maps.py` 0 errors, copied into `stage_gen\files\stage`. Resources 94 was built before them and lacks those maps: 95 replaces it.

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

- **Which raids are listed:** those of the player's Shop week, see Calendar below.
- **Spawn.** Only clears of a raid event's quest count (stage ids 980000-989999; Task 11 adds the story). Points add up while a boss is stored, and it blocks a new one; at the threshold the counter restarts from 0, whatever was above it. Bonus hours and weekends are read in Pacific time, daylight saving included.
- **Boss level** starts at 1 and stops at 99. `entry.level` of `raids.json` is the quest's level (225 on Epic), not the boss's.
- **Quest AP** is charged at `/stage/start` and listed in `stages[].useAp` for the moment; the master row holds the weekday value. Before 2019-07-15, by the week's `ap`: `0 / 5` is bonus / the rest, `5 / 90` weekend / weekday, so bonus time costs the weekday value there.
- **`/raid/start` refused** (not enough AP, or a boss that is gone): the answer has `ret` and `userPoint` only, so we expect the client to stop on an error rather than play a fight that does not count; this has not been observed. The client checks AP itself first, so only a stale screen should get here.
- **`/raid/start` after the timer on the same boss** (deck screen left open, bench 2 November): a refusal is «200 ERROR :122» and OK resends it forever, so the fight is played free and `/raid/clear` answers 2 (escaped) whatever the parts, with no damage kept and no reward.
- **`/raid/clear` with no fight running** (repeat, or the boss is gone): nothing changes, `getLux` 0, `raidTimeStatus` 5. Parts with an unusable `hp` are ignored: they keep their stored HP.
- **Titles** in a reward go out at `/raid/clear`, so the popup opens before RAID RESULTS; everything else is delivered at the first `/raid/reward` after the win, and the entry leaves the save with it.
- **A fight lost past `timeLeft`** answers `raidTimeStatus` 2 (the boss has escaped) and `/raid/list` still plays the flee; a win past it stays 3. An entry that throws at `/raid/reward` is logged and lost, so the quest screen keeps working and nothing is paid twice.
- **`/raid/member`**: `damage` is the sum of `parts[].damage` the client reported on that boss, kept in `player.raid.lastFight` after the boss is gone.
- **A stored boss whose `stage` or `raidEnemy` rows are not served** is dropped with a log line at `/raid/list` and `/user/notice` (so the home's «Active request!» never offers it), since the client would crash on it.
- **Banner.** `/web/raid/img/<evStageId>.png` from `game_data/raid_img`, else `0.png` (the plain plate of `make_special_banners.py`), else 404.

## Calendar (Part 2, Task 8: tests only, bench pending)

`server/raid-calendar.js` picks the raids of the player's week; `routes-raid.js` lists them in `/stage/event` (category 2) and hands out their Raid Boards. Rules, ours unless a source is named:

- **The week is the Shop week of the story** (`storyCtx()` of `server.js`: `shopFrom` / `shopTo`). The story quest picks the tranche, and inside a tranche of several weeks the week moves on every real Monday, as the Shop and Special tabs do. There is no rotation counter of its own.
- **Which census rows run:** every row whose dates hold `shopFrom` (several when they ran together, such as a Radiant Reward row beside a Weekly one). Otherwise the row with the largest overlap with the Shop week, tie to the later start, together with any row of the same dates. Shop weeks start on the tranche's day, often a Thursday, while rows mostly run Monday to Sunday: this is the rule `special.currentEntries` applies to the weekly VIP versions, and the test checks that the two agree on every day from 2018-08-20 to 2021-07-10.
- **Only available tiers are listed.** A week whose rows have no available tier (model incomplete, no template row) has no raid, as do the weeks before the first row (2018-09-03 today; the WW event raids from 2016-05-02 come with Task 10). The other tiers of the chosen rows are returned apart (`weekRaids(...).unavailable`) for the Raid Catalog.
- **Families:** `raids.json` holds the Weekly and Radiant Reward rows plus the 3 pre-series rows of September and October 2018, every WW row with week data. `make-raid.js` builds all of them; `onlyCensusIds` in `raid_config.json` is now only a filter for tests and benches. Weekend-only and Daily raids, which open only on the real weekend or day, come with Task 10; `nowMs` is reserved for them.
- **Bench smoke:** `server/save/raid_smoke.json` `{"key": "<entry key>"}` makes `/user/notice` and `/raid/list` force that entry's boss, whatever the week, replacing a stored boss of another key. It exists only on the bench (a script writes it before every model and removes it at the end). Only a file younger than 2 hours counts, so one left behind by a killed script is ignored (logged once) and cannot take over normal play; without the file nothing changes.
- **A quest of another week still counts** when it is played, because its screen may stay open across the Monday. The kept raid of the Raid Catalog (Task 9) keeps its boards beside the current ones.
- **Coverage, 2 November 2026** (`raid_models.json` with 29 models, templates below): 93 census rows with an available tier, 243 of 344 tier rows. The other 101 tier rows (16 bosses) are `graphics`. After the weak-point check (master revision 234): 87 census rows, 230 tier rows; 13 more are `parts` (Queen Bee, Queen Bee Ω, Lion Headliner). Along the story, 104 of the 150 Shop weeks from 2018-08-30 list a raid; the other 46 have a row with no available tier. The one-day Gear Golem event of 2020-11-01 has no week data and is not built.
- **Templates** (`modelTemplates`, inferred from the LWFs, medium-high confidence): Scourge, Wicked and Malicious Spider (9101-9103) use row `5000` Enraged Arachnid. The three share one rig, and `5000` is the 2016 recolour that already reused Savage Spider's moves. Egg Master (1008) uses `0007` Trickmaster: identical frame counts in all five fight animations, 2 parts. The spiders keep the attribute of their colour (`bossAttributes`: red Power, green Speed, blue Magic, as the census reads it), labelled `attribute`; Egg Master keeps Trickmaster's.
- **Size:** all rows add about 2.4 MB to the master (243 stage, 93 evStage, 243 raidSetting, 810 raidEnemy, 945 raidReward, 42 raidEnemyAttack, 245 Raid Boards).

## Bench 2 November 2026 (Part 2, save `raid2`, resources 93, rev 230)

- Weekday quest AP 90 charged at `/stage/start` (254 → 164, 165 → 75 read in the save).
- Spawn from the quest clear (`raidPoint` 9000 ≥ 8600): Encounter, then RAID BOSS ALERT with the next level (LV 2, then LV 3).
- **Raid AP: first attempt 0 (164 → 164), second 10 (76 → 66).** The card shows AP 0, then AP 10.
- HP and broken parts kept after Give Up (49,548,210,919 of 70 billion, parts 2 and 3 at 0).
- Victory twice in a row: SUCCESS «The Raid Boss is defeated!», RAID RESULTS 180/60/60 Raid Coins, OMEGA label; the level goes up after the win.
- Give Up (`raidTimeStatus` 1): YOU LOSE with Damage, Munny, Lux and the level bar; the text line under the title stays empty. Raid texts (`layouts/ui_texts`, ids 10320xxxx): 011 «The Raid Boss has escaped.», 010 «A party member defeated the Raid Boss!», 005 «No available Raid Boss.», 019 «A support request was sent to other players.», 016 empty. The original sent a support request on a lost raid, so 019 is the likely text of a loss; it is a multiplayer feature we do not have, and no status is proven to show it. The Defeated scene's layout JSON is not local, so the binding stays unread. Kept at 1: an empty line claims nothing false.
- **Start after the timer** (deck screen open over it): before the fix «200 ERROR :122» and OK resent `/raid/start` forever; with the fix (44db985) the fight plays free, the result reads «The Raid Boss has escaped.» on that same text line (under CONGRATULATIONS when the client won the fight), then FAILURE «The Raid Boss escaped!», back to the home; no reward, level unchanged, boss gone.
- The home calls `/user/notice` on entry; with `isSelfRaid` 1 it shows the red «Active request!» button and no WARNING frame (I-222).

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

## Bench smoke 2 Nov

Task 8 Step 5, master rev 233, resources 93, save `raid2` (maxpower party). Every available raid model was forced with `save/raid_smoke.json` (one entry per model, lowest tier) and taken to the fight: 26 models tried, **23 load** (`0001`-`0005`, `0007`-`0010`, `0012`, `0014`, `1000`-`1004`, `1006`-`1010`, `9102`, `9103`), **3 crash** the client on fight load: `0015` Queen Bee, `0016` Queen Bee Omega, `1005` Lion Headliner (reproduced). All three crashes are the same SIGSEGV null pointer (`fault addr 0x10`, frames `af9e24`/`eff5bc`/`146c57c`) after `/raid/start` and before the battle HUD; other bosses on the same maps load, so the cause is in the three models' data.

**Cause (found 2 November, [Weak points](#weak-points)):** the three models have more weak points than the 2016 rows have parts.
Queen Bee and Queen Bee Ω: `parts1`-`parts5` (the July 2016 four-bee version), row with 1 part (the April 2016 version);
Lion Headliner: `parts1`-`parts5`, row with 2 parts (R arm, L arm). The client looks up the `raidEnemy` row of the part in each
weak point's slot; the empty slots give id 0, no row, null pointer. The crash frames are that lookup (master getter of the
`raidEnemy` table, then a read at +0x10 of the missing row) inside the tap-marker constructor the fight calls per weak point.
The original part rows of those versions are not known, so the three models are withheld (`why: parts`, 13 tier rows: Queen Bee
4, Queen Bee Ω 2, Lion Headliner 7) until rows for the missing parts are found or the user chooses to reconstruct them. Master
revision 234; bench: the stored Lion Headliner boss of `raid2` is dropped at `/user/notice`, the home shows no «Active request!»
and the game stays up. Not yet seen on the bench: Darkside Ω's `atk1` holds weak points 4 and 5 that its `wait` does not; the
fight reads the weak points once at load, so this is expected to be harmless, but no Darkside Ω fight has run long enough to
show its first attack.

Bench facts from the run: the forced boss shows the «ENCOUNTER» screen, which stays until tapped (no SKIP); the home does not poll `/user/notice`, so a new boss needs a relaunch or `/raid/list`; after a clear or a Give Up the game goes back to the RAID BOSS ALERT list; OPTIONS (1820,48), Give Up (1172,505), Withdraw OK (1220,708). The script and the per-model table stay in the private bench folder (`tmp/raid_p2`, `SMOKE.md`).
