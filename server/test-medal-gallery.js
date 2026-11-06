// Medal Gallery (I-242, medal-gallery.js): the page renders, its two tabs hold the Medals of medal_bgm.json (medal.bgm) and of
// medal-art.js (imageCategory 2), boosted copies count for their base row, owned / not owned, cards with the same picture
// (medal_gallery_groups.json) are shown once with their variants, BGM cards carry their track name and sound, the file URLs
// map to fixed file names only, the page stays light, the Banner Catalog shows the entry block and a Notice explains it.
// Fixture rows, then the master in use when it exists (server/master_data or KHUX_MASTER_DIR).
//   node server/test-medal-gallery.js
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const g = require('./medal-gallery');
const art = require('./medal-art');

const row = (medalId, name, rare, extra = {}) => ({ medalId, name, rare, imageId: medalId, thumbId: medalId, attribute: 1, darklight: 1, sortId: medalId % 1000, groupId: 0, imageCategory: 0, ...extra });
// Key Art #2 (art 21266: 6★ 300778, 7★ 300779 + a boosted copy), Illustrated Xion [EX] (CONTAINED in 21266, also BGM),
// HD Roxas (BGM only) and SN++ - HD Roxas (same picture: a variant), a Medal with neither
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
    row(302079, 'SN++ - HD Roxas', 7, { bgm: 501006007, sortId: 1 }),
    row(12345, 'Plain <Medal>', 5),
  ];
}
const OPTS = { groups: [{ list: 'bgm', ids: [302079, 300893], names: ['SN++ - HD Roxas', 'HD Roxas'], maxDist: 0 }],
  bgmJson: { tracks: { 'HD Roxas': 'Another Side', 'Illustrated Xion (EX)': 'Musique pour la tristesse de Xion' }, _incerti: { 'Illustrated Xion (EX)': 'x' } } };
const count = (s, sub) => s.split(sub).length - 1;
const rowsOf = (html, tab) => html.split('<div class="row ').slice(1).filter((r) => r.includes(`data-tab="${tab}"`));

