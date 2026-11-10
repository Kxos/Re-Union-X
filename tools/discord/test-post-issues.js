'use strict';
// node tools/discord/test-post-issues.js
const assert = require('assert');
const { diff, messages } = require('./post-issues.js');
const before = '| I-2 | OPEN | **Old one** (a) | x | - |\n| I-3 | OPEN | **Gone** | x | - |\n| I-4 | OPEN | **Same** | x | - |\n';
const after = '| I-5 | OPEN | **Brand new [link](u)** | x | - |\n| I-2 | DONE 10-11 | **Old one** (a) | x | abc |\n| I-4 | OPEN | **Same** more | x | - |\n';
const c = diff(before, after);
assert.deepStrictEqual(c.map((x) => `${x.kind}:${x.row.id}`), ['new:I-5', 'edit:I-4', 'removed:I-3', 'status:I-2']);
assert.strictEqual(c[0].row.title, 'Brand new link');
const m = messages(c, 'abcdef1234');
assert.strictEqual(m.length, 1);
assert.strictEqual(m[0].embeds[0].fields.length, 4);
assert.strictEqual(m[0].embeds[0].fields[3].name, '🔄 I-2 · OPEN → DONE 10-11');
assert.ok(!m[0].embeds[0].fields[2].value.includes('[open]'));
assert.strictEqual(messages(Array(45).fill(c[0]), 'abcdef1').length, 3);
console.log('test-post-issues OK');
