// Original notices behind the Details button of the raid banners: node server/test-raid-notices.js
// make-raid-notices.js (parse, match census rows to notices) and raid-pages.js noticePage. Fixtures only, except
// `weekly_mapping_real`, which reads the private sources when they exist and skips otherwise.
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const mn = require('./make-raid-notices');
const pages = require('./raid-pages');

// a notice as notice_text.json keeps it (the SQUARE ENIX BRIDGE page as plain text); fixture text, not an original
const noticeText = (title, date, body) => `${title} | KINGDOM HEARTS Union χ | SQUARE ENIX BRIDGE\n    This site requires javascript. please enable javascript in your browser.\n`
  + `                Information\n                ${title}\n                  ${date} 07:00:00 (UTC)\n                EVENT\n                KINGDOM HEARTS Union χ\n${body}\n              Top of Page`;
const censusRow = (id, start, end, bosses, extra = {}) => ({ id, family: 'weekly', region: 'WW', start, end, bosses, tier: 'single', ...extra });

const PERIODS = [{ n: 1, name: 'Launch', from: '2016-04-07', to: '2021-05-31' }];
const entry = (censusId, evStageId, start, end, boss, extra = {}) => ({ key: `${censusId}/single`, censusId, family: 'weekly', start, end, tier: 'single', boss, available: true,
  why: null, stageId: 980000 + evStageId, evStageId, level: 25, hp: 1000, upMinutes: 20, useAp: 10, questAp: [10], boards: [], sphereBoardIds: [], reconstructed: [], ...extra });
const index = () => ({ reasons: { atk: 'No ATK of a raid is known after 2016: ours.', hp: 'HP from the tier tables.' }, entries: [
  entry('WW-W-2019-10-07', 8100, '2019-10-07', '2019-10-13', 'Trickmaster', { reconstructed: ['atk', 'hp'] }),
  entry('WW-W-2019-10-14', 8101, '2019-10-14', '2019-10-20', 'Darkside') ] });
const ctx = (extra = {}) => ({ shopFrom: '2019-10-17', shopTo: '2019-10-23', current: new Set(['WW-W-2019-10-14']), kept: null, periods: PERIODS, imgVersion: 2, ...extra });

