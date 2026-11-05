// Conditional Present campaigns (I-234, campaign-gifts.js, campaign_gifts.json): node server/test-campaign-gifts.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const assert = require('assert');
const cg = require('./campaign-gifts');

const SAVE = path.join(os.tmpdir(), `khux-test-campaign-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* new */ }
process.on('exit', () => { try { fs.unlinkSync(SAVE); } catch { /* gone */ } });
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW; delete process.env.KHUX_SERVER_TIME; delete process.env.KHUX_GACHA_BANNERS;

const log = console.log;
const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// --- pure rules on a small master -------------------------------------------------------------------------------
const M = [
  { medalId: 1, name: 'A', rare: 6 }, { medalId: 1000001, name: 'A', rare: 6, groupId: 1 }, { medalId: 2, name: 'B', rare: 6 },
  { medalId: 3, name: 'C', rare: 6 }, { medalId: 9, name: 'Prize', rare: 6 }, { medalId: 2000009, name: 'Prize', rare: 6, groupId: 9 },
];
const mk = (condition, reward = [{ medal: 'Prize', rare: 6, num: 1, dots: 2 }], o = {}) => ({ id: 'x', name: 'X', start: '2017-01-01', condition, reward, ...o });
const comp = (c, drawIdOf) => { const r = cg.compile([c], { medals: M, drawIdOf }); assert.deepStrictEqual(r.errors, []); return r.campaigns; };
const st = (medals, o = {}) => ({ medals: medals.map((m, i) => ({ userMedalId: 100 + i, ...m })), drawCount: () => 0, storyQuest: 0, ...o });
const sent = (camps, state, given) => cg.due(camps, state, given).flatMap((d) => d.rows);
const total = (rows) => rows.reduce((s, r) => s + r.num, 0);

{ // each: one per listed Medal owned, boosted copy counts as the Medal, never twice
  const c = comp(mk({ kind: 'each', test: 'own', medals: ['A', 'B', 'C'] })), g = {};
  check(total(sent(c, st([{ medalId: 1000001 }, { medalId: 1 }]), g)) === 1, 'each: A (normal + boosted) = 1');
  check(total(sent(c, st([{ medalId: 1 }]), g)) === 0, 'each: A again = 0');
  const r = sent(c, st([{ medalId: 1 }, { medalId: 2 }, { medalId: 3 }]), g);
  check(r.length === 1 && r[0].num === 2 && r[0].id === 9 && r[0].dots === 2, 'each: B and C = one present of 2 with dots');
}
{ // saBonus and eachCopy
  const c = comp(mk({ kind: 'eachCopy', test: 'saBonus', medals: ['A'] })), g = {};
  check(total(sent(c, st([{ medalId: 1 }, { medalId: 1, guiltFactor: 0 }]), g)) === 0, 'saBonus: locked bonus = 0');
  check(total(sent(c, st([{ medalId: 1, guiltFactor: 5000 }, { medalId: 1, guiltFactor: 100 }]), g)) === 2, 'eachCopy: 2 copies unlocked = 2');
}
{ // any with an option of two requirements
  const c = comp(mk({ kind: 'any', options: [[{ test: 'own', medals: ['A'] }, { test: 'own', medals: ['B'] }], [{ test: 'saBonus', medals: ['C'] }]] }));
  check(total(sent(c, st([{ medalId: 1 }]), {})) === 0, 'any: A alone = 0');
  check(total(sent(c, st([{ medalId: 1 }, { medalId: 2 }]), {})) === 1, 'any: A and B = 1');
  check(total(sent(c, st([{ medalId: 3, guiltFactor: 1 }]), {})) === 1, 'any: C with bonus = 1');
}
{ // sets with traits and limit; sets without limit
  const c = comp(mk({ kind: 'sets', test: 'traits', traits: 5, size: 3, limit: 1, medals: ['A', 'B'] }));
  check(total(sent(c, st([{ medalId: 1, traits: 5 }, { medalId: 2, traits: 5 }, { medalId: 2, traits: 4 }]), {})) === 0, 'sets: 2 of 3 with 5 traits = 0');
  check(total(sent(c, st(Array(7).fill({ medalId: 2, traits: 5 })), {})) === 1, 'sets: limit 1');
  const d = comp(mk({ kind: 'sets', test: 'own', size: 3, medals: ['A', 'B'] })), g = {};
  check(total(sent(d, st(Array(7).fill({ medalId: 1 })), g)) === 2, 'sets: 7 copies / 3 = 2');
  check(total(sent(d, st(Array(9).fill({ medalId: 1 })), g)) === 1, 'sets: 9 copies, one more');
}
{ // tiers: rewards of each new tier only; boosted reward row
  const c = comp(mk({ kind: 'tiers', test: 'own', medals: ['A'], tiers: [
    { at: 2, reward: [{ medal: 'B', rare: 6, num: 1 }] }, { at: 4, reward: [{ medal: 'Prize', rare: 6, num: 1, boosted: '1000:1000' }] }] }, [])), g = {};
  const r1 = sent(c, st(Array(3).fill({ medalId: 1 })), g);
  check(r1.length === 1 && r1[0].id === 2, 'tiers: tier 1 only');
  const r2 = sent(c, st(Array(5).fill({ medalId: 1 })), g);
  check(r2.length === 1 && r2[0].id === 2000009, 'tiers: tier 2 = boosted Prize');
}
{ // draws every / at, story
  const ids = { B1: 501, B2: 502 }, cnt = { 501: 3, 502: 4 };
  const ev = comp(mk({ kind: 'draws', banners: ['B1', 'B2'], every: 1 }), (b) => ids[b]), g = {};
  check(total(sent(ev, st([], { drawCount: (id) => cnt[id] }), g)) === 7, 'draws every 1: 7 draws = 7 (one present)');
  cnt[501] = 4;
  check(total(sent(ev, st([], { drawCount: (id) => cnt[id] }), g)) === 1, 'draws: one more draw = 1');
  const at = comp(mk({ kind: 'draws', banners: ['B1'], at: 5 }), (b) => ids[b]);
  check(total(sent(at, st([], { drawCount: (id) => cnt[id] }), {})) === 0, 'draws at 5: 4 = 0');
  check(total(sent(at, st([], { drawCount: () => 9 }), {})) === 1, 'draws at 5: 9 = 1 once');
  const s = comp(mk({ kind: 'story', quest: 50 }));
  check(total(sent(s, st([], { storyQuest: 49 }), {})) === 0 && total(sent(s, st([], { storyQuest: 50 }), {})) === 1, 'story: Q50');
}
{ // non-Medal rewards: Jewels and Draw Tickets (Shop currencies only), LUX level once, Medal storage
  const TK = ['draw', 'holiday', 'spooky', 'moogle'];
  const r = cg.compile([mk({ kind: 'story', quest: 1 }, [{ jewels: 600 }, { ticket: 'spooky', num: 10 }])], { medals: M, tickets: TK });
  check(r.errors.length === 0 && JSON.stringify(r.campaigns[0].reward) === JSON.stringify([{ type: 2, id: 0, num: 600 }, { type: 41, id: 2, num: 10 }]),
    'rewards: 600 Jewels (type 2) and 10 Spooky Cookies (type 41 id 2)');
  const bad = cg.compile([mk({ kind: 'story', quest: 1 }, [{ ticket: 'gold', num: 1 }])], { medals: M, tickets: TK });
  check(bad.errors.length === 1 && bad.campaigns.length === 0, 'Gold Ticket: not a Shop currency, rejected');
  const lux = cg.compile([mk({ kind: 'lux', once: true }, [{ ticket: 'draw', num: 1 }])], { medals: M, tickets: TK }).campaigns, g = {};
  const r1 = sent(lux, st([], { luxLevel: 120 }), g);
  check(r1.length === 1 && r1[0].type === 41 && r1[0].num === 120, 'lux: 120 Draw Tickets for LUX level 120');
  check(total(sent(lux, st([], { luxLevel: 300 }), g)) === 0, 'lux once: no top-up after levelling');
  const sto = cg.compile([mk({ kind: 'storage', slots: 3000 }, [{ ticket: 'draw', num: 30 }])], { medals: M, tickets: TK }).campaigns, h = {};
  check(total(sent(sto, st([], { medalSlots: 2995 }), h)) === 0, 'storage: 2,995 slots = 0');
  check(total(sent(sto, st([], { medalSlots: 3000 }), h)) === 30 && total(sent(sto, st([], { medalSlots: 3000 }), h)) === 0, 'storage: 3,000 slots = 30 tickets once');
}
{ // opening: by the Story Shop week, then stays open
  const c = comp(mk({ kind: 'story', quest: 1 })), g = {};
  check(cg.openCampaigns(c, '2016-12-31', g).length === 0, 'closed before the start');
  check(cg.openCampaigns(c, '2017-01-01', g).length === 1, 'open on the start');
  check(cg.openCampaigns(c, '2016-05-01', g).length === 1, 'stays open (rotation went back)');
}
{ // unknown names are reported and drop only that campaign
  const r = cg.compile([mk({ kind: 'each', test: 'own', medals: ['Nope'] }), mk({ kind: 'story', quest: 1 }, undefined, { id: 'ok' })], { medals: M });
  check(r.errors.length === 1 && r.campaigns.length === 1 && r.campaigns[0].id === 'ok', 'compile errors');
}

// --- the real data against the served master --------------------------------------------------------------------
const MD = path.join(__dirname, 'master_data');
const rd = (n) => JSON.parse(fs.readFileSync(path.join(MD, n + '.json'), 'utf8'));
const gd = require('./gacha-data');
const cat = gd.loadCatalog(path.join(__dirname, 'game_data', 'gacha_catalog.json'));
const real = cg.compile(cg.load(), { medals: rd('medal'), materials: rd('material'), titles: rd('title'), skills: rd('skill'),
  drawIdOf: (rowId) => cat.banners.find((b) => b.rowId === rowId)?.drawMedalTypeId, tickets: require('./gacha').TICKET_CURRENCIES });
check(real.errors.length === 0, 'campaign_gifts.json compiles: ' + real.errors.join('; '));
check(real.campaigns.length === cg.load().length, 'every campaign kept');
const byId = new Map(real.campaigns.map((c) => [c.id, c]));
const rewardIds = (id) => (byId.get(id)?.reward || []).map((r) => r.id);
check(rewardIds('tva-2016')[0] === 22166 && byId.get('tva-2016').reward[0].dots === 3, 'TVA: Terra & Ventus & Aqua 6★ (22166) with 3 dots');
check(rewardIds('sntva-2019')[0] === 301673, 'Supernova - Terra, Ven, Aqua 301673');
check(rewardIds('strelitzia-2020').join() === '302036,9000256', 'Strelitzia + Trait Medal #256');
check(rewardIds('momkairi-2020').join() === '302065,9000284', 'MoM Kairi + Trait Medal #284');
check(rewardIds('annaelsa-2018')[0] === 301657, 'Anna & Elsa 301657');
check(byId.get('orgxiii-2017').reward.length === 14 && byId.get('orgxiii-2017').reward[13].skillId === 1230, 'Org XIII set + Scrooge with ATK B III Max & SP GA 2');
const flan = byId.get('flantastic-2020').condition.tiers;
check(flan.length === 9 && flan[8].reward[0].id === 2302025, 'Flantastic Seven: 9 tiers, boosted at 110');
check(flan[7].reward.some((r) => r.type === 7) && flan[0].reward.some((r) => r.type === 5), 'Flantastic Seven: title and gems');
check(JSON.stringify(byId.get('story-q200-2016')?.reward) === '[{"type":2,"id":0,"num":600}]', 'Story Quest 200: 600 Jewels');
check(JSON.stringify(byId.get('lux-tickets-2019')?.reward) === '[{"type":41,"id":0,"num":1}]' && byId.get('lux-tickets-2019').condition.once, 'LUX campaign: one Draw Ticket per level, once');
check(JSON.stringify(byId.get('storage-2020')?.reward) === '[{"type":41,"id":0,"num":30}]', 'storage campaign: 30 Draw Tickets');
check(byId.get('annaelsa-2018').condition.drawIds[0] > 0 && byId.get('sntva-trait-2019').condition.drawIds.length === 3, 'Deal ids resolved');

// --- server: Home/Present Box check, once, collection with dots ---------------------------------------------------
const { _test: t } = quiet(() => require('./server'));
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const setQuest = (q) => { p.stageScores = { [t.masterRows('stage').find((r) => r.id === q).stageId]: 1 }; };
const give = (medalId, extra) => { const id = 5000 + (p.medals || []).length; (p.medals ||= []).push({ userMedalId: id, medalId, level: 1, getDatetime: t.realNow() }); if (extra) (p.medalState ||= {})[id] = extra; return id; };
const campaignPresents = () => quiet(() => t.livePresents()).filter((x) => /^Campaign: /.test(x.comment || ''));

setQuest(300); // Story Shop week in May 2016: nothing open yet
give(43036); // Illustrated Aqua
check(quiet(() => t.checkCampaignGifts()) === 0, 'Q300: no campaign open');
setQuest(979); // late Story: every campaign open
quiet(() => t.checkCampaignGifts());
const tva = campaignPresents().filter((x) => x.resourceId === 22166);
check(tva.length === 1 && tva[0].number === 1 && tva[0].dots === 3, 'Q979: one Terra & Ventus & Aqua with 3 dots');
check(campaignPresents().some((x) => x.resourceId === 300943 && x.number === 3), 'Story Quest 50 campaign: 3 Sora & Roxas');
check(campaignPresents().some((x) => x.resourceId === 300948), 'Story Quest 600 campaign: Magic Broom');
const jw = campaignPresents().filter((x) => x.resourceType === 2);
check(jw.length === 1 && jw[0].number === 600, 'Story Quest 200 campaign: 600 Jewels');
const lx = campaignPresents().filter((x) => x.resourceType === 41);
check(lx.length === 1 && lx[0].resourceId === 0 && lx[0].number >= 1, 'LUX campaign: Draw Tickets = LUX level');
check(!campaignPresents().some((x) => x.resourceType === 41 && x.number === 30), 'storage campaign: not below 3,000 slots');
p.lux = (p.lux || 0) + 1e9; // a higher LUX level later: no top-up
p.medalMaxExtra = 3000; // Medal storage at 3,000 slots: 30 Draw Tickets
quiet(() => t.checkCampaignGifts());
check(campaignPresents().filter((x) => x.resourceType === 41).length === 2 && campaignPresents().some((x) => x.resourceType === 41 && x.number === 30),
  'storage 3,000: 30 Draw Tickets, LUX tickets not topped up');
{ // collect Jewels and Draw Tickets
  const stones = p.freeStone || 0, draw = require('./gacha').ticketsOf(p).draw || 0;
  const ids = campaignPresents().filter((x) => x.resourceType === 2 || x.resourceType === 41).map((x) => x.userPresentId);
  const nTk = campaignPresents().filter((x) => x.resourceType === 41).reduce((s, x) => s + x.number, 0);
  call(t.respondPresentReceive, { receivePresentIds: ids });
  check((p.freeStone || 0) === stones + 600, 'collected: +600 Jewels');
  check((require('./gacha').ticketsOf(p).draw || 0) === draw + nTk, 'collected: Draw Tickets in the payType 8 draw currency');
}
const n0 = campaignPresents().length;
give(43036); // a second Illustrated Aqua: no second reward
check(quiet(() => t.checkCampaignGifts()) === 0 && campaignPresents().length === n0, 'duplicates of the same Medal give nothing more');
give(43056); // Illustrated Terra: one more, through GET /user/present
const box = call(t.respondUserPresent);
check(campaignPresents().filter((x) => x.resourceId === 22166).length === 2, 'Illustrated Terra: second Terra & Ventus & Aqua');
check(box.userPresent.userPresentDatas.some((x) => x.resourceId === 22166 && /Campaign: /.test(x.comment)), 'present listed in the Present Box');
// draws: 5 draws of the Frozen VIP Draw -> Anna & Elsa once + Trait Medal #64 x5
const frozen = cat.banners.find((b) => b.rowId === 'B0431').drawMedalTypeId;
((p.gacha ||= {}).count ||= {})[frozen] = 5;
quiet(() => t.checkCampaignGifts());
check(campaignPresents().filter((x) => x.resourceId === 301657).length === 1, 'Anna & Elsa after 5 VIP Draws');
check(campaignPresents().find((x) => x.resourceId === 9000064)?.number === 5, 'Trait Medal #64 x5 in one present');
// Special Attack Bonus: HD Sora with the bonus -> HD King Mickey (3 dots)
give(300741, { guiltFactor: 8000, burstUpperNumber: 5 });
quiet(() => t.checkCampaignGifts());
const km = campaignPresents().find((x) => x.resourceId === 300745);
check(km && km.dots === 3, 'HD Sora with its bonus: HD King Mickey with 3 dots');
// collect it: the Medal arrives with 3 dots
const before = (p.medals || []).length;
call(t.respondPresentReceive, { receivePresentIds: [km.userPresentId] });
const got = t.userMedalList().filter((m) => m.medalId === 300745);
check((p.medals || []).length === before + 1 && got.length === 1 && got[0].burstUpperNumber === 3, 'collected HD King Mickey has 3 dots');
check(!campaignPresents().some((x) => x.userPresentId === km.userPresentId), 'collected present left the box');
// state survives: nothing sent twice on the next Home
check(quiet(() => t.checkCampaignGifts()) === 0, 'next check sends nothing');

if (errors.length) { console.error('FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('test-campaign-gifts: OK');
process.exit(0);
