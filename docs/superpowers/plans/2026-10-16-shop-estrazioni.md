# Shop, sub-project 1: working draws — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Shop shows the «Banner Catalog» tile and three original first-year banners (Daily Deal, Small Deal, Epic Medal Carnival); x1, x3 and x10 really draw medals paid in jewels, and a Platinum Ticket test banner (only with `KHUX_GACHA_TEST=1`) tests the tickets.

**Architecture:** an offline generator (`server/make-banners.js`) reads the data collected outside the repo (banners_ww.tsv, wiki, medal.json) and writes the `drawMedalType` master rows and the catalog `server/game_data/gacha_banners.json` with the medal pools. The server loads the catalog (`server/gacha-data.js`, pure functions: draw and odds), builds the list, the draw and the WebView pages (`server/gacha.js`) and wires the routes in `server/server.js`. Resources 40 add the result animations (JP LWF) and the texts/icon of the Catalog tile.

**Tech Stack:** Node (server, no external dependencies), Python 3 + Pillow (tools in `recon/tools`), PowerShell (resource build and LDPlayer bench).

**Spec:** `docs/superpowers/specs/2026-10-16-shop-banner-design.md` (sections 3, 4.1, 4.8, 4.10, 5, 6 point 1, 8). Client facts: `D:\Progetto_Restauro_KH_UX\tmp\gacha_re\findings.md` (/gacha/draw protocol), `D:\Progetto_Restauro_KH_UX\tmp\gacha_re\server_facts.md` (server, master, resources), `D:\Progetto_Restauro_KH_UX\tmp\spike_catalog\notes.md` (tile).

## Global Constraints

- Original APK unmodified: only server responses, master tables, downloadable resources and WebView pages are changed.
- Repo: only original code and documentation. Never Square Enix APKs, assets, master data, images or decompiled code in the repo: `server/master_data/`, `server/game_data/`, `server/save/` are ignored by git; the generated bitmaps and LWFs live outside (stage_gen, game_data); only the scripts go in the repo.
- Git: always `git -c safe.directory=*`; message in a UTF-8 file without BOM in `D:\Progetto_Restauro_KH_UX\tmp\msg_*.txt` written with the Write tool, then `git commit -F <file>`; `git pull --rebase` before `git push`; messages in Italian ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `git add -A` (add files by name; `.claude/` is not tracked). Commit and push at every verified task.
- Code and comments in Italian, in the style of the neighbouring files (dense comments with bench dates). Texts shown to the player in English.
- Tests: standalone scripts `node server/test-<name>.js` that print `OK: ...` or `ERRORI (n)` and exit with 1; never the real save (`KHUX_SAVE` in a temporary folder).
- Tiles: never `price` 0 (draw without confirmation), never `benefitId` != 0 (padlock: tap = crash), never payType 3 (it only counts payStone, which is always 0) nor payType 9 (Shop crash). Jewels = payType 1.
- `/gacha/draw` response: `effectNumbers` only 0; `gachaBonus` always `{addType: 1, number: 0, userMedalIds: []}`; every id in `userMedalIds` must appear in `userMedals` of the same response or already be known to the client; at most 10 medals per draw.
- Every difference from the original must be explained in the in-game Notices, in English (reconstructed odds, Catalog tile).
- Bench: taps only while the game is alive (`AppAlive`); press SKIP in dialogues; copy the save before testing; heavy files in `D:\Progetto_Restauro_KH_UX\tmp`.

## Review Focus

1. Draw requested without sufficient funds (client out of sync or repeated request): the server refuses without deducting anything and without giving medals.
2. Daily Deal drawn twice on the same day: the second is refused and the list's `userLimitedCount` is 0; after 08:00 UTC of the next day it goes back to 1.
3. Medal box without room for the whole draw: refused (the client only checks 1 slot).
4. The same medal twice in the same x10: a single id in `firstGetUserMedalIds`, all `userMedalIds` different and present in `userMedals`.
5. Banner catalog missing (generator not run) or test banner without `KHUX_GACHA_TEST`: the list contains only the Catalog tile (or the normal banners), no crash, the draw is refused.

The tests for these cases are in Task 4 (1-4, logic) and 5 (5 and cases 1-4 through `server.js`).

---

## Files

| File | Status | Responsibility |
|---|---|---|
| `recon/tools/import_jp_raisedraw.py` | new | copies the draw result LWFs (JP 4.3.1) complete with textures into stage_gen |
| `recon/tools/make_shop_art.py` | new | button texts of the Catalog tile, icon replacing the «仮» Gold Ticket, 640x140 banner of the Catalog tile |
| `tools/ldplayer/session/build-resources.ps1` | modify | runs the two new scripts |
| `server/gacha-data.js` | new | pure functions: master row, slot rarities, odds, draw, catalog loading |
| `server/make-banners.js` | new | generator: drawMedalType.json, game_data/gacha_banners.json, game_data/gacha_img/ |
| `server/gacha.js` | new | Shop list, draw checks and payment, result fields, WebView pages |
| `server/server.js` | modify | routes, master URL, `odds` link, /gacha/list and /gacha/draw responses, images |
| `server/routes-info-album.js` | modify | lines in the Notices |
| `server/test-gacha-data.js`, `server/test-make-banners.js`, `server/test-gacha.js`, `server/test-gacha-server.js` | new | offline tests |
| `tools/ldplayer/session/run-server.ps1`, `relogin.ps1`, `update-resources.ps1` | modify | BASE 117 -> 118 |
| `docs/notes/shop.md` | new | Shop/draws protocol |
| `docs/ISSUES.md`, `HANDOFF.md`, `docs/notes/server.md` | modify | status |

---

### Task 1: draw result LWFs (resources)

Recommended model: Opus (judgement on the missing textures).

**Files:**
- Create: `recon/tools/import_jp_raisedraw.py`
- Modify: `tools/ldplayer/session/build-resources.ps1` (after `import_jp_coco.py`, before `btf_fix.py`)

