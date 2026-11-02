// Campaign Boost Medals (make-campaign-medals.js): node server/test-campaign-medals.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const cm = require('./make-campaign-medals');
const guilt = require('./medal-guilt');

const chip = { medalId: 90056, imageId: 90056, thumbId: 90056, cutinId: 90056, name: 'Chip', rare: 6, type: 4, cost: 999, minCost: 999,
  enhanceAttack: 150, enhanceDefense: 0, groupId: 0, sortId: 237, listSortId: 237 };

const tests = {
  sora_moogle_b_row() {
    const [r] = cm.campaignRows([chip]);
    assert.strictEqual(r.medalId, 302016);
    assert.strictEqual(r.name, 'Sora & Moogle B');
    assert.deepStrictEqual([r.rare, r.type, r.enhanceAttack, r.enhanceDefense, r.cost, r.minCost], [6, 4, 100, 100, 999, 999]);
    assert.deepStrictEqual([r.imageId, r.thumbId, r.sortId, r.listSortId, r.cutinId], [302016, 302016, 1879, 1879, 90056]);
    assert.strictEqual(r.groupId, 0, 'not a copy of another medal: raid boards match it by name');
  },
  boost_on_level_up() {
    const [r] = cm.campaignRows([chip]);
    const base = { medalId: 1, type: 1, validBurst: 0, addMaxAttack: 1000, addMaxDefense: 1000, guiltValue: 0 };
    const { state } = guilt.applyEnhance(base, { attackUpperNumber: 950 }, [{ row: r }], { guiltProb: [] });
    assert.deepStrictEqual([state.attackUpperNumber, state.defenseUpperNumber], [1000, 100], '+100 STR and DEF up to the cap');
  },
  patch_is_idempotent() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-'));
    fs.writeFileSync(path.join(dir, 'medal.json'), JSON.stringify([chip]));
    const log = console.log; console.log = () => {};
    try { assert.strictEqual(cm.patch(dir), 1); assert.strictEqual(cm.patch(dir), 0); } finally { console.log = log; }
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'medal.json'), 'utf8'));
    assert.deepStrictEqual(rows.map((x) => x.medalId), [90056, 302016]);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  missing_template_throws() {
    assert.throws(() => cm.campaignRows([]), /90056/);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(failed ? `${failed} of ${Object.keys(tests).length} failed` : `all ${Object.keys(tests).length} passed`);
process.exitCode = failed ? 1 : 0;
