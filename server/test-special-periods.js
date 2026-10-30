// Authored Special rules of every period (server/special_periods.json, spec docs/superpowers/specs/2026-10-30-special-tab-design.md
// sections 5 and 6): node server/test-special-periods.js
// The structural checks always run; the checks against the private catalogue of the original Special quests
// (KHUX_SPECIAL_SRC, default D:\Progetto_Restauro_KH_UX\private\events\special\special_quests.json) are skipped with a
// message when it is missing (clean PC).
'use strict';
const fs = require('fs');
const rules = require('./special_periods.json');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const E = rules.entries;
const byKey = new Map(E.map((e) => [e.key, e]));
const P = new Map(rules.periods.map((p) => [p.n, p]));
const live = E.filter((e) => !e.removed);
const inP = (n) => live.filter((e) => e.periods.includes(n));
const first = (e) => Math.min(...e.periods);

// ids: unique keys / evStageIds; new entries in 7001-7499, the removed ones keep theirs
check(new Set(E.map((e) => e.key)).size === E.length, 'keys unique');
check(new Set(E.map((e) => e.evStageId)).size === E.length, 'evStageIds unique');
check(live.every((e) => e.evStageId >= 7001 && e.evStageId <= 7499), `evStageIds of the live entries in 7001-7499: ${live.filter((e) => !(e.evStageId >= 7001 && e.evStageId <= 7499)).map((e) => e.key)}`);
check(E.every((e) => Array.isArray(e.periods) && e.periods.length && e.periods.every((n) => P.has(n))), 'periods are 1..5');
check(E.every((e) => e.days === 'all' || (Array.isArray(e.days) && e.days.length)), 'days: "all" or a weekday list');

// every period has at least one free (non-VIP) quest
for (const n of [1, 2, 3, 4, 5]) check(inP(n).some((e) => !e.vip), `period ${n}: no non-VIP entry`);

// replacedBy -> an existing key whose first period is later
for (const e of E.filter((x) => x.replacedBy)) {
  const r = byKey.get(e.replacedBy);
  check(r && first(r) > first(e), `${e.key}: replacedBy ${e.replacedBy} missing or not later`);
}

// JP-only families are not restored (spec 2)
check(!E.some((e) => ['SQ10', 'SQ20', 'SQ25'].includes(e.family)), 'no JP-only family (SQ10, SQ20, SQ25)');
// Mythril Madness and Adamantite: removed everywhere (spec 6)
const gone = E.filter((e) => ['SQ06', 'SQ08'].includes(e.family));
check(gone.length >= 2 && gone.every((e) => e.removed === 'no-use'), 'SQ06/SQ08 entries all removed «no-use»');

// from / to: dates inside the entry's periods
const DAY = /^\d{4}-\d\d-\d\d$/;
for (const e of E) {
  const lo = P.get(first(e)).from, hi = P.get(Math.max(...e.periods)).to;
  if (e.from !== undefined) check(DAY.test(e.from) && e.from >= lo && e.from <= hi, `${e.key}: from ${e.from} outside ${lo}..${hi}`);
  if (e.to !== undefined) check(DAY.test(e.to) && e.to >= lo && e.to <= hi && (!e.from || e.to >= e.from), `${e.key}: to ${e.to} outside ${lo}..${hi}`);
}

// period 5 (spec 5.1, 5.3): no Daily Cid, the four «Day of the Weekly Quest» quests, the period-4 free quests
const p5 = inP(5);
check(!p5.some((e) => e.family === 'SQ12'), 'period 5: no Daily Cid');
const dwq = p5.filter((e) => e.family === 'SQ24');
check(dwq.length === 4 && dwq.every((e) => !e.vip), `period 5: 4 «Day of the Weekly Quest» entries (${dwq.length})`);
const dwqDays = (q) => (dwq.find((e) => (e.quests || []).includes(q)) || {}).days;
check(String(dwqDays('Chip & Dale (Quest)')) === 'Mon' && String(dwqDays('Huey, Dewey, and Louie (Quest)')) === 'Tue,Fri'
  && String(dwqDays('Munny Moogle (Quest)')) === 'Wed,Sat' && String(dwqDays('Cid (Quest)')) === 'Thu,Sun', 'period 5: weekdays of the four quests');
