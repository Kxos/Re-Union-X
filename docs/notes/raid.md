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
- Only demos incomplete: `5000`, `9101`-`9103` (all four served since, with copies: `originals.tsv` 49b, 49c, 49j).
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

<a id="texture-audit"></a>
## Boss texture audit (2026-11-05)

Supersedes the per-boss counts of [Texture coverage](#texture-coverage-measured-1-november-2026) (1 November, before the reconstruction rounds) and the line «All 49 is not proven». Measured on the assembled raid pack tree `D:\Progetto_Restauro_KH_UXaid_geniles` (what `raid_gen` packs), not on the client. For each of the 49 census bosses (one model each, `recon/tools/raid_models.txt` = the 49 ids of the private census `raid_bosses.md`): the 8 LWFs (`lwf/character/raid/<id>/{atk1,atk2,knockback1,knockback2,wait}`, `lwf/raid/demo/{start,escape,put_down}_<id>`), every texture each LWF names, whether it is on disk, and which `originals.tsv` line wrote it (the last line naming a destination wins, as in `import_originals.py`).

- **Slots**: distinct texture names per LWF, summed over the LWFs present. **2016 WW**: the 2016 English package at its own path. **JP own**: the JP 4.3.1 file at its own path (exact `=path` revisions included). **Cat 2 / 3 / 3c**: the categories of [Every boss served](#every-boss-served-part-2-2-november-2026-resources-95-master-revision-235), read from the line's comment (cat 2 = copy of an identical image placed by a measured rule; 3 / 3c = reconstructed). No texture in the tree came from a line-less source, and none is missing.
- Model id links: 27 from the original tables, 22 inferred (census). The WW base resources carry only model `0001` (their own older 2016-named copy); every other boss lives only in the raid pack.
- Donor folders (`Reddit Donators`): no raid model files, only notices; not a source for any piece.

| Model | Boss | LWFs | Slots | 2016 WW | JP own | Cat 2 | Cat 3 / 3c | Missing | Status |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| 0001 | Darkside | 8/8 | 108 | 108 | 0 | 0 | 0 | - | complete, original |
| 0002 | Darkside Ω | 8/8 | 451 | 451 | 0 | 0 | 0 | - | complete, original |
| 0003 | Behemoth | 8/8 | 460 | 460 | 0 | 0 | 0 | - | complete, original |
| 0004 | Behemoth Ω | 8/8 | 425 | 425 | 0 | 0 | 0 | - | complete, original |
| 0005 | Guard Armor | 8/8 | 505 | 505 | 0 | 0 | 0 | - | complete, original |
| 0006 | Guard Armor Ω | 8/8 | 482 | 482 | 0 | 0 | 0 | - | complete, original |
| 0007 | Trickmaster | 8/8 | 567 | 567 | 0 | 0 | 0 | - | complete, original |
| 0008 | Trickmaster Ω | 8/8 | 639 | 639 | 0 | 0 | 0 | - | complete, original |
| 0009 | Trident Tail | 8/8 | 407 | 407 | 0 | 0 | 0 | - | complete, original |
| 0010 | Trident Tail Ω | 8/8 | 407 | 407 | 0 | 0 | 0 | - | complete, original |
| 0011 | Savage Spider | 8/8 | 788 | 788 | 0 | 0 | 0 | - | complete, original |
| 0012 | Venomous Spider | 8/8 | 764 | 764 | 0 | 0 | 0 | - | complete, original |
| 0013 | Fortress Crab | 8/8 | 510 | 510 | 0 | 0 | 0 | - | complete, original |
| 0014 | Fortress Crab Ω | 8/8 | 537 | 537 | 0 | 0 | 0 | - | complete, original |
| 0015 | Queen Bee | 8/8 | 651 | 356 | 0 | 295 | 0 | - | complete, original + copies |
| 0016 | Queen Bee Ω | 8/8 | 676 | 318 | 0 | 358 | 0 | - | complete, original + copies |
| 1000 | Hocus Pocus | 8/8 | 510 | 510 | 0 | 0 | 0 | - | complete, original |
| 1001 | Red Trident Tail | 8/8 | 407 | 407 | 0 | 0 | 0 | - | complete, original |
| 1002 | Green Trident Tail | 8/8 | 415 | 415 | 0 | 0 | 0 | - | complete, original |
| 1003 | Blue Trident Tail | 8/8 | 407 | 407 | 0 | 0 | 0 | - | complete, original |
| 1004 | Jack in the Box | 8/8 | 675 | 675 | 0 | 0 | 0 | - | complete, original |
| 1005 | Lion Headliner | 8/8 | 482 | 209 | 66 | 207 | 0 | - | complete, original + copies |
| 1006 | Sinister Sweets | 8/8 | 509 | 509 | 0 | 0 | 0 | - | complete, original |
| 1007 | Spiteful Sweets | 8/8 | 510 | 510 | 0 | 0 | 0 | - | complete, original |
| 1008 | Egg Master | 8/8 | 575 | 575 | 0 | 0 | 0 | - | complete, original |
| 1009 | Submarine Carp | 8/8 | 605 | 605 | 0 | 0 | 0 | - | complete, original |
| 1010 | Gummi Hound | 8/8 | 865 | 865 | 0 | 0 | 0 | - | complete, original |
| 9102 | Wicked Spider | 7/8 | 619 | 0 | 265 | 354 | 0 | start_9102 (not packed) | fight complete, start demo missing |
| 9103 | Malicious Spider | 7/8 | 618 | 0 | 308 | 310 | 0 | start_9103 (not packed) | fight complete, start demo missing |
| 9101 | Scourge Spider | 8/8 | 771 | 0 | 50 | 721 | 0 | - | complete, original + copies |
| 0018 | Assault Dragon | 8/8 | 959 | 0 | 149 | 658 | 106 / 46 | - | complete, reconstructed pieces |
| 0019 | Adventurer | 8/8 | 828 | 0 | 91 | 605 | 61 / 71 | - | complete, reconstructed pieces |
| 0020 | Jewel Princess | 8/8 | 746 | 0 | 79 | 631 | 18 / 18 | - | complete, reconstructed pieces |
| 0021 | Gear Golem | 8/8 | 582 | 0 | 225 | 185 | 118 / 54 | - | complete, reconstructed pieces |
| 0022 | Heartless Tsum | 8/8 | 727 | 0 | 178 | 430 | 55 / 64 | - | complete, reconstructed pieces |
| 0023 | Loudmouth Parade | 8/8 | 741 | 0 | 189 | 434 | 116 / 2 | - | complete, reconstructed pieces |
| 0024 | Greedy Grouch | 8/8 | 611 | 0 | 129 | 361 | 22 / 99 | - | complete, reconstructed pieces |
| 0025 | Mysterious Sir | 8/8 | 944 | 0 | 270 | 581 | 38 / 55 | - | complete, reconstructed pieces |
| 0026 | Merry-Go-Rowdy | 8/8 | 1447 | 0 | 304 | 1010 | 105 / 28 | - | complete, reconstructed pieces |
| 0027 | Holiday Sleigh | 8/8 | 664 | 0 | 150 | 381 | 94 / 39 | - | complete, reconstructed pieces |
| 0028 | Demon Tide | 8/8 | 637 | 0 | 248 | 272 | 54 / 63 | - | complete, reconstructed pieces |
| 0030 | Cranky Cake | 8/8 | 801 | 0 | 184 | 572 | 43 / 2 | - | complete, reconstructed pieces |
| 0031 | Mischief Bouquet | 8/8 | 549 | 0 | 161 | 321 | 55 / 12 | - | complete, reconstructed pieces |
| 0032 | Red-Nosed Chariot | 8/8 | 774 | 0 | 203 | 453 | 66 / 52 | - | complete, reconstructed pieces |
| 1011 | Closehanded Captain | 8/8 | 819 | 0 | 193 | 457 | 116 / 53 | - | complete, reconstructed pieces |
| 0017 | Jewel Sorceress | 8/8 | 658 | 0 | 156 | 493 | 5 / 4 | - | complete, reconstructed pieces |
| 1012 | Circus Crab | 8/8 | 1094 | 0 | 252 | 794 | 29 / 19 | - | complete, reconstructed pieces |
| 1016 | Crabby Cake | 8/8 | 924 | 0 | 104 | 655 | 124 / 41 | - | complete, reconstructed pieces |
| 5000 | Enraged Arachnid | 8/8 | 789 | 484 | 41 | 264 | 0 | - | complete, original + copies |

Totals: 31,639 slots; 13,895 from the 2016 package, 3,995 JP own files, 11,802 category 2 copies, 1,947 reconstructed (1,225 cat 3, 722 cat 3c).

- **Complete with original files only: 24** (`0001`-`0014`, `1000`-`1004`, `1006`-`1010`).
- **Complete, originals plus category 2 copies: 5** (`0015`, `0016`, `1005`: JP part-marker revisions of 49f; `9101` 49c/49e; `5000` 49j).
- **Complete with reconstructed pieces: 18** (`0017`-`0028`, `0030`-`0032`, `1011`, `1012`, `1016`), every one approved by the user on rendered animations (render7, render9). The 7 textures of `0025` atk1 and `0028` atk2 drawn from the JP 5.0.1 enemy hit effects are cat 3 lines too.
- **Fight complete, `start` demo not packed: 2** (`9102` Wicked Spider, `9103` Malicious Spider). `check_raid_models.py`: 49 of 49 available (fight, `put_down`, `escape`), `start` false only for these two; the server never sends `raidStatus` 4 for them.

**The two `start` demos are recoverable without reconstruction.** Correction to [Models the pack carries](#models): the JP 4.3.1 data has `start_9102` and `start_9103` (LWF and 69 of 78 / 68 of 78 textures); the 2016 package has neither. The missing slots are `ビットマップ 44`-`52` (9102) and `43`-`52` (9103). Each one has a twin slot in the same LWF with the same declared size (`ビットマップ 53`-`64`, e.g. 52 and 64 are both 440x42), present in JP; the JP extraction keeps one copy of identical files. The independent recovery rules of 1 November (`tmpaid_tex\proposal.tsv`: int-DD, x-D and, for the 440x42, 464x487 and 331x345 portal images, common art) chose, for all 19 slots, an image pixel-identical to that own twin (checked by decoding to RGBA, 19 of 19). The served `start_9101` already pairs the same 10 slots with identical images (10 of 10).

Recommended fixes (not done here):

1. `start_9102`, `start_9103`: JP folder lines plus 19 single-file lines copying each missing slot from its own twin slot (category 2, own LWF), then the English subtitle as 49g (`raid_demo_english.py --models 9102,9103`), `check_raid_models.py` (expected `start` true for 49 of 49) and a full version (`raid_gen` is static). Then the two spiders may use `raidStatus` 4 like the others.
2. Nothing else is missing in the model textures. Pieces still below the original bar are the 1,947 reconstructed slots of the 18 bosses above (declared in the Raid Bosses notice); only an original source would replace them: the JP data and the 2016 package have nothing more, the 19 single-part JP models `2000`-`2018` are already the twin source of 0018-0021 and 1011, and the donor folders hold no raid files.
3. Outside the models (unchanged since [Models the pack carries](#models)): list banners `RaidBoss_<id>` exist for all 49 (28 original, 21 reconstructed from JP cards); backgrounds `bg_CD1`, `bg_ED1`, `RB_0003_00_00_eff_back3` stay incomplete and must not be used in `world`.

<a id="models"></a>
## Models the pack carries (Part 2, Task 1, 2 November 2026)

- `recon/tools/raid_models.txt` lists the 29 model ids; `originals.tsv` sections 48-49 import them. For each: the five fight folders (`atk1`, `atk2`, `knockback1`, `knockback2`, `wait`) and the demos `start`, `escape`, `put_down`, JP files first and the 2016 English package over them. `9102` and `9103` have no `start` (not in the 2016 package, no JP images): the server never sends `raidStatus` 4 for them. `5000` and `9101` stayed out (served later: `9101` from 49c, `5000` from 49j).
- `check_raid_models.py <files_dir> <out.json>` marks a model usable only if every texture its LWF names exists. Output `{"<id>": {fight, start, escape, put_down}}` in `server/game_data/raid_models.json` (not versioned). A boss is available when `fight` and `put_down`. Run with `--served` (the WW name lists `import_originals.py` skips: the LWFs and textures of `0001` are in the base resources, not in the pack) on the real `raid_geniles`: **29 of 29 available**; `start` is true for 27 (not `9102`, `9103`), `escape` for 29.
- **Inferred files.** 97 demo textures of `escape_9102`, `put_down_9102`, `escape_9103`, `put_down_9103` are absent from the JP extraction, which keeps one copy of identical files. They are copies of the same-model or twin-model file the texture table points to (rules `int-DD` 93 and `x-D` 4, measured 99.36% right on the 31 models the 2016 package has, see Texture coverage) and are listed one by one in `originals.tsv` section 49b. They are not original files; the 27 other models are whole from the 2016 package.
- **Scourge Spider `9101`** (Task 8 fix): fight from the 2016 package (complete), demos from JP, and 188 demo textures the JP extraction keeps only once, as copies (`originals.tsv` section 49c): 180 by the texture table rule (99.36% right, as `49b`) and 8 pieces of shared demo art (ENCOUNTER banner, burst, background; one image of that size in 8 or more other demos, 102 of 102 right when held out). `check_raid_models.py` passes on the assembled tree. Inferred, not original files. The raid models live in the static pack `raid_gen`, which only a full version rebuilds, so `9101` is served from the next full version; until then `raid_models.json` leaves it out and its weeks stay `graphics`.
- **Text in images.** The raid screens' images were compared with the 2016 package: only `Result_Clear_Raid` differed (JP text, replaced by the 2016 English one in section 48d). Images with no 2016 copy hold no text (`RaidAlert_ReliefPanel01-04`, `Win16_pm`); `RaidAlert_txt01` (JP «Raid Boss») is served by the WW resources, English. The `9102`/`9103` demo textures read SUCCESS / FAILURE. Nothing went into `jp_coco_texts.tsv`.
- **Banners.** `img/adventure/boss_L/RaidBoss_<id>.png` exist for ids 1-14, 1000-1010, 9101-9103 (JP and 2016): **none for 15 and 16** (Queen Bee, Queen Bee Omega) in either source; those two keep the layout's default picture unless drawn.
- **render8 (user-approved 3 Nov, `tmp
aid_tex
ender8\CHANGES.md`).** List banners: the 17 bosses with no original `RaidBoss_<id>` (15, 16, 18-28, 30-32, 1011) get one **reconstructed** from the JP card `raid_boss_<id>` (scaled to width 396, centre-cropped to 191; `raid_list_banners.py`); the cards of 18-21 and 1011 are the twin model's JP card (2007, 2001, 2000, 2008, 2012). Lines after the `boss_L` folder lines of section 48c, generated pack. Demo subtitles: the 52 JP demo LWFs (0018-0028, 0030-0032, 1011, 9101-9103) rewritten with the declared size of the 2 subtitle textures (`raid_demo_english.py`) and the original 2016 English images; section 49g, static pack `raid_gen` (full version only). Both from `D:\Progetto_Restauro_KH_UX
aid_loc` (`--loc` of `import_originals.py`, passed by `build-resources.ps1`). Declared in the Raid Bosses notice.
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
| 0017 Jewel Sorceress (49h) | 658 | 166 | 483 | 5 | 4 |
| 1012 Circus Crab (49h) | 1094 | 259 | 787 | 29 | 19 |
| 1016 Crabby Cake (49h) | 924 | 104 | 653 | 124 | 43 |

- **49h, 0017 Jewel Sorceress, 1012 Circus Crab, 1016 Crabby Cake** (render9, approved by the user on rendered animations 4 Nov, templates included; rows above): 24 folder lines (JP own files) and 2,152 single-file lines (`jp` 2,116 with the folder lines, `b16` 60), 2,700 files, appended at the end of section 49 after 49g. Drawn reconstructed pieces: 0017 only the pink orb of atk2 (size candidate pixel-identical to its own orb); 1012 small sparks, a minion arm and the hit ring; 1016 about 50, mostly from its own enemy version 1600. **49i**: the 9 demo LWFs of the three with the English subtitle (`raid_demo_english.py --models 0017,1012,1016`) and 18 2016 English images, after 49h so they win over its folder lines. List banners `RaidBoss_17`, `RaidBoss_1012`, `RaidBoss_1016` reconstructed from their own JP cards (`raid_list_banners.py --ids 17,1012,1016`), section 48c. 5000 stayed out (served from 49j).
- **49j, 5000 Enraged Arachnid** (render10, approved by the user on rendered animations 4 Nov): fight from the 2016 package, its five folders complete (category 1; `wait`/`knockback` weak points 1-5 = the 2016 `raidEnemy` 5000 parts 50000002-50000005, weaknesses 2-5). Demos `start`, `escape`, `put_down` from JP, plus the textures the JP extraction keeps once as copies of identical files, as for the spiders (category 2): 254 by the L2 copy rules (99.4%) and the 4 JP-era `put_down` effect pieces (rule GN2: same name, size and texture-table run in `put_down_1000`, `0017` and `9101`, one image; held out 2211/2224 = 99.42%). 8 folder lines and 258 single-file lines (`b16` 201, `jp` 57), 797 files. **49k**: its 3 demo LWFs with the English subtitle (`raid_demo_english.py --models 5000`) and 6 2016 English images, after 49j so they win over its folder lines. List banner `RaidBoss_5000` reconstructed from its own JP card `raid_boss_5000` (`raid_list_banners.py --ids 5000`), section 48c. `raid_config.json` unchanged: its own 2016 rows serve it.

- **49e, spiders 9101-9103** (1,107 lines, category 2): the JP LWF revisions that carry the Spinneret target `parts2` (9101 wait .00293431, atk1 plain, atk2 .00293425, knockback1 .00293427, knockback2 .00293429; 9102 and 9103 plain), as exact `=path` sources, and their textures (same folder by name and size, the served 2016 version or the twin rig 5000 by table alignment; for 9101 the image 9102/9103 share at that slot, its own image of that size, or the shared keyblade-hit run). The previously served revisions (the 2016 package) had only `parts1`, so no part could be targeted.
- **49f, Queen Bee 0015, Queen Bee Ω 0016, Lion Headliner 1005** (947 lines, category 2): the JP revisions whose part markers match the 2016 rows (bees: plain name, `parts1`-`parts2`, the abdomen; Lion: wait .00001097, atk1 .00001313, atk2 .00001198, knockback1 .00001275, knockback2 .00001164, `parts1`-`parts3`, the arms), as `=path` sources, plus 932 texture copies (the same model's 2016 files by table alignment, its own unique image of that size, the common keyblade-hit run). The 2016 package carries the 5-marker version that crashed ([Weak points](#weak-points)); with these the part rows stay as they are (11.25%; 60% and 33.3%) and the weak-point check passes on its own.
- **Spider parts (deviation, declared in the Raid Bosses notice).** In the weekly raids (Sep 2018 on) only the Spinneret had a bar (khuxwiki tabs, 2019-2020 footage). But every JP spider revision with `parts2` also marks the spiderlings `parts3`-`parts5` as weak points, and none has `parts1`-`parts2` only, so one part would crash at fight load. Coordinator ruling: `raid_config.json` `modelParts` 4 for the three spiders, the 2016 to July 2018 layout of 5000 (Spinneret 900/24,000 of body HP, spiderlings 25% each). `modelParts` caps a template's parts (first N); it stays in the config for a later era-faithful choice.
- **Checks.** `check_raid_models.py --served` on `raid_gen`: 45 checked, 45 available (`fight`, `put_down`, `escape` true for all; `start` false only for 9102/9103, as before: no `raidStatus` 4 for them). Slots: 0015/0016 [1,2], 1005 [1,2,3], 9101-9103 [1..5], each covered by the part rows.
- **Coverage** (master revision 235): 250 of 344 tier rows available, 96 census rows (was 230 / 87 at revision 234). The other 94 tier rows are `template`: the 15 reconstructed bosses have no 2016 `raidEnemy` row and no `modelTemplates` choice yet, so their weeks wait for one. Along the story 43 of the 150 Shop weeks from 2018-08-30 have no raid (was 46).
- **Templates of the 15 (master revision 236; render7/TEMPLATES15.md, coordinator ruling).** `modelTemplates`: a 2016 row whose part weaknesses equal the model's weak points, ties broken by equal frame counts, rare 1 preferred (Assault Dragon, Adventurer, Heartless Tsum, Greedy Grouch -> 9 Trident Tail; Jewel Princess -> 11 Savage Spider; Gear Golem -> 1001 Red Trident Tail; Mysterious Sir -> 1 Darkside; Merry-Go-Rowdy -> 15 Queen Bee; Loudmouth Parade, Holiday Sleigh, Demon Tide, Cranky Cake, Mischief Bouquet, Red-Nosed Chariot -> 3 Behemoth; Closehanded Captain -> 13 Fortress Crab). No rig is shared with a 2016 boss, so moves, part HP shares and rarity are inferred (medium to medium-low confidence). `bossAttributes` sets the body attribute from the khuxwiki infobox where the template differs; `make-raid.js` gives the parts the same attribute, so the wiki's per-part attributes are not followed. **Deviation:** Assault Dragon, Adventurer, Jewel Princess, Gear Golem and Closehanded Captain had fewer parts in later weekly weeks (khuxwiki tabs), but no LWF revision has fewer weak points, so they keep the full «Default» set (declared in the notice).
- **Templates of 0017, 1012, 1016 (render9, user decision 4 Nov), same rule.** Jewel Sorceress -> 11 Savage Spider (weak points 2-5 = its 4 parts: head 3.75%, hands 25% each, jewel 25%; 2 of 5 frame counts equal, the choice of its twin Jewel Princess; medium), Circus Crab -> 13 Fortress Crab (2-4 = 3 parts, Fortress Crab's own uneven split 5% / 16.7% / 55.6%; it shares Fortress Crab's frame counts in all five fight animations; medium-high), Crabby Cake -> 3 Behemoth (2 = 1 part, base 11.25%; 0 of 5, the choice of its twin Cranky Cake; medium-low). `bossAttributes` from the khuxwiki infobox: Jewel Sorceress 3 Magic, Circus Crab 1 Power, Crabby Cake 3 Magic. No `modelParts`: every template's part count equals the weak points. Moves are the template's (1101/1102, 1301/1302, 301/302), the attack visuals the boss's own. Expected (dry run on copies): 424 of 424 tier rows, 194 census rows (5 new: WW-E23803-1, WW-E31611-1, WW-E27752-1, WW-E34670-1, WW-E38970-1).
- **Coverage at revision 236:** 344 of 344 tier rows, 132 census rows; along the story 0 of the 150 Shop weeks from 2018-08-30 lack a raid. 94 new raid stages: `gen_story_maps.py` (344 stages, 188 new files, the others byte-identical), `validate_maps.py` 0 errors, copied into `stage_gen\files\stage`; they need a new full resource version (96), since 95 lacks them.
- **Maps.** The 7 Scourge Spider tier rows are new raid stages (980032, 980052, 980270-980274): `gen_story_maps.py` on `stage_gen\raid_cfg.json` (250 stages; the 486 files of the others byte-identical), `validate_maps.py` 0 errors, copied into `stage_gen\files\stage`. Resources 94 was built before them and lacks those maps: 95 replaces it.

<a id="story"></a>
## Story raid bosses (Part 2, Task 11, 4 November 2026: tests and dry run, bench pending)

**Audit of `stage.raidBoss`** (served master, rev 264). 2385 rows have a value: 424 are our raid event stages (980000+, our raidSetting 30000+); the other 1961 are 984 story rows (`stageKind` 1: quests 4-979 and the 8 World Tour rows 9101-9108), 976 Proud rows (`stageKind` 4, copies of the story rows) and one training row (78510). Values: 5015 on 960 rows, 50000000 on 148, 2000 141, 1000 140, 4000 134, 3010 134, 6000 124, 3000 64, 6010 64, 2010 18, 1010 18, 4010 16.

- **Meaning.** The value is a `raidSetting` id of the 2016 table: 1000/1010 Darkside (rare Darkside Ω), 2000/2010 Behemoth, 3000/3010 Guard Armor, 4000/4010 Trickmaster, 5015 Trident Tail, 6000/6010 Savage Spider (rare Venomous Spider), 50000000 Enraged Arachnid. The id pairs differ only in the rare roll: x000 has `rareUpType` 3 with arg 10000, x010 arg 2, 5015 arg 5, 3010 `rareUpType` 2 arg 6, 50000000 `rareUpType` 1. So the story row says which boss its quest spawns and how often the Ω replaces it.
- **None of these settings is in the WW master** (`raidSetting` holds only our rows, and `raidEnemy` only the tutorial Darkside and two Behemoth rows without their reward rows). The values are never dereferenced today: the client follows `stage.raidBoss` only from a raid `Info.stageId`.
- **Quests 1-555** are identical to the 2016 stage table, row for row (14 extra 2016 rows, 90501-90514, are not served). **Quests 556-979** were filled by `make-story-oltre.js` from the previous row of the same world, with no source: 556-670 and 675-979 read 5015 (Trident Tail) where the wiki has Behemoth, Guard Armor and others.
- **Proud rows** copy the story values; Proud quests do not spawn (plan decision 7). **World Tour** rows (2000) and 78510 are not story quests of the census.

**Rule.** The master rows are kept as they are: nothing reads them, and a story boss is fought on a stage of its own. Which boss a quest spawns comes from the census story ranges (the census choice on the 24 conflicts of the 2016 table); the Ω chance comes from the row's 2016 setting for quests 1-555 when that setting is of the quest's boss, otherwise from the boss's rule (`raid_config.json` `story.tableLast` 555).

**Built** (`make-raid.js` `storyPlan` / `buildStory`, `raids.json` `story`):
- **Bosses.** Their own 2016 rows as they stand (HP, ATK, DEF, Lux, parts, moves), their 2016 `raidReward` rows (medals and Mythril materials by level, no Raid Coins) under our ids, timer and AP of their 2016 setting (10 minutes, 10 AP; Ω 20 minutes). Behemoth, Trickmaster, Guard Armor, Darkside, Savage Spider and Trident Tail are available, each with its Ω. **Enraged Arachnid (model 5000)** is available since 49j (render10, 4 Nov; before it its 65 quests 426-475, 511-525 spawned nothing): its own 2016 rows, HP 24,000 at LV 1, 4 parts, moves 1101/1102, no rare (`rareUpType` 1), fight stage 980469.
- **Fight stages.** One per boss and stage world (29). Each is a `stageKind` 2 copy of a story row of that world with `raidBoss` = the boss's setting. Its `stageBinId` is that story row, so it has a map, and no event lists it. Worlds 7 and 8 have an incomplete background, so their 114 quests fight on world 1's stage (label `background`). No new maps.
- **Quests.** 822 story quests 4-825 (the 3 tutorial quests excluded); all 822 spawn (757 before Enraged Arachnid was served). 89 `???` quests take the nearest known quest's boss (tie: the earlier one): Behemoth 62, Guard Armor 20, Trident Tail 4, Savage Spider 3 (label `storyBoss`). 24 conflicts: label `storyConflict`. 294 quests use the boss's rule for the Ω (label `storyOmega`). Quests 826-979 spawn nothing (notice 49535). The targets of quests 835 and 850 are ordinary targets.
- **Ω rule.** It is the setting the 2016 table gives that boss most often, read as one chance in `rareUpTypeArg`. In practice: Behemoth, Trickmaster, Darkside and Savage Spider 1 in 10000, Trident Tail 1 in 5, Guard Armor 1 in 6. Guard Armor's `rareUpType` 2 is read as type 3 (label `rareType2`).
- **Target raids** (census «story target raid»): 24 Trickmaster, 66 Behemoth, 81 Guard Armor, 102 Savage Spider, 230 Trickmaster Ω, 325 Guard Armor Ω, 500 Darkside. Each spawns at its clear whatever the counter, unless a boss is alive.
- **Routes** (`routes-raid.js` `storyClear`). A cleared story quest listed in `story.quests` adds `getPoint.raidPoint` to the one counter shared with the raid events. Replays count. Quests 1-3, quests past 825, Proud, Special and event quests add nothing. The Q555 variants count as Q555. A boss alive blocks every new spawn. At the threshold (8600, 6000 in bonus time) the quest's boss spawns on its fight stage, and the counter restarts. The boss level is per boss (`story/<boss>`), +1 per defeat, reset monthly. `save/raid_smoke.json` also accepts `story/<boss>` (the boss itself) and `story/<boss>+rare` (its Ω). The AP 0 campaign rows of `make-ev-campaign.js` cover the 29 fight stages too (they take every stage of 980000-989999): harmless, a fight stage is never started as a quest.
- **Notices** (Task 12): `raids.json` `story.conflicts` (24) and `story.unknown` (89) list the quests to declare.

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

Other values of `make-raid.js` that are not original: Munny and EXP of the boss rows are the 2016 values; Lux follows the rule of [Lux](#lux); part HP comes from the 2016 ratio, or from JP screenshots of 5 bosses where derived; below the cap of the one-tier era HP follows `singleEra.hpShare`, fitted to three readings.

## Server routes (Part 2, Task 6: tests only, bench pending)

`server/routes-raid.js`, a factory wired in `server.js`; state only in `player.raid`. Choices the plan left open, ours unless a source is named:

- **Which raids are listed:** those of the player's Shop week, see Calendar below.
- **Spawn.** Only clears of a raid event's quest count (stage ids 980000-989999; Task 11 adds the story). Points add up while a boss is stored, and it blocks a new one; at the threshold the counter restarts from 0, whatever was above it. Bonus hours and weekends are read in Pacific time, daylight saving included.
- **Boss level** starts at 1 and stops at 99. `entry.level` of `raids.json` is the quest's level (225 on Epic), not the boss's.
- **Bonus-time level step (original rule):** notices #44500 (2018-09-17) to #55884 (2019-08-01): «The raid boss will gain an increased 2 levels upon successful defeat!» in Raid Boss Bonus Time, every day of the event (#55360 of 2019-07-15 and #55884 still have it: corrected 4 November); #56463 (2019-08-12) makes stats static and removes it. Server: a win in bonus time (`isBonusTime`) on a week starting in [2018-09-17, 2019-08-12) raises the boss 2 levels, else 1 (`levelStep`). Level effects by era: `tmp
- **Event raid level rules (I-229, 5 November 2026, benched).** `EVENT_LEVEL_STEPS` of `routes-raid.js`, by census id, before the rule above (also for a kept raid of the Raid Catalog): **+5 at every defeat** for WW-E23794-1 (Daily Raid Events of 2016-12-26, notice 23794: «instead of the raid boss increasing its level by one, it will increase by five levels») and WW-E37768-1 (Mysterious Sir, notice 37768: «The Raid Boss's level will increase by 5 each time you defeat him!»; its Setzer drops at 31, 71 and the Boosted one at 96 are all 1 + 5n, so they are met); **+5 in Bonus Time**, +1 otherwise, for WW-E42613-1 (Gear Golem 2018-07-23) and WW-E43551-1 (Gummi Hound 2018-08-20): «Gain an increased 5 levels upon successful defeat of the boss!». **Inferred** (the notice gives no amount): WW-E38250-1, WW-E38970-1, WW-E40165-1 (Queen Bee, Crabby Cake, Gear Golem, spring 2018: «Raid bosses level faster!», «your Raid Boss could skip past level 90») take +5 in Bonus Time as 42613, same notice pattern; WW-W-2018-09-10 (notice 44005: «Raid Bosses will gain more levels with each defeat!») +2 as 44500 of the next week. A level drop is paid only when the boss is defeated at that very level, so a jump can skip it (as notice 38250 warned for its LV 90 coins). **Daily raid coins** (`EVENT_COIN_LAST`): WW-E29805-1, WW-E31611-1, WW-E33007-1 («Get Event Coins every 5 levels!», «will not yield any Event Coins after level 55») and WW-E33888-1, WW-E35529-1 (after level 50): a defeat pays its coin tables (Victory, MVP, All Points) only at LV 5, 10, ... up to that level; any other defeat leaves no pending reward (no RAID RESULTS entry), the level still rises. The amounts stay the reconstructed bands (`eventCoins`). Tests `event_level_steps`, `daily_coins_every_5_levels` in `test-raid-routes.js`; Notice «Raid Bosses». **Bench 5 November 2026** (rev 272, test copy of `maxpower`, kills by Force Skip on the lure quest + one fight): Mysterious Sir (Mar 5 2018, Beginner) LV 1 -> 6 -> 11 (`t272_ms15`, levels in the save); Gear Golem (Jul 23 2018) outside Bonus Time LV 1 -> 2 (`t272_ggb4`), in Bonus Time (`-RealNow` 08:20 PT, «Bonus Time: Raids cost 0 AP!» on the quest) LV 2 -> 7 (`t272_bt1`, `t272_btc_a3`); Submarine Carp daily raid (Jul 3 2017) killed at LV 1: no RAID RESULTS popup, the quest screen opens, no crash, LV 2 (`t272_scc_f4`); at LV 5 (counter set on the test copy): RAID RESULTS with Raid Coins x40 / x10 / x10 (`t272_lv5_f4`). Notice paragraph served.
aid_level\FINDINGS.md` (weekly era from 2019-08-12: level changes nothing, as ours).
- **Level reset (original rule):** World Wide notice 17888 (2016-05-01, IMPORTANT): «Raid Boss levels will also be reset at the start of the month»; khuxwiki, Raid Boss: each boss has its own level that resets at the end of the month; notice 74823 (2021) calls a returning boss showing «the same LV as their last appearance» a display error, so a boss back in a later raid week starts at LV 1. Server: `player.raid.levelsMonth` (`clock.monthIndex` of the real clock: the month changes on the 1st at 08:00 UTC = 00:00 PST, like Spirit Training) clears `levels`; `levelOcc[key]` holds the week (`entry.start`) a level belongs to, a different week reads as LV 1. A boss alive keeps its level (`boss.level`); one defeated after the month changed (`boss.month`) does not feed the new month. A kept raid of the Raid Catalog has its own counter `levels["cat:<entry key>"]` (same occurrence and month rules), so it starts at LV 1 even for a week once played live and never moves the live level (user, 2 November).
- **Quest AP** is charged at `/stage/start` and listed in `stages[].useAp` for the moment; the master row holds the weekday value. Before 2019-07-15, by the week's `ap`: `0 / 5` is bonus / the rest, `5 / 90` weekend / weekday, so bonus time costs the weekday value there. From 2019-07-15 the rule 0 bonus / 5 weekend / 90 weekday, except the census weeks `0 / 5` and `0` (I-236, 05-11): the «Radiant Reward Raid Event» weeks (notices 56463 of 2019-08-12, 58020 of 2019-09-23, 70818 of 2020-11-09: «Outside of the above times, the raid quest will cost 5 AP») cost 0 in bonus time and 5 at any other hour, weekdays included; the June 2020 weeks (notice 66114: «Bonus time will go on 24 hours all day until Jun. 30», «0 AP cost») cost 0. `questApAt` follows the census for them, so the weekday charge equals the master `useAp` (last census value) on every served raid quest (test `quest_ap` of `test-raid-routes.js`). Not built: the June 2020 24-hour bonus also doubled Lux all day (`isBonusTime` keeps the four bonus hours).
- **`/raid/start` refused** (not enough AP, or a boss that is gone): the answer has `ret` and `userPoint` only, so we expect the client to stop on an error rather than play a fight that does not count; this has not been observed. The client checks AP itself first, so only a stale screen should get here.
- **`/raid/start` after the timer on the same boss** (deck screen left open, bench 2 November): a refusal is «200 ERROR :122» and OK resends it forever, so the fight is played free and `/raid/clear` answers 2 (escaped) whatever the parts, with no damage kept and no reward.
- **`/raid/clear` with no fight running** (repeat, or the boss is gone): nothing changes, `getLux` 0, `raidTimeStatus` 5. Parts with an unusable `hp` are ignored: they keep their stored HP.
- **Titles** in a reward go out at `/raid/clear`, so the popup opens before RAID RESULTS; everything else is delivered at the first `/raid/reward` after the win, and the entry leaves the save with it.
- **A fight lost past `timeLeft`** answers `raidTimeStatus` 2 (the boss has escaped) and `/raid/list` still plays the flee; a win past it stays 3. An entry that throws at `/raid/reward` is logged and lost, so the quest screen keeps working and nothing is paid twice.
- **`/raid/member`**: `damage` is the sum of `parts[].damage` the client reported on that boss, kept in `player.raid.lastFight` after the boss is gone.
- **A stored boss whose `stage` or `raidEnemy` rows are not served** is dropped with a log line at `/raid/list` and `/user/notice` (so the home's «Active request!» never offers it), since the client would crash on it.
- **Banner.** `/web/raid/img/v<N>/<evStageId>.png` (`RAID_IMG_VERSION` in `routes-raid.js`, 2 since 3 November; bump it when the cards change, the client caches by URL, and it is in the master `evStage.bannerUrl` of `make-raid.js`, so regenerate the master too) from `game_data/raid_img`, else `0.png` (the plain plate of `make_special_banners.py`), else 404. The cards are the original weekly raid banners, written by `make_raid_banners.py`: 127 of 132 evStageIds from khuxwiki «Weekly_Raid_Event» (local `reference
aid_banners`), the 5 weeks 2018-09-03 to 10-01 (not on that page) from the official notices with `--notices` (local `reference
aid_banners\sqex_notices
otices.json`): #44001 Merry-Go-Rowdy (8071), #44005 Closehanded Captain (8072), #44500 Gear Golem (8073), #44507 Merry-Go-Rowdy returns (8074), the notice images from archived copies of `cache.sqex-bridge.jp/img/<key>`; #44934 Green Trident Tail (8075) from the khuxwiki upload of 2018-10-01 (`Event_-_Green_Trident_Tail_Raid_Event_banner_KHUX.png`; the notice image could not be fetched). Each shows its week's dates or boss, checked against the boss cards `raid_boss_<model>`. No week shows `0.png` any more; no card is reconstructed. The 2020-07-20 card is Fortress Crab Ω, identical to official notice #67361.

## Calendar (Part 2, Task 8: tests only, bench pending)

`server/raid-calendar.js` picks the raids of the player's week; `routes-raid.js` lists them in `/stage/event` (category 2) and hands out their Raid Boards. Rules, ours unless a source is named:

- **The week is the Shop week of the story** (`storyCtx()` of `server.js`: `shopFrom` / `shopTo`). The story quest picks the tranche, and inside a tranche of several weeks the week moves on every real Monday, as the Shop and Special tabs do. There is no rotation counter of its own.
- **Which census rows run:** every row whose dates hold `shopFrom` (several when they ran together, such as a Radiant Reward row beside a Weekly one). Otherwise the row with the largest overlap with the Shop week, tie to the later start, together with any row of the same dates. Shop weeks start on the tranche's day, often a Thursday, while rows mostly run Monday to Sunday: this is the rule `special.currentEntries` applies to the weekly VIP versions, and the test checks that the two agree on every day from 2018-08-20 to 2021-07-10.
- **Only available tiers are listed.** A week whose rows have no available tier (model incomplete, no template row) has no raid, as do the weeks before the first row (2018-09-03 today; the WW event raids from 2016-05-02 come with Task 10). The other tiers of the chosen rows are returned apart (`weekRaids(...).unavailable`) for the Raid Catalog.
- **Families:** `raids.json` holds the Weekly and Radiant Reward rows plus the 3 pre-series rows of September and October 2018, every WW row with week data. `make-raid.js` builds all of them; `onlyCensusIds` in `raid_config.json` is now only a filter for tests and benches. Weekend-only and Daily raids, which open only on the real weekend or day, came with Task 10 ([event raids](#events)).
- **Bench smoke:** `server/save/raid_smoke.json` `{"key": "<entry key>"}` makes `/user/notice` and `/raid/list` force that entry's boss, whatever the week, replacing a stored boss of another key. It exists only on the bench (a script writes it before every model and removes it at the end). Only a file younger than 2 hours counts, so one left behind by a killed script is ignored (logged once) and cannot take over normal play; without the file nothing changes.
- **A quest of another week still counts** when it is played, because its screen may stay open across the Monday. The kept raid of the Raid Catalog keeps its boards beside the current ones.
- <a id="catalog"></a>**Raid Catalog (Task 9, ours).** Banner: master `evStage` 8000 (`eventType` 0, `eventCategory` 2, `detailUrl` `/web/raid/catalog`, card `raid_img/8000.png` of `make_special_banners.py --section raid`), first in `/stage/event` category 2; it holds the Training Grounds quest 970000 of the Special Catalog because an `evStage` needs a quest and a tap always opens the quest list (`raids.json` `catalog`, written by `make-raid.js` only when stage 970000 is in the master). Pages `raid-pages.js`: `/web/raid/catalog`, `/web/raid/raid/<evStageId>`; `POST /web/raid/keep/<evStageId>` and `/web/raid/unkeep`. `player.raid.kept` = one census id; `raid-calendar.js` `rowState`: `removed` (no available tier), `now` (a raid of the Shop week), `can` / `kept` (ends before `shopFrom`), `other` (dates inside the Shop week but not listed now: never «later»), else `later`. An old `kept` ({key, censusId} or an entry key) is converted to the census id at load, an unknown one cleared. The kept raid is served only while it is a past week: its available tiers follow the current event with the card `<id>-kept.png` (gold KEPT RAID tab), its quests (any raid quest that is not a raid of the week, kept or not any more) spawn a boss with the level key `cat:<key>`, its AP and Bonus Time rules are its own week's (`entry.start`), its boards are the same `sphereBoardId`s (no reward twice), its coins are paid at every win. Events progress counts only `eventType` 2 events.
- **Raid Catalog filters: RAID BOARDS (user, 3 November 2026, ours).** Beside PROGRESS (objectives of the playable tiers, crown rule), the Filters sheet has a RAID BOARDS group: All / Completed / Not completed (the open and closed padlock icons the catalogues already use, `unlocked` / `lock`), with its tag in the summary line («Raid Boards: …», ×), «Clear all», the counts of «Show N results» and the empty state («No raids with completed Raid Boards / with Raid Boards to complete …»). A raid's boards are **completed** when every `sphereBoardId` of its available tiers is complete in the save: every node of the board's grid (`sphereNodes`) in `player.raidSphere[id].unlock`, the rule of the board screen (`status` 3 of `userSphereData`). The progress is kept for good when the board closes, and a kept raid uses its week's boards, so the filter reads the same progress live, kept or removed. A board never handed out, or not served by the master, is not complete. A raid with no board on its available tiers (3 weeks today: 2018-09-10, 09-17, 10-01, plus the rows not restored) is neither: it shows only under All. Server: `raidBoardDoneLookup` in `server.js` (`ctx.boardDone`); page: `data-boards` = `done` / `todo` / `none` per row.
- **Coverage, 2 November 2026** (`raid_models.json` with 29 models, templates below): 93 census rows with an available tier, 243 of 344 tier rows. The other 101 tier rows (16 bosses) are `graphics`. After the weak-point check (master revision 234): 87 census rows, 230 tier rows; 13 more are `parts` (Queen Bee, Queen Bee Ω, Lion Headliner). Along the story, 104 of the 150 Shop weeks from 2018-08-30 list a raid; the other 46 have a row with no available tier. The one-day Gear Golem event of 2020-11-01 has no week data and is not built.
- **Templates** (`modelTemplates`, inferred from the LWFs, medium-high confidence): Scourge, Wicked and Malicious Spider (9101-9103) use row `5000` Enraged Arachnid. The three share one rig, and `5000` is the 2016 recolour that already reused Savage Spider's moves. Egg Master (1008) uses `0007` Trickmaster: identical frame counts in all five fight animations, 2 parts. The spiders keep the attribute of their colour (`bossAttributes`: red Power, green Speed, blue Magic, as the census reads it), labelled `attribute`; Egg Master keeps Trickmaster's.
- <a id="events"></a>**Older WW event raids (Task 10, tests only, bench pending).** `make-raid.js` builds the 62 census rows of the families one-off event, weekend-only, monthly, daily and daily showdown (80 tier rows: «quest LV N» is one tier, `single`; «Beginner/Intermediate/Advanced (quest LV a/b/c)» three; a daily showdown one boss per day, key `<id>/single@<day>`; «X» with «X Ω» one quest whose rare boss is X Ω). The other 6 WW rows (two lure weeks, Daily Challenge #13, two rare spawns in ordinary events, the Gift event with no dates) are not raid events: `report.skipped`. Rules, ours unless a source is named:
  - **Opening (spec Answer 4).** Entries carry `event`, `periods` (Pacific days: the census dates, plus the other weekends the census note copies from the notice) and `open`: `weekend` (listed only on a real Saturday or Sunday PT), `day` (daily showdown: the boss of the real weekday), `daily` (every day; the boss level resets each Pacific day, notice 29805). An event row runs when one of its periods overlaps the Shop week, beside the weekly rule; `raid-calendar.js` `openNow(entry, nowMs)`, `weekRaids(...).closed`. A kept raid of the Catalog follows the same days. The original daily raids also had one-hour windows (12:00 and 19:00 PT): not applied, declared.
  - **HP.** A row whose census `data.hp` is «yes (2016 row)» (the 9 events of May-October 2016) serves its boss's 2016 rows as they stand: knots, HP, ATK, DEF, Lux, parts, and the 2016 `raidReward` rows (Event Coins, medals) under our ids; the client interpolates between the knots (linear, flat outside: `atLevel`). The other rows (fix round 1, user decision 4 November) follow `eventHp` of `raid_config.json`: the boss's own 2016 row (its template's when it has none) as the shape, scaled log-linearly by date from x1 on 2016-10-31 to 1 billion at LV 30 on 2018-09-11 (the reading «caps out at level 30 with 1bn HP»), never below x1; weekend raids before 2018-05-05 x2 («half of previous» that weekend). The three tiers of 2018: Beginner the line, Advanced at least 500 million at LV 1 (2018-07-23 reading, read as the hardest tier), Intermediate their geometric mean (labels `eventHp`, `hpTier`). The one-tier weeks of 2018-09 with no video reading follow the same line, read at the week's last day and flat above LV 30. The 1.2-16.5 billion cap applies from 2018-10-07 to 2019-08-11 only.
  - **Level drops** (fix round 1): the itemised level rewards of the notices (Chip and Dale at LV 10, every 10 levels for Gummi Hound 2016-09, Setzer at 31 and 71, Halloween Sora at 90 ...) are raidReward rows of their own (`enemyId x 100 + 40 + i`, every slot paid) named in `entry.levelDrops`; `routes-raid.js` sends them to the Present Box when the boss is defeated at that level. Not itemised, chance, Boosted and amount-less coin rewards stay out (`levelDropsPartial`).
  - **AP 0 campaign** (fix round 1): in a bonus hour only when every listed raid quest costs 0 then (`.every`), since the campaign rows cover every raid stage.
  - **Timer and AP.** A 2016 `raidSetting` dated on the row's start (id yymmdd000) is original; weekend-only rows otherwise 3 h, 1 h from 2018-05-05 (`weekendUpMinutes`, label `weekendTimer`); otherwise the boss's 2016 setting (`setting2016`: Gummi Hound 180 min / 1 AP, Fortress Crab Ω 120 / 1, rare 2 bodies read the rare fields), else 10 minutes, 20 for a rare 2 body (`eventUpMinutes`), and `useAp` 10.
  - **Rare boss.** `entry.rare` {enemyId, upMinutes, useAp, every}: the setting holds `rareBossId`; `routes-raid.js` spawns it with a chance of 1 in `rareUpTypeArg` (rareUpType 3, inferred: Fortress Crab 1 = always the Ω the notice names, Queen Bee 5), with its own timer and AP; label `rareOdds`.
  - **Quests and rewards.** Each tier's quest page (event reward research): its AP, level and three objectives with their own rewards (Jewels, Event Coins, Raid Coins, medals); an objective with no code or an item we lack (Avatar Coin, keyblade and skill objectives) falls back to the standard Raid Time! objectives (`questObjectives`). Coins without a 2016 row: the one-tier level band table (`eventCoins`); the daily raids pay them only every 5 levels (I-229, above); the level coin drops of the notices with no amount (LV 90 / 99 «a bunch of Raid Coins») are not served. Boards: the event boards with every cell and cost (2016 table where it is the best source), appended to the weekly list (`BOARD_FAMILIES`, the pre-series rows included); male and female boards both open (`boardGender`); a row with no board gets the nearest board of its family without that event's exclusive items (`boardStandard`); three cells left off, declared in `boards.unmatched` (two Boosted medals, the HD Vanitas Booster).
  - **Coverage (dry run, 4 November 2026, real `raid_models.json`):** 75 of 80 event tier rows available (57 of 62 rows; Jewel Sorceress, Circus Crab, Crabby Cake have no model: `graphics`), 344 of 344 weekly tier rows unchanged; 419 tier rows, 189 census rows, +492 Raid Boards, master +1.03 MB.
- **Size:** all rows add about 2.4 MB to the master (243 stage, 93 evStage, 243 raidSetting, 810 raidEnemy, 945 raidReward, 42 raidEnemyAttack, 245 Raid Boards).

<a id="japan-only-raids"></a>
## Japan-only raids (I-232, 5 November 2026, benched)

User goal: every original raid, no exclusions. The census has 185 JP rows (2015-10 to 2019-05). Spec Answer 3: they are served
**only in the Raid Catalog**, marked **Japan only**, never as a raid of the week. The full per-row list (dates, HP, donors,
rewards) is private (`private\events\sources\raid_census\JP_ONLY.md`).

- **Which rows** (`make-raid.js` `jpStatus`). Served: 148 rows, 155 tiers, all available: 38 raid events (2015-10 to 2018-08;
  JP-RAID-23 has two bosses, two quests), 97 super-hard weekends (2016-06 to 2018-06), 12 monthly 30-minute raids (2017-06 to
  2018-08), the daily rotating raid of October 2017 (7 bosses, one per day). Not served (37, `raids.json` `jp.skipped`):
  25 weekly rows from September 2018 (the JP weekly raids were the WW ones, same dates), 4 events of 2018 with a WW row of the
  same boss starting the same day, 3 regular-boss lure weeks (not raid events, as in WW), 5 rows whose boss no source names
  (December 2016, August and September 2017 monthly raids, two 2018 weekends).
- **The two 2018 weekends** (research 5 November 2026, facts only). JP weekend raid bosses followed one 7-boss cycle (Malicious
  Spider, Blue Trident Tail, Wicked Spider, Red Trident Tail, Fortress Crab Ω, Scourge Spider, Green Trident Tail) on every dated
  weekend 2016-10 to 2018-06; a JP notice of 2018-06-23 (Scourge Spider after the empty 6/16) shows the cycle skips weekends with
  no raid (6/16 and 6/30 had none). Hence **probable**, not proven: 2018-08-04 Red Trident Tail, 2018-09-01 Malicious Spider.
  2018-09-01 was the last JP weekend raid. No HP source (players read about 1.5 billion from 2018-06-23). Still not served.
- **Ids.** `raid_ids.json`: the JP rows are numbered after every WW row (append-only): rows 202-349, entries 470-628.
- **Calendar.** Entries carry `jp: true`, `region: 'JP'`. `raid-calendar.js` `weekRows` drops them, `catalogRows` keeps them
  (`row.jp`), so a JP raid is played only when kept (`rowState` `can` once the Story has passed its dates). Raid Catalog:
  TYPE «Japan only», «Japan only ·» on the row, JP family labels (ours, translated: Raid Event (Japan), Super-Hard Weekend Raid
  (Japan), Monthly 30-Minute Raid (Japan), Daily Rotating Raid (Japan)).
- **Quest** (label `jpQuest`). No JP quest page survives: each tier plays on the quest of a WW event raid (`jpDonorOf`: the
  same boss nearest in date, else the WW event raid nearest in date), reusing its **map file** (`stage.stageBinId` = the donor's
  stage; `server.js` `poiStageId` and `check-stage-data.js` follow it), its level, AP and world, with the standard Raid Time!
  objectives. So no new map and **no new resource** is needed for the stages. Known JP AP: November 2017 monthly 0
  (`jpQuestAp`). A row with no end date lasts a week (`jpDates`).
- **HP.** Super-hard weekends: the JP wiki's fixed HP at every level (99,999,990 / 50M / 30M / 150M by era), parts at their
  template share. JP wiki lines of RAID_VALUES.md dated in the row's month: Adventurer 2016-10 (body 7,777,777, each part
  77,777, all levels), Jewel Princess 2016-11 (by level, linear between the wiki's levels). Rows with census «yes (2016 row)»:
  the WW 2016 row as it stands, rewards included (`jp2016`). Others: the `eventHp` rule of the WW event raids. No 2016 floor
  under a JP wiki HP. ATK / DEF as the WW raids of the time.
- **Timer** (`jpTimer`, `raid_config.json`): super-hard weekends 12 h, 1 h from 2018-05-05; monthly 30-minute raids 30 minutes
  (their two daily windows are not applied: open all day, as I-228). Super-hard weekends open on Saturday and Sunday only
  (`open: 'weekend'`), the daily rotating raid on its weekday (`open: 'day'`).
- **Boards.** No JP board survives cell by cell. Super-hard weekends: the JP standard board (13 cells, 40,500 Raid Coins,
  6★ Moogle x3, Huey & Dewey & Louie x8, Magic Broom x2, completion 6★ Moogle) is the WW **Legendary Raid Reward** board of
  WW-E41605-1, the same cells, items and total (`jpBoards.superHard`, label `jpBoard`; `boardSet` when the census only infers
  it, from 2017-05-26); the first five weekends had other small boards: `boardStandard`. Other rows: the generic boards (no
  title, no gender, Medals and Jewels only: the JP «Advanced bonus» = WW «Seasoned Wielder Bonus») of the nearest WW row of the
  matching family, without its exclusive items (`boardStandard`). Card picture of the donor board (`artFrom`, `raid-boards.js`):
  190 new lines in `game_data/raid_board_art.tsv`, which only a resource build imports. The JP avatar parts, titles and level
  drops are not given (list and WW availability in the private file).
- **Cards.** No JP raid banner was collected: the Events card is the plain plate (`0.png`). Models and list banners are the
  served ones of each boss.
- **Notices.** «Raid Bosses»: section «Raids of the Japanese version» (`raidJpLines`), and «Raids not here yet» lists the unnamed
  bosses and the WW twins (`raidNoticeLines`, from `raids.json` `jp`).
- **Master** (make-raid.js + make-ev-campaign.js on rev 271 data): stage +155, evStage +148, raidSetting +155, raidEnemy +608,
- **Bench 5 November 2026** (master rev 272, resources 104, test copy of `maxpower`, screenshots `t272_*`). Server: `106 tabelle valide`, no `[master]` raid line. Raid Catalog TYPE «Japan only»: **Show 148 results**, every row «Japan only ·» (`t272_f5`, `t272_f6`). Blue Trident Tail 8/19/16 (JP-SHR-6) details: Type «Super-Hard Weekend Raid (Japan)», HP 30,000,000 (`t272_shr6a`); kept: on a Thursday not in Events (`t272_wd1`); `-RealNow` Saturday 2026-11-07: KEPT RAID card (plain plate), quest on the WW Blue Trident Tail map (Eggcognito lure), Force Skip, boss 30,000,000 HP with **12:00:00** left, fight loaded and won, RAID RESULTS, level 2 (`t272_sat1`-`t272_sat17`); Raid Boards list shows **Legendary Raid Reward 8/19/16** with its card picture (13 nodes, 40,500 coins, `t272_rb_l4`). JP-RAID-10 (Queen Bee 4/10/16) kept on a Monday: quest opens (`t272_mon4`). JP-RAID-27: Monday Trickmaster (`t272_mon6`), Tuesday Jewel Sorceress (`t272_tue1`). Notice «Raid Bosses»: «Raids of the Japanese version» and the updated «Raids not here yet» served. Low-story copy (Story cut to Q300): later JP raids «Unlocks at Story Quest 526» (`t272_low10`; 136 rows later, 11 can be kept).
  Two defects found and fixed on the bench: (1) the 190 JP board cards were written as `loc` lines naming the JP board key (`JP-RAID-1_std5-...png`, no such file): the resource build stopped; the art record now names the donor board whose picture is used (`raid-boards.js`, test in `test-make-raid.js`). With the cards the generated pack is 535 MiB, over the 512 MiB reserve: reserve 640 MiB from resources 104 (`build-resources.ps1`). (2) The details page of a JP raid said «No Raid Boards this week.» above its listed board (the JP boards have no census name): the line is left out when boards are listed (`raid-pages.js`, test in `test-raid-pages.js`).
  raidReward +1,920, sphere / sphereArray / sphereMasu +190, evCampaign +31 (AP 0 rows over the new stages); no WW raid row
  changed; about +1.6 MB. Needs a master revision bump.

### Japan-only raids: research on the open gaps (5 November 2026, research only, nothing served yet)

Sourced from the original JP notices (read from web archives), JP community digests, the JP wiki board pages and the JP 4.3.1
client images, against the WW master. Details, sources and confidence per item in the private `JP_ONLY.md`.

- **Monthly 30-minute raids 2017 were daily rotating, one boss per weekday** (JP notices, proven). July 2017: Mon Assault Dragon,
  Tue Queen Bee Ω, Wed Jewel Princess, Thu Jack in the Box, Fri Gummi Hound, Sat Closehanded Captain, Sun Gear Golem (7/1-7/31;
  today served as Closehanded Captain only). August 2017: Lion Headliner, Circus Crab, Jewel Sorceress, Egg Master, Hocus Pocus,
  Adventurer, Submarine Carp (8/2-8/31). September 2017: Gummi Hound, Gear Golem, Queen Bee, Assault Dragon, Circus Crab, Furious
  Whole Cake (= Crabby Cake, probable), Jack in the Box (9/2-9/30). Level resets after each 30-minute window; LV5+ kills give the
  big coin payout; the Saturday boss at LV10 drops a status-boosted copy (ATK +1000) of the month's medal (Trickmaster, Twilight
  Thorn, Destroyer Behemoth).
- **Year-end 2016** (12/26-1/1) was also a daily rotating raid, boss level +10 per kill (JP notice); the bosses per day are not in
  the text: probably the WW «2016 Showdown!» lineup of the same dates and rewards (Green Trident Tail, Wicked Spider, Submarine
  Carp, Fortress Crab, Gummi Hound, Blue Trident Tail, Hocus Pocus).
- **Weekends 2018-08-04 and 2018-09-01**: still unnamed (their notices are not archived). JP weekend raids ran every weekend in
  2018 (standing notice, 60-minute limit); by the 7-boss cycle each date has two candidates (8/4 Scourge Spider or Red Trident
  Tail, 9/1 Wicked Spider or Malicious Spider). Not served.
- **Rewards found in WW data**: Santa Sora (= WW Christmas Sora art; JP had ★1-★6), Yellow / Treasure Trove Frog Caps (JP «Kero
  caps»), Meow Wow Snuggly (JP «Snuggly Wandanyan»), Sweetheart Minnie and Mickey & Minnie (JP Valentine medals, same art),
  Sweetheart Beast and Prince & Belle (JP White Day medals, same ids), Rainbow Kitstar / Pupstar pet parts (probable), the JP
  board titles as WW title rows 12012-12137 (probable, same order). **Only in JP images, not in the WW master**: Mickey & Magic
  Broom (the Fantasia Mickey evolution with 5 Magic Brooms, an ability-up fodder medal), Necho Cat, KH3D Sora & Riku, Santa
  Sora ★1-★4, the JP ★5 Valentine Minnie art. No board survives cell by cell; no HP for these rows.

<a id="lux"></a>
## Lux (3 November 2026, tests only, bench pending)

User report (bench 3 November, every tier): far too little Lux. `/raid/clear` reported 450-935 Lux per kill, Epic included.

**What the client reports.** `getPoint.lux` is the sum of `luxAttack` (int64 in 4.3.1) of the body and of every part it breaks, at the boss's level (linear between `baseLv` knots), times the deck's Lux skills. Bench log 2-3 November: Trickmaster LV 1, 270 + 90 + 90 = **450** exact; LV 2, 360 + 120 + 120 = **600** exact; a row with `luxAttack` 1,000,000 gave 1,018,000; other fights 571-935, the same base times the Lux skills of the deck. `luxSuppress` did not show in a solo kill. Read from the logged requests, not from the code.

**Original rule (evidence):**
- Official guide «Collecting Large Amounts of LUX» (notice 60146, 2019-11-18): Lux from raid bosses is not affected by hits or by the damage of the last blow; it «changes based on the Raid Boss' remaining HP and skills that boost your LUX gain»; bonus time increases it «massively». So a kill's Lux is fixed by the boss and the deck, as the client computes it.
- Bonus time doubles it: «Lux rewards for defeating raid bosses doubles!» (notices 18670, 19294, 2016; 25835, 2017), «Lux received from Raid Bosses greatly increases!» (44001, 2018), «0 AP cost and double the LUX» (66106, 66114, 66617, 2020). The 2016 master has 123 rows `evCampaign` type 10 «Lux x 2» power 20000 in the bonus windows.
- 2.5.0 (notice 36760, 2018-02-01): «Increased max Lux obtainable from raid bosses»; `luxAttack` is int64 in 4.3.1.
- Totals per kill, Lux++ on every medal, no bonus, no party boost: Advanced (400B HP) about 8 billion, Legendary (700B) «a little over 12 billion» (reddit jjsvtj, 2020); Epic (999,999,999,999) about 40 billion in bonus time and Legendary about 24 billion (reddit kcpa3r, Dec 2020, so 20B / 12B without); video aWbBHHG7HrU (Epic Trickmaster LV 99, June 2021, orange panel): **19,829,755,202** and 19,831,832,532 outside bonus time, **45,616,383,000** in «Raid hour» (bonus plus party boosts), Damage 1.85-1.90 trillion in all three, so damage does not change it.
- These fit **2% of body HP** per kill with a full Lux++ deck (Advanced 8B exact, Epic 20B, Legendary 14B against about 12B).

**Implemented.** `make-raid.js` `applyLux` (config `lux` of `raid_config.json`): at every knot the sum of `luxAttack` over body and parts = body HP x `perHpFullDeck` 0.02 / `fullDeckMultiplier` 5, where 5 is our Lux++ (`luxUp` 50000, itself an estimate, [medaglie](medaglie.md)); the sum is shared as the template row's `luxAttack` (all on the body when the template has none) and `luxSuppress` keeps its ratio. Base per kill: Beginner 600,000, Intermediate 600M, Advanced 1.6B, Legendary 2.8B, Epic 4B; one-tier era 54,000 at LV 1 to 3.6B at the 1.2B cap. Story raid rows (Darkside, Behemoth: not built by `make-raid.js`) keep the 2016 values. Label `lux` in `reconstructed`. **Bonus time**: `/raid/clear` multiplies the reported Lux by 2 in the bonus hours (`luxFactorAt`, the same hours as the AP rule), in the player's Lux, the Lux missions and `getLux`. No Lux campaign is served, so the client does not double it too. Declared in the Raid Bosses notice.

**Confidence:** the client side (sum of `luxAttack`) high, read from 9 logged fights; the 2% share medium (3 forum totals and one video, all with Lux++ decks); the split between rows and Lux++ x5 low, but only the product matters for a full Lux++ deck; Beginner and Intermediate have no reading. **Open for the bench:** whether the orange panel shows `getLux` or its own count in bonus time; with its own count it shows half; then serve a type 10 campaign instead, after checking that the client applies it in a raid.

**Bench 5 November 2026 (rev 268, Epic Trickmaster LV 1, 999,999,999,999 HP, smoke key `WW-W-2021-03-15/Epic`, saves `luxA2`/`luxB` copied from `maxpower`, `-SkillProb 100`, AUTO, Give Up after 60 s, outside bonus time).** The client pays raid Lux **per hit, in proportion to the HP removed**: `getPoint.lux` = sum over body and parts of `luxAttack` x damage / max HP, times the deck's Lux skills, so a full kill gives exactly the `luxAttack` sum (the rule of `applyLux`), and a lost fight gives its share. Measured (all three match the formula to the unit):

| Deck | Damage (body / part 2 / part 3) | `getPoint.lux` | Base by the formula | Factor |
| --- | --- | --- | --- | --- |
| no Lux skill (Attack Boost XV Max x5), run 1 | 170.9B / 173.5B / 171.4B | 870,084,653 | 870,084,653 | x1.00 |
| no Lux skill, run 2 (fresh boss) | 357.9B / 366.8B / 364.0B | 1,833,417,366 | 1,833,417,366 | x1.00 |
| Lux++ on the 5 deck medals and the friend medal (ATK B XI Max & Lux++) | 259.7B / 262.5B / 264.1B | 5,951,270,065 | about 1,325,509,600 | **x4.49** |

The Lux++ deck is weaker (XI Max against XV Max), so it dealt less damage in the same 60 s, yet earned 3.2x the Lux; per damage dealt it earns 4.49x (5 expected with `luxUp` 50000; the 6th Spirit slot medal has no Lux skill and dilutes it). An Epic kill with a full Lux++ deck therefore pays 4B x about 4.5-5 = **18-20B**, the video's 19.83B (I-223). The YOU LOSE panel shows `getPoint.lux` (screenshot `lux_a2_result`, `lux_b_result`; a shot taken while the numbers still count up shows less: `lux_a_13`). Earlier bench readings (450, 600 for a kill) were kills of 2016 rows, where the sum of `luxAttack` is what a full kill pays: same rule.

**Bench 5 November 2026, bonus time (rev 269, save `i223`, `-RealNow 2026-11-05T16:20:00Z` = 08:20 PT, Jewel Princess Beginner LV 1 killed).** Client `getPoint.lux` 600,001, server granted 1,200,002, CONGRATULATIONS panel 1,200,002 (`i223_07`): the panel shows the server's `getLux`, so the server-side doubling is what the player sees; no type 10 campaign needed (I-223 closed). Bonus time is read on the server clock (`isBonusTime(realNow())`).

**Master:** `raidEnemy` regenerated in place (1067 rows changed, only `luxAttack`/`luxSuppress`; backup `D:\Progetto_Restauro_KH_UX	mp
aid_lux_backup`): **needs a master revision bump** before the client sees it.

<a id="missions"></a>
## Missions (3 November 2026, tests only)

Mission rows that count raids, by original text: Beginner 1023 «Defeat Raid Boss x 3», 1024 «x 10» (conditionId 3); Daily 2007 «Defeat a total of 1 Raid Bosses» (3); Weekly 3001-3003 and 3011-3013 «Defeat a party total of 10 / 50 / 150 Raid Bosses» (6). `MISSION_COUNTER` already mapped 3 and 6 to the counter `raid`, but nothing fed it. Now `routes-raid.js` calls `onDefeat` once per boss defeated (victory at `/raid/clear`, never on a repeat clear) and `server.js` adds 1 to `raid`. Solo, the party total is the player's own. No master row asks for raid participation or damage. The raid event quests themselves already count as quests at `/stage/clear`. The VIP benefit still needs the Union Cross weeklies.

## AP 0 campaign (3 November 2026, benched on rev 237 / resources 97)

Original rule (official notices 2019-2020): raid event quests cost 0 AP in the daily bonus hours, 5 AP all day Saturday and Sunday, 90 AP on weekdays. The server has charged this since Task 6 (`questApAt`); the client's own display of «AP 0» needs a campaign. The client computes a quest's shown AP from the master `useAp` and the active `evCampaign` rows of type 7 (power 0 = AP 0), and it reads «active» only from the id list the server sends: the row's times and weekdays are not checked. With an active AP campaign it shows a yellow balloon (`StartDeckEdit2_Announce`, `Camp_Balloon1`, text = `displayText`, fade loop) on the quest top, the raid list and the deck screens, and the blue AP plate (`img/ui/World_Stage_AP2.png` with the pulsing `Cursor_Anim_AP` armature) where AP is 0.

- **Rows** (`server/make-ev-campaign.js`, run by `make-game-tables.js` after `make-raid.js`): type 7, power 0, `displayText` «Bonus Time: Raids cost 0 AP!», stageType 2 (explicit stage ids, 5 per row), ids 98000+. Today 344 raid quest stages → 69 rows. The 2016 master has a «0 AP» row of stageType 4 (every event stage); not used, as it would also take the Special tab's quests. Value formats as the 2016 rows (time strings, week flags 1, groupPattern 0, validMinute 0).
- **Served:** the ids of those rows (from the served `evCampaign`) in `campaigns` of GET `/campaign` (143), `/stage/start` and `/raid/start`, only in the bonus hours and only when a raid quest of the player's week then costs 0 AP (`questApAt`: weeks before 2019-07-15 with a `5 / 90` rule get none). Otherwise `[]`, as before. `/multi/start` keeps `[]` (Union Cross has no raid quests). The AP charge is unchanged.
- **Bench switch:** `server/save/raid_ap0.json` `{"force": true}` lists the ids at any hour while the file is younger than 2 hours (same reader as `raid_smoke.json`). Display only: outside the bonus hours the quest still costs 90 (or 5) at `/stage/start`, so the AP shown and the AP charged differ while it is on.
- **Unproven, for the bench:** which route feeds the client's active list (GET `/campaign` is the likely one); whether the blue plate shows on the event quest list (the code path was seen only on the raid boss, `Area_AP`); whether the 0 shown at the quest list comes from the campaign or from `/stage/event` `stages[].useAp` (already 0 in bonus time). The resources are all served by the WW data except `img/ui/World_Stage_AP2.png` (JP 4.3.1 and the 2016 bundle).
- **Bench 3 November (rev 237, resources 97, save `raid2`, switch on):** the raid event quest panel shows «AP 0» and the yellow balloon under Begin, fading in and out (original loop). The client calls GET `/campaign` before the list opens, and that is the only route sending the ids then, so it is the one that feeds the active list. The first text «Raid Event quests cost 0 AP during Bonus Time!» was cut at the balloon's width after «0 AP»: shortened to «Bonus Time: Raids cost 0 AP!» (rev 238). The quest top, the raid boss list (Behemoth Ω, «AP 0» on its first attempt) and the Select a Keyblade popup showed neither the balloon nor the blue plate: where the blue plate shows is still unseen.
- **Weekend 5 AP** stays server-only for now: a type 7 row with power about 556 (90 × 556 / 10000 = 5) would show it, but the client's rounding is not read.

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

## Bench smoke rev 236

Master rev 236, resources 96, save `raid2` (maxpower party), 2 November. Every model with an available entry was forced with `save/raid_smoke.json` (lowest tier) and taken to the fight: **42 models tried, 42 load, 0 crashes** (no tombstone). This includes the 19 never benched before: Queen Bee `0015`, Queen Bee Ω `0016`, Lion Headliner `1005` (crashed at rev 233, fixed by the rev 235 revisions), Scourge Spider `9101` and the 15 reconstructed bosses `0018`-`0028`, `0030`-`0032`, `1011`.

Part bars (counted about 1 s after the first HUD frame; the first frame never shows them) match the expected count (weak points minus the body) wherever the screen was not covered: Queen Bee and Queen Bee Ω 1, Lion Headliner 2, Wicked and Malicious Spider 4, every reconstructed boss as its template (Assault Dragon, Adventurer, Gear Golem, Heartless Tsum, Greedy Grouch, Mysterious Sir 2; Jewel Princess 4; Closehanded Captain 3; the seven on the Behemoth or Queen Bee template 1). On some 2016 bosses a Special cut-in hid part of the screen, so fewer bars were seen there (none more than expected). One extra: Darkside (`0001`) shows one bar on its hand although `raid_models.json` lists no slots for it; it loads, so harmless.

Seen on the way: the RAID BOSS ALERT card of Assault Dragon shows the layout's default Darkside picture (no list banner for `0018`). The per-model table and screenshots stay in the private bench folder (`tmp/raid_p2`, `SMOKE2.md`).
## evStage rows and the client's master (4 Nov 2026, Task 10)

- **A master table that breaks the schema is not served at all.** The server checks every table against `recon/out/master_types_ww431.json` and drops the whole
  table when one row is out of schema (the log prints `[master] <table>: N errori ... non la servo` and `!!! MASTER: N tabelle scartate dallo schema`). The client then
  keeps its old copy of that table, with no error on the device. Task 10 had a 7-stage evStage row (the daily Showdown of Dec 2016, `stageId` is `int[5]`): the whole
  `evStage` table was dropped, the client never received the new event ids, and the Events list crashed on the first event id it could not
  find in its evStage table (crash details in the private notes). It looked like a data bug in the entry for
  an hour of bisecting (ids, banner, stage row, reward types, number of tiers were all innocent). **After every `make-game-tables.js` read the `[master]` lines of the
  server log and expect `106 tabelle valide` and no `evStage` line.**
- `make-raid.js` `evStageRow` keeps at most 5 stage ids (`EVSTAGE_MAX_STAGES`) and the full range in `stageStartId` / `stageEndId`; `/stage/event` lists the stages itself.
  Test `evstage_row_fits_schema`.
- Bench of Task 10 (rev 257): story Q260 shows Queen Bee (AP 15, objectives Moogle 5★ / Chip 3★ / Dale 3★, Raid Boards); story Q560 with `-RealNow` on a Saturday shows the
  weekend event «Legendary Raid Level: Don't Go Alone! (March)» (AP 1) and on a Wednesday only the monthly «Lure a Queen Bee» (AP 0). The 62 event raids have no card of their
  own yet (generic «Raid Time!» plate).

## Play package rehearsal (5 November 2026, Task 12 step 5)

Package `build 103` (master revision 268, resources 103, built with `make-play-package.ps1 -Resources 103 -Revision 268`). The raid tables
and images ship with the server copy (`server/game_data/raids.json`, `raid_models.json`, `raid_maps.json`, `raid_notices.json`, `raid_img/`,
`server/raid_config.json`); they are git-ignored and generated, so they must exist in the working tree before building.
`test-package-layout.ps1` now checks them. Rehearsed on instance 1 with a new data folder: full download, home, Notices with
«Raid Bosses», Events tab with the RAID CATALOG banner, a kept raid and the weekly raid, the weekly raid's Eggcognito quest started and
given up, Raid Boards list with the cards; guest server `106 tabelle valide`, no crash. Not checked in the package: a raid boss fight to the end.