**Interfaces:**
- Consumes: JP data in `lwf\raisedraw\` of the local reference data folder (`KHUX_JP_DATA`, read-only); served index `D:\Progetto_Restauro_KH_UX\resource_data\names_v4.tsv`; `recon/tools/btf.py` (`btf.encode(Image) -> bytes`).
- Produces: `<stage_gen>\files\lwf\raisedraw\demo\raidgacha_result_display_NN\...` (NN 02-10), the missing `...\Medal\Medal_D_{Up,Rev,None}N\...`, `<stage_gen>\raisedraw_report.json`. The server (Task 5) allows `lotCount` only among the `raidgacha_result_display_NN` folders that are served or complete in the report.

Facts (findings.md §4): the Draw scene opens `lwf/raisedraw/demo/raidgacha_result_display_%02d/` with %02d = number of medals (missing file = crash) and for each medal `lwf/raisedraw/Medal/Medal_D_Up|Rev|None<rare>` according to `darklight`. The WW resources only serve `raidgacha_result_display_01` and `Medal_D_Up3`. In the JP data folders 02-10 have the LWF but almost no textures (the JP extraction removes identical files): the textures are named `<base>_<UTF-8 hex of the original name>.png` and are the same «ビットマップ N.png» as in `raidgacha_result_display_01` (served WW). The folders with a `.res` list them; the others must be read from the LWF.

- [ ] **Step 1: Extract the served (WW) raisedraw once**

In `build-resources.ps1`, next to the `catalog\keyblade_lwf` extraction (line ~64, which shows how `BGAD_KEY` is set), add:

```powershell
# LWF of the served draw results (raidgacha_result_display_01, Medal_D_Up3): source of the
# common textures for the JP folders 02-10 (import_jp_raisedraw.py)
$rw = "$D\catalog\raisedraw_ww"
if (-not (Test-Path "$rw\lwf\raisedraw")) { python -I recon\tools\res_bulk.py "$D\resource_data\names_v4.tsv" "$D\resource_data\7\data" $rw lwf/raisedraw/ }
```

Run the same command by hand (same `BGAD_KEY`) and check that `D:\Progetto_Restauro_KH_UX\catalog\raisedraw_ww\lwf\raisedraw\demo\raidgacha_result_display_01\` contains the `.lwf` and the textures.

- [ ] **Step 2: Write the script**

```python
"""Draw result LWFs (Shop > Draw) from the JP 4.3.1 data for the folders that are not served.

    python recon/tools/import_jp_raisedraw.py --ww <catalog\\raisedraw_ww> --out <stage_gen\\files>
                                              --report <stage_gen\\raisedraw_report.json> [--check]
                                              (Pillow: without -I)

The Draw scene (docs/notes/shop.md) opens
lwf/raisedraw/demo/raidgacha_result_display_%02d/ (%02d = medals drawn, 1-10; missing file =
crash) and for each medal lwf/raisedraw/Medal/Medal_D_Up|Rev|None<rare> according to darklight.
The WW resources only serve raidgacha_result_display_01 and Medal_D_Up3.
For each folder that is not served: the JP LWF (highest revision, `<name>.<8 digits>.lwf`, like
latest() in import_jp_coco.py) and all its textures `<base>_<UTF-8 hex of the name>.png`, looked up:
(1) in the same JP folder; (2) in another JP raisedraw folder with the same <hex> (all the
copies identical, otherwise conflict); (3) in the extracted served raisedraw (--ww) with the same
<hex> (already BTF). A folder goes in only if ALL its textures are found: never a missing texture.
JP PNG (straight alpha) -> BTF with btf.encode (premultiplies); WW BTFs copied.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
D = r'D:\Progetto_Restauro_KH_UX'
JP = private_tools.local_path('jp_data', 'lwf', 'raisedraw')
REV = re.compile(r'^(.*)\.(\d{8})(\.[^.]+)$')
TEX = re.compile(rb'([\x20-\x7e\x80-\xff]{1,80}?\.(?:png|PNG))')

WANTED = ([f'demo/raidgacha_result_display_{n:02d}' for n in range(1, 11)]
          + [f'Medal/Medal_D_Up{n}' for n in range(1, 13)]
          + [f'Medal/Medal_D_Rev{n}' for n in range(1, 8)]
          + [f'Medal/Medal_D_None{n}' for n in range(1, 8)])


def served_names():
    names = set()
    with open(os.path.join(D, 'resource_data', 'names_v4.tsv'), encoding='utf-8') as f:
        for line in f:
            names.add(line.split('\t', 1)[0])
    return names


def latest(folder, base, ext):
    """File <base><ext> or the highest revision <base>.<8 digits><ext> in the JP folder."""
    best, best_rev = None, -1
    for f in os.listdir(folder):
        m = REV.match(f)
        if m and m.group(1) == base and m.group(3) == ext and int(m.group(2)) > best_rev:
            best, best_rev = f, int(m.group(2))
        elif f == base + ext and best_rev < 0:
            best = f
    return os.path.join(folder, best) if best else None


def texture_names(lwf_path, res_path):
    """Original texture names: from the .res if there is one (lines lwf/.../<base>_<hex>.png), otherwise
    from the .png strings in the LWF."""
    if res_path and os.path.exists(res_path):
        out = []
        for line in open(res_path, encoding='utf-8'):
            line = line.strip()
            if line:
                hx = os.path.basename(line).rsplit('.', 1)[0].split('_')[-1]
                out.append(bytes.fromhex(hx).decode('utf-8'))
        return out
    data = open(lwf_path, 'rb').read()
    return sorted({m.group(1).decode('utf-8', 'replace') for m in TEX.finditer(data)})


def hexname(name):
    return name.encode('utf-8').hex()


def index_by_hex(root):
    """<hex> -> [paths] of all the textures <something>_<hex>.png under root."""
    idx = {}
    for dp, _, files in os.walk(root):
        for f in files:
            if f.endswith('.png') and '_' in f and not REV.match(f):
                idx.setdefault(f[:-4].split('_')[-1], []).append(os.path.join(dp, f))
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ww', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', required=True)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    served = served_names()
    jp_idx = index_by_hex(JP)
    ww_idx = index_by_hex(os.path.join(a.ww, 'lwf', 'raisedraw'))
    report = {}
    for rel in WANTED:
        base = rel.split('/')[-1]
        target = f'lwf/raisedraw/{rel}/{base}.lwf'
        if target in served:
            report[rel] = {'status': 'served'}
            continue
        folder = os.path.join(JP, *rel.split('/'))
        lwf = latest(folder, base, '.lwf') if os.path.isdir(folder) else None
        if not lwf:
            report[rel] = {'status': 'missing-lwf'}
            continue
        files, missing, conflict = {}, [], []
        for name in texture_names(lwf, latest(folder, base, '.res')):
            hx = hexname(name)
            out_name = f'{base}_{hx}.png'
            own = os.path.join(folder, out_name)
            if os.path.exists(own):
                files[out_name] = ('jp', own)
                continue
            cands = jp_idx.get(hx, [])
            digests = {hashlib.md5(open(p, 'rb').read()).hexdigest() for p in cands}
            if len(digests) == 1:
                files[out_name] = ('jp', cands[0])
            elif len(digests) > 1:
                conflict.append(name)
            elif ww_idx.get(hx):
                files[out_name] = ('ww', ww_idx[hx][0])
            else:
                missing.append(name)
        if missing or conflict:
            report[rel] = {'status': 'incomplete', 'missing': missing, 'conflict': conflict}
            continue
        report[rel] = {'status': 'ok', 'textures': len(files)}
        if a.check:
            continue
        dst = os.path.join(a.out, 'lwf', 'raisedraw', *rel.split('/'))
        os.makedirs(dst, exist_ok=True)
        with open(lwf, 'rb') as s, open(os.path.join(dst, base + '.lwf'), 'wb') as d:
            d.write(s.read())
        for out_name, (kind, src) in files.items():
            data = open(src, 'rb').read()
            if kind == 'jp':
                from PIL import Image
                import io
                data = btf.encode(Image.open(io.BytesIO(data)).convert('RGBA'))
            with open(os.path.join(dst, out_name), 'wb') as d:
                d.write(data)
    with open(a.report, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    for rel, r in report.items():
        print(f"{rel}: {r['status']}" + (f" mancanti {r['missing']} conflitti {r['conflict']}" if r['status'] == 'incomplete' else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

If `btf.encode` has another signature or the JP PNG is already BTF, adapt it by looking at `recon/tools/make_jp_enemies.py` (same conversion) and note it in the task report.

- [ ] **Step 3: Test it in --check mode**

Run: `python recon\tools\import_jp_raisedraw.py --ww D:\Progetto_Restauro_KH_UX\catalog\raisedraw_ww --out D:\Progetto_Restauro_KH_UX\tmp\raisedraw_check --report D:\Progetto_Restauro_KH_UX\tmp\raisedraw_check\report.json --check`

Expected: `demo/raidgacha_result_display_01: served`, `Medal/Medal_D_Up3: served`, and `ok` for `demo/raidgacha_result_display_03` and `_10` (needed for Daily Deal x3 and Epic Medal Carnival x10). If one of these two is `incomplete`, look at the missing names: if they exist in the served `raidgacha_result_display_01` under another name, extend the search and document it; if they are really missing, report it in the task report (Task 5 limits the banners to the complete sizes) and carry on.

- [ ] **Step 4: Real write and hooking into the build**

Run the same command without `--check` with `--out D:\Progetto_Restauro_KH_UX\tmp\raisedraw_check\files` and check that the `ok` folders contain the `.lwf` + all the textures. Then in `build-resources.ps1`, right after `import_jp_coco.py` and before `btf_fix.py`:

```powershell
# LWF of the draw results (Shop > Draw, raidgacha_result_display_02..10 and Medal_D_*):
# from the JP data, complete with textures (docs/notes/shop.md#risorse); report in $sg\raisedraw_report.json
python recon\tools\import_jp_raisedraw.py --ww "$D\catalog\raisedraw_ww" --out "$sg\files" --report "$sg\raisedraw_report.json"
if ($LASTEXITCODE) { throw 'import_jp_raisedraw fallito' }
```

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add recon/tools/import_jp_raisedraw.py tools/ldplayer/session/build-resources.ps1
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t1.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```
Message: «Shop: LWF del risultato delle estrazioni dai dati JP (raidgacha_result_display_02-10, Medal_D_*)» + list of the ok/incomplete folders + Co-Authored-By.

---

### Task 2: texts, icon and banner of the Catalog tile (resources)

Recommended model: Sonnet.

**Files:**
- Create: `recon/tools/make_shop_art.py`
- Modify: `tools/ldplayer/session/build-resources.ps1` (after the loop that copies `layouts\ui_texts`, line ~95)

**Interfaces:**
- Produces: `<stage_gen>\files\text\ui\106140420.txt` … `106140424.txt` (texts of the grey button of the Catalog tile, payType 6 = Gold Ticket), `<stage_gen>\files\img\incentive\Star7_Ticket_39.png` (BTF, 83x83), `server/game_data/gacha_img/9001.png` (PNG 640x140, served by the server to the client over http). Task 4 (`make-banners.js`) does NOT write `9001.png`.

Facts (server_facts.md §5): the Gold Ticket uses the texts 106140392 (name), 106140420-424 (button phrases: 420 «Use 1 Gold Ticket to get 1 Medal», seen on the tile on the bench p3b) and 106180213; the texts of the 4.4.0 IPA overwrite those of `make_layouts.py`, so the rewrite must come AFTER the copy loop. The icon `img/incentive/Star7_Ticket_39.png` (83x83) carries the «仮» mark (placeholder). The Gold Ticket is never given to the player (drawTicket3 always 0): rewriting its texts changes nothing else.

- [ ] **Step 1: Write the script**

```python
"""Art and texts of the Shop «Banner Catalog» tile (docs/superpowers/specs/2026-10-16-shop-banner-design.md 4.1).

    python recon/tools/make_shop_art.py <stage_gen\\files> <server\\game_data>     (Pillow: without -I)

The Catalog tile is a Gold Ticket draw (payType 6) that nobody owns: the button stays
grey and shows the texts 106140420-424 and the icon img/incentive/Star7_Ticket_39.png.
Here the texts become the invitation to open Details and the icon (original with the «仮» mark) becomes a
small list of banners. The 640x140 banner of the tile is written too (served by the server,
/web/gacha/img/9001.png). Texts after the copy of the IPA texts in build-resources.ps1 (otherwise
those would win). Everything drawn here: no bitmaps in the repo.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import btf  # noqa: E402

TEXT = 'Open Details to browse\nthe Banner Catalog'
TEXT_IDS = [106140420, 106140421, 106140422, 106140423, 106140424]
GOLD = (236, 196, 84, 255)
BLUE = (31, 84, 140, 255)
LIGHT = (220, 236, 250, 255)


