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
    // user 04-11: the end-of-service weeks (from 2021-03-01) had no notice of their own: a Details row marked eos, never the
    // end-of-service notice itself
    assert.ok(!Object.values(doc.rows).some((r) => r.noticeId === mn.EOS.noticeId), 'never the end-of-service notice');
    const eos = Object.entries(doc.rows).filter(([id]) => /^WW-W-2021-0[3-6]/.test(id));
    assert.ok(eos.length === 12 && eos.every(([, r]) => r.eos && r.noticeId === null), `12 end-of-service weeks marked eos (${eos.length})`);
    const n = Object.keys(doc.rows).length;
    console.log(`  (real: ${n} census rows with a notice, ${doc.unmatched.length} without)`);
  },
  no_player_rankings() {
    // a ▽…△CLOSE△ ranking block and a bare ranking table (fixture names, not originals) are dropped by the generator
    const body = ['● Dragon Battle Event!', 'Here are some of the top players!', '▽Top 3 Players▽', 'User IDUser NameParty Name', '5101482FixtureAFixture Party',
      '190560FixtureB✨Party B✨', '△CLOSE△', '★ Defeat the dragon!', '▽ Ursus (50 Fastest Players)▽', '865 players completed the challenge!', 'Player ID Player NameParty Name',
      '4356590FixtureCParty C', '△CLOSE△', '▽Anguis▽', 'User IDUser NameParty Name', '7377FixtureDParty D', '△CLOSE△', '△PAGE TOP',
      'Here are the top 50 players!', 'User IDUser NameParty Name', '349539FixtureE Party E', '5112FixtureF13Party F', '★ Next event!', 'Last line.',
      'Follow us on Twitter for the latest news! @fixture', 'Top of Page'];
    const s = mn.scrub(body);
    assert.strictEqual(s.removed, 3, 'three ranking regions (two blocks in a row count once)');
    assert.deepStrictEqual(s.body, ['● Dragon Battle Event!', 'Here are some of the top players!', mn.OMIT_LINE, '★ Defeat the dragon!', mn.OMIT_LINE,
      'Here are the top 50 players!', mn.OMIT_LINE, '★ Next event!', 'Last line.']);
    // build() writes the scrubbed body; the page scrubs again (an older file)
    const census = { rows: [censusRow('WW-E9-1', '2019-10-07', '2019-10-13', ['Trickmaster'], { family: 'one-off event' })] };
    const doc = mn.build({ census, noticeText: { 9: noticeText('Raid!', '10/07/2019', body.join('\n')) } });
    assert.ok(!/Fixture[A-F]/.test(JSON.stringify(doc.notices)), 'no player names in the generated file');
    assert.deepStrictEqual(doc.scrubbed, [9]);
    const raw = { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } };
    const html = pages.noticePage(index(), 8100, raw, ctx());
    assert.ok(!/Fixture[A-F]|User ?ID|Follow us on Twitter|PAGE TOP|Top of Page/.test(html), 'no ranking or boilerplate on the page');
    assert.ok(html.includes(mn.OMIT_LINE));
    // the real generated file, when present: no ranking table header and no «<user id><name>» row left
    if (fs.existsSync(mn.OUT)) {
      const real = JSON.parse(fs.readFileSync(mn.OUT, 'utf8'));
      const bad = Object.entries(real.notices).flatMap(([id, n]) => (n ? n.body : []).filter((l) => mn.RANK_HEAD.test(l) || mn.looksLikeIdRow(l)).map(() => id));
      // ids only in the message: a failure must not print the names it found
      assert.deepStrictEqual([...new Set(bad)], [], `ranking rows left in raid_notices.json (${bad.length} lines)`);      console.log(`  (real: ${(real.scrubbed || []).length} notices had a player ranking removed)`);
    }
  },
  rule_note_on_every_notice() {
    // I-228 (user 06-11): the original notices print their AP costs, Bonus Time hours and opening times; every notice page says first
    // that one rule applies here to all raids (weekday original AP, weekend 0 AP and Lux x2, not original)
    // the callout (graphics, user 06-11): title + NOT ORIGINAL tag, Monday – Friday original AP (5 if free) / no Bonus Time,
    // Saturday – Sunday 0 AP / Lux doubled / Bonus Time all day, Pacific time
    const note = /<div class="rc">.*?One raid rule on this server<span class="ng">NOT ORIGINAL<\/span>.*?Monday – Friday.*?Original AP \(5 AP if it was free\).*?No Bonus Time.*?Saturday – Sunday.*?0 AP.*?Lux of raid bosses doubled.*?Bonus Time all day.*?Pacific time/;
    const body = ['★ Defeat the Trickmaster!', '・Raid quests cost 0 AP during Bonus Time (2:00 a.m. - 2:59 a.m. PT).'];
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } }, ctx());
    assert.ok(note.test(html) && html.indexOf('One raid rule on this server') < html.indexOf('Defeat the Trickmaster'), 'the note comes before the original text');
    assert.ok(html.includes('in the notice below are those of the original game.') && html.includes('<a href="/web/notices#raid-bosses">«Raid Bosses» notice ›</a>'));
    // the link opens the notice: the Notices page carries data-s="raid-bosses" and opens a #<slug> address
    const np = require('./routes-info-album').noticesPage();
    assert.ok(np.includes('data-s="raid-bosses"') && np.includes('getAttribute("data-s")===h'), 'Notices page opens #raid-bosses');
    const eos = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { eos: true } }, notices: {} }, ctx());
    assert.ok(note.test(eos), 'end-of-service weeks too');
    assert.ok(note.test(pages.detailPage(index(), 8100, ctx())), 'the Raid Catalog detail page states the rule');
    // the served files, when built: every notice page and every detail page carries the rule
    const ix = path.join(__dirname, 'game_data', 'raids.json');
    if (fs.existsSync(ix) && fs.existsSync(mn.OUT)) {
      const real = JSON.parse(fs.readFileSync(ix, 'utf8')), doc = JSON.parse(fs.readFileSync(mn.OUT, 'utf8'));
      const rows = require('./raid-calendar').catalogRows(real), c = { ...ctx(), boardItems: () => [], boardName: () => '' };
      // the Japan-only rows always have a page (task 2, 06-11)
      const missing = rows.filter((r) => r.jp || (doc.rows && doc.rows[r.censusId])).filter((r) => !note.test(pages.noticePage(real, r.evStageId, doc, c))).map((r) => r.censusId);
      assert.deepStrictEqual(missing, [], 'notice pages without the rule');
      const noDetail = rows.filter((r) => !note.test(pages.detailPage(real, r.evStageId, c) || '')).map((r) => r.censusId);
      assert.deepStrictEqual(noDetail, [], 'detail pages without the rule');
    }
  },
  jp_notice_pages() {
    // task 2 (06-11): every Japan-only row has a Details page; it gives our translation of its JP notice when one was recovered,
    // else says plainly that it was not; the facts we have (bosses by day, HP, time limit, level rewards, boards and their label)
    // and the one-AP rule note in both cases; the banner text (raid_jp_banners.json) with its Japanese line when the row has a card
    const note = /One raid rule on this server<span class="ng">NOT ORIGINAL/;
    const ix = index();
    ix.entries.push(entry('JP-RAID-4', 8202, '2015-12-18', '2015-12-25', 'Jack in the Box', { family: 'event', jp: true, region: 'JP', hp: 18000, sphereBoardIds: [3000700],
      levelDrops: [{ level: 30, items: ['5★ Test Medal'] }], reconstructed: ['jp', 'jpBoardOriginal'] }),
    entry('JP-RAID-99', 8201, '2016-05-22', '2016-05-29', 'Gummi Hound', { family: 'event', jp: true, region: 'JP', reconstructed: ['jp', 'jpNoBoard'] }));
    const doc = { rows: {}, notices: {}, jp: { 'JP-RAID-4': { noticeId: 15404, date: '2015-12-19', title: 'Raid boss!', lines: ['Fixture line one.'] } } };
    const c = ctx({ boardName: () => 'M_Santa Sora Outfit 12/18/15', boardItems: () => ['6★ Chip'] });
    const known = pages.noticePage(ix, 8202, doc, c), lost = pages.noticePage(ix, 8201, doc, c);
    assert.ok(note.test(known) && note.test(lost), 'rule note on JP pages');
    assert.ok(known.includes('Original Japanese notice (our translation)') && known.includes('Fixture line one.') && known.includes('JP notice 15404') && !/has not been recovered/.test(known));
    assert.ok(known.includes('M_Santa Sora Outfit 12/18/15') && known.includes('original Japanese boards') && known.includes('LV 30: 5★ Test Medal') && known.includes('18,000'));
    assert.ok(lost.includes('The original Japanese notice of this raid has not been recovered.') && lost.includes('none: not known') && lost.includes('No Raid Boards'));
    // the banner of JP-RAID-4: Japanese line and our translation
    assert.ok(known.includes('On the banner (our translation)') && known.includes('lang="ja"'), 'banner text');
    assert.ok(!lost.includes('On the banner'), 'no card, no banner text');
    // the detail page links to it
    assert.ok(pages.detailPage(ix, 8201, c).includes('/web/raid/notice/8201?from=raid'));
  },
  jp_banner_texts() {
    // every JP row with its own original card (reference/raid_banners_jp/jp_cards.json «exact», local list) has its banner text
    const b = require('./raid_jp_banners.json').rows;
    assert.ok(Object.keys(b).length >= 35, 'the 35 carded rows of 06-11');
    for (const [id, x] of Object.entries(b)) assert.ok(/^JP-/.test(id) && x.ja && /[぀-ヿ一-鿿]/.test(x.ja) && x.en && !/[぀-ヿ]/.test(x.en.replace(/«[^»]*»/g, '')), id);
    const list = 'D:/Progetto_Restauro_KH_UX/reference/raid_banners_jp/jp_cards.json';
    if (fs.existsSync(list)) {
      const cards = JSON.parse(fs.readFileSync(list, 'utf8'));
      const missing = (Array.isArray(cards) ? cards : cards.rows).filter((r) => r.match === 'exact' && !b[r.censusId]).map((r) => r.censusId);
      assert.deepStrictEqual(missing, [], 'carded JP rows without banner text');
    }
  },
  sections_parsed() {
    const body = ['[Updated May 21]', 'Intro line.', '● Dragon Battle Event!', '★ Defeat the dragon!', '■ Event Details', 'Plain text.', '・First', '・Second', '* A note.',
      '▽More info▽', 'Hidden text.', '△CLOSE△', '▼Sub heading', 'Text under it.'];
    const p = pages.parseNotice(body);
    assert.deepStrictEqual(p.sections.map((s) => s.head), [null, 'Dragon Battle Event!']);
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } }, ctx());
    assert.ok(/<h2[^>]*>Dragon Battle Event!<\/h2>/.test(html), '● heading as h2, marker dropped');
    assert.ok(/<h3[^>]*>Event Details<\/h3>/.test(html), '■ heading as h3');
    assert.ok(/class="tg"[^>]*>Defeat the dragon!</.test(html), '★ line as the tagline');
    assert.ok(/<ul class="nl"><li>First<\/li><li>Second<\/li><\/ul>/.test(html), '・ lines as one list');
    assert.ok(/<p class="nb">\* A note\.<\/p>/.test(html), '* notes kept with their asterisk');
    assert.ok(/<details class="fold"><summary>More info<\/summary>[\s\S]*Hidden text\.[\s\S]*<\/details>/.test(html), '▽…△CLOSE△ as a collapsed block');
    assert.ok(!/CLOSE/.test(html));
    assert.ok(/<h4[^>]*>Sub heading<\/h4>/.test(html), '▼ heading as h4');
    assert.ok(/class="upd"[^>]*>\[Updated May 21\]</.test(html), '[Updated …] line marked');
    for (const l of ['Intro line.', 'Plain text.', 'Text under it.']) assert.ok(html.includes(`<p>${l}</p>`), l);
  },
  reward_table() {
    const body = ['● Weekly Raid Event', 'Accomplished Players: Over 1,500 Players', 'Draw Ticket x 10', 'Power Gem x 30', '・Sun Gem x 5', 'Quest Key×5', 'Huey 6★ x 1, Dewey 6★ x 1,'];
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } }, ctx());
    const t = /<table class="rw">([\s\S]*?)<\/table>/.exec(html);
    assert.ok(t, 'a reward table');
    assert.ok(t[1].includes('<th>Item</th><th>Quantity</th>'));
    for (const [n, q] of [['Draw Ticket', '10'], ['Power Gem', '30'], ['Sun Gem', '5'], ['Quest Key', '5']]) assert.ok(t[1].includes(`<tr><td>${n}</td><td class="q">× ${q}</td></tr>`), n);
    assert.ok(html.includes('<p>Accomplished Players: Over 1,500 Players</p>') && html.includes('<p>Huey 6★ x 1, Dewey 6★ x 1,</p>'), 'other lines unchanged');
  },
  period_table() {
    const body = ['● Weekly Raid Event', '■ Event Period', 'May. 11, 2020 12:00 p.m. to May. 17, 2020 11:59 p.m. (PT)', 'May. 11, 2020 19:00 to May. 18, 2020 6:59 (UTC)',
      '■ Raid Boss Bonus Time', 'Pacific Time', 'UTC', '2:00 a.m. - 2:59 a.m.', '8:00 a.m. - 8:59 a.m.', '9:00 - 9:59', '15:00 - 15:59', 'After.'];
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } }, ctx());
    assert.ok(html.includes('<table class="kv pd"><tr><th>Pacific Time</th><td>May. 11, 2020 12:00 p.m. to May. 17, 2020 11:59 p.m.</td></tr><tr><th>UTC</th><td>May. 11, 2020 19:00 to May. 18, 2020 6:59</td></tr></table>'), 'PT / UTC period');
    assert.ok(html.includes('<table class="bt"><tr><th>Pacific Time</th><th>UTC</th></tr><tr><td>2:00 a.m. - 2:59 a.m.</td><td>9:00 - 9:59</td></tr><tr><td>8:00 a.m. - 8:59 a.m.</td><td>15:00 - 15:59</td></tr></table>'), 'bonus hours paired');
    assert.ok(html.includes('<p>After.</p>'));
    // the 2016-2018 form «2:00 a.m. to 3:00 a.m.», with the daylight-saving caption and «→»
    const old = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07',
      body: ['Pacific Time', 'UTC', '(Before → After)', '2:00 a.m. to 3:00 a.m.', '10:00 to 11:00　→　9:00 to 10:00'] } } }, ctx());
    assert.ok(old.includes('<p class="nb">(Before → After)</p><table class="bt">') && old.includes('<tr><td>2:00 a.m. to 3:00 a.m.</td><td>10:00 to 11:00　→　9:00 to 10:00</td></tr>'));
  },
  multi_event_raid_first() {
    const body = ['● Dragon Battle Event!', 'Dragon text.', '● Weekly Raid Event', '★ Fight the Raid Boss!', 'Raid text.', '● Union Cross', 'Cross text.'];
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body } } }, ctx());
    const at = (s) => html.indexOf(s);
    // user 04-11: only the raid part of a notice that covers several events (the other parts go to their own catalogs later)
    assert.ok(at('Raid text.') > 0 && at('Dragon text.') < 0 && at('Cross text.') < 0 && !/class="oth"/.test(html), 'only the raid section');
    assert.ok(!/<details[^>]*>\s*<summary>[^<]*Weekly Raid Event/.test(html), 'the raid section is open');
    // the Union Cross Radiant Rewards section of a 2021 notice is not the raid's (user 04-11, notice of 2021-01-01)
    const ux = pages.parseNotice(['● New Year Raid Event', 'r', '● New Year Union Cross Radiant Rewards', 'u', '● Radiant Rewards Board', 'b']);
    assert.deepStrictEqual(ux.sections.map((s) => s.raid), [true, false, true]);
    // the boss named in a heading also marks the raid section; one section only: no folding
    const boss = pages.parseNotice(['● News', 'a', '● Trickmaster appears!', 'b'], ['Trickmaster']);
    assert.deepStrictEqual(boss.sections.map((s) => s.raid), [false, true]);
    // «● Raid Boss Bonus Time» (a sub-heading) and «● 2:00 p.m. - …» hour lines do not open an event: nothing folded
    const sub = pages.parseNotice(['●Get Avatar Accessories!', 'a', '● Raid Boss Bonus Time', '●  2:00 a.m. - 2:59 a.m. (PT) / 9:00 - 9:59 (UTC)']);
    assert.deepStrictEqual(sub.sections.map((s) => s.head), ['Get Avatar Accessories!']);
    const subHtml = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07',
      body: ['●Get Avatar Accessories!', 'a', '● Raid Boss Bonus Time', '●  2:00 a.m. - 2:59 a.m. (PT) / 9:00 - 9:59 (UTC)'] } } }, ctx());
    assert.ok(!/class="oth"/.test(subHtml) && subHtml.includes('<h3>Raid Boss Bonus Time</h3>') && subHtml.includes('<li>2:00 a.m. - 2:59 a.m. (PT) / 9:00 - 9:59 (UTC)</li>'));
    // no heading names it: the event whose text speaks of raids most
    const text = pages.parseNotice(['● News', 'a raid line', '● May Campaign!', 'Raid event!', '■ Raid Boss Bonus Time', '● Other']);
    assert.deepStrictEqual(text.sections.map((s) => s.raid), [false, true, false]);
    const one = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: 9 } }, notices: { 9: { title: 'Raid', date: '2019-10-07', body: ['★ Monthly Raid Event!', 'x'] } } }, ctx());
    assert.ok(!/class="oth"/.test(one));
    // the «On this server» box last, with the player-facing labels, not the builder notes
    assert.ok(at('On this server') > at('Raid text.'));
    assert.ok(html.includes('ATK') && !html.includes('No ATK of a raid is known'), 'labels, not the reasons of raids.json');
  },
  escapes() {
    const doc = { rows: { 'WW-W-2019-10-07': { noticeId: 9, how: 'census catalogue', confidence: 'high' } },
      notices: { 9: { title: 'Raid <script>alert(1)</script>', date: '2019-10-07', time: '07:00', category: 'EVENT',
        body: ['■ Period & "time"', '・<img src=x onerror=alert(2)>', 'Plain <b>line</b>', '<i>Gem</i> x 3', '▽<u>t</u>▽', 'x', '△CLOSE△', '● <s>Raid</s>'] } } };
    const html = pages.noticePage(index(), 8100, doc, ctx());
    assert.ok(!/<script>alert|<img src=x|<b>line|<i>Gem|<u>t|<s>Raid/.test(html), 'nothing from the notice is markup');
    assert.ok(html.includes('Raid &lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('Period &amp; &quot;time&quot;') && html.includes('&lt;i&gt;Gem&lt;/i&gt;'));
    assert.ok(html.includes('/web/raid/img/v2/8100.png'), 'event card at the top');
    assert.ok(/On this server/.test(html) && html.includes('/web/raid/raid/8100'), 'our box with a link to the raid');
    assert.ok(html.includes('Oct 7, 2019'), 'original date');
    // from the raid details page: BACK bar
    assert.ok(pages.noticePage(index(), 8100, doc, ctx({ from: 'raid' })).includes('class="back"'));
  },
  real_pages_render() {
    // every census row with a notice renders a full page (no fallback), when the generated file and the index exist
    const ixFile = path.join(__dirname, 'game_data', 'raids.json');
    if (!fs.existsSync(mn.OUT) || !fs.existsSync(ixFile)) { console.log('  (skipped: no generated files)'); return; }
    const real = JSON.parse(fs.readFileSync(mn.OUT, 'utf8')), ix = JSON.parse(fs.readFileSync(ixFile, 'utf8'));
    const ids = [...new Set(ix.entries.filter((e) => real.rows[e.censusId]).map((e) => e.evStageId))];
    const bad = ids.filter((id) => /Notice not available/.test(pages.noticePage(ix, id, real, ctx())));
    assert.deepStrictEqual(bad, []);
    console.log(`  (real: ${ids.length} notice pages render)`);
  },
  details_page_links_notice() {
    const html = pages.detailPage(index(), 8100, ctx({ hasNotice: (id) => id === 'WW-W-2019-10-07' }));
    assert.ok(html.includes('/web/raid/notice/8100?from=raid'));
    assert.ok(!pages.detailPage(index(), 8101, ctx({ hasNotice: (id) => id === 'WW-W-2019-10-07' })).includes('/web/raid/notice/'), 'no notice: no link');
  },
  eos_week_page() {
    const html = pages.noticePage(index(), 8100, { rows: { 'WW-W-2019-10-07': { noticeId: null, eos: true } }, notices: {} }, ctx());
    assert.ok(/No notice for this week/.test(html) && /end of service/.test(html) && /<img class="banner"/.test(html) && /On this server/.test(html), 'end-of-service page');
    assert.ok(!/Notice not available/.test(html));
  },
  missing_notice() {
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
