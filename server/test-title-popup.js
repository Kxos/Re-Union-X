// Titles earned in a quest (I-220): /stage/clear lists in userTitles only the titles that this clear grants, because the
// client opens one «new title» popup per entry; the userTitleId is the one of GET /user/title.
//   node server/test-title-popup.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-title-popup-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const stages = t.masterRows('stage');
const play = (stageId, clearMissionIds) => {
  call(t.respondStageStart, { stageId, userKeybladeId: 0 });
  return call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds, getPoint: { lux: 10 } });
};
const ids = (clear) => clear.userTitles.map((x) => x.titleId).join();

// title of the first completion (validClearGetTitle)
const withTitle = stages.find((r) => r.validClearGetTitle && r.clearGetTitle);
const firstClear = play(withTitle.stageId, []);
check(ids(firstClear) === String(withTitle.clearGetTitle), `first clear of ${withTitle.stageId}: userTitles ${ids(firstClear)}, expected ${withTitle.clearGetTitle}`);
check((p.titles || []).includes(withTitle.clearGetTitle), 'the completion title is saved');
check(ids(play(withTitle.stageId, [])) === '', 'second clear: no popup');

// title of an objective, in a stage whose objective 2 gives one
const objective = stages.find((r) => r.submissionRewardType?.[1] === 7 && !r.validClearGetTitle);
const title = objective.submissionItemId[1];
check(ids(play(objective.stageId, [1])) === '', 'objective without a title: no popup');
const clear = play(objective.stageId, [2]);
check(ids(clear) === String(title), `objective title: userTitles ${ids(clear)}, expected ${title}`);
const listed = t.userTitlesData().find((x) => x.titleId === title);
check(listed && clear.userTitles[0]?.userTitleId === listed.userTitleId, 'same userTitleId as GET /user/title');
check(ids(play(objective.stageId, [2])) === '', 'objective already done: no popup');

try { fs.unlinkSync(SAVE); } catch { /* gone */ }
if (errors.length) { console.error('test-title-popup: FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('test-title-popup: OK');
