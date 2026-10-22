# Shop, sub-project 2: list of the original banners — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the 808 original banners (813 minus Blind Box and tutorial) are described by a generated catalog with type, prices, currency, dates, unlock quest, per-era pool and guarantees; the server draws them with the reconstructed odds of spec 9.2, the WebView catalog shows them all, and the Shop shows a provisional list (banners unlocked and active at the date of the point in the story) until sub-project 3 brings rotation and filters.

**Architecture:** two Python scripts in the repo (`recon/tools/banner_sources.py`, `recon/tools/make_banner_catalog.py`, ported from the research scripts in `D:\Progetto_Restauro_KH_UX\tmp\sp2\scripts`) read the wiki, the banner TSV, the notices and `medal.json` and write `server/game_data/gacha_catalog.json`: for each banner a pool **recipe** (sub-sets, names, mode), plus the tables of the sub-sets and of the medals with the date of each rarity. A third script (`recon/tools/make_banner_images.py`) writes the 640x140 images. The server expands the recipes at the right date (`server/gacha-data.js`), applies prices, currencies, limits and guarantees (`server/gacha.js`) and writes the `drawMedalType` master with `server/make-banners.js`.

**Tech Stack:** Node (server, no external dependencies), Python 3 + Pillow (`recon/tools`), PowerShell (LDPlayer bench).