def font(size):
    for f in (r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\segoeuib.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def icon():
    """83x83: three stacked tiles (list of banners) with a golden border."""
    im = Image.new('RGBA', (83, 83), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, y in enumerate((10, 32, 54)):
        d.rounded_rectangle((8, y, 75, y + 18), radius=4, fill=BLUE, outline=GOLD, width=3)
        d.rectangle((14, y + 6, 14 + 30 - i * 6, y + 11), fill=LIGHT)
    return im


def banner():
    """640x140: blue gradient background, title and subtitle."""
    im = Image.new('RGBA', (640, 140), BLUE)
    d = ImageDraw.Draw(im)
    for y in range(140):
        c = int(40 + 60 * y / 139)
        d.line((0, y, 639, y), fill=(18, c, 120 + c // 2, 255))
    d.rounded_rectangle((6, 6, 633, 133), radius=10, outline=GOLD, width=4)
    d.text((320, 52), 'BANNER CATALOG', font=font(46), fill=GOLD, anchor='mm', stroke_width=2, stroke_fill=(40, 30, 10, 255))
    d.text((320, 102), 'Every original banner - open Details', font=font(24), fill=LIGHT, anchor='mm')
    return im


def main():
    sg, game_data = sys.argv[1], sys.argv[2]
    for tid in TEXT_IDS:
        p = os.path.join(sg, 'text', 'ui', f'{tid}.txt')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(TEXT)
    p = os.path.join(sg, 'img', 'incentive', 'Star7_Ticket_39.png')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(btf.encode(icon()))
    out = os.path.join(game_data, 'gacha_img')
    os.makedirs(out, exist_ok=True)
    banner().convert('RGB').save(os.path.join(out, '9001.png'))
    print('make_shop_art: testi', TEXT_IDS, 'icona Star7_Ticket_39, banner 9001')
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

If `btf.encode` wants another argument, adapt it as in `recon/tools/make_shop_lock.py` / `make_textures.py`.

- [ ] **Step 2: Test it outside the build**

Run: `python recon\tools\make_shop_art.py D:\Progetto_Restauro_KH_UX\tmp\shop_art\files server\game_data`
Expected: prints the final line; `tmp\shop_art\files\text\ui\106140420.txt` contains the two lines; `server\game_data\gacha_img\9001.png` is 640x140. Open `9001.png` and a decoded PNG of the icon (`btf.decode`) and look at them: the text must stay inside the frame and be readable.

- [ ] **Step 3: Hook it into the build**

In `build-resources.ps1`, right after the `foreach` that copies `layouts\ui_texts\text\ui` (line ~95):

```powershell
# Shop «Banner Catalog» tile: Gold Ticket button texts (106140420-424) and icon
# Star7_Ticket_39 (it had the «仮» mark), after the IPA texts; banner 9001 in server\game_data\gacha_img
python recon\tools\make_shop_art.py "$sg\files" server\game_data
if ($LASTEXITCODE) { throw 'make_shop_art fallito' }
```

- [ ] **Step 4: Commit**

```bash
git -c safe.directory=* add recon/tools/make_shop_art.py tools/ldplayer/session/build-resources.ps1
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t2.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 3: `server/gacha-data.js` (pure functions)

Recommended model: Haiku (complete code below).

**Files:**
- Create: `server/gacha-data.js`
- Test: `server/test-gacha-data.js`

**Interfaces:**
- Produces (used by Tasks 4 and 5):
  - `CATALOG_ID = 9001`, `UPGRADE_CHANCE = 0.08`
  - `parseRarityMix(s: string) -> Array<[rare: number, n: number]>` (descending rarity; entries without ★ ignored)
  - `slotRarities(banner) -> number[]` (length `banner.lotCount`)
  - `slotOdds(banner) -> Array<{rare: number, pct: number}>[]` (one list per slot)
  - `rollDraw(banner, rng: () => number) -> number[]` (medalId, length `lotCount`)
  - `drawMedalTypeRow({drawMedalTypeId, name, payType, price, sortId, bannerUrl, detailUrl, comment}) -> object` (47 schema fields)
  - `loadBanners(file: string) -> object[]` (`[]` if the file is missing or invalid)
  - `bannerById(list, id) -> object | undefined`
- Shape of a banner (written by Task 4): `{ drawMedalTypeId, rowId, name, startDate, endDate, status, payType, price, lotCount, isDayLimited, rarityMix, pool: { '<rare>': number[] }, maxSet, image, guarantees, notes, test, sortId, comment }`.

- [ ] **Step 1: Write the test**

```js
// Test of the pure draw functions: node server/test-gacha-data.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const g = require('./gacha-data');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

check(JSON.stringify(g.parseRarityMix('4★:1 3★:2')) === '[[4,1],[3,2]]', 'mix semplice');
check(JSON.stringify(g.parseRarityMix('6★:2 5★:3 3★:5 Other:1')) === '[[6,2],[5,3],[3,5]]', 'Other ignorato');
check(JSON.stringify(g.parseRarityMix('3★:5 5★:1 4★:4')) === '[[5,1],[4,4],[3,5]]', 'ordine decrescente');
check(JSON.stringify(g.parseRarityMix('')) === '[]', 'vuoto');

const b = { lotCount: 3, rarityMix: [[4, 1], [3, 2]], pool: { 3: [31, 32], 4: [41], 5: [51] } };
check(JSON.stringify(g.slotRarities(b)) === '[4,3,3]', 'slot dal mix');
check(JSON.stringify(g.slotRarities({ ...b, lotCount: 5 })) === '[4,3,3,3,3]', 'slot mancanti = rarita piu bassa');
check(JSON.stringify(g.slotRarities({ ...b, lotCount: 2 })) === '[4,3]', 'slot in eccesso tagliati');

// rng: 0.5 -> no promotion, then index; 0.01 -> promotion
check(JSON.stringify(g.rollDraw(b, seq(0.5, 0.0, 0.5, 0.0, 0.5, 0.99))) === '[41,31,32]', 'estrazione senza promozioni');
check(JSON.stringify(g.rollDraw(b, seq(0.01, 0.0, 0.5, 0.0, 0.5, 0.0))) === '[51,31,31]', 'promozione 4 -> 5');
const noUp = { lotCount: 1, rarityMix: [[5, 1]], pool: { 5: [51] } };
check(JSON.stringify(g.rollDraw(noUp, seq(0.01, 0.0))) === '[51]', 'niente 6 nel pool: resta 5');
const holes = { lotCount: 1, rarityMix: [[4, 1]], pool: { 3: [31] } };
check(JSON.stringify(g.rollDraw(holes, seq(0.5, 0.0))) === '[31]', 'pool 4 vuoto: scende a 3');
let threw = false;
try { g.rollDraw({ lotCount: 1, rarityMix: [[4, 1]], pool: {} }, Math.random); } catch { threw = true; }
check(threw, 'pool vuoto: errore');

const odds = g.slotOdds(b);
check(odds.length === 3 && odds[0][0].rare === 4 && odds[0][0].pct === 92 && odds[0][1].rare === 5 && odds[0][1].pct === 8, 'probabilita slot 4');
check(g.slotOdds(noUp)[0].length === 1 && g.slotOdds(noUp)[0][0].pct === 100, 'probabilita senza promozione');

const row = g.drawMedalTypeRow({ drawMedalTypeId: 10001, name: 'X', payType: 1, price: 600, sortId: 10,
  bannerUrl: '/web/gacha/img/10001.png', detailUrl: '/web/gacha/detail/10001', comment: '3 Medals' });
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'recon', 'out', 'master_types_ww431.json'), 'utf8')).drawMedalType;
const fields = Object.keys(schema.fields || schema);
check(fields.length === 47 && fields.every((f) => f in row), 'riga master con tutti i 47 campi');
check(row.benefitId === 0 && row.drawType === 1 && row.price === 600 && row.validComment === 1 && row.warrantDisplayOfTime === 1, 'valori della riga');

const tmp = path.join(os.tmpdir(), `khux-test-banners-${process.pid}.json`);
check(g.loadBanners(tmp).length === 0, 'file assente -> []');
fs.writeFileSync(tmp, JSON.stringify({ banners: [{ drawMedalTypeId: 10001 }] }));
check(g.bannerById(g.loadBanners(tmp), 10001)?.drawMedalTypeId === 10001, 'caricamento e ricerca');
fs.writeFileSync(tmp, '{rotto');
check(g.loadBanners(tmp).length === 0, 'file non valido -> []');
fs.unlinkSync(tmp);

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: gacha-data');
```

Before writing the schema check, open `recon/out/master_types_ww431.json` and look at the shape of the `drawMedalType` entry (fields->type object or `{fields: ...}`); adapt the `const fields = ...` line to the real shape.

- [ ] **Step 2: Run it and watch it fail**

Run: `node server/test-gacha-data.js`
Expected: error `Cannot find module './gacha-data'`.

- [ ] **Step 3: Write the module**

```js
// Shop draws: pure functions (docs/notes/shop.md, spec 2026-10-16-shop-banner-design.md 4.8).
// The banner catalog (server/game_data/gacha_banners.json) is written by server/make-banners.js.
// RECONSTRUCTED odds (the original only published the composition): every slot has the rarity
// of the original mix (banners_ww.tsv, e.g. «4★:1 3★:2») and UPGRADE_CHANCE of going up one star if the
// pool has one; the tables per banner type come with sub-project 2.
'use strict';
const fs = require('fs');

const CATALOG_ID = 9001;
const UPGRADE_CHANCE = 0.08;

function parseRarityMix(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/(\d)★:(\d+)/g)) out.push([Number(m[1]), Number(m[2])]);
  return out.sort((a, b) => b[0] - a[0]);
}

function slotRarities(banner) {
  const slots = [];
  for (const [rare, n] of banner.rarityMix) for (let k = 0; k < n; k++) slots.push(rare);
  const low = slots.length ? slots[slots.length - 1] : 3;
  while (slots.length < banner.lotCount) slots.push(low);
  return slots.slice(0, banner.lotCount);
}

const poolOf = (banner, rare) => banner.pool[rare] || banner.pool[String(rare)] || [];

function slotOdds(banner) {
  return slotRarities(banner).map((rare) => {
    if (!poolOf(banner, rare + 1).length) return [{ rare, pct: 100 }];
    const up = Math.round(UPGRADE_CHANCE * 100);
    return [{ rare, pct: 100 - up }, { rare: rare + 1, pct: up }];
  });
}

function rollDraw(banner, rng) {
  return slotRarities(banner).map((rare) => {
    let r = rare;
    if (poolOf(banner, rare + 1).length && rng() < UPGRADE_CHANCE) r = rare + 1;
    while (r >= 1 && !poolOf(banner, r).length) r--;
    const list = poolOf(banner, r);
    if (!list.length) throw new Error(`banner ${banner.drawMedalTypeId}: pool vuoto per ${rare}★`);
    return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  });
}

// drawMedalType master row (47 fields, recon/out/master_types_ww431.json).
// bannerUrl/detailUrl are paths: server.js (servedMasterRows) prepends the http address.
// drawType 1; benefitId 0 (the padlock opens the in-app purchase: crash, I-134); comment = scrolling
// strip under the banner, printf string (no loose %), visible with warrantDisplayOfTime 1
// and userWarrantDisplayOfTime 1 in the list (spike of 16-10, test 3).
function drawMedalTypeRow({ drawMedalTypeId, name, payType, price, sortId, bannerUrl, detailUrl, comment }) {
  const z = (n) => Array(n).fill(0);
  return {
    drawMedalTypeId, drawType: 1, sortId, name, benefitId: 0, payType, price,
    validFluctuationPrice: 0, fluctuationPrice: z(5), tableId: 0, validLot: 0, lotName: ['', '', ''],
    lotCount: z(3), lotSsr: z(3), lotPsr: z(3), lotSr: z(3), lotPr: z(3), lotR: z(3), lotPn: z(3), lotN: z(3),
    tableIds: z(3), vipcoinNumber: 0, limitedvipcoinNumber: 0, validAdd: 0, addType: 0, addId: 0, addSkillType: 0,
    addSkillId: 0, addSkillLv: 0, addNum: 0, bannerUrl, mypageBanner: 0, detailUrl, dayCount: 0,
    warrantNumberOfTime: 0, warrantDisplayOfTime: 1, validComment: 1, comment: String(comment).replace(/%/g, '%%'),
    warrantCounterId: 0, warrantTableIds: 0, warrantMedalListIds: [0], warrantMedalRepeat: 0,
    warrantResetMedalListIds: z(10), displayTimeLeft: 0, startDate: '2016-04-07 00:00:00',
    endDate: '2099-12-31 23:59:59', isDeleted: 0,
  };
}

function loadBanners(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.banners) ? data.banners : [];
  } catch {
    return [];
  }
}

const bannerById = (list, id) => list.find((b) => b.drawMedalTypeId === Number(id));

