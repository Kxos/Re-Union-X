# Shop, sub-project 2b: guarantees and boosted medals — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every draw gives the medals the way the original banner gave them: every guarantee on its slot, the promised Tier, the pity on the target and at the written star, the yellow counter «X guaranteed in N tries!» in the strip, the already enhanced medals (guilt and dots preset, boosted, abilities at max level) and the «NOVA LEVEL UP!» popup that follows.

**Architecture:** a new Python module (`recon/tools/banner_guarantees.py`) reads the sentences of the notes and writes into the catalog `guarantee.slots[]`, the pity fields and `enhance` (per-banner enhancements), with a hand-written override table; `make_banner_catalog.py` calls it and adds the Tier to the medals. The master receives boosted `medal` rows (module `server/medal-boost.js`, script `server/make-boosted-medals.js`) and the strip fields in `drawMedalType` (`server/make-banners.js`). The server draws from the slots (`server/gacha-data.js`), applies the enhancements at delivery (`server/server.js`) and fills the tile with the counter (`server/gacha.js`). Resources 41 add the JP LWFs of the Nova popup (remade «NOVA» logo), `Draw_StatusBonus`, the `_SB` textures and the layout `MedalInfo_Burst_Info.json`.

**Tech Stack:** Node (server, no external dependency), Python 3 + Pillow (`recon/tools`), PowerShell (LDPlayer bench).

**Spec:** `docs/superpowers/specs/2026-10-17-shop-garanzie-2b-design.md` (section 8 «Esiti della ricerca» replaces the hypotheses of 4.4-4.6). Sources: `D:\Progetto_Restauro_KH_UX\tmp\sp2b\research.md` (addresses, fields, files to import), `D:\Progetto_Restauro_KH_UX\tmp\sp2\audit-guarantees.md` (sections 3-4: classes D1-D13, regexes, slot assignment, expected outcomes; section 6: not reproducible), `D:\Progetto_Restauro_KH_UX\tmp\sp2b\decisioni.md`, `D:\Progetto_Restauro_KH_UX\tmp\sp2b\video-LFJ5.md` (frames in `reference\shop_boosted`, `reference\nova_lvup`). Previous plan: `docs/superpowers/plans/2026-10-16-shop-banner-originali.md`; notes `docs/notes/shop.md`, `guilt.md`, `medaglie.md`, `battaglia.md`, `risorse_layout.md`, `banco.md`, `server.md`.

## Global Constraints

- Original APK unmodified: only server responses, master tables, downloadable resources and WebView pages change.
- Repo: only our own code and documentation. Derived data and assets outside git: `server/master_data/`, `server/game_data/`, `server/save/`, imported LWFs and images (`raisedraw_gen`, `stage_gen`), generated NOVA logo. In the repo only scripts, override tables written by us (with the source) and notes.
- Git: always `git -c safe.directory=*`; message in a UTF-8 file without BOM in `D:\Progetto_Restauro_KH_UX\tmp\msg_*.txt` written with the Write tool, then `git commit -F <file>`; `git pull --rebase` before `git push`; messages in Italian ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; files by name, never `git add -A`. Commit and push at every verified task.
- Control bytes: after every write, `python -c "import sys;d=open(sys.argv[1],'rb').read();print([i for i,b in enumerate(d) if b<32 and b not in (9,10,13)][:5])" <file>` must print `[]` (`\t` only in the TSVs).
- Code and comments in Italian, in the style of the neighbouring files. Texts shown to the player in English.
- Tests: standalone scripts (`node server/test-<nome>.js`, `python recon/tools/test_<nome>.py`) that print `OK: ...` or `ERRORI (n)` and exit with 1; never the real save (`KHUX_SAVE` in a temporary folder).
- Master: every change = new revision. Today BASE 120; this plan brings it to **121** (Task 4) in the 4 session scripts (`run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1`); another master change after Task 4 = 122, and so on.
- Resources: every change = new version. Today 40; this plan brings **41** (Task 10), complete version only with the bench stopped (`build-resources.ps1 -Version 41`), then `update-resources.ps1`. Never `-Quick` if a version newer than the installed one exists.
- No medal before its date (spec 9.3 of sub-project 2: no 6★ before 15/07/2016, no 7★ before 25/05/2018) nor outside the promised Tier; the fixed-star pity does not override the date.
- Compatibility: `guarantee.list/count/slot` of sub-project 2 stay written and valid (first list reservation); the server uses `slots[]` if present, otherwise the old path.
- Every difference from the original must be explained in the in-game Notices, in English (the boosted «small chance» reconstructed at 5%, the Trait Medals, the missing abilities).
- Bench: taps only while the game is alive (`AppAlive`); SKIP in every dialogue that shows it; copy of the save before the tests; only one script at a time; immediate stop after a crash (`tools\ldplayer\tombstone.ps1`); screenshots compared with `reference\shop_boosted` and `reference\nova_lvup`; heavy files in `D:\Progetto_Restauro_KH_UX\tmp`.

## Review Focus

1. **No medal before its date**: a pity with `pityStar` 7 on a 2017 banner, or 6★ on a 2016 5★ banner (D8), gives the highest variant already released, never the future 7★/6★; the 6★ lists (decision 1) do not promote to 7★ medals that only have the 7★ (test in Task 5).
2. **Tier respected**: the `tier` slot of B0306 (`tierMax 4`) never gives a 7★ of Tier 5-10, not even with the slot upgrade; empty pool -> without filter with a log, never an exception (test in Task 5).
3. **Pity on the right slot**: B0321 replaces slot 1 (the reservation that contains Prime - Illustrated Axel), not the Tier slot 0; B0319 replaces the first 6★ and leaves the 7★; a replaced list slot stays guaranteed only if the target is in the list (test in Tasks 1 and 5).
4. **Strip without crashes**: with `validComment 0` the client reads the names of `warrantMedalIds`; an empty list crashes it. Every tile of a banner with `validComment 0` has a non-empty `warrantMedalIds`, and if the pity has no targets at the date `userWarrantDisplayOfTime` is 0 (strip hidden) (test in Tasks 4 and 6).
5. **Boosted medals that do not break cells, Evolve and catalogs**: the boosted rows (`groupId` != 0) do not enter `medals[n].ids` of the catalog nor the searches by name (supernova, blue-fairy, bonus), have `validPack 0` (own cell), the same `evolveId` as the normal one, and a save with a boosted medal reloads identically (test in Tasks 1, 3 and 6).
6. **Nova counted once**: a boosted medal and its normal one count as a single medal for the +1/+5 of the Nova (key `groupId || medalId`), and a medal drawn already at max appears in `guiltBurstFirstUserMedalIds` and `guiltBurstMaxUserMedalIds` of the `/gacha/draw` response (test in Task 6).

## Uncertainties left from the research (each with its verification step)

