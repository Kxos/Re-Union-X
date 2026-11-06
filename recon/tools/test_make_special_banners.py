"""Test of make_special_banners.py (640x140 banners of the Special tab and their -kept copies).

    python -I recon/tools/test_make_special_banners.py        -> «OK: ...» or «ERRORS (n)», exit 1
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageChops, ImageStat  # noqa: E402
import make_special_banners as m  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

errors = []


def pixels(im):
    return [im.getpixel((x, y)) for y in range(im.height) for x in range(im.width)]


def check(cond, msg):
    if not cond:
        errors.append(msg)


TMP = os.environ.get('KHUX_TMP', 'D:/Progetto_Restauro_KH_UX/tmp')
os.makedirs(TMP, exist_ok=True)
tmp = tempfile.mkdtemp(prefix='khux_special_banners_', dir=TMP)
try:
    src, out = os.path.join(tmp, 'src'), os.path.join(tmp, 'out')
    os.makedirs(src)
    # an «original» at the wiki size (1202x263, RGBA) and one already 640x140
    Image.new('RGBA', (1202, 263), (200, 30, 30, 255)).save(os.path.join(src, 'Special - Alpha banner KHUX.png'))
    Image.new('RGB', (640, 140), (30, 30, 200)).save(os.path.join(src, 'Special - Beta banner KHUX.png'))
    vt = Image.new('RGB', (640, 140), (30, 140, 60))
    vt.paste((240, 40, 40), (0, 6, 230, 34))
    vt.save(os.path.join(src, 'Special - VIP Tab banner KHUX.png'))
    # catalogue collage sources (the names make_special_banners.CATALOG_STRIPS looks for)
    for i, f in enumerate(m.CATALOG_STRIPS):
        Image.new('RGB', (640, 140), ((60 * i) % 255, 200, (90 * i) % 255)).save(os.path.join(src, f))
    index = {'catalog': {'evStageId': 7000, 'stageIds': [970000]}, 'entries': [
        {'key': 'alpha', 'evStageId': 7001, 'name': 'Alpha', 'family': 'SQ12', 'banner': 'Special - Alpha banner KHUX.png', 'removed': ''},
        {'key': 'beta', 'evStageId': 7002, 'name': 'Beta', 'family': 'SQ13', 'banner': 'Special - Beta banner KHUX.png', 'removed': ''},
        {'key': 'gamma', 'evStageId': 7003, 'name': 'Gamma Quest With A Long Name', 'family': 'SQ22', 'banner': '', 'removed': ''},
        {'key': 'lost', 'evStageId': 7004, 'name': 'Lost', 'family': 'SQ13', 'banner': 'Special - Missing banner KHUX.png', 'removed': ''},
        {'key': 'viptab', 'evStageId': 7005, 'name': 'Tab', 'family': 'SQ22', 'banner': 'Special - VIP Tab banner KHUX.png', 'removed': ''},
    ]}
    r = m.build_all(index, src, out, 'palette')
    # round 2: notice images (any size) are fitted to 640x140 with the centre kept: a 640x300 image whose title band is
    # in the middle (rows 110-190, white) keeps the whole band; the dark top and bottom margins are cut
    nt = Image.new('RGB', (640, 300), (10, 10, 10))
    nt.paste((250, 250, 250), (40, 110, 600, 190))
    nt.save(os.path.join(src, 'Notice 1 Board banner (notice image).png'))
    nw = Image.new('RGB', (1000, 140), (10, 10, 10))
    nw.paste((250, 250, 250), (300, 20, 700, 120))
    nw.save(os.path.join(src, 'Notice 2 Board banner (notice image).png'))
    nix = {'catalog': {}, 'entries': [
        {'key': 'n1', 'evStageId': 7101, 'name': 'N1', 'family': 'SQ21', 'banner': 'Notice 1 Board banner (notice image).png', 'removed': ''},
        {'key': 'n2', 'evStageId': 7102, 'name': 'N2', 'family': 'SQ21', 'banner': 'Notice 2 Board banner (notice image).png', 'removed': ''}]}
    nout = os.path.join(tmp, 'nout')
    rn = m.build_all(nix, src, nout, 'full')
    n1 = Image.open(os.path.join(nout, '7101.png')).convert('L')
    n2 = Image.open(os.path.join(nout, '7102.png')).convert('L')
    check(rn['original'] == 2 and n1.size == (640, 140) and n2.size == (640, 140), 'notice images fitted to 640x140 %s' % rn)
    white = lambda im: sum(1 for p in pixels(im) if p > 200)  # noqa: E731
    check(white(n1) >= 0.9 * 560 * 80 and n1.getpixel((320, 70)) > 200 and n1.getpixel((320, 2)) < 60,
          'tall notice image: title band (centre) kept, margins cut (%d white)' % white(n1))
    check(n2.getpixel((320, 70)) > 200 and n2.getpixel((5, 70)) < 60, 'wide notice image: centre kept')
    size = lambda f: Image.open(os.path.join(out, f)).size  # noqa: E731
    for f in ('7000.png', '7001.png', '7001-kept.png', '7002.png', '7002-kept.png', '7003.png', '7003-kept.png', '7004.png', '7004-kept.png', '7005.png', '7005-kept.png'):
        check(os.path.exists(os.path.join(out, f)) and size(f) == (640, 140), '%s: 640x140' % f)
    check(not os.path.exists(os.path.join(out, '7000-kept.png')), 'no -kept for the catalogue banner (never pinned)')
    check(r == {'original': 3, 'plate': 2, 'catalog': 1, 'reconstructed': 0}, 'counts %s' % r)
    a = Image.open(os.path.join(out, '7001.png')).convert('RGB')
    check(a.getpixel((320, 100))[0] > 150, 'original resized (red), not a plate')
    g = Image.open(os.path.join(out, '7003.png')).convert('RGB')
    l4 = Image.open(os.path.join(out, '7004.png')).convert('RGB')
    check(g.getpixel((320, 120)) != l4.getpixel((320, 120)), 'plates coloured by family (SQ22 != SQ13)')
    k = Image.open(os.path.join(out, '7001-kept.png')).convert('RGB')
    # palette PNGs: the two images are quantised separately, so only differences above the noise count
    diffbox = lambda p, q: ImageChops.difference(p, q).convert('L').point(lambda v: 255 if v > 48 else 0).getbbox()  # noqa: E731
    bb = diffbox(a, k)
    # Task 14: a gold «KEPT QUEST» tab at the TOP-LEFT, the size of the red «VIP Quest» tab of the originals
    check(bb is not None and bb[0] <= 2 and bb[1] >= 3 and bb[2] <= 175 and bb[3] <= 40, 'KEPT tab top left only (diff box %s)' % (bb,))
    gold = lambda p: p[0] > 190 and 120 < p[1] < 245 and p[2] < 140  # noqa: E731
    check(sum(gold(k.getpixel((x, y))) for x in range(0, 140, 2) for y in range(8, 32, 2)) > 150, 'KEPT tab is gold')
    # a banner that already carries a VIP tab (red band 0..230): the KEPT tab replaces it, no red left
    v = Image.open(os.path.join(src, 'Special - VIP Tab banner KHUX.png')).convert('RGB')
    check(220 <= m.vip_tab_end(v) <= 232 and m.vip_tab_end(Image.new('RGB', (640, 140), (30, 30, 200))) == 0
          and m.vip_tab_end(a) == 0, 'VIP tab detected (%d)' % m.vip_tab_end(v))
    vk = Image.open(os.path.join(out, '7005-kept.png')).convert('RGB')
    red = lambda p: p[0] > 170 and p[1] < 90 and p[2] < 90  # noqa: E731
    check(not any(red(vk.getpixel((x, y))) for x in range(0, 232, 3) for y in range(8, 32, 3)), 'VIP tab covered by the KEPT tab')
    bv = diffbox(Image.open(os.path.join(out, '7005.png')).convert('RGB'), vk)
    check(bv is not None and bv[0] <= 2 and bv[2] <= 268 and bv[3] <= 40, 'KEPT over a VIP tab: top left only (diff box %s)' % (bv,))
    # Task 14: the catalogue banner is a collage of originals with the title, the training figures and a sticker
    import make_shop_art
    cat = Image.open(os.path.join(out, '7000.png')).convert('RGB')
    old = make_shop_art.banner('SPECIAL CATALOG', 'Every Special quest - open Details').convert('RGB')
    mean = lambda im: sum(ImageStat.Stat(im).mean) / 3  # noqa: E731
    check(mean(ImageChops.difference(cat, old)) > 20, 'catalog banner differs from the old plain plate')
    title = cat.crop((10, 12, 450, 82))
    check(sum(gold(p) for p in pixels(title)) > 1500, 'catalog title in gold lettering')
    brown = lambda p: p[0] < 110 and p[1] < 80 and p[2] < 40 and p[0] > p[2]  # noqa: E731
    check(sum(brown(p) for p in pixels(title)) > 800, 'catalog title with a brown outline')
    yellow = lambda p: p[0] > 230 and p[1] > 215 and p[2] < 90  # noqa: E731
    check(sum(yellow(p) for p in pixels(cat.crop((440, 0, 640, 140)))) > 300, 'TRAINING sticker (yellow burst) on the right')
    bare = m.catalog_banner(os.path.join(tmp, 'nothing'), None).convert('RGB')
    check(mean(ImageChops.difference(cat, bare)) > 8, 'catalog background made of the original banners (differs without them)')
    if os.path.isdir(m.ENEMIES):
        for eid in (1, 7):
            fig = m.enemy_figure(eid)
            check(fig is not None and fig.getbbox() is not None, 'enemy %d rendered from the local rig' % eid)
        withf = m.catalog_banner(src, m.ENEMIES).convert('RGB').crop((440, 30, 640, 140))
        nof = m.catalog_banner(src, None).convert('RGB').crop((440, 30, 640, 140))
        check(mean(ImageChops.difference(withf, nof)) > 6, 'Large Body + Shadow on the right of the catalog banner')
    else:
        print('(local enemy rigs %s missing: figure checks skipped)' % m.ENEMIES)
    # fix round 1: a missing rig folder (or missing imports) is reported with a WARNING line, the banner is still made
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        nofig = m.catalog_banner(src, os.path.join(tmp, 'no_rigs'))
    log = buf.getvalue()
    check(nofig.size == (640, 140), 'catalog banner without rigs: 640x140')
    check('WARNING' in log and 'Large Body' in log and 'Shadow' in log and 'no_rigs' in log,
          'missing rigs: WARNING naming both figures and the path (%r)' % log)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        m.catalog_banner(src, None)
    check('WARNING' in buf.getvalue(), 'no rig folder given: WARNING printed')
    # fix round 1: the end of the KEPT tab fade has no dark edge: on a white banner the fade columns get
    # monotonically lighter (no darker band than the solid gold before it)
    wk = m.kept_tab(Image.new('RGB', (640, 140), (255, 255, 255))).convert('L')
    col = [sum(wk.getpixel((x, y)) for y in range(10, 30)) / 20 for x in range(m.TAB_SOLID - 2, m.TAB_SOLID + m.TAB_FADE + 4)]
    solid_l = col[0]
    check(min(col) >= solid_l - 6, 'KEPT fade: nothing darker than the solid tab (min %.0f, solid %.0f)' % (min(col), solid_l))
    check(all(b >= a - 3 for a, b in zip(col, col[1:])), 'KEPT fade gets lighter towards the right: %s' % [int(v) for v in col])
    # round 3 (30-10): reconstructed banners of the campaigns whose original is lost (rules.campaigns[key].reconstruct):
    # a crop of the real board screenshot blended into the VIP pink, the red «VIP Quest» tab, the gold title, the coin
    # icon and the board tile on the right
    board = Image.new('RGB', (1919, 819), (10, 20, 60))
    bd = __import__('PIL.ImageDraw', fromlist=['Draw']).Draw(board)
    for x in range(100, 1900, 160):
        for y in range(80, 800, 160):
            bd.ellipse((x, y, x + 90, y + 90), fill=(90, 110, 200))
    board.save(os.path.join(src, 'Board.png'))
    Image.new('RGBA', (91, 94), (200, 40, 120, 255)).save(os.path.join(src, 'Coin.png'))
    Image.new('RGBA', (258, 259), (220, 180, 60, 255)).save(os.path.join(src, 'Tile.png'))
    spec = {'board': 'Board.png', 'crop': [0, 100, 1919, 520], 'icon': 'Coin.png', 'tile': 'Tile.png',
            'title': 'Limited VIP Boards!', 'sub': 'Anniversary Extravaganza'}
    rc = m.reconstructed_banner(spec, src).convert('RGB')
    check(rc.size == (640, 140), 'reconstructed banner 640x140 (%s)' % (rc.size,))
    pl = m.plate('Anniversary Extravaganza: Limited VIP Boards!', 'SQ21').convert('RGB')
    check(mean(ImageChops.difference(rc, pl)) > 20, 'reconstructed banner differs from the plain plate')
    check(sum(gold(p) for p in pixels(rc.crop((10, 34, 470, 92)))) > 1500, 'reconstructed title in gold lettering')
    check(sum(brown(p) for p in pixels(rc.crop((10, 34, 470, 92)))) > 600, 'reconstructed title with a dark outline')
    check(sum(red(rc.getpixel((x, y))) for x in range(0, 120, 2) for y in range(8, 32, 2)) > 250, 'red «VIP Quest» tab top left')
    check(sum(1 for p in pixels(rc.crop((480, 0, 640, 140))) if p[0] > 200 and 150 < p[1] < 200 and p[2] < 90) > 800,
          'board tile on the right')
    check(sum(1 for p in pixels(rc.crop((440, 40, 640, 140))) if p[0] > 180 and p[1] < 70 and 90 < p[2] < 150) > 300,
          'Limited VIP Coin icon on the right')
    board2 = Image.new('RGB', (1919, 819), (10, 20, 60))
    board2.save(os.path.join(src, 'Board2.png'))
    rc2 = m.reconstructed_banner(dict(spec, board='Board2.png'), src).convert('RGB')
    check(mean(ImageChops.difference(rc.crop((0, 100, 640, 140)), rc2.crop((0, 100, 640, 140)))) > 3,
          'background made of the board screenshot')
    rx = {'catalog': {}, 'entries': [
        {'key': 'C1', 'evStageId': 7201, 'name': 'Limited VIP Boards!', 'family': 'SQ21', 'banner': '', 'removed': ''},
        {'key': 'C2', 'evStageId': 7202, 'name': 'Plain', 'family': 'SQ21', 'banner': '', 'removed': ''}]}
    rr = m.build_all(rx, src, os.path.join(tmp, 'rout'), 'full', rules={'campaigns': {'C1': {'reconstruct': spec}}})
    check(rr == {'original': 0, 'plate': 1, 'catalog': 0, 'reconstructed': 1}, 'reconstructed counted %s' % rr)
    got = Image.open(os.path.join(tmp, 'rout', '7201.png')).convert('RGB')
    check(mean(ImageChops.difference(got, rc)) < 2 and os.path.exists(os.path.join(tmp, 'rout', '7201-kept.png')),
          'build_all writes the reconstructed banner and its -kept copy')
    lostsrc = m.build_all(rx, os.path.join(tmp, 'nothing'), os.path.join(tmp, 'rout2'), 'full', rules={'campaigns': {'C1': {'reconstruct': spec}}})
    check(lostsrc['plate'] == 2 and lostsrc['reconstructed'] == 0, 'reconstruct sources missing -> plate %s' % lostsrc)
    check(m.plate_color('SQ13') == m.plate_color('SQ13') and m.plate_color('SQ13') != m.plate_color('SQ22'), 'family colours')
    check(m.plate_color('SQ21') == m.plate_color('SQ22') == m.plate_color('SQ23'), 'VIP campaigns (SQ21) and Materials (SQ23): the VIP pink of SQ22')
    # Task 14: the real rules resolve every mapped banner (entries + campaigns) to an original of reference\special_banners
    REF = os.path.join(m.ROOT, 'reference', 'special_banners')
    RULES = os.path.join(m.REPO, 'server', 'special_periods.json')
    if os.path.isdir(REF):
        with open(RULES, encoding='utf-8') as f:
            rules = json.load(f)
        c = m.source_counts(rules, REF)
        named = sum(1 for e in rules['entries'] if e.get('banner')) + sum(1 for k, v in rules['campaigns'].items() if not k.startswith('_') and v.get('banner'))
        check(c['missing'] == [] and c['original'] == named and c['original'] >= 180 and c['plate'] == 0
              and c['reconstructed'] == 2, 'real rules: originals vs plates %s (named %d)' % (c, named))
        print('real rules: %d originals, %d reconstructed, %d plates' % (c['original'], c['reconstructed'], c['plate']))
        for k in ('C44151', 'C48395'):
            sp = rules['campaigns'][k].get('reconstruct') or {}
            ok = all(os.path.exists(os.path.join(REF, sp.get(f, '') or '?')) for f in ('board', 'icon', 'tile'))
            rb = m.reconstructed_banner(sp, REF).convert('RGB') if ok else None
            check(rb is not None and rb.size == (640, 140), '%s reconstructed from the local sources' % k)
        # round 2: the Limited VIP Board notice images become the banner unchanged in content (640x140 already)
        for n in ('Notice 71999 Limited Winter VIP Board banner (notice image).png', 'Notice 72714 New Year Limited VIP Boards banner (notice image).png'):
            orig = Image.open(os.path.join(REF, n)).convert('RGB')
            got = m.mbi.fit(Image.open(os.path.join(REF, n))).convert('RGB')
            check(got.size == (640, 140) and mean(ImageChops.difference(got, orig.resize((640, 140)))) < 2, 'notice image %s kept as banner' % n)
    else:
        print('(reference banners %s missing: real-rules check skipped)' % REF)
    # raids Part 2, Task 9: the Raid Catalog banner (8000) from the weekly event cards, and a «KEPT RAID» copy of every card
    rimg = os.path.join(tmp, 'raid_img')
    os.makedirs(rimg)
    for i, ev in enumerate((8070, 8071, 8072, 8073, 8074, 8075, 8076)):
        Image.new('RGB', (640, 140), ((40 * i) % 255, 60, 200 - 20 * i)).save(os.path.join(rimg, '%d.png' % ev))
    Image.new('RGB', (640, 140), (90, 90, 90)).save(os.path.join(rimg, '0.png'))
    check([os.path.basename(p) for p in m.raid_cards(rimg)] == ['8070.png', '8071.png', '8072.png', '8073.png', '8074.png', '8075.png', '8076.png'],
          'raid cards: the weekly cards only')
    rix = {'catalog': {'evStageId': 8000, 'stageIds': [970000]}, 'entries': [
        {'evStageId': 8070, 'censusId': 'A'}, {'evStageId': 8070, 'censusId': 'A'}, {'evStageId': 8071, 'censusId': 'B'}, {'evStageId': 8099, 'censusId': 'C'}]}
    rn = m.build_raid(rix, rimg, 'full')
    check(rn == {'catalog': 1, 'kept': 3, 'missing': 0}, 'raid counts %s' % rn)
    rcat = Image.open(os.path.join(rimg, '8000.png')).convert('RGB')
    check(rcat.size == (640, 140), 'Raid Catalog banner 640x140')
    check(sum(gold(p) for p in pixels(rcat.crop((10, 12, 450, 82)))) > 1500, 'RAID CATALOG title in gold lettering')
    check(mean(ImageChops.difference(rcat, cat)) > 8, 'not the Special Catalog banner')
    # redesign 06-11: red, raid bosses, no weekly cards in it
    bgp = ImageStat.Stat(rcat.crop((300, 10, 630, 130))).mean
    check(bgp[0] > bgp[1] + 40 and bgp[0] > bgp[2] + 40, 'red background %s' % (bgp,))
    check(m.CATALOG_CHOICE == {'special': 'B', 'raid': 'B1', 'event': 'A'}, 'the chosen catalogue options (user 06-11)')
    # idempotent full-colour builds (user 06-11, «lighting dirtied»): the chosen cards rendered twice are identical, saved as
    # RGB (no 256-colour palette / dithering) with identical bytes
    for k, st in m.CATALOG_CHOICE.items():
        c1, c2 = m.CATALOG_OPTIONS[k](st), m.CATALOG_OPTIONS[k](st)
        check(ImageChops.difference(c1.convert('RGB'), c2.convert('RGB')).getbbox() is None, '%s %s renders identically twice' % (k, st))
        f1, f2 = os.path.join(tmp, 'idem_%s_1.png' % k), os.path.join(tmp, 'idem_%s_2.png' % k)
        m.save_catalog(c1, f1)
        m.save_catalog(m.CATALOG_OPTIONS[k](st), f2)
        check(open(f1, 'rb').read() == open(f2, 'rb').read(), '%s %s: building twice gives the same file' % (k, st))
        check(Image.open(f1).mode == 'RGB', '%s card saved in full colour, not a palette' % k)
    ra = os.path.join(tmp, 'idem_raid')
    m.build_raid(rix, ra, 'palette', catalog_only=True)
    b1 = open(os.path.join(ra, '8000.png'), 'rb').read()
    m.build_raid(rix, ra, 'palette', catalog_only=True)
    check(open(os.path.join(ra, '8000.png'), 'rb').read() == b1 and Image.open(os.path.join(ra, '8000.png')).mode == 'RGB',
          'build_raid: catalogue card full colour and identical on a rebuild')
    gl = m.inner_clip(Image.new('RGBA', (640, 140), (255, 255, 255, 255)))
    check(gl.getpixel((m.FRAME_INNER[0], 70))[3] < 40 and gl.getpixel((320, 70))[3] == 255 and gl.getpixel((m.FRAME_INNER[0] + 4, 70))[3] < 200,
          'glows fade before the frame edge, not hard-cut')
    big = Image.new('RGBA', (400, 300), (255, 0, 0, 255))
    fp, fxy, fk = m.fit_inside(big, (500, -40), 3)
    fb = (fxy[0], fxy[1], fxy[0] + fp.width, fxy[1] + fp.height)
    check(fk < 1 and m.FRAME_INNER[0] + 3 <= fb[0] and m.FRAME_INNER[1] + 3 <= fb[1] and fb[2] <= m.FRAME_INNER[2] - 3
          and fb[3] <= m.FRAME_INNER[3] - 3, 'fit_inside scales and moves a piece inside the frame %s' % (fb,))
    m._ART_BOXES.clear()
    check(not any(p == ((40 * i) % 255, 60, 200 - 20 * i) for i in range(7) for p in pixels(rcat.crop((0, 0, 640, 140)).resize((160, 35)))),
          'no weekly card in the Raid Catalog banner')
    if os.path.isdir(m.RAID_RIGS):
        check(m.raid_catalog_banner().info.get('bosses') == [b[0] for b in m.RAID_BOSSES], 'the raid bosses are drawn')
        check(mean(ImageChops.difference(rcat, m.raid_catalog_banner(os.path.join(tmp, 'no_rigs')).convert('RGB'))) > 3, 'bosses change the banner')
    else:
        print('(raid rigs %s missing: boss check skipped)' % m.RAID_RIGS)
    rco = os.path.join(tmp, 'raid_catonly')
    os.makedirs(rco)
    Image.new('RGB', (640, 140), (1, 2, 3)).save(os.path.join(rco, '8070.png'))
    check(m.build_raid(rix, rco, 'full', catalog_only=True) == {'catalog': 1, 'kept': 0, 'missing': 0}
          and not os.path.exists(os.path.join(rco, '8070-kept.png')), 'catalog_only: no kept raid card written')
    check(8000 not in [int(os.path.basename(p)[:-4]) for p in m.raid_cards(rimg)], 'the catalogue banner is no strip of itself')
    check([os.path.basename(p) for p in m.raid_cards(rimg, {8071, 8072})] == ['8070.png', '8073.png', '8074.png', '8075.png', '8076.png'],
          'Japan-only cards (skip) are no strips')
    rjp = os.path.join(tmp, 'raid_jp')
    shutil.copytree(rimg, rjp)
    Image.new('RGB', (640, 140), (255, 0, 255)).save(os.path.join(rjp, '8202.png'))
    m.build_raid({**rix, 'entries': rix['entries'] + [{'evStageId': 8202, 'censusId': 'JP-X', 'jp': True}]}, rjp, 'full')
    check(Image.open(os.path.join(rjp, '8000.png')).convert('RGB').tobytes() == Image.open(os.path.join(rimg, '8000.png')).convert('RGB').tobytes(),
          'a JP card leaves the Raid Catalog banner unchanged')
    check(os.path.exists(os.path.join(rjp, '8202-kept.png')), 'a JP card gets its KEPT RAID copy')
    k70 = Image.open(os.path.join(rimg, '8070-kept.png')).convert('RGB')
    check(sum(gold(p) for p in pixels(k70.crop((0, 6, 140, 34)))) > 600, 'KEPT RAID tab top left')
    check(diffbox(k70, Image.open(os.path.join(rimg, '8070.png')).convert('RGB'))[3] <= 40, 'only the tab changes')
    k99 = Image.open(os.path.join(rimg, '8099-kept.png')).convert('RGB')
    check(k99.getpixel((400, 100)) == (90, 90, 90), 'a week without its card: the plain plate with the tab')
    check(m.kept_tab(Image.new('RGB', (640, 140)), m.RAID_KEPT_TEXT).size == (640, 140) and m.RAID_KEPT_TEXT == 'KEPT RAID', 'raid tab text')
    empty = os.path.join(tmp, 'raid_none')
    check(m.build_raid({'entries': [{'evStageId': 8070}]}, empty, 'full') == {'catalog': 0, 'kept': 0, 'missing': 1}, 'no card, no index catalog')
    # Catalog options (user 06-11): every option 640x140, gold frame, gold title left of the TRAINING sticker, all different
    opts = {}
    for k in ('special', 'raid', 'event'):
        for st in 'ABC':
            o = m.CATALOG_OPTIONS[k](st)
            opts[(k, st)] = o.convert('RGB')
            check(o.size == (640, 140), '%s %s size' % (k, st))
            tb = o.info.get('title_box')
            check(tb is not None and tb[2] <= m.TITLE_MAX_RIGHT and tb[0] >= 10, '%s %s title box %s left of the sticker' % (k, st, tb))
            sb, fi = o.info.get('sticker_box'), m.FRAME_INNER
            check(sb is not None and fi[0] <= sb[0] and fi[1] <= sb[1] and sb[2] <= fi[2] and sb[3] <= fi[3],
                  '%s %s TRAINING mark %s inside the frame %s' % (k, st, sb, fi))
            check(sb is not None and tb is not None and tb[2] < sb[0], '%s %s title %s clear of the mark %s' % (k, st, tb, sb))
            out_ = [b for b in o.info.get('pieces', []) if not (fi[0] <= b[0] and fi[1] <= b[1] and b[2] <= fi[2] and b[3] <= fi[3])]
            check(o.info.get('pieces') and not out_, '%s %s art pieces inside the frame (out: %s)' % (k, st, out_))
            check(o.convert('RGB').getpixel((1, 70)) == m.FAMILY_GOLD[:3] and o.convert('RGB').getpixel((320, 138)) == m.FAMILY_GOLD[:3],
                  '%s %s gold frame' % (k, st))
            check(sum(gold(p) for p in pixels(o.convert('RGB').crop((20, 30, 300, 75)))) > 1200, '%s %s gold title' % (k, st))
    keys = list(opts)
    for i, a_ in enumerate(keys):
        for b_ in keys[i + 1:]:
            check(mean(ImageChops.difference(opts[a_], opts[b_])) > 12, 'options %s and %s too alike' % (a_, b_))
    check(m.parse_styles('special=B,event=C') == {'special': 'B', 'event': 'C'}, 'parse_styles')
    for bad in ('raid=D', 'shop=A'):
        try:
            m.parse_styles(bad)
            errors.append('parse_styles accepts %s' % bad)
        except ValueError:
            pass
    p1, p2 = m.options_sheets(os.path.join(tmp, 'sheets'))
    check(Image.open(p1).size == (660, 9 * 168 + 10) and os.path.exists(p2), 'options sheets')
    # Raid B variants (user 06-11): gold family look, a lit boss, different from B and from each other
    rb = {'B': opts[('raid', 'B')]}
    for v in m.RAID_B_VARIANTS:
        o = m.raid_option(v)
        rb[v] = o.convert('RGB')
        check(o.size == (640, 140) and o.convert('RGB').getpixel((1, 70)) == m.FAMILY_GOLD[:3], 'raid %s size and gold frame' % v)
        tb = o.info.get('title_box')
        check(tb is not None and tb[2] <= m.TITLE_MAX_RIGHT, 'raid %s title clear of the sticker %s' % (v, tb))
        sb, fi = o.info.get('sticker_box'), m.FRAME_INNER
        check(sb is not None and fi[0] <= sb[0] and fi[1] <= sb[1] and sb[2] <= fi[2] and sb[3] <= fi[3] and tb[2] < sb[0],
              'raid %s TRAINING mark %s inside the frame, clear of the title' % (v, sb))
        pc = o.info.get('pieces') or []
        check(pc and all(fi[0] <= b[0] and fi[1] <= b[1] and b[2] <= fi[2] and b[3] <= fi[3] for b in pc), 'raid %s boss inside the frame %s' % (v, pc))
        if os.path.isdir(m.RAID_RIGS):
            check(o.info.get('boss') in ('0013', '0001', '0004'), 'raid %s boss drawn (%s)' % (v, o.info.get('boss')))
    ks = list(rb)
    for i, a_ in enumerate(ks):
        for b_ in ks[i + 1:]:
            check(mean(ImageChops.difference(rb[a_], rb[b_])) > 8, 'raid %s and %s too alike' % (a_, b_))
    check(m.parse_styles('raid=B3,special=B,event=A') == {'raid': 'B3', 'special': 'B', 'event': 'A'}, 'parse_styles B3')
    try:
        m.parse_styles('special=B1')
        errors.append('parse_styles accepts special=B1')
    except ValueError:
        pass
    q1, q2 = m.raid_b_sheets(os.path.join(tmp, 'rbsheets'))
    check(Image.open(q1).size == (660, 5 * 168 + 10) and Image.open(q2).size[0] == 4 * 660 + 20, 'raid B sheets')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if errors:
    print('ERRORS (%d)' % len(errors))
    for e in errors:
        print(' -', e)
    sys.exit(1)
print('OK: special banners 640x140 (original, plate, catalog, -kept)')
