// GET /shop/campaign (azione 167): il popup di «Unlock All» e dei pulsanti d'acquisto (Task 15 del piano
// 2026-10-30-special-tab). Header x-sqex-hole-retry "0" -> HTTP 400 con testo; ritentata -> 200; mai due 400 in 10 s.
//   node server/test-shop-campaign.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
// salvataggio temporaneo: mai server/save/
const SAVE = path.join(os.tmpdir(), `khux-test-shop-campaign-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE;
delete process.env.KHUX_REAL_NOW;
delete process.env.KHUX_CAMPAIGN_ERROR_STATUS;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
let nowMs = Date.parse('2026-10-27T09:00:00Z');
Date.now = () => nowMs;
const server = quiet(() => require('./server'));
const { _test: t } = server;
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const raw = (fn, ...a) => {
  const out = { code: 0, body: null };
  quiet(() => fn({ writeHead(c) { out.code = c; }, end(x) { out.body = JSON.parse(x.toString('utf8')); } }, ...a));
  return out;
};
check(t.route('/shop/campaign') === 'shopcampaign', 'route /shop/campaign -> shopcampaign');
const TEXT = 'Jewels cannot be bought on this server.\nLocked Special quests open on their weekday,\nor every day with the Weekly Missions VIP.\nSee Notices for details.';
const a = raw(t.respondShopCampaign, { 'x-sqex-hole-retry': '0' });
check(a.code === 400, `retry 0 -> 400 (${a.code})`);
check(a.body && a.body.ret && a.body.ret.error === TEXT, 'error text');
check(a.body && a.body.ret.error.split('\n').length <= 4, 'at most 4 lines');
check(a.body && a.body.cpType === 0 && a.body.cpTitle === '', 'cpType 0, cpTitle empty');
const plain = raw(t.respondShopCampaign, { 'x-sqex-hole-retry': '1' });
check(plain.code === 200 && plain.body.cpType === 0 && plain.body.cpTitle === '' && plain.body.ret.error === undefined, 'retry 1 -> 200 plain');
const types = (r) => Object.keys(r).filter((k) => k !== 'error').map((k) => `${k}:${typeof r[k]}`).join();
check(a.body && types(a.body.ret) === types(plain.body.ret), 'ret field types unchanged');
nowMs += 5000;
const b = raw(t.respondShopCampaign, { 'x-sqex-hole-retry': '0' });
check(b.code === 200 && b.body.ret.error === undefined, 'second retry-0 within 10 s -> 200');
nowMs += 11000;
const c = raw(t.respondShopCampaign, {});
check(c.code === 400, 'absent header after 10 s -> 400 again');
nowMs += 11000;
check(raw(t.respondShopCampaign, { 'x-sqex-hole-retry': '0' }, 503).code === 503, 'configurable status');
try { fs.unlinkSync(SAVE); } catch { /* ok */ }
if (errors.length) { console.error('FAIL:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('test-shop-campaign: ok');
