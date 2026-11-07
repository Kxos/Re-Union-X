// Event Catalog web pages (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 5, spec
// docs/superpowers/specs/2026-11-06-events-design.md): WebView opened from the Details button of the Event Catalog banner (evStage
// catalogEvStage of make-events.js) in the Events tab, the details page of an event and the original notice of an event (Details
// of its card). Pure HTML, no player or master access: server.js passes the index (game_data/events.json) and the context
// (routes-events.js catalogCtx plus the pages' lookups). Same style as the Raid Catalog (raid-pages.js, approved 06-11): the
// shared parts come from catalog-pages.js (Keep button and script, merged «On this server» box with «Rebuilt values» closed and
// its colour bands, «Original notice» card, notice layout).
// ctx: {shopFrom, shopTo, current (Set of census ids listed now), kept (census id), imgVersion, fromCatalog, from,
// unlockQuestOf(entry) -> N | null, stageDone(stageId) -> true when that quest has all its objectives done (crown),
// hasNotice(censusId) -> true when its original notice text is on this server}.
// States (calendar-util.js rowState): now (listed this Shop week), kept, can (past: can be kept), other (dates inside the week,
// not open now: a short-window event off its day), later, removed (no quest served yet: «Not restored yet», never hidden).
'use strict';
const special = require('./special-pages');
const { rowState } = require('./calendar-util');
const parts = require('./catalog-pages');

const { CSS, DETAIL_CSS, esc, niceDay, monthYear, icon, CROWN, gameYearOf, GAME_YEARS } = special;
const { PAGE_HEAD, pill, RULE_CSS, SRV_CSS, FOLD_CSS, NOTICE_CSS, rebuiltValues, srvFrame, noticeCard, parseNotice, noticeBlocks, backBar } = parts;

const BASE = '/web/event';
const keepButton = (id, on, extra = '') => parts.keepButton(BASE, id, on, extra);
const KEEP_JS = parts.keepJs(BASE, 'event');
// the pills the page script writes after a keep / remove: [row class, html]
const PILLS = { kept: ['pinned', `${icon('pin')}Kept in the event list`], can: ['can', `${icon('pin')}Past event — can be kept`] };
const dateRange = (e) => `${niceDay(e.start)} – ${niceDay(e.end || e.start)}`;
const imgOf = (ctx, id) => `${BASE}/img/v${ctx.imgVersion || 1}/${id}.png`;
const detailHref = (id) => `${BASE}/event/${id}?from=catalog`;
const servedOf = (e) => (e.quests || []).filter((q) => q.served);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// A quest not served yet, in plain words (make-events.js `why` holds the builder's note: enemy ids, map keys)
function whyPlain(why) {
  const w = String(why || '');
  if (/^enemies not in the master/.test(w)) return 'An enemy of this quest is still being searched for in the surviving game files: the quest comes back when it is found.';
  if (/raid or Special/.test(w)) return 'It is a raid or Special quest: it is served by the Raid Catalog or the Special tab instead.';
  if (/^rooms of another world/.test(w)) return 'Its original map lies in another world than the quest itself: it is held back until it is checked.';
  if (/^map key/.test(w)) return 'Its map is also the map of another quest in the surviving game data: it cannot be served on its own yet.';
  return 'Its data is not complete in the surviving game files yet.';
}

