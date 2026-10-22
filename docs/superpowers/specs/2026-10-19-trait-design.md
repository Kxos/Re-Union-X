# Traits from fusion and Trait Medals (I-084): design

Status: draft of 19-10-2026, to be approved. Two sub-projects, in the order decided by the user:
**A. traits from the fusion of identical copies**, then **B. Trait Medals**. B builds on A.

## Why

In the original, Trait Medals were in many banners and players looked for them: they strengthen the medal (one dot,
or unlock or reroll of the guilt) and at the same time give it a trait. Today our server never gives a trait from
fusion, not even with two identical copies: traits can only be bought in the Moogle Shop. The «Trait Medal» slot
of the banners (89 promises) gives any 6★ as a declared fallback.

Goal (user): reinstate them as in the original. If the original code is missing, reconstruct at least the original
behaviour from the sources. What we reconstruct must be declared in the Notices (project rule).

## Sources

- Rules: research of 12-10 (`D:\Progetto_Restauro_KH_UX\reference\trait_medals\NOTE.md`) and of 19-10
  (`D:\Progetto_Restauro_KH_UX\tmp\trait\sources\`, `INDEX.txt`: EN notices 27491, 38128, 46740, 52659, 60076, 70201;
  JP 37748, 69947, 67015; the user's guide pp. 21-23; khuxwiki «Trait Medal», «Medal#Traits»).
- Original screens: `D:\Progetto_Restauro_KH_UX\reference\trait_medals\video_Z_JRaJF7GbQ\` (NOTE.md: fusion with
  Trait Medal, wheel, «Tap Screen», replacement popup with full slots).
- Client 4.3.1: research notes kept private; contract summarized below.

## Original rules (confirmed by the sources)

1. Every fusion with at least one copy of the **same medal** (same name; from 2.6.0 also different rarities) gives
   **always a** random **trait**, if the medal has trait slots (`shuffleskillSlot` > 0). Tier, rarity and dots
   do not matter. Mickey & Brooms never gives traits.
2. **Only one trait per fusion**, even with several copies or several Trait Medals among the materials. Dots and guilt instead
   count every copy (as today).
3. The trait drawn can be **a duplicate** of one already present (video: two «Extra Attack: 40% Power»). Traits
   all stack, except Extra Attack and Ground/Aerial Enemy DEF: from the second one on they have no effect (JP 37748,
   2.0.2 notice 27960; the user's memory). The server must not prevent them.
4. **Full slots**: the player chooses which trait to replace (the new one takes its position) or «Skip» (the
   new one is lost). If they exit the game before choosing, at the next login the game offers the choice again («There are
   traits that have not been set.»).
5. The traits of the copy used as material are lost (probable; confirmed only for Evolve, 52659).
6. **Trait Medal** (B): each one is tied to a medal. Fused onto that medal it gives a trait (rule 1) plus one dot,
   or unlock or reroll of the guilt with the dots full. Fused onto another medal it gives only EXP.

## User decisions (19-10)

- Order: first A, then B.
- The fusion wheel draws only among the **11 original traits**: Extra Attack 40% Power, Ground Enemy DEF -60%,
  Aerial Enemy DEF -60%, STR +1000, Damage in Raids +40%, DEF +2000, Max Gauges +2, Max HP +800 (see «To be
  verified»), Poison Resist 20%, Sleep Resist 20%, Paralysis Resist 20%. The 5 traits of 4.1.0 (50%, -70%,
  +1500, Raids +50%) stay only in the Moogle Shop: the sources do not say whether they came out of fusion (verdict «unknown»,
  hints towards «shop only»).
- Probability: **uniform**, 1 in 11 for each trait (the original percentages were never published).
  Declared in the Notices as reconstructed, with the values.
- Outside this work: the Moogle Shop Trait Medals («Trait Medal #N x10», 2021) and the event reward ones:
  they will arrive with their respective modes. Boosters (I-166): with the events.

## Client contract (high confidence except where indicated)

- **Fusion, `POST /user/medal/enhance` (action 55)**, result scene:
  - free slots: the new trait goes AT THE END of `afterEnhanceUserMedal.userShuffleSkills`, and
    `medalResumption = {userShuffleSkills: [], resumptionStatus: 0}`. The client shows the wheel on the LAST element;
  - full slots: `afterEnhanceUserMedal.userShuffleSkills` unchanged and
    `medalResumption = {userShuffleSkills: [pending], resumptionStatus: 1}`. With status 1 the list must NOT be
    empty (the client reads `[0]` without checking);
  - `overwriteSkills`/`successOverwrite`/`isOverwriteSkill` are the skills (I-088), not the traits.
  - trait element: `{userShuffleSkillId (uint64), shuffleSkillId, userMedalId, getDatetime, type}`;
    for fusion traits `type` != 2 (2 = pet Special Trait); 1 proposed (medium confidence).
- **Choice, `POST /user/medal/shuffleskill` (action 57)**:
  - Replace: `{userMedalId, userShuffleSkillId: existing trait to remove, enableUserShuffleSkillId: pending}`;
  - Skip: `{userMedalId, userShuffleSkillId: pending, enableUserShuffleSkillId: 0}`;
  - response: `userMedal` (format of `userMedals`) and `medalResumption` at the root, both mandatory; after the
    choice `{[], 0}`. No animation after 57.
- **Login**: `userData.medalResumption` with status 1 -> popup «There are traits that have not been set.», then
  if `pending[0].type == 2` Spirit, otherwise the choice window on the medal
  `pending[0].userMedalId`. `POST /pet/expedition` (244) also updates the same value: it must be kept consistent.
- **Identical copy / Trait Medal** (preview): «trait» material if
  `base.shuffleSkillGroupId` != 0, equal to that of the material, and `base.shuffleskillSlot` > 0. No
  check on the `type`. Today `shuffleSkillGroupId` is 0 in all 3,241 rows of `medal`: it must be filled in.
  The «dot» is a separate check (groupId / `burstEnhanceCategory` / type 8).
- **Trait Medals in the lists**: `type` 9 = «Trait Medals» filter (10 = Subslot). Grey, cost 999, sale and EXP
  come from the master columns (`cost`, `sellPerLv`, `materialExp`), no dedicated code.

## Resources

| Resource | Today | To do |
|---|---|---|
| `Kakusei_Get1.lwf`, `Kakusei_Get2.lwf` (wheel), `Kakusei_Icon%04d.lwf` | reconstructed by us (stage_gen) | replace with the JP originals (as I-163) |
| `MedalInfo_SkillChangeWindow.json` (popup «Choose a trait to replace») | absent | import from JP |
| texture `Kakusei_New.png` | absent | import from JP |
| `MedalInfo_KakuseiInfo_ver150`, `MedalInfo_Anim.ExportJson`, `MedalMixResultScene_ver320`, `img/kakusei` | present | - |

Japanese texts in the JP layouts: translate them with the client's WW texts where they exist («Choose a trait to replace.»,
«Skip», «Replace %s with %s?») and check the look against the video frames (rule: style from the originals).

## A. Traits from fusion

1. Master:
   - `shuffleskill`: add as normal traits (`type` 1, `rate` > 0) Poison/Sleep/Paralysis Resist 20% and
     Max HP +800, which today exist only as pet Special Traits (type 2) or with the value +300. The fusion
     wheel draws only the 11 original ids (list in the server, not the `rate` field, because the 5 of 4.1.0 also
     have type 1).
   - `medal`: `shuffleSkillGroupId` = same value for all rows of the same medal (same name, all
     rarities, boosted included). Value rule: up to the builder (for example the lowest medalId
     of the family), stable across regenerations.
2. Server, fusion (`respondMedalEnhance`): if among the materials there is at least one medal with the same
   `shuffleSkillGroupId` as the base and the base has `shuffleskillSlot` > 0, draw a trait (uniform among the 11) and:
   free slots -> add it at the end; full slots -> save it as pending in the save and send status 1.
   The slots count only normal traits (the pet Special Trait has a separate slot, as in the Moogle Shop today).
3. Server, action 57: Replace (the pending one takes the position of the removed trait) and Skip; response as above.
4. Server, login and `userData`: `medalResumption` from the save; status 1 as long as there is a pending one.
5. Dots and guilt: unchanged (already done, `medal-guilt.js`).
6. Notices: section in the medals notice: the fusion of identical copies gives a trait; probability 1/11
   per trait (reconstructed); the 5 traits of 4.1.0 only from the Moogle Shop.

## B. Trait Medals

1. List: EN number «Trait Medal #N» -> associated medal, from the khuxwiki table (193 rows in
   `khuxwiki_Trait_Medal_raw.txt`) and from the deal notices (#123 SN+ - KH III Aqua, #130 SN+ - KH III Xemnas...;
   up to about #313). Only those whose medal exists in our catalog.
2. Master `medal`: one row per Trait Medal, `type` 9, 6★, STR/DEF 1, cost 999, «Lesser Attack» (1 enemy, 1 gauge,
   x1,00), 15 Pet Points, same Album number as the medal, `shuffleSkillGroupId` of the medal, name «Trait
   Medal #N»; no dots on the base from the Trait Medal through the «dot» fields except those the client
   requires (see «To be verified»).
3. Images: black-and-white version of the associated medal (the three originals in `reference\trait_medals\` serve
   as a model for tone and contrast), generated in the resource package.
4. Server, fusion: Trait Medal on its medal -> trait (A, at most one per fusion) + one dot or unlock or
   reroll of the guilt (like an identical copy); on other medals only EXP.
5. Banners: the Trait slot gives the Trait Medal promised by the banner's notice (e.g. B0353 «Trait Medal #23») instead of the
   fallback 6★; where the number cannot be derived the declared fallback stays. The pities «Trait Medal #N within 5»
   (B0267) become reproducible. Update Details, Notices («Trait Medals no longer exist...») and the catalog
   tests.

## To be verified (by the builder, before writing code)

- Max HP of the trait: the guide says +800, the local master +300 (Moogle Shop). Choose with the sources.
- Whether the Trait Medal «dot» also requires `groupId`/`burstEnhanceCategory` on the row (client
  preview) or the server is enough.
- What happens with several identical copies if the base already has dots and guilt at max (JP fix 67015: the client
  allows only one copy «only for the trait»): verify on the bench that the client does not send the case.

## Non-goals

- No change to the dot and guilt rules.
- No 4.1.0 traits from fusion, no «balancing» weights.
- No Trait Medals in the Moogle Shop or as rewards (see above).

## Choices made in review (decided by Claude, to be checked)

1. **Multiple pending traits.** In the save a QUEUE of pending ones; `medalResumption` sends the first
   (`[pending[0]]`, status 1) until the queue is empty. In the original the popup appears right after the fusion,
   so usually there is at most one pending. The pet Special Trait stays as it is today (immediate replacement,
   outside this work); the response of 244 must however send back the saved `medalResumption`, not a fixed `{[],0}`,
   so as not to delete a pending one from fusion.
2. **«Same medal» = same name** (all rarities, boosted, variant rows >= 1,000,000 of our master).
   SN, SN+, SN++, Supernova/Supernova+ are different medals (different names; Evolve distinguishes them). Rule from
   2.6.0 «Medals of different rarities ... same Medal» (notice 40729).
3. **Trait Medal on the boosted versions**: trait + dot as on the normal one (same medal, rule 2). For
   the client preview the dot link is put on the BASE: `burstEnhanceCategory` of the rows of the
   family contains the `groupId` of the Trait Medal (applies to normal and boosted); the server applies the same rule
   in `medal-guilt.js` (the only change to the dot rules: the Trait Medal counts as a copy).
4. **Stacking**: Trait Medals stackable up to 99 as from 3.3.0 (`validPack`), also in the same fusion;
   only one trait per fusion anyway, dots per copy.

## Left to the builder

Code structure, field names in the save, save migration, tests, order of the steps within A and B,
tools to import the JP resources (already used for I-163).

## Bench tests (success)

- A: two identical copies -> original wheel, trait in the list; full slots -> original popup, Replace and Skip; exiting
  the game before choosing -> popup at login.
- B: deal with Trait Medal -> grey medal in the box, «Trait Medals» filter; fused on its medal -> trait +
  dot; on another -> only EXP.
