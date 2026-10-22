# Medal skills (I-146) — design

Status: draft of 18-10-2026, to be approved. It comes **before** sub-project 2c «Notice promises» (user
decision of 18-10: the max-level skills promised by the banners, G1/G2 of the audit, are given only after this
work). Sources: research of 18-10 (below), [medaglie.md#skill](../../notes/medaglie.md#skill) (Overwrite I-088),
[shop.md#garanzie](../../notes/shop.md#garanzie).

## 1. Goal

Medal skills (passive abilities: Attack Boost, Defense Boost, Second Chance, Lux+, ...) work
**as in the original**, in all three parts requested by the user:

1. **Medal details**: every medal shows the skill it really has, with level and EXP.
2. **Growth**: the skill levels up by using the medal in battle and with Level Up (Overwrite Skill).
3. **Effect in battle**: the skill triggers with its probability and has its effect (damage x1.2, hit
   survived, poison, ...).

It is also needed for 2c: the banners that promise «a powerful skill at max skill level» must be able to give the real skill.

## 2. Constraints

- Original client not modified: master, server responses, downloadable resources are changed.
- Repo: only our own code and documentation; derived tables stay in `server/master_data/` like the others.
- The rows of `skill.json` must have **exactly** the 35 fields of 4.3.1
  (`recon/out/master_types_ww431.json`), otherwise `masterTables()` does not serve the table.
- Every reconstructed (non-original) data item must be **declared in the Notices** in English (user rule).
- After the master change: revision raised in the 4 session scripts + `relogin.ps1`.

## 3. User decisions (18-10)

1. Skills are done in **all three parts**, as in the original.
2. The **138 missing skills are reconstructed from the wiki** (we do not limit ourselves to the 25 real ones).
3. The **medals already in the save stay without a skill**.
4. Every difference or reconstruction is declared in the Notices.

## 4. What exists today (research of 18-10)

- `server/master_data/skill.json`: 12 rows (1100-1111), from the `skill` file of APK 5.0.1 (`import-master.js`).
- thethiny's server project (`D:\Progetto_Restauro_KH_UX\external\thethiny_2026-10-13\KHUx-Server\data\`):
  `skill.json` with **25 real rows** (1100-1126; the 13 new ones: ATK Boost II & Lux Plus, Attack Boost III, Second
  Chance, ATK Prize+ & ATK Boost II, Attack Boost II Max, Defense Boost III, Poison+, Paralysis+, Sleep+, ATK Boost
  III & Lux Plus, SP Attack Gauge I/II, Attack Boost III Max), old layout without `value1`, `burstLock`,
  `pvpConditionTurn`, `pvpConditionCount`; **real** `skillExp.json` with 4 rows
  (`{1:[30,12132,13500], 2:[30,15184,14000], 3:[30,13000,11500], 4:[30,25000,18000]}`). Our `skillExp` (3
  rows) is invented.
- Local wiki `D:\Progetto_Restauro_KH_UX\wiki\wiki_all.json`, page «Medal», section `===List of Skills===`:
  **163 skills** with EN name, JP/kana name, max LV, max activation probability (%) and description.
  No IDs or numeric fields. Linked pages: «Skill EXP», «Skill Quests», «Template:SkillIcon».
- Skill icons: `<ref_work>\bundle2016\files\img\skill` (local reference data).
- No other table in dumps, IPA 4.3.1/4.4.0, OBB, 4.3.1 assets, JP data (searched on 18-10).
- The client downloads `skill` and `skillExp` from the server (`/system/master` -> `/master/<nome>`): adding rows to the
  master is enough for the client to know them.
- Save: `player.medalSkills[userMedalId] = {userSkillId, skillId, level, exp, getDatetime}`;
  `userMedal.userSkills` has only the ids (at most 2); the full `userSkills` list must always be sent (an id
  without an object crashes the client).
- Skill sources already in the masters: `stage.clearGetAssignSkill*`, `reward.assignSkill*`, `drawMedalType.addSkill*`,
  `colosseum.stageRewardSkill*`, `loginBonus`, `mission`, `moogleshop`, `serialcodeReward`, `raidReward`,
  `evScoreReward`, `multiStage` (fields `*SkillType/Id/Lv`). Gacha: `gacha-data.SKILL_TABLES` (notices 50106 and 72415,
  skill at level 1), `maxSkill` of the banners (today only on the 12 skills present).
- `server/medal-skill.js`: Scrooge medals with a **guessed** skill by rarity; Level Up Overwrite (20% ->
  100% from medalMisc 121/122, same `categoryEvolve`), to be tested on the bench (I-088).
- Battle: the effects are calculated by the **client** from the master. Skill EXP after the battle **is not done**: `/stage/clear` carries no skill data,
  so the server must give it; the client has a skill level-up popup in the battle result.

## 5. What is done

### 5.1 Complete `skill` table (163 rows)

- The 25 real rows keep their numbers; to the 13 from thethiny the 4 missing fields are added with the values
  of the 4.3.1 siblings (e.g. `value1` 10000, `burstLock` 0, `pvp*` like `condition*`).
- The **138 reconstructed** from the wiki:
  - `name`, `description`, `maxLv` from the wiki;
  - power from the description (e.g. «Deals 2.6 times more damage» -> `attackUp` 26000; «Reduces damage by 70%» ->
    `damageCut` 3000; Lux/Prize/Money -> `luxUp`, `prizeHpUp`, ...);
  - `invokeProb`/`invokeProbPerLv` from the wiki's max probability and from `maxLv`, with the same step as the
    real siblings (the «Max» ones like Attack Boost II Max: high fixed probability);
  - the other fields (`invokeType`, `invokeShowTiming`, `expType`, `categoryEvolve`, `rank`, `thumbId`, ...) copied
    from the **closest real sibling** (same family: Attack Boost, Attack Boost All, Defense Boost, Second
    Chance, status ailment, SP Gauge, combos «& Lux», «& GA», ...);
  - `skillId` assigned by us after 1126, in blocks per family, in `sortId` order.
- The families without a real sibling (if there are any, e.g. Triple Threat, Nightmare Stun) are reconstructed from the
  description with the most similar activation type; the list goes in the generation report.
- Repeatable generator (`server/make-skill-table.js` or similar) that reads wiki + real rows and writes
  `master_data/skill.json`, with tests.

### 5.2 Real EXP curve

`skillExp` = the 4 real rows from thethiny (`expType` 1-4). The reconstructed rows use the sibling's `expType`.

### 5.3 Icons

The original icons are only 5 (`img/skill/Skill_Icon1-5.png`, `thumbId` 1-5: attack, defense, Lux/Prize, status
ailment, special); the 25 real rows use only these. The reconstructed ones take the sibling's `thumbId`: no
new resources (if an icon does not appear on the bench, it is added to the generated package with the bench stopped).

### 5.4 Skills in the medal details and sources

- The medal shows the skill from the save (`player.medalSkills`), always with the full `userSkills` list.
- The original sources give the skill as written in the masters (`*SkillType/Id/Lv`): end-of-quest
  rewards, quests, login bonus, Moogle Shop, codes, banners with skills (`SKILL_TABLES`, `maxSkill`), Scrooge.
- Scrooge: the guessed skill is revised with the complete table (source: wiki «Scrooge» and the medal pages)
  **only for new Scrooges**. The Scrooges already owned keep today's skill: at the migration the current result
  of `medal-skill.js` is written into `player.medalSkills` (Claude's choice, in the spirit of decision 3).
- The medals already saved stay without a skill (decision 3).
- Skills already saved (Overwrite, `SKILL_TABLES`) calculated on the invented curve: at the migration the **shown
  level is kept** and the `exp` is brought back to the threshold of that level on the real curve, capped at the maximum (Claude's
  choice).

### 5.5 Growth in battle

- At the end of the quest (`/stage/clear`) the server gives skill EXP to the deck medals that have a skill and sends back
  the updated skills (`userSkills`) in the response, so that the client shows «Skill Level Up».
- Amount of EXP: **original data**. Every enemy in the master has `exp` per level (array parallel to `baseLv`,
  like `lux`): Shadow/Soldier 1-5, Great/King Pretender 4-20 (the enemies of the skill quest «give a lot of EXP»,
  online sources: every enemy gives a hidden amount of skill EXP, the Pretenders much more). **The client does
  the sum by itself** and sends it in `/stage/clear` as `getPoint.exp` (log of 16-10: `"exp":20` with 17 enemies,
  16 Shadow 80001): the server uses that number.
- Who gets it: **every deck medal with a skill** (the client does not send which medals were used, so
  the original server could not know it). This is a deduction: it is declared in the Notices.
- Check: with the real curve, two runs of the skill quest must take a skill with a maximum of about 10 from
  LV 1 to LV 8 (wiki page «Skill EXP»); if it does not add up, the `skillExp` formula is re-read
  (`[30,12132,13500]` looks like base 30 and growth x1.2132, to be confirmed in the client).

### 5.6 Level Up / Overwrite Skill

The Overwrite of I-088 is completed on the whole table (same `categoryEvolve`, probability from the level, Scrooge
100%, level that carries over with the skill) and tested on the bench.

### 5.7 Effects in battle

They are calculated by the client. At least one skill per activation type is tested on the bench (damage, damage to all, defense,
Second Chance, status ailment, SP Gauge, Lux/Prize), with a medal that has the skill at max.

### 5.8 Notices

A notice in English that explains: skill table partly reconstructed from the wiki (which values are estimated),
skill EXP given to all deck medals with a skill. Important if it changes the game experience.

## 6. Outside this work

- The banner promises (max skills in the guarantees, G1/G2): sub-project 2c, which will use this table.
- The Skill Quests / «Get NEW SKILL!» events: special quests, not this work (their rewards will use the
  table when they exist).
- Traits (shuffleskill): they are something else (Moogle Shop, Trait Medal sub-project I-084).

## 7. What the builder decides

- How to read the wiki table and which similarity rules to use for the siblings (documented in the report).
- The `skillId` blocks and the `sortId`s.
- Which medals to use for the bench tests.

## 8. Done when

- `skill.json` with 163 valid rows served to the client, real `skillExp`; no crash in the medal screens.
- On the bench: details of a medal with a skill, «Skill Level Up» after a quest, Overwrite at Level Up, at least one
  effect per type seen in battle.
- Notice published; I-146 closed; area notes updated.
