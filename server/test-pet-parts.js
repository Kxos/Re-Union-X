// Spirit parts master rows (make-pet-parts.js from server/pet_parts.tsv): node server/test-pet-parts.js
// 03-11 (user: restore all Spirit parts): the 17 named parts whose original graphics are complete get rows; parts with
// reconstructed graphics (status column «recon») are served only once the user approved them («recon-ok»).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const pp = require('./make-pet-parts');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const rows = pp.petPartsRows();
const byId = new Map(rows.map((r) => [r.petPartsId, r]));
check(rows.every((r) => r.partsType === Math.floor(r.petPartsId / 1000) % 100 && r.combinationFlag === 0 && r.offsetNumber === 0), 'partsType = TT of the id, flags 0');
check(new Set(rows.map((r) => r.name)).size === rows.length, 'names unique (rewards look parts up by name)');
check(rows.every((r, i) => !i || rows[i - 1].petPartsId < r.petPartsId), 'sorted by id');
check(rows.every((r) => !('status' in r)), 'status is not a master field');

// the 17 parts with complete original graphics and a khuxwiki name (audit 03-11), rows since 03-11
const ADDED = { 401010: 'Starlight Glasses', 401011: 'Starlight Sunglasses', 402092: 'Alarm Clock', 402118: 'Chirithy Snowman',
  402119: 'Snowy Mickey Ears', 407004: 'Balloon Snowman', 407009: 'Balloon Fairies', 407011: 'Balloon Moogle & Chirithy',
  407015: 'Starlight Angel Wings', 407024: 'Valentine Balloons', 407036: 'Balloon Terra', 407039: 'Balloon Aqua', 407043: 'Flying Carpet',
  410010: 'Word Bubble: Noodle Stir-Fry', 410016: 'Lantern', 410019: 'Word Bubble: Hot Dog', 410020: 'Pinwheels' };
for (const [id, name] of Object.entries(ADDED)) check(byId.get(Number(id))?.name === name, `row ${id} ${name} (${byId.get(Number(id))?.name})`);

// reconstructed graphics: listed with their status; «recon» rows are left out unless approved (or forced for a preview)
const st = pp.partStatus();
check(st.get(402028) === 'recon-ok' && st.get(410014) === 'recon-ok' && byId.has(402028) && byId.has(410014), 'Starlight Ears / Dazzling Disco: reconstructed, approved 02-11, served');
// the 18 parts without graphics (audit 03-11); 17 approved after the rendered review of 03-11 (tmp/spirit_parts/render/recon_review.html),
// Olaf's Snow Cloud stays a candidate (its falling-snow particle is drawn, the snowfall looks sparser than the game icon)
const AWAITING = [402021, 402022, 402027, 402029, 402041, 402060, 402073, 402122, 402126, 407006, 407012, 407025, 407030, 410003, 410007, 410012, 410013, 410021];
const APPROVED_0311 = AWAITING.filter((id) => id !== 410013);
check(AWAITING.every((id) => st.get(id) === (APPROVED_0311.includes(id) ? 'recon-ok' : 'recon')), `the 18 parts without graphics: 17 «recon-ok», 410013 «recon» (${AWAITING.filter((id) => st.get(id) !== (APPROVED_0311.includes(id) ? 'recon-ok' : 'recon'))})`);
check(byId.get(410012)?.name === "Elsa's Magic" && byId.get(407006)?.name === 'Kite' && byId.get(407012)?.name === 'Balloon Zazu' && !byId.has(410013), "Elsa's Magic, Kite, Balloon Zazu served; Olaf's Snow Cloud not yet");
const approved = new Set([...st].filter(([, s]) => s === 'recon-ok').map(([id]) => id));
check(AWAITING.every((id) => byId.has(id) === approved.has(id)), 'a «recon» part has a row only once approved');
const all = pp.petPartsRows(undefined, { previewRecon: true });
check(AWAITING.every((id) => all.some((r) => r.petPartsId === id)) && all.length === rows.length + AWAITING.filter((id) => !approved.has(id)).length, 'previewRecon: every reconstructed part');

// bad status rejected
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khux-petparts-'));
try {
  const f = path.join(tmp, 'p.tsv');
  fs.writeFileSync(f, 'petPartsId\tname\tstatus\n402021\tMickey Mask\tmaybe\n');
  let bad = false; try { pp.petPartsRows(f); } catch { bad = true; }
  check(bad, 'unknown status rejected');
  fs.writeFileSync(f, 'petPartsId\tname\tstatus\n402021\tMickey Mask\trecon\n402022\tMinnie Mask\trecon-ok\n303001\tPink Kitstar Ears\n');
  check(pp.petPartsRows(f).map((r) => r.petPartsId).join() === '303001,402022', 'recon left out, recon-ok and plain rows kept');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// the generated table in server/tables is up to date
const live = JSON.parse(fs.readFileSync(path.join(__dirname, 'tables', 'petParts.json'), 'utf8'));
check(JSON.stringify(live) === JSON.stringify(rows), 'server/tables/petParts.json regenerated (node server/make-pet-parts.js)');

if (errors.length) { console.error('test-pet-parts: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`test-pet-parts: OK (${rows.length} rows)`);
