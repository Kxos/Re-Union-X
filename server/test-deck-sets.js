// 3 deck per keyblade (update 1.1.2): userDecks, deck attivo e salvataggio con l'azione 45: node server/test-deck-sets.js
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const SAVE = path.join(os.tmpdir(), `khux-test-decks-${process.pid}.json`);
try { fs.unlinkSync(SAVE); } catch { /* nuovo */ }
process.env.KHUX_SAVE = SAVE; delete process.env.KHUX_PET;
const log = console.log; const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const { _test: t } = quiet(() => require('./server'));
const errors = []; const check = (ok, msg) => { if (!ok) errors.push(msg); };
const call = (fn, ...a) => { let b = null; quiet(() => fn({ writeHead() {}, end(x) { b = JSON.parse(x.toString('utf8')); } }, ...a)); return b; };
call(t.respondUserCreate, { name: 'Prova', unionId: 1 });
const p = t.player;
const ids = t.userMedalList().map((m) => m.userMedalId);
p.deck = [ids[0], ids[1], 0];
// senza keyblade a +20: un deck per keyblade
p.keyblades = [];
check(!t.multiDecksUnlocked() && t.userDecksData().length === 1, 'senza +20: un deck');
// con un keyblade a +20 (serie Starlight: 1200 = lv 20) tre deck consecutivi
p.keyblades = [{ userKeybladeId: 2, keybladeId: 1200, getDatetime: 0, burst: 0 }];
const decks = t.userDecksData();
check(t.multiDecksUnlocked() && decks.length === 6, `con +20: ${decks.length} deck`);
check(decks.slice(0, 3).map((d) => d.userDeckId).join() === '1,2000001,3000001' && decks.every((d, i) => d.userKeybladeId === (i < 3 ? 1 : 2)), `id dei deck: ${decks.map((d) => d.userDeckId)}`);
check(decks[0].deckMedals[0] === ids[0] && decks[1].deckMedals.every((x) => x === 0), 'deck 1 = il deck di prima, deck 2 vuoto');
// salvataggio del deck 2 e cambio del deck attivo
let r = call(t.respondKeybladeUpdate, { userKeyblades: [{ userKeybladeId: 1, userDeckId: 2000001, isFavorite: 1 }], userDecks: [{ userDeckId: 2000001, medals: [ids[2], 0, 0], petBaseSlotMedal: 0 }] });
check(t.activeDeck(1) === 2 && t.keybladeDeckIds(1)[0] === ids[2], `deck attivo 2: ${JSON.stringify(p.keybladeDeckSets)}`);
check(r.userKeyblades.find((k) => k.userKeybladeId === 1).userDeckId === 2000001, 'userKeyblades: deck attivo');
check(JSON.stringify(p.deck) === JSON.stringify([ids[0], ids[1], 0]), 'deck 1 intatto');
// Unequip toglie la medaglia anche dal deck 2
call(t.respondMedalRemove, { removeUserMedalId: ids[2] });
check(p.keybladeDeckSets[1][2][0] === 0, 'Unequip dal deck 2');
// ritorno al deck 1
call(t.respondKeybladeUpdate, { userKeyblades: [{ userKeybladeId: 1, userDeckId: 1, isFavorite: 1 }], userDecks: [] });
check(t.activeDeck(1) === 1 && t.keybladeDeckIds(1)[0] === ids[0], 'ritorno al deck 1');
// senza +20 il deck attivo torna 1 e i deck 2/3 non si salvano
call(t.respondKeybladeUpdate, { userKeyblades: [{ userKeybladeId: 1, userDeckId: 3000001, isFavorite: 1 }], userDecks: [] });
p.keyblades = [];
check(t.activeDeck(1) === 1, 'senza +20: deck 1');

try { fs.unlinkSync(SAVE); } catch { /* tolto */ }
if (errors.length) { log(`ERRORI (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
log('OK: deck sets');