// Status of an event: show (state), cls (side bar), pill (status line), button (1 Keep, 0 Remove, null none), why (details page)
function statusOf(e, ctx) {
  const st = rowState(e, ctx);
  if (st === 'removed') {
    const raidish = /raid or Special/.test(e.why || '');
    return { show: st, cls: 'off', pill: pill('off', 'removed', 'Not restored yet'), button: null,
      why: raidish ? 'Its quests are raid or Special quests: they are served by the Raid Catalog or the Special tab.'
        : 'None of its quests can be served yet: the reasons are listed with the quests below. It comes back when they are recovered.' };
  }
  if (st === 'other') {
    return { show: st, cls: 'other', pill: pill('other', '', 'This week, not open now'), button: null,
      why: 'Your Story has reached its dates, but it is not open in the Events tab now (a short event opens only on its own day). It cannot be kept while its week is current.' };
  }
  if (st === 'now') return { show: st, cls: 'now', pill: pill('now', 'now', 'In Events this week'), button: null, why: 'It is in the Events tab this week, as in the original game.' };
  if (st === 'kept') {
    return { show: st, cls: 'pinned', pill: pill(PILLS.kept[0], '', PILLS.kept[1]), button: 0,
      why: 'You keep this event in the Events tab, beside the events of the week. A quest of one original day opens on that weekday.' };
  }
  if (st === 'can') {
    return { show: st, cls: 'can', pill: pill(PILLS.can[0], '', PILLS.can[1]), button: 1,
      why: 'Its dates are over: you can keep it in the Events tab, one event at a time. Its rewards are the same as in its dates, so a quest reward is never given twice.' };
  }
  const q = ctx.unlockQuestOf ? ctx.unlockQuestOf(e) : undefined;
  const text = q === undefined ? 'Reached later in the Story' : q === null ? 'Not reached in this version of the Story' : `Unlocks at Story Quest ${q}`;
  const why = q === undefined || q === null ? 'Its dates come later in the Story: it opens when your Story reaches them.' : `Its dates come later in the Story: it opens when you reach Story Quest ${q}.`;
  return { show: 'later', cls: 'off', pill: pill('off', 'later', text), button: null, why };
}
const keptOf = (entries, ctx) => entries.find((e) => rowState(e, ctx) === 'kept');
// «Replaces: <kept event>» over a Keep button; hidden on the kept row, which gets it back when another event is kept (kxRow)
const replacesLine = (st, kept) => (st.button === null ? ''
  : `<div class="rp"${st.button === 1 && kept ? '' : ' style="display:none"'}>${st.button === 1 && kept ? `Replaces: ${esc(kept.name || kept.censusId)}` : ''}</div>`);
// every served quest with its objectives done (ctx.stageDone, the crown rule of the Special and Raid Catalogs)
const doneOf = (e, ctx) => !!ctx.stageDone && servedOf(e).length > 0 && servedOf(e).every((q) => ctx.stageDone(q.stageId));
const entriesOf = (index) => ((index && index.entries) || []).filter((e) => e && e.censusId && e.evStageId && e.start)
  .slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.evStageId - b.evStageId));
// an entry by its id or by the id of one of its original evStage rows (Part 2 Task 5: the Details of a row card)
const entryOfId = (entries, id) => entries.find((x) => x.evStageId === id) || entries.find((x) => (x.rows || []).some((r) => r.evStageId === id));

// ES5: a row opens its details page; after a keep / remove the kept row turns gold, the previous one back to «can be kept»
const ROWS_JS = `(function(){var PILL=__PILL__;
function attr(el,a){return el.getAttribute(a);}
var rows=[].slice.call(document.querySelectorAll('.row'));
function setRow(el,st){var pc=PILL[st];el.setAttribute('data-show',st);el.className='row '+pc[0];var s=el.querySelector('.s');if(s){s.className='s s-'+pc[0];s.innerHTML=pc[1];}
var b=el.querySelector('.pk');if(b)kxSet(b,attr(el,'data-eid'),st==='kept');}
window.kxRow=function(id,on){var name='',i,el;for(i=0;i<rows.length;i++){el=rows[i];if(attr(el,'data-show')==='kept')setRow(el,'can');if(attr(el,'data-eid')===id){setRow(el,on?'kept':'can');if(on)name=attr(el,'data-name');}}
for(i=0;i<rows.length;i++){var x=rows[i].querySelector('.rp');if(x){x.textContent=name?'Replaces\\u003a '+name:'';x.style.display=name&&attr(rows[i],'data-show')==='can'?'':'none';}}};
rows.forEach(function(el){el.onclick=function(e){var t=e.target;while(t&&t!==el){if(t.tagName==='A')return;t=t.parentNode;}location.href=attr(el,'data-href');};});
})();`;

