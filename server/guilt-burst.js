// Burst (JP ギルトバースト, nel codice GuiltBurst): pulsante rosso in battaglia, una volta per
// missione, attacco a tutti i nemici con potenza dal livello Burst. Note in
// docs/notes/battaglia.md#burst.
//
// Il client crea il pulsante solo se:
// - userData.userDetail.isGuilt != 0;
// - userData.userPoint.guiltBurstLv != 0;
// - la battaglia non e' PvP.
// Poi costruisce l'attacco dalla riga medal 2 (STR e DEF) con potenza
// guiltBurstLv / 100 x battleMisc 134 / 10000 x 10000 (= Lv x 400 con battleMisc 134 = 40000), e
// legge le righe shuffleskill 901 e 902 (enemyKind/enemyKindRate) SENZA controllo
// del null: senza quelle righe il client va in crash all'avvio della battaglia. Righe: vedi
// make-guilt-burst.js.
//
// Livello (khux-guides.tumblr.com/post/152649620061): +1 alla prima guilt di ogni medaglia,
// +5 alla prima guilt massima; i valori stanno nella riga medal (addGuiltBurstLv,
// addGuiltBurstLvMax; nelle nostre tabelle 0, si usano 1 e 5). La guilt di una
// copia e' userMedal.guiltFactor (Level Up, server/medal-guilt.js, docs/notes/guilt.md):
// - prima guilt = la prima volta che una copia di una medaglia (medalId) con guiltValue > 0 ha
//   guiltFactor > 0;
// - guilt massima = la prima volta che una copia arriva al massimo del suo tier (guiltProb).
// Il conto e' un registro che non scende (player.guiltBurst = {first: [medalId], max: [medalId]}):
// la chiave e' groupId || medalId (sotto-progetto 2b): una boosted (riga a parte con groupId = la normale,
// medal-boost.js) e la sua normale contano come una medaglia sola; per le normali (groupId 0) e' il medalId.
// vendere o fondere la medaglia non toglie il livello, come nell'originale. I medalId registrati
// con le regole di prima (possesso, livello massimo) restano: il livello non scende.
//
// guiltBurstFirstUserMedalIds / guiltBurstMaxUserMedalIds (/stage/clear, draw,
// moogle shop, raid reward) = le copie che hanno appena dato la prima guilt / guilt massima: il
// client mostra il popup lwf/medal/guilt_bonus/GuiltBonus_BurstLvup(_num) «NOVA LEVEL UP!»: LWF JP
// importati dalle risorse 41 (import_jp_raisedraw.py, logo «NOVA» di make_nova_logo.py; senza LWF = crash).
// Popup acceso per default dal sotto-progetto 2b; KHUX_GUILT_BURST_POPUP=0 lo spegne (liste [] e
// guiltBurstFirstLv/MaxLv 0: il livello sale lo stesso, letto da userPoint).
// KHUX_GUILT_BURST_LV=<n>: livello fisso per le prove sul banco.
'use strict';

const { guiltRange } = require('./medal-guilt');

const FIRST_DEFAULT = 1;
const MAX_DEFAULT = 5;

function makeGuiltBurst({ getPlayer, userMedalList, masterRows }) {
  // copie che hanno appena dato un aumento, in attesa della prossima risposta con le liste
  const pending = { first: [], max: [] };

  function refresh() {
    const player = getPlayer();
    const rows = new Map(masterRows('medal').map((r) => [r.medalId, r]));
    const seed = !player.guiltBurst;   // primo giro su un salvataggio esistente: niente popup
    const rec = player.guiltBurst || (player.guiltBurst = { first: [], max: [] });
    const first = new Set(rec.first), max = new Set(rec.max);
    const guiltProb = masterRows('guiltProb');
    for (const m of userMedalList()) {
      const row = rows.get(m.medalId);
      // Tier: una boosted senza guiltValue prende quello della normale (groupId, decisione 13-bis)
      const tier = row ? row.guiltValue || rows.get(row.groupId)?.guiltValue || 0 : 0;
      if (!row || !(tier > 0) || !(m.guiltFactor > 0)) continue;
      const key = row.groupId || m.medalId;
      if (!first.has(key)) {
        first.add(key);
        rec.first.push(key);
        if (!seed) pending.first.push(m.userMedalId);
      }
      const top = guiltRange(guiltProb, tier).max;
      if (top > 0 && m.guiltFactor >= top && !max.has(key)) {
        max.add(key);
        rec.max.push(key);
        if (!seed) pending.max.push(m.userMedalId);
      }
    }
    return { rec, rows };
  }

  function level() {
    const fixed = process.env.KHUX_GUILT_BURST_LV;
    if (fixed !== undefined && fixed !== '') return Math.max(0, Number(fixed) || 0);
    const { rec, rows } = refresh();
    let lv = 0;
    for (const id of rec.first) lv += rows.get(id)?.addGuiltBurstLv || FIRST_DEFAULT;
    for (const id of rec.max) lv += rows.get(id)?.addGuiltBurstLvMax || MAX_DEFAULT;
    return lv;
  }

  // campi guiltBurst* delle risposte (/stage/clear, estrazioni, Level Up)
  function lists() {
    refresh();
    const out = { guiltBurstFirstUserMedalIds: [], guiltBurstMaxUserMedalIds: [] };
    if (process.env.KHUX_GUILT_BURST_POPUP !== '0') {
      out.guiltBurstFirstUserMedalIds = pending.first.slice();
      out.guiltBurstMaxUserMedalIds = pending.max.slice();
    }
    pending.first.length = 0;
    pending.max.length = 0;
    return out;
  }

  // guiltBurstFirstLv/MaxLv della risposta del Level Up (azione 55): livello d'ARRIVO del popup, 0 = nessun
  // popup. Il client mostra «LV <suo livello> » LV <campo>» (banco 17-10: con l'aumento al posto del livello
  // usciva «LV 6 » LV 1»): prima guilt = livello dopo i +1, guilt massima = livello dopo anche i +5. Con il
  // popup spento (KHUX_GUILT_BURST_POPUP=0) 0 (le copie in attesa si scartano alla prossima lists()).
  function gained() {
    const { rows } = refresh();
    const out = { first: 0, max: 0 };
    if (process.env.KHUX_GUILT_BURST_POPUP === '0') return out;
    const medalOf = new Map(userMedalList().map((m) => [m.userMedalId, m.medalId]));
    let addFirst = 0, addMax = 0;
    for (const id of pending.first) addFirst += rows.get(medalOf.get(id))?.addGuiltBurstLv || FIRST_DEFAULT;
    for (const id of pending.max) addMax += rows.get(medalOf.get(id))?.addGuiltBurstLvMax || MAX_DEFAULT;
    const after = level();
    if (addFirst) out.first = after - addMax;
    if (addMax) out.max = after;
    pending.first.length = 0;
    pending.max.length = 0;
    return out;
  }

  return { level, isGuilt: () => (level() > 0 ? 1 : 0), lists, gained };
}

module.exports = { makeGuiltBurst };
