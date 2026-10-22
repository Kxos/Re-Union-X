// Potenziamento ed evoluzione dei keyblade, sub-slot. Note in docs/notes/server.md#keyblade.
//
// Livello del keyblade = la riga della tabella master keyblade: ogni livello ha il suo
// keybladeId (serie*1000 + livello*10, oltre +20 serie*1000 + 200 + livello-20) e la riga dice
// i materiali per passare al livello dopo (validNeedMaterial, needMaterialId/Num) e il keybladeId
// del livello dopo (evolveId, 0 = massimo). La 5.0.1 ha tenuto solo i livelli col cambio di slot
// o di design: le righe in mezzo le rigenera make-keyblade-levels.js.
//
// POST /keyblade/enhance (azione 54, corpo {userKeybladeId}), dal pulsante
// «Strengthen» della finestra KEYBLADE. Il client legge dalla risposta:
// userKeyblades, userDecks, userMaterials,
// userTitles. Niente munny (nessun userPoint nella risposta). Dopo la risposta il client
// confronta il displayId (riga keyblade) del keyblade di prima e di quello
// nuovo: uguali -> risultato (DeckEdit_KBStrength_Result_ver210 +
// lwf/result/KeyEvo_LevelUp); diversi -> animazione lwf/memudemo/KeyBlade_Evolution
// (movie «keyblade_previous» e «keyblade») e poi il risultato. Il risultato confronta slot per
// slot accord/dlaccord vecchi e nuovi (frecce) e per uno slot nuovo carica
// lwf/keyblade/KeyEvo/KeyEvo_Medal_01B, KeyEvo_eff e medal_blank_slot%d.
//
// GET /keyblade/subslot (191) e POST /keyblade/subslot (192, corpo
// {updateKeybladeSubslots: [{keybladeSubslotId, subslotMedals: [{"<slotNumber>": userMedalId}, ...]}]}).
// Risposta 192: subslotMaxNum + userKeybladeSubslots, userKeyblades.
// Il riquadro Equipment scrive «Subslot n/m»: m = lunghezza di subslots[] del keyblade,
// n = voci con userMedalId != 0; il pulsante si abilita se misc 780 (= 7, stelle minime) >= 7.
//
// PUT /passive/list (249, corpo {isList}; I-065): «Passive Effects» di Equipment. Vedi
// respondPassiveList piu' sotto e server/make-passives.js per le tabelle master.
'use strict';

// Bonus dei sub-slot per tier della medaglia (guiltValue), in millesimi di moltiplicatore:
// guida dell'utente (pag. 11) tier 1-8 = +0.001 .. +0.025; 9-10 non documentati (stima).
const TIER_SUBSLOT = [0, 1, 2, 5, 8, 12, 16, 20, 25, 30, 35];
// unita' di subslotRate: millesimi * SUBSLOT_SCALE. Txt_SubSlot_Rate scrive
// «+%01.3f» con (k * subslotRate / 100) / 1000: con k = subslotRate della riga keyblade / 100
// (160 per Treasure Trove) una tier 8 da' +0.040 = 0.025 x 1.6. k non e' ancora verificato:
// se il numero sul banco e' 100 volte troppo grande o piccolo, cambiare KHUX_SUBSLOT_SCALE.
const SUBSLOT_SCALE = Number(process.env.KHUX_SUBSLOT_SCALE || 1);

function routeKeybladeEvo(p) {
  if (p === '/keyblade/enhance') return 'kbenhance';
  if (p === '/keyblade/burst/max') return 'kbburstmax';
  if (p === '/passive/list') return 'passivelist';
  return null;
}