// GET /web/event/catalog: every event of the index by date, one month label per month, one minimal row per event (card, name,
// date line, ONE status line, at most ONE Keep button, «›»). A record with no quest served yet is listed as «Not restored yet».
function catalogPage(index, ctx = {}) {
  const entries = entriesOf(index), kept = keptOf(entries, ctx);
  let lastM = '', rows = '';
  for (const e of entries) {
    const st = statusOf(e, ctx), href = detailHref(e.evStageId), m = e.start.slice(0, 7), served = servedOf(e).length, all = (e.quests || []).length;
    if (m !== lastM) rows += `<div class="ml" data-m="${m}">${monthYear(`${m}-01`)}</div>`;
    lastM = m;
    const line = `${dateRange(e)} · ${served === all ? plural(all, 'quest') : `${served} of ${plural(all, 'quest')} served`}`;
    rows += `<div class="row ${st.cls}" id="q${e.evStageId}" data-href="${href}" data-name="${esc(e.name || e.censusId)}" data-eid="${e.evStageId}" data-show="${st.show}" data-y="${e.start.slice(0, 4)}">`
      + `<a class="im" href="${href}"><img width="320" height="70" src="${imgOf(ctx, e.evStageId)}" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${esc(e.name || e.censusId)}${doneOf(e, ctx) ? CROWN : ''}</a><div class="d">${line}</div>${st.pill}`
      + `${replacesLine(st, kept)}${st.button === null ? '' : `<div>${keepButton(e.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(on){kxRow(b.getAttribute(\'data-id\'),on);})"')}</div>`}`
      + `</div><a class="go" href="${href}" aria-label="Details">›</a></div>\n`;
  }
  const restored = entries.filter((e) => e.available).length;
  return PAGE_HEAD('Event Catalog', CSS) + '<body>'
    + '<div class="hdr"><h1>Event Catalog</h1></div>'
    + '<p class="n">Every event of the game, by date. Tap an event for its quests. A past event can be kept in the Events tab, one at a time. The Event Catalog is an addition of this server.</p>'
    + `<div class="sum"><span class="n1">${plural(entries.length, 'event')}</span> · ${restored} with quests served</div>`
    + `<div id="rows">${rows || '<p class="n">No events.</p>'}</div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${KEEP_JS}</script><script>${ROWS_JS.replace('__PILL__', JSON.stringify(PILLS))}</script></body></html>`;
}

// The labels of events.json in the player's words: [group, short label, one short line, icon]; the full sentence is the reason
// of the index (event_config.json reconstructedWhy), folded under «Why these values?»
const EVENT_SHORT = {
  donorKept: ['values', 'Later game data', 'Used instead of the wiki page (the 2018 run)', 'replaced'],
  wikiLowConfidence: ['values', 'Wiki value', 'From khuxwiki, not confirmed by a second source', 'replaced'],
  noWikiPage: ['values', 'No wiki page', 'Later game data only, no second source', 'replaced'],
  wikiAp: ['values', 'AP', 'From the khuxwiki page of this run', 'replaced'],
  mapIncomplete: ['values', 'Map', 'Incomplete in our data: the gaps are reported', 'removed'],
  eventCoins: ['rewards', 'Event Coins', 'Not paid yet: they come with the event boards', 'camp'],
  wholeDay: ['rules', 'Opening time', 'Its whole original day (was a short window)', 'bonus'],
  dramaOff: ['rules', 'Scenes', 'The original scenes are not shown yet', 'later'],
};
const EVENT_LABEL = { wikiAp: 'AP', donorKept: 'later game data', wikiLowConfidence: 'a wiki value', noWikiPage: 'no wiki page', mapIncomplete: 'map', eventCoins: 'Event Coins',
  wholeDay: 'opening time', dramaOff: 'scenes' };
const EVENT_GROUPS = [['values', 'Quest data', 'tleg', ''], ['rewards', 'Rewards', 'camp', ' rw'], ['rules', 'Rules', 'weekday', ' ru'], ['other', 'Other', 'replaced', ' ot']];
// every label in use: the event's and its quests' (served or not), in the order of EVENT_SHORT, unknown ones last
const codesOf = (e) => {
  const all = new Set([...(e.labels || []), ...(e.quests || []).flatMap((q) => q.labels || [])]);
  return [...Object.keys(EVENT_SHORT).filter((c) => all.has(c)), ...[...all].filter((c) => !EVENT_SHORT[c]).sort()];
};
function rebuilt(e, reasons = {}) {
  const codes = codesOf(e);
  const fold = `<ul class="pl">${codes.map((c) => `<li><b>${esc((EVENT_SHORT[c] || [])[1] || EVENT_LABEL[c] || c)}</b>: ${esc(reasons[c] || 'rebuilt from the surviving sources.')}</li>`).join('')}</ul>`;
  return rebuiltValues(codes, { groups: EVENT_GROUPS, short: EVENT_SHORT, label: (c) => EVENT_LABEL[c] || c, fold });
}
// the quests not served yet, under the rebuilt values
const notServedLine = (e) => {
  const n = (e.quests || []).filter((q) => !q.served).length;
  return n ? `<p class="sbo">${icon('lock')}Not served yet: ${n} of ${plural((e.quests || []).length, 'quest')} (the reasons are with the quests below).</p>` : '';
};
function srvBox(e, st, index, o) {
  return srvFrame(st, { ...o, body: rebuilt(e, (index && index.reasons) || {}) + notServedLine(e) }, 'camp');
}
const EVENT_DETAIL_CSS = '.tt{table-layout:auto}.tt td:nth-child(2),.tt td:nth-child(3){white-space:nowrap}.tt td.r{color:#ffcd4a}.tt small{display:block;color:#b9cfdc;font-size:13px}';
const daysText = (days) => days.map(niceDay).join(', ');

// GET /web/event/event/<evStageId>: header (name, card), the «On this server» box first (status, Keep button, the Story line,
// Rebuilt values closed, quests not served yet, links), then the event and its quests (each served or «Not served yet» with the
// reason in plain words). null = unknown id (404).
function detailPage(index, evStageId, ctx = {}) {
  const entries = entriesOf(index), e = entryOfId(entries, Number(evStageId));
  if (!e) return null;
  const st = statusOf(e, ctx), kept = keptOf(entries, ctx), title = e.name || e.censusId;
  const button = st.button === null ? '' : `<div>${keepButton(e.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(){b.style.display=\'none\';})"')}</div>`;
  const quests = e.quests || [];
  const kv = [['Dates', dateRange(e)], ['Game year', GAME_YEARS[gameYearOf(e.start)].name],
    ['Quests', quests.length === servedOf(e).length ? String(quests.length) : `${servedOf(e).length} of ${quests.length} served`],
    ...(Array.isArray(e.days) && e.days.length ? [['Open', `Only on ${daysText(e.days)} (its whole day)`]] : [])].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const qRows = quests.map((q) => {
    const done = q.served && ctx.stageDone && ctx.stageDone(q.stageId);
    const day = Array.isArray(q.days) && q.days.length ? `<small>Open on ${esc(daysText(q.days))}</small>` : '';
    return `<tr><td>${esc(q.name || '')}${done ? CROWN : ''}${day}</td><td>${q.level ?? ''}</td><td>${q.ap ?? ''}</td>`
      + (q.served ? '<td>Served</td>' : `<td class="r">Not served yet<small>${esc(whyPlain(q.why))}</small></td>`) + '</tr>';
  }).join('');
  // the original evStage rows of the event (Part 2 Task 5): one card each in the Events tab, with its own dates and quests
  const rows = Array.isArray(e.rows) && e.rows.length > 1 ? e.rows : [];
  const cards = rows.length ? `<h2>Cards</h2><p class="n">In the original game this event showed ${rows.length} cards in the Events tab, each with its own dates and quests.</p>`
    + `<table class="tt"><tr><th>Card</th><th>Dates</th><th>Quests</th></tr>${rows.map((r) => `<tr><td>${r.available && r.evStageId ? `<img width="160" height="35" src="${imgOf(ctx, r.evStageId)}" alt="">` : ''}</td>`
      + `<td>${esc(`${niceDay(r.start)}${r.end && r.end !== r.start ? ` – ${niceDay(r.end)}` : ''}`)}${Array.isArray(r.days) && r.days.length ? '<small>its whole day</small>' : ''}</td>`
      + (r.available ? `<td>${esc(plural((r.stageIds || []).length, 'quest'))}</td>` : `<td class="r">Not served yet<small>${esc(plural(r.quests || 0, 'quest'))}</small></td>`) + '</tr>').join('')}</table>` : '';
  const back = ctx.fromCatalog ? backBar(`${BASE}/catalog#q${e.evStageId}`) : '';
  const notice = ctx.hasNotice && ctx.hasNotice(e.censusId) ? 'Original notice of this event ›' : '';
  const box = srvBox(e, st, index, { after: `<div id="pinmsg" class="pinmsg"></div>${replacesLine(st, kept)}${button}`,
    intro: `This server follows your Story, not the calendar: this event of the original game (${esc(dateRange(e))}) opens when your Story reaches it.`,
    links: [...(notice ? [[`${BASE}/notice/${e.evStageId}?from=event`, notice]] : []), [`${BASE}/catalog`, 'Event Catalog ›']] });
  return PAGE_HEAD(title, CSS + DETAIL_CSS + EVENT_DETAIL_CSS + RULE_CSS + SRV_CSS + FOLD_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(title)}</h1><img class="banner" width="640" height="140" src="${imgOf(ctx, e.evStageId)}" alt="">${box}`
    + `<h2>Event</h2><table class="kv">${kv}</table>`
    + cards + `<h2>Quests</h2><table class="tt"><tr><th>Quest</th><th>LV</th><th>AP</th><th>Status</th></tr>${qRows}</table>`
    + `<p class="n">The Event Catalog is an addition of this server: in the original game an event was played only in its own dates.</p>${back}<script>${KEEP_JS}</script></body></html>`;
}

// GET /web/event/notice/<evStageId> (Details of an event card, as in the original game): the event's original notice(s). doc =
// game_data/event_notices.json (make-event-notices.js, git-ignored SQUARE ENIX text, read at request time by server.js):
// {rows: {censusId: {noticeIds}}, notices: {id: {title, date, time, category, body: [lines]}}}. Laid out as the raid notices
// (catalog-pages.js noticeBlocks: every sentence unchanged), one «Original notice» card per notice; a notice of several events
// shows the sections that name this event when some do, else all of it. ctx.from === 'event': BACK to the details page. No
// notice (no file, unknown id, no text): a friendly page, never an error.
const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function noticeSections(body, name) {
  const { sections } = parseNotice(body);
  const named = sections.filter((s) => s.head), n = compact(name);
  const mine = n ? named.filter((s) => compact(s.head).includes(n) || n.includes(compact(s.head))) : [];
  return (named.length > 1 && mine.length ? mine : sections).map((s) => `<div class="ns">${s.head ? `<h2>${esc(s.head)}</h2>` : ''}${noticeBlocks(s.lines)}</div>`).join('');
}
function noticeMissing(e, ctx) {
  const back = e && ctx.from === 'event' ? backBar(`${BASE}/event/${e.evStageId}?from=catalog`) : '';
  return PAGE_HEAD('Notice not available', CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}><h1>Notice not available</h1>`
    + '<p class="na">The original notice of this event is not available on this server.'
    + (e ? ` <a href="${BASE}/event/${e.evStageId}">See this event in the Event Catalog ›</a>` : '') + `</p>${back}</body></html>`;
}
function noticePage(index, evStageId, doc, ctx = {}) {
  let e = null;
  try {
    e = entryOfId(entriesOf(index), Number(evStageId)) || null;
    const hit = e && doc && doc.rows ? doc.rows[e.censusId] : null;
    const notices = (hit && doc.notices ? hit.noticeIds || [] : []).map((id) => doc.notices[id]).filter((n) => n && Array.isArray(n.body));
    if (!notices.length) return noticeMissing(e, ctx);
    const n = notices[0], st = statusOf(e, ctx);
    const back = ctx.from === 'event' ? backBar(`${BASE}/event/${e.evStageId}?from=catalog`) : '';
    return PAGE_HEAD(n.title, CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}>`
      + `<img class="banner" width="640" height="140" src="${imgOf(ctx, e.evStageId)}" alt="">`
      + `<h1>${esc(n.title)}</h1><p class="dt">${n.category ? `<span class="chip">${esc(n.category)}</span>` : ''}<span class="chip d">${esc(niceDay(n.date))}${n.time ? ` · ${esc(n.time)} UTC` : ''}</span></p>`
      + srvBox(e, st, index, { intro: 'Below: the original notice of this event, unchanged (top-player lists left out). '
        + `Its dates are the original game's (${esc(dateRange(e))}): here the event opens when your Story reaches them.`,
        links: [[`${BASE}/event/${e.evStageId}`, 'This event in the Event Catalog ›'], [`${BASE}/catalog`, 'Event Catalog ›']] })
      + notices.map((x) => noticeCard('camp', x.date, noticeSections(x.body, e.name))).join('')
      + `${back}</body></html>`;
  } catch (err) {
    return noticeMissing(e, ctx);
  }
}

module.exports = { catalogPage, detailPage, noticePage, statusOf, whyPlain };
