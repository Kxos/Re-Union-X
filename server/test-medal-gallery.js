// Medal Gallery (I-242, medal-gallery.js): the page renders, its two tabs hold the Medals of medal_bgm.json (medal.bgm) and of
// medal-art.js (imageCategory 2), boosted copies count for their base row, owned / not owned, the picture URLs map to fixed file
// names only, the page stays light, the Banner Catalog links to it and a Notice explains it. Fixture rows, then the master in
// use when it exists (server/master_data or KHUX_MASTER_DIR).
//   node server/test-medal-gallery.js
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const g = require('./medal-gallery');
const art = require('./medal-art');

const row = (medalId, name, rare, extra = {}) => ({ medalId, name, rare, imageId: medalId, thumbId: medalId, attribute: 1, darklight: 1, sortId: medalId % 1000, groupId: 0, imageCategory: 0, ...extra });
// Key Art #2 (art 21266: 6★ 300778, 7★ 300779 + a boosted copy), Illustrated Xion [EX] (CONTAINED in 21266, also BGM),
// HD Roxas (BGM only), a Medal with neither
function fixture() {
  return [
    row(300778, 'Key Art #2', 6, { imageCategory: 2, artId: 21266, attribute: 3 }),
    row(300779, 'Key Art #2', 7, { imageCategory: 2, artId: 21266, attribute: 3 }),
    row(2300779, 'Key Art #2', 7, { imageCategory: 2, artId: 21266, attribute: 3, groupId: 300779, thumbId: 300779 }),
    row(311245, 'Illustrated Xion [EX]', 6, { imageCategory: 2, artId: 21266, bgm: 501006023, attribute: 3, darklight: 2, thumbId: 301244 }),
    row(301245, 'Illustrated Xion [EX]', 7, { imageCategory: 2, artId: 21266, bgm: 501006023, attribute: 3, darklight: 2 }),
    row(310893, 'HD Roxas', 6, { bgm: 501006007, thumbId: 300892 }),
    row(300893, 'HD Roxas', 7, { bgm: 501006007 }),
    row(2300893, 'HD Roxas', 7, { bgm: 501006007, groupId: 300893 }),
    row(12345, 'Plain <Medal>', 5),
  ];
}
const count = (s, sub) => s.split(sub).length - 1;
const rowsOf = (html, tab) => html.split('<div class="row ').slice(1).filter((r) => r.includes(`data-tab="${tab}"`));