// ctx: { ret, send, serverTime, masterRows, player, savePlayer, ownedKeyblades, userMedalList,
//        userKeybladesData, userDecksData, userMaterialsData, userTitlesData, USER_KEYBLADE_ID,
//        luxLevel }
function makeKeybladeEvo(ctx) {
  const { player } = ctx;
  const rowOf = (id) => ctx.masterRows('keyblade').find((r) => r.keybladeId === id);

  // keybladeId attuale di Starlight (userKeybladeId 1): player.starlightKeybladeId, se potenziato
  function starlightKeybladeId(defaultId) {
    return player.starlightKeybladeId || defaultId;
  }

  function setKeybladeId(userKeybladeId, keybladeId) {
    if (userKeybladeId === ctx.USER_KEYBLADE_ID) player.starlightKeybladeId = keybladeId;
    else {
      const k = (player.keyblades || []).find((x) => x.userKeybladeId === userKeybladeId);
      if (k) k.keybladeId = keybladeId;
    }
  }

  function needMaterials(row) {
    const n = Math.min(row.validNeedMaterial || 0, (row.needMaterialId || []).length);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (row.needMaterialId[i] > 0 && row.needMaterialNum[i] > 0) out.push([row.needMaterialId[i], row.needMaterialNum[i]]);
    }
    return out;
  }

  // POST /keyblade/enhance {userKeybladeId}: un livello. KHUX_KB_FREE=1 = senza materiali (prove).
  function respondEnhance(res, body) {
    const id = Number(body?.userKeybladeId);
    const k = ctx.ownedKeyblades().find((x) => x.userKeybladeId === id);
    const row = k && rowOf(k.keybladeId);
    const next = row && row.evolveId && rowOf(row.evolveId);
    const free = process.env.KHUX_KB_FREE === '1';
    player.materials = player.materials || {};
    const need = row ? needMaterials(row) : [];
    const missing = need.filter(([m, n]) => (player.materials[m] || 0) < n);
    if (!next) {
      console.log(`  [keyblade] enhance ${id}: ${row ? `${row.name} al massimo` : 'keyblade sconosciuto'}`);
    } else if (missing.length && !free) {
      console.log(`  [keyblade] enhance ${row.name}: materiali mancanti ${missing.map(([m, n]) => `${m}x${n}(${player.materials[m] || 0})`).join(' ')}`);
    } else {
      if (!free) for (const [m, n] of need) player.materials[m] -= n;
      setKeybladeId(id, next.keybladeId);
      player.keybladeEnhanceCount = (player.keybladeEnhanceCount || 0) + 1;
      // gauge degli attacchi speciali: non oltre il massimo della riga nuova
      const kk = (player.keyblades || []).find((x) => x.userKeybladeId === id);
      // burst in unita' interne, 10000 per tacca (banco: 24000 = 2, 48068 = 4); confrontato
      // con maxBurstGauge in tacche la gauge finiva a 9 = 0 tacche
      if (kk && kk.burst > next.maxBurstGauge * 10000) kk.burst = next.maxBurstGauge * 10000;
      if (id === ctx.USER_KEYBLADE_ID && player.keybladeBurst > next.maxBurstGauge * 10000) player.keybladeBurst = next.maxBurstGauge * 10000;
      ctx.savePlayer();
      console.log(`  [keyblade] enhance ${row.name} (${row.keybladeId}) -> ${next.name} (${next.keybladeId})`
        + `${next.displayId !== row.displayId ? ', evoluzione (design ' + next.displayId + ')' : ''}`
        + `${(next.validConsist || 0) > (row.validConsist || 0) ? ', slot ' + next.validConsist : ''}`
        + `${free ? ' [KHUX_KB_FREE]' : ', materiali ' + need.map(([m, n]) => `${m}x${n}`).join(' ')}`);
    }
    ctx.send(res, 200, {
      ret: ctx.ret(),
      userKeyblades: ctx.userKeybladesData(),
      userDecks: ctx.userDecksData(),
      userMaterials: ctx.userMaterialsData(),
      // solo i titoli guadagnati ORA (il client mostra «You earned a title!» per ognuno: con
      // l'elenco completo comparivano tutti, banco 11-10), come /stage/clear
      userTitles: [],
    });
  }

  // POST /keyblade/burst/max (azione 53) {userKeybladeId, kind}: «Max Out Gauge» dal riquadro
  // del keyblade prima della quest (popup PopupNormal_Ability_MAX, costo = misc
  // 120, 30 jewel). Il client legge solo userKeyblade.
  function respondBurstMax(res, body) {
    const id = Number(body?.userKeybladeId);
    const k = ctx.ownedKeyblades().find((x) => x.userKeybladeId === id);
    const row = k && rowOf(k.keybladeId);
    const cost = ctx.masterRows('misc').find((r) => r.miscId === 120)?.value ?? 30;
    if (!row) console.log(`  [keyblade] burst/max ${id}: keyblade sconosciuto`);
    else if ((player.freeStone || 0) < cost) console.log(`  [keyblade] burst/max: jewel insufficienti (${player.freeStone || 0} < ${cost})`);
    else {
      player.freeStone -= cost;
      const full = row.maxBurstGauge * 10000;
      const kk = (player.keyblades || []).find((x) => x.userKeybladeId === id);
      if (kk) kk.burst = full;
      else if (id === ctx.USER_KEYBLADE_ID) player.keybladeBurst = full;
      ctx.savePlayer();
      console.log(`  [keyblade] burst/max ${row.name}: gauge ${row.maxBurstGauge} tacche (${full}), -${cost} jewel`);
    }
    const out = ctx.userKeybladesData().find((x) => x.userKeybladeId === id);
    ctx.send(res, 200, { ret: ctx.ret(), userKeyblade: out || ctx.userKeybladesData()[0] });
  }

  // ---- sub-slot ---------------------------------------------------------------------------
  // Righe keybladeSubslot della serie: {subslotId, category, slotNumber, attribute, darklight}
  // (+ campo in piu' «lv»: livello del keyblade che apre lo slot, ignorato dal client).
  function subslotRows(keybladeId) {
    const row = rowOf(keybladeId);
    if (!row) return [];
    const max = subslotMaxNum();
    return ctx.masterRows('keybladeSubslot')
      .filter((r) => r.category === row.category && r.slotNumber <= max && (r.lv ?? 0) <= (row.lv || 0))
      .sort((a, b) => a.slotNumber - b.slotNumber);
  }

  // 120 nell'originale (schermata giapponese «サブスロット 0/120»); KHUX_SUBSLOT_MAX=0 li spegne
  // (Equipment torna a «Subslot 0/0»)
  function subslotMaxNum() {
    const n = ctx.masterRows('keybladeSubslot').reduce((m, r) => Math.max(m, r.slotNumber || 0), 0);
    return process.env.KHUX_SUBSLOT_MAX != null ? Number(process.env.KHUX_SUBSLOT_MAX) : n;
  }

  // medaglie nei sub-slot: player.keybladeSubslots[userKeybladeId] = {slotNumber: userMedalId}
  function subslotMedals(k) {
    const saved = (player.keybladeSubslots || {})[k.userKeybladeId] || {};
    const owned = new Set(ctx.userMedalList().map((m) => m.userMedalId));
    return subslotRows(k.keybladeId).map((r) => {
      const id = Number(saved[r.slotNumber]) || 0;
      return { slotNumber: r.slotNumber, userMedalId: owned.has(id) ? id : 0 };
    });
  }

  // somma dei bonus per tier delle medaglie nei sub-slot. Tier come il badge del client: con
  // guiltValue 0 si risale la catena dell'Evolve fino alla forma che ce l'ha (le 1-5★ hanno 0, la 6★ il tier)
  function medalTier(byId, row) {
    for (let r = row, n = 0; r && n < 10; r = r.validEvolve ? byId.get(r.evolveId) : null, n++) {
      if (r.guiltValue) return r.guiltValue;
    }
    return 0;
  }
  function subslotRate(k) {
    const byId = new Map(ctx.masterRows('medal').map((r) => [r.medalId, r]));
    const byUser = new Map(ctx.userMedalList().map((m) => [m.userMedalId, m]));
    let sum = 0;
    for (const s of subslotMedals(k)) {
      if (!s.userMedalId) continue;
      sum += TIER_SUBSLOT[medalTier(byId, byId.get(byUser.get(s.userMedalId)?.medalId))] || 0;
    }
    return sum * SUBSLOT_SCALE;
  }

  function userKeybladeSubslotsData() {
    return ctx.ownedKeyblades().map((k) => ({
      keybladeSubslotId: k.userKeybladeId, // = userKeybladeSubslotId del keyblade
      subslotRate: subslotRate(k), // uint
      subslots: subslotMedals(k), // {slotNumber, userMedalId uint64}, 0 = vuoto
    }));
  }

  // subslotRate di userKeyblades[]: il moltiplicatore dei sub-slot della riga keyblade
  function keybladeSubslotRate(keybladeId) {
    return rowOf(keybladeId)?.subslotRate ?? 10000;
  }

  // GET (191) / POST (192) /keyblade/subslot
  function respondSubslot(res, method, body) {
    if (method === 'POST') {
      const owned = new Map(ctx.ownedKeyblades().map((k) => [k.userKeybladeId, k]));
      player.keybladeSubslots = player.keybladeSubslots || {};
      for (const u of body?.updateKeybladeSubslots || []) {
        const id = Number(u.keybladeSubslotId);
        const k = owned.get(id);
        if (!k) continue;
        const valid = new Set(subslotRows(k.keybladeId).map((r) => r.slotNumber));
        const cur = { ...(player.keybladeSubslots[id] || {}) };
        // banco v33: il client manda un array di oggetti a una chiave, [{"1":2004},{"2":2039},...]
        // (non un oggetto unico): si uniscono. Con Object.entries sull'array finiva tutto a 0
        const sm = Array.isArray(u.subslotMedals) ? Object.assign({}, ...u.subslotMedals) : (u.subslotMedals || {});
        for (const [slot, medal] of Object.entries(sm)) {
          if (valid.has(Number(slot))) cur[Number(slot)] = Number(medal) || 0;
        }
        // una medaglia sta in un solo sub-slot di questo keyblade: l'ultima scritta vince
        player.keybladeSubslots[id] = cur;
        console.log(`  [keyblade] subslot ${id}: ${JSON.stringify(cur)}`);
      }
      ctx.savePlayer();
      return ctx.send(res, 200, {
        ret: ctx.ret(), subslotMaxNum: subslotMaxNum(), userKeybladeSubslots: userKeybladeSubslotsData(),
        userKeyblades: ctx.userKeybladesData(),
      });
    }
    return ctx.send(res, 200, { ret: ctx.ret(), subslotMaxNum: subslotMaxNum(), userKeybladeSubslots: userKeybladeSubslotsData() });
  }

  // medaglia tolta (venduta, usata come materiale, Unequip): via anche dai sub-slot
  function removeMedal(userMedalId) {
    for (const s of Object.values(player.keybladeSubslots || {})) {
      for (const n of Object.keys(s)) if (Number(s[n]) === userMedalId) s[n] = 0;
    }
  }

  // ---- passive (I-065) ---------------------------------------------------------------------
  // PUT /passive/list (azione 249), corpo {isList}: isList 1 al login (dopo /user/medal...) e
  // al tocco di «Passive Effects» nel Profilo (I-086; quello di Equipment apre la pagina web);
  // isList 0 dopo «Strengthen» (e dove il client cerca passive nuove). Il client legge, oltre a isList:
  //   isList 1 -> passiveSettingIds[] (uint), isList 0 -> newPassiveSettingIds[] (uint).
  // Senza l'array la risposta e' rifiutata e il pulsante
  // non apre la lista delle passive: era il «non succede niente» di I-065.
  // Con isList 1 il client legge anche userId: nullo/assente -> lista propria;
  // presente -> lista di un altro giocatore
  // (profilo altrui). isList 0: le nuove si aggiungono alla lista propria e
  // le mostra il popup PassiveResult (nome + description).
  // Lista delle passive (layout Passive_Base_ver341 + celle Passive_Panel): una
  // cella per passiveSetting (nome della riga passive), «There are no passive effects.»
  // (testo 106220507, Txt_None) se la lista e' vuota; riquadro Total: HP,
  // SP ATK Gauge, STR, DEF e STR per tipo di medaglia (testi 106230203..217).
  // Quali passive ha il giocatore lo decide il server dalle condizioni di make-passives.js:
  // 1 = livello Lux >= passiveValue1, 2 = keyblade della serie passiveValue1 a livello*10 >=
  // passiveValue2 (il livello piu' alto tra quelli posseduti della serie).
  function ownedPassiveSettingIds() {
    const best = new Map(); // category -> livello*10 piu' alto
    for (const k of ctx.ownedKeyblades()) {
      const row = rowOf(k.keybladeId);
      if (!row) continue;
      const lv10 = row.lv10 ?? Math.round((row.lv || 0) * 10); // lv10: livelli oltre +35 (make-keyblade-levels.js)
      if ((best.get(row.category) ?? -1) < lv10) best.set(row.category, lv10);
    }
    const lux = ctx.luxLevel ? ctx.luxLevel() : 0;
    return ctx.masterRows('passiveSetting').filter((s) => {
      if (s.passiveConditions === 1) return lux >= s.passiveValue1;
      if (s.passiveConditions === 2) return (best.get(s.passiveValue1) ?? -1) >= s.passiveValue2;
      return false;
    }).sort((a, b) => a.sortId - b.sortId).map((s) => s.passiveSettingId);
  }

  function respondPassiveList(res, body) {
    const ids = ownedPassiveSettingIds();
    // player.passiveSettingIds = quelle gia' comunicate: isList 0 manda solo le altre (le
    // aggiunge alla lista del client, che altrimenti le avrebbe doppie)
    const known = new Set(player.passiveSettingIds || []);
    const fresh = ids.filter((id) => !known.has(id));
    if (fresh.length || ids.length !== known.size) {
      player.passiveSettingIds = ids;
      ctx.savePlayer();
    }
    if (Number(body?.isList) === 0) {
      console.log(`  [passive] nuove: ${fresh.length ? fresh.join(' ') : 'nessuna'} (totale ${ids.length})`);
      return ctx.send(res, 200, { ret: ctx.ret(), newPassiveSettingIds: fresh });
    }
    // Profilo di un altro giocatore (I-086): il pulsante Button_Passive del Profilo
    // manda userId solo se il profilo non e' il proprio; il client
    // apre allora la lista di quel giocatore, riempita solo
    // se la risposta ha userId. Si rimanda l'userId: lista propria se e' il nostro (1), vuota
    // per gli altri (non ne abbiamo i dati).
    const otherId = Number(body?.userId) || 0;
    if (otherId) {
      const list = otherId === 1 ? ids : [];
      console.log(`  [passive] elenco di ${otherId}: ${list.length} passive`);
      return ctx.send(res, 200, { ret: ctx.ret(), passiveSettingIds: list, userId: otherId });
    }
    console.log(`  [passive] elenco: ${ids.length} passive`);
    return ctx.send(res, 200, { ret: ctx.ret(), passiveSettingIds: ids });
  }

  // Pagina web di «Passive Effects» (I-065): il pulsante di Equipment (DeckEdit_PassiveBut_ver340)
  // e Button_PassiveInfo della lista delle passive aprono il popup web
  // Information2_Base (titolo 106220508) sull'URL passiveSettingList del login: con '' restava
  // bianco. Le passive possedute (nome della riga passive + description di passiveSetting) o il
  // testo 106220507. La query aggiunta dal client si ignora.
  function respondPassivePage(res) {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const set = new Map(ctx.masterRows('passiveSetting').map((s) => [s.passiveSettingId, s]));
    const pas = new Map(ctx.masterRows('passive').map((p) => [p.passiveId, p]));
    const rows = ownedPassiveSettingIds().map((id) => set.get(id)).filter(Boolean)
      .map((s) => `<li><b>${esc(pas.get(s.passiveId)?.name)}</b><br>${esc(s.description)}</li>`).join('');
    const html = '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>body{margin:0;padding:12px;background:#08304f;color:#fff;font:18px sans-serif}'
      + 'ul{list-style:none;margin:0;padding:0}li{padding:10px 4px;border-bottom:1px solid #2f6fa8}'
      + '.none{text-align:center;margin-top:30%}</style></head><body>'
      + (rows ? `<ul>${rows}</ul>` : '<p class="none">There are no passive effects.</p>')
      + '</body></html>';
    const buf = Buffer.from(html, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
    res.end(buf);
  }

  return {
    respondEnhance, respondBurstMax, respondSubslot, userKeybladeSubslotsData, subslotMaxNum, keybladeSubslotRate,
    starlightKeybladeId, removeMedal, respondPassiveList, respondPassivePage,
  };
}

module.exports = { makeKeybladeEvo, routeKeybladeEvo, TIER_SUBSLOT };