const tests = {
  parse_notice() {
    const n = mn.parseNotice(noticeText('Weekly Raid Event! (10/7)', '10/07/2019', '★ Defeat the Trickmaster!\n■ Event Period:\nOct. 7, 2019 12:00 p.m. to Oct. 13, 2019 (PT)\n\n・One\n・Two'));
    assert.deepStrictEqual([n.title, n.date, n.time, n.category], ['Weekly Raid Event! (10/7)', '2019-10-07', '07:00', 'EVENT']);
    assert.deepStrictEqual(n.body, ['★ Defeat the Trickmaster!', '■ Event Period:', 'Oct. 7, 2019 12:00 p.m. to Oct. 13, 2019 (PT)', '・One', '・Two']);
    assert.strictEqual(mn.parseNotice('no date here'), null);
  },
  weekly_mapping() {
    // a weekly row with a catalogue reference (E<notice>-<n>), one found by date and title, one with nothing, an event row
    const census = { rows: [
      censusRow('WW-W-2019-10-07', '2019-10-07', '2019-10-13', ['Trickmaster'], { catalog: 'E500-1' }),
      censusRow('WW-W-2019-10-14', '2019-10-14', '2019-10-20', ['Darkside Ω']),
      censusRow('WW-W-2019-10-21', '2019-10-21', '2019-10-27', ['Hocus Pocus']),
      censusRow('WW-E700-1', '2017-01-01', '2017-01-07', ['Queen Bee'], { family: 'one-off event' }),
      censusRow('S-1', null, null, []) ] };
    const text = {
      500: noticeText('Weekly Raid Event! (10/7)', '10/07/2019', 'Defeat the Trickmaster!\nOct. 7, 2019 12:00 p.m. to Oct. 13, 2019 11:59 p.m. (PT)'),
      501: noticeText('Weekly Raid Event! (10/14)', '10/14/2019', 'Defeat the Darkside Ω!\nOct. 14, 2019 12:00 p.m. to Oct. 20, 2019 11:59 p.m. (PT)'),
      502: noticeText('Draw Deal!', '10/14/2019', 'A Darkside Ω medal!'),
      700: noticeText('Queen Bee Raid Event!', '01/01/2017', 'Defeat the Queen Bee!'),
    };
    const doc = mn.build({ census, noticeText: text });
    assert.deepStrictEqual(Object.keys(doc.rows).sort(), ['WW-E700-1', 'WW-W-2019-10-07', 'WW-W-2019-10-14']);
    assert.deepStrictEqual([doc.rows['WW-W-2019-10-07'].noticeId, doc.rows['WW-W-2019-10-07'].how, doc.rows['WW-W-2019-10-07'].confidence], [500, 'census catalogue', 'high']);
    assert.deepStrictEqual([doc.rows['WW-W-2019-10-14'].noticeId, doc.rows['WW-W-2019-10-14'].how, doc.rows['WW-W-2019-10-14'].confidence], [501, 'date and title', 'high']);
    assert.deepStrictEqual([doc.rows['WW-E700-1'].noticeId, doc.rows['WW-E700-1'].how], [700, 'census id']);
    assert.deepStrictEqual(doc.unmatched, ['WW-W-2019-10-21']);
    assert.deepStrictEqual(Object.keys(doc.notices).sort(), ['500', '501', '700'], 'only the notices in use');
    assert.strictEqual(doc.notices[500].title, 'Weekly Raid Event! (10/7)');
  },
  weekly_mapping_real() {
    const src = process.env.KHUX_RAID_SRC || require('./make-raid').DEFAULT_SRC;
    let doc;
    try { doc = mn.buildFrom(src); } catch (e) { console.log(`  (skipped: private sources not readable, ${e.code || e.message})`); return; }
    // September 2018: the first Weekly Raid Event & Radiant Rewards notice (also in the event-card agent's notices_all.json)
    assert.deepStrictEqual([doc.rows['WW-W-2018-09-03'].noticeId, doc.rows['WW-W-2018-09-03'].confidence], [44001, 'high']);
    assert.strictEqual(doc.rows['WW-W-2018-10-15'].noticeId, 45652);
    assert.strictEqual(doc.rows['WW-E17890-1'].noticeId, 17890);
    const n = Object.keys(doc.rows).length;
    console.log(`  (real: ${n} census rows with a notice, ${doc.unmatched.length} without)`);
  },
  notice_page_escapes() {
    const doc = { rows: { 'WW-W-2019-10-07': { noticeId: 9, how: 'census catalogue', confidence: 'high' } },
      notices: { 9: { title: 'Raid <script>alert(1)</script>', date: '2019-10-07', time: '07:00', category: 'EVENT', body: ['■ Period & "time"', '・<img src=x onerror=alert(2)>', 'Plain line'] } } };
    const ix = index();
    ix.reasons.atk = 'Ours <b>bold</b>';
    const html = pages.noticePage(ix, 8100, doc, ctx());
    assert.ok(!/<script>alert|<img src=x|<b>bold/.test(html), 'nothing from the notice or the reasons is markup');
    assert.ok(html.includes('Raid &lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('■ Period &amp; &quot;time&quot;') && html.includes('Ours &lt;b&gt;bold&lt;/b&gt;'));
    assert.ok(html.includes('/web/raid/img/v2/8100.png'), 'event card at the top');
    assert.ok(/On this server/.test(html) && html.includes('/web/raid/raid/8100'), 'our box with a link to the raid');
    assert.ok(/Oct 7, 2019/.test(html) || /2019/.test(html), 'original date');
    assert.ok(/class="li"/.test(html) && /class="sec"/.test(html), 'the ■ headings and ・ lists are styled');
    // from the raid details page: BACK bar
    assert.ok(pages.noticePage(ix, 8100, doc, ctx({ from: 'raid' })).includes('class="back"'));
  },
  details_page_links_notice() {
    const html = pages.detailPage(index(), 8100, ctx({ hasNotice: (id) => id === 'WW-W-2019-10-07' }));
    assert.ok(html.includes('/web/raid/notice/8100?from=raid'));
    assert.ok(!pages.detailPage(index(), 8101, ctx({ hasNotice: (id) => id === 'WW-W-2019-10-07' })).includes('/web/raid/notice/'), 'no notice: no link');
  },
  missing_notice_page() {
    for (const [doc, id] of [[null, 8100], [{ rows: {}, notices: {} }, 8100], [{ rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: {} }, 8100], [{ rows: {}, notices: {} }, 1234], [undefined, 'x']]) {
      const html = pages.noticePage(index(), id, doc, ctx());
      assert.ok(typeof html === 'string' && /notice (is )?not available/i.test(html), `friendly page for ${id}`);
    }
  },
  no_notice_text_in_repo() {
    const repo = path.join(__dirname, '..'), git = (...a) => execFileSync('git', ['-c', 'safe.directory=*', ...a], { cwd: repo, encoding: 'utf8' });
    const rel = path.relative(repo, mn.OUT).split(path.sep).join('/');
    assert.strictEqual(rel, 'server/game_data/raid_notices.json');
    assert.strictEqual(git('check-ignore', rel).trim(), rel, 'the generated notices are git-ignored');
    assert.strictEqual(git('ls-files', 'server/game_data').trim(), '', 'nothing of game_data is versioned');
    // no notice text in the versioned sources of the generator and the pages (a sentence of every real notice would show)
    for (const f of ['make-raid-notices.js', 'raid-pages.js']) assert.ok(!/Follow us on Twitter|SQUARE ENIX BRIDGE \|/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')), f);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