module.exports = { CATALOG_ID, UPGRADE_CHANCE, parseRarityMix, slotRarities, slotOdds, rollDraw, drawMedalTypeRow, loadBanners, bannerById };
```

- [ ] **Step 4: Run the test**

Run: `node server/test-gacha-data.js`
Expected: `OK: gacha-data`. If only a `rollDraw` case fails because of the order of the calls to `rng`, fix the module (not the test): the order is «promotion, then index» for each slot, and the promotion is rolled only if the pool of the star above is not empty.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=* add server/gacha-data.js server/test-gacha-data.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t3.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 4: `server/make-banners.js` (generator) and `server/gacha.js` (logic and pages)

Recommended model: Sonnet.

**Files:**
- Create: `server/make-banners.js`, `server/gacha.js`
- Test: `server/test-make-banners.js`, `server/test-gacha.js`

**Interfaces:**
- Consumes: `gacha-data.js` (Task 3); `server/game_data/gacha_img/9001.png` (Task 2, does not touch it).
- Produces:
  - `make-banners.js` exports `{ parseTsv(text) -> object[], wikiMedals(wikiObj) -> Array<{name, naset, class1, class2}>, maxSetOf(notes) -> number, buildPool(names: string[], medalRows, rarities: number[]) -> {'<rare>': number[]}, bannerFromRow(row, opts) -> banner, PLAN_ROWS, TEST_ROWS, MAX_SET_NOW }`; run from the command line it writes `server/master_data/drawMedalType.json`, `server/game_data/gacha_banners.json` and copies the images into `server/game_data/gacha_img/<id>.png`.
  - `gacha.js` exports:
    - `WALLET = {1: 'freeStone', 7: 'limitedDrawTicket1', 8: 'limitedDrawTicket2'}`
    - `catalogPlate() -> gachaList element`; `catalogRow() -> master row`
    - `visibleBanners(banners, {test}) -> banner[]`
    - `dayLeft(player, banner, realMs) -> number` (draws left today: 1 or 0 for isDayLimited, 0 otherwise)
    - `gachaListData(banners, player, {realMs, webBase, test, sizes}) -> {gachaList, petGachaList: []}`
    - `checkDraw(banner, player, body, {realMs, test, freeSlots, sizes}) -> string | null` (reason for the refusal)
    - `payDraw(banner, player, realMs) -> void`
    - `drawResultFields(userMedalIds, firstIds) -> {gachaBonus, firstGetUserMedalIds, userMedalIds, effectNumbers}`
    - `detailPage(banner, medalNames: Map<number,string>) -> string`, `oddsPage(banners) -> string`, `catalogPage(banners, {test}) -> string`
  - `sizes`: `Set<number>` of the medal counts for which the client has the animation (`raidgacha_result_display_NN`); default `new Set([1, 3, 10])` in server.js, to be updated with the Task 1 report.

Facts: banners_ww.tsv has the columns `row_id name start_pt end_pt days status recurring seasonal event_tie_in featured_medals pool_medals currency price draw_size rarity_mix guarantees rates image_file image_size image_url source_url confidence notes source` (TAB). wiki_all.json = `{title: wikitext}`; every medal has a `{{InfoMedal ... }}` block with lines `|naset=21`, `|name=101 Dalmatians`, `|class1=Common|Rare|Super Rare|Normal|Event|VIP|Bonus`, `|class2=Attack...`. medal.json: `medalId, name, rare, type (1 = attack), validPack (1 = stackable)`; id >= 300000 = recent versions/7★. naset <= 9 = April-December 2016 (the restored story reaches quest 525 = 8/12/2016).

- [ ] **Step 1: Write the tests**

`server/test-make-banners.js`:

```js
// Test of the banner generator: node server/test-make-banners.js
'use strict';
const m = require('./make-banners');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const head = 'row_id\tname\tstart_pt\tend_pt\tdays\tstatus\trecurring\tseasonal\tevent_tie_in\tfeatured_medals\tpool_medals\tcurrency\tprice\tdraw_size\trarity_mix\tguarantees\trates\timage_file\timage_size\timage_url\tsource_url\tconfidence\tnotes\tsource';
const line = 'B0011\tEpic Medal Carnival\t2016-05-13\t2016-05-19\t7\ttime-limited\t\t\t\t\t\tJewels\t3000\tx10\t5★:1 4★:4 3★:5\tGuarantees a 5★ Epic Medal\t\tShop_-_Epic.png\t640x140\t\t\tsure\tDraws from sets 1.1, 1.2, 1.3, and 2.1. Guarantees a 5★\tx';
const rows = m.parseTsv(head + '\n' + line + '\n');
check(rows.length === 1 && rows[0].row_id === 'B0011' && rows[0].draw_size === 'x10', 'TSV');

const wiki = {
  A: '{{InfoMedal\n|naset=1\n|name=Wakka\n|class1=Rare\n|class2=Attack\n}}\ntesto',
  B: '{{InfoMedal\n|naset=12\n|name=Late\n|class1=Rare\n|class2=Attack\n}}',
  C: '{{InfoMedal\n|naset=2\n|name=Dewey\n|class1=Event\n|class2=Attack\n}}',
  D: 'pagina senza medaglia',
};
const wm = m.wikiMedals(wiki);
check(wm.length === 3 && wm.find((x) => x.name === 'Wakka').naset === 1, 'medaglie della wiki');

check(m.maxSetOf('Draws from sets 1.1, 1.2, 1.3, and 2.1. Other') === 2, 'set dalle note');
check(m.maxSetOf('Available once per day.') === m.MAX_SET_NOW, 'senza set: fino alla storia attuale');

const medalRows = [
  { medalId: 11013, name: 'Wakka', rare: 3, type: 1, validPack: 0 },
  { medalId: 11014, name: 'Wakka', rare: 4, type: 1, validPack: 0 },
  { medalId: 11015, name: 'Wakka', rare: 5, type: 1, validPack: 0 },
  { medalId: 300007, name: 'Wakka', rare: 7, type: 1, validPack: 0 },
  { medalId: 90041, name: 'Dewey', rare: 3, type: 1, validPack: 1 },
  { medalId: 11099, name: 'Wakka', rare: 3, type: 2, validPack: 0 },
];
const pool = m.buildPool(['Wakka', 'Dewey'], medalRows, [3, 4, 5, 6]);
check(JSON.stringify(pool) === '{"3":[11013],"4":[11014],"5":[11015]}', 'pool: solo attacco, non impilabili, < 300000');

const b = m.bannerFromRow(rows[0], { wikiList: wm, medalRows, test: false, sortId: 30 });
check(b.drawMedalTypeId === 10011 && b.payType === 1 && b.price === 3000 && b.lotCount === 10, 'banner: id, moneta, prezzo, dimensione');
check(b.isDayLimited === 0 && b.maxSet === 2 && JSON.stringify(b.rarityMix) === '[[5,1],[4,4],[3,5]]', 'banner: limite, set, mix');
check(b.image === 'Shop_-_Epic.png' && /10 Medals/.test(b.comment) && !b.comment.includes('%'), 'banner: immagine e didascalia');
const daily = m.bannerFromRow({ ...rows[0], row_id: 'B0001', draw_size: 'x3', price: '600', notes: 'Available once per day.' }, { wikiList: wm, medalRows, test: false, sortId: 10 });
check(daily.isDayLimited === 1 && /once per day/.test(daily.comment), 'once per day');
const plat = m.bannerFromRow({ ...rows[0], row_id: 'B0456', currency: 'Platinum Ticket', price: '1 Platinum Ticket', draw_size: 'x5', rarity_mix: '5★:5' }, { wikiList: wm, medalRows, test: true, sortId: 90 });
check(plat.payType === 7 && plat.price === 1 && plat.test === true, 'Platinum Ticket = payType 7');
let threw = false;
try { m.bannerFromRow({ ...rows[0], currency: 'Moogle Point' }, { wikiList: wm, medalRows, test: false, sortId: 1 }); } catch { threw = true; }
check(threw, 'moneta sconosciuta: errore');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: make-banners');
```

`server/test-gacha.js`:

```js
// Test of the Shop logic: node server/test-gacha.js
'use strict';
const g = require('./gacha');
const clock = require('./clock');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const U = (y, mo, d, h = 0) => Date.UTC(y, mo - 1, d, h);

const daily = { drawMedalTypeId: 10001, rowId: 'B0001', name: 'DAILY DEAL!', payType: 1, price: 600, lotCount: 3, isDayLimited: 1,
  rarityMix: [[4, 1], [3, 2]], pool: { 3: [11013], 4: [11014] }, test: false, sortId: 10, comment: '3 Medals', startDate: '2016-04-07', endDate: '2018-01-31', image: 'a.png' };
const plat = { ...daily, drawMedalTypeId: 10456, name: 'Platinum Ticket Draw', payType: 7, price: 1, lotCount: 5, isDayLimited: 0, test: true, sortId: 90 };
const big = { ...daily, drawMedalTypeId: 10011, name: 'Epic Medal Carnival', price: 3000, lotCount: 10, isDayLimited: 0, sortId: 30 };
const banners = [daily, big, plat];
const sizes = new Set([1, 3, 10]);
const t0 = U(2026, 10, 16, 15);

// list
let l = g.gachaListData(banners, { freeStone: 0 }, { realMs: t0, webBase: 'http://h', test: false, sizes });
check(l.petGachaList.length === 0 && l.gachaList[0].drawMedalTypeId === 9001, 'Catalog in cima');
check(l.gachaList.length === 3 && !l.gachaList.some((x) => x.drawMedalTypeId === 10456), 'banner di prova nascosto');
const e = l.gachaList.find((x) => x.drawMedalTypeId === 10001);
check(e.isDayLimited === 1 && e.userLimitedCount === 1 && e.lotCount === 3 && e.bannerUrl === 'http://h/web/gacha/img/10001.png', 'elemento Daily');
check(['validAdd', 'drawMedalTypeId', 'drawType', 'sortId', 'payType', 'price', 'lotCount', 'isDayLimited', 'userLimitedCount',
  'userWarrantDisplayOfTime', 'name', 'description', 'bannerUrl', 'warrantMedalIds', 'drawTicketlimitDate'].every((k) => k in e), 'campi obbligatori');
const cat = l.gachaList[0];
check(cat.payType === 6 && cat.price === 1 && cat.drawType === 1, 'Catalog innocuo');
l = g.gachaListData(banners, {}, { realMs: t0, webBase: 'http://h', test: true, sizes });
check(l.gachaList.some((x) => x.drawMedalTypeId === 10456), 'banner di prova con KHUX_GACHA_TEST');
l = g.gachaListData(banners, {}, { realMs: t0, webBase: 'http://h', test: false, sizes: new Set([1, 3]) });
check(!l.gachaList.some((x) => x.drawMedalTypeId === 10011), 'x10 senza animazione: nascosto');

