// Original notices behind the Details page of the Shop banners: node server/test-shop-notices.js
// make-shop-notices.js (map, build) and shop-notice-pages.js (Details section, notice page). Fixtures only, except `real_*`,
// which read the private sources / the generated catalogue when they exist and skip otherwise.
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const ms = require('./make-shop-notices');
const pages = require('./shop-notice-pages');
const gacha = require('./gacha');

// a notice as notice_text.json keeps it (the bridge page as plain text); fixture text, not an original
const noticeText = (title, date, body) => `${title} | KINGDOM HEARTS Union χ | SQUARE ENIX BRIDGE\n    This site requires javascript. please enable javascript in your browser.\n`
  + `                Information\n                ${title}\n                  ${date} 07:00:00 (UTC)\n                CAMPAIGN\n                KINGDOM HEARTS Union χ\n${body}\n              Top of Page`;
const MAP = ['# comment line', 'rowId\tnoticeId\talt\tconfidence\tnote',
  'B0010\t500\t501,999\thigh\tnotice audit 17-10',
  'B0011\t502\t\tlow\ta related notice',
  'B0012\t\t\t\tIDs 1-9 probed, nothing new.',
  'B0013\t998\t\thigh\tlost text'].join('\n');
const TEXT = {
  500: noticeText('Big Fixture Deal!', '05/06/2016', '★ Draw the <Fixture> Deal!\n■ Campaign Period\nMay 6, 2016 12:00 a.m. to May 12, 2016 11:59 p.m. (PT)\n・All 10 Medals are 5★!\n● Another event\nSomething else'),
  501: noticeText('Fixture Deal Lineup', '05/05/2016', 'The lineup.'),
  502: noticeText('Tickets for a Fixture', '08/30/2019', 'Tickets are delivered.'),
  503: noticeText('Unused', '01/01/2017', 'Not used by any banner.'),
};
const banner = (o = {}) => ({ rowId: 'B0010', drawMedalTypeId: 10010, name: 'BIG FIXTURE', type: 'STANDARD', flags: [], start: '2016-05-06', end: '2016-05-12', endSource: 'original',
  unlockQuest: 1, payType: 1, currency: 'jewel', prices: [3000], lotCount: 10, rarityMix: [], dayLimit: 0, vipFree: false, pool: { mode: 'released' },
  guarantee: { list: [], count: 0, pity: null }, skill: null, catalogOnly: 'INCOMPLETE', notes: 'Draws from set 1.1.', image: 'x.png', ...o });
const doc = () => ms.build({ map: ms.readMap(MAP), noticeText: TEXT });

