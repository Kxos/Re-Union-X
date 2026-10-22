# Traits from fusion (part A of I-084): plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** two copies of the same medal fused together give a random trait among the 11 original ones, with the original
wheel, the choice of the trait to replace when the slots are full (Replace/Skip) and the resumption at login.

**Architecture:** a master script (`make-trait-groups.js`) fills in `medal.shuffleSkillGroupId` and completes
`shuffleskill`; a pure module (`server/medal-trait.js`) decides trait, slot and the queue of pending ones; `server.js` uses it
in the fusion (action 55), in the choice (action 57), at login and in the pet training (244). The original animations and
choice window come from the JP data with `import_jp_coco.py`.

**Tech Stack:** Node.js (server and master generators, tests with `assert`/`check`), Python 3 (import of the JP
resources), PowerShell (resource package and LDPlayer bench).

**Spec:** `docs/superpowers/specs/2026-10-19-trait-design.md` (read it first: rules, client contract,
«Choices made in review»).

## Global Constraints

- Traits of the fusion wheel = only these 11 (name, `category` for the icon `img/kakusei/Kakusei_Icon%04d`):
  Extra Attack: 40% Power (80), Ground Enemy DEF -60% (60), Aerial Enemy DEF -60% (61), STR +1000 (90),
  Damage in Raids +40% (70), DEF +2000 (100), Max Gauges +2 (10), Max HP +800 (20), Poison Resist 20% (30),
  Sleep Resist 20% (50), Paralysis Resist 20% (40). Uniform probability 1/11.
- The 5 traits of 4.1.0 (ids 3, 4, 5, 6, 7) and Max HP +300 (id 2) stay only in the Moogle Shop.
- Only one trait per fusion; same medal = same `name` of the `medal` row; base with `shuffleskillSlot` > 0.
- Slots: only `type` 1 traits count (the pet Special Trait, `type` 2, has a separate slot).
- `medalResumption`: `{userShuffleSkills: [pending[0]], resumptionStatus: 1}` with a non-empty queue, otherwise
  `{userShuffleSkills: [], resumptionStatus: 0}`; with status 1 the list is never empty.
- Never run `make-game-tables.js` alone (it shrinks the master): the master steps are downstream scripts,
  idempotent, like `make-nova-rows.js`. Every master change: revision +1 in the 4 session scripts
  (`tools/ldplayer/session/{cycle,relogin,run-server,update-resources}.ps1`).
- Every deviation from the original goes in the Notices (`server/routes-info-album.js`, notice «Medal skills» or
  «Differences from the original game»).
- Commit and push at every valid task; messages in Italian with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  git with `-c safe.directory=D:/Progetto_Restauro_KH_UX/Android/KH-UX-Dark-Road-Restoration`.

## Review Focus

- Fusion with SEVERAL identical copies: only one trait (not one per copy), dots per copy as today.
- Base without slots (`shuffleskillSlot` 0, support/EXP/Boost): no trait, no wheel, no error.
- Identical copies with a different rarity (6★ on 7★ of the same medal) and boosted: trait given.
- Pending left open and a new fusion before the choice (app closed): queue, login offers the first one again.
- Pet training with a fusion pending in the queue: 244 must not reset it.

---

### Task 1: master, trait groups and wheel rows

**Files:**
- Create: `server/make-trait-groups.js`
- Create: `server/test-trait-groups.js`
- Modify: `HANDOFF.md` (generation sequence: after `make-nova-rows.js`)