// draw checks
const p = { freeStone: 1000, limitedDrawTicket1: 0 };
const opt = { realMs: t0, test: false, freeSlots: 100, sizes };
check(g.checkDraw(daily, p, { drawMedalTypeId: 10001, count: 3 }, opt) === null, 'Daily ok');
check(g.checkDraw(undefined, p, { drawMedalTypeId: 1 }, opt) !== null, 'banner sconosciuto');
check(g.checkDraw({ drawMedalTypeId: 9001, payType: 6 }, p, {}, opt) !== null, 'Catalog rifiutato');
check(g.checkDraw(big, p, { count: 10 }, opt) !== null, 'jewel insufficienti');
check(g.checkDraw(daily, p, { count: 3 }, { ...opt, freeSlots: 2 }) !== null, 'box senza posti per 3');
check(g.checkDraw(plat, { limitedDrawTicket1: 5 }, { count: 5 }, opt) !== null, 'prova senza KHUX_GACHA_TEST');
check(g.checkDraw(plat, { limitedDrawTicket1: 5 }, { count: 5 }, { ...opt, test: true, sizes: new Set([1, 3, 5, 10]) }) === null, 'Platinum con biglietti');
check(g.checkDraw(plat, { limitedDrawTicket1: 0 }, { count: 5 }, { ...opt, test: true, sizes: new Set([5]) }) !== null, 'Platinum senza biglietti');
check(g.checkDraw(big, { freeStone: 9999 }, { count: 10 }, { ...opt, sizes: new Set([1, 3]) }) !== null, 'dimensione senza animazione');

// payment and daily limit
g.payDraw(daily, p, t0);
check(p.freeStone === 400, 'jewel scalati una volta');
check(g.dayLeft(p, daily, t0) === 0 && g.checkDraw(daily, { ...p, freeStone: 5000 }, { count: 3 }, opt) !== null, 'Daily: seconda volta rifiutata');
const next = clock.dayEnd(t0) + 1;
check(g.dayLeft(p, daily, next) === 1, 'Daily: il giorno dopo di nuovo disponibile');
const q = { limitedDrawTicket1: 3 };
g.payDraw(plat, q, t0);
check(q.limitedDrawTicket1 === 2, 'biglietto scalato');

// result fields
const r = g.drawResultFields([501, 502], [501]);
check(JSON.stringify(r) === JSON.stringify({ gachaBonus: { addType: 1, number: 0, userMedalIds: [] }, firstGetUserMedalIds: [501], userMedalIds: [501, 502], effectNumbers: [0, 0] }), 'campi del risultato');

// pages
const names = new Map([[11013, 'Wakka'], [11014, 'Wakka']]);
const d = g.detailPage(daily, names);
check(d.includes('DAILY DEAL!') && d.includes('Wakka') && d.includes('reconstructed') && d.includes('once per day'), 'pagina dettagli');
const o = g.oddsPage(banners.filter((b) => !b.test));
check(o.includes('DAILY DEAL!') && o.includes('92%') && o.includes('8%'), 'pagina odds');
const c = g.catalogPage(banners, { test: false });
check(c.includes('/web/gacha/detail/10001') && !c.includes('10456'), 'pagina catalogo');
check(!g.detailPage({ ...daily, name: '<b>' }, names).includes('<b>'), 'escape HTML');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: gacha');
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node server/test-make-banners.js` and `node server/test-gacha.js`
Expected: `Cannot find module './make-banners'` / `'./gacha'`.

- [ ] **Step 3: Write `server/make-banners.js`**

```js
#!/usr/bin/env node
// Shop banner generator (spec 2026-10-16-shop-banner-design.md, sub-project 1).
//   node server/make-banners.js        then raise KHUX_REVISION (master drawMedalType)
// Sources outside the repo (collected data, read-only):
//   KHUX_BANNERS_TSV (default <repo>/../../reference/banners/banners_ww.tsv) and the images
//   folder next to it (img/); KHUX_WIKI_JSON (default <repo>/../../wiki/wiki_all.json);
//   server/master_data/medal.json.
// Outputs (ignored by git): server/master_data/drawMedalType.json (Catalog tile + banners),
//   server/game_data/gacha_banners.json (catalog with the pools), server/game_data/gacha_img/<id>.png
//   (only images already 640x140; 9001.png is written by recon/tools/make_shop_art.py).
// Pool (reconstructed): wiki attack medals with naset <= highest set cited in the notes
// («Draws from sets 1.1, 1.2 ...»), otherwise <= MAX_SET_NOW (story restored up to quest 525,
// 8/12/2016 = set 9); excluded class1 Event/VIP/Bonus, stackable medals and id >= 300000.
'use strict';
const fs = require('fs');
const path = require('path');
const gd = require('./gacha-data');

const ROOT = path.resolve(__dirname, '..');
const TSV = process.env.KHUX_BANNERS_TSV || path.resolve(ROOT, '..', '..', 'reference', 'banners', 'banners_ww.tsv');
const WIKI = process.env.KHUX_WIKI_JSON || path.resolve(ROOT, '..', '..', 'wiki', 'wiki_all.json');
const MASTER = process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data');
const GAME = process.env.KHUX_GAME_DATA || path.join(__dirname, 'game_data');