const tests = {
  read_map() {
    const m = ms.readMap(MAP);
    assert.strictEqual(m.length, 4, 'comment and header skipped');
    assert.deepStrictEqual(m[0], { rowId: 'B0010', noticeId: 500, alt: [501, 999], confidence: 'high', note: 'notice audit 17-10' });
    assert.deepStrictEqual([m[2].noticeId, m[2].alt, m[2].note], [null, [], 'IDs 1-9 probed, nothing new.']);
    assert.throws(() => ms.readMap('a\tb\n1\t2'), /header/);
  },
  build() {
    const d = doc();
    assert.deepStrictEqual(Object.keys(d.rows).sort(), ['B0010', 'B0011']);
    assert.deepStrictEqual(d.rows.B0010, { noticeId: 500, alt: [501], confidence: 'high', note: 'notice audit 17-10' }, 'alt without text (999) dropped');
    assert.deepStrictEqual(d.missing, { B0012: 'IDs 1-9 probed, nothing new.', B0013: 'lost text; text of notice 998 not available' });
    assert.deepStrictEqual(Object.keys(d.notices).sort(), ['500', '501', '502'], 'only the notices in use');
    assert.deepStrictEqual([d.notices[500].title, d.notices[500].date, d.notices[500].category], ['Big Fixture Deal!', '2016-05-06', 'CAMPAIGN']);
    assert.ok(!d.notices[500].body.some((l) => /Top of Page|SQUARE ENIX BRIDGE/.test(l)), 'boilerplate removed');
  },
  detail_section_found() {
    const h = pages.detailSection(banner(), doc(), { fromCatalog: true });
    assert.ok(h.includes('<h2>Original notice</h2>') && h.includes('Big Fixture Deal!') && h.includes('May 6, 2016'));
    assert.ok(h.includes('href="/web/gacha/notice/10010?from=catalog"'), 'link keeps from=catalog');
    assert.ok(h.includes('href="/web/gacha/notice/10010?n=501&amp;from=catalog"') || h.includes('href="/web/gacha/notice/10010?n=501&from=catalog"'), 'alt notice linked');
    assert.ok(!/not been recovered/.test(h));
    const low = pages.detailSection(banner({ rowId: 'B0011' }), doc(), {});
    assert.ok(/related to the banner/.test(low), 'low confidence said');
  },
  detail_section_missing() {
    const h = pages.detailSection(banner({ rowId: 'B0012' }), doc(), {});
    assert.ok(/original notice of this banner has not been recovered/.test(h));
    assert.ok(h.includes('Draws from set 1.1.') && /community wiki/.test(h), 'what we know, with its source');
    assert.ok(/original art/.test(h));
    assert.ok(!/original art/.test(pages.detailSection(banner({ rowId: 'B0012', image: null }), doc(), {})), 'no art line without the original art');
    assert.strictEqual(pages.detailSection(banner(), null, {}), '', 'no generated file: nothing');
  },
  notice_page() {
    const h = pages.noticePage(banner(), doc(), null, { fromCatalog: true });
    assert.ok(h.includes('<h1>Big Fixture Deal!</h1>'));
    assert.ok(h.includes('Draw the &lt;Fixture&gt; Deal!'), 'escaped, unchanged');
    assert.ok(h.includes('All 10 Medals are 5★!') && h.includes('Something else'), 'every section of the notice');
    assert.ok(h.includes('href="/web/gacha/detail/10010?from=catalog"'), 'BACK to the Details');
    assert.ok(h.includes('Fixture Deal Lineup'), 'the other notice is linked');
    assert.ok(pages.noticePage(banner(), doc(), '501', {}).includes('<h1>Fixture Deal Lineup</h1>'), '?n= selects an alt notice');
    assert.ok(pages.noticePage(banner(), doc(), '503', {}).includes('<h1>Big Fixture Deal!</h1>'), 'a notice not of this banner: the primary one');
    for (const b of [banner({ rowId: 'B0012' }), banner({ rowId: 'B9999' }), null]) {
      assert.ok(/not available on this server/.test(pages.noticePage(b, doc(), null, {})), 'friendly page');
    }
    assert.ok(/not available on this server/.test(pages.noticePage(banner(), null, null, {})));
  },
  details_page_has_section() {
    const ctx = { storyQuest: 300, sizes: new Set([10]), show: new Set(), shown: new Set(), noticeSection: pages.detailSection(banner(), doc(), {}) };
    const h = gacha.detailPage(banner(), null, new Map(), ctx);
    assert.ok(h.includes('<h2>Original notice</h2>') && h.indexOf('Original notice') > h.indexOf('Campaign Period'));
    assert.ok(!gacha.detailPage(banner(), null, new Map(), { ...ctx, noticeSection: '' }).includes('Original notice'));
  },
  real_map_matches_catalog() {
    let cat;
    try { cat = JSON.parse(fs.readFileSync(path.join(__dirname, 'game_data', 'gacha_catalog.json'), 'utf8')); } catch (e) { console.log('  (skipped: no catalogue)'); return; }
    const m = ms.readMap(fs.readFileSync(ms.MAP, 'utf8'));
    const ids = cat.banners.map((b) => b.rowId);
    assert.deepStrictEqual(m.map((r) => r.rowId).sort(), [...ids].sort(), 'one map row per catalogue banner');
    assert.ok(m.every((r) => r.noticeId !== null || r.note), 'a banner without a notice says what was searched');
  },
  real_build() {
    let d;
    try { d = ms.buildFrom(process.env.KHUX_RAID_SRC || ms.DEFAULT_SRC); } catch (e) { console.log(`  (skipped: private sources not readable, ${e.code || e.message})`); return; }
    assert.strictEqual(d.rows.B0009.noticeId, 17892, 'Zootopia Medals & Avatars are Here!');
    assert.strictEqual(d.notices[17892].title, 'Zootopia Medals & Avatars are Here!');
    assert.ok(Object.keys(d.rows).length >= 790, `banners with a notice: ${Object.keys(d.rows).length}`);
    for (const id of ['B0002', 'B0003', 'B0004', 'B0077']) assert.ok(d.missing[id], `${id}: no notice recovered`);
    assert.deepStrictEqual([d.rows.B0001.noticeId, d.rows.B0001.confidence], [19382, 'low'], 'DAILY DEAL!: a related notice only');
  },
  no_notice_text_in_repo() {
    const repo = path.join(__dirname, '..'), git = (...a) => execFileSync('git', ['-c', 'safe.directory=*', ...a], { cwd: repo, encoding: 'utf8' });
    const rel = path.relative(repo, ms.OUT).split(path.sep).join('/');
    assert.strictEqual(rel, 'server/game_data/shop_notices.json');
    assert.strictEqual(git('check-ignore', rel).trim(), rel, 'the generated notices are git-ignored');
    for (const f of ['make-shop-notices.js', 'shop-notice-pages.js', 'shop_notice_map.tsv']) {
      assert.ok(!/Follow us on Twitter|SQUARE ENIX BRIDGE \||Campaign Period/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')), f);
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
