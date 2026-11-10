// node tools/discord/test-sync-notices.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseNotices, sections, chunk, noticeMessages, plan, actions } = require('./sync-notices');

const md = '# In-game Notices\n\n## Contents\n\n- [B](#b)\n\n## B\n\n**IMPORTANT** · 11/10\n\nNew text.\n\n### Sub\n\nMore.\n\n'
  + '## A\n\n**INFORMATION** · 10/01\n\nOld text.\n';
const ns = parseNotices(md);
assert.deepStrictEqual(ns.map((n) => [n.title, n.kind, n.date]), [['B', 'IMPORTANT', '11/10'], ['A', 'INFORMATION', '10/01']]);

// sub-sections become separate blocks with their heading as title
assert.deepStrictEqual(sections(ns[0].body), [{ heading: '', text: 'New text.' }, { heading: 'Sub', text: 'More.' }]);
const b = noticeMessages(ns[0]);
assert.strictEqual(b.length, 1);
assert.deepStrictEqual(b[0].embeds.map((e) => e.title), ['B', 'Sub']);
assert.strictEqual(b[0].embeds[0].author.name, 'IMPORTANT · 11/10');
assert.ok(b[0].embeds.every((e) => !e.description.includes('###')));
// the website link is also at the end of the post (phones open it scrolled to the bottom)
assert.ok(b[0].embeds[1].description.endsWith('**[Read this notice on the website](https://re-union-x.github.io/Re-Union-X/notices/#b)**'));
assert.ok(!b[0].embeds[0].description.includes('Read this notice'));
assert.strictEqual(b[0].content, 'New text.');
assert.strictEqual(noticeMessages({ title: 'Story Quests 526-979', kind: 'IMPORTANT', date: '1/1', body: 'x' })[0].embeds[0].url,
  'https://re-union-x.github.io/Re-Union-X/notices/#story-quests-526-979');

// every real notice link matches a data-s slug of the published portal page
const page = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'notices', 'index.html'), 'utf8');
for (const n of parseNotices(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'NOTICES.md'), 'utf8'))) {
  const s = noticeMessages(n)[0].embeds[0].url.split('#')[1];
  assert.ok(page.includes(`data-s="${s}"`), 'portal has no notice ' + s);
}

// chunks respect the limit and keep every character of the paragraphs
const long = Array.from({ length: 50 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(300)).join('\n\n');
const parts = chunk(long, 3900);
assert.ok(parts.every((p) => p.length <= 3900));
assert.strictEqual(parts.join('\n\n'), long);

// a long notice becomes several messages, each within Discord limits
const msgs = noticeMessages({ title: 'T', kind: 'IMPORTANT', date: '11/10', body: long });
for (const m of msgs) {
  assert.ok(m.embeds.length <= 10);
  assert.ok(m.embeds.reduce((a, e) => a + (e.title || '').length + e.description.length + (e.footer ? e.footer.text.length : 0) + (e.author ? e.author.name.length : 0), 0) <= 6000);
  assert.deepStrictEqual(m.allowed_mentions, { parse: [] });
}

// posts are created oldest first; actions per notice
const want = plan(ns);
assert.deepStrictEqual(want.map((w) => w.title), ['A', 'B']);
const st = (t, h) => ({ title: t, hash: h, thread: '9', ids: ['1'] });
assert.deepStrictEqual(actions(want, []).map((x) => x.act), ['post', 'post']);
assert.deepStrictEqual(actions(want, [st('A', want[0].hash), st('B', 'old')]).map((x) => x.act), ['keep', 'edit']);
assert.deepStrictEqual(actions(want, [st('A', want[0].hash), st('C', 'x')]).map((x) => x.act), ['keep', 'post', 'gone']);

// the real NOTICES.md fits Discord
const real = plan(parseNotices(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'NOTICES.md'), 'utf8')));
assert.ok(real.length >= 20);
for (const w of real) {
  assert.ok(w.title.length <= 100);
  for (const m of w.messages) assert.ok(m.embeds.length <= 10 && m.embeds.every((e) => e.description.length <= 4096 && (e.title || '').length <= 256));
}
console.log('test-sync-notices: OK');

// bump reply: only when the notice's date changes, never for an entry without a recorded date
{
  const { bumped, bumpMessage } = require('./sync-notices.js');
  const assert2 = require('assert');
  assert2.strictEqual(bumped({ date: '10/16' }, { date: '11/10' }), true);
  assert2.strictEqual(bumped({ date: '11/10' }, { date: '11/10' }), false);
  assert2.strictEqual(bumped({}, { date: '11/10' }), false);
  const m = bumpMessage({ title: 'Raid Bosses', date: '11/10' });
  assert2.ok(m.content.includes('11/10') && m.content.includes('#raid-bosses'));
  console.log('bump OK');
}
