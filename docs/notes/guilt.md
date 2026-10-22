<a id="guilt"></a>
# Guilt and Level Up with special medals (I-079, I-080)

Analysis of 12 October 2026 (agent): sources in `reference\guilt` (user's guide p.16/20/21, khuxwiki). Rules, client fields (`attackUpperNumber`, `defenseUpperNumber`, `burstUpperNumber`, `upperCost`, `guiltFactor` of userMedal; `POST /user/medal/enhance` action 55; table `guiltProb`) and rules in `server/medal-guilt.js`. Brooms = Magic Broom (5*, Evolve material), Mickey & Brooms = Fantasia Mickey B (6*, type 8): previously missing from the master (make-game-tables.js discarded the Roboloid rows without an attribute).

<a id="stato"></a>
## Status (12 October 2026): wired up; VERIFIED on the bench (closed 22 October 2026)

Verified on the bench on 12-10 (I-083 and I-085 in [ISSUES](../ISSUES.md): dots, guilt unlock and reroll,
Chip/Dale/Cid with their caps, Magic Broom and Fantasia Mickey B) and on 19-10 ([below](#banco-1910),
[journal](../journal/2026-10-19.md)); I-079 and I-080 closed on 22-10.

The plan below is applied. Tests without the client:
- `node server/test-medal-guilt.js <repo>\server`: rules of the module.
- `node server/test-medal-enhance.js [cartella master]`: `respondMedalEnhance` of server.js on a
  temporary save (`KHUX_SAVE` in temp, the real save is not touched). It needs a regenerated
  master (with an empty `guiltProb` it stops with «rigenerare il master»). Result on a regenerated
  copy in the scratchpad: OK (Black Coat King Mickey 6★ tier 3: 5 copies -> 5 dots; without
  Quest 34 no guilt; with Quest 34 guilt 9200 and Burst +1; Mirror x2 +200; Chip x10 / Dale / Cid
  10 x3 -> STR +1000, DEF +150, cost -20; guilt 10000 -> Burst +5; Mickey & Brooms 2 -> 3 dots).

The master must be regenerated (`$env:KHUX_MEDALS_ALL='1'; $env:KHUX_WORLDTOUR='1'; node
server\make-game-tables.js D:\Progetto_Restauro_KH_UX\wiki\medals.json`) and the revision raised.
Differences from the previous master (tried on a copy): `medal` +300948, +300913, 1,517
`minCost` (6★/7★), 90085 evolvable; `burst` 1,677 rows with `maxEnhanceCount` and powers per
dot; `guiltProb` 655 rows. Pre-existing side effect of the pipeline: medal 2
(Burst, `make-guilt-burst.js`) is copied again from 1 and takes image 90000 (before 90041).

## 1. make-game-tables.js (tables) - done

- With `KHUX_MEDALS_ALL=1`: `extraMedalRows` adds 300948 Magic Broom (copy of Fantasia Mickey A,
  type 6, 5★) and 300913 Fantasia Mickey B (copy of Magic Mirror, type 8, 6★); 90085 becomes
  evolvable: 5 Magic Broom -> 300913 (`validEvolveNeed` 5).
- Cid (khuxwiki «max 20 reductions from 2.0.0»): attack medals 6★/7★ with `cost - minCost` = 10
  -> `minCost = cost - 20` (e.g. 46/26). Medal 1 (Stock Medal, images 90000) untouched.
- `burstDotFixes`: `maxEnhanceCount` per rarity (3★ 1, 4★ 2, 5★ 3, 6★/7★ 5) on the bursts that
  had fewer (Roboloid 0, thethiny's 6★ 4). The powers per dot (`basePowerPerEnforce`,
  `displayPowerPerEnforce`, absolute values) are recomputed from the row's power with the
  `tierPower` rule (+300, +900, +1800, +3000, +4500): those copied from the template belonged to another
  medal (Roboloid: 68300 base, 15000 per dot) or were 1 beyond the old maximum. The +300 per
  dot is a hypothesis (real rows 10363/10364).
- `guiltProb.json`: `guiltProbRows()` (khuxwiki ranges per tier, one value every 1%, weight
  100, `isCampaign` 0).

The Roboloid rows start again from the template row; `burstEnhanceCategory`/`groupId` are 0 everywhere:
dots only with identical copies (medalId) or Mickey & Brooms, as on the wiki.

## 2. server.js - done

- `userMedalElement`: `attackUpperNumber`, `defenseUpperNumber`, `burstUpperNumber`, `upperCost`
  (= -Cid reduction, see below), `guiltFactor` (hundredths of a %, 10000 = +100%) from `medalState` (merged in `userMedalList()`; the Evolve
  with `setMedalState({medalId, level, exp})` keeps them).
- `respondMedalEnhance`: after the EXP, `medalGuilt.applyEnhance(row, base, materiali, {burstRow,
  guiltProb, isGuilt: isGuiltUnlocked()})`; the state goes into `medalState` and into
  `afterEnhanceUserMedal`. Log: `pallini a->b, guilt a->b (tiri ...), STR +, DEF +, costo -`.
- `guiltBurstFirstLv/MaxLv` = TARGET level of the «NOVA LEVEL UP!» popup (`guiltBurst().gained()`): the client
  shows «LV <its own level> » LV <field>», so first guilt =
  level after the +1, maximum guilt = level after the +5 as well, 0 = no popup (commit bad55f1: with the increase the
  bench showed «LV 6 » LV 1»). Popup on by default since sub-project 2b (JP LWF
  `GuiltBonus_BurstLvup(_num)`, `GuiltBonus_Wfix0..9`, layout `MedalInfo_Burst_Info.json`, «NOVA» logo from
  `make_nova_logo.py`, resources 41); `KHUX_GUILT_BURST_POPUP=0` turns it off. Registry key: `groupId ||
  medalId` (a boosted medal and its normal one count once, U7 tried on the bench).
- Draws (`respondGachaDraw`, sub-project 2b): guilt and dots only from a banner preset, plus the original
  rule for the 7★ of Tier 9-10 (decision 13-bis, `gacha-data.MAX_GUILT_FROM`): dots and guilt at the Tier
  maximum, boosted included, for Tier 9 from banners dated from 2019-01-01 (notice 48236) and Tier 10 from 2019-09-01
  (notice 56838); before that only with the preset ([shop.md#sp2b](shop.md#sp2b)).
- `userDetail.isGuilt = isGuiltUnlocked()`: quest number >= 34 (Power Bangle; `stageNumber` of
  `lastClearStageId`), or always 1 with `KHUX_GUILT_BURST_LV` > 0 (Burst tests). The client
  allows unlock/reroll and Magic Mirror only with `isGuilt`; the
  Burst button stays hidden while `guiltBurstLv` is 0. The support row
  (`supportUsers`, isGuilt 0) does not change.
- `module.exports._test`: functions for `test-medal-enhance.js`.

- Dot overflow (bench 18-10, Vexen [+] 2 dots + two copies with 1: the client showed the unlock
  with «00%», the server had lost the overflow): the client preview adds
  1 + dots of each copy; if base dots + sum > maximum (strict) it shows the unlock
  and the copy that overflows is the last selectable one. With guilt > 0 only one copy
  (reroll, «Bonus range» popup); guilt at maximum: the copy rolls a trait. The guilt
  of the copy is not used; only one roll per fusion. The result shows only the
  guiltFactor of the response. `applyEnhance` follows this rule; bench case in `test-medal-guilt.js`.
- <a id="banco-1910"></a>**Tried on the bench on 19-10** (rev 128, resources 43, server with `-GachaShow B0280`):
  Vexen [+] 2865 shows a yellow «+201%» in Medal List and detail. Reroll: 2865 (5 dots, 20100) + copy with
  2 dots -> popup «Attempt to raise special attack bonus from +201%? Bonus range +150 - 230%. Outcome won't
  lower current bonus %.», roll 19300 < 20100, guilt stays 201% (correct). Unlock by overflow: copy with 3
  dots + copy with 2 (3 + 1 + 2 = 6 > 5) -> no popup, result ●●●○○ -> ●●●●● and line «Special Attack
  +171%», server 17100: preview and result match. Both fusions with `isGreatSuccess` 1 from the
  client (EXP x1.5: 34,222 -> 51,333, the preview shows the EXP without the Great Success).
- <a id="lwf-originali"></a>**Original animations (19-10, resources 44)**: `lwf/medal/guilt_bonus/GuiltBonus` (unlock/reroll),
  `GuiltBonus_result`, `GuiltBonus_max` (guilt at maximum, «MAX» logo) and the digits `GuiltBonus_Yfix0-9`/`Rfix0-9`
  were OURS (`make_guilt_bonus_lwf.py`, now only a fallback); the originals are in the JP 4.3.1 data (local reference data)
  and `import_jp_raisedraw.py` imports them into the raisedraw_gen pack. The JP export saves a shared
  texture only in the first folder that uses it: source by exact original NAME + declared dimensions
  (`name_index`/`by_name`, guilt folders only, never «ビットマップ N»): yellow digits of Yfix and _result from
  `GuiltBonus`, KeyBlade_ef1/ef2 from other JP LWFs, KeyBlade_ef6/ef8/star01 from the WW LWF
  `lwf/battleresult/Result_LuxLevelUp`. Only substitute: `png_logo_guilt_bonus2.png` (336x35, in _result and _max,
  missing from JP) = `png_logo_guilt_bonus.png` (same «GUILT BONUS» logo, same dimensions); since 19-10 (I-170) it is
  replaced by the original English «SPECIAL ATTACK BONUS» of the 2016 pack (455x35 in the declared space 336x35,
  as in the 2016 LWF; `recon/tools/originals.tsv`); report in `raisedraw_gen\raisedraw_report.json` (classes name-jp, name-ww, substitute). Copy
  of our removed LWFs: `D:\Progetto_Restauro_KH_UX\tmp\guilt_ours_backup`.

## 3. guilt-burst.js - done

First guilt = a copy with `guiltFactor > 0`; maximum guilt = `guiltFactor >= guiltRange(guiltProb,
guiltValue).max`. The `player.guiltBurst` registry never goes down: the medalIds registered with the previous
rules (ownership, maximum level) remain, so an existing save does not lose levels (the
bench save has 1,908 registered medals: Burst 1,908, the +1/+5 increase is not visible from the
button, only from `guiltBurstLv` in the logs).

## 4. Bench checks (all verified: 12-10 in I-083, 19-10 in [banco-1910](#banco-1910))
- Medal List: the new rows 300948/300913 appear (grant-all-medals picks them up: `sell` > 0) and
  type 8 does not break sorting/filters.
- Level Up preview: Chip/Dale/Cid/Mirror selectable, «+STR/+DEF/COST» and «Bonus range +40 - 100%»
  (texts 101300036/101300043-45), result with effects 7 (dot/unlock) and 8 (guilt up)
  (each plays a guilt LWF: check that the LWFs are served).
- STR in the detail = STR of the level + attackUpperNumber.
- Cost (bench rev. 95: Cid 90076 = -1 as on the khuxwiki, but «Cost 46» unchanged): `upperCost` is
  a signed int, the change of the cost (negative for Cid): the client's effective cost is
  **cost + upperCost**, used for the deck cost
  sum, sorting, Optimize, the Level Up preview limit and effect 6 of the result. The server sent +1
  (effective cost 47): now `userMedalElement` sends `-medalState.upperCost` (fix of 12-10, after rev. 95).
  The medal detail instead prints the master's `cost` unchanged: there 46 stays 46 in the original 4.3.1
  as well.
- The server result matches the client preview (dots, guilt unlock): if the
  client computes differently (e.g. guilt with `isGuilt` 0) the detail after the fusion shows it.