const tests = {
  model_groups_by_name_and_picture() {
    const m = g.galleryModel(fixture(), OPTS);
    assert.deepStrictEqual(m.bgm.map((c) => c.name), ['Illustrated Xion [EX]', 'HD Roxas'], 'one card per picture, album order; the SN++ is a variant');
    const hd = m.bgm.find((c) => c.name === 'HD Roxas');
    assert.deepStrictEqual(hd.ids, [310893, 300893], 'boosted copy is not a card member');
    assert.strictEqual(hd.thumbId, 300893, 'picture of the highest star');
    assert.deepStrictEqual(hd.variants.map((v) => v.name), ['SN++ - HD Roxas'], 'the Medal without the SN prefix leads, even later in the album');
    assert.deepStrictEqual([hd.track, hd.uncertain, hd.bgm], ['Another Side', false, 501006007]);
    const xion = m.bgm[0];
    assert.deepStrictEqual([xion.track, xion.uncertain], ['Musique pour la tristesse de Xion', true], '(EX) of the wiki = [EX], _incerti = not verified');
    assert.deepStrictEqual(m.art.map((s) => [s.artId, s.name, s.cards.map((c) => c.name)]), [[21266, 'Key Art #2', ['Key Art #2', 'Illustrated Xion [EX]']]], 'art section, carrier first');
    assert.deepStrictEqual(m.art[0].cards.map((c) => c.reconstructed), [false, true], 'CONTAINED card reconstructed');
    assert.deepStrictEqual(m.counts, { bgmCards: 2, bgmNames: 3, bgmRows: 5, arts: 1, artCards: 2, artNames: 2, artRows: 4, reconstructed: 1, tracks: 2 });
    assert.strictEqual(g.galleryModel(fixture(), { ...OPTS, groups: [] }).bgm.length, 3, 'no group: no merge');
  },
  owned_counts_boosted_and_variants() {
    const medals = fixture();
    const owned = g.ownedBases([{ medalId: 2300893 }, { medalId: 300778 }, { medalId: 999 }], medals);
    assert.deepStrictEqual([...owned].sort((a, b) => a - b), [999, 300778, 300893]);
    const html = g.expandGallery(g.galleryPage(medals, { owned, ...OPTS }));
    const bgm = rowsOf(html, 'bgm'), a = rowsOf(html, 'art');
    const hd = bgm.find((r) => r.includes('data-name="HD Roxas | SN++ - HD Roxas"'));
    assert(hd && hd.startsWith('own tb"') && hd.includes('<span class="st">6★</span><span class="st on">7★</span>') && hd.includes('>Owned<'), hd);
    assert(hd.includes('<div class="tk">♪ Another Side</div>') && hd.includes('<b>Variants:</b> <span class="vv">SN++ - HD Roxas 7★</span>'), hd);
    // a card is owned when only a variant is owned
    const v = g.expandGallery(g.galleryPage(medals, { owned: new Set([302079]), ...OPTS }));
    assert(rowsOf(v, 'bgm').find((r) => r.includes('HD Roxas | SN++')).startsWith('own tb"') && v.includes('<span class="vv on">SN++ - HD Roxas 7★</span>'), 'variant owned');
    const xion = a.find((r) => r.includes('data-name="Illustrated Xion [EX]"'));
    assert(xion.startsWith('not ta"') && xion.includes('>Not owned<') && xion.includes('s-rec">Reconstructed<') && xion.includes('Reversed') && xion.includes('(sound match not verified)'), xion);
    const ka = a.find((r) => r.includes('data-name="Key Art #2"'));
    assert(ka.includes('data-own="own"') && !ka.includes('Reconstructed') && !ka.includes('class="tk"') && ka.includes('<span class="m">Magic</span> · Upright'), ka);
  },
  page_data_detail_and_music() {
    const d = g.pageData(g.galleryModel(fixture(), OPTS), new Set([300893]));
    const hd = d.b.find((c) => c.n === 'HD Roxas');
    assert.deepStrictEqual([d.k[hd.k], hd.b, hd.u, hd.v], ['Another Side', 501006007, 0, [['SN++ - HD Roxas', [[7, 0]]]]]);
    assert.strictEqual(d.a[0][2][0].b, 0, 'no music on a Medal without bgm');
    const page = g.galleryPage(fixture(), OPTS);
    assert(page.includes('<audio id="au" preload="none" loop></audio>') && page.includes('id="det"') && page.includes("'/web/medals/bgm/v'+kxD.v+'/'"), 'detail view and player');
    assert(page.includes('-l.png" alt=""><h2>'), 'large picture in the detail');
    // no bridge to pause the game music (docs/notes/medaglie.md#medal-gallery-music): the detail says how to lower it by hand
    assert(page.includes(`<p class="mh">${g.MUSIC_HINT}</p>`) && /Other &gt; Settings/.test(g.MUSIC_HINT) && !g.MUSIC_HINT.includes("'"), 'music hint');
  },
  page_renders() {
    const page = g.galleryPage(fixture(), { tab: 'art', fromCatalog: true, ...OPTS });
    assert(page.startsWith('<!doctype html>') && page.includes('<title>Medal Gallery</title>'));
    assert(page.includes('The Medal Gallery is an addition of this server.'), 'says it is not original');
    assert(page.includes('<div id="rows" data-tab="art"></div>') && page.includes('class="tab on" data-p="art"'), 'tab=art opens Full Art');
    assert(page.includes('<a class="back" href="/web/gacha/catalog">BACK</a>') && page.includes('class="hb"'), 'BACK to the Banner Catalog');
    assert(!g.galleryPage(fixture(), OPTS).includes('class="back"'), 'no BACK without from=catalog');
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
    const html = g.expandGallery(g.galleryPage(medals, OPTS));
    assert(html.includes('A &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y') && !html.includes('<b>"x"'), 'escaped');
    const page = g.galleryPage([row(2, 'x</script><script>alert(1)</script>', 7, { bgm: 1 })], OPTS);
    assert.strictEqual(count(page, '</script>'), 3, 'a name cannot close the data script');
  },
  find_matches_names() {
    assert(g.khuxMatch('key art', 'Key Art #2') && g.khuxMatch('stain', 'SN - Stained Glass #3') && !g.khuxMatch('art key x', 'Key Art #2'));
  },
  media_files() {
    assert.strictEqual(g.imageFile('/web/medals/img/v1/300778.png'), '300778.png');
    assert.strictEqual(g.imageFile('/web/medals/img/v1/300778-l.png'), '300778-l.png');
    assert.strictEqual(g.imageFile('/web/medals/art/v1/21266.jpg'), 'art_21266.jpg');
    assert.strictEqual(g.imageFile('/web/medals/art/v1/21266-l.jpg'), 'art_21266-l.jpg');
    assert.deepStrictEqual(g.mediaFile('/web/medals/bgm/v1/501006007.ogg'), { dir: 'bgm', file: '501006007.ogg', type: 'audio/ogg' });
    assert.strictEqual(g.bgmUrl(501006007), '/web/medals/bgm/v1/501006007.ogg');
    for (const u of ['/web/medals/img/v9/1.png', '/web/medals/img/v1/../x.png', '/web/medals/art/v1/1.png', '/web/medals/bgm/v1/1-l.ogg', '/web/medals/bgm/v2/1.ogg', '/web/medals/gallery']) assert.strictEqual(g.mediaFile(u), null, u);
  },
  entry_point_and_notice() {
    const gacha = require('./gacha');
    const cat = gacha.catalogPage([], { spirit: false });
    assert(cat.includes(`<a class="mgx" href="${gacha.MEDAL_GALLERY_HREF}">`) && gacha.MEDAL_GALLERY_HREF === g.ENTRY_HREF, 'Banner Catalog shows the gallery block');
    assert(cat.includes('<b>Medal Gallery</b>') && cat.includes(`src="${g.medalImg(g.PREVIEW.thumbId)}"`) && cat.includes(`src="${g.artImg(g.PREVIEW.artId)}"`) && cat.includes('Open ›'), 'title, previews, button');
    assert(cat.indexOf('class="mgx"') < cat.indexOf('GAME YEAR'), 'above the GAME YEAR tabs');
    const notice = require('./routes-info-album').NOTICES.find((x) => x.title === 'Medal Gallery');
    const t = notice ? notice.body.join(' ') : '';
    assert(notice && notice.tag === 'INFORMATION' && /\*\*not original\*\*/.test(t) && /addition of this server/.test(t) && /Variants/.test(t) && /Play/.test(t), 'Notice');
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert(src.includes("p.startsWith('/web/medals/')") && src.includes('medalGallery.galleryPage(') && src.includes('medalGallery.mediaFile(p)') && src.includes("'Content-Range'"), 'server routes');
  },
  groups_file() {
    const doc = require('./medal_gallery_groups.json');
    assert(doc.threshold > 0 && doc.threshold < 12.11, 'threshold under the closest different pictures');
    for (const x of doc.groups) assert(x.ids.length >= 2 && x.ids.length === x.names.length && x.maxDist <= doc.threshold, JSON.stringify(x));
  },
  master_counts() {
    const file = path.join(process.env.KHUX_MASTER_DIR || path.join(__dirname, 'master_data'), 'medal.json');
    if (!fs.existsSync(file)) { console.log('  (no master: master counts skipped)'); return; }
    const medals = JSON.parse(fs.readFileSync(file, 'utf8')), by = new Map(medals.map((m) => [m.medalId, m]));
    const m = g.galleryModel(medals);
    const ids = (c) => [...c.ids, ...c.variants.flatMap((v) => v.ids)];
    // Full Art: one section per art id of medal-art.js, every family / CONTAINED base row present in the master
    assert.strictEqual(m.art.length, art.ART.length, '55 artworks');
    const expected = [...art.familyArt().keys()].filter((id) => by.has(id) && g.baseOf(by.get(id)) === id).sort((a, b) => a - b);
    assert.deepStrictEqual(m.art.flatMap((s) => s.cards.flatMap(ids)).sort((a, b) => a - b), expected, 'Full Art rows = medal-art.js rows');
    const contained = new Set(art.CONTAINED.flatMap(([, x]) => x));
    for (const s of m.art) for (const c of s.cards) assert.strictEqual(c.reconstructed, c.ids.every((id) => contained.has(id)), c.name);
    for (const s of m.art) for (const c of s.cards) for (const v of c.variants) assert.strictEqual(v.reconstructed, c.reconstructed, `${c.name}: variant ${v.name} has another Reconstructed state`);
    // BGM: every base row with medal.bgm, and every medal_bgm.json name with a row is on a card, with its track
    const bgmRows = medals.filter((x) => x.bgm && g.baseOf(x) === x.medalId).map((x) => x.medalId).sort((a, b) => a - b);
    assert.deepStrictEqual(m.bgm.flatMap(ids).sort((a, b) => a - b), bgmRows, 'BGM rows = medal.bgm rows');
    for (const c of m.bgm) assert(c.track, `${c.name}: no track name`);
    const key = (s) => String(s).toLowerCase().replace(/\(ex(\+?)\)/, '[ex$1]').replace(/[^a-z0-9[\]+&]/g, '');
    const names = new Set(m.bgm.flatMap((c) => [c.name, ...c.variants.map((v) => v.name)]).map(key));
    const json = require('./medal_bgm.json');
    const listed = Object.keys(json.medals).filter((n) => names.has(key(n)) || names.has(key(`${n} A`)));
    assert.deepStrictEqual(Object.keys(json.medals).filter((n) => !listed.includes(n)), [], 'every medal_bgm.json name on a card');
    // every variant group of the file is applied on this master (else regenerate it: make_medal_gallery_groups.py)
    const shown = new Map([['bgm', m.bgm], ...m.art.map((s) => [String(s.artId), s.cards])]);
    for (const x of require('./medal_gallery_groups.json').groups) {
      const cards = shown.get(String(x.list)) || [];
      assert(cards.some((c) => x.ids.includes(c.top) && c.variants.length === x.ids.length - 1), `group ${x.names.join(' / ')} not applied`);
    }
    // the Banner Catalog previews exist in the gallery
    assert(m.bgm.some((c) => c.thumbId === g.PREVIEW.thumbId) && m.art.some((s) => s.artId === g.PREVIEW.artId), 'previews');
    // size budget (the light catalogue, docs/notes/raid.md#catalog-light): well under the 95 KB of the Raid Catalog
    const page = g.galleryPage(medals, { owned: new Set(bgmRows.slice(0, 5)) });
    const kb = Buffer.byteLength(page) / 1024;
    assert(kb < 60, `page ${kb.toFixed(1)} KB`);
    const html = g.expandGallery(page);
    assert.strictEqual(count(html, '<div class="row '), m.bgm.length + m.counts.artCards);
    console.log(`  master: BGM ${m.bgm.length} cards (${m.counts.bgmNames} names, ${m.counts.bgmRows} rows, ${m.counts.tracks} tracks); Full Art ${m.art.length} artworks, `
      + `${m.counts.artCards} cards (${m.counts.artNames} names, ${m.counts.artRows} rows, ${m.counts.reconstructed} reconstructed); page ${kb.toFixed(1)} KB`);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
if (failed) process.exit(1);
console.log(`OK: medal-gallery (${Object.keys(tests).length} tests)`);
