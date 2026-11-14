// Tables of the original notices (notice-tables.js, catalog-pages.js noticeBlocks): node server/test-notice-tables.js
'use strict';
const assert = require('assert');
const nt = require('./notice-tables');
const { noticeBlocks } = require('./catalog-pages');

const cell = (t, h) => (h ? { t: [t], h: 1 } : { t: [t] });
const T = [[cell('Rarity', 1), cell('Medal', 1)], [cell('SUPER RARE'), cell('SP Roxas')], [cell('RARE'), cell('Cinderella')]];
const tests = {
  // the cells one per line become one table line, the text around stays
  table_replaces_its_cells() {
    const r = nt.applyTables(['Intro', 'Rarity', 'Medal', 'SUPER RARE', 'SP Roxas', 'RARE', 'Cinderella', 'After'], [T]);
    assert.strictEqual(r.placed, 1); assert.strictEqual(r.body.length, 3);
    assert.deepStrictEqual([r.body[0], r.body[2]], ['Intro', 'After']); assert.ok(nt.isTable(r.body[1]));
    assert.deepStrictEqual(nt.tableOf(r.body[1]), T);
  },
  // a row on one line with tabs (some pages) matches on whole lines
  tab_rows_match() {
    const r = nt.applyTables(['Rarity\t\tMedal', 'SUPER RARE\tSP Roxas', 'RARE\t\t\tCinderella'], [T]);
    assert.strictEqual(r.placed, 1); assert.strictEqual(r.body.length, 1);
  },
  // cells not all in the text (a ranking the scrub removed, a later update): nothing changes
  missing_cells_leave_the_text() {
    const body = ['Rarity', 'Medal', 'SUPER RARE', 'SP Roxas'];
    const r = nt.applyTables(body, [T]);
    assert.strictEqual(r.placed, 0); assert.strictEqual(r.missed, 1); assert.deepStrictEqual(r.body, body);
  },
  // a match must end on a whole line: «Cinderella and friends» is not the cell «Cinderella»
  partial_line_not_matched() {
    const r = nt.applyTables(['Rarity', 'Medal', 'SUPER RARE', 'SP Roxas', 'RARE\tCinderella\tmore'], [T]);
    assert.strictEqual(r.placed, 0);
  },
  // the page draws a game table: header cells, spans, escaped text
  drawn_as_table() {
    const t = [[{ t: ['A<b>'], h: 1, cs: 2 }], [{ t: ['x', 'y'], rs: 2 }, { t: ['z'] }]];
    const h = noticeBlocks(['Before', nt.MARK + JSON.stringify(t)]);
    assert.ok(/<table class="ntb">/.test(h) && /<th colspan="2">A&lt;b&gt;<\/th>/.test(h) && /<td rowspan="2">x<br>y<\/td>/.test(h), h);
    assert.ok(!h.includes(nt.MARK));
  },
};
let failed = 0;
for (const [n, f] of Object.entries(tests)) { try { f(); console.log('ok', n); } catch (e) { failed++; console.log('FAIL', n, e.message); } }
console.log(failed ? `${failed} failed` : 'test-notice-tables: OK');
process.exit(failed ? 1 : 0);
