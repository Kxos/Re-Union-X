// Contatori e assorbimento dei nemici 526-979 (enemy-mechanics.js, I-207): node server/test-enemy-mechanics.js
'use strict';
const fs = require('fs'); const path = require('path');
const mech = require('./enemy-mechanics');
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };

// unita': contrattacco = attacco piu' forte contro il giocatore (potenza x colpi, poi display 1), mai una cura
const atts = [
  { enemyAttackId: 10, name: 'Attack', target: 1, power: 10000, hitCount: 2, display: 0 },
  { enemyAttackId: 11, name: 'Attack', target: 1, power: 20000, hitCount: 1, display: 1 },
  { enemyAttackId: 12, name: 'Heal All Allies', target: 3, power: 90000, hitCount: 1, display: 1, heal: 5000 },
  { enemyAttackId: 13, name: 'Increase STR of All Allies by 1 Tier', target: 2, power: 90000, hitCount: 1, display: 1 },
];
const rows = [
  { enemyId: 7, validSkill: 4, skillId: [10, 11, 12, 13], validUrgency: 0, urgency: [0, 0, 0], urgencyValue: [0, 0, 0],
    urgencyFrequency: [0, 0, 0], urgencySkillId: [0, 0, 0], absorbAttribute: 0 },
  { enemyId: 8, validSkill: 1, skillId: [12, 0, 0, 0], validUrgency: 0, urgency: [0, 0, 0], urgencyValue: [0, 0, 0],
    urgencyFrequency: [0, 0, 0], urgencySkillId: [0, 0, 0], absorbAttribute: 0 },
  { enemyId: 9, validSkill: 1, skillId: [10, 0, 0, 0], validUrgency: 0, absorbAttribute: 0 },
];
const table = { counters: { 7: { urgency: 3, value: 20 }, 8: { urgency: 2, value: 3 } }, absorb: { 9: { kinds: ['magic', 'reversed'] } } };
const rep = mech.applyMechanics(rows, atts, table);
check(JSON.stringify([rows[0].validUrgency, rows[0].urgency, rows[0].urgencyValue, rows[0].urgencyFrequency, rows[0].urgencySkillId])
  === '[1,[3,0,0],[20,0,0],[0,0,0],[11,0,0]]', `contatore 7: ${JSON.stringify(rows[0])}`);
check(rows[1].validUrgency === 0 && rep.noAttack.includes(8), 'nemico senza attacchi: contatore saltato e segnalato');
check(rows[2].absorbAttribute === 4 + 16 && rows[2].validUrgency === 0, `assorbimento 9: ${rows[2].absorbAttribute}`);
check(rep.counters === 1 && rep.absorb === 1, `rapporto ${JSON.stringify(rep)}`);
const snap = JSON.stringify(rows);
mech.applyMechanics(rows, atts, table);
check(JSON.stringify(rows) === snap, 'non idempotente');

// master
const master = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_data', 'enemy.json'), 'utf8'));
const byId = new Map(master.map((e) => [e.enemyId, e]));
const u = (id) => { const e = byId.get(id) || {}; return JSON.stringify([e.validUrgency, (e.urgency || [])[0], (e.urgencyValue || [])[0], (e.urgencyFrequency || [])[0], (e.urgencySkillId || [])[0]]); };
check(u(1912001620) === '[1,3,20,0,13701]', `Chocolate Monster (q920, 20-hit) ${u(1912001620)}`);
check(u(1502) === '[1,2,2,0,500]', `Green Requiem (q592, 2-attack) ${u(1502)}`);
check(u(1542) === '[1,3,10,0,13101]', `Golden Hook Bat (hit 10) ${u(1542)}`);
check(u(2103001650).startsWith('[1,7,3,0,'), `Darkness (q977, slot 3) ${u(2103001650)}`);
check(byId.get(2103001650)?.absorbAttribute === 16 && byId.get(2509)?.absorbAttribute === 4, 'assorbimento Darkness/Gargoyle Wizard');
check(u(1501) === '[1,2,5,0,1501001]', `Gold Tricholoma originale toccato ${u(1501)}`);
const counted = master.filter((e) => e.validUrgency > 0 && e.enemyId !== 1501 && !(e.enemyId >= 160911501 && e.enemyId <= 160951501));
check(counted.length === 127, `nemici con contatore ${counted.length}, attesi 127`);
const src = JSON.parse(fs.readFileSync(require('./make-enemy-oltre').SOURCES_PATH, 'utf8')).sources;
check(counted.every((e) => src[e.enemyId]), 'contatore su un nemico delle missioni 1-525');

if (errors.length) { console.log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('OK: enemy mechanics');