**Interfaces:**
- Produces: `medal.json` with `shuffleSkillGroupId` != 0 for every attack row with `shuffleskillSlot` > 0, equal
  across rows of the same `name` (value = lowest `medalId` of the family); `shuffleskill.json` with 4 new
  `type` 1 rows (id 14 Max HP +800 cat 20, 15 Poison Resist 20% cat 30, 16 Sleep Resist 20% cat 50,
  17 Paralysis Resist 20% cat 40; effect fields copied from the pet rows 1024, 1029, 1032, 1035);
  `rate` 100 on the 11 of the wheel, `rate` 0 on 2-7 (the client's wheel shows the `type` 1 rows with `rate` != 0).
  Exports `FUSION_TRAIT_IDS = [10, 8, 9, 11, 12, 13, 1, 14, 15, 16, 17]`.

- [ ] **Step 1: test** `server/test-trait-groups.js` on the generated master: no row with slot > 0 and
  `shuffleSkillGroupId` 0; «Supernova - Sephiroth» and its boosted/variants in the same group; «SN - X» and «SN+ - X»
  different groups; rows 14-17 present with `type` 1 and exact names («Max HP +800», «Poison Resist 20%%», «Sleep
  Resist 20%%», «Paralysis Resist 20%%»: the master doubles the %); `rate` > 0 exactly on the 11 of
  `FUSION_TRAIT_IDS`; second run of the script = identical file (idempotent).
- [ ] **Step 2:** `node server/test-trait-groups.js` -> FAIL (script absent).
- [ ] **Step 3:** write `make-trait-groups.js` (reads and rewrites `server/master_data/medal.json` and
  `shuffleskill.json`, prints the summary like `make-nova-rows.js`).
- [ ] **Step 4:** `node server/make-trait-groups.js && node server/test-trait-groups.js` -> `OK`; then
  `node server/test-medal-enhance.js` and `node server/test-gacha-server.js` -> OK. Verify that
  `make-pet-tables.js` and `make-moogleshop.js` do not undo the step (if they rewrite `shuffleskill.json`,
  `make-trait-groups.js` goes after them: note it in HANDOFF).
- [ ] **Step 5:** master revision +1 in the 4 scripts; commit «trait: trait groups and wheel rows (A1)».

### Task 2: module `medal-trait.js`

**Files:**
- Create: `server/medal-trait.js`
- Create: `server/test-medal-trait.js`

**Interfaces:**
- Consumes: `FUSION_TRAIT_IDS` (Task 1, copied as a constant or read from the script).
- Produces:
  - `gainsTrait(baseRow, compRows) -> boolean`: base with `shuffleskillSlot` > 0 and at least one material with
    equal `shuffleSkillGroupId` and != 0.
  - `rollTrait(rng) -> shuffleSkillId` uniform over `FUSION_TRAIT_IDS`.
  - `addTrait(list, slots, isSpecial, trait) -> {list, pending}`: `list` = traits of the medal (`[{userShuffleSkillId,
    shuffleSkillId, type, getDatetime}]`), `isSpecial(id)` true for the `type` 2 ones; if the normal traits are < `slots`
    it appends at the end (`pending` null), otherwise list unchanged and `pending` = the trait.
  - `resolvePending(list, pending, removeId) -> list`: `removeId` = `userShuffleSkillId` to remove; the pending one
    takes its position; `removeId` == `pending.userShuffleSkillId` (Skip) -> list unchanged.
  - `resumption(queue) -> {userShuffleSkills, resumptionStatus}` according to the Global Constraints.

- [ ] **Step 1: test** `server/test-medal-trait.js`: `gainsTrait` true with a copy and with a different rarity of the same
  group, false with slot 0, with group 0, with a different medal; `rollTrait` over 11,000 rolls: every id between 800 and 1,200,
  no id outside the list; `addTrait` with 2/3 slots -> at the end, with 3/3 -> pending and identical list; the Special Trait
  does not take a slot; `resolvePending` Replace on the second row -> new one in second position, order of the others
  unchanged; Skip -> unchanged; `resumption([])` and `resumption([p, q])` -> `[p]` status 1.
- [ ] **Step 2:** `node server/test-medal-trait.js` -> FAIL.
- [ ] **Step 3:** implement (pure functions, no access to `player`).
- [ ] **Step 4:** test -> `OK: medal-trait`.
- [ ] **Step 5:** commit «trait: medal-trait module (A2)».

### Task 3: fusion (action 55)

**Files:**
- Modify: `server/server.js` (`respondMedalEnhance`, `medalTraits` / saving of the traits)
- Modify: `server/test-medal-enhance.js` (new cases)

**Interfaces:**
- Consumes: Task 2.
- Produces: save `player.traitPending = [{userShuffleSkillId, shuffleSkillId, type: 1, getDatetime,
  userMedalId}]` (queue); `player.medalTraits[userMedalId]` as today; `player.nextShuffleSkillId` like the Moogle Shop.

- [ ] **Step 1: test** in `test-medal-enhance.js`: base with 1 free slot + one copy -> `afterEnhanceUserMedal.
  userShuffleSkills` has one more element at the end with `shuffleSkillId` in `FUSION_TRAIT_IDS` and
  `medalResumption` `{[],0}`; with 3 copies -> only one more trait; base with full slots -> list unchanged,
  `medalResumption.resumptionStatus` 1 with one element, `player.traitPending` of length 1; material of another
  medal -> no trait; base `shuffleskillSlot` 0 -> no trait; Mickey & Brooms -> no trait.
- [ ] **Step 2:** `node server/test-medal-enhance.js` -> FAIL on the new cases.
- [ ] **Step 3:** in `respondMedalEnhance`, after `applyEnhance`: `gainsTrait` -> `rollTrait` -> `addTrait`; new
  id from `player.nextShuffleSkillId`; pending in the queue; `medalResumption` = `resumption(player.traitPending)`;
  log «[level up] trait ...». The traits of the consumed materials are deleted from `player.medalTraits`.
- [ ] **Step 4:** test -> `OK`; all `server/test-*.js` (except `test-medal-guilt.js`, which wants a path) OK.
- [ ] **Step 5:** commit «trait: traits from the fusion of identical copies (A3)».

### Task 4: choice (action 57), login and pet training

**Files:**
- Modify: `server/server.js` (routing `/user/medal/shuffleskill` -> `respondMedalShuffleSkill`, `respondUser`)
- Modify: `server/pet.js` (response of the training POST)
- Create: `server/test-trait-choice.js`

**Interfaces:**
- Consumes: Task 2, Task 3 (`player.traitPending`).
- Produces: `respondMedalShuffleSkill(res, body)`; response `{ret, userMedal: userMedalElement(base), medalResumption}`.

- [ ] **Step 1: test** `server/test-trait-choice.js` (same scheme as `test-medal-enhance.js`, temporary
  save): Replace `{userMedalId, userShuffleSkillId: <esistente>, enableUserShuffleSkillId: <pending>}` ->
  trait replaced in the same position, queue empty, status 0; Skip `{userShuffleSkillId: <pending>,
  enableUserShuffleSkillId: 0}` -> list unchanged, queue empty; body with unknown ids -> no change,
  valid response with the current queue; two pending -> after the first choice status 1 with the second; `respondUser` with
  a non-empty queue -> `userData.medalResumption.resumptionStatus` 1; pet training with a non-empty queue ->
  `medalResumption` equal to the queue (not `{[],0}`).
- [ ] **Step 2:** test -> FAIL.
- [ ] **Step 3:** implement; in `pet.js` use `ctx.medalResumption()` (new context function) instead
  of the fixed value.
- [ ] **Step 4:** test -> `OK`; full suite OK.
- [ ] **Step 5:** commit «trait: choice of the trait to replace, login and training (A4)».

### Task 5: original resources from the JP data

**Files:**
- Modify: `recon/tools/import_jp_coco.py` (list `JP_LWF` and layouts/textures)
- Modify: `recon/tools/make_pet_training_fx.py` (our Kakusei_Get1/Get2 only as a fallback, as I-163)
- Modify: `tools/ldplayer/session/build-resources.ps1` if needed
- Doc: `docs/notes/medaglie.md#trait-medal`

**Interfaces:**
- Produces: in the resource package (new revision, 45) the original JP `lwf/medal/Kakusei/Kakusei_Get1`, `Kakusei_Get2`,
  `cocostudio/publish/MedalInfo_SkillChangeWindow.json`, `Kakusei_New.png`, `Kakusei_Get_Eff.png`.

- [ ] **Step 1:** list the textures referenced by `MedalInfo_SkillChangeWindow.json` and by the two JP LWFs and
  verify that each exists in the package or in the JP data (source by exact name, as I-163); Japanese texts
  of the layout -> WW texts of the client (search in `layouts/ui_texts` and `ui_text_ids.tsv`: «Choose a trait to
  replace.», «Skip», «Replace %s with %s?»).
- [ ] **Step 2:** import and `build-resources.ps1`, then `update-resources.ps1`; no missing file in the report.
- [ ] **Step 3:** commit «trait: original animations and choice window (A5)».

### Task 6: Notices, documentation and bench

**Files:**
- Modify: `server/routes-info-album.js` (notice «Medal skills» or «Differences»), `server/test-notices.js`
- Modify: `docs/notes/medaglie.md`, `docs/ISSUES.md` (I-084: part A done), `docs/journal/2026-10-19.md`, `HANDOFF.md`

- [ ] **Step 1: test** in `test-notices.js`: the notice contains «Fusing two copies of the same Medal gives it a
  random trait», «each of the 11 traits has the same chance» and «only from the Moogle Shop» for the 5 new traits.
- [ ] **Step 2:** text, tests OK, commit.
- [ ] **Step 3: bench** (with the user watching): two identical copies -> original wheel and trait in the list; full
  slots -> popup «Choose a trait to replace», Replace and Skip; close the game before choosing -> popup at
  login; fusion of three copies -> only one trait. Frames compared with
  `reference/trait_medals/video_Z_JRaJF7GbQ/`.
- [ ] **Step 4:** docs updated, commit and push.