for (const e of inP(4).filter((x) => !x.vip && x.family !== 'SQ12')) check(e.periods.includes(5) && !e.to, `period 5 keeps the period-4 free quest ${e.key}`);

// Keyblade Materials: no replacement (pinnable)
const km = E.filter((e) => e.family === 'SQ07');
check(km.length >= 8 && km.every((e) => e.replacedBy === null && !e.removed), 'Keyblade Materials (SQ07): live, replacedBy null');

// the separate 2016 EXP (SQ01) and Evolve (SQ02) quests are replaced by the 2018 EXP & Evolve quests
const merged = { Power: 'exp-evolve-power', Magic: 'exp-evolve-magic', Speed: 'exp-evolve-speed' };
const old = E.filter((e) => ['SQ01', 'SQ02'].includes(e.family));
check(old.length === 6, `6 separate EXP / Evolve entries (${old.length})`);
for (const e of old) {
  const attr = Object.keys(merged).find((a) => e.name.includes(a));
  check(attr && e.replacedBy === merged[attr], `${e.key}: replacedBy ${e.replacedBy} (expected ${attr && merged[attr]})`);
}
// star evolve (SQ03 / SQ04) -> Evolve Legendary, Munny Medals (SQ05) -> Munny Legendary
check(E.filter((e) => ['SQ03', 'SQ04'].includes(e.family)).every((e) => e.replacedBy === 'evolve-legendary'), '★ evolve -> evolve-legendary');
check(E.filter((e) => e.family === 'SQ05').every((e) => e.replacedBy === 'munny-legendary'), 'Munny Medals -> munny-legendary');

// weekday sets of periods 1-2 (catalogue sections 2-3): EXP Tue/Wed/Thu, star evolve Mon, Munny Fri; gone in period 3
const weekday12 = E.filter((e) => ['SQ01', 'SQ02', 'SQ03', 'SQ04', 'SQ05', 'SQ07'].includes(e.family));
check(weekday12.every((e) => !e.vip && !e.periods.includes(3)), 'weekday sets of 2016: free, periods 1-2 only');
check(inP(1).filter((e) => e.family === 'SQ01').map((e) => e.days.join()).sort().join('|') === 'Thu|Tue|Wed', 'EXP Medals Tue / Wed / Thu');

// MOG: weekends in period 2, every day from period 3
const mog = E.filter((e) => e.family === 'SQ09');
check(mog.some((e) => e.periods.join() === '2' && String(e.days) === 'Sat,Sun' && !e.vip), 'MOG weekends in period 2');
check(mog.some((e) => e.days === 'all' && [3, 4, 5].every((n) => e.periods.includes(n)) && !e.periods.includes(2)), 'MOG every day from period 3');
check(!mog.some((e) => e.periods.includes(1)), 'no MOG in period 1');

// Skill: VIP in periods 1-2, free Sat-Sun from period 3 (10 AP), 0 AP from period 4
const skill = E.filter((e) => e.family === 'SQ11');
check(skill.some((e) => e.vip && e.periods.join() === '1,2'), 'Skill VIP in periods 1-2');
check(skill.some((e) => !e.vip && e.periods.join() === '3' && String(e.days) === 'Sat,Sun' && String(e.useAp) === '10'), 'Skill free Sat-Sun in period 3 at 10 AP');
check(skill.some((e) => !e.vip && e.periods.includes(4) && e.periods.includes(5) && String(e.useAp) === '0'), 'Skill 0 AP in periods 4-5');

