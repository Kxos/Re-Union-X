'use strict';
// node tools/discord/test-sync-issues.js
const assert = require('assert');
const { parseIssues, group, actions, postMessage } = require('./sync-issues.js');
const md = [
  '## Open', '### Battle', '| ID | Status | Title | Detail | Proof |', '|---|---|---|---|---|',
  '| I-9 | OPEN (partly; remains: x) | **Nine** (ctx 10-11): (1) one; (2) two; (3) three | [n](a) | - |',
  '| I-8 | DONE 10-11 (rev 1) | **Eight** text | [n](a) | x |',
  '| I-7 | ON HOLD | **Seven** text | [n](a) | - |',
  '## Closed', '| ID | Area | Title | Proof |', '|---|---|---|---|',
  '| I-2 | Shop | **Two** fixed | x |',
].join('\n');
const r = parseIssues(md);
assert.deepStrictEqual([...r.values()].map((x) => `${x.id}:${x.group}:${x.area}`), ['I-9:OPEN:Battle', 'I-8:CLOSED:Battle', 'I-7:ON HOLD:Battle', 'I-2:CLOSED:Shop']);
assert.strictEqual(group('IN PROGRESS'), 'IN PROGRESS');
const d = postMessage(r.get('I-9'), 'abc').embeds[0];
assert.ok(d.description.startsWith('*ctx 10-11*\n• one\n• two\n• three'));
assert.strictEqual(d.fields[0].value, 'partly; remains: x');
// first run: closed issues get no post, oldest first
assert.deepStrictEqual(actions(r, {}).map((t) => `${t.act}:${t.r.id}`), ['post:I-7', 'post:I-9']);
// status change -> tag, same text -> keep
const h7 = actions(r, {}).find((t) => t.r.id === 'I-7').h;
const have = { 'I-7': { group: 'ON HOLD', hash: h7, name: 'I-7 · Seven' }, 'I-2': { group: 'OPEN', hash: 'x', name: 'I-2 · Two' } };
assert.deepStrictEqual(actions(r, have).map((t) => `${t.act}:${t.r.id}`), ['tag:I-2', 'post:I-9']);
console.log('test-sync-issues OK');