const PLAN_ROWS = ['B0001', 'B0027', 'B0011']; // Daily Deal, Small Deal, Epic Medal Carnival
const TEST_ROWS = ['B0456'];                   // Platinum Ticket Draw (2019): only with KHUX_GACHA_TEST=1
const MAX_SET_NOW = 9;
const CURRENCY = { Jewels: 1, 'Platinum Ticket': 7, 'Draw Ticket': 8 };
const NO_DRAW_CLASS = /^(Event|VIP|Bonus)/;

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const head = lines.shift().split('\t');
  return lines.map((l) => { const c = l.split('\t'); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}

function wikiMedals(wiki) {
  const out = [];
  for (const text of Object.values(wiki)) {
    for (const block of String(text).matchAll(/\{\{InfoMedal([\s\S]*?)\n\}\}/g)) {
      const f = {};
      for (const m of block[1].matchAll(/^\|(\w+)=(.*)$/gm)) f[m[1]] = m[2].trim();
      const naset = Number(f.naset);
      if (f.name && Number.isInteger(naset) && naset >= 1) out.push({ name: f.name, naset, class1: f.class1 || '', class2: f.class2 || '' });
    }
  }
  return out;
}

function maxSetOf(notes) {
  const m = /sets? ([\d., and]+)/.exec(notes || '');
  if (!m) return MAX_SET_NOW;
  const sets = [...m[1].matchAll(/(\d+)\.\d+/g)].map((x) => Number(x[1]));
  return sets.length ? Math.max(...sets) : MAX_SET_NOW;
}

function buildPool(names, medalRows, rarities) {
  const want = new Set(names);
  const pool = {};
  for (const r of medalRows) {
    if (!want.has(r.name) || r.type !== 1 || r.validPack === 1 || r.medalId >= 300000 || !rarities.includes(r.rare)) continue;
    (pool[r.rare] = pool[r.rare] || []).push(r.medalId);
  }
  for (const k of Object.keys(pool)) pool[k].sort((a, b) => a - b);
  return pool;
}

function bannerFromRow(row, { wikiList, medalRows, test, sortId }) {
  const payType = CURRENCY[row.currency];
  if (!payType) throw new Error(`${row.row_id}: moneta ${row.currency} non gestita`);
  const lotCount = Number(String(row.draw_size).replace(/^x/, ''));
  const rarityMix = gd.parseRarityMix(row.rarity_mix);
  const maxSet = maxSetOf(row.notes);
  const names = wikiList.filter((w) => w.naset <= maxSet && !NO_DRAW_CLASS.test(w.class1) && /Attack/.test(w.class2)).map((w) => w.name);
  const rarities = [...new Set(rarityMix.flatMap(([r]) => [r, r + 1]))];
  const isDayLimited = /once (per|a) day/i.test(row.notes) ? 1 : 0;
  const mix = rarityMix.map(([r, n]) => `${n}x ${r}★+`).join(', ');
  const comment = `${lotCount} Medal${lotCount === 1 ? '' : 's'}: ${mix}${isDayLimited ? ' - once per day' : ''}`;
  const b = {
    drawMedalTypeId: 10000 + Number(row.row_id.slice(1)), rowId: row.row_id, name: row.name,
    startDate: row.start_pt, endDate: row.end_pt, status: row.status, payType, price: parseInt(row.price, 10),
    lotCount, isDayLimited, rarityMix, pool: buildPool(names, medalRows, rarities), maxSet,
    image: row.image_file, guarantees: row.guarantees, notes: row.notes, test, sortId, comment,
  };
  for (const [r] of rarityMix) if (!(b.pool[r] || []).length) throw new Error(`${row.row_id}: nessuna medaglia ${r}★ nel pool`);
  return b;
}

function main() {
  const rows = parseTsv(fs.readFileSync(TSV, 'utf8'));
  const wikiList = wikiMedals(JSON.parse(fs.readFileSync(WIKI, 'utf8')));
  const medalRows = JSON.parse(fs.readFileSync(path.join(MASTER, 'medal.json'), 'utf8'));
  const pick = [...PLAN_ROWS.map((id) => [id, false]), ...TEST_ROWS.map((id) => [id, true])];
  const banners = pick.map(([id, test], i) => {
    const row = rows.find((r) => r.row_id === id);
    if (!row) throw new Error(`${id} assente da ${TSV}`);
    return bannerFromRow(row, { wikiList, medalRows, test, sortId: 10 * (i + 1) });
  });
  const master = [require('./gacha').catalogRow(), ...banners.map((b) => gd.drawMedalTypeRow({
    drawMedalTypeId: b.drawMedalTypeId, name: b.name, payType: b.payType, price: b.price, sortId: b.sortId,
    bannerUrl: `/web/gacha/img/${b.drawMedalTypeId}.png`, detailUrl: `/web/gacha/detail/${b.drawMedalTypeId}`, comment: b.comment,
  }))];
  fs.writeFileSync(path.join(MASTER, 'drawMedalType.json'), JSON.stringify(master));
  fs.mkdirSync(path.join(GAME, 'gacha_img'), { recursive: true });
  fs.writeFileSync(path.join(GAME, 'gacha_banners.json'), JSON.stringify({ banners }));
  const imgDir = path.join(path.dirname(TSV), 'img');
  for (const b of banners) {
    const row = rows.find((r) => r.row_id === b.rowId);
    const src = path.join(imgDir, b.image);
    if (row.image_size !== '640x140' || !fs.existsSync(src)) { console.log(`  ${b.rowId}: immagine ${b.image} (${row.image_size}) non copiata`); continue; }
    fs.copyFileSync(src, path.join(GAME, 'gacha_img', `${b.drawMedalTypeId}.png`));
  }
  for (const b of banners) console.log(`${b.rowId} ${b.name}: id ${b.drawMedalTypeId}, payType ${b.payType} x${b.price}, ${b.lotCount} medaglie, set <= ${b.maxSet}, pool ${Object.entries(b.pool).map(([r, l]) => `${r}★ ${l.length}`).join(' ')}${b.test ? ' (prova)' : ''}`);
  console.log('poi alzare KHUX_REVISION (drawMedalType)');
}

if (require.main === module) main();
module.exports = { parseTsv, wikiMedals, maxSetOf, buildPool, bannerFromRow, PLAN_ROWS, TEST_ROWS, MAX_SET_NOW };
```

- [ ] **Step 4: Write `server/gacha.js`**

```js
// Shop > Draw: list, draw and WebView pages (docs/notes/shop.md; spec 2026-10-16-shop-banner-design.md).
// GET /gacha/list (action 75): gachaList[] (all fields mandatory) and petGachaList[]
// (mandatory even if empty: without it, «200 ERROR :75»). The client requests it every time the Shop opens
// and after every draw; closing the Details WebView does NOT request it.
// POST /gacha/draw (action 76): body {drawMedalTypeId, count = lotCount}; the client first checks
// jewels/tickets and 1 slot in the box, then opens the scene and re-reads GET /user/stone: the jewels are
// deducted by the server here. Response in server.js (respondGachaDraw).
'use strict';
const clock = require('./clock');
const gd = require('./gacha-data');

const WALLET = { 1: 'freeStone', 7: 'limitedDrawTicket1', 8: 'limitedDrawTicket2' };

// «Banner Catalog» tile (spec 4.1): Gold Ticket (payType 6, drawTicket3 always 0) price 1: grey
// button, the tap sends no requests; Details opens the catalog (detailUrl of the master).
function catalogRow() {
  return gd.drawMedalTypeRow({ drawMedalTypeId: gd.CATALOG_ID, name: 'Banner Catalog', payType: 6, price: 1, sortId: 1,
    bannerUrl: `/web/gacha/img/${gd.CATALOG_ID}.png`, detailUrl: '/web/gacha/catalog', comment: 'Open Details to browse all banners' });
}

function plate(b, webBase, userLimitedCount) {
  return {
    validAdd: 0, drawMedalTypeId: b.drawMedalTypeId, drawType: 1, sortId: b.sortId, payType: b.payType, price: b.price,
    lotCount: b.lotCount, isDayLimited: b.isDayLimited || 0, userLimitedCount, userWarrantDisplayOfTime: 1,
    name: b.name, description: b.name, bannerUrl: `${webBase}/web/gacha/img/${b.drawMedalTypeId}.png`,
    warrantMedalIds: [], drawTicketlimitDate: '2030-12-31 23:59:59',
  };
}

function catalogPlate(webBase) {
  return plate({ drawMedalTypeId: gd.CATALOG_ID, sortId: 1, payType: 6, price: 1, lotCount: 1, name: 'Banner Catalog' }, webBase, 0);
}

const visibleBanners = (banners, { test }) => banners.filter((b) => test || !b.test);

function dayLeft(player, banner, realMs) {
  if (!banner.isDayLimited) return 0;
  const g = player.gacha || {};
  const used = g.day === clock.dayIndex(realMs) ? (g.used?.[banner.drawMedalTypeId] || 0) : 0;
  return Math.max(0, 1 - used);
}

function gachaListData(banners, player, { realMs, webBase, test, sizes }) {
  const list = visibleBanners(banners, { test }).filter((b) => sizes.has(b.lotCount));
  return { gachaList: [catalogPlate(webBase), ...list.map((b) => plate(b, webBase, dayLeft(player, b, realMs)))], petGachaList: [] };
}

function checkDraw(banner, player, body, { realMs, test, freeSlots, sizes }) {
  if (!banner) return `banner ${body?.drawMedalTypeId} sconosciuto`;
  const wallet = WALLET[banner.payType];
  if (!wallet) return `payType ${banner.payType} non estraibile`;
  if (banner.test && !test) return 'banner di prova senza KHUX_GACHA_TEST=1';
  if (!sizes.has(banner.lotCount)) return `animazione per ${banner.lotCount} medaglie assente`;
  if (Number(body?.count) !== banner.lotCount) console.log(`  [gacha] count ${body?.count} diverso da lotCount ${banner.lotCount}: vale lotCount`);
  if (banner.isDayLimited && dayLeft(player, banner, realMs) < 1) return 'gia\' estratto oggi';
  if ((player[wallet] || 0) < banner.price) return `${wallet} ${player[wallet] || 0} < ${banner.price}`;
  if (freeSlots < banner.lotCount) return `box: ${freeSlots} posti per ${banner.lotCount} medaglie`;
  return null;
}

function payDraw(banner, player, realMs) {
  const wallet = WALLET[banner.payType];
  player[wallet] = (player[wallet] || 0) - banner.price;
  if (!banner.isDayLimited) return;
  const day = clock.dayIndex(realMs);
  if (player.gacha?.day !== day) player.gacha = { ...(player.gacha || {}), day, used: {} };
  player.gacha.used[banner.drawMedalTypeId] = (player.gacha.used[banner.drawMedalTypeId] || 0) + 1;
}

// gachaBonus addType 1 = no bonus (with other values the scene opens MedalInfo_DrowBonus, missing);
// effectNumbers 0 = no effect (1/2 open Draw_RareMedal/Draw_LimitRareMedal: findings.md §3)
function drawResultFields(userMedalIds, firstIds) {
  return { gachaBonus: { addType: 1, number: 0, userMedalIds: [] }, firstGetUserMedalIds: firstIds, userMedalIds, effectNumbers: userMedalIds.map(() => 0) };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAY = { 1: 'Jewels', 7: 'Platinum Tickets', 8: 'Draw Tickets' };
const priceText = (b) => `${b.price} ${b.price === 1 ? PAY[b.payType].replace(/s$/, '') : PAY[b.payType]}`;
function page(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;background:#174a5c;color:#e8f2f6;font:17px sans-serif;padding:10px 14px 40px}'
    + 'h1{color:#5fe0f0;font-size:21px;margin:8px 0}h2{color:#5fe0f0;font-size:18px;margin:14px 0 6px}'
    + 'a{color:#fff}img{width:100%;max-width:640px;display:block;margin:6px 0}.b{border-bottom:2px dotted #8fb3c0;padding:8px 0}'
    + 'table{border-collapse:collapse}td{padding:2px 10px 2px 0}.n{color:#bcd}</style></head><body>'
    + `<h1>${esc(title)}</h1>${body}</body></html>`;
}

function detailPage(banner, medalNames) {
  const odds = gd.slotOdds(banner).map((s, i) => `<tr><td>Medal ${i + 1}</td><td>${s.map((o) => `${o.rare}★ ${o.pct}%`).join(', ')}</td></tr>`).join('');
  const pool = Object.entries(banner.pool).sort((a, b) => b[0] - a[0]).map(([r, ids]) => {
    const names = [...new Set(ids.map((id) => medalNames.get(id) || `#${id}`))].sort();
    return `<h2>${r}★ (${names.length})</h2><p>${names.map(esc).join(', ')}</p>`;
  }).join('');
  return page(banner.name, `<img src="/web/gacha/img/${banner.drawMedalTypeId}.png" alt="">`
    + `<p>${esc(priceText(banner))} for ${banner.lotCount} Medal${banner.lotCount === 1 ? '' : 's'}${banner.isDayLimited ? ', once per day' : ''}.</p>`
    + `<p class="n">Original banner: ${esc(banner.startDate)} to ${esc(banner.endDate)}.${banner.guarantees ? ' ' + esc(banner.guarantees) : ''}</p>`
    + `<h2>Draw rates (reconstructed)</h2><p class="n">The original game listed only the Medal rarities of each draw: these rates are reconstructed for this restoration.</p><table>${odds}</table>`
    + `<h2>Medals in this draw</h2>${pool}`);
}

function oddsPage(banners) {
  return page('Draw Odds', '<p class="n">The original rates were not published: the rates below are reconstructed for this restoration. Each Medal of a draw has the listed rarity, with a small chance of one star more.</p>'
    + banners.map((b) => `<div class="b"><b>${esc(b.name)}</b><table>${gd.slotOdds(b).map((s, i) => `<tr><td>Medal ${i + 1}</td><td>${s.map((o) => `${o.rare}★ ${o.pct}%`).join(', ')}</td></tr>`).join('')}</table></div>`).join(''));
}

function catalogPage(banners, { test }) {
  return page('Banner Catalog', '<p class="n">Banners available in the Shop. Tap a banner for its Medals and rates.</p>'
    + visibleBanners(banners, { test }).map((b) => `<div class="b"><a href="/web/gacha/detail/${b.drawMedalTypeId}"><img src="/web/gacha/img/${b.drawMedalTypeId}.png" alt="">${esc(b.name)}</a>`
      + `<div class="n">${esc(priceText(b))}, ${b.lotCount} Medal${b.lotCount === 1 ? '' : 's'} - original: ${esc(b.startDate)} to ${esc(b.endDate)}</div></div>`).join(''));
}

module.exports = { WALLET, catalogRow, catalogPlate, visibleBanners, dayLeft, gachaListData, checkDraw, payDraw, drawResultFields, detailPage, oddsPage, catalogPage };
```

- [ ] **Step 5: Run the tests**

Run: `node server/test-gacha-data.js && node server/test-make-banners.js && node server/test-gacha.js`
Expected: three `OK`.

- [ ] **Step 6: Run the generator on the real data**

Run: `node server/make-banners.js`
Expected: four lines (B0001, B0027, B0011, B0456 «(prova)»), each with non-empty pools for the stars of its mix (B0001: 3★ and 4★; B0011: 3★, 4★, 5★; B0456: 5★), and no «non copiata» line for the four (images already 640x140). Then verify the master validation: `node -e "const t=require('./server/server')._test; console.log(t.masterRows('drawMedalType').length)"` must print 5 and the server must not log `[master] drawMedalType: N errori` (if `masterRows` does not validate, run `node server/server.js` for 3 seconds with a temporary `KHUX_SAVE` and look for the line in the log). If B0456 (6★:5 in the original; in the TSV `rarity_mix` may be `6★:5`) has no 6★ pool with `MAX_SET_NOW`, report it: it is a test banner, the 6★ pool of sets <= 9 is also fine if it exists.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory=* add server/make-banners.js server/gacha.js server/test-make-banners.js server/test-gacha.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t4.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 5: wiring in `server/server.js` and Notices

Recommended model: Sonnet.

**Files:**
- Modify: `server/server.js` (route ~143, respondLogin ~352, servedMasterRows ~434, new functions near respondMedalMax ~1080, handler ~3101, `_test` ~3431)
- Modify: `server/routes-info-album.js`, `server/test-notices.js`
- Test: `server/test-gacha-server.js`

**Interfaces:**
- Consumes: `gacha-data.js` (Task 3), `gacha.js` (Task 4), existing server.js functions: `serverTime()`, `realNow()`, `ret()`, `send(res, code, obj)`, `userPointData(now)`, `inventorySnapshot(now)`, `inventoryBlocks(now, snap)`, `grantItem(type, id, num)` (type 3 = medal: appends a new `{userMedalId, medalId, level: 1, getDatetime}` to the end of `player.medals`), `maxMedal()`, `savePlayer()`, `masterRows(name)`, `SESSION_BASE`.
- Produces: routes `GET /gacha/list`, `POST /gacha/draw`, `GET /web/gacha/catalog`, `/web/gacha/detail/<id>`, `/web/gacha/odds`, `/web/gacha/img/<id>.png`; login link `odds`; `_test` exports `respondGachaList, respondGachaDraw, respondGachaWeb, grantItem, maxMedal, inventoryBlocks`.

- [ ] **Step 1: Write the test**

```js
// Test of the Shop routes in server.js: node server/test-gacha-server.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-gacha-${process.pid}.json`);
const BANNERS = path.join(os.tmpdir(), `khux-test-gacha-banners-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE;
process.env.KHUX_MASTER_DIR = path.resolve(process.argv[2] || path.join(__dirname, 'master_data'));
process.env.KHUX_REVISION = '118';
process.env.KHUX_GACHA_BANNERS = BANNERS;
process.env.KHUX_GACHA_SIZES = '1,3,10';
delete process.env.KHUX_GACHA_TEST; delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME;
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };
at('2026-10-16T15:00:00Z');
const banners = [
  { drawMedalTypeId: 10001, rowId: 'B0001', name: 'DAILY DEAL!', payType: 1, price: 600, lotCount: 3, isDayLimited: 1, rarityMix: [[4, 1], [3, 2]],
    pool: { 3: [11013], 4: [11014] }, test: false, sortId: 10, comment: 'x', startDate: '2016-04-07', endDate: '2018-01-31', image: 'a.png' },
  { drawMedalTypeId: 10011, rowId: 'B0011', name: 'Epic Medal Carnival', payType: 1, price: 3000, lotCount: 10, isDayLimited: 0, rarityMix: [[3, 10]],
    pool: { 3: [11013] }, test: false, sortId: 30, comment: 'x', startDate: '2016-05-13', endDate: '2016-05-19', image: 'b.png' },
];
fs.writeFileSync(BANNERS, JSON.stringify({ banners }));
const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const raw = (fn, ...a) => { let b = null, h = null; quiet(() => fn({ writeHead(c, hd) { h = hd; }, end(x) { b = x; } }, ...a)); return { body: b, headers: h }; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;

// list
let l = call(t.respondGachaList);
check(Array.isArray(l.petGachaList) && l.gachaList[0].drawMedalTypeId === 9001 && l.gachaList.length === 3, 'lista: Catalog + 2 banner');

// x3 draw paid in jewels
p.freeStone = 1000;
const before = p.medals.length;
let r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 3 });
check(p.freeStone === 400 && p.medals.length === before + 3, 'x3: -600 jewel, +3 medaglie');
check(r.userMedalIds.length === 3 && new Set(r.userMedalIds).size === 3, 'x3: 3 id distinti');
const sent = new Set(r.userMedals.map((m) => m.userMedalId));
check(r.userMedalIds.every((id) => sent.has(id)), 'x3: ogni id in userMedals');
check(r.effectNumbers.join() === '0,0,0' && r.gachaBonus.addType === 1, 'x3: effetti e bonus neutri');
check(Array.isArray(r.guiltBurstFirstUserMedalIds) && Array.isArray(r.guiltBurstMaxUserMedalIds) && Array.isArray(r.userSkills) && Array.isArray(r.userMaterials), 'x3: liste obbligatorie');
check(r.userData.userPoint && typeof r.userData.userPoint.limitedDrawTicket1 === 'number', 'x3: userPoint');
check(r.firstGetUserMedalIds.length <= 2, 'x3: al massimo una novita per medalId (11013 x2 e 11014)');
check(call(t.respondGachaList).gachaList.find((x) => x.drawMedalTypeId === 10001).userLimitedCount === 0, 'lista: Daily usato oggi');

// refusals: nothing changes
const stone = p.freeStone, n = p.medals.length;
r = call(t.respondGachaDraw, { drawMedalTypeId: 10001, count: 3 });
check(!r.userMedalIds && p.freeStone === stone && p.medals.length === n, 'Daily: seconda volta rifiutata');
r = call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(!r.userMedalIds && p.freeStone === stone, 'x10 senza jewel: rifiutata');
r = call(t.respondGachaDraw, { drawMedalTypeId: 9001, count: 1 });
check(!r.userMedalIds, 'Catalog: rifiutata');

// x10 with the same medal: only one new one
p.freeStone = 3000;
p.medals = p.medals.filter((m) => m.medalId !== 11013);
r = call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(r.userMedalIds.length === 10 && new Set(r.userMedalIds).size === 10 && r.firstGetUserMedalIds.length === 1, 'x10: 10 id, una novita');
check(p.freeStone === 0, 'x10: -3000');

// full box
p.freeStone = 3000;
p.medalMaxExtra = -100000;
r = call(t.respondGachaDraw, { drawMedalTypeId: 10011, count: 10 });
check(!r.userMedalIds && p.freeStone === 3000, 'box pieno: rifiutata');
p.medalMaxExtra = 0;

// pages and images
let w = raw(t.respondGachaWeb, '/web/gacha/detail/10001');
check(String(w.body).includes('DAILY DEAL!') && /text\/html/.test(w.headers['Content-Type']), 'pagina dettagli');
w = raw(t.respondGachaWeb, '/web/gacha/odds');
check(String(w.body).includes('Draw Odds'), 'pagina odds');
w = raw(t.respondGachaWeb, '/web/gacha/catalog');
check(String(w.body).includes('/web/gacha/detail/10011'), 'pagina catalogo');
w = raw(t.respondGachaWeb, '/web/gacha/detail/77');
check(w.headers && String(w.body).includes('not found'), 'banner sconosciuto: pagina di errore');
w = raw(t.respondGachaWeb, '/web/gacha/img/../../save/x.png');
check(!w.headers || w.headers['Content-Type'] !== 'image/png', 'immagine: niente percorsi fuori cartella');

// login: Draw Odds link
const login = call(t.respondLogin, {});
check(/\/web\/gacha\/odds$/.test(login.odds || ''), 'login: odds');

// catalog missing: only the Catalog tile
fs.writeFileSync(BANNERS, 'non json');
t.reloadGachaBanners();
l = call(t.respondGachaList);
check(l.gachaList.length === 1 && l.gachaList[0].drawMedalTypeId === 9001, 'catalogo assente: solo Catalog');

fs.unlinkSync(BANNERS);
try { fs.unlinkSync(SAVE); } catch { /* already removed */ }
if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: gacha server');
```

If `respondLogin` has another signature, look at `server/test-master-clock.js` (it already calls it) and copy its usage.

- [ ] **Step 2: Run it and watch it fail**

Run: `node server/test-gacha-server.js`
Expected: error on `t.respondGachaList is not a function`.

- [ ] **Step 3: Routes**

In `route(url)` after `if (p === '/web/passive') return 'passivepage';`:

```js
  if (p === '/gacha/list') return 'gachalist';
  if (p === '/gacha/draw') return 'gachadraw';
  if (p.startsWith('/web/gacha/')) return 'gachaweb'; // catalog, details, odds, banner images
```

- [ ] **Step 4: State and functions**

Next to the other `require`s at the top:

```js
const gachaData = require('./gacha-data');
const gacha = require('./gacha');
```

After `respondMedalMax` (where the other jewel functions are):

```js
// Shop > Draw (docs/notes/shop.md). Banner catalog written by server/make-banners.js; without
// catalog the list only has the Banner Catalog tile. KHUX_GACHA_TEST=1 shows the test banners
// (Platinum Ticket Draw). KHUX_GACHA_SIZES: medal counts that have the result animation in the
// resources (lwf/raisedraw/demo/raidgacha_result_display_NN, recon/tools/import_jp_raisedraw.py).
const GACHA_FILE = process.env.KHUX_GACHA_BANNERS || path.join(__dirname, 'game_data', 'gacha_banners.json');
const GACHA_IMG = path.join(__dirname, 'game_data', 'gacha_img');
const GACHA_TEST = process.env.KHUX_GACHA_TEST === '1';
const GACHA_SIZES = new Set((process.env.KHUX_GACHA_SIZES || '1,3,10').split(',').map(Number));
const WEB_BASE = SESSION_BASE.replace(/^https:/, 'http:'); // https: the WebView rejects the certificate
let gachaBannerList = null;
const gachaBanners = () => (gachaBannerList ??= gachaData.loadBanners(GACHA_FILE));
function reloadGachaBanners() { gachaBannerList = null; }

function respondGachaList(res) {
  send(res, 200, { ret: ret(), ...gacha.gachaListData(gachaBanners(), player, { realMs: realNow(), webBase: WEB_BASE, test: GACHA_TEST, sizes: GACHA_SIZES }) });
}

// POST /gacha/draw (action 76): the client reads userPoint, then userMedals, userSkills,
// userMaterials, gachaBonus, firstGetUserMedalIds, userMedalIds, effectNumbers (all mandatory)
// and guiltBurstFirst/MaxUserMedalIds. A refusal
// responds only {ret}: «200 ERROR :76» and the client goes back to the Shop.
function respondGachaDraw(res, body) {
  const now = serverTime(), realMs = realNow();
  const banner = gachaData.bannerById(gachaBanners(), body?.drawMedalTypeId);
  const why = gacha.checkDraw(banner, player, body, { realMs, test: GACHA_TEST, freeSlots: maxMedal() - player.medals.length, sizes: GACHA_SIZES });
  if (why) {
    console.log(`  [gacha] estrazione rifiutata: ${why} (corpo ${JSON.stringify(body)})`);
    return send(res, 200, { ret: ret() });
  }
  const snap = inventorySnapshot(now);
  const owned = new Set(player.medals.map((m) => m.medalId));
  const medalIds = gachaData.rollDraw(banner, Math.random);
  gacha.payDraw(banner, player, realMs);
  const userMedalIds = [], first = [];
  for (const medalId of medalIds) {
    grantItem(3, medalId, 1);
    const id = player.medals[player.medals.length - 1].userMedalId;
    userMedalIds.push(id);
    if (!owned.has(medalId)) { first.push(id); owned.add(medalId); }
  }
  savePlayer();
  console.log(`  [gacha] ${banner.rowId} ${banner.name}: -${banner.price} ${gacha.WALLET[banner.payType]}, medaglie ${medalIds.join(',')}`);
  send(res, 200, { ret: ret(), userData: { userPoint: userPointData(now) }, ...inventoryBlocks(now, snap), ...gacha.drawResultFields(userMedalIds, first) });
}

// Shop WebView pages (Details of the Catalog tile and of every banner, Draw Odds) and 640x140
// banner images (bannerUrl, downloaded by the client over http)
function respondGachaWeb(res, url) {
  const p = url.split('?')[0];
  const html = (s, code = 200) => { const b = Buffer.from(s, 'utf8'); res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length }); res.end(b); };
  const img = /^\/web\/gacha\/img\/(\d+)\.png$/i.exec(p);
  if (img) {
    const file = path.join(GACHA_IMG, `${Number(img[1])}.png`);
    if (!fs.existsSync(file)) return html('not found', 404);
    const b = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': b.length });
    return res.end(b);
  }
  if (/^\/web\/gacha\/catalog$/i.test(p)) return html(gacha.catalogPage(gachaBanners(), { test: GACHA_TEST }));
  if (/^\/web\/gacha\/odds$/i.test(p)) return html(gacha.oddsPage(gacha.visibleBanners(gachaBanners(), { test: GACHA_TEST })));
  const det = /^\/web\/gacha\/detail\/(\d+)$/i.exec(p);
  const banner = det && gacha.visibleBanners(gachaBanners(), { test: GACHA_TEST }).find((b) => b.drawMedalTypeId === Number(det[1]));
  if (!banner) return html('<!doctype html><meta charset="utf-8"><body style="background:#174a5c;color:#fff;font:18px sans-serif">Banner not found.</body>', 404);
  const names = new Map(masterRows('medal').map((m) => [m.medalId, m.name]));
  return html(gacha.detailPage(banner, names));
}
```

If `SESSION_BASE` is defined after the point where `WEB_BASE` goes, move `WEB_BASE` right after `SESSION_BASE`. If `fs`/`path` have other names in server.js, use those.

- [ ] **Step 5: Handler, login link and master URL**

In the handler, next to `if (kind === 'noticespage')`:

```js
      // Shop > Draw (actions 75/76) and banner pages/images
      if (kind === 'gachalist') return respondGachaList(res);
      if (kind === 'gachadraw') return respondGachaDraw(res, entry.bodyDecoded);
      if (kind === 'gachaweb') return respondGachaWeb(res, req.url);
```

In `respondLogin`, after `body.license = ...`:

```js
  // Shop Draw Odds (button on every tile, global link)
  body.odds = `${WEB_BASE}/web/gacha/odds`;
```

In `servedMasterRows(name, realMs)`, before `if (name !== 'mission') return rows;`:

```js
  // drawMedalType: bannerUrl/detailUrl are paths (server/make-banners.js); the http address is
  // added here (max 128 bytes, client strncpy)
  if (name === 'drawMedalType') {
    return rows.map((r) => ({ ...r, bannerUrl: r.bannerUrl.startsWith('/') ? WEB_BASE + r.bannerUrl : r.bannerUrl,
      detailUrl: r.detailUrl.startsWith('/') ? WEB_BASE + r.detailUrl : r.detailUrl }));
  }
```

In `module.exports._test` add a line:

```js
  // server/test-gacha-server.js
  respondGachaList, respondGachaDraw, respondGachaWeb, reloadGachaBanners, grantItem, maxMedal, inventoryBlocks,
```

- [ ] **Step 6: Notices**

In `server/routes-info-album.js`, in `DIFFERENCES_BODY` before the line «There are no purchases...»:

```js
  'Shop draw rates are reconstructed where the original game did not publish them: Draw Odds and each banner\'s Details say so.',
```

And in `NOTICES`, after the «Missions» notice:

```js
  { date: '10/16', tag: 'INFORMATION', title: 'Shop',
    body: ['The first banner in the Shop, Banner Catalog, cannot be drawn: tap its Details to see the banners and the Medals they contain.',
      'Draws cost Jewels or Tickets earned in the game. Draw Odds shows the rates used by this restoration.'] },
```

In `server/test-notices.js` add after the order check:

```js
check(pos('Missions') < pos('Shop'), 'notizia Shop dopo Missions');
check(n.NOTICES.some((x) => x.title === 'Differences from the original game' && /draw rates are reconstructed/.test(x.body.join(' '))), 'probabilita nelle differenze');
```

- [ ] **Step 7: Run all the server tests**

Run: `for f in server/test-*.js; do node "$f" || echo "FALLITO $f"; done`
Expected: all `OK`, no `FALLITO` (in particular test-master-clock, test-notices, test-gacha-server).

- [ ] **Step 8: Commit**

```bash
git -c safe.directory=* add server/server.js server/routes-info-album.js server/test-notices.js server/test-gacha-server.js
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t5.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```

---

### Task 6: resources 40, revision 118 and bench tests

Recommended model: Opus (bench).

**Files:**
- Modify: `tools/ldplayer/session/run-server.ps1` (lines 13), `relogin.ps1` (line 5), `update-resources.ps1` (line 6): default 117 -> 118
- Create: `docs/notes/shop.md`
- Modify: `docs/ISSUES.md`, `HANDOFF.md`, `docs/notes/server.md` (line 13 and wherever 117 appears as the current BASE)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Copies and generation**

Copy `server\save` to `D:\Progetto_Restauro_KH_UX\tmp\save-backup-before-gacha`. Run `node server\make-banners.js` and `python recon\tools\make_shop_art.py D:\Progetto_Restauro_KH_UX\tmp\shop_art\files server\game_data` (to have `9001.png` even before the build).

- [ ] **Step 2: Resources 40**

Run (PowerShell, from the repo root): `.\tools\ldplayer\session\build-resources.ps1 -Version 40 -DryRun`, then `.\tools\ldplayer\session\build-resources.ps1 -Version 40`.
Check `stage_gen\raisedraw_report.json` (it must say `ok` for `raidgacha_result_display_03` and `_10`) and update `KHUX_GACHA_SIZES` in `run-server.ps1` if the complete sizes differ from `1,3,10` (e.g. `$env:KHUX_GACHA_SIZES = "1,3,5,10"`).

- [ ] **Step 3: Revision 118 and installation**

Change the defaults 117 -> 118 in the three scripts and in the notes; then `.\tools\ldplayer\session\update-resources.ps1 -Revision 118`. Expected: the client downloads resources 40 and the master (log `GET /resource/`, `GET /master/drawMedalType`), home reached (screenshot).

- [ ] **Step 4: Bench tests (serially, `AppAlive` before every tap, SKIP in dialogues)**

With `. .\tools\ldplayer\bench_lib.ps1`, screenshots with `Shot shop_<name>`:
1. Shop > Draw: Catalog tile at the top with our banner, grey button with «Open Details to browse the Banner Catalog» and the new icon; below, Daily Deal, Small Deal, Epic Medal Carnival with their images and captions. Note the text of the draw buttons (payType 1).
2. Tap on the grey Catalog button: no request in the log.
3. Details of the Catalog: the catalog opens; tap on a banner: details page. Close with the X: **note whether the log shows a new `GET /gacha/list`** (reload test, spec 8; the static analysis says no). If it does not reload, the catalog page stays as it is (the group choice comes with sub-project 3, which will have to say «exit and re-enter»).
4. Draw Odds: odds page.
5. Small Deal x1 (300 jewels): confirmation, animation, result with 1 medal, «NEW» if new; OK -> back to the Shop; jewels -300 in the bar (log: `GET /user/stone`, `GET /gacha/list`). The medal is in the medal list.
6. Daily Deal x3: 3 medals; back in the Shop the Daily Deal can no longer be drawn today (note how it appears: button disabled or tap without effect).
7. Epic Medal Carnival x10 (3000 jewels; if missing, give jewels with a test present with the server stopped): 10-medal animation and two rows of cards.
8. Repeat 10 Shop openings (Home <-> Shop): no crash.
9. Tickets: server stopped, `limitedDrawTicket1 = 2` in the save (node -e on `server\save\player.json`), `relogin.ps1 -Tag gt` with `$env:KHUX_GACHA_TEST="1"` in the run-server environment (or a parameter if one exists); draw Platinum Ticket Draw x5 if size 5 is complete, otherwise only verify that the tile shows 2 tickets and note it. Then go back to the normal server and restore the tickets to 0.
10. Notices: «Shop» notice and line in the differences.
In case of a crash: stop every script immediately, `tools\ldplayer\tombstone.ps1`, note the missing file (often a texture or an LWF of the scene) and fix it in the right Task before continuing.

- [ ] **Step 5: Documentation**

Create `docs/notes/shop.md` with: protocol of /gacha/list and /gacha/draw (from `tmp\gacha_re\findings.md`, with the addresses), tile rules (spike_catalog/notes.md: payType, price, benefitId, comment), raisedraw resources (anchor `#risorse`), outcomes of tests 1-10 with the screenshot names. In `docs/ISSUES.md` add I-135 (OPEN): «Ticket icons `img/incentive/draw_Ticket_40.png`/`41.png` (Platinum/Draw Ticket) and `Star7_Ticket_37/38` carry the «仮» mark (development placeholder): to be replaced with the original artwork» and update «ultimo: **I-135**» (the "last" marker). Update `HANDOFF.md` (Shop: sub-project 1 done, BASE 118, resources 40) and `docs/notes/server.md` (BASE 118).

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=* add tools/ldplayer/session/run-server.ps1 tools/ldplayer/session/relogin.ps1 tools/ldplayer/session/update-resources.ps1 docs/notes/shop.md docs/ISSUES.md HANDOFF.md docs/notes/server.md
git -c safe.directory=* commit -F D:/Progetto_Restauro_KH_UX/tmp/msg_shop_t6.txt
git -c safe.directory=* pull --rebase && git -c safe.directory=* push
```
