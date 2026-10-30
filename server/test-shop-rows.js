// Pass VIP rows of the Shop master (make-shop-rows.js): node server/test-shop-rows.js
'use strict';
const { shopRows, PASS_SHOP_IDS, VIP_BAR_TEXT } = require('./make-shop-rows');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const rows = shopRows();
check(rows.length === PASS_SHOP_IDS.length, 'one row per pass shopId');
check(VIP_BAR_TEXT === 'VIP: all Special Quests open', 'bar text');
for (const r of rows) {
  check(r.useBenefitExplanation === 'VIP: all Special Quests open', `useBenefitExplanation ${r.shopId}`);
  check(r.useBenefitExplanation.length <= 30, `label <= 30 chars ${r.shopId}`);
  check(r.benefitExplanation.length > 0 && r.benefitExplanation.length <= 128, `benefitExplanation ${r.shopId}`);
}
if (errors.length) { console.log(`FAILED (${errors.length}):\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log('test-shop-rows: OK');