| # | Uncertainty | Starting choice | Verification |
|---|---|---|---|
| U1 | `minCost` of the boosted row | `minCost - 10` (Cid's cap unchanged) | Task 10 step 5: details of a boosted medal with Cid; the `MinusNum_Label` does not go beyond the cap |
| U2 | Effect of `groupId` on the dots (the server merges boosted and normal in `medal-guilt.js groupOf`) and in the Level Up preview | merge allowed | Task 10 step 5: Level Up normal -> boosted, preview and result consistent, no crash |
| U3 | Name with «&» in `warrantMedalIds` (XML parser of the strip) | names as they are (`validComment 0`) | Task 10 step 4 on a banner with pity on a name with «&»; if the text breaks, `WARRANT_XML_SAFE = true` in `make-banners.js` (Task 4) and regenerate |
| U4 | Message box for the +1 («Unlocked ...») | no change: the client decides it | Task 10 step 3: screenshot of the +1 and of the +5 against `reference\nova_lvup` |
| U5 | `displayId` of the boosted medal for the medals with a `displayId` other than 0/100/200/300/1100/1200/1300 (most of them: e.g. 31013) | `1` (boosted without badge) | Task 3 step 1: client behaviour checked before the code |
| U6 | boosted medalId >= 1,000,000 (`variante * 1000000 + medalId`) accepted by the client | yes (uint32) | Task 3 step 1 and Task 10 step 5 |
| U7 | Nova of the boosted medal (first copy per medalId or per group) | per group (Review Focus 6) | Task 10 step 5 (no +1 for a boosted medal of an already guilted medal) |

---

## Files

| File | Status | Responsibility |
|---|---|---|
| `recon/tools/banner_guarantees.py` | new | sentences -> `slots[]`, pity (`pityNames/pityStar/pitySlot/pityGift`), `enhance` (preset, boosted, maxSkill); hand overrides with the source |
| `recon/tools/test_banner_guarantees.py` | new | real sentences from the audit and the research as cases |
| `recon/tools/make_banner_catalog.py` | modify | calls `banner_guarantees`; Tier in `medals[n].ids`; excludes the boosted rows; dates of B0199-B0203; `align_debut_dates` on pity and slots |
| `recon/tools/banner_overrides.tsv` | modify | field `start_pt` for B0199-B0203 (notice) |
| `recon/tools/test_make_banner_catalog.py` | modify | integration on the real catalog |
| `server/medal-boost.js` | new | id, row and index of the boosted medals |
| `server/make-boosted-medals.js` | new | adds the boosted rows to `master_data/medal.json` (idempotent) |
| `server/make-game-tables.js` | modify | calls `make-boosted-medals` at the end |
| `server/test-medal-boost.js` | new | tests of the boosted medals |
| `server/make-banners.js`, `server/gacha-data.js` (`drawMedalTypeRow`) | modify | strip fields (`warrantDisplayOfTime`, `validComment`, `warrantNumberOfTime`) |
| `server/gacha-data.js` | modify | pool with Tier and pity stars, draw from the slots, boosted, per-slot enhancements, `slotOdds` per reservation |
| `server/gacha.js` | modify | tile with `userWarrantDisplayOfTime`/`warrantMedalIds`; pages (Task 7) |
| `server/server.js` | modify | delivery of the enhancements, pity gift, Nova lists in the response |
| `server/guilt-burst.js` | modify | group key; popup on by default (Task 10) |
| `server/routes-info-album.js` | modify | Notices |
| `recon/tools/import_jp_raisedraw.py`, `test_import_jp_raisedraw.py` | modify | JP LWFs of the popup, `Draw_StatusBonus`, `_SB` textures |
| `recon/tools/jp_coco_layouts.txt` | modify | `MedalInfo_Burst_Info.json` |
| `recon/tools/make_nova_logo.py`, `test_make_nova_logo.py` | new | «NOVA» logo 422x142 and `_B` glow from the frames |
| `tools/ldplayer/session/*.ps1` (4 scripts + `build-resources.ps1`) | modify | revision 121; logo in the build |
| `docs/notes/shop.md`, `guilt.md`, `battaglia.md`, `docs/ISSUES.md`, `HANDOFF.md`, `docs/notes/server.md` | modify | status |

## Catalog contract (new fields of `server/game_data/gacha_catalog.json`, `version` 3)

```json
{
  "medals": {"hd axel": {"date": "2016-...", "ids": [[1201, 5, "2016-...", 4], [300721, 7, "2018-05-14", 4]]}},
  "banners": [{
    "rowId": "B0306",
    "guarantee": {
      "list": ["illustrated kairi [ex]", "..."], "count": 1, "slot": 1, "pity": 5, "every": null, "featured": ["hd axel"],
      "slots": [
        {"kind": "tier", "slot": 0, "count": 1, "star": 7, "names": [], "tierMin": null, "tierMax": 4},
        {"kind": "list", "slot": 1, "count": 1, "star": 6, "names": ["illustrated kairi [ex]", "..."], "tierMin": null, "tierMax": null}
      ],
      "pityNames": ["hd axel"], "pityStar": 7, "pitySlot": 0, "pityGift": null,
      "erratum": null, "source": null
    },
    "enhance": {
      "preset": [{"on": {"slots": [0]}, "dots": "max", "guilt": "max"}],
      "boosted": [{"on": {"names": ["dark riku"]}, "str": 1000, "def": 1000, "chance": "small"}],
      "maxSkill": [{"on": {"names": ["zexion [+]"]}, "skills": ["paralysis+ ii max"]}],
      "notReproduced": ["trait"]
    }
  }]
}
```

- `medals[n].ids[i][3]` = Tier = `medal.json.guiltValue` (0 if missing).
- `slots[].kind`: `list` (list or named medal), `tier` (`tierMin`/`tierMax`, optional alternative `names`: the slot accepts the Tier **or** a name), `trait` (reserved generic slot). `slot` = first index in `slotRarities`; the other `count-1` follow. `star` = star of the assigned slot.
- `pityStar`: fixed star of the pity; `pitySlot`: replaced index; `pityGift`: `[3, medalId, 1]` when the target is a support medal of the master (goes to the Present Box), otherwise `null`; a target that is neither in the catalog nor in the master -> `pity: null` and `"pity"` in `notReproduced`.
- `enhance.*.on`: `{"slots": [i...]}`, `{"names": [...]}` or `{"star": 7}`. `dots`: integer, `[min, max]` or `"max"`; `guilt`: `"max"` or `null`. `chance`: `"small"` (5% per eligible slot, reconstructed) or `"guaranteed"`. `str`/`def` in base points (1000, 2000).
- `erratum`: English text for the Details (B0419/B0421); `source`: source of the override (`notice 37207`, `image 10678`).

---

### Task 1: slot reservations, pity and Tier in the catalog

Recommended model: Opus (many rules and overrides, cross-check with the audit).

**Files:**
- Create: `recon/tools/banner_guarantees.py`, `recon/tools/test_banner_guarantees.py`
- Modify: `recon/tools/make_banner_catalog.py` (`guarantee_of` ~332, `guarantee_slot` ~377, `align_debut_dates` ~395, `extend_medals`/reading of `medal.json`, `build_catalog` ~751), `recon/tools/banner_overrides.tsv`, `recon/tools/test_make_banner_catalog.py`

**Interfaces:**
- Consumes: `make_banner_catalog.list_names`, `_cut`, `NUM`, `LISTRE`, `norm` (reused, not duplicated); `slotRarities` = the expanded mix (`[r for r, n in mix for _ in range(n)]`).
- Produces (Tasks 2, 5, 7):
  - `parse_reservations(text: str) -> list[dict]` (reservations in text order, without `slot`)
  - `assign_slots(reservations: list[dict], mix: list[list[int]]) -> list[dict]` (with `slot` and `star`)
  - `pity_of(text: str, featured: list[str], slots: list[dict], mix) -> dict` (`pity, pityNames, pityStar, pitySlot`)
  - `guarantee_v3(row, notes, mix, featured, medal_rows) -> dict` (the `guarantee` block of the contract, with compatible `list/count/slot`)
  - `SLOT_OVERRIDES: dict[rowId, dict]` (fields that replace the computed ones, always with `source`)
  - catalog `version: 3`, `medals[n].ids` with 4 fields

- [ ] **Step 1: Failing tests**

`recon/tools/test_banner_guarantees.py`, style of `test_banner_sources.py`. Real sentences (catalog and audit):

```python
B0306 = ("Guarantees one Tier 4 or lower 7★ Medal. Guarantees one of the following Medals: Illustrated Kairi [EX], "
         "Illustrated Xion [EX], HD Zack, Yuna & Rikku & Paine, The World Ends with You Art 2, HD Pete, HD Zexion, HD Larxene. "
         "If bought 5 times, at least one 7★ HD Axel is guaranteed.")
s = g.assign_slots(g.parse_reservations(B0306), [[7, 1], [6, 1], [5, 8]])
check(s[0] == {'kind': 'tier', 'slot': 0, 'count': 1, 'star': 7, 'names': [], 'tierMin': None, 'tierMax': 4}, 'B0306 tier')
check(s[1]['kind'] == 'list' and s[1]['slot'] == 1 and s[1]['star'] == 6 and len(s[1]['names']) == 8
      and 'yuna & rikku & paine' in s[1]['names'], 'B0306 lista sul 6')
p = g.pity_of(B0306, ['hd axel'], s, [[7, 1], [6, 1], [5, 8]])
check(p == {'pity': 5, 'pityNames': ['hd axel'], 'pityStar': 7, 'pitySlot': 0}, f'B0306 pity {p}')

B0321 = "Guarantees one Tier 4 7★ Medal. Guarantees one 6★ Prime - Illustrated Axel. If bought 5 times, at least one 7★ Prime - Illustrated Axel is guaranteed."
s = g.assign_slots(g.parse_reservations(B0321), [[7, 1], [6, 1], [5, 8]])
check(s[0]['tierMin'] == 4 and s[0]['tierMax'] == 4 and s[1]['names'] == ['prime - illustrated axel'] and s[1]['slot'] == 1, 'B0321')
check(g.pity_of(B0321, ['prime - illustrated axel'], s, [[7, 1], [6, 1], [5, 8]])['pitySlot'] == 1, 'B0321 pity sulla riserva')

B0397 = "Guarantees one 6★ Prime - KH Cloud. Guarantees one Trait Medal #48. If bought 5 times, at least one 7★ Prime - KH Cloud is guaranteed."
s = g.assign_slots(g.parse_reservations(B0397), [[6, 2], [5, 8]])
check([x['kind'] for x in s] == ['list', 'trait'] and [x['slot'] for x in s] == [0, 1], 'B0397')
check(g.pity_of(B0397, ['supernova - sephiroth', 'prime - kh cloud'], s, [[6, 2], [5, 8]]) ==
      {'pity': 5, 'pityNames': ['prime - kh cloud'], 'pityStar': 7, 'pitySlot': 0}, 'B0397 pity 7 sulla lista')
```

Other cases (same form):
- B0629 (`[[7,1],[6,3],[5,6]]`, text «Guarantees one of the following Medals: SN++ - Rock Troll, ... or SN+ - Parasol Beauty. Guarantees three of the following Medals: ...»): two `list` reservations, slot 0 count 1 and slot 1 count 3 (stars 7 and 6);
- B0051 «Guarantees at least three medals with a SAB of 3 or higher» with `[[5,3],[4,7]]`: `{'kind': 'tier', 'count': 3, 'tierMin': 3, 'tierMax': None}` on slots 0-2; B0046 «(with Level 3 SAB)» -> `tierMin 3` (research §3, uncertain: noted in the comment);
- B0355 «one 7★ Tier 3 or 4 Medal» -> `tierMin 3, tierMax 4`; «Tier 6, Tier 7, or Tier 8 7★» (B0419) -> `6..8`;
- B0750 «Guarantees two SN+ or SN++ Medals»: `list` count 2 with `names` = pool names starting with `sn+ - `, `sn++ - `, `supernova+ - ` (resolved in `guarantee_v3`);
- decision 5: B0319 (mix with slot 0 at 7★, pity «one 6★ X» with no reservation containing X) -> `pitySlot` = first 6★ slot, and if there are none the first 5★;
- no conflict: `assign_slots` with more reservations than the star has slots -> the excess reservation takes the first free ones from the top and the function records `conflict: True` on the reservation (counted in Task 1 Step 4);
- `SLOT_OVERRIDES` contains B0678 (`count 1`, `source 'image 10678'`), B0733 (two lists: 3 SN+/SN++ on the 7★, 7 KH III on the 6★), B0740 (like image 10740: 1 of the 3 Halloween + 3 SN+/SN++ on the 7★; the KH III x5 list on the 6★ if the names are in the notes, otherwise generic), the D5 (B0049, B0055, B0372, B0695, B0721, B0725, B0726, B0734, B0739), B0419 (`pityNames ['hd aced [ex+]']`) and B0421 (`['hd gula [ex+]']`) with `erratum`, and every entry has `source`.

In `test_make_banner_catalog.py`, integration (only if the real files exist):

```python
cat = m.build_catalog(m.default_inputs()); B = {b['rowId']: b for b in cat['banners']}
check(cat['version'] == 3 and all(len(i) == 4 for v in cat['medals'].values() for i in v['ids']), 'Tier nelle medaglie')
check(not any(i[0] >= 1000000 for v in cat['medals'].values() for i in v['ids']), 'nessuna boosted nel catalogo')
check(sum(1 for b in cat['banners'] if any(s['kind'] == 'tier' for s in b['guarantee']['slots'])) == 178, 'banner con Tier')
check(not [b['rowId'] for b in cat['banners'] if any(s.get('conflict') for s in b['guarantee']['slots'])], 'nessun conflitto')
check(B['B0199']['start'] == '2017-11-24' and B['B0199']['guarantee']['pity'] == 20, 'B0199 data dal notice')
check(B['B0629']['guarantee']['slots'][1]['count'] == 3 and B['B0678']['guarantee']['slots'][0]['count'] == 1, 'D3/D4')
check(all(B[r]['guarantee']['pityStar'] == 7 for r in ['B0365', 'B0397', 'B0411', 'B0425', 'B0426', 'B0427', 'B0459']), 'D9 a 7')
check(B['B0230']['guarantee']['slots'] and B['B0246']['guarantee']['slots'], 'D6 liste piene alla data')
```

- [ ] **Step 2: Verify that they fail**

Run: `python recon/tools/test_banner_guarantees.py` -> ImportError. Run: `python recon/tools/test_make_banner_catalog.py` -> `ERRORI`.

- [ ] **Step 3: Implementation**

- `banner_guarantees.py`: regexes of the audit table, section 4 (list, named, tier, trait, SN+/SN++, pity «If bought N times ... one [N★] X» and «X is guaranteed within N draws»), after cleaning the markup (`{{EX|X}}` -> «X [EX]», `{{b|X|Y}}` -> «X [Y]», `{{KA|n}}` -> «Key Art #n», `[[X]]` -> «X»; no splitting on «Illus.», «Mr.», «Dr.», «KH 0.2»). The «every Nth draw» sentences stay pity (decision 3): no `pityMode`.
- `assign_slots`: the reservations with a star take the first `count` free slots of that star, then the others the first free ones from the top (audit section 4). Decision 1 in `guarantee_v3`: in a `list` reservation on a slot of star S only the names with an S variant in `medal_rows` remain (the 7★-only Supernovas leave the 6★ lists).
- `pity_of`: `pityNames` from the sentence (default `featured`), `pityStar` = written star (default star of `pitySlot`), `pitySlot` = slot of the reservation that contains a name of `pityNames`, otherwise first slot of `pityStar`, otherwise decision 5 (first 6★, then first 5★), otherwise 0.
- `guarantee_v3` also writes `list/count/slot` = first `list` reservation (compatibility), `pityGift` (Task 2 fills it), `erratum`, `source`, and applies `SLOT_OVERRIDES` last.
- `make_banner_catalog.py`: Tier as 4th field; the rows of `medal.json` with `groupId` != 0 or `medalId >= 1000000` do not enter any table by name (`extend_medals`, `resolve_name`, `bonus_of`, `evolve_of`); `align_debut_dates` also considers `pityNames` and the `names` of `slots[]`; new field `start_pt` in `banner_overrides.tsv` (rows B0199-B0203 = `2017-11-24`, `source` = notice id), which replaces the widened rule for those five.

- [ ] **Step 4: Tests and numbers**

Run: `python recon/tools/test_banner_guarantees.py` -> `OK`; `python recon/tools/test_make_banner_catalog.py` -> `OK`; `python recon/tools/make_banner_catalog.py` also prints: banners with `slots`, with Tier (178), with pity by star, conflicts (0), overrides applied. Rerun the audit script (`D:\Progetto_Restauro_KH_UX\tmp\gaudit\d.js` on the new catalog) and note how many of the 171 discrepancies remain (expected 0 among D1-D11; D12 covered by the Tier).

- [ ] **Step 5: Commit** (`msg_2b_t1.txt`)

```bash
git -c safe.directory=* add recon/tools/banner_guarantees.py recon/tools/test_banner_guarantees.py recon/tools/make_banner_catalog.py recon/tools/banner_overrides.tsv recon/tools/test_make_banner_catalog.py
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_2b_t1.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 2: per-banner enhancements (guilt, dots, boosted, abilities at max, pity gift)

Recommended model: Opus (heterogeneous sentences).

**Files:**
- Modify: `recon/tools/banner_guarantees.py`, `recon/tools/test_banner_guarantees.py`, `recon/tools/make_banner_catalog.py` (`build_catalog`)

**Interfaces:**
- Consumes: `parse_reservations`/`assign_slots` (Task 1).
- Produces (Tasks 3, 5, 6, 7): `enhance_of(text, slots, featured, medal_rows, skill_rows) -> dict` (the `enhance` block of the contract); `pity_gift(text, medal_rows) -> list | None`; in the catalog `banner.enhance` always present (empty lists if nothing).

- [ ] **Step 1: Failing tests** (real sentences, research §3 and catalog)

```python
e = g.enhance_of(TXT_B0310, [], [], M, S)   # notice B0310 (7★ con speciale sbloccato e bonus massimo), testo locale
check(e['preset'] == [{'on': {'star': 7}, 'dots': 'max', 'guilt': 'max'}], 'B0310')
s = g.assign_slots(g.parse_reservations("Guarantees one Tier 4 or higher Medal with its special attack strengthened 1 to 3 times."), [[6, 1], [5, 9]])
check(g.enhance_of("Guarantees one Tier 4 or higher Medal with its special attack strengthened 1 to 3 times.", s, [], M, S)['preset']
      == [{'on': {'slots': [0]}, 'dots': [1, 3], 'guilt': None}], 'B0131')
check(g.enhance_of("When drawing an HD Terra [EX], it comes with its special attack strengthened 5 times", [], [], M, S)['preset']
      == [{'on': {'names': ['hd terra [ex]']}, 'dots': 5, 'guilt': None}], 'B0243')
check(g.enhance_of("she is also guaranteed to come pre-strengthened to 3 Special Attack dots!", [], ['hd naminé'], M, S)['preset']
      == [{'on': {'names': ['hd naminé']}, 'dots': 3, 'guilt': None}], 'B0166 pronome = vetrina')
check(g.enhance_of("When drawing a Trait Medal #6, it comes with its special attack strengthened 0 times", [], [], M, S)['preset'] == [], 'B0280')
check(g.enhance_of("Guarantees at least three medals with a SAB of 3 or higher", [], [], M, S)['preset'] == [], 'B0051 solo Tier')
b = g.enhance_of("Has a small chance of drawing a boosted Iago or Monstro with 1000 more base strength, or a boosted Illustrated KH II Kairi or Illustrated KH II Sora with 1000 more base strength and defense", [], [], M, S)['boosted']
check(b == [{'on': {'names': ['iago', 'monstro']}, 'str': 1000, 'def': 0, 'chance': 'small'},
            {'on': {'names': ['illustrated kh ii kairi', 'illustrated kh ii sora']}, 'str': 1000, 'def': 1000, 'chance': 'small'}], 'B0106')
```

Others: B0104 (Dark Riku, World of Chaos, 1000/1000, small); B0514 «SN - Blitz Form Sora with 2000 more base strength and defense» -> 2000/2000; B0631 «Guarantees one boosted version of the following Medals: ...» -> `chance 'guaranteed'` with `on.slots` of the list reservation; B0324 «When drawing a Zexion [+] or Trait Medal #18, it comes with the [[Paralysis+ II Max]] skill at max level» -> `maxSkill [{'on': {'names': ['zexion [+]']}, 'skills': ['paralysis+ ii max']}]` (the Trait is ignored and `'trait'` goes into `notReproduced`); B0348 «Guarantees one 7★ Tier 4 Medal with one of the following Skills at max level: [[Attack Boost VI Max]], ...» -> `on.slots` = the Tier slot, 7 abilities; `pity_gift("If bought 10 times, one Dual Meow Wow [SAB LV 9] is included", M) == [3, 301684, 1]` (B0472) with a synthetic `M` table that contains row 301684.

- [ ] **Step 2: Verify that they fail** — `python recon/tools/test_banner_guarantees.py` -> `ERRORI`.

- [ ] **Step 3: Implementation**

Mapping from research §3: «maximum Special Attack Bonus»/«Special Attack Bonus maxed» -> `dots 'max', guilt 'max'`; «strengthened N times»/«pre-strengthened to N ... dots»/«N-Dot X» -> `dots N` (`1 to 3` -> `[1, 3]`; 0 -> nothing); «SAB of N»/«Level N SAB»/«SAB Tier N» -> no preset (Tier from Task 1). Target: the reservation of the same sentence (`slots`), otherwise the names in the sentence, «the N★ Medal» -> `star`, pronoun -> `featured`. Boosted: «small chance of drawing a boosted ...» and «boosted version of ...» with «1000 more base strength» (def 0), «... and defense» (1000/1000), «2000 more ...» (2000/2000); «Guarantees one boosted version of the following» -> `guaranteed`. `maxSkill`: only the abilities whose normalized names are in `skill_rows` (`skill.json`); the others are counted. `notReproduced`: `trait`, `imitation`, `epic`, `skill` (missing abilities), `pity` (missing target). `make_banner_catalog.main` prints: banners with preset, with boosted (expected ~40), with `maxSkill` covered fully / partly (62 in all), with `pityGift`.

- [ ] **Step 4: Test** — `python recon/tools/test_banner_guarantees.py` and `python recon/tools/test_make_banner_catalog.py` -> `OK`; `python recon/tools/make_banner_catalog.py` with the counts noted in the ledger.

- [ ] **Step 5: Commit** (`msg_2b_t2.txt`; the files of **Files** by name, as in Task 1)

---

### Task 3: boosted rows in the `medal` master

Recommended model: Opus (verification of the client behaviour before the code).

**Files:**
- Create: `server/medal-boost.js`, `server/make-boosted-medals.js`, `server/test-medal-boost.js`
- Modify: `server/make-game-tables.js` (at the end, after `make-guilt-burst`), `server/supernova.js`/`server/blue-fairy.js` only if they look up rows by name without a filter

**Interfaces:**
- Consumes: `banner.enhance.boosted` (Task 2); `medal.json`.
- Produces (Tasks 5, 6):
  - `VARIANTS = {'1000:0': 1, '1000:1000': 2, '2000:2000': 3}`; `boostedId(normalId, str, def) -> number` (`VARIANTS[...] * 1000000 + normalId`)
  - `boostedRow(normal, str, def) -> row`
  - `boostedIndex(medalRows) -> Map<'normalId:str:def', boostedId>`
  - `isBoosted(row) -> bool` (`groupId` != 0)
  - `make-boosted-medals.js`: `patch(masterDir, catalogFile) -> {added, kept}`

- [ ] **Step 1: Verification of the client behaviour (U5, U6)**

Check (private research notes) how the client uses `displayId` of the medal row and the type of medalId. Expected: no reader that uses `displayId` as an image or table index; medalId uint32. If a reader uses it for something else, stop and report before writing code. Note the outcome in `docs/notes/medaglie.md` (Task 10 rereads it).

- [ ] **Step 2: Failing tests**

```js
const N = { medalId: 301993, name: 'SN++ - Master Eraqus', displayId: 300, attack: 44011, maxAttack: 44011, defense: 16591, maxDefense: 16591,
  cost: 46, minCost: 26, groupId: 0, validPack: 0, evolveId: 0, imageId: 301993, sortId: 1861 };
const r = mb.boostedRow(N, 1000, 1000);
check(r.medalId === 2301993 && r.displayId === 301 && r.groupId === 301993, 'id, badge, gruppo');
check(r.attack === 45011 && r.maxAttack === 45011 && r.defense === 17591 && r.maxDefense === 17591 && r.cost === 36 && r.minCost === 16, 'statistiche (video: Cost 36)');
check(r.imageId === N.imageId && r.name === N.name && r.validPack === 0 && r.evolveId === N.evolveId, 'stesse immagini, cella propria, stesso Evolve');
check(mb.boostedRow({ ...N, displayId: 31013 }, 1000, 0).displayId === 1 && mb.boostedRow({ ...N, displayId: 31013 }, 1000, 0).defense === 16591, 'senza badge, solo STR');
check(mb.boostedRow({ ...N, displayId: 1300 }, 1000, 1000).displayId === 1301, 'variante R');
check(mb.boostedIndex([N, r]).get('301993:1000:1000') === 2301993, 'indice');
```

Plus `patch()` on a temporary folder with `medal.json` = `[N]` and a catalog with `enhance.boosted` on «sn++ - master eraqus»: two calls in a row give `{added: 1}` and then `{added: 0, kept: 1}` (idempotent); the normal one stays `groupId 0`; a missing name is counted without throwing.

- [ ] **Step 3: Verify that they fail** — `node server/test-medal-boost.js` -> module error.

- [ ] **Step 4: Implementation**

`boostedRow`: copy of the normal one with `medalId = boostedId`, `attack/maxAttack += str`, `defense/maxDefense += def`, `cost -= 10`, `minCost -= 10` (U1, minimum 0), `displayId` = normal + 1 if the normal one is in {0, 100, 200, 300, 1100, 1200, 1300}, otherwise 1 (U5), `groupId = normal.medalId`; everything else the same (images, name, burst, `guiltValue`, `addMaxAttack/addMaxDefense`, Evolve). `patch`: for every banner with `enhance.boosted`, every name resolved in `medal.json` (rows `type 1`, `groupId 0`, all stars) and every (`str`, `def`) -> row if missing; prints added, already present, missing names. `make-game-tables.js` calls it at the end (after supernova, blue-fairy, guilt-burst) if the catalog exists; check that no search by name in `supernova.js`/`blue-fairy.js` sees rows with `groupId` (filter `!mb.isBoosted(r)` where needed).

- [ ] **Step 5: Test** — `node server/test-medal-boost.js` -> `OK`; `node server/make-boosted-medals.js` -> number of rows added (note it); `node server/test-medal-guilt.js "$PWD/server"` -> `OK`.

- [ ] **Step 6: Commit** (`msg_2b_t3.txt`)

---

### Task 4: guarantee strip in the `drawMedalType` master and revision 121

Recommended model: Sonnet.

**Files:**
- Modify: `server/gacha-data.js` (`drawMedalTypeRow`), `server/make-banners.js`, `server/test-make-banners.js`, `server/test-gacha-data.js` (checks of `drawMedalTypeRow`)
- Modify: `tools/ldplayer/session/run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1` (default 120 -> 121)

**Interfaces:**
- Consumes: `guarantee.pity`, `pityNames` (Task 1).
- Produces (Task 6): `drawMedalTypeRow({..., warrant})` with `warrant = {display, number, validComment}`; `make-banners.warrantOf(banner) -> {display, number, validComment}`; constant `WARRANT_XML_SAFE` (default `false`, U3).

- [ ] **Step 1: Failing tests**

In `test-make-banners.js`: banner with `pity 5` -> row with `warrantDisplayOfTime 5`, `warrantNumberOfTime 5`, `validComment 0`; banner without pity -> `warrantDisplayOfTime 1`, `validComment 1`, `warrantNumberOfTime 0` and today's `comment`; with `WARRANT_XML_SAFE` on and a `pityNames` with «&» -> `validComment 1` and `comment` = `<important>Yuna &amp; Rikku &amp; Paine</important> guaranteed in <important>%d tries</important>!`; never loose `%` outside `%d`.

- [ ] **Step 2: Verify that they fail** — `node server/test-make-banners.js` -> `ERRORI`.

- [ ] **Step 3: Implementation** — `drawMedalTypeRow` receives `warrant` (default `{display: 1, number: 0, validComment: 1}`, today's one) and does not double the `%d` of the XML comment; `masterRows` uses `warrantOf`. Research §2: the strip appears only with `warrantDisplayOfTime` != 0 and `1 <= userWarrantDisplayOfTime <= warrantDisplayOfTime`; with `validComment 0` the client writes «`<important>`Name`</important>` guaranteed in `<important>`N tries`</important>`!» (texts 106180302-308, already served) from the names of `warrantMedalIds`. Default 121 in the four scripts.

- [ ] **Step 4: Test** — `node server/test-make-banners.js`, `node server/test-gacha-data.js` -> `OK`; `node server/make-banners.js` -> 809 rows.

- [ ] **Step 5: Commit** (`msg_2b_t4.txt`; the 4 scripts by name)

---

### Task 5: draw from the slots, Tier, pity and boosted (`server/gacha-data.js`)

Recommended model: Opus.

**Files:**
- Modify: `server/gacha-data.js` (`expandPool` ~65, `pickNamed` ~139, `isListSlot` ~152, `rollDraw` ~157, `slotOdds` ~177), `server/test-gacha-data.js`

**Interfaces:**
- Consumes: contract (Tasks 1-2); `boostedIndex` (Task 3) passed by the server.
- Produces (Tasks 6, 7):
  - `BOOST_SMALL_CHANCE = 0.05`
  - `expandPool(banner, catalog, at)` additionally returns `slotNames: [[name, weight, {rare: [ids]}] per reservation]`, `pityNames`, `pityIds`, `tiers: Map<id, tier>`
  - `rollDraw(banner, ex, rng, state, opts = {}) -> {medalIds, featured, extras}`; `opts.boostedOf(normalId, str, def) -> id | undefined`; `extras[i] = {boostedFrom: id | null, preset: {dots, guilt} | null, skills: [names] | null}`; `featured` = an id of `pityIds` drawn (resets the pity)
  - `slotOdds(banner, ex) -> [[{rare, pct, kind?, tier?}]]` (`kind`: `list`, `tier`, `trait`, `pity`)
  - `reservationOf(banner, i) -> slot | null`

- [ ] **Step 1: Failing tests**

Synthetic catalog as in the previous plan, with the Tier: `hd axel` `[[51, 5, '2016-05-01', 4], [71, 7, '2018-05-14', 4]]`, `zack` `[[72, 7, '2018-05-14', 7]]`, `kairi` `[[61, 6, '2017-01-01', 3], [73, 7, '2018-05-14', 3]]`, `sn only` `[[74, 7, '2018-10-05', 10]]`. Cases:
- synthetic B0306 (`[[7,1],[6,1],[5,8]]`, slot 0 `tier` `tierMax 4`, slot 1 `list` [`kairi`, `sn only`], pity 5 on `hd axel` star 7) at `2018-11-01`: with every `rng` slot 0 is 71 or 73, never 72 or 74; slot 1 is always 61 (decision 1: `sn only` has no 6★); at the fifth draw without the featured medal (`sinceFeatured 4`) slot 0 is 71 and `featured === true`;
- empty Tier at the date -> slot without filter and one log line, no exception;
- fixed-star pity before the date: same banner at `2018-01-10` (no 7★) with `pityStar 7` -> the pity slot gives 51 (5★), never 71;
- pity on the slot of a list reservation that does not contain the target: the reservation yields the slot to the pity only for that draw; if the target is in the list, the list stays guaranteed;
- synthetic B0321: `pitySlot 1` -> slot 0 stays the Tier's;
- boosted `small`: `opts.boostedOf` that knows `71:1000:1000 -> 2000071`, `rng` that is 0.01 on the boosted roll -> `medalIds[0] === 2000071`, `extras[0].boostedFrom === 71`; with 0.5 -> 71; `guaranteed` on the list reservation -> always the boosted one; without a boosted row -> the normal one, without exception;
- preset: `enhance.preset [{on: {slots: [0]}, dots: [1, 3], guilt: null}]` -> `extras[0].preset` with `dots` an integer between 1 and 3; `on: {names: ['hd axel']}` -> preset only on the slots that give Hd Axel; `maxSkill` -> `extras[i].skills`;
- compatibility: a banner without `slots` (catalog of sub-project 2) draws as today (the current checks of `test-gacha-data.js` pass unchanged);
- `slotOdds` of B0306: slot 0 `[{rare: 7, pct: 100, kind: 'tier', tier: '<=4'}]`, slot 1 `kind: 'list'`, slots 2-9 as today.

- [ ] **Step 2: Verify that they fail** — `node server/test-gacha-data.js` -> `ERRORI`.

- [ ] **Step 3: Implementation**

`expandPool`: the stars of `pityStar` and of every `slots[].star` enter the pool of the reserved names only if `firstRarity[star] <= at`; the Tier comes from the 4th field. `rollDraw`: if `guarantee.slots` is present, every reserved slot draws from its reservation (`list`: by name with the featured medal at weight 2, only variants at the slot's star or below, no upgrade above the slot's star for the 6★ lists of decision 1; `tier`: from the star's pool filtered by Tier, alternative `names` added; `trait`: generic slot); then the pity on `pitySlot` (fixed star `pityStar`, if not released at the date the highest below); then the per-slot enhancements (boosted with `rng() < BOOST_SMALL_CHANCE` only for the eligible slots; the boosted rolls are made after the choice of the medal, so the tests with `seq` stay predictable). Without `slots` today's path stays (`list/count/slot`).

- [ ] **Step 4: Test** — `node server/test-gacha-data.js` -> `OK`. On the real catalog: `node -e` that expands every drawable banner at its date and makes 200 draws with `Math.random`: 0 exceptions, 0 medals with date > `asOf`, 0 `tier` slots outside the Tier when the filtered pool is not empty.

- [ ] **Step 5: Commit** (`msg_2b_t5.txt`)

---

### Task 6: delivery to the player, tile with the counter, Nova (`server.js`, `gacha.js`, `guilt-burst.js`)

Recommended model: Opus.

**Files:**
- Modify: `server/server.js` (`respondGachaDraw` ~1172, `respondGachaList` ~1160, `expandFor`), `server/gacha.js` (`plate` ~77, `gachaListData`), `server/guilt-burst.js` (`refresh` ~43), `server/test-gacha-server.js`, `server/test-gacha.js`

**Interfaces:**
- Consumes: `rollDraw` with `extras` (Task 5), `boostedIndex` (Task 3), `warrantOf` (Task 4), `guiltRange` (`medal-guilt.js`), `burstDotFixes`.
- Produces: `gacha.warrantFields(banner, ex, state) -> {userWarrantDisplayOfTime, warrantMedalIds}`; `gachaListData(..., {exFor})`; `/gacha/draw` response with `guiltBurstFirstUserMedalIds`/`guiltBurstMaxUserMedalIds`.

- [ ] **Step 1: Failing tests**

In `test-gacha.js`: `warrantFields` of a banner with pity 5 and `sinceFeatured 0, 1, 4` -> `userWarrantDisplayOfTime` 5, 4, 1 and `warrantMedalIds` = id of the target at the `pityStar`; with an empty `ex.pityIds` -> `{userWarrantDisplayOfTime: 0, warrantMedalIds: [<first id of the pool>]}` (never empty with `validComment 0`); without pity -> `{1, []}` (today).
In `test-gacha-server.js` (synthetic catalog + temporary master with one boosted row and the necessary `burst`/`guiltProb` rows):
- draw with `enhance.preset [{on: {slots: [0]}, dots: 'max', guilt: 'max'}]` on a Tier 10 7★: the delivered medal has `burstUpperNumber` = `maxEnhanceCount` (5) and `guiltFactor` 32000 in `userMedals`, and the response has its `userMedalId` in `guiltBurstFirstUserMedalIds` and in `guiltBurstMaxUserMedalIds` (with the popup turned on by `KHUX_GUILT_BURST_POPUP=1` in the test);
- boosted: synthetic banner with `enhance.boosted` `chance 'guaranteed'` (no roll): the response has the boosted medalId, present in `userMedals`, in its own cell; after reloading the save the medal is identical;
- Nova per group: a boosted medal of a medal already in the `first` registry adds no levels;
- `maxSkill` with an ability present in `skill.json`: `player.medalSkills[userMedalId].level === maxLv`; with a missing ability no skill and no error;
- `pityGift [3, 301684, 1]` at the pity-th draw: one entry in the Present Box, no extra medal in the result;
- `/gacha/list`: the tile of the banner with pity has a `userWarrantDisplayOfTime` that goes down after every draw without the target and goes back to the pity when the target comes out.

- [ ] **Step 2: Verify that they fail** — `node server/test-gacha-server.js`, `node server/test-gacha.js` -> `ERRORI`.

- [ ] **Step 3: Implementation**

`respondGachaDraw`: `rollDraw(..., { boostedOf })` with the master index (memoized, cleared by `reloadGachaBanners`); for every delivered medal, if `extras[i].preset`: `setMedalState(newId, {burstUpperNumber: min(dots, maxEnhanceCount corretto), guiltFactor: guilt === 'max' ? guiltRange(guiltProb, tier).max : 0})` (with `guilt 'max'` the dots always go to max, research §3); if `extras[i].skills`: the first ability present (chosen at random among those present) at `level = maxLv`, same format as today's drawn ability; `pityGift` -> `addPresent` when the pity triggers; the response adds `...guiltBurst().lists()`. `gacha.plate` receives `warrantFields`. `guilt-burst.refresh`: key `row.groupId || row.medalId` (registry unchanged for the normal ones). The popup stays behind `KHUX_GUILT_BURST_POPUP` until Task 10.

- [ ] **Step 4: Test** — `node server/test-gacha-server.js`, `test-gacha.js`, `test-gacha-data.js`, `test-make-banners.js`, `test-medal-boost.js`, `test-beginner.js`, `test-medal-guilt.js "$PWD/server"` -> all `OK`.

- [ ] **Step 5: Commit** (`msg_2b_t6.txt`)

---

### Task 7: WebView pages and Notices

Recommended model: Sonnet.

**Files:**
- Modify: `server/gacha.js` (`detailPage`, `oddsPage`), `server/routes-info-album.js` (`DIFFERENCES_BODY`, notice «Shop»), `server/test-gacha.js`, `server/test-notices.js`

**Interfaces:**
- Consumes: `slotOdds` with `kind`/`tier` (Task 5), `guarantee.*`, `enhance.*` (Tasks 1-2), `BOOST_SMALL_CHANCE`.
- Produces: pages; no new function for other tasks.

- [ ] **Step 1: Failing tests**

`detailPage` of the synthetic B0306 contains «1x 7★ Tier 4 or lower», «1x one of the listed Medals (6★)», «HD Axel (7★) guaranteed within 5 draws (original)»; with `enhance.boosted small` the line «Small chance of a boosted version (+1000 STR, +1000 DEF): 5% per eligible Medal (reconstructed)»; with preset «comes with its Special Attack Bonus maxed (original)»; with `erratum` the sentence in a box; with `notReproduced ['trait']` «Trait Medal: not reproduced, a regular Medal of the same rarity instead». `oddsPage` shows `kind` per slot. `test-notices.js`: the new lines are there, the Tier line «not enforced yet» and the single Trait/boosted/strengthened line are no longer there.

- [ ] **Step 2: Verify that they fail** — `node server/test-gacha.js`, `node server/test-notices.js` -> `ERRORI`.

- [ ] **Step 3: Implementation** — `DIFFERENCES_BODY`: remove «Some deals limited the guaranteed Medal to a Tier range ... not enforced yet.» and replace the Trait/boosted line with two: «Trait Medals no longer exist: where a deal guaranteed a Trait Medal you get a random Medal of the same rarity instead.» and «Boosted Medals: the chance of a boosted version on deals that offered one is reconstructed (5% per eligible Medal). Guaranteed max-level Skills are given only for Skills that exist in this restoration.» The lines stay in `DIFFERENCES_BODY` (no new notice). Notice «Shop»: «Guarantees work as on the original banners: the yellow line under a banner counts down the draws left to its guaranteed Medal.»

- [ ] **Step 4: Test** — the two tests -> `OK`.

- [ ] **Step 5: Commit** (`msg_2b_t7.txt`)

---

### Task 8: JP import of the Nova popup and of the boosted resources

Recommended model: Sonnet (mechanical extension of an existing import).

**Files:**
- Modify: `recon/tools/import_jp_raisedraw.py` (`JP` ~66, `WANTED` ~72, `main` ~206), `recon/tools/test_import_jp_raisedraw.py`, `recon/tools/jp_coco_layouts.txt`

**Interfaces:**
- Consumes: `btf.encode`; JP 4.3.1 in the local reference data folder (`KHUX_JP_DATA`).
- Produces (Tasks 9, 10): in the package `raisedraw_gen\files`: `lwf/medal/guilt_bonus/GuiltBonus_BurstLvup/`, `GuiltBonus_BurstLvup_num/`, `GuiltBonus_Wfix0..9/`, `lwf/raisedraw/demo/Draw_StatusBonus/`, `img/ui/Minfo_Def12_SB.png`, `img/ui/Deck_Panel_SB.png`; option `--replace <published path>=<png>` (used by the logo, Task 9); JSON report with one entry per folder.

- [ ] **Step 1: Failing tests**

In `test_import_jp_raisedraw.py`: `WANTED` contains the 13 new folders with the `lwf/` prefix (JP root raised to `jp_final_4.3.1`, the old entries become `lwf/raisedraw/...`); on a synthetic JP root with an LWF of one texture and `--replace`, the texture written is the one of the replacement file (BTF, same declared dimensions, otherwise folder not ok); `STATIC` (`img/ui/*_SB.png`) copied as BTF; with the real JP root (`--check`): all the new folders `ok`.

- [ ] **Step 2: Verify that they fail** — `python recon/tools/test_import_jp_raisedraw.py` -> `ERRORI`.

- [ ] **Step 3: Implementation** — JP root one folder up (`jp_final_4.3.1`), `WANTED` with full paths from `lwf/`; for the new folders only source (1) is used (same JP file; no WW reference); `STATIC` copied like the textures; `--replace` applied after the copy. `jp_coco_layouts.txt`: line `MedalInfo_Burst_Info.json` (uses only `Panel03.png`, already served).

- [ ] **Step 4: Test** — `python recon/tools/test_import_jp_raisedraw.py` -> `OK`; `python recon/tools/import_jp_raisedraw.py --ww D:/Progetto_Restauro_KH_UX/catalog/raisedraw_ww --out D:/Progetto_Restauro_KH_UX/tmp/sp2b/rd_check --report D:/Progetto_Restauro_KH_UX/tmp/sp2b/rd_check.json --check` -> all `ok` (outside the real package: the bench does not change).

- [ ] **Step 5: Commit** (`msg_2b_t8.txt`)

---

### Task 9: «NOVA» logo of the popup

Recommended model: Opus (visual work, comparison with the frames).

**Files:**
- Create: `recon/tools/make_nova_logo.py`, `recon/tools/test_make_nova_logo.py`
- Modify: `tools/ldplayer/session/build-resources.ps1` (logo before `import_jp_raisedraw.py`, passed with `--replace`)

**Interfaces:**
- Consumes: JP `Burst_Logo.png`/`Burst_Logo_B.png` (422x142), frame `reference\nova_lvup\02_*.jpg`; `--replace` (Task 8).
- Produces: `make_nova_logo.build(jp_logo, jp_glow, frame) -> (logo: Image RGBA 422x142, glow: Image 422x142)`; files in `D:\Progetto_Restauro_KH_UX\raisedraw_gen\nova\` (outside git).

- [ ] **Step 1: Failing tests** — `build` on synthetic images: outputs 422x142, `logo.mode == 'RGBA'`; the icon part (columns to the left of the lettering, detected from the JP alpha) identical to the JP one pixel by pixel; the glow is a white silhouette with the feathered alpha of the new lettering (no pixel with alpha > 0 outside the outline widened by 8 px).

- [ ] **Step 2: Verify that they fail** — `python recon/tools/test_make_nova_logo.py` -> ImportError.

- [ ] **Step 3: Implementation** — the icon stays the JP one; the «NOVA» lettering is taken from the frame (crop of the lettering, scale and position of the JP «BURST», background removed using the black outline as the edge) in the same orange-red style with a black outline; the `_B` glow is the feathered white silhouette (Gaussian blur of the alpha) of the new lettering plus the JP icon. `main()` reads the JP paths from the root of Task 8 and writes the two PNGs.

- [ ] **Step 4: Test and visual check** — `python recon/tools/test_make_nova_logo.py` -> `OK`; generate the two PNGs and open them with the Read tool next to `reference\nova_lvup\02_*.jpg`: same rendering (colours, outline, proportions); if in doubt show them to the user before Task 10.

- [ ] **Step 5: Commit** (`msg_2b_t9.txt`)

---

### Task 10: resources 41, popup on, bench tests and documentation

Recommended model: Opus (bench).

**Files:**
- Modify: `server/guilt-burst.js` (popup on by default, `KHUX_GUILT_BURST_POPUP=0` to turn it off), `docs/notes/shop.md`, `docs/notes/guilt.md`, `docs/notes/battaglia.md`, `docs/notes/medaglie.md`, `docs/ISSUES.md` (I-144 closed, I-146 stays), `HANDOFF.md`, `docs/notes/server.md`

- [ ] **Step 1: Generation and resources (bench stopped)**

Copy `server\save` to `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-2b`. Then `python recon/tools/make_banner_catalog.py`, `node server/make-game-tables.js` (boosted rows), `node server/make-banners.js`; `.\tools\ldplayer\session\build-resources.ps1 -Version 41`; `update-resources.ps1 -Revision 121`. Expected: download completed, home reached, `GET /master/drawMedalType` and `/master/medal` in the log.

- [ ] **Step 2: Popup on** — `guilt-burst.js`: `lists()` and `gained()` send the pending copies unless `KHUX_GUILT_BURST_POPUP === '0'`; update the header comment. `node server/test-gacha-server.js` -> `OK`. Commit together with the documentation (Step 6).

- [ ] **Step 3: Bench tests** (in series, `AppAlive` before every tap, SKIP in the dialogues, screenshots `Shot 2b_<name>`)

1. B0306 (`relogin.ps1 -Tag 2b -GachaShow B0306`): slot 0 a 7★ of Tier <= 4, slot 1 one of the 8 6★ lists; the yellow strip «HD Axel guaranteed in 5 tries!» goes down to 4, 3, 2, 1 («1 try»), and at the fifth draw HD Axel 7★ comes out on slot 0; then the strip goes back to 5.
2. B0629: 1 New Enemy 7★ + 3 KH III 6★ in every draw (image 10629).
3. Banner with guilt at max (B0310 or a drawable banner with preset `max`, chosen from `gacha_catalog.json`): after the OK of the result the «NOVA LEVEL UP!» popup with LV a » LV b, +1 and then +5 with «Maxed out X's Special Attack Bonus!» and TAP SCREEN (U4: note whether the +1 shows the box); comparison with `reference\nova_lvup`. If `userDetail.isGuilt` is 0 and the guilt is not visible, note it (research §3).
4. Banner with pity on a name with «&» (chosen from `gacha_catalog.json`): readable strip (U3); if broken, `WARRANT_XML_SAFE = true`, `node server/make-banners.js`, revision 122, retry.
5. Boosted (`-GachaShow` with a `guaranteed` banner, e.g. B0631): «BOOSTED» band in the result, in the details yellow STR/DEF/Cost and the No. of the normal one, red LV label in the list (`reference\shop_boosted`); Level Up with the normal one as material (U2: preview and result), Cid on the boosted one (U1), no Nova +1 for a boosted medal of an already guilted medal (U7), Medal List and Evolve opened without crash (U6).
6. Banner with abilities at max (B0324 or B0348): ability at max level in the details, if present in the master.
7. User test with the reduced save for the Nova (spec 6.6): the user draws from a banner with guilt at max and confirms the popup.
8. Ten openings of the Shop and of the Notices: no crash, new lines present.

After a crash: stop everything, `tools\ldplayer\tombstone.ps1`, ISSUE opened, the task stays open. At the end server without `-GachaShow` and save restored from the backup if the tests altered it.

- [ ] **Step 4: Outcomes of the uncertainties** — for U1-U7 write in `docs/notes/shop.md` (section «Sotto-progetto 2b») the outcome and, if a choice changes, the commit that corrects it (with a new revision if it touches the master).

- [ ] **Step 5: Documentation** — `shop.md`: contract v3, commands in order, rules of slots/pity/strip/boosted/preset, outcomes with the screenshot names. `guilt.md`/`battaglia.md`: popup on, JP LWFs and NOVA logo, group key of the Nova. `medaglie.md`: boosted rows and displayId. `ISSUES.md`: I-144 closed; new ISSUEs for whatever emerged. `HANDOFF.md`: resources 41, BASE 121 (or later). `server.md`: `KHUX_GUILT_BURST_POPUP=0`.

- [ ] **Step 6: Commit** (`msg_2b_t10.txt`)

```bash
git -c safe.directory=* add server/guilt-burst.js docs/notes/shop.md docs/notes/guilt.md docs/notes/battaglia.md docs/notes/medaglie.md docs/ISSUES.md HANDOFF.md docs/notes/server.md
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_2b_t10.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

## Order and dependencies

Task 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 (catalog, master, server, pages: in series, each uses the interfaces of the previous one). Tasks 8 -> 9 are independent of Tasks 1-7 and can run in parallel (no bench). Task 10 starts only with all the others closed; the bench stays serial.
