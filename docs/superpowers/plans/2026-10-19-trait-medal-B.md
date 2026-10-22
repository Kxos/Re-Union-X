# Trait Medal (I-084 part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trait Medals as in the original: master rows (grey 6★ tied to a medal), fusion on the associated
medal = trait + dot, appearing in the banners in place of the fallback 6★.

**Architecture:** everything goes through the master. The client recognizes the trait from an equal `shuffleSkillGroupId` and the dot
from the base's `burstEnhanceCategory` that contains the Trait Medal's group: the server already applies
the same rules (`medal-trait.js`, `medal-guilt.js`), so the fusion needs no new code, only the right rows.
Grey images generated in the `stage_gen` package (like the Stock Medal). Banners: the catalog derives the number #N and the
server draws the Trait Medal row.

**Tech Stack:** Node (server, master generators), Python (banner catalog, BTF images).

**Spec:** `docs/superpowers/specs/2026-10-19-trait-design.md` (section B and «Choices made in review»).

## Global Constraints

- Never `make-game-tables.js` alone without the following steps; every new generator is idempotent and called at the end
  of make-game-tables (after make-trait-groups). After every master change: revision +1 in the 4 session scripts.
- Every difference from the original goes in the Notices.
- Trait Medal stats (khuxwiki, notice 38128): 6★, STR 1, DEF 1, cost 999, «Lesser Attack» 1 enemy 1 gauge
  x1,00, 15 Pet Points, same Album number as the medal, name «Trait Medal #N».
- Commit and push at every step.

## Starting ruling (from the sources, 19-10)

- **«Same medal» = Album line**, not just the same name. Evidence: the deal «SN+ - KH III Xemnas Trait Medal
  Deal» gives Trait Medal #130, which the khuxwiki ties to «SN - KH III Xemnas»; «Trait Medals and their corresponding
  Medals share a slot in the Album» (38128); the renamed evolutions (SN -> SN+ -> SN++, X -> Supernova - X)
  share the Album number. The client has only one `shuffleSkillGroupId` per row, so the same group also applies
  to the copies of part A: SN fused on SN+ gives a trait. Group = connected component of (same name) U
  (same sortId > 0); in the master all 138 multi-name lines are Evolve chains (verified). Cost, if
  wrong: a few extra traits when fusing different evolutions.
- Numbers without a known medal (#189-#313 absent from the khuxwiki except #274): they stay with the declared fallback.

## Review Focus

- Trait Medal fused on a different medal: only EXP, no trait nor dot.
- Trait Medal fused on the boosted version or on the evolution (SN+) of its medal: trait + dot.
- Several Trait Medals stacked in the same fusion: only one trait, one dot per copy.
- Album: the Trait Medal adds no cells and does not change the count.
- Banner with an unknown number: fallback unchanged and declared.

---

### Task 1: groups by Album line

**Files:** Modify `server/make-trait-groups.js` (`groups`), `server/test-trait-groups.js`.

- [ ] Test: Supernova - Sephiroth and Supernova+ - Sephiroth same group; Sora & Peter Pan and Supernova - Sora &
      Peter Pan same group; group = lowest medalId of the component; different lines (KH III Kairi A / B) different.
- [ ] `groups(medals)` -> Map medalId -> group (union-find on name and sortId > 0, rows with slot > 0).
- [ ] Regenerate the master (idempotent patch), tests green, revision +1, commit.

### Task 2: list of the Trait Medals

**Files:** Create `server/make-trait-medal-list.js` (generates `server/trait_medals.json` from the wikitext
`reference/trait_medals/khuxwiki_Trait_Medal_raw.txt`), `server/trait_medals.json`, test in `server/test-trait-medals.js`.

- [ ] `[{n, album, jp, affected}]` with `affected` = medalId of the type 1 row < 1,000,000 with sortId = album and name
      equal to the normalized wiki label, otherwise the lowest of the line. 189 rows, #1 -> 301426.

### Task 3: master rows

**Files:** Create `server/make-trait-medals.js` (idempotent patch, called by make-game-tables after make-trait-groups),
test in `server/test-trait-medals.js`.

- [ ] Row `medalId = 9000000 + n`, type 9, rare 6, attack/defense 1 (max equal, addMax 0), cost/minCost 999,
      addPetPt 15, sortId/listSortId = album, groupId 0, shuffleskillSlot 0, shuffleSkillGroupId = group of the
      medal, validPack 1, validEvolve 0, guiltValue of the medal (unlock possible), burstId = new burst row
      9000000 «Lesser Attack» (target 1 enemy, gauge 1, powers x1,00, maxEnhanceCount 5), images = medalId,
      materialExp/sell/sellPerLv of the 6★ medal.
- [ ] Rows of the line: `burstEnhanceCategory[0]` = medalId of the Trait Medal (normal, boosted, variants).
- [ ] Album (`routes-info-album.albumData`): type 9 is not an entry and does not count.

### Task 4: grey images

**Files:** Create `recon/tools/make_trait_medal_images.py`, hook in `tools/ldplayer/session/build-resources.ps1`.

- [ ] From `medal_gen/files/img/medal/Medal_L|S_<affected>.png` and `img/Cutin/Cutin_<affected>.png` (BTF) to
      `Medal_L|S_<9000000+n>` and `Cutin_<...>` in `$sg/files`, greyscale with alpha, tone compared with
      `reference/trait_medals/Trait_Medal_1/8/20_6star_KHUX.png`.

### Task 5: fusion

**Files:** `server/test-medal-enhance.js` (section 12).

- [ ] Trait Medal on its medal: trait + 1 dot; on the boosted one and on the evolution: the same; on another one: no
      trait nor dot; three stacked: one trait, three dots (guilt with full dots). Fix the server only if
      a test fails.

### Task 6: banners

**Files:** `recon/tools/banner_guarantees.py` (number #N in the trait slot and in the pities), `recon/tools/make_banner_catalog.py`,
`server/gacha-data.js`, `server/gacha.js`, Python and Node tests.

- [ ] Trait slot with `traitNo`; the server draws row 9000000+N if it exists (otherwise fallback) and
      `notReproduced: 'trait'` stays only for the unknown numbers. Pities «Trait Medal #N within 5» reproducible.
      Details: «Trait Medal #N (for <medaglia>)».

### Task 7: Notices, documentation, bench

- [ ] Notices: «Trait Medals» rewritten (restored; numbers without a known medal with the fallback; Album line).
      medaglie.md, ISSUES I-084, journal, HANDOFF. Resources `-Version N+1` and bench test («Trait Medals» filter,
      fusion, deal).