// Daily Cid: VIP from 2016-05-19 (12 AP) to 2017-04-19, free from 2017-04-20 to the end of period 4
const cid = E.filter((e) => e.family === 'SQ12');
const cidVip = cid.filter((e) => e.vip), cidFree = cid.filter((e) => !e.vip);
check(cidVip.length === 7 && cidVip.every((e) => e.periods.join() === '1,2' && e.from === '2016-05-19' && e.to === '2017-04-19'
  && String(e.useAp) === '12' && e.resetGroup && e.resetGroup !== 'cid'), 'Daily Cid VIP: 7 entries 2016-05-19..2017-04-19, 12 AP, own reset group');
check(cidFree.length === 7 && cidFree.every((e) => e.periods.join() === '2,3,4' && e.from === '2017-04-20' && e.resetGroup === 'cid'), 'Daily Cid free from 2017-04-20 (periods 2-4)');
check(cidFree.every((e) => e.replacedBy === 'dwq-cost'), 'free Daily Cid replaced by Day of the Weekly Quest: Get Cost Medals! (dwq-cost)');
check(cidFree.every((e) => !require('./special').pinnable(e, 5).ok && require('./special').pinnable(e, 5).why === 'replaced'), 'free Daily Cid not pinnable in period 5');
check(cidVip.every((e) => byKey.get(e.replacedBy) && byKey.get(e.replacedBy).family === 'SQ12' && String(byKey.get(e.replacedBy).days) === String(e.days)), 'Daily Cid VIP replaced by the free quest of the same day');

// Upgrade Quests (SQ13 as VIP) from 2016-06-16, replaced by the free 2018 quests
const up = E.filter((e) => e.family === 'SQ13' && e.vip);
check(up.length === 5 && up.every((e) => e.periods.join() === '1,2' && e.from === '2016-06-16' && byKey.get(e.replacedBy) && !byKey.get(e.replacedBy).vip), 'Upgrade Quests VIP from 2016-06-16 (5 quests)');
check(E.filter((e) => e.family === 'SQ13' && !e.vip).every((e) => e.periods.join() === '3,4,5'), 'free Upgrade / EXP & Evolve quests: periods 3-5');

// recurring VIP set of period 3 from 2018-10
const vip3 = inP(3).filter((e) => e.family === 'SQ22');
check(vip3.length >= 6 && vip3.every((e) => e.vip && e.from && e.from >= '2018-10-01'), 'period 3: recurring VIP set from 2018-10');

// every entry carries the fields make-special / gen_story_maps / make_special_banners read
for (const e of live) {
  check(typeof e.name === 'string' && e.name && typeof e.family === 'string' && typeof e.banner === 'string' && Array.isArray(e.drops)
    && (Array.isArray(e.quests) || Array.isArray(e.series)) && typeof e.vip === 'boolean' && 'replacedBy' in e && typeof e.resetGroup === 'string',
  `${e.key}: missing fields`);
}

// Task 14: original khuxwiki banner art (tmp\banner_hunt MAPPING.json) on every entry and on the campaigns that have one;
// round 2 (31-10, originals research): the three entries got khuxwiki art too (VIP Materials; the spirit part banner of
// the week of its rewards), the Winter / New Year Limited VIP Boards their notice images (640x140); C44151 and C48395
// (no image anywhere) have no `banner`; round 3 (30-10): they carry a `reconstruct` spec instead (make_special_banners
// rebuilds them from local in-game board screenshots, file names only)
const BANNER_RE = /^Special - .+ banner KHUX\.png$/;
const NOTICE_RE = /^Notice \d+ .+ banner \(notice image\)\.png$/;
const CAMP = Object.entries(rules.campaigns || {}).filter(([k]) => !k.startsWith('_'));
const plateEntries = E.filter((e) => !e.banner).map((e) => e.key).sort();
check(plateEntries.join() === '', `entries on the plate: ${plateEntries}`);
const bannerOf = (k) => E.find((e) => e.key === k)?.banner;
check(bannerOf('vip-materials') === 'Special - VIP Materials quest banner KHUX.png' && bannerOf('vip-materials-2') === 'Special - VIP Materials quest banner KHUX.png', 'VIP Materials art on both entries');
check(/^Special - VIP Get .+ spirit parts? and 1400 Jewels! banner KHUX\.png$/.test(bannerOf('vip-spirit-part') || ''), `spirit part art: ${bannerOf('vip-spirit-part')}`);
check(E.every((e) => !e.banner || BANNER_RE.test(e.banner)), 'entry banners are khuxwiki «Special - ... banner KHUX.png» names');
const plateCamps = CAMP.filter(([, c]) => !c.banner).map(([k]) => k).sort();
check(plateCamps.join() === 'C44151,C48395', `campaigns on the plate: ${plateCamps}`);
const RECON = ['C44151', 'C48395'];
check(RECON.every((k) => { const r = rules.campaigns[k].reconstruct || {}; return ['board', 'icon', 'tile'].every((f) => typeof r[f] === 'string' && r[f] && !/[\\/]/.test(r[f]))
  && r.title && /^reconstructed/.test(r._note || ''); }), 'C44151 / C48395: reconstruct spec (file names only, _note reconstructed)');
