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
  the 3-minute weak point rule is the server's too. To confirm on the bench.
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

Missing in the WW data, present in JP 4.3.1: `AdvRaidListScene_ver320`, `Adv_Raid_Boss_List_ver320`, `Adv_Raid_Boss_Block_ver320`,
`Adv_Raid_Boss_Dialog_Entrant_ver104`, `Adv_Raid_Boss_Dialog_Result_ver104`, `Adv_Raid_Boss_List_Reward`, `AdventureTop2_RaidInfo2_Start`;
`lwf/character/raid` (68 ids), `lwf/raid/demo`, `lwf/raid/bg`, `lwf/raid/bossbtn`, `lwf/battleresult/Raid_Result`, 53 `raid_boss_*` images.

## Open, for the bench

`raidTimeStatus` values, whether a damaged bar and broken parts draw from `/raid/start`, `getPoint.raidPoint` with Eggcognito rows, the Give Up
path and a fight outlasting `timeLeft`, 0 in `subdueId` or `mvpId`, `isEntry`/`isRelief`/`reliefFlag`, the home button's widgets, what the Raid
button opens, fever.
