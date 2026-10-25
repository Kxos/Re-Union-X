// Buff e stati iniziali dei nemici (enemy-start-state.js, I-207): node server/test-enemy-start-state.js
'use strict';
const fs = require('fs'); const path = require('path');
const st = require('./enemy-start-state');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// unita': riga spostata (vecchio decoder) -> valori della riga vera, buff Upright/Reversed a 0, idempotente
const rows = [{ enemyId: 76, bufAttack: 0, bufDefenseSpeed: 2, bufAttackUpright: 0, bufAttackReverse: 112, bufTurn: 5,
  bufCount: 0, statusAilments: [], statusAilmentsTurn: 0, statusAilmentsCount: 0 }, { enemyId: 99, bufAttackUpright: 3 }];
const real = [{ enemyId: 76, bufDefenseSpeed: 2, bufTurn: 0, bufCount: 0, statusAilments: [112, 0], statusAilmentsTurn: 5,
  statusAilmentsCount: 0 }];
const n = st.applyStartState(rows, real);
check(n === 1, `righe corrette ${n}, attesa 1`);
check(rows[0].bufAttackReverse === 0 && rows[0].bufTurn === 0, `76 buff ${rows[0].bufAttackReverse}/${rows[0].bufTurn}`);
check(JSON.stringify(rows[0].statusAilments) === '[112,0]' && rows[0].statusAilmentsTurn === 5, '76 non dorme');
check(rows[1].bufAttackUpright === 3, 'riga non vera toccata');
check(st.applyStartState(rows, real) === 0, 'non idempotente');

// cloni 526-979: copiano la riga da cui sono nati (via prima della base, template per gli alleati)
const cl = [rows[0], { enemyId: 190110076, bufAttackReverse: 112, statusAilments: [] },
  { enemyId: 2010076, bufTurn: 9 }, { enemyId: 2004, bufTurn: 7 }];
const src = { 190110076: { kind: 'exact-clone', base: 76 }, 2010076: { kind: 'family-clone', base: 1, via: 190110076 },
  2004: { kind: 'ally', template: 999 } };
check(st.propagateClones(cl, src) === 2, 'cloni corretti != 2');
check(cl[2].bufAttackReverse === 0 && JSON.stringify(cl[2].statusAilments) === '[112,0]', `clone via ${JSON.stringify(cl[2])}`);
check(cl[3].bufTurn === 7, 'alleato senza template nel master toccato');
check(st.propagateClones(cl, src) === 0, 'cloni non idempotenti');

// master: righe vere come thethiny, cloni come la loro base
const master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8'));
const byId = new Map(master.map((e) => [e.enemyId, e]));
const realDir = process.env.KHUX_REAL_MASTER_DIR || 'D:\\Progetto_Restauro_KH_UX\\external\\thethiny';
const decPath = path.join(realDir, 'enemy_dec.json');
if (fs.existsSync(decPath)) {
  const again = master.map((e) => JSON.parse(JSON.stringify(e)));
  check(st.applyStartState(again, JSON.parse(fs.readFileSync(decPath, 'utf8'))) === 0, 'master non allineato a enemy_dec.json');
}
const srcPath = require('./make-enemy-oltre').SOURCES_PATH;
if (fs.existsSync(srcPath)) {
  const again = master.map((e) => JSON.parse(JSON.stringify(e)));
  check(st.propagateClones(again, JSON.parse(fs.readFileSync(srcPath, 'utf8')).sources) === 0, 'cloni 526-979 diversi dalla loro base');
}
const rose = byId.get(76) || {};
check(JSON.stringify(rose.statusAilments) === '[112,0]' && rose.statusAilmentsTurn === 5, `White Rose 76 ${JSON.stringify(rose.statusAilments)}`);
const choc = byId.get(1912001620) || {};
check(choc.bufAttack === 1 && choc.bufTurn === 5 && choc.bufAttackUpright === 0, `Chocolate Monster ${choc.bufAttack}/${choc.bufTurn}/${choc.bufAttackUpright}`);
const bogus = master.filter((e) => e.bufAttackUpright || e.bufDefenseUpright || e.bufAttackReverse || e.bufDefenseReverse);
check(bogus.length === 0, `buff Upright/Reversed rimasti: ${bogus.length} (${bogus.slice(0, 5).map((e) => e.enemyId)})`);

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: enemy start state');