check(CAMP.filter(([, c]) => c.reconstruct).map(([k]) => k).join() === RECON.join(), 'reconstruct only on the campaigns without an original');
check(CAMP.every(([, c]) => !c.banner || BANNER_RE.test(c.banner) || NOTICE_RE.test(c.banner)), 'campaign banners are khuxwiki or notice image names');
check(rules.campaigns.C71999?.banner === 'Notice 71999 Limited Winter VIP Board banner (notice image).png'
  && rules.campaigns.C72714?.banner === 'Notice 72714 New Year Limited VIP Boards banner (notice image).png', 'Limited VIP Boards: notice images');
check(CAMP.filter(([, c]) => c.banner).length === 118, `campaigns with an original: ${CAMP.filter(([, c]) => c.banner).length} (118)`);
// round 17: recurring VIP sets follow the weekly rotation (rules.weekly, make-special.js weeklyEntries)
const WK = rules.weekly || {};
const WV = Object.entries(WK.versions || {}).filter(([k]) => !k.startsWith('_'));
const WS = Object.entries(WK.sets || {}).filter(([k]) => !k.startsWith('_'));
check(WS.map(([, v]) => v.entry).sort().join() === 'vip-draw-ticket,vip-dual-meow-wow,vip-gems,vip-jewels-avatar,vip-medal,vip-skill,vip-spirit-part,vip-subslot', `weekly sets: ${WS.map(([, v]) => v.entry)}`);
check(WS.every(([, v]) => { const en = byKey.get(v.entry); return en && en.vip && en.family === 'SQ22' && (en.quests || []).length === 1 && !en.removed; }), 'weekly sets on one-quest VIP SQ22 entries');
const SKS = (WK.sets || {})['VIP! Skill'] || {};
check(SKS.entry === 'vip-skill' && SKS.skillCarrier === 'Scrooge' && Object.keys(SKS.skills || {}).filter((k) => !k.startsWith('_')).length === 18, 'VIP! Skill: weekly set with carrier Scrooge and 18 skill texts (round 18)');
check(Object.entries(SKS.skills || {}).every(([k, v]) => k.startsWith('_') || (typeof v === 'string' && v)), 'VIP! Skill: every skill text maps to a master skill name');
check(WV.length === 201 && WV.every(([k, v]) => /^vip-[a-z-]+@\d{4}-\d\d-\d\d(#\d)?$/.test(k) && WS.some(([, s]) => k.startsWith(s.entry + '@')) && v.evStageId >= 7700 && v.evStageId <= 7999), `weekly versions: 201 keys <entry>@<Monday>, ids 7700-7999 (${WV.length})`);
const allIds = [...E.map((e) => e.evStageId), ...CAMP.map(([, c]) => c.evStageId), ...WV.map(([, v]) => v.evStageId)];
check(new Set(allIds).size === allIds.length, 'evStageIds unique across entries, campaigns and week versions');
check(WV.every(([k]) => new Date(k.slice(k.indexOf('@') + 1, k.indexOf('@') + 11) + 'T00:00:00Z').getUTCDay() === 1), 'week versions start on a Monday');
check(WV.every(([, v]) => !v.banner || BANNER_RE.test(v.banner)), 'week version banners are khuxwiki names');
// bench rev 223 fix: every week version has its own original banner (khuxwiki «Special - VIP <week title> banner KHUX.png»)
const ownArt = WV.filter(([, v]) => !v.dropped);
check(ownArt.every(([, v]) => v.banner && /^Special - VIP .+ banner KHUX\.png$/.test(v.banner)), `week versions without their own banner: ${ownArt.filter(([, v]) => !v.banner).map(([k]) => k).slice(0, 8)} (${ownArt.filter(([, v]) => !v.banner).length})`);
check(new Set(ownArt.filter(([k]) => k.startsWith('vip-jewels-avatar@')).map(([, v]) => v.banner)).size === ownArt.filter(([k]) => k.startsWith('vip-jewels-avatar@')).length, 'Jewels & Avatar Parts: a different banner every week');
check(WV.filter(([, v]) => v.dropped).map(([k, v]) => `${k}:${v.evStageId}`).join() === 'vip-medal@2019-03-04:7700,vip-medal@2019-03-04#2:7701,vip-skill@2021-01-04#2:7893', 'fix round 1: the two clipped 2019-03-04 Medal Quest rows dropped, ids 7700 / 7701 reserved; round 18: the repeated VIP! Skill row of 2021-01-04, id 7893 reserved');
check(WV.filter(([k]) => k.startsWith('vip-skill@')).map(([, v]) => v.evStageId).join() === Array.from({ length: 25 }, (_, i) => 7876 + i).join(), 'round 18: VIP! Skill week versions frozen at 7876-7900, after the round-17 max 7875');
const BANNERS = process.env.KHUX_SPECIAL_BANNERS || 'D:\\Progetto_Restauro_KH_UX\\reference\\special_banners';
if (fs.existsSync(BANNERS)) {
  const have = new Set(fs.readdirSync(BANNERS));
  const lost = [...E.map((e) => e.banner), ...CAMP.map(([, c]) => c.banner), ...WV.map(([, v]) => v.banner)].filter((b) => b && !have.has(b));
  check(!lost.length, `banner files missing in ${BANNERS}: ${[...new Set(lost)].join(' | ')}`);
  const rlost = RECON.flatMap((k) => ['board', 'icon', 'tile'].map((f) => (rules.campaigns[k].reconstruct || {})[f])).filter((b) => !have.has(b));
  check(!rlost.length, `reconstruct sources missing in ${BANNERS}: ${rlost.join(' | ')}`);
} else console.log(`(banner folder ${BANNERS} missing: file checks skipped)`);

// catalogue: every series / quest named exists
const SRC = process.env.KHUX_SPECIAL_SRC || 'D:\\Progetto_Restauro_KH_UX\\private\\events\\special\\special_quests.json';
if (fs.existsSync(SRC)) {
  const cat = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const quests = new Set(cat.quests.map((q) => q.quest)), series = new Set(cat.quests.map((q) => q.series));
  for (const e of E) {
    for (const q of e.quests || []) check(quests.has(q), `${e.key}: quest «${q}» not in the catalogue`);
    for (const s of e.series || []) check(series.has(s), `${e.key}: series «${s}» not in the catalogue`);
  }
  // a catalogue quest without objectives needs reconstructed ones in the entry
  for (const e of live) {
    const qs = e.quests ? cat.quests.filter((q) => e.quests.includes(q.quest)) : cat.quests.filter((q) => e.series.includes(q.series));
    check(qs.length <= 5, `${e.key}: ${qs.length} quests (max 5)`);
    for (const q of qs) check(q.objectives.length === 3 || (e.objectives && (e.objectives[q.quest] || []).length === 3), `${e.key}: ${q.quest} has no objectives`);
  }
} else console.log(`(private catalogue ${SRC} missing: catalogue checks skipped)`);

if (errors.length) { console.error(`test-special-periods: FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`test-special-periods: OK (${E.length} entries, per period ${[1, 2, 3, 4, 5].map((n) => inP(n).length).join('/')})`);
