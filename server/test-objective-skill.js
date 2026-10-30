// Objective rewards with an assigned skill (round 18, VIP! Skill): a stage row whose objective reward is a medal with
// submissionSkillId / submissionSkillLv gives the medal WITH that skill (player.medalSkills, userSkillId of
// player.nextUserSkillId, exp = threshold of the level), as the Shop's «medal with a skill» bonus (giveSkill).
// Part 1 on a synthetic row (any master); part 2 clears a real VIP! Skill week stage when the regenerated master has it.
//   node server/test-objective-skill.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-objective-skill-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_SERVER_TIME;
delete process.env.KHUX_VIP;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const server = quiet(() => require('./server'));
const { _test: t } = server;
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
const p = t.player;
const medalsLen = () => (p.medals || []).length;
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const skills = new Map(t.masterRows('skill').map((r) => [r.skillId, r]));
const SCROOGE6 = 90126, MOOGLE6 = 90016;

// 1. synthetic stage row: objective 1 Scrooge 6★ with skill 1209 LV 20, objective 2 Moogle 6★ (no skill),
// objective 3 Scrooge 6★ with skill 1157 and no level (-> maxLv)
if (!skills.has(1209) || !skills.has(1157)) errors.push('master skill table without 1209 / 1157 (old master?)');
else {
  const row = { stageId: 999999, submissionRewardType: [3, 3, 3], submissionItemId: [SCROOGE6, MOOGLE6, SCROOGE6], submissionItemNum: [1, 1, 1],
    submissionSkillType: [1, 0, 1], submissionSkillId: [1209, 0, 1157], submissionSkillLv: [20, 0, 0] };
  const before = medalsLen(), nextBefore = p.nextUserSkillId || 0;
  quiet(() => { for (const n of [1, 2, 3]) t.grantObjectiveReward(row, n); });
  const got = p.medals.slice(before);
  check(got.map((m) => m.medalId).join() === `${SCROOGE6},${MOOGLE6},${SCROOGE6}`, `medals granted: ${got.map((m) => m.medalId)}`);
  const sk = got.map((m) => p.medalSkills?.[m.userMedalId]);
  check(sk[0] && sk[0].skillId === 1209 && sk[0].level === 20 && sk[0].userSkillId === nextBefore + 1, `objective 1: skill ${JSON.stringify(sk[0])}`);
  check(sk[1] === undefined, 'objective 2 (no skill): no saved skill');
  check(sk[2] && sk[2].skillId === 1157 && sk[2].level === skills.get(1157).maxLv, `objective 3: skill at maxLv ${JSON.stringify(sk[2])}`);
  check(sk[0] && sk[0].exp > 0 && sk[0].exp === sk[2].exp, `exp = threshold of LV 20 (${sk[0]?.exp} / ${sk[2]?.exp})`);
  // the client sees the skill: userSkills element + userMedal.userSkills id
  const us = t.userSkillsData(Date.now());
  check(us.some((s) => s.userSkillId === sk[0]?.userSkillId && s.skillId === 1209 && s.level === 20 && s.userMedalId === got[0].userMedalId), 'userSkills lists the new skill');
  const el = t.userMedalList().find((m) => m.userMedalId === got[0].userMedalId);
  check(el && t.userMedalElement(el).userSkills.includes(sk[0]?.userSkillId), 'userMedal.userSkills carries the skill id');
  // a skill id missing from the skill table: the medal still comes, no skill saved (logged)
  const b2 = medalsLen();
  quiet(() => t.grantObjectiveReward({ ...row, submissionSkillId: [99999, 0, 0] }, 1));
  check(p.medals.length === b2 + 1 && p.medalSkills[p.medals[b2].userMedalId] === undefined, 'unknown skill: medal without a saved skill');
  // a skill on a reward that is not a medal: nothing but the item
  const j = p.freeStone || 0;
  quiet(() => t.grantObjectiveReward({ ...row, submissionRewardType: [2, 0, 0], submissionItemId: [0, 0, 0], submissionItemNum: [100, 0, 0] }, 1));
  check((p.freeStone || 0) === j + 100, 'jewel objective with a stray skill id: jewels only');
}

// 2. real VIP! Skill week (after regeneration): /stage/start + /stage/clear of the week 2020-09-07 stage gives the
// Scrooge 6★ with ATK B X Max & Lux++ at LV 20
const idx = (() => { try { return t.specialIndex(); } catch { return null; } })();
const week = idx && (idx.entries || []).find((e) => e.key === 'vip-skill@2020-09-07');
if (!week) log('test-objective-skill: part 2 skipped (master without the VIP! Skill week versions: regenerate)');
else {
  const sid = week.stageIds[0];
  const row = t.masterRows('stage').find((r) => r.stageId === sid);
  check(row && row.submissionItemId[0] === SCROOGE6 && row.submissionSkillId[0] === 1209 && row.submissionSkillLv[0] === 20, `master row ${sid}: ${row && row.submissionSkillId}`);
  p.clearMissions = p.clearMissions || {}; delete p.clearMissions[sid];
  const before = medalsLen();
  call(t.respondStageStart, { stageId: sid, eventId: week.evStageId, userKeybladeId: 0 });
  const clear = call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 10 } });
  check(clear && clear.status === 0, `clear status ${clear && clear.status}`);
  const got = p.medals.slice(before).filter((m) => m.medalId === SCROOGE6);
  const s = got[0] && p.medalSkills[got[0].userMedalId];
  check(got.length === 1 && s && s.skillId === 1209 && s.level === 20, `VIP! Skill clear: Scrooge 6★ with ${JSON.stringify(s)}`);
  check(clear.userSkills.some((x) => x.userSkillId === s?.userSkillId && x.skillId === 1209), '/stage/clear response lists the new skill');
  // second clear: objectives already done, nothing more
  const n = medalsLen();
  call(t.respondStageStart, { stageId: sid, eventId: week.evStageId, userKeybladeId: 0 });
  call(t.respondStageClear, { getEnemyDropItems: [], getMaterials: [], clearMissionIds: [1, 2, 3], getPoint: { lux: 10 } });
  check(medalsLen() === n, 'second clear: no second reward');
}

try { fs.unlinkSync(SAVE); } catch { /* gone */ }
if (errors.length) { console.error('test-objective-skill: FAIL\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('test-objective-skill: OK');
process.exit(0);