**Spec:** `docs/superpowers/specs/2026-10-16-shop-banner-design.md`, section 9 (decisions of sub-project 2, approved on 16-10) and sections 3, 4.4, 4.8, 6 point 2. Research and supporting data: `D:\Progetto_Restauro_KH_UX\tmp\sp2\research.md` (+ `banners_sp2.tsv/.json`, `subsets.json`, `medal_release.json`, `ends.tsv`, `incomplete.tsv`, `images.tsv`, `stats.json`, scripts in `scripts\`). Sub-project 1: `docs/superpowers/plans/2026-10-16-shop-estrazioni.md`, `docs/notes/shop.md`.

## Global Constraints

- Original APK unmodified: only server responses, master tables, downloadable resources and WebView pages are changed.
- Repo: only original code and documentation. Never APKs, assets, master data, images, wiki or notice texts in the repo: `server/master_data/`, `server/game_data/`, `server/save/` are ignored by git. In the repo only the scripts and `recon/tools/banner_overrides.tsv` (data written by us: numbers read from the notices, with the source).
- Git: always `git -c safe.directory=*`; message in a UTF-8 file without BOM in `D:\Progetto_Restauro_KH_UX\tmp\msg_*.txt` written with the Write tool, then `git commit -F <file>`; `git pull --rebase` before `git push`; messages in Italian ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `git add -A` (files by name; `.claude/` is not tracked). Commit and push at every verified task.
- Agent shells: heredoc and echo turn `\t` and `\f` into control bytes. Write the files with Edit/Write and after every change check that there are no control bytes other than `\n` (and `\t` only in TSVs): `python -c "import sys;d=open(sys.argv[1],'rb').read();print([i for i,b in enumerate(d) if b<32 and b not in (9,10,13)][:5])" <file>`.
- Code and comments in Italian, in the style of the neighbouring files. Texts shown to the player in English.
- Tests: standalone scripts (`node server/test-<name>.js`, `python recon/tools/test_<name>.py`) that print `OK: ...` or `ERRORI (n)` and exit with 1; never the real save (`KHUX_SAVE` in a temporary folder).
- Tiles: never `price` 0, never `benefitId` != 0, never payType 3 or 9 in the list. Jewels = payType 1. payType 4/5/6 (Bronze/Silver/Gold, PvP) only in the catalog (spec 9.6). The Catalog tile stays payType 6, id 9001.
- `/gacha/draw` response: `effectNumbers` only 0; `gachaBonus` always `{addType: 1, number: 0, userMedalIds: []}`; every id in `userMedalIds` must appear in `userMedals` of the response; at most 10 medals.
- Rarities and medals only if released by the banner's reference date (spec 9.3): no 6★ drawable before 15/07/2016, no 7★ before 25/05/2018. No exception for free or VIP banners (spec 9.5, user's request).
- Every difference from the original must be explained in the in-game Notices, in English.
- Bench: taps only while the game is alive (`AppAlive`); SKIP in dialogues; copy the save before testing; heavy files in `D:\Progetto_Restauro_KH_UX\tmp`.

## Review Focus

1. Permanent banner (DAILY DEAL!, SMALL DEAL!) for a player at the start of the story: the pool contains only medals released by the date of their point in the story, never medals of later sets (test in Task 5).
2. Free Deal VIP and free banners: they cost 1 Jewel, a single free VIP draw per day across all of them, and the pool respects the banner date like the others (test in Task 6).
3. Banner with decreasing price or free first draw: the price in the list and the one deducted match after every draw (counter saved in `player.gacha.count`; test in Task 6).
4. payType 8 currencies: the list never shows two banners of different currencies together and `limitedDrawTicket2` reports the listed currency; an old save with `limitedDrawTicket2` does not lose tickets (test in Tasks 6 and 8).
5. Stackable medals (Dual Meow Wow of the Platinum Ticket Draw): the returned id is the one of the cell the client sees, present in `userMedals` (test in Task 8).

---

## Files

| File | Status | Responsibility |
|---|---|---|
| `recon/tools/banner_sources.py` | new | dated sub-sets, medals per set, date of each rarity, complete notes of the wiki Shop rows |
| `recon/tools/make_banner_catalog.py` | new | banner recipes: type, flags, currency, prices, dates, unlock, pool, guarantees, skills, «catalog only» reasons; writes `server/game_data/gacha_catalog.json` |
| `recon/tools/banner_overrides.tsv` | new | prices/sizes/dates read from the notices for the incomplete rows (our data, with the source) |
| `recon/tools/make_banner_images.py` | new | 640x140 images (palette or full-colour PNG) in `server/game_data/gacha_img/` |
| `recon/tools/test_banner_sources.py`, `test_make_banner_catalog.py`, `test_make_banner_images.py` | new | offline tests |
| `server/gacha-data.js` | modify | catalog, date of the point in the story, pool expansion, 9.2 odds, draw, skills |
| `server/make-banners.js` | rewritten | `drawMedalType` master (Catalog tile + 808 banners) from the catalog |
| `server/gacha.js` | modify | provisional list, dynamic prices, currencies, daily and VIP limits, pity, WebView pages |
| `server/server.js` | modify | catalog loading, ticket migration, stackable cells, drawn skills, `KHUX_GACHA_SHOW` |
| `server/routes-info-album.js` | modify | Notices |
| `server/test-gacha-data.js`, `test-make-banners.js`, `test-gacha.js`, `test-gacha-server.js` | modify | offline tests |
| `tools/ldplayer/session/run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1` | modify | revision 119, `-GachaShow` instead of `-GachaTest` |
| `docs/notes/shop.md`, `docs/ISSUES.md`, `HANDOFF.md`, `docs/notes/server.md` | modify | status |

## Format of `server/game_data/gacha_catalog.json` (contract between Python and Node)

```json
{
  "version": 2,
  "firstRarity": {"3": "2016-04-07", "4": "2016-04-07", "5": "2016-04-07", "6": "2016-07-15", "7": "2018-05-25"},
  "story": [[1, 200, "2016-04-07"], [201, 250, "2016-04-21"]],
  "subsets": {"1.1": {"date": "2016-04-07", "names": ["kairi", "sora"]}},
  "medals": {"sora": {"date": "2016-04-07", "cls": "", "class2": "Attack", "ids": [[1001, 3, "2016-04-07"], [1002, 4, "2016-04-07"]]}},
  "banners": [{
    "rowId": "B0001", "drawMedalTypeId": 10001, "name": "DAILY DEAL!", "type": "DAILY",
    "flags": ["DAY_LIMITED", "PERMANENT"], "start": "2016-04-07", "end": "2018-01-31", "endSource": "original",
    "unlockQuest": 200, "payType": 1, "currency": "jewel", "prices": [600], "lotCount": 3,
    "rarityMix": [[4, 1], [3, 2]], "epicBoost": false, "dayLimit": 1, "vipFree": false,
    "pool": {"mode": "released", "sets": [], "names": [], "featured": [], "inheritAfter": null, "evolve": null},
    "guarantee": {"list": [], "count": 0, "pity": null, "every": null},
    "skill": null, "bonus": [], "catalogOnly": null, "image": "Shop_-_DAILY_DEAL!_banner_KHUX.png", "imageFrom": "B0001",
    "notes": "...", "guaranteesText": "", "notesSource": "wiki"
  }]
}
```

- Medal names always **normalised** (`norm`: spaces unified, lowercase, `\u00a0` -> space).
- `medals[n].ids`: only `medal.json` rows with `type === 1` and `validPack !== 1`; third field = date of the variant (`rare_date` of the research, never before `date`).
- `pool.mode`: `sets` (notes «Draws from sets»), `list` (notes «Draws from the following medals»), `inherit` (last documented banner + releases after `inheritAfter`), `released` (all the standard medals released by the date), `evolve` (`evolve: [[medalId, level], ...]`, explicit ids, stackable ones included).
- `currency`: `jewel`, `platinum`, `draw`, `holiday`, `spooky`, `moogle`, `bronze`, `silver`, `gold`, `points`.
- `catalogOnly`: `null`, `INCOMPLETE`, `PVP_TICKETS`, `DRAW_POINTS`, `VIP_TWIN`.
- `skill`: `null`, `{"table": "50106", "slots": "first"}` (SKILL), `{"table": "72415", "slots": "all"}` (SN, SEVEN).
- `bonus`: items given with every draw (notes «Includes N bonus ...», spec 9.2): `[[resourceType, id, number], ...]` with 3 = medal (Magic Mirror 90156, Magic Broom 300948, ...) and 5 = material (Power Gem 48, Speed Gem 49, Magic Gem 50, ...); they go to the Present Box.
- `end`: `null` only if the original has no end and no rule reconstructs it (no case expected after Task 3).

---

### Task 1: bench test of the palette PNG

Recommended model: Opus (bench).

**Files:** no repo file. Only `server/game_data/gacha_img/10001.png` (outside git).

**Interfaces:**
- Produces: the «palette» or «full» decision for `make_banner_images.py` (Task 4), written in the execution log and in `docs/notes/shop.md` in Task 9.

- [ ] **Step 1: Copy and conversion**

Copy `server\save` to `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-sp2`. Copy `server\game_data\gacha_img\10001.png` to `D:\Progetto_Restauro_KH_UX\tmp\sp2\10001_full.png`, then:

```bash
python -c "from PIL import Image;im=Image.open('D:/Progetto_Restauro_KH_UX/tmp/sp2/10001_full.png').convert('RGB');im.quantize(256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.FLOYDSTEINBERG).save('server/game_data/gacha_img/10001.png',optimize=True)"
```

Expected: the new file is about a quarter of the old one; `python -c "from PIL import Image;print(Image.open('server/game_data/gacha_img/10001.png').mode)"` prints `P`.

- [ ] **Step 2: Bench**

Server with `tools\ldplayer\session\relogin.ps1 -Tag pal` (revision 118). With `. .\tools\ldplayer\bench_lib.ps1`: Shop > Draw, screenshot `Shot sp2_palette`. Expected: the Daily Deal banner looks as before, without stripes or an empty image; no crash.

- [ ] **Step 3: Outcome**

If the image is correct: «palette» decision. If it is missing or damaged: «full» decision (full-colour PNG, ~129 MB). Put `10001_full.png` back in its place anyway. No commit (no repo file changes): note the outcome in the execution log.

---

### Task 2: `recon/tools/banner_sources.py` (sub-sets, medal dates, complete notes)

Recommended model: Sonnet.

**Files:**
- Create: `recon/tools/banner_sources.py`
- Create: `recon/tools/test_banner_sources.py`

**Interfaces:**
- Consumes: `D:\Progetto_Restauro_KH_UX\tmp\sp2\scripts\common.py`, `sets.py`, `medals.py`, `wikishop.py` (research code to port).
- Produces (used by Task 3):
  - `norm(s) -> str`
  - `infomedals(wiki: dict) -> list[dict]`
  - `english_subsets(wiki) -> {'subsets': [...], 'extras': [...], 'nasets': {...}}` (same format as `subsets.json`)
  - `medal_release(subsets: dict, wiki: dict, medal_rows: list, banner_rows: list) -> list[dict]` (same format as `medal_release.json`: `name, set, subset, date, date_src, cls, class1, class2, nano, rows, rare_date`)
  - `wiki_shop_rows(wiki) -> list[dict]` (same format as `wiki_shop_rows.json`)

- [ ] **Step 1: Failing test**

`recon/tools/test_banner_sources.py`, in the style of `test_import_jp_raisedraw.py` (`errori` list, `check`, «OK»/«ERRORI»). Synthetic wiki:

```python
WIKI = {
    'Category:English Set 1': "Set 1 was released in April 2016.\n"
        "*'''Medal Set 1.2''' was released on April 21 and consists of [[Alice]] and [[Hades|Hades]].\n"
        "*[[Moogle Medal]] was distributed on May 2.\n",
    'Category:English Set 2': "Set 2 was released in May 2016.\n"
        "*'''Medal Set 2.1''' was released on May 13 and consists of {{KA|1}} and [[Sephiroth]].\n",
    'Template:NASets': "! colspan=2 |Medal Set 1 (Apr. 2016)\n|[[Sora|Sora]] [[Alice|Alice]]<sup>SR</sup> [[Hades|Hades]]\n"
        "! colspan=2 |Medal Set 2 (May 2016)\n|[[Key Art 1|Key Art #1]] [[Sephiroth|Sephiroth]]\n",
    'Sora': "{{InfoMedal\n|name=Sora\n|class1=\n|class2=Attack\n|nano3=10\n|nano4=11\n|nano7=1500\n}}",
    'Sephiroth': "{{InfoMedal\n|name=Sephiroth\n|class2=Attack\n|nano5=200\n}}",
}
```

For the loops 1-59 of `english_subsets`, the missing pages count as empty text and must be skipped (the research had them all: add `if not hm: continue`). Checks:
- `english_subsets(WIKI)['subsets']` contains `{'set': 1, 'id': '1.2', 'date': '2016-04-21', 'members': ['Alice', 'Hades'], ...}` and `{'set': 2, 'id': '2.1', 'date': '2016-05-13', 'members': ['Key Art #1', 'Sephiroth'], ...}`;
- `extras` contains the Moogle Medal with date `2016-05-02`;
- `nasets['1']['medals']` (string key as in the JSON) has Alice with `cls` `SR`;
- `medal_release(...)` with `medal_rows = [{'medalId': 1001, 'name': 'Sora', 'rare': 3, 'type': 1, 'validPack': 0, 'darklight': 1}, {'medalId': 301001, 'name': 'Sora', 'rare': 7, 'type': 1, 'validPack': 0, 'darklight': 1}]` and `banner_rows = []`: Sora has `subset` `1.1`, `date` `2016-04-07`, `rows` with both rows;
- `norm('Hades\u00a0 A')` == `'hades a'`.

The test calls the functions with in-memory data (no files).

- [ ] **Step 2: Verify that it fails**

Run: `python recon/tools/test_banner_sources.py`
Expected: ImportError (`banner_sources` does not exist).

- [ ] **Step 3: Implementation (port)**

Create `recon/tools/banner_sources.py` by copying the functions of the research scripts, with these changes and nothing else:
- header: comment on the purpose (sources: khuxwiki Category:English Set 1-59, Template:NASets, InfoMedal; Shop/2016-2020 rows) and on the fact that the data read stays outside the repo;
- from `common.py`: only `infomedals`; no absolute paths: the functions receive the data as arguments;
- from `sets.py`: `toks` and the body of `main` become `english_subsets(wiki)` which **returns** the dictionary (no `json.dump`, no print), with `if not hm: continue` for the missing pages; `nasets` keys as strings (`str(n)`);
- from `medals.py`: `norm` and the body of `main` become `medal_release(subsets, wiki, medal_rows, banner_rows)` which returns `out` (no files); the `MONABBR` dictionary stays local;
- from `wikishop.py`: `norm_img` and `wiki_shop_rows(wiki)` which returns the list;
- at the bottom `if __name__ == '__main__':` which, given `--wiki`, `--medals`, `--banners` and `--out DIR`, writes the three JSONs in `DIR` (same names as the research files), for manual comparison.

- [ ] **Step 4: Test and comparison with the research**

Run: `python recon/tools/test_banner_sources.py` -> `OK`.
Run: `python recon/tools/banner_sources.py --wiki D:/Progetto_Restauro_KH_UX/wiki/wiki_all.json --medals server/master_data/medal.json --banners D:/Progetto_Restauro_KH_UX/reference/banners/banners_ww.tsv --out D:/Progetto_Restauro_KH_UX/tmp/sp2/port`
Expected: the three files in `tmp\sp2\port` are equal to those in `tmp\sp2` (`python -c` that loads the pairs and compares with `==`); 248 sub-sets, 816 medals, 795 with rows.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add recon/tools/banner_sources.py recon/tools/test_banner_sources.py
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t2.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 3: `recon/tools/make_banner_catalog.py` (banner recipes)

Recommended model: Opus (many rules, cross-check with the research numbers).

**Files:**
- Create: `recon/tools/make_banner_catalog.py`
- Create: `recon/tools/banner_overrides.tsv` (header only in this task)
- Create: `recon/tools/test_make_banner_catalog.py`

**Interfaces:**
- Consumes: `banner_sources` (Task 2); `D:\Progetto_Restauro_KH_UX\tmp\sp2\scripts\analyze.py` and `incomplete.py` (code to port).
- Produces: `server/game_data/gacha_catalog.json` in the format of the contract above; public functions used by the tests: `classify(row, notes)`, `parse_price(p)`, `currency_of(row, typ)`, `end_of(row, typ, rows, notices)`, `unlock_quest(start, story)`, `pool_recipe(row, notes, typ, docs, sub_members)`, `guarantee_of(row, notes)`, `day_limit(notes, typ)`, `vip_twins(rows)`, `bonus_of(notes, medal_rows, material_rows)`, `build_catalog(inputs) -> dict`.

- [ ] **Step 1: Failing test**

`recon/tools/test_make_banner_catalog.py` with synthetic rows (dictionaries with the columns of `banners_ww.tsv`: `row_id, name, start_pt, end_pt, status, currency, price, draw_size, rarity_mix, featured_medals, guarantees, notes, image_file, image_size, seasonal, event_tie_in, source_url, confidence`). Checks:

```python
R = lambda **k: {**{c: '' for c in COLS}, **k}
check(m.classify(R(name='Spirit Blind Box'), '') == 'X_BLINDBOX', 'blind box')
check(m.classify(R(name='Platinum Ticket Draw', currency='Platinum Ticket'), '') == 'T_EVOLVE', 'evolve')
check(m.classify(R(name='Spooky Cookies Deal', currency='Spooky Cookie'), '') == 'T_TICKET', 'spooky')
check(m.classify(R(name='Free Deal (VIP)', currency='Free, VIP only'), '') == 'FREE', 'free vip')
check(m.classify(R(name='Supernova - Sephiroth'), '') == 'SN', 'sn')
check(m.classify(R(name='DAILY DEAL!'), '') == 'DAILY', 'daily')
check(m.parse_price('1st: Free, 2nd+: 3000') == [0, 3000], 'first free')
check(m.parse_price('1900, 3000, 2500, 2200') == [3000, 2500, 2200, 1900], 'scalini')
check(m.parse_price('VIP Only Free') == [0], 'gratis')
check(m.currency_of(R(currency='Spooky Cookie'), 'T_TICKET') == (8, 'spooky'), 'valuta spooky')
check(m.currency_of(R(currency='Holiday Draw Ticket'), 'T_TICKET') == (8, 'holiday'), 'valuta holiday')
check(m.currency_of(R(currency='Free, VIP only'), 'FREE') == (1, 'jewel'), 'gratis in jewel')
check(m.currency_of(R(currency='Gold Ticket'), 'T_EVOLVE') == (6, 'gold'), 'gold')
STORY = [[1, 200, '2016-04-07'], [201, 250, '2016-04-21'], [251, 300, '2016-05-12']]
check(m.unlock_quest('2016-04-20', STORY) == 200 and m.unlock_quest('2016-05-12', STORY) == 300, 'sblocco')
check(m.day_limit('You may draw ONCE per day', 'FEATURED') == 1 and m.day_limit('Top-Drawer 3 times per day', 'DAILY') == 3, 'limite giornaliero')
g = m.guarantee_of(R(guarantees='If bought 10 times, at least one Illustrated Cloud is guaranteed'), '')
check(g == {'list': [], 'count': 0, 'pity': 10, 'every': None, 'featured': ['illustrated cloud']}, f'pity {g}')
g = m.guarantee_of(R(), 'Guarantees three of the following Medals: SN++ - Fiend, Key Art #22. *Draws')
check(g['list'] == ['sn++ - fiend', 'key art #22'] and g['count'] == 3, f'lista {g}')
g = m.guarantee_of(R(), 'You are guaranteed to get one of the following Medals every 3rd draw! [[SN++ - Xemnas B]]')
check(g['every'] == 3, 'every 3rd')
twins = m.vip_twins([R(row_id='B1', name='Supernova Deal', start_pt='2019-03-01', currency='Jewels'),
                     R(row_id='B2', name='Supernova Deal (VIP)', start_pt='2019-03-01', currency='Jewels, VIP only'),
                     R(row_id='B3', name='Free Deal (VIP)', start_pt='2020-05-01', currency='Free, VIP only')])
check(twins == {'B2'}, f'gemelli VIP {twins}')
```

`guarantee_of` also returns `featured` (normalised names from the phrase «If bought N times ... X»; for «within N draws» `pity = N` and `featured` = the row's showcased medals). The integration test (last check) runs only if the real files exist:

```python
if os.path.exists(WIKI) and os.path.exists(TSV):
    cat = m.build_catalog(m.default_inputs())
    bs = cat['banners']
    check(len(bs) == 808, f'banner {len(bs)}')
    from collections import Counter
    t = Counter(b['type'] for b in bs)
    check(t == Counter({'SN': 213, 'FEATURED': 168, 'FALLING': 129, 'SKILL': 69, 'DAILY': 64, 'SEVEN': 48, 'FREE': 36,
                        'STANDARD': 23, 'T_TICKET': 21, 'ITEM': 20, 'T_POINTS': 7, 'BEGINNER': 5, 'T_EVOLVE': 5}), f'tipi {t}')
    check(sum(1 for b in bs if b['unlockQuest'] <= 525) == 78, 'sbloccati a 525')
    check(sum(1 for b in bs if b['catalogOnly'] == 'VIP_TWIN') == 41, 'gemelli VIP')
    check(all(b['end'] for b in bs), 'tutte le date di fine')
    b11 = next(b for b in bs if b['rowId'] == 'B0011')
    check(b11['pool']['sets'] == ['1.1', '1.2', '1.3', '2.1'] and b11['epicBoost'], 'B0011 senza 2.2 e Epic')
```

- [ ] **Step 2: Verify that it fails**

Run: `python recon/tools/test_make_banner_catalog.py`
Expected: ImportError.

- [ ] **Step 3: Implementation (port of `analyze.py` + rules of spec 9)**

`make_banner_catalog.py` ports from `analyze.py` `full_notes`, `classify`, `parse_price`, `series_key`, `notice_end`, `end_of`, `unlock_quest`, `setrefs`, `names_listed` and the pool part of `main`, without global variables (the data is passed as arguments). Changes compared to the research:

1. **Inputs** (`default_inputs()`): `KHUX_WIKI_JSON` (default `D:/Progetto_Restauro_KH_UX/wiki/wiki_all.json`), `KHUX_BANNERS_TSV` (`.../reference/banners/banners_ww.tsv`), `KHUX_STORY_TSV` (`.../reference/story/story_release_ww.tsv`), `KHUX_NOTICES_JSON` (`.../reference/banners/notices.json`: copy it once from `D:\Progetto_Restauro_KH_UX\tmp\banners\notices.json`, because `tmp` is not durable), `server/master_data/medal.json`, `server/master_data/material.json`, `recon/tools/banner_overrides.tsv`. Default paths computed from the repo root (`<repo>/../..`), like `server/make-banners.js`.
2. **Excluded:** `X_BLINDBOX` and `X_TUTORIAL` do not go into `banners`.
3. **`end_of`:** remove the disproven rules (spec 9.8): drop «next of series - 1 day», «weekly Supernova Deal 7 days», «1st of month -> month end». Order: original; Draw Points -> `2021-06-29`; notice with score >= 5; `supernova deal|gem deal|free deal|sn\+ falling price|ffbe campaign` -> 1 day (`start`); weak notice; Beginner 2019 -> `2020-10-11`; Beginner 2020 -> `2021-02-24`; otherwise 1 day. `endSource` = the source (`original`, `notice <id>`, `1 day (series rule)`, ...).
4. **`currency_of(row, typ)`:** `(payType, currency)` with `{'Bronze Ticket': (4,'bronze'), 'Silver Ticket': (5,'silver'), 'Gold Ticket': (6,'gold'), 'Platinum Ticket': (7,'platinum'), 'Draw Ticket': (8,'draw'), 'Holiday Draw Ticket': (8,'holiday'), 'Spooky Cookie': (8,'spooky'), 'Moogle Point': (8,'moogle'), 'Draw Point': (9,'points')}`, after removing `', VIP only'` and `'Free, '`; everything else (Jewels, Free, empty) `(1, 'jewel')`. B0787 «Ticket Draw x10» (2021-01, «Holiday» in the TSV): `(8, 'draw')` (TSV error, research.md §2).
5. **`prices`:** `parse_price`; empty list -> `INCOMPLETE` row unless overridden. Prices 0 stay 0 in the recipe: it is `gacha.js` that raises them to 1 Jewel (Task 6).
6. **`day_limit(notes, typ)`:** `3` if `(\d+|three) times per day|3×/day`, `1` if `once (per|a) day` or `typ == 'DAILY'`, otherwise `0`.
7. **`vipFree`:** `True` if `typ == 'FREE'` and flag `VIP`.
8. **`vip_twins(rows)`:** rows with `VIP` in the currency or in the price for which there is a non-VIP row with the same `start_pt` and the same `series_key` of the name without `(VIP)`/`VIP:`. Expected on the real data: 41. `catalogOnly = 'VIP_TWIN'`.
9. **`catalogOnly`:** in this order `VIP_TWIN`; `PVP_TICKETS` for payType 4/5/6; `DRAW_POINTS` for payType 9; `INCOMPLETE` if `prices` or `lotCount` are missing after siblings and overrides.
10. **Incomplete rows:** port of `incomplete.py` (closest series sibling with price and size: 11 rows), then the overrides from `banner_overrides.tsv` (columns `row_id`, `field` in `price|draw_size|rarity_mix|end_pt`, `value`, `source`), which win over everything.
11. **`pool`:** 
    - notes with sets -> `{'mode': 'sets', 'sets': expanded refs}`: `24.3` -> `['24.3a', '24.3b']` if the letter variants exist; sets without sub-sets in the wiki (27.6, 40.6, 41.x) -> `names` of the medals of that set released by the start (like the research);
    - «Draws from the following medals» -> `{'mode': 'list', 'names': ...}`;
    - no notes and a `PERMANENT` banner or no documented banner before -> `{'mode': 'released'}`;
    - no notes -> `{'mode': 'inherit', 'sets': sets of the last documented banner of the same type (or of any type), 'inheritAfter': its date, 'names': names of the [[...]] links in the notes}`;
    - `T_EVOLVE` -> `{'mode': 'evolve', 'evolve': [[medalId, level], ...]}` from the `medal.json` rows named `Blue Fairy [SA Bonus LV n]` (Bronze LV1-3, Silver LV4-8 from 14/09/2018 and LV3-8 before, Gold LV5-8) or `Dual Meow Wow [SAB LV n]` (Platinum LV7-9); verify the exact names in `medal.json` with a `grep` before writing the regex;
    - `featured` = medals of the `featured_medals` column + `guarantee.featured`, normalised.
12. **`epicBoost`:** `True` if the complete notes contain `higher chances? of (being|the other \d+ being) Epic` or `chance to obtain Epic` (Epic Medal Carnival, DAILY/SMALL DEAL Epic of 24/06-15/07/2016).
13. **`bonus`:** from the complete notes, `[Ii]ncludes? (a|one|two|three|five|\d+) bonus (.*?)(?:\.|$)` (strip `'''`): number in words -> digit; name = first `[[...]]` link or `{{b|...}}`/`{{n|...}}` template (same rendering as `banner_sources.toks`); if the name is a gem (`material.json`, field `name`) -> `[5, materialId, n]`; otherwise medal by name (and star if written, e.g. «6★») in `medal.json` of any `type` -> `[3, medalId, n]`; names not found (e.g. «Scrooge Medal with the ... Skill», Trait and Imitation) are skipped and counted in the final printout (`bonus saltati`). Test: `m.bonus_of("Includes '''three''' bonus 6★ [[Magic Mirror]] Medals.", MEDALS, MATERIALS) == [[3, 90156, 3]]` and `m.bonus_of('Includes two bonus [[Power Gem]]s.', MEDALS, MATERIALS) == [[5, 48, 2]]` with synthetic tables in the test.
14. **`skill`:** `SKILL` -> `{'table': '50106', 'slots': 'first'}`; `SN` and `SEVEN` with start >= `2020-12-01` (first date of notice 72415 in the TSVs; verify the notice date with `notices.json` and use it) -> `{'table': '72415', 'slots': 'all'}`; otherwise `None`.
15. **`firstRarity`:** first appearance of each star in the `rarity_mix` (like `first_rarity` of the research); expected `6 -> 2016-07-15`, `7 -> 2018-05-25`.
16. **`story`:** rows of `story_release_ww.tsv` as `[first_quest, last_quest, ww_release_date]` in order.
17. **`subsets` and `medals`:** from `banner_sources` (Task 2), with normalised names; `medals[n].ids` only `type 1`, `validPack != 1` rows; `rare_date` for the variant, minimum `date`.
18. **Output:** `main()` writes `server/game_data/gacha_catalog.json` (UTF-8, `ensure_ascii=False`, compact separators) and prints the counts per type, `catalogOnly` and unlocks at 525.

Create `recon/tools/banner_overrides.tsv` with only the header `row_id\tfield\tvalue\tsource` (real tab: write it with the Write tool and check the bytes).

- [ ] **Step 4: Tests and numbers**

Run: `python recon/tools/test_make_banner_catalog.py` -> `OK`.
Run: `python recon/tools/make_banner_catalog.py`
Expected: 808 banners; types as in the test; `catalogOnly`: VIP_TWIN 41, PVP_TICKETS 4, DRAW_POINTS 7, INCOMPLETE <= 31; unlocks at 525: 78. File of about 1 MB.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add recon/tools/make_banner_catalog.py recon/tools/banner_overrides.tsv recon/tools/test_make_banner_catalog.py
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t3.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 4: overrides of the incomplete rows and images

Recommended model: Sonnet.

**Files:**
- Modify: `recon/tools/banner_overrides.tsv`
- Create: `recon/tools/make_banner_images.py`
- Create: `recon/tools/test_make_banner_images.py`

**Interfaces:**
- Consumes: `gacha_catalog.json` (Task 3); decision of Task 1 (`palette` or `full`).
- Produces: `server/game_data/gacha_img/<drawMedalTypeId>.png` for every banner; `make_banner_images.fit(im) -> Image` (640x140), `make_banner_images.plate(name) -> Image`.

- [ ] **Step 1: Overrides from the notices**

For each row still `INCOMPLETE` (printed by Task 3), read the notice in `reference\banners\notices.json` (id in the row's `source_url`, or search for the name in the title) and add to `banner_overrides.tsv` the rows `price`, `draw_size` (`x10`), `rarity_mix` (format `6★:1 5★:9`) and possibly `end_pt`, with `source` = `notice <id>`. B0205 (five Foretellers in one row): a single banner with the notice's common values. The rows without data in the notice stay incomplete (catalog only, spec 9.1). Re-run `python recon/tools/make_banner_catalog.py` and note in the log how many rows stay `INCOMPLETE`.

- [ ] **Step 2: Failing image test**

```python
from PIL import Image
import make_banner_images as m
im = m.fit(Image.new('RGB', (1001, 219), (200, 10, 10)))
check(im.size == (640, 140), 'ridimensionata')
im = m.fit(Image.new('RGB', (640, 160), (0, 0, 0)))
check(im.size == (640, 140), 'ritagliata al centro se il rapporto differisce oltre l\'1%')
p = m.plate('Big Deal!!')
check(p.size == (640, 140) and p.mode == 'RGB', 'piastra generata')
check(m.save_png(Image.new('RGB', (640, 140)), os.path.join(tmp, 'a.png'), 'palette') and Image.open(os.path.join(tmp, 'a.png')).mode == 'P', 'palette')
check(Image.open(os.path.join(tmp, 'a.png')).size == (640, 140), 'misura salvata')
```

- [ ] **Step 3: Verify that it fails**

Run: `python recon/tools/test_make_banner_images.py` -> ImportError.

- [ ] **Step 4: Implementation**

`make_banner_images.py`:
- `fit(im)`: `convert('RGB')`; if the width/height ratio differs from 640/140 by less than 1% -> `resize((640, 140), Image.LANCZOS)`; otherwise central crop to the 640/140 ratio and then resize.
- `plate(name)`: dark blue vertical gradient background (`#0d2a4a` -> `#174a5c`, colours of the catalog page), 3 px gold border (`#d8b25a`), name centred in white with `ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 34)` (fallback `ImageFont.load_default()`), shrunk until it fits in 600 px.
- `save_png(im, path, mode)`: `palette` -> `im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)`; `full` -> `im.save(path, optimize=True)`; returns True.
- `main()`: arguments `--mode palette|full` (default `palette`), `--img-dir` (default `<repo>/../../reference/banners/img`), `--catalog` (default `server/game_data/gacha_catalog.json`), `--out` (default `server/game_data/gacha_img`). For each banner: image `image` (first part before the space if there is more than one) if it exists; otherwise the one of the `imageFrom` banner; otherwise the one of a banner of the same series (same `series_key`, from `make_banner_catalog`) with an image; otherwise `plate(name)`. Do not touch `9001.png` (Catalog tile, `make_shop_art.py`). Prints counts (copied, resized, from sibling, generated) and total MB.

In Task 3, `imageFrom` already holds the `rowId` of the banner that provides the image for DAILY DEAL/SMALL DEAL Epic (B0022, B0024, B0028, B0030 -> image of B0001/B0027), Skills to Thrill 2017 (B0133/B0134/B0147/B0148 -> the previous Skills to Thrill with an image) and B0612 Supernova+ - Aced Returns (-> the previous Supernova Aced); if not, add it there (`make_banner_catalog.py`) in this task and re-run the Task 3 test.

- [ ] **Step 5: Tests and generation**

Run: `python recon/tools/test_make_banner_images.py` -> `OK`.
Run: `python recon/tools/make_banner_images.py --mode <decision of Task 1>`
Expected: 808 files; with `palette` about 32 MB in all; at most 5 generated tiles (B0009, B0077, B0493, B0497, B0623). Open 3 random images (one resized, one from a sibling, one generated) with the Read tool to check them.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=* add recon/tools/banner_overrides.tsv recon/tools/make_banner_images.py recon/tools/test_make_banner_images.py recon/tools/make_banner_catalog.py
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t4.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 5: `server/gacha-data.js` (catalog, per-era pool, odds, draw)

Recommended model: Opus.

**Files:**
- Modify: `server/gacha-data.js`
- Modify: `server/test-gacha-data.js`

**Interfaces:**
- Consumes: format of `gacha_catalog.json` (contract above).
- Produces (Tasks 6-8):
  - `CATALOG_ID` (9001), `UPGRADE` `{3: 0.10, 4: 0.06, 5: 0.04, 6: 0.03}`, `EPIC_UPGRADE` 0.15, `FEATURED_WEIGHT` 2
  - `loadCatalog(file) -> {banners, subsets, medals, firstRarity, story}` (empty but valid if the file is missing or broken)
  - `storyDay(catalog, quest) -> 'YYYY-MM-DD'` (date of the tranche that contains the quest; the first one if quest < 1)
  - `asOf(banner, day) -> 'YYYY-MM-DD'` (banner start; for `PERMANENT` ones `day` clamped to [start, end])
  - `expandPool(banner, catalog, asOf) -> {pool: {rare: [ids]}, featuredIds: [ids], listIds: [ids], weighted: [[id, weight]]}`
  - `slotRarities(banner)` (unchanged), `parseRarityMix(s)` (unchanged)
  - `slotOdds(banner, ex) -> [[{rare, pct}], ...]` (pct with 2 decimals; list slot: `[{list: true, pct: 100}]`)
  - `rollDraw(banner, ex, rng, state) -> {medalIds, featured}`; `state = {draws, sinceFeatured}` (draws already done on that banner)
  - `SKILL_TABLES`, `rollSkill(spec, slotIndex, skillRows, rng) -> skillId | null`
  - `drawMedalTypeRow(...)` (unchanged), `bannerById(list, id)` (unchanged)
  - removed: `UPGRADE_CHANCE`, `loadBanners`

- [ ] **Step 1: Failing tests**

Rewrite `server/test-gacha-data.js` (keep the checks of `parseRarityMix`, `slotRarities`, `drawMedalTypeRow`). Synthetic catalog:

```js
const CAT = {
  firstRarity: { 3: '2016-04-07', 4: '2016-04-07', 5: '2016-04-07', 6: '2016-07-15', 7: '2018-05-25' },
  story: [[1, 200, '2016-04-07'], [201, 250, '2016-04-21'], [251, 525, '2016-12-08']],
  subsets: { '1.1': { date: '2016-04-07', names: ['sora'] }, '2.2': { date: '2016-05-27', names: ['hades'] } },
  medals: {
    sora: { date: '2016-04-07', cls: '', class2: 'Attack', ids: [[31, 3, '2016-04-07'], [41, 4, '2016-04-07'], [51, 5, '2016-04-07'], [61, 6, '2016-04-07'], [71, 7, '2018-05-14']] },
    hades: { date: '2016-05-27', cls: '', class2: 'Attack', ids: [[32, 3, '2016-05-27'], [42, 4, '2016-05-27']] },
    vip: { date: '2016-04-07', cls: 'V', class2: 'Attack', ids: [[33, 3, '2016-04-07']] },
  },
};
const B = (o) => ({ rowId: 'B9', drawMedalTypeId: 10009, lotCount: 3, rarityMix: [[4, 1], [3, 2]], flags: [], start: '2016-05-01', end: '2016-05-31',
  epicBoost: false, pool: { mode: 'sets', sets: ['1.1'], names: [], featured: [], inheritAfter: null, evolve: null },
  guarantee: { list: [], count: 0, pity: null, every: null }, skill: null, ...o });
```

Checks:
- `storyDay(CAT, 525) === '2016-12-08'`, `storyDay(CAT, 210) === '2016-04-21'`, `storyDay(CAT, 0) === '2016-04-07'`;
- `asOf(B({}), '2016-12-08') === '2016-05-01'`; `asOf(B({ flags: ['PERMANENT'] }), '2016-12-08') === '2016-05-31'`; `asOf(B({ flags: ['PERMANENT'] }), '2016-04-07') === '2016-05-01'`;
- sets: `expandPool(B({}), CAT, '2016-05-01').pool` -> `{3: [31], 4: [41], 5: [51]}` (6★ not drawable before 15/07/2016; no Hades: 2.2 not cited);
- 7★ era: with `rarityMix [[6, 1]]` and asOf `2018-06-01` the pool has `7: [71]`; with asOf `2018-05-01` it does not;
- `released`: `B({ pool: { mode: 'released', ... } })` at `2016-04-30` -> only Sora; at `2016-06-01` -> Sora and Hades; never `vip` (class V);
- `inherit` with `inheritAfter: '2016-04-07'` and `sets: ['1.1']` at `2016-06-01` -> Sora and Hades;
- sub-set dated after asOf ignored (`sets: ['2.2']` at `2016-05-01` -> empty pool);
- `evolve`: `B({ lotCount: 5, pool: { mode: 'evolve', evolve: [[301682, 7], [301683, 8], [301684, 9]] } })` -> `weighted` = `[[301682, 0.45], [301683, 0.45], [301684, 0.1]]`;
- `slotOdds` of `B({})` expanded at `2016-05-01`: 4★ slot -> `[{rare: 4, pct: 94}, {rare: 5, pct: 6}]`; 3★ slot -> `[{rare: 3, pct: 90}, {rare: 4, pct: 10}]`;
- `epicBoost`: 3★ slot -> `[{rare: 3, pct: 85}, {rare: 5, pct: 15}]`;
- deterministic `rollDraw` with `seq(...)`: without promotion `[41, 31, 31]`; with `rng` 0.01 on the first slot -> 5★ (51);
- list slot: `guarantee: { list: ['sora', 'hades'], count: 1 }`, `featured: ['hades']`, pool at `2016-06-01`: the first slot picks from `listIds` with Hades weight 2 (rng 0.0 -> first element; rng 0.99 -> Hades);
- pity: `guarantee: { pity: 3 }`, `featured: ['hades']`, `state {draws: 2, sinceFeatured: 2}` -> the first slot is a Hades medal and `featured === true`; with `sinceFeatured: 1` no obligation;
- every: `guarantee: { list: ['hades'], count: 1, every: 3 }`: with `state.draws` 2 (third draw) the first slot is Hades; with `draws` 0 it is not;
- `rollSkill({ table: '72415', slots: 'all' }, 1, rows, () => 0.0)` returns the id of Attack Boost I; with `() => 0.99` `null`; `rollSkill({ table: '50106', slots: 'first' }, 1, rows, () => 0)` `null` (only the first slot); with slot 0 it always returns a skill. `rows` = `new Map([[1100, {skillId: 1100, name: 'Attack Boost I'}], [1102, {name: 'Attack Boost All I', skillId: 1102}], [1101, {name: 'Attack Boost II', skillId: 1101}]])`;
- `loadCatalog('/non/esiste.json')` -> `{banners: [], subsets: {}, medals: {}, firstRarity: {}, story: []}`.

- [ ] **Step 2: Verify that they fail**

Run: `node server/test-gacha-data.js`
Expected: `ERRORI` (missing functions).

- [ ] **Step 3: Implementation**

Replace in `server/gacha-data.js` the odds and loading part; updated header (spec 9.2/9.3, catalog written by `recon/tools/make_banner_catalog.py`).

```js
const CATALOG_ID = 9001;
// RECONSTRUCTED odds (spec 9.2): the r★ slot goes up one star with UPGRADE[r] if that
// star has medals in the pool (i.e. it was drawable at the banner's date); the 2016 «Epic» banners
// send 3★/4★ to 5★ with EPIC_UPGRADE. In list slots the showcased medal weighs FEATURED_WEIGHT.
const UPGRADE = { 3: 0.10, 4: 0.06, 5: 0.04, 6: 0.03 };
const EPIC_UPGRADE = 0.15;
const FEATURED_WEIGHT = 2;
const STD_CLS = new Set(['', 'SR', 'L']); // drawable Template:NASets classes (not Event/VIP/Bonus)
const EMPTY = () => ({ banners: [], subsets: {}, medals: {}, firstRarity: {}, story: [] });

function loadCatalog(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(c.banners) ? { ...EMPTY(), ...c } : EMPTY();
  } catch {
    return EMPTY();
  }
}

function storyDay(catalog, quest) {
  const s = catalog.story || [];
  if (!s.length) return '2016-04-07';
  const row = s.find(([a, b]) => quest >= a && quest <= b);
  return row ? row[2] : (quest < s[0][0] ? s[0][2] : s[s.length - 1][2]);
}

function asOf(banner, day) {
  if (!(banner.flags || []).includes('PERMANENT')) return banner.start;
  const end = banner.end || '2099-12-31';
  return day < banner.start ? banner.start : day > end ? end : day;
}

function expandPool(banner, catalog, at) {
  const p = banner.pool || {};
  if (p.mode === 'evolve') {
    const ev = p.evolve || [];
    const top = Math.max(...ev.map(([, lv]) => lv));
    const rest = ev.length > 1 ? 0.9 / (ev.length - 1) : 1;
    const weighted = ev.map(([id, lv]) => [id, ev.length > 1 ? (lv === top ? 0.1 : rest) : 1]);
    return { pool: {}, featuredIds: [], listIds: [], weighted };
  }
  const names = new Set([...(p.names || []), ...(p.featured || []), ...(banner.guarantee?.list || [])]);
  for (const s of p.sets || []) {
    const sub = catalog.subsets[s];
    if (sub && sub.date <= at) sub.names.forEach((n) => names.add(n));
  }
  if (p.mode === 'released' || p.mode === 'inherit') {
    const after = p.mode === 'inherit' ? p.inheritAfter || '' : '';
    for (const [n, m] of Object.entries(catalog.medals)) {
      if (STD_CLS.has(m.cls) && (m.class2 === 'Attack' || m.class2 === '') && m.date > after && m.date <= at) names.add(n);
    }
  }
  const rarities = new Set(banner.rarityMix.map(([r]) => r));
  for (const [r] of banner.rarityMix) if (catalog.firstRarity[r + 1] && catalog.firstRarity[r + 1] <= at) rarities.add(r + 1);
  const feat = new Set(p.featured || []), list = new Set(banner.guarantee?.list || []);
  const pool = {}, featuredIds = new Set(), listIds = new Set();
  for (const n of names) {
    for (const [id, rare, rd] of catalog.medals[n]?.ids || []) {
      if (!rarities.has(rare) || rd > at) continue;
      (pool[rare] ||= new Set()).add(id);
      if (feat.has(n)) featuredIds.add(id);
      if (list.has(n)) listIds.add(id);
    }
  }
  const sorted = (s) => [...s].sort((a, b) => a - b);
  return { pool: Object.fromEntries(Object.entries(pool).map(([r, s]) => [r, sorted(s)])), featuredIds: sorted(featuredIds), listIds: sorted(listIds), weighted: [] };
}
```

Draw:

```js
const poolOf = (pool, rare) => pool[rare] || pool[String(rare)] || [];
const pickIndex = (n, rng) => Math.min(n - 1, Math.floor(rng() * n));
function pickWeighted(items, rng) {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * tot;
  for (const [id, w] of items) { if ((x -= w) < 0) return id; }
  return items[items.length - 1][0];
}
// slot upgrade: { to, p } or null
function upgradeOf(banner, pool, rare) {
  if (banner.epicBoost && rare < 5 && poolOf(pool, 5).length) return { to: 5, p: EPIC_UPGRADE };
  if (UPGRADE[rare] && poolOf(pool, rare + 1).length) return { to: rare + 1, p: UPGRADE[rare] };
  return null;
}
function pickSlot(banner, pool, rare, rng) {
  const up = upgradeOf(banner, pool, rare);
  let r = up && rng() < up.p ? up.to : rare;
  while (r >= 1 && !poolOf(pool, r).length) r--;
  const list = poolOf(pool, r);
  if (!list.length) throw new Error(`banner ${banner.drawMedalTypeId}: pool vuoto per ${rare}★`);
  return list[pickIndex(list.length, rng)];
}
const listItems = (ex) => ex.listIds.map((id) => [id, ex.featuredIds.includes(id) ? FEATURED_WEIGHT : 1]);

function rollDraw(banner, ex, rng, state = { draws: 0, sinceFeatured: 0 }) {
  if (banner.pool?.mode === 'evolve') {
    return { medalIds: Array.from({ length: banner.lotCount }, () => pickWeighted(ex.weighted, rng)), featured: false };
  }
  const g = banner.guarantee || {};
  const n = (state.draws || 0) + 1;
  const listOn = ex.listIds.length > 0 && (g.every ? n % g.every === 0 : true);
  const listSlots = listOn ? Math.max(1, g.count || 1) : 0;
  const pityOn = !!g.pity && ex.featuredIds.length > 0 && (state.sinceFeatured || 0) + 1 >= g.pity;
  const medalIds = slotRarities(banner).map((rare, i) => {
    if (i === 0 && pityOn) return ex.featuredIds[pickIndex(ex.featuredIds.length, rng)];
    if (i < listSlots) return pickWeighted(listItems(ex), rng);
    return pickSlot(banner, ex.pool, rare, rng);
  });
  return { medalIds, featured: medalIds.some((id) => ex.featuredIds.includes(id)) };
}

function slotOdds(banner, ex) {
  const listSlots = ex.listIds.length ? Math.max(1, banner.guarantee?.count || 1) : 0;
  const r2 = (x) => Math.round(x * 10000) / 100;
  return slotRarities(banner).map((rare, i) => {
    if (i < listSlots) return [{ list: true, pct: 100 }];
    const up = upgradeOf(banner, ex.pool, rare);
    return up ? [{ rare, pct: r2(1 - up.p) }, { rare: up.to, pct: r2(up.p) }] : [{ rare, pct: 100 }];
  });
}
```

Skills (spec 9.2; notice 50106 VIP Daily Skills to Thrill and 72415 SN+ Falling Price; only the skills that exist in `skill.json`, the rest of the probability goes to «no skill»; for 50106 the slot always has a skill, so the odds are rescaled over the skills present; skills at level 1):

```js
const SKILL_TABLES = {
  50106: [['Attack Boost II', 5], ['Attack Boost All II', 5], ['Attack Prize Plus', 5], ['Lux Plus', 5], ['Defense Boost II', 5], ['No Cost', 1.70394]],
  72415: [['Attack Boost I', 1.68421], ['Attack Boost All I', 1.26315], ['Poison', 1.26315], ['Paralysis', 1.26315], ['Sleep', 1.26315], ['Defense Boost I', 1.26315]],
};
function rollSkill(spec, slotIndex, skillRows, rng) {
  if (!spec || (spec.slots === 'first' && slotIndex !== 0)) return null;
  const byName = new Map([...skillRows.values()].map((r) => [r.name, r.skillId]));
  const items = SKILL_TABLES[spec.table].filter(([n]) => byName.has(n)).map(([n, pct]) => [byName.get(n), pct]);
  if (!items.length) return null;
  if (spec.slots === 'first') return pickWeighted(items, rng);
  let x = rng() * 100;
  for (const [id, pct] of items) { if ((x -= pct) < 0) return id; }
  return null;
}
```

`module.exports` = `{ CATALOG_ID, UPGRADE, EPIC_UPGRADE, FEATURED_WEIGHT, SKILL_TABLES, parseRarityMix, slotRarities, loadCatalog, storyDay, asOf, expandPool, slotOdds, rollDraw, rollSkill, drawMedalTypeRow, bannerById }`.

- [ ] **Step 4: Test**

Run: `node server/test-gacha-data.js` -> `OK`.
With the real catalog: a `node -e` that loads `server/game_data/gacha_catalog.json`, expands every non-`catalogOnly` banner at its date (`asOf(b, '2021-06-29')`) and prints how many have a slot without medals at its star or below. Expected: 0 (or list them in the log: the server discards them, Task 8).

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add server/gacha-data.js server/test-gacha-data.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t5.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

(The tests of `gacha.js` and `server.js` break until Tasks 6-8: this is expected; the server must not be started between Task 5 and Task 8.)

---

### Task 6: `server/gacha.js` (provisional list, prices, currencies, limits, pity) and `server/make-banners.js`

Recommended model: Opus.

**Files:**
- Modify: `server/gacha.js` (logic; the pages in Task 7)
- Rewrite: `server/make-banners.js`
- Modify: `server/test-gacha.js`, `server/test-make-banners.js`

**Interfaces:**
- Consumes: `gacha-data` (Task 5).
- Produces (Tasks 7-8):
  - `SHOP_MAX` 8; `drawable(b, sizes) -> bool` (`!b.catalogOnly && sizes.has(b.lotCount)`)
  - `shopBanners(banners, {storyQuest, storyDay, sizes, show}) -> banner[]` (provisional list)
  - `priceFor(banner, player) -> number` (never 0)
  - `balance(player, banner) -> number`, `walletName(banner) -> string`
  - `gachaListData(banners, player, {realMs, webBase, sizes, storyQuest, storyDay, show}) -> {gachaList, petGachaList}`; writes `player.gacha.listedCurrency`
  - `checkDraw(banner, player, body, {realMs, freeSlots, sizes, storyQuest, show}) -> string|null`
  - `payDraw(banner, player, realMs, gotFeatured) -> number` (price paid)
  - `drawState(player, banner) -> {draws, sinceFeatured}`
  - `catalogRow()`, `catalogPlate(webBase)`, `drawResultFields(...)` (unchanged)
  - `ticketsOf(player) -> {draw, holiday, spooky, moogle}` (creates `player.drawTickets`, migrates `limitedDrawTicket2` once)
  - `make-banners.js`: `masterRows(catalog) -> row[]`, `commentOf(banner) -> string`

- [ ] **Step 1: Failing tests**

`server/test-gacha.js` (rewrite the changed parts; fixed `realMs` as in the current tests). Synthetic banners with the contract fields. Cases:
- `priceFor`: `prices [0, 3000]` -> 1 on the first, 3000 after one draw (`player.gacha.count[id] = 1`); `prices [3000, 2500, 2200, 1900]` -> 3000, 2500, 2200, 1900, 1900 for 0..4 draws; `prices [0]` -> always 1;
- `shopBanners` with `storyQuest 525`, `storyDay '2016-12-08'`, `sizes {1,3,10}`: a banner `start 2016-12-01 end 2016-12-15 unlockQuest 525` goes in; the same one with `unlockQuest 540` does not; one with `end 2016-11-30` does not; a `PERMANENT` `2016-04-07 -> 2018-01-31` goes in; a `catalogOnly` one does not, nor one with `lotCount 5`; `show` (Set of rowIds) adds any banner as long as it is `drawable`; at most `SHOP_MAX`, ordered by descending `start`; two payType 8 banners `draw` and `spooky`: only the first in order goes in;
- currencies: `ticketsOf({limitedDrawTicket2: 7})` -> `{draw: 7, holiday: 0, spooky: 0, moogle: 0}` and `limitedDrawTicket2` deleted; `balance` of a `spooky` banner reads `drawTickets.spooky`;
- `gachaListData` with a `spooky` banner listed: `player.gacha.listedCurrency === 'spooky'`; tile with `price` = `priceFor` and `userLimitedCount`;
- limits: `dayLimit 3` -> three draws on the same day, the fourth refused; `vipFree` -> after a draw on a free VIP banner, a second free VIP banner on the same day is refused (`'estrazione gratuita VIP gia\' usata oggi'`) and `userLimitedCount` 0 for both; the next day 1 again;
- `checkDraw`: refuses `catalogOnly` (`'banner solo nel catalogo'`), `unlockQuest > storyQuest` (`'banner bloccato'`), payType 4/5/6/9, funds < `priceFor`, full box;
- `payDraw`: deducts `priceFor` from the right wallet, increments `player.gacha.count[id]`, resets `sinceFeatured[id]` if `gotFeatured`, otherwise +1; returns the price;
- `make-banners`: `masterRows(catalog)` has 1 + N rows, the 9001 tile first; every row has `price >= 1`, `payType` in `[1, 4, 5, 6, 7, 8]` (payType 9 -> 1), `benefitId 0`; `commentOf` of `rarityMix [[6,1],[5,9]]`, `lotCount 10`, `pity 10` -> `'10 Medals: 1x 6★+, 9x 5★+ - featured Medal guaranteed within 10 draws'`; no loose `%`.

- [ ] **Step 2: Verify that they fail**

Run: `node server/test-gacha.js` and `node server/test-make-banners.js` -> `ERRORI`.

- [ ] **Step 3: Implementation of `gacha.js`**

Updated header (spec 9.4-9.7; provisional list until sub-project 3). Code:

```js
const SHOP_MAX = 8;
const WALLET = { 1: 'freeStone', 7: 'limitedDrawTicket1' }; // payType 8: player.drawTickets[currency]
const TICKET_CURRENCIES = ['draw', 'holiday', 'spooky', 'moogle'];
const VIP_FREE = 'vipFree'; // key of the shared limit of the Free Deal VIP (spec 9.5)

function ticketsOf(player) {
  if (!player.drawTickets) {
    player.drawTickets = Object.fromEntries(TICKET_CURRENCIES.map((c) => [c, 0]));
    player.drawTickets.draw = player.limitedDrawTicket2 || 0; // saves from sub-project 1
    delete player.limitedDrawTicket2;
  }
  return player.drawTickets;
}
const walletName = (b) => (b.payType === 8 ? `drawTickets.${b.currency}` : WALLET[b.payType]);
function balance(player, b) {
  if (b.payType === 8) return ticketsOf(player)[b.currency] || 0;
  return player[WALLET[b.payType]] || 0;
}
function spend(player, b, n) {
  if (b.payType === 8) ticketsOf(player)[b.currency] -= n;
  else player[WALLET[b.payType]] = (player[WALLET[b.payType]] || 0) - n;
}
const gstate = (player) => (player.gacha ||= {});
const drawCount = (player, b) => gstate(player).count?.[b.drawMedalTypeId] || 0;
function priceFor(b, player) {
  const p = b.prices || [];
  return Math.max(1, p.length ? p[Math.min(drawCount(player, b), p.length - 1)] : 1);
}
const drawable = (b, sizes) => !b.catalogOnly && [1, 7, 8].includes(b.payType) && sizes.has(b.lotCount);
const activeOn = (b, day) => b.start <= day && day <= (b.end || '2099-12-31');

function shopBanners(banners, { storyQuest, storyDay, sizes, show }) {
  const pick = banners.filter((b) => drawable(b, sizes)
    && ((b.unlockQuest <= storyQuest && activeOn(b, storyDay)) || show.has(b.rowId)))
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : a.drawMedalTypeId - b.drawMedalTypeId));
  let currency = null;
  const out = [];
  for (const b of pick) {
    if (b.payType === 8) { if (currency && currency !== b.currency) continue; currency = b.currency; }
    out.push(b);
    if (out.length === SHOP_MAX) break;
  }
  return out;
}
```

For the `PERMANENT` ones `activeOn` uses their original dates (e.g. DAILY DEAL! 2016-04-07 -> 2018-01-31), so they stay in the list while the point in the story falls within their era (spec 4.5).

Daily limits (they replace `dayLeft`): `player.gacha = {day, used: {id: n, vipFree: n}, count: {id: n}, sinceFeatured: {id: n}, listedCurrency}`; when the day changes (`clock.dayIndex(realMs)`) only `used` is reset.

```js
function usedToday(player, key, realMs) {
  const g = gstate(player);
  return g.day === clock.dayIndex(realMs) ? g.used?.[key] || 0 : 0;
}
function dayLeft(player, b, realMs) {
  if (b.vipFree) return Math.max(0, 1 - usedToday(player, VIP_FREE, realMs));
  if (!b.dayLimit) return 0;
  return Math.max(0, b.dayLimit - usedToday(player, b.drawMedalTypeId, realMs));
}
```

`plate(b, webBase, userLimitedCount, price)`: as now with `price` from the parameter and `isDayLimited: b.dayLimit || b.vipFree ? 1 : 0`. `gachaListData`: `ticketsOf(player)`, list = `[catalogPlate, ...shopBanners(...).map((b) => plate(b, webBase, dayLeft(player, b, realMs), priceFor(b, player)))]`, `gstate(player).listedCurrency` = currency of the first payType 8 banner listed (or `'draw'`).

`checkDraw(banner, player, body, {realMs, freeSlots, sizes, storyQuest, show})`, in order: unknown; `catalogOnly` -> `'banner solo nel catalogo'`; payType not in `[1, 7, 8]` -> `payType N non estraibile`; `unlockQuest > storyQuest` and not in `show` -> `'banner bloccato'`; size without animation; limit (`vipFree`: `'estrazione gratuita VIP gia\' usata oggi'`; `dayLimit`: `'limite giornaliero raggiunto'`); `balance < priceFor`; box.

`payDraw(banner, player, realMs, gotFeatured)`: `const price = priceFor(banner, player); spend(...)`; then `count[id]++`, `sinceFeatured[id] = gotFeatured ? 0 : (sinceFeatured[id] || 0) + 1`; for `vipFree`/`dayLimit` updates `used` (with the reset when the day changes, as today); returns `price`.

`drawState(player, b) = { draws: drawCount(player, b), sinceFeatured: gstate(player).sinceFeatured?.[b.drawMedalTypeId] || 0 }`.

- [ ] **Step 4: Implementation of `make-banners.js`**

Rewrite: header (source `server/game_data/gacha_catalog.json` written by `recon/tools/make_banner_catalog.py`; output `server/master_data/drawMedalType.json`; then raise `KHUX_REVISION`).

```js
function commentOf(b) {
  const mix = b.rarityMix.map(([r, n]) => `${n}x ${r}★+`).join(', ');
  const extra = b.guarantee?.pity ? ` - featured Medal guaranteed within ${b.guarantee.pity} draws`
    : b.vipFree ? ' - one free VIP draw per day' : b.dayLimit ? ` - ${b.dayLimit === 1 ? 'once' : `${b.dayLimit} times`} per day` : '';
  return `${b.lotCount} Medal${b.lotCount === 1 ? '' : 's'}${mix ? `: ${mix}` : ''}${extra}`;
}
function masterRows(catalog) {
  return [require('./gacha').catalogRow(), ...catalog.banners.map((b, i) => gd.drawMedalTypeRow({
    drawMedalTypeId: b.drawMedalTypeId, name: b.name, payType: [1, 4, 5, 6, 7, 8].includes(b.payType) ? b.payType : 1,
    price: Math.max(1, (b.prices || [])[0] || 1), sortId: 10 + i,
    bannerUrl: `/web/gacha/img/${b.drawMedalTypeId}.png`, detailUrl: `/web/gacha/detail/${b.drawMedalTypeId}`, comment: commentOf(b),
  }))];
}
```

`main()`: loads the catalog with `gd.loadCatalog`, exits with an error if `banners` is empty («lanciare prima recon/tools/make_banner_catalog.py»), writes the master, prints the number of rows and «poi alzare KHUX_REVISION (drawMedalType)». No more TSV, wiki, pools or images here. `module.exports = { commentOf, masterRows }`.

- [ ] **Step 5: Test**

Run: `node server/test-gacha.js` and `node server/test-make-banners.js` -> `OK`. Then `node server/make-banners.js` -> 809 rows.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=* add server/gacha.js server/make-banners.js server/test-gacha.js server/test-make-banners.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t6.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 7: WebView pages (catalog of 808 banners, details, Draw Odds)

Recommended model: Sonnet.

**Files:**
- Modify: `server/gacha.js` (pages)
- Modify: `server/test-gacha.js`

**Interfaces:**
- Consumes: `gacha-data.slotOdds`, `expandPool` (Task 5); `priceFor`, `drawable`, `shopBanners` (Task 6).
- Produces (Task 8): `RESTORED_QUEST` (525), `catalogPage(banners, ctx) -> html`, `detailPage(banner, ex, medalNames, ctx) -> html`, `oddsPage(entries) -> html` with `entries = [{banner, ex}]`, `stateOf(banner, ctx) -> {key, text}`.

- [ ] **Step 1: Failing tests**

In `test-gacha.js`:
- `stateOf` with `ctx = {storyQuest: 300, storyDay: '2016-05-12', sizes, show: new Set(), shown: Set of drawMedalTypeIds of the list}`: banner in the list -> `{key: 'now', text: 'In the Shop now'}`; `unlockQuest 450` -> `{key: 'locked', text: 'Unlocks after Story Quest 450'}`; `unlockQuest 600` -> `{key: 'locked', text: 'Unlocks after Story Quest 600 — coming with a future update'}` (beyond `RESTORED_QUEST` = 525, constant exported by `gacha.js`, spec 4.4); `catalogOnly 'PVP_TICKETS'` -> `Requires PvP tickets — coming with a future update`; `DRAW_POINTS` -> `Draw Points — coming with a future update`; `VIP_TWIN` -> `VIP variant, not reproduced`; `INCOMPLETE` -> `Original details missing — not available`; size without animation -> `This draw size is not available yet`; unlocked but out of period -> `Not in the Shop now`;
- `catalogPage` with 3 banners: contains 3 `loading="lazy"`, the names with HTML escaping (`<b>` in the name becomes `&lt;b&gt;`), the state of each and the link `/web/gacha/detail/<id>`;
- `detailPage`: contains «Draw rates», the word `reconstructed` next to the slot odds, `original` next to the composition («Medal rarities of each draw: original») and, if `guarantee.pity`, the phrase `Featured Medal guaranteed within N draws (original)`; for `skill` the skills table with `(original rates, notice)`; for `evolve` the levels with the percentages (10% at the highest level);
- `oddsPage([{banner, ex}])`: one section per banner with the `slotOdds` rows.

- [ ] **Step 2: Verify that they fail**

Run: `node server/test-gacha.js` -> `ERRORI`.

- [ ] **Step 3: Implementation**

Keep `page()`, `esc()`; `priceText(b, price)` receives the price; `PAY` adds `spooky: 'Spooky Cookies'`, `moogle: 'Moogle Points'`, `holiday: 'Holiday Draw Tickets'`, `draw: 'Draw Tickets'` for payType 8 (via `b.currency`). Catalog: one block per banner in `start` order, with `<img loading="lazy" width="640" height="140">`, name, original dates (with «(end date reconstructed)» if `endSource` is not `original`), price, state from `stateOf`; at the top a line «808 original banners. Banners unlock with the Story, as in the original game.» (computed number). Details: image, price, dates, state, «Draw rates» with the note «Medal rarities of each draw: original. Chances of one more star: reconstructed for this restoration.», `slotOdds` table (the list slots: «one of the listed Medals, featured Medals twice as likely»), guarantees, skills (`SKILL_TABLES` with only the skills present), list of medals per rarity as today (from `ex.pool`, or the levels for `evolve`). Draw Odds: as today with `entries`.

- [ ] **Step 4: Test**

Run: `node server/test-gacha.js` -> `OK`.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add server/gacha.js server/test-gacha.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t7.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 8: wiring in `server/server.js`, Notices

Recommended model: Opus.

**Files:**
- Modify: `server/server.js` (Shop > Draw block, lines ~1108-1210; `userPointData` ~1262-1266; `grantItem` type 41 ~1496; save loading)
- Modify: `server/routes-info-album.js`
- Modify: `server/test-gacha-server.js`, `server/test-notices.js` if it checks the texts

**Interfaces:**
- Consumes: Tasks 5-7.
- Produces: unchanged routes (`/gacha/list`, `/gacha/draw`, `/web/gacha/*`); `KHUX_GACHA_SHOW` (comma-separated rowIds) instead of `KHUX_GACHA_TEST`; test exports `gachaCatalog`, `reloadGachaBanners`, `sanitizeBanners`.

- [ ] **Step 1: Failing tests**

In `server/test-gacha-server.js` (same setup: temporary `KHUX_SAVE`, synthetic catalog written to a temporary file passed with `KHUX_GACHA_BANNERS`), replace the sub-project 1 catalog with one in the new format (sub-sets, medals with real `medal.json` ids of rarity 3-5, a `PERMANENT` banner, a free VIP banner, an `evolve` banner with the `Dual Meow Wow [SAB LV 7-9]` rows of `medal.json`, a `catalogOnly` banner). Cases:
- `/gacha/list` with the story of the test save: tile 9001 + the banners expected by `shopBanners`; dynamic price;
- `/gacha/draw` on the `PERMANENT` banner: medals only from the pool expanded at the date of the player's story (player at quest 200: no medals with date > `2016-04-07` in the result);
- `/gacha/draw` on the `evolve` banner (with `KHUX_GACHA_SHOW` containing it and 1 Platinum ticket): every id in `userMedalIds` appears in `userMedals` of the response (stacked cell: the id of the cell, i.e. the first copy), and two draws in a row return the same cell id;
- `catalogOnly` banner: `{ret}` refusal without charge;
- save with `limitedDrawTicket2: 4` and no `drawTickets`: after the first `/gacha/list`, `userPoint.limitedDrawTicket2` is 4 and the save has `drawTickets.draw === 4`;
- `grantItem(41, 0, 3)` -> `drawTickets.draw` +3;
- bonus: banner with `bonus [[5, 48, 2]]`: after the draw `player.presents` has an entry `resourceType 5`, `resourceId 48`, `number 2`;
- SKILL: banner with `skill {table: '50106', slots: 'first'}`: the response contains in `userSkills` an object with the `userMedalId` of the first medal and `level 1`, and `player.medalSkills[userMedalId]` exists;
- catalog missing: list with only tile 9001, draw refused.

- [ ] **Step 2: Verify that they fail**

Run: `node server/test-gacha-server.js` -> `ERRORI`.

- [ ] **Step 3: Implementation**

In the Shop > Draw block:
- `GACHA_FILE` default `game_data/gacha_catalog.json`; `GACHA_SHOW = new Set((process.env.KHUX_GACHA_SHOW || '').split(',').filter(Boolean))`; remove `GACHA_TEST`.
- `gachaCatalog()` memoises `gachaData.loadCatalog(GACHA_FILE)` with the banners passed through `sanitizeBanners`; `reloadGachaBanners()` resets it.
- `sanitizeBanners(catalog)`: for every banner that is neither `catalogOnly` nor `evolve`, expands the pool at the widest date (`asOf(b, '2021-06-29')`) and discards it (`console.log` as today) if a slot has no medals at its star or below. Stackable medals are already kept out of the catalog (`validPack != 1`, Task 3), except `evolve`.
- `storyCtx()` = `{ storyQuest: stageNumber(lastStoryStageId()), storyDay: gachaData.storyDay(cat, storyQuest) }`.
- `expandFor(b)` = `gachaData.expandPool(b, cat, gachaData.asOf(b, storyCtx().storyDay))`, with a cache per `drawMedalTypeId + asOf` (Map, emptied by `reloadGachaBanners`).
- `respondGachaList`: `gacha.gachaListData(cat.banners, player, { realMs, webBase: WEB_BASE, sizes: GACHA_SIZES, show: GACHA_SHOW, ...storyCtx() })`; `savePlayer()` if `ticketsOf` migrated or `listedCurrency` changed.
- `respondGachaDraw`: `checkDraw(..., { ...storyCtx(), show: GACHA_SHOW, ... })`; `const ex = expandFor(banner)`; `rollDraw(banner, ex, Math.random, gacha.drawState(player, banner))`; after `grantItem(3, medalId, 1)` the id to return is the one of the cell: `const cell = stackedMedalList().find((c) => c.copies.includes(newId)); userMedalIds.push(cell ? cell.userMedalId : newId)` (the client looks for the id in userMedals; for stackable ones the cell has the id of the first copy, `stackedMedalList`); `firstGetUserMedalIds` as today but with the cell id. Skills: for each slot `i`, `const sk = gachaData.rollSkill(banner.skill, i, skillRowsById(), Math.random)`; if there is one and the medal is not stackable: `player.nextUserSkillId = (player.nextUserSkillId || 0) + 1; (player.medalSkills ||= {})[newId] = { userSkillId: player.nextUserSkillId, skillId: sk, level: 1, exp: 0, getDatetime: realNow() }` (same format as Overwrite, ~line 2491); `inventoryBlocks` already sends the `userSkills` of the touched medals (verify it in the test). `gacha.payDraw(banner, player, realMs, featured)`; for each entry of `banner.bonus`: `addPresent(type, id, n, 'Bonus: ' + banner.name)` (the Present Box shows it; spec 9.2); log with the returned price.
- `respondGachaWeb`: catalog with `stateOf` (ctx with `shown` = ids of the current list), details with `expandFor(banner)` for any banner of the catalog (even locked or catalog-only: the page shows what it would contain), odds.
- `userPointData`: `limitedDrawTicket2: gacha.ticketsOf(player)[player.gacha?.listedCurrency || 'draw'] || 0`.
- `grantItem` type 41: `gacha.ticketsOf(player).draw += num` (comment: the seasonal currencies come with their Limited events, sub-project 3).

Notices (`routes-info-album.js`), texts in English:
- `DIFFERENCES_BODY`: replace the odds line with «Shop draw rates are reconstructed where the original game did not publish them (Medal rarities, guarantees and Skill rates are original): Draw Odds and each banner's Details say so.» and add «Bonus items of a draw (Magic Mirror, Gems...) arrive in your Presents.» and «Free draws cost 1 Jewel. VIP Free Deals are open to everyone, with one free VIP draw per day in total.» and «Seasonal draw currencies (Spooky Cookies, Moogle Points, Holiday Draw Tickets) are kept separately; the Shop shows one of them at a time.»
- «Shop» notice: add «Every original banner is in the Banner Catalog. Until the next update the Shop lists the banners that were running at your point in the Story; banners unlock with the Story, as in the original game.»
Update `test-notices.js` if it checks the number of lines.

- [ ] **Step 4: Test**

Run: `node server/test-gacha-server.js`, `node server/test-gacha.js`, `node server/test-gacha-data.js`, `node server/test-make-banners.js`, `node server/test-notices.js`, `node server/test-beginner.js`, `node server/test-medal-guilt.js "$PWD/server"` -> all `OK`.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add server/server.js server/routes-info-album.js server/test-gacha-server.js server/test-notices.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t8.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 9: revision 119, bench tests and documentation

Recommended model: Opus (bench).

**Files:**
- Modify: `tools/ldplayer/session/run-server.ps1`, `relogin.ps1`, `cycle.ps1`, `update-resources.ps1` (default 118 -> 119; `-GachaTest` -> `[string]$GachaShow` which sets `$env:KHUX_GACHA_SHOW`)
- Modify: `docs/notes/shop.md`, `docs/ISSUES.md`, `HANDOFF.md`, `docs/notes/server.md`

- [ ] **Step 1: Generation**

Copy of the save to `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-sp2` (if not already done in Task 1). Then:
`python recon/tools/make_banner_catalog.py`, `python recon/tools/make_banner_images.py --mode <decision>`, `node server/make-banners.js`.

- [ ] **Step 2: Scripts and revision 119**

Default 118 -> 119 in the four scripts; `-GachaShow` passed through to `run-server.ps1`. `.\tools\ldplayer\session\update-resources.ps1 -Revision 119` (no new resources: master only). Expected: `GET /master/drawMedalType` in the log, home reached.

- [ ] **Step 3: Bench tests (serially, `AppAlive` before every tap, SKIP in dialogues, screenshots `Shot sp2_<name>`)**

1. Shop > Draw with the current story: Catalog tile + the banners active at the date of the point in the story (note which ones and compare them with `shopBanners` computed by hand); correct images.
2. Details of the Catalog: list of 808 banners that scrolls without freezing, states («In the Shop now», «Unlocks after Story Quest N — coming with a future update», «VIP variant, not reproduced»); open three details (a locked one from 2019, a SKILL one, a Platinum one).
3. x3 or x10 draw from a banner of the list; medals of the right period (compare with the `[gacha]` log); jewels deducted matching the tile's price.
4. Bench with `relogin.ps1 -Tag s7 -GachaShow B0306` (7★ Medal Deal, id >= 300000) and sufficient jewels: correct animation and result with 7★ medals (spec 9.3, mandatory test). If it crashes: stop everything, `tools\ldplayer\tombstone.ps1`, note it and open an ISSUE; the Task stays open until it is clear.
5. Platinum Ticket Draw: `-GachaShow B0456`, 1 Platinum ticket in the save (with the server stopped); x5 draw: Dual Meow Wow LV7-9 in the list, stacked in one cell; second draw with another ticket: the cell grows, no crash.
6. Decreasing price: `-GachaShow` with a FALLING banner of the catalog that has `lotCount` 10 (pick it from `gacha_catalog.json`); after one draw the tile shows the next step.
7. Free Deal VIP: `-GachaShow` with two Free Deal VIP; the first draw costs 1 Jewel, then both show as exhausted until the next day.
8. Ten Shop openings: no crash. Notices: new lines.
Go back to the normal server (without `-GachaShow`) and restore the tickets and jewels used for the tests from the backup if needed.

- [ ] **Step 4: Documentation**

`docs/notes/shop.md`: «Sub-project 2» section (generated catalog and its format, commands in order, provisional list, price/currency/limit/pity/skill rules, test outcomes with the screenshot names, palette/full decision). `docs/ISSUES.md`: open ISSUEs for whatever came up (e.g. rows still `INCOMPLETE`, banners discarded by `sanitizeBanners`), «last» marker updated. `HANDOFF.md`: Shop sub-project 2 done, BASE 119, generation commands. `docs/notes/server.md`: BASE 119, `KHUX_GACHA_SHOW`.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add tools/ldplayer/session/run-server.ps1 tools/ldplayer/session/relogin.ps1 tools/ldplayer/session/cycle.ps1 tools/ldplayer/session/update-resources.ps1 docs/notes/shop.md docs/ISSUES.md HANDOFF.md docs/notes/server.md
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_sp2_t9.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```