const tests = {
  model_groups_by_name() {
    const m = g.galleryModel(fixture());
    assert.deepStrictEqual(m.bgm.map((c) => c.name), ['Illustrated Xion [EX]', 'HD Roxas'], 'one card per name, album order (sortId)');
    const hd = m.bgm.find((c) => c.name === 'HD Roxas');
    assert.deepStrictEqual(hd.ids, [310893, 300893], 'boosted copy is not a card member');
    assert.strictEqual(hd.thumbId, 300893, 'picture of the highest star');
    assert.deepStrictEqual(m.art.map((s) => [s.artId, s.name, s.cards.map((c) => c.name)]), [[21266, 'Key Art #2', ['Key Art #2', 'Illustrated Xion [EX]']]], 'art section, carrier first');
    assert.deepStrictEqual(m.art[0].cards.map((c) => c.reconstructed), [false, true], 'CONTAINED card reconstructed');
    assert.deepStrictEqual(m.counts, { bgmCards: 2, bgmRows: 4, arts: 1, artCards: 2, artRows: 4, reconstructed: 1 });
  },
  owned_counts_boosted_for_base() {
    const medals = fixture();
    const owned = g.ownedBases([{ medalId: 2300893 }, { medalId: 300778 }, { medalId: 999 }], medals);
    assert.deepStrictEqual([...owned].sort((a, b) => a - b), [999, 300778, 300893]);
    const html = g.expandGallery(g.galleryPage(medals, { owned }));
    const bgm = rowsOf(html, 'bgm'), a = rowsOf(html, 'art');
    const hd = bgm.find((r) => r.includes('data-name="HD Roxas"'));
    assert(hd.startsWith('own"') && hd.includes('data-own="own"') && hd.includes('<span class="st">6★</span><span class="st on">7★</span>') && hd.includes('>Owned<'), hd);
    const xion = a.find((r) => r.includes('data-name="Illustrated Xion [EX]"'));
    assert(xion.startsWith('not"') && xion.includes('>Not owned<') && xion.includes('s-rec">Reconstructed<') && xion.includes('Reversed'), xion);
    const ka = a.find((r) => r.includes('data-name="Key Art #2"'));
    assert(ka.includes('data-own="own"') && !ka.includes('Reconstructed') && ka.includes('<span class="m">Magic</span> · Upright'), ka);
  },
  page_renders() {
    const page = g.galleryPage(fixture(), { tab: 'art', fromCatalog: true });
    assert(page.startsWith('<!doctype html>') && page.includes('<title>Medal Gallery</title>'));
    assert(page.includes('The Medal Gallery is an addition of this server.'), 'says it is not original');
    assert(page.includes('<div id="rows" data-tab="art"></div>') && page.includes('class="tab on" data-p="art"'), 'tab=art opens Full Art');
    assert(page.includes('<a class="back" href="/web/gacha/catalog">BACK</a>') && page.includes('class="hb"'), 'BACK to the Banner Catalog');
    assert(!g.galleryPage(fixture()).includes('class="back"'), 'no BACK without from=catalog');
    assert(page.includes('data-g="own"') && page.includes('data-v="not"') && page.includes('data-g="at"') && page.includes('id="fq"'), 'Filters sheet');
    const html = g.expandGallery(page);
    assert.strictEqual(count(html, '<div class="row '), 4);
    assert.strictEqual(count(html, '<div class="sec" data-tab="art">'), 1);
    assert(html.includes('data-src="/web/medals/img/v1/300779.png"') && html.includes('data-src="/web/medals/art/v1/21266.jpg"') && html.includes('data-big="/web/medals/art/v1/21266-l.jpg"'), 'lazy picture URLs');
    assert(!/<img[^>]* src=/.test(html.split('<div id="rows"')[1].split('<div id="big"')[0]), 'no picture loaded before render (data-src only)');
    assert(!html.includes('Plain'), 'a Medal with neither is not listed');
    // every inline script parses (ES5 for the old WebView: no arrow functions, let/const or template literals in the page script)
    for (const s of page.match(/<script>([\s\S]*?)<\/script>/g).map((x) => x.slice(8, -9))) {
      new Function(s); // eslint-disable-line no-new-func
      assert(!/=>|\blet\b|\bconst\b|`/.test(s), 'ES5 page script');
    }
  },
  escapes_names() {
    const medals = [row(1, 'A <b>"x"</b> & y', 7, { bgm: 1 })];
    const html = g.expandGallery(g.galleryPage(medals));
    assert(html.includes('A &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y') && !html.includes('<b>"x"'), 'escaped');
    const page = g.galleryPage([row(2, 'x</script><script>alert(1)</script>', 7, { bgm: 1 })]);
    assert.strictEqual(count(page, '</script>'), 3, 'a name cannot close the data script');
  },
  find_matches_names() {
    assert(g.khuxMatch('key art', 'Key Art #2') && g.khuxMatch('stain', 'SN - Stained Glass #3') && !g.khuxMatch('art key x', 'Key Art #2'));
  },
  picture_files() {
    assert.strictEqual(g.imageFile('/web/medals/img/v1/300778.png'), '300778.png');
    assert.strictEqual(g.imageFile('/web/medals/art/v1/21266.jpg'), 'art_21266.jpg');
    assert.strictEqual(g.imageFile('/web/medals/art/v1/21266-l.jpg'), 'art_21266-l.jpg');
    for (const u of ['/web/medals/img/v9/1.png', '/web/medals/img/v1/../x.png', '/web/medals/img/v1/1-l.png', '/web/medals/art/v1/1.png', '/web/medals/gallery']) assert.strictEqual(g.imageFile(u), null, u);
  },
  entry_point_and_notice() {
    const gacha = require('./gacha');
    const cat = gacha.catalogPage([], { spirit: false });
    assert(cat.includes(`href="${gacha.MEDAL_GALLERY_HREF}"`) && gacha.MEDAL_GALLERY_HREF === '/web/medals/gallery?from=catalog', 'Banner Catalog links the gallery');
    const notice = require('./routes-info-album').NOTICES.find((x) => x.title === 'Medal Gallery');
    assert(notice && notice.tag === 'INFORMATION' && /\*\*not original\*\*/.test(notice.body.join(' ')) && /addition of this server/.test(notice.body.join(' ')), 'Notice');
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert(src.includes("p.startsWith('/web/medals/')") && src.includes('medalGallery.galleryPage(') && src.includes('medalGallery.imageFile(p)'), 'server routes');
  },
  master_counts() {
    const file = path.join(process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
    if (!fs.existsSync(file)) { console.log('  (no master: master counts skipped)'); return; }
    const medals = JSON.parse(fs.readFileSync(file, 'utf8')), by = new Map(medals.map((m) => [m.medalId, m]));
    const m = g.galleryModel(medals);
    // Full Art: one section per art id of medal-art.js, every family / CONTAINED base row present in the master
    assert.strictEqual(m.art.length, art.ART.length, '55 artworks');
    const expected = [...art.familyArt().keys()].filter((id) => by.has(id) && g.baseOf(by.get(id)) === id).sort((a, b) => a - b);
    assert.deepStrictEqual(m.art.flatMap((s) => s.cards.flatMap((c) => c.ids)).sort((a, b) => a - b), expected, 'Full Art rows = medal-art.js rows');
    const contained = new Set(art.CONTAINED.flatMap(([, ids]) => ids));
    for (const s of m.art) for (const c of s.cards) assert.strictEqual(c.reconstructed, c.ids.every((id) => contained.has(id)), c.name);
    assert(m.counts.reconstructed > 0);
    // BGM: every base row with medal.bgm, and every medal_bgm.json name with a row is on a card
    const bgmRows = medals.filter((x) => x.bgm && g.baseOf(x) === x.medalId).map((x) => x.medalId).sort((a, b) => a - b);
    assert.deepStrictEqual(m.bgm.flatMap((c) => c.ids).sort((a, b) => a - b), bgmRows, 'BGM rows = medal.bgm rows');
    const key = (s) => String(s).toLowerCase().replace(/\(ex(\+?)\)/, '[ex$1]').replace(/[^a-z0-9[\]+&]/g, '');
    const names = new Set(m.bgm.map((c) => key(c.name)));
    const json = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'medal_bgm.json'), 'utf8')).medals);
    const listed = json.filter((n) => names.has(key(n)) || names.has(key(`${n} A`)));
    assert.deepStrictEqual(json.filter((n) => !listed.includes(n)), [], 'every medal_bgm.json name on a card');
    // size budget (the light catalogue, docs/notes/raid.md#catalog-light): well under the 95 KB of the Raid Catalog
    const page = g.galleryPage(medals, { owned: new Set(bgmRows.slice(0, 5)) });
    const kb = Buffer.byteLength(page) / 1024;
    assert(kb < 45, `page ${kb.toFixed(1)} KB`);
    const html = g.expandGallery(page);
    assert.strictEqual(count(html, '<div class="row '), m.bgm.length + m.counts.artCards);
    console.log(`  master: BGM ${m.bgm.length} cards / ${m.counts.bgmRows} rows (${json.length} medal_bgm.json names); Full Art ${m.art.length} artworks, `
      + `${m.counts.artCards} cards / ${m.counts.artRows} rows (${m.counts.reconstructed} reconstructed); page ${kb.toFixed(1)} KB`);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
if (failed) process.exit(1);
console.log(`OK: medal-gallery (${Object.keys(tests).length} tests)`);
