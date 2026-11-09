// node tools/discord/test-sync-notices.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseNotices, chunk, noticeMessages, plan, decide } = require('./sync-notices');

const md = '# In-game Notices\n\n## Contents\n\n- [B](#b)\n\n## B\n\n**IMPORTANT** · 11/10\n\nNew text.\n\n### Sub\n\nMore.\n\n'
  + '## A\n\n**INFORMATION** · 10/01\n\nOld text.\n';
const ns = parseNotices(md);
assert.deepStrictEqual(ns.map((n) => [n.title, n.kind, n.date]), [['B', 'IMPORTANT', '11/10'], ['A', 'INFORMATION', '10/01']]);
assert.ok(ns[0].body.includes('**Sub**') && !ns[0].body.includes('###'));

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
assert.strictEqual(msgs[0].embeds[0].title, 'T');

// channel order is oldest first; decide() keeps sync for appended notices, rebuilds on reorder or count change
const want = plan(ns);
assert.deepStrictEqual(want.map((w) => w.title), ['A', 'B']);
const st = (ts) => ts.map((t) => ({ title: t, hash: 'h', ids: ['1'] }));
assert.strictEqual(decide(want, []), 'sync');
assert.strictEqual(decide(want, st(['A'])), 'sync');
assert.strictEqual(decide(want, st(['A', 'B'])), 'sync');
assert.strictEqual(decide(want, st(['B', 'A'])), 'rebuild');
assert.strictEqual(decide(want, st(['B'])), 'rebuild');            // new notice A would land above B
assert.strictEqual(decide(want, [{ title: 'A', hash: 'h', ids: ['1', '2'] }]), 'rebuild');

// the real NOTICES.md fits Discord
const real = plan(parseNotices(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'NOTICES.md'), 'utf8')));
assert.ok(real.length >= 20);
for (const w of real) for (const m of w.messages) assert.ok(m.embeds.every((e) => e.description.length <= 4096));
console.log('test-sync-notices: OK');
