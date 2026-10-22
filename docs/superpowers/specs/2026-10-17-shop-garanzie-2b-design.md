# Shop, sub-project 2b: guarantees and medals as the banner gave them — design

Status: approved by the user on 17-10-2026 (with the golden number in the strip, 4.4, and the check of the LWFs of the
Nova popup, 4.6). It follows sub-project 2 (catalog of the original banners,
[shop-banner-design](2026-10-16-shop-banner-design.md) section 9) and closes I-144. Sources: audit of the guarantees of
17-10 (`D:\Progetto_Restauro_KH_UX\tmp\sp2\audit-guarantees.md`, summarized in
[shop.md#garanzie](../../notes/shop.md#garanzie)), user decisions
(`D:\Progetto_Restauro_KH_UX\tmp\sp2b\decisioni.md`), video of the original game
(`D:\Progetto_Restauro_KH_UX\tmp\sp2b\video-LFJ5.md`, frames in `reference\shop_boosted` and `reference\nova_lvup`).

## 1. Goal

Every draw gives the medals **as the original banner gave them**: the right slot for each guarantee, the promised
Tier, the pity on the written target, the «within N draws» counter going down in the strip, and the medals
**already strengthened** when the banner said so (guilt maxed, boosted, abilities at max level), with the
«NOVA LEVEL UP!» popup that follows.

## 2. Constraints

- Original client not modified: server responses, master, downloadable resources, WebView pages are changed.
- Repo: only our own code and documentation (derived data stay in `server/game_data/`, `server/master_data/`).
- No medal before its date (spec 9.3) nor above the promised Tier.
- Every difference from the original in the Notices, in English.
- Compatibility: `guarantee.list/count/slot` of sub-project 2 remain valid (first list reservation).

## 3. User decisions (17-10)

1. 6★ slot with lists that contain 7★-only Supernovas (~100 banners 2019-20): the 6★ slot chooses **only among the names
   with a 6★ variant**; the 7★ Supernovas stay in the 7★ slots.
2. B0733: **two lists** as in the image (3 SN+/SN++ and 7 KH III).
3. The 31 banners with «every Nth draw» in the notices: **stay pity** as in the wiki (it resets when the featured medal comes out).
4. B0419/B0421 (Gula/Aced swap declared by the notice): **corrected version**, the error cited in the Details.
5. B0319, B0402, B0403, B0412 (pity «one 6★ X» with slot 0 at 7★): the guaranteed 6★ replaces **the first 6★
   slot, otherwise a 5★**; the 7★ slot stays.
6. The pity resets when the featured medal comes out by itself (confirmed: today's behaviour; the user's memory of the
   strip).
7. Counter in the strip as in the original (point 4.4).
8. Boosted medals, preset guilt and abilities at max level: reproduced (point 4.5).
9. B0199-B0203 (HD [EX] deals, November 2017): start date **24/11/2017** from the notice, instead of the
   widened rule of `align_debut_dates`.

## 4. Components

### 4.1 Slot reservations (catalog)

New field `guarantee.slots[]`: the reservations in the order of the sentences of the notes, `{kind, slot, count, star, names,
tierMin, tierMax}`.

- `kind`: `list` (list or named medal, `names`), `tier` (`tierMin`/`tierMax`, optional alternative `names`),
  `trait` (slot reserved for a Trait Medal: generic for the server, but it does not go to the list).
- Recognized sentences (regex table in the audit, section 4): list («Guarantees N of the following [N★]
  Medals [at N★]»), named medal («Guarantees one [N★] X»), Tier («one [N★] Tier N [or higher|or lower|,
  N...]»), Trait, «SN+ or SN++», pity («If bought N times ... one [N★] X», «X is guaranteed within N draws»).
- Deterministic slot assignment: the reservations with a star take the first free slots of that star,
  then the others the first free ones from the top. Decision 1: in a `list` reservation on a slot of star S only
  the names with an S variant go in. Hand-written overrides (table in the generator, with the source) for the cases seen only
  in the images: B0678 (`count 1`), B0733 and B0740 (two lists), the uncoded lists (D5: B0049, B0055, B0372,
  B0695, B0721, B0725, B0726, B0734, B0739).
- Pity: `pityNames` (from the sentence; default `pool.featured`), `pityStar` (written star), `pitySlot` (slot of the
  reservation that contains `pityNames`, otherwise the first slot of `pityStar`, otherwise decision 5, otherwise 0).
  The pity gives the medal at a **fixed** star (`pityStar`, no star-up).
- Pity with a non-attack target (Moogle, Blue Fairy, Dual Meow Wow SAB 9, Trait): if the medal exists in the
  master (Dual Meow Wow) it goes to the Present Box like the bonuses; otherwise the pity is declared «not reproduced».
- Decision 4 (B0419/B0421) and 9 (B0199-B0203): overrides in the generator with the source.
- Expected outcomes (from the audit): B0306 slot 0 7★ Tier <= 4, slot 1 one of the 8 at 6★, pity HD Axel 7★ on slot 0;
  B0355 7★ Tier 3-4 + list at 6★; B0629 1 New Enemy 7★ + 3 KH III 6★; B0397 Prime - KH Cloud 6★ (7★ at the pity) +
  generic Trait slot; B0321 7★ Tier 4 + Prime Axel 6★ (7★ at the 5th).

### 4.2 Tier

- `medals[n].ids` -> `[id, rarity, date, tier]`, tier = `medal.json.guiltValue` (verified: the 24 medals
  «Tier 4 or lower» of B0306 all have 4).
- The `tier` slots filter the pool of their star by `tierMin <= tier <= tierMax`; empty pool -> no filter and
  log. 178 banners with a Tier limit.

### 4.3 Draw (server)

- `rollDraw` fills the slots from `guarantee.slots[]` (fallback to `list/count/slot` for the old catalogs), then
  the pity on `pitySlot`; a list slot replaced by the pity stays guaranteed only if the featured medal is in the list.
- `slotOdds`, Details and Draw Odds show each reservation on its slot (list, Tier, Trait), the pity with star and
  target.

### 4.4 Guarantee counter in the strip (original)

The client composes the strip under the banner from the master's `comment` as a printf format with
the plate's `userWarrantDisplayOfTime`; there are also `warrantNumberOfTime`/`warrantDisplayOfTime` in the master and
`warrantMedalIds` in the plate ([shop.md](../../notes/shop.md), GET /gacha/list).

- Banners with pity: `comment` with `%d` (e.g. «Featured Medal guaranteed within %d draws»; text to be aligned with that
  of the original if found), `warrantNumberOfTime` = pity, `userWarrantDisplayOfTime` = `pity - sinceFeatured`
  (5, 4, ... and 5 again when the featured medal comes out), `warrantMedalIds` = id of the featured medal.
- **The number of remaining draws in golden colour** (user request of 17-10, approval of the spec),
  to distinguish it from the rest of the text. Check in the client: if the strip accepts a colour markup (rich
  text tags, colour codes in the format), the number is written in gold with the markup; if not, a resource (font or
  layout of the strip) that allows it without touching the client is evaluated; if neither is possible, the user is told
  before choosing a fallback. Difference from the original to be declared in the Notices if the colour was not
  already golden in the original.
- To be verified on the bench how the client uses `warrantDisplayOfTime`/`warrantMedalIds` (check the client behaviour
  before the code). New master revision.

### 4.5 Medals strengthened at the draw

- **Preset guilt** («with ... Special Attack Bonus maxed», «SAB of N», «pre-strengthened», 104 banners): the
  medal is born with `guiltFactor` at the written value (maximum of its tier if «max»). Mapping sentence -> field
  (`guiltFactor` for the guilt/SAB, `burstUpperNumber` for the Special Attack level «strengthened N times»)
  to be confirmed in the research phase with [guilt.md](../../notes/guilt.md) and [medaglie.md](../../notes/medaglie.md).
  The Nova goes up with the rule already in `server/guilt-burst.js` (+1 first copy with guilt, +5 first one at max),
  as in the video (3306 -> 3307 -> 3312).
- **Boosted** (~40 banners, «boosted version ... with 1000 more base strength and defense»): STR +1000, DEF +1000,
  Cost -10 compared with the normal one (video: SN++ Master Eraqus 43802/14474/36 versus 42802/13474/46), values in
  yellow, «BOOSTED» band in the result, red LV tag in the list; Chip/Dale stay free (user). The
  band is drawn by the client: **check in the client** which field turns it on (player's medal or
  distinct medalId of the master) before choosing how to represent it. «Small chance» odds: reconstructed
  (proposal: 5% per eligible slot, declared «reconstructed»).
- **Abilities at max level** («with one of the following skills at max level», 62 banners): abilities of the
  list at `level = maxLv` of `skill.json`, only for the abilities present (12 today; the others I-146). Count of the
  fully covered banners in the report.

### 4.6 «NOVA LEVEL UP!» popup

Off today: our client lacks `lwf/medal/guilt_bonus/GuiltBonus_BurstLvup` and `GuiltBonus_BurstLvup_num`
(null LWF = crash; [battaglia.md](../../notes/battaglia.md)). **The two original LWFs exist in the JP 4.3.1 data**
(check of 17-10): `<jp_data>\lwf\medal\guilt_bonus\GuiltBonus_BurstLvup\` (`.lwf` + Burst_Arrow, Burst_LV_Logo «LEVEL UP!», Burst_Logo, Burst_Plate,
each also in a `_B` version) and `GuiltBonus_BurstLvup_num\` (Burst_LV_Mark); absent in the WW OBBs and in
versions 1.0.1-4.4.0 of the same collection. Difference: the JP logo says **«BURST»**, the WW one **«NOVA»**
(`reference\nova_lvup`, title «NOVA LEVEL UP!», «LV a » LV b», message «Maxed out X's Special Attack Bonus!»,
«TAP SCREEN»).

Plan: import the two JP LWFs into the generated package (like the other JP layouts, `import_jp_coco.py`/static
packages), replace `Burst_Logo`/`Burst_Logo_B` with a «NOVA» logo redone from the video frames (same format and
size, encoded like the originals with `btf.py`), verify that the clips expected by the client (`FromLv`/`ToLv`, event
`enterFrame` on `_root`) are there, then turn on the lists `guiltBurstFirst/MaxUserMedalIds` (today only with
`KHUX_GUILT_BURST_POPUP=1`). The «Maxed out ...» message comes from the client texts (verify that the id exists in
WW). New resources version.

## 5. Outside 2b

- Catalog filters, rotation, seasonal banners: sub-project 3.
- Abilities missing in the master: I-146.
- Trait Medal, Imitation, Epic and 2016 sets: stay declared in the Notices.

## 6. Order

1. Research (read-only): boosted field, use of `warrantDisplayOfTime`/`warrantMedalIds`, mapping of the
   guilt/SAB sentences, format of the popup LWFs.
2. Catalog: `slots[]`, pity, Tier, overrides, strengthening per banner; tests on the audit banners.
3. Server: draw, strengthened medals, strip with the counter; tests.
4. Pages and Notices.
5. Popup LWFs and resources.
6. Bench: B0306 (Tier, list, pity with the counter going down), B0629 (two lists), a banner with maxed guilt
   (Nova +1/+5 and popup), a boosted one (band and stats), a banner with maxed abilities; user test
   with the reduced save for the Nova.

## 7. Tests

Offline tests for each rule (audit sentences as cases), integration on the real catalog (the 171 banners with
discrepancies become consistent again, 0 banners with conflicting reserved slots), bench tests of point 6 with
screenshots compared with the video frames.

## 8. Research outcomes (17-10, `D:\Progetto_Restauro_KH_UX\tmp\sp2b\research.md`) and the decisions that follow

They replace the hypotheses of points 4.4-4.6 where they differ.

- **Boosted = distinct row of the medal master** (not a state of the player's medal): the client recognizes it from
  `displayId` = that of the normal one + 1; `groupId` points to the normal one and the detail colours
  the better STR/DEF/Cost in yellow; the printed Cost is that of the row. Therefore: new boosted rows in the
  master (`attack`/`maxAttack` +1000, `defense`/`maxDefense` +1000, `cost` -10, `displayId` +1, `groupId` of the
  normal one), Chip/Dale independent. «BOOSTED» band: `Bonus_Plate` + `Bonus_TextStatus.png` (already
  served) + LWF `Draw_StatusBonus` (to be imported from JP). Red LV tag: `Minfo_Def12_SB.png`,
  `Deck_Panel_SB.png` (to be imported from JP). To be verified: `minCost` of the boosted row, effect of `groupId` on the
  dots.
- **Guarantee strip (replaces the «golden number»)**: XML rich text (tag `<important>` =
  yellow 255,255,0, `<big>`, `<middle>`, `<br>`). Original text already in the WW texts: «`<important>`Nome`</important>`
  guaranteed in `<important>`N tries`</important>`!» (106180307/308, lists 106180302-306). **User decision
  (17-10): original yellow**, no difference to declare. The strip appears only with `warrantDisplayOfTime` (the
  threshold = pity) != 0 and `userWarrantDisplayOfTime` between 1 and the threshold; with `validComment` 0 the client uses the names of
  `warrantMedalIds` (empty list = crash), with 1 `sprintf(comment, userWarrantDisplayOfTime)`. `warrantNumberOfTime`
  is not read. Proposal: `validComment` 0 + `warrantMedalIds` = featured medal for the banners with pity; a name
  with «&» to be tested.
- **Guilt and SAB**: «maximum Special Attack Bonus»/«maxed» -> `guiltFactor` at the maximum of the tier (Tier 10 = 32000 =
  +320%) with the dots full; «strengthened N times»/«pre-strengthened N dots» -> `burstUpperNumber` = N (maximum
  `maxEnhanceCount`: 3★ 1, 4★ 2, 5★ 3, 6-7★ 5); «SAB of N»/«Level N SAB»/«SAB Tier N» = Tier filter (`guiltValue`),
  not a state; «Dual Meow Wow [SAB LV 9]» = medalId 301684.
- **Nova popup**: the JP LWFs have what is needed (`FromLv`, `ToLv`, `_root`; `_num` with `num1`..`num4`, labels
  `Lv0`..`Lv0000`). Logo `Burst_Logo.png` 422x142 RGBA and `Burst_Logo_B.png` (white silhouette of the glow): redone
  «NOVA». Also to be imported: `GuiltBonus_Wfix0..9` (digits, missing on our side) and the layout `MedalInfo_Burst_Info.json`
  (uses `Panel03.png`, already served). Texts 101302059 «Maxed out %s's Special Attack Bonus!» and 101302058 already present.
  Import: extend `import_jp_raisedraw.py` to `lwf/medal/guilt_bonus` and `Draw_StatusBonus` (encoding `btf.encode`),
  layout in `jp_coco_layouts.txt` for `import_jp_coco.py`, `_SB` textures copied from JP.
