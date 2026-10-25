// Outfits > Save (POST /user/avatar/update, action 43): before 25-10 the server had no handler and the client showed
// «200 ERROR :43» (tester report, play package). The body is {updateAvatarData: [{myCoordinateNo, gender, defaultFlag,
// hairPartsId, hairColorPartsId, facePartsId, bodyPartsId, skinPartsId, accessoriesPartsIds}]}.
//   node server/test-avatar-update.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-avatar-${process.pid}.json`);
fs.copyFileSync(path.join(__dirname, 'save', 'maxpower.json'), SAVE);
process.env.KHUX_SAVE = SAVE;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };

check(t.route('/user/avatar/update?m=1&i=1') === 'useravatarupdate', `route: ${t.route('/user/avatar/update')}`);
const outfit = { myCoordinateNo: 1, gender: 1, defaultFlag: 1, hairPartsId: 40001, hairColorPartsId: 50001, facePartsId: 20001,
  bodyPartsId: 59, skinPartsId: 30001, accessoriesPartsIds: [109059] };
const r = call(t.respondAvatarUpdate, { updateAvatarData: [outfit] });
check(r && r.ret !== undefined, 'no ret');
const a = r?.userAvatars?.find((x) => x.myCoordinateNo === 1);
check(a && a.bodyPartsId === 59 && JSON.stringify(a.accessoriesPartsIds) === '[109059]', `userAvatars: ${JSON.stringify(r?.userAvatars)}`);
check(r?.userData?.userDetail && Number.isInteger(r.userData.userDetail.level), 'userData.userDetail missing');
check(t.userAvatarData().bodyPartsId === 59, `worn outfit not saved: ${JSON.stringify(t.userAvatarData())}`);
check(JSON.parse(fs.readFileSync(SAVE, 'utf8')).avatar?.bodyPartsId === 59, 'outfit not written to the save file');
// the parts worn stay owned (Outfits list)
check(t.userAvatarPartsData().some((p) => p.avatarPartsId === 59), 'body part 59 not in the owned parts');
// a second pattern (myCoordinateNo 2, not worn) is kept and listed by /user/avatar/all, the worn one does not change
const r2 = call(t.respondAvatarUpdate, { updateAvatarData: [{ ...outfit, myCoordinateNo: 2, defaultFlag: 0, bodyPartsId: 1 }] });
check(r2?.userAvatars?.length === 2, `two patterns expected: ${JSON.stringify(r2?.userAvatars)}`);
check(t.userAvatarData().bodyPartsId === 59, 'saving a non-worn pattern changed the worn outfit');
fs.rmSync(SAVE, { force: true });
console.log(errors.length ? errors.map((e) => 'FAIL: ' + e).join('\n') : 'OK');
process.exit(errors.length ? 1 : 0);
