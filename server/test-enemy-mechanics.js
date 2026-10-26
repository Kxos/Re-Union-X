// Contatori e assorbimento dei nemici 526-979 (enemy-mechanics.js, I-207): node server/test-enemy-mechanics.js
'use strict';
const fs = require('fs'); const path = require('path');
const mech = require('./enemy-mechanics');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// unita' (sospensione 26-10): un contatore senza mossa verificata (c.skillId) si toglie, anche se gia' messo; con la mossa
// verificata si applica; l'assorbimento resta
const atts = [
  { enemyAttackId: 10, name: 'Attack', target: 1, power: 10000, hitCount: 2, display: 0 },
  { enemyAttackId: 11, name: 'Attack', target: 1, power: 20000, hitCount: 1, display: 1 },
];
const rows = [
  { enemyId: 7, validSkill: 2, skillId: [10, 11, 0, 0], validUrgency: 1, urgency: [3, 0, 0], urgencyValue: [20, 0, 0],
    urgencyFrequency: [0, 0, 0], urgencySkillId: [11, 0, 0], absorbAttribute: 0 },
  { enemyId: 8, validSkill: 1, skillId: [10, 0, 0, 0], validUrgency: 0, urgency: [0, 0, 0], urgencyValue: [0, 0, 0],
    urgencyFrequency: [0, 0, 0], urgencySkillId: [0, 0, 0], absorbAttribute: 0 },
  { enemyId: 9, validSkill: 1, skillId: [10, 0, 0, 0], validUrgency: 0, absorbAttribute: 0 },
];
const table = { counters: { 7: { urgency: 3, value: 20 }, 8: { urgency: 2, value: 3, skillId: 10 } }, absorb: { 9: { kinds: ['magic', 'reversed'] } } };
const rep = mech.applyMechanics(rows, atts, table);
check(JSON.stringify([rows[0].validUrgency, rows[0].urgency, rows[0].urgencyValue, rows[0].urgencySkillId]) === '[0,[0,0,0],[0,0,0],[0,0,0]]', `contatore 7 sospeso: ${JSON.stringify(rows[0])}`);
check(JSON.stringify([rows[1].validUrgency, rows[1].urgency[0], rows[1].urgencyValue[0], rows[1].urgencySkillId[0]]) === '[1,2,3,10]', `contatore 8 con mossa verificata: ${JSON.stringify(rows[1])}`);
check(rows[2].absorbAttribute === 4 + 16 && rows[2].validUrgency === 0, `assorbimento 9: ${rows[2].absorbAttribute}`);
check(rep.counters === 1 && rep.suspended === 1 && rep.absorb === 1, `rapporto ${JSON.stringify(rep)}`);
const snap = JSON.stringify(rows);
mech.applyMechanics(rows, atts, table);
check(JSON.stringify(rows) === snap, 'non idempotente');

// master
const master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8'));
const byId = new Map(master.map((e) => [e.enemyId, e]));
const u = (id) => { const e = byId.get(id) || {}; return JSON.stringify([e.validUrgency, (e.urgency || [])[0], (e.urgencyValue || [])[0], (e.urgencyFrequency || [])[0], (e.urgencySkillId || [])[0]]); };
// contrattacchi 526-979: solo quelli con la mossa verificata; l'assorbimento resta
check(u(1912001620) === '[0,0,0,0,0]', `Chocolate Monster (q920) sospeso ${u(1912001620)}`);
check(byId.get(2103001650)?.absorbAttribute === 16 && byId.get(2509)?.absorbAttribute === 4, 'assorbimento Darkness/Gargoyle Wizard');
check(u(1501) === '[1,2,5,0,1501001]', `Gold Tricholoma originale toccato ${u(1501)}`);
const counted = master.filter((e) => e.validUrgency > 0 && e.enemyId !== 1501 && !(e.enemyId >= 160911501 && e.enemyId <= 160951501));
// mosse a 0 verificate (26-10): 44 nemici di 24 famiglie, ognuno con una riga d'attacco esistente; Chocolate Monster resta spento
const attIds = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemyAttack.json'), 'utf8')).map((a) => a.enemyAttackId));
check(counted.length === 41, `nemici con contatore ${counted.length}, attesi 41 (Green Requiem in attesa della grafica)`);
check(counted.every((e) => attIds.has(e.urgencySkillId[0]) && e.urgencyFrequency[0] === 0), 'mossa a 0 senza riga di attacco');
check(u(1502) === '[0,0,0,0,0]', `Green Requiem spento finche' non ha la sua grafica (I-194) ${u(1502)}`);
const src = JSON.parse(fs.readFileSync(require('./make-enemy-oltre').SOURCES_PATH, 'utf8')).sources;
check(counted.every((e) => src[e.enemyId]), 'contatore su un nemico delle missioni 1-525');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: enemy mechanics');
