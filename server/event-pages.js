// Event Catalog web pages (Events Part 1, plan docs/superpowers/plans/2026-11-06-events-part1-framework.md Task 5, spec
// docs/superpowers/specs/2026-11-06-events-design.md): WebView opened from the Details button of the Event Catalog banner (evStage
// catalogEvStage of make-events.js) in the Events tab, the details page of an event and the original notice of an event (Details
// of its card). Pure HTML, no player or master access: server.js passes the index (game_data/events.json) and the context
// (routes-events.js catalogCtx plus the pages' lookups). Same style as the Raid Catalog (raid-pages.js, approved 06-11): the
// shared parts come from catalog-pages.js (Keep button and script, merged «On this server» box with «Rebuilt values» closed and
// its colour bands, «Original notice» card, notice layout).
// ctx: {shopFrom, shopTo, current (Set of census ids listed now), kept (census id), imgVersion, fromCatalog, from,
// unlockQuestOf(entry) -> N | null, stageDone(stageId) -> true when that quest has all its objectives done (crown, PROGRESS filter),
// hasNotice(censusId) -> true when its original notice text is on this server, eventBoard(boardId) -> {name, cells, finish} | null
// (Event Boards of the details page; their names and rewards also feed FIND), questRewards(stageId) -> [names of the objective
// rewards] (FIND; absent: none)}.
// States (calendar-util.js rowState): now (listed this Shop week), kept, can (past: can be kept), other (dates inside the week,
// not open now: a short-window event off its day), later, removed (no quest served yet: «Not restored yet», never hidden).
'use strict';
const special = require('./special-pages');
const { rowState } = require('./calendar-util');
const parts = require('./catalog-pages');

const { CSS, DETAIL_CSS, esc, niceDay, monthYear, icon, CROWN, gameYearOf, GAME_YEARS, YEAR_SPAN, MATCH_JS, PROG_OPTS, progCls } = special;
const { PAGE_HEAD, pill, RULE_CSS, SRV_CSS, FOLD_CSS, NOTICE_CSS, rebuiltValues, srvFrame, noticeCard, parseNotice, noticeBlocks, backBar, packCatalog, expandCatalog, UNPACK_JS,
  FILTER_BUTTON, filterOpts, optLabels, filterSheet } = parts;

const BASE = '/web/event';
const keepButton = (id, on, extra = '') => parts.keepButton(BASE, id, on, extra);
const KEEP_JS = parts.keepJs(BASE, 'event');
// the pills the page script writes after a keep / remove: [row class, html]
const PILLS = { kept: ['pinned', `${icon('pin')}Kept in the event list`], can: ['can', `${icon('pin')}Past event — can be kept`] };
const dateRange = (e) => `${niceDay(e.start)} – ${niceDay(e.end || e.start)}`;
// the catalogue's date line: one day once (Part 4: about 340 short events, catalog_size_budget)
const dateLine = (e) => (!e.end || e.end === e.start ? niceDay(e.start) : dateRange(e));
const imgOf = (ctx, id) => `${BASE}/img/v${ctx.imgVersion || 1}/${id}.png`;
// a record whose original notice had no banner has no card file (Gem Boards 20014/20017/20040, user 08-11): the broken-image
// icon is replaced by a plain box of the same size
const NO_CARD = (w, h) => ` onerror="this.outerHTML='<span style=&quot;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;`
  + `width:${w}px;max-width:100%;height:${h}px;border:1px solid #2f6f93;border-radius:6px;background:#06283e;color:#b9cfdc;font-size:13px&quot;>No card in the original</span>'"`;
// the same box on the catalogue rows, from one function (written before the rows: an image can fail while the page loads)
const NO_CARD_JS = `function kxNc(im){var s=document.createElement('span');s.className='nc';s.textContent='No card in the original';im.parentNode.replaceChild(s,im);}`;
const NO_CARD_CSS = '.nc{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:320px;max-width:100%;height:70px;border:1px solid #2f6f93;'
  + 'border-radius:6px;background:#06283e;color:#b9cfdc;font-size:13px}';
const detailHref = (id) => `${BASE}/event/${id}?from=catalog`;
const servedOf = (e) => (e.quests || []).filter((q) => q.served);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// A quest not served yet, in plain words (make-events.js `why` holds the builder's note: enemy ids, map keys). Part 4 Task 4: the
// reasons whose why is the player's text of event_config.json reasonText (or a fixed line here)
const PLAIN_REASONS = {
  boosterOnly: 'Every reward of this quest is a Booster: it comes back with the Boosters, in a later update.',
  rewardTypeUnknown: 'A reward of this quest is of a kind this server cannot give yet: the quest comes back when it can.',
  quizTextMissing: 'The picture board with the question of this quiz is not in the surviving game files: the quest comes back when its board is rebuilt.',
  objectiveMismatch: 'Its objectives differ between the khuxwiki page and the surviving game data: it is held back until they are confirmed.',
  // Part 5 Task 3
  objectiveUnmapped: 'An objective of this quest is known only from its text: it is held back until the surviving game data proves it, never served with a guessed one.',
  enemyAmbiguous: 'Our game data holds several versions of one of its enemies with different strength: it is held back until the right one is confirmed.',
};
function whyPlain(why, reason) {
  if (PLAIN_REASONS[reason]) return PLAIN_REASONS[reason];
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
  : `<div class="rp"${st.button === 1 && kept ? '' : ' style="display:none"'}>${st.button === 1 && kept ? `Replaces: ${esc(catName(kept))}` : ''}</div>`);
// every served quest with its objectives done (ctx.stageDone, the crown rule of the Special and Raid Catalogs)
const doneOf = (e, ctx) => !!ctx.stageDone && servedOf(e).length > 0 && servedOf(e).every((q) => ctx.stageDone(q.stageId));
// an informative notice, not a playable event (user 08-11): no quest of its own, no original card (noQuests 'board', the signal
// that also leaves its card out in make_event_banners.py card_ids) and no evStage row with a card. Not in the catalogue, no page
// (e.g. EV-0579 «New Event Coins Available in October!»: its boards are reached through the playable events of their set).
// Part 4 Task 4: noQuests 'notice' too (an information notice of the challenge records, notice_row_not_listed)
// Part 5 Task 3: a second notice of an event (scheduleLineOf, make-events.js reason scheduleLine) is listed under its event only
const informative = (e) => (['board', 'notice'].includes(e.noQuests) || !!e.scheduleLineOf) && !(e.quests || []).length && !(e.rows || []).some((r) => r.available);
// the name of an event in the Event Catalog: catalogName (make-events.js, the original banner names the event otherwise), else its name
const catName = (e) => e.catalogName || e.name || e.censusId;
const entriesOf = (index) => ((index && index.entries) || []).filter((e) => e && e.censusId && e.evStageId && e.start && !informative(e))
  .slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.evStageId - b.evStageId));
// an entry by its id or by the id of one of its original evStage rows (Part 2 Task 5: the Details of a row card)
const entryOfId = (entries, id) => entries.find((x) => x.evStageId === id) || entries.find((x) => (x.rows || []).some((r) => r.evStageId === id));

// ES5: a row opens its details page; after a keep / remove the kept row turns gold, the previous one back to «can be kept»
const ROWS_JS = `(function(){var PILL=__PILL__;
function attr(el,a){return el.getAttribute(a);}
var rows=[].slice.call(document.querySelectorAll('.row'));
function href(el){return '/web/event/event/'+attr(el,'data-eid')+'?from=catalog';}
function nameOf(el){var n=el.querySelector('.nm');return n?n.textContent:'';}
window.kxK=function(b){return kxKeep(b,function(on){kxRow(b.getAttribute('data-id'),on);});};
function setRow(el,st){var pc=PILL[st];el.setAttribute('data-show',st);el.className='row '+pc[0]+(/ hide/.test(el.className)?' hide':'');var s=el.querySelector('.s');if(s){s.className='s s-'+pc[0];s.innerHTML=pc[1];}
var b=el.querySelector('.pk');if(b)kxSet(b,attr(el,'data-eid'),st==='kept');}
window.kxRow=function(id,on){var name='',i,el;for(i=0;i<rows.length;i++){el=rows[i];if(attr(el,'data-show')==='kept')setRow(el,'can');if(attr(el,'data-eid')===id){setRow(el,on?'kept':'can');if(on)name=nameOf(el);}}
for(i=0;i<rows.length;i++){var x=rows[i].querySelector('.rp');if(x){x.textContent=name?'Replaces\\u003a '+name:'';x.style.display=name&&attr(rows[i],'data-show')==='can'?'':'none';}}if(window.kxRender)kxRender();};
rows.forEach(function(el){el.onclick=function(e){var t=e.target;while(t&&t!==el){if(t.tagName==='A')return;t=t.parentNode;}location.href=href(el);};});
})();`;

// Filters (user 13-11: «filters like the Raid Catalog», raid-pages.js): FIND / SHOW / PROGRESS / TYPE in a sheet, the summary line
// with its chips, the empty-state line and «Matches:» under a row found by FIND.
// TYPE of an event: the type of its census row (index entries .type); only the kinds in the index get a chip, an unknown one by its code
const TYPE_OPTS = [['all', 'All'], ['EQ', 'Event Quests', 'camp'], ['STORY', 'Story Events', 'avatar'], ['GEM', 'Gem Quests', 'jewel'], ['COIN', 'Event Coins', 'medal'],
  ['KEY', 'Keyblade Challenges', 'skill'], ['QUIZ', 'Quizzes', 'daily'], ['CELEB', 'Celebrations', 'lux']];
const typeOf = (e) => String(e.type || 'EQ');
const SHOW_OPTS = [['all', 'All events'], ['now', 'In Events now', 'now'], ['can', 'Can be kept now', 'pin'], ['kept', 'Kept', 'pin'], ['later', 'Later in the Story', 'later'],
  ['removed', 'Not restored yet', 'removed']];
// «In Events now» shows the kept event too (the Raid Catalog's rule); «other» (this week, not open now) only under All events
const SHOW_SETS = { now: ['now', 'kept'] };
// item names of an event for FIND («Matches:»): its names, quest names, type, Event Board names and rewards, the objective
// rewards of its served quests; without repeats (case aside). boards: memo of ctx.eventBoard for the page
const bareReward = (r) => String(r || '').replace(/ x\d+$/, '');
// a series of quests numbered at the end («Organization XIII No. 11 Marluxia I» … «XIII», «… Advanced #1» … «#3», «Coco
// Challenge 1/10» … «10/10») counts once, by the name without its numbers (the page stays light: about 3,500 quest names give
// about 550 names); a name of its own in its event stays whole
const seriesBase = (n) => {
  let s = String(n || '').replace(/#\d+|\b\d+\/\d*/g, ' '), o;
  do { o = s; s = s.replace(/[\s:#,./-]*(?:\d+|\b[IVXL]+)?[\s:#,./-]*$/, ''); } while (s !== o);
  return s.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
};
const questNames = (quests) => {
  const base = seriesBase, count = new Map();
  for (const q of quests) count.set(base(q.name), (count.get(base(q.name)) || 0) + 1);
  return quests.map((q) => (base(q.name) && count.get(base(q.name)) > 1 ? base(q.name) : q.name));
};
function searchOf(e, ctx, index, boards) {
  const set = e.boardSet && ((index && index.boardSets) || {})[e.boardSet];
  const board = (id) => { if (!boards.has(id)) boards.set(id, ctx.eventBoard(id)); return boards.get(id); };
  const bs = set && ctx.eventBoard ? (set.boardIds || []).map(board).filter(Boolean) : [];
  const type = TYPE_OPTS.find((o) => o[0] === typeOf(e));
  const parts = [catName(e), e.name, ...questNames(e.quests || []), type ? type[1] : '',
    ...bs.flatMap((b) => [b.name, ...b.cells.map((c) => c.reward), b.finish].map(bareReward)).filter((x) => !/^(Max (HP|AP|Cost) \+|Reward$)/.test(x)),
    ...(ctx.questRewards ? servedOf(e).flatMap((q) => ctx.questRewards(q.stageId)) : [])];
  const seen = new Set();
  return parts.map((x) => String(x || '').replace(/\s+/g, ' ').replace(/ \| /g, ' / ').trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(' | ');
}
// ES5, no external script (the Raid Catalog's filter script without its sections and year chips): rows read once at start; a
// game-year tab (Part 4 Task 6: the Shop's game years, data-p) and the Filters sheet only toggle a class; then the cards of the
// shown rows load (kxImgs of UNPACK_JS: lazy loading per tab). A keep / remove (kxRow of ROWS_JS) renders again. A #q<id> link
// to a row of another year opens that year.
const FILTER_JS = `(function(){/* year tabs and filters */
var PN=__PN__,LAB={type:__TYPE__,show:__SHOW__,prog:__PROG__},SHOWSET=__SHOWSET__;
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var tabs=$('tabs');if(!tabs)return;
var kids=[].slice.call($('rows').children),rows=[],i;
for(i=0;i<kids.length;i++)if(/(^| )row( |$)/.test(kids[i].className))rows.push({el:kids[i],p:attr(kids[i],'data-p'),t:attr(kids[i],'data-type'),dn:attr(kids[i],'data-done')==='1',
ns:(attr(kids[i],'data-search')||'').split(' | '),mt:kids[i].querySelector?kids[i].querySelector('.mt'):null});
function blank(p){return {p:p,type:'all',show:'all',prog:'all',q:''};}
var cur=blank(attr(tabs,'data-def')||'all'),dr=null;
function copy(s){return {p:s.p,type:s.type,show:s.show,prog:s.prog,q:s.q};}
function hits(r,qq,max){var o=[],i;for(i=0;i<r.ns.length&&o.length<max;i++)if(khuxMatch(qq,r.ns[i]))o.push(r.ns[i]);return o;}
function match(r,s,anyPeriod){
if(!anyPeriod&&s.p!=='all'&&r.p!==s.p)return false;
if(s.type!=='all'&&r.t!==s.type)return false;
if(s.show!=='all'&&(SHOWSET[s.show]||[s.show]).indexOf(attr(r.el,'data-show'))<0)return false;
if(s.prog!=='all'&&r.dn!==(s.prog==='done'))return false;
return !s.q||hits(r,s.q,1).length>0;}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.type!=='all'?1:0)+(s.show!=='all'?1:0)+(s.prog!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function hide(el,h){el.className=el.className.replace(/ hide/g,'')+(h?' hide':'');}
function render(){
var c={all:0},n=0,i,r,on,lab=null,any=false,el;
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true)){c.all++;c[r.p]=(c[r.p]||0)+1;}on=match(r,cur);hide(r.el,!on);if(on)n++;}
// a month label without a shown row is hidden
for(i=0;i<kids.length;i++){el=kids[i];if(/(^| )ml( |$)/.test(el.className)){if(lab)hide(lab,!any);lab=el;any=false;}else if(/(^| )row( |$)/.test(el.className)&&!/ hide/.test(el.className))any=true;}
if(lab)hide(lab,!any);
[].forEach.call(tabs.querySelectorAll('.tab'),function(t){var p=attr(t,'data-p'),k=t.querySelector?t.querySelector('.c'):null;t.className='tab'+(p===cur.p?' on':'');if(k)k.textContent=c[p]||0;});
var f=nf(cur),h='<span class="n1">'+plural(n,'event')+'</span>';
if(cur.p!=='all')h+=' in <b>'+esc(PN[cur.p])+'</b>';
if(!f)h+=' · no filters';
else{h+=' match your filters:';
if(cur.type!=='all')h+=' '+tag('type',LAB.type[cur.type]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.prog!=='all')h+=' '+tag('prog',LAB.prog[cur.prog]);
if(cur.q)h+=' '+tag('q','Find: &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;if(typeof kxImgs==='function')kxImgs();$('fdot').textContent=f?f:'';
for(i=0;i<rows.length;i++){r=rows[i];if(!r.mt)continue;var w=cur.q&&r.el.className.indexOf(' hide')<0?hits(r,cur.q,3):[];r.mt.textContent=w.length?'Matches: '+w.join(', '):'';r.mt.style.display=w.length?'block':'none';}
var none=$('none'),wq=(cur.prog==='done'?'completed ':cur.prog==='todo'?'incomplete ':'')+'events';none.textContent=n?'':(cur.q?'No '+wq+' match "'+cur.q+'"':'No '+wq+' match your filters');none.style.display=n?'none':'';}
window.kxRender=render;
function sync(){[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr),'result');}
function openF(){dr=copy(cur);$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){dr.q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var t=e.target;while(t&&t!==box&&!attr(t,'data-v'))t=t.parentNode;var v=attr(t,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();dr.type='all';dr.show='all';dr.prog='all';dr.q='';$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr)return;var s=dr;s.p=cur.p;closeF();cur=s;render();};
$('sum').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-x'))t=t.parentNode;var x=attr(t,'data-x');if(!x)return;e.preventDefault();
if(x==='type'||x==='all')cur.type='all';if(x==='show'||x==='all')cur.show='all';if(x==='prog'||x==='all')cur.prog='all';if(x==='q'||x==='all')cur.q='';render();};
tabs.onclick=function(e){var t=e.target;while(t&&t!==tabs&&!attr(t,'data-p'))t=t.parentNode;if(!t||t===tabs)return;cur.p=attr(t,'data-p');render();};
var h=location.hash?$(location.hash.slice(1)):null;if(h&&cur.p!=='all'&&attr(h,'data-p')&&attr(h,'data-p')!==cur.p)cur.p=attr(h,'data-p');
render();if(h&&h.scrollIntoView)h.scrollIntoView();})();`;

// GET /web/event/catalog: every event of the index by date, one month label per month, one minimal row per event (card, name,
// date line, ONE status line, at most ONE Keep button, «›»). A record with no quest served yet is listed as «Not restored yet».
function catalogPage(index, ctx = {}) {
  const entries = entriesOf(index), kept = keptOf(entries, ctx);
  let lastM = '';
  const packed = [], boards = new Map();
  for (const e of entries) {
    const st = statusOf(e, ctx), href = detailHref(e.evStageId), m = e.start.slice(0, 7), served = servedOf(e).length, all = (e.quests || []).length;
    const label = m !== lastM ? `<div class="ml" data-m="${m}">${monthYear(`${m}-01`)}</div>` : '';
    lastM = m;
    const line = `${dateLine(e)} · ${served === all ? plural(all, 'quest') : `${served} of ${plural(all, 'quest')} served`}`, name = esc(catName(e)), y = e.start.slice(0, 4);
    const done = doneOf(e, ctx), search = esc(searchOf(e, ctx, index, boards)), t = typeOf(e);
    // one minimal row (Part 4 Task 4, catalog_size_budget: about 340 events): the row opens its page (ROWS_JS, from data-eid), the
    // name is the link, the missing card box and the Keep handler are functions of the page; the rows are sent packed, as the
    // Raid Catalog's (catalog-pages.js packCatalog), and the cards load from data-src once the rows are built (kxImgs). The
    // filters read data-p (game year), data-show, data-type, data-done and data-search (FIND names); «Matches:» goes in .mt
    packed.push({ label, fields: { s: search, d: line, n: name, e: String(e.evStageId), y, t }, html: `<div class="row ${st.cls}" id="q${e.evStageId}" data-eid="${e.evStageId}" data-show="${st.show}" data-y="${y}" data-p="${gameYearOf(e.start)}"`
      + ` data-type="${t}" data-done="${done ? 1 : 0}" data-search="${search}">`
      + `<span class="im"><img width="320" height="70" data-src="${imgOf(ctx, e.evStageId)}" alt="" onerror="kxNc(this)"></span>`
      + `<div class="info"><a class="nm" href="${href}">${name}${done ? CROWN : ''}</a><div class="d">${line}</div>${st.pill}`
      + `${replacesLine(st, kept)}${st.button === null ? '' : `<div>${keepButton(e.evStageId, st.button, ' onclick="return kxK(this)"')}</div>`}`
      + '<div class="mt"></div></div><span class="go">›</span></div>\n' });
  }
  // game-year tabs (the Raid Catalog's): All years + every game year with events, its count; the year of the Story week first
  const perYear = GAME_YEARS.map((g, i) => entries.filter((e) => gameYearOf(e.start) === i).length);
  const shopYear = ctx.shopFrom ? gameYearOf(ctx.shopFrom) : null, def = shopYear !== null && perYear[shopYear] ? String(shopYear) : 'all';
  const tab = (p, name, sub, n) => `<button type="button" class="tab${p === def ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b><small>${esc(sub)}</small><span class="c">${n}</span></button>`;
  const tabsHtml = entries.length ? `<div class="tabs" id="tabs" data-def="${def}">${tab('all', 'All years', YEAR_SPAN, entries.length)}`
    + `${GAME_YEARS.map((g, i) => (perYear[i] ? tab(String(i), g.name, g.sub, perYear[i]) : '')).join('')}</div><div class="tabline"></div>` : '';
  // the Filters sheet (the Raid Catalog's: FIND, SHOW, PROGRESS, then TYPE with the kinds of the index only)
  const kinds = new Set(entries.map(typeOf));
  const typeOpts = [...TYPE_OPTS.filter((o, i) => !i || kinds.has(o[0])), ...[...kinds].filter((k) => !TYPE_OPTS.some((o) => o[0] === k)).sort().map((k) => [k, k])];
  const n0 = def === 'all' ? entries.length : perYear[Number(def)];
  const js = FILTER_JS.replace('__PN__', JSON.stringify(Object.fromEntries(GAME_YEARS.map((g, i) => [i, g.name])))).replace('__TYPE__', optLabels(typeOpts))
    .replace('__SHOW__', optLabels(SHOW_OPTS)).replace('__PROG__', optLabels(PROG_OPTS)).replace('__SHOWSET__', JSON.stringify(SHOW_SETS)).replace('__MATCH__', () => MATCH_JS);
  const sheet = filterSheet({ placeholder: 'Event, quest or reward name', n: n0,
    hint: 'Matches the start of words in event and quest names and in the rewards of the quests and Event Boards (e.g. Halloween, Marluxia, Dewey).',
    groups: [['SHOW', `<div class="opts" data-g="show">${filterOpts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v}`))}</div>`],
      ['PROGRESS', `<div class="opts" data-g="prog">${filterOpts(PROG_OPTS, progCls)}</div>`],
      ['TYPE', `<div class="opts" data-g="type">${filterOpts(typeOpts)}</div>`]] });
  return PAGE_HEAD('Event Catalog', CSS + NO_CARD_CSS) + `<body><script>${NO_CARD_JS}</script>`
    + `<div class="hdr"><h1>Event Catalog</h1>${packed.length ? FILTER_BUTTON : ''}</div>`
    + '<p class="n">Every event of the game, by date. Tap an event for its quests. A past event can be kept in the Events tab, one at a time. The Event Catalog is an addition of this server.</p>'
    + tabsHtml
    + `<div class="sum" id="sum"><span class="n1">${plural(n0, 'event')}</span>${def === 'all' ? '' : ` in <b>${esc(GAME_YEARS[Number(def)].name)}</b>`} · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows">${packed.length ? '' : '<p class="n">No events.</p>'}</div>`
    + (packed.length ? `<script id="kxrows" type="application/json">${packCatalog(packed)}</script><script>${UNPACK_JS}</script>${sheet}` : '')
    + `<div id="pinmsg" class="pinmsg"></div><script>${KEEP_JS}</script><script>${ROWS_JS.replace('__PILL__', JSON.stringify(PILLS))}</script>${packed.length ? `<script>${js}</script>` : ''}</body></html>`;
}

// The labels of events.json in the player's words: [group, short label, one short line, icon]; the full sentence is the reason
// of the index (event_config.json reconstructedWhy), folded under «Why these values?»
const EVENT_SHORT = {
  donorKept: ['values', 'Later game data', 'Used instead of the wiki page (the 2018 run)', 'replaced'],
  wikiLowConfidence: ['values', 'Wiki value', 'From khuxwiki, not confirmed by a second source', 'replaced'],
  noWikiPage: ['values', 'No wiki page', 'Later game data only, no second source', 'replaced'],
  wikiAp: ['values', 'AP', 'From the khuxwiki page of this run', 'replaced'],
  mapIncomplete: ['values', 'Map', 'Incomplete in our data: the gaps are reported', 'removed'],
  eventCoins: ['rewards', 'Event Coins', 'Paid into the boards of this event; they never expire', 'camp'],
  boardsLater: ['rewards', 'Event boards', 'Not served yet: they come back whole with the Boosters (a later update); your coins are kept', 'later'],
  noCoinSource: ['rewards', 'Event boards', 'Not handed out yet: no quest pays their Event Coins', 'later'],
  boosterLater: ['rewards', 'Boosters', 'A Booster reward comes with the Boosters (a later update); the other rewards are paid', 'later'],
  noBoardSet: ['rewards', 'Event Coins', 'No board set named for them: logged, not paid', 'removed'],
  communityBonus: ['rewards', 'Community goal', 'Clear every objective: the bonus the original event reached, once, in your Presents', 'bonus'],
  completionReward: ['rewards', 'Completion reward', 'Clear every objective: the reward every finisher got, once, in your Presents', 'camp'],
  quizBoard: ['values', 'Quiz board', 'Redrawn from the khuxwiki text of the question', 'replaced'],
  wholeDay: ['rules', 'Opening time', 'Its whole original day (was a short window)', 'bonus'],
  dramaOff: ['rules', 'Scenes', 'The original scenes are not shown yet', 'later'],
};
const EVENT_LABEL = { wikiAp: 'AP', donorKept: 'later game data', wikiLowConfidence: 'a wiki value', noWikiPage: 'no wiki page', mapIncomplete: 'map', eventCoins: 'Event Coins',
  wholeDay: 'opening time', dramaOff: 'scenes', boardsLater: 'event boards', noCoinSource: 'event boards', boosterLater: 'Boosters', noBoardSet: 'Event Coins', quizBoard: 'quiz board',
  communityBonus: 'community goal', completionReward: 'completion reward' };
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
const EVENT_DETAIL_CSS = '.tt{table-layout:auto}.tt td:nth-child(2),.tt td:nth-child(3){white-space:nowrap}.tt td.r{color:#ffcd4a}.tt small{display:block;color:#b9cfdc;font-size:13px}'
  + '.tt.bt td:nth-child(2){white-space:normal}.bt td.cd{color:#8fe3a0}.bt td.r{white-space:normal}.ecoin{margin:6px 0 12px;font-size:15px}.ecoin b{color:#ffcd4a;font-size:18px}';
// Event Boards of an entry's set (Part 3 Task 6, as the Raid Catalog lists the boards of a raid, with the cells): the coin line (one
// balance per set, never expires), then each board of the set in order with its cells. ctx.eventBoard(boardId) -> {name, cells:
// [{n, cost, reward, done}], finish, done} | null; ctx.eventCoins(setKey) -> n. '' without a set or without a board served.
function boardsSection(index, e, ctx) {
  const key = e.boardSet;
  const set = key && ((index && index.boardSets) || {})[key];
  if (!set || !ctx.eventBoard) return '';
  const boards = (set.boardIds || []).map((id) => ctx.eventBoard(id)).filter(Boolean);
  if (!boards.length) return '';
  // only the events listed in the catalogue count (Task 8: an informative notice of the set, e.g. EV-0579, is not an event)
  const listed = new Set(entriesOf(index).map((x) => x.censusId));
  const num = (n) => Number(n).toLocaleString('en-US'), shared = (set.censusIds || []).filter((id) => listed.has(id)).length;
  const coins = `<p class="ecoin">${icon('camp')}Your Event Coins: <b>${num(ctx.eventCoins ? ctx.eventCoins(key) : 0)}</b>. `
    + `One balance per board set${shared > 1 ? `, shared by ${plural(shared, 'event')}` : ''}; Event Coins never expire.</p>`;
  const cell = (c) => `<tr><td>${c.n}</td><td>${c.reward ? esc(c.reward) : '—'}</td><td>${num(c.cost)}</td>`
    + (c.done ? `<td class="cd">Unlocked${CROWN}</td>` : '<td>Not unlocked</td>') + '</tr>';
  const board = (b) => `<h3>${esc(b.name)}${b.done ? CROWN : ''}</h3><table class="tt bt"><tr><th>Cell</th><th>Reward</th><th>Cost</th><th>Status</th></tr>`
    + b.cells.map(cell).join('') + `<tr><td colspan="2">Board complete${b.finish ? `: ${esc(b.finish)}` : ''}</td><td></td><td${b.done ? ' class="cd">Done' : '>—'}</td></tr></table>`;
  return `<h2>Event Boards</h2>${coins}${boards.map(board).join('')}`
    + '<p class="n">A board opens in the Events tab while one of the events of its set is in your week or kept.</p>';
}
const daysText = (days) => days.map(niceDay).join(', ');
// a served quest with a Booster reward (make-events.js boosters, label boosterLater): the Booster comes with the Boosters (Part 6)
const boosterLine = (q) => ((q.boosters || []).length ? `<small>${(q.boosters || []).map((b) => `${esc(b.emblemName)} (${b.objective ? `objective ${b.objective}` : 'first clear'})`).join(', ')}: comes with the Boosters</small>` : '');

// GET /web/event/event/<evStageId>: header (name, card), the «On this server» box first (status, Keep button, the Story line,
// Rebuilt values closed, quests not served yet, links), then the event and its quests (each served or «Not served yet» with the
// reason in plain words). null = unknown id (404).
function detailPage(index, evStageId, ctx = {}) {
  const entries = entriesOf(index), e = entryOfId(entries, Number(evStageId));
  if (!e) return null;
  const st = statusOf(e, ctx), kept = keptOf(entries, ctx), title = catName(e);
  const button = st.button === null ? '' : `<div>${keepButton(e.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(){b.style.display=\'none\';})"')}</div>`;
  const quests = e.quests || [];
  const kv = [['Dates', dateRange(e)], ['Game year', GAME_YEARS[gameYearOf(e.start)].name],
    ['Quests', quests.length === servedOf(e).length ? String(quests.length) : `${servedOf(e).length} of ${quests.length} served`],
    ...(Array.isArray(e.days) && e.days.length ? [['Open', `Only on ${daysText(e.days)} (its whole day)`]] : [])].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const qRows = quests.map((q) => {
    const done = q.served && ctx.stageDone && ctx.stageDone(q.stageId);
    const day = Array.isArray(q.days) && q.days.length ? `<small>Open on ${esc(daysText(q.days))}</small>` : '';
    return `<tr><td>${esc(q.name || '')}${done ? CROWN : ''}${day}</td><td>${q.level ?? ''}</td><td>${q.ap ?? ''}</td>`
      + (q.served ? `<td>Served${boosterLine(q)}</td>` : `<td class="r">Not served yet<small>${esc(whyPlain(q.why, q.reason))}</small></td>`) + '</tr>';
  }).join('');
  // the original evStage rows of the event (Part 2 Task 5): one card each in the Events tab, with its own dates and quests
  const rows = Array.isArray(e.rows) && e.rows.length > 1 ? e.rows : [];
  const cards = rows.length ? `<h2>Cards</h2><p class="n">In the original game this event showed ${rows.length} cards in the Events tab, each with its own dates and quests.</p>`
    + `<table class="tt"><tr><th>Card</th><th>Dates</th><th>Quests</th></tr>${rows.map((r) => `<tr><td>${r.available && r.evStageId ? `<img width="160" height="35" src="${imgOf(ctx, r.evStageId)}" alt=""${NO_CARD(160, 35)}>` : ''}</td>`
      + `<td>${esc(`${niceDay(r.start)}${r.end && r.end !== r.start ? ` – ${niceDay(r.end)}` : ''}`)}${Array.isArray(r.days) && r.days.length ? '<small>its whole day</small>' : ''}</td>`
      + (r.available ? `<td>${esc(plural((r.stageIds || []).length, 'quest'))}</td>` : `<td class="r">Not served yet<small>${esc(plural(r.quests || 0, 'quest'))}</small></td>`) + '</tr>').join('')}</table>` : '';
  const back = ctx.fromCatalog ? backBar(`${BASE}/catalog#q${e.evStageId}`) : '';
  const notice = ctx.hasNotice && ctx.hasNotice(e.censusId) ? 'Original notice of this event ›' : '';
  const box = srvBox(e, st, index, { after: `<div id="pinmsg" class="pinmsg"></div>${replacesLine(st, kept)}${button}`,
    intro: `This server follows your Story, not the calendar: this event of the original game (${esc(dateRange(e))}) opens when your Story reaches it.`,
    links: [...(notice ? [[`${BASE}/notice/${e.evStageId}?from=event`, notice]] : []), [`${BASE}/catalog`, 'Event Catalog ›']] });
  return PAGE_HEAD(title, CSS + DETAIL_CSS + EVENT_DETAIL_CSS + RULE_CSS + SRV_CSS + FOLD_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(title)}</h1><img class="banner" width="640" height="140" src="${imgOf(ctx, e.evStageId)}" alt=""${NO_CARD(640, 140)}>${box}`
    + `<h2>Event</h2><table class="kv">${kv}</table>`
    + cards + boardsSection(index, e, ctx) + `<h2>Quests</h2><table class="tt"><tr><th>Quest</th><th>LV</th><th>AP</th><th>Status</th></tr>${qRows}</table>`
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
      + `<img class="banner" width="640" height="140" src="${imgOf(ctx, e.evStageId)}" alt=""${NO_CARD(640, 140)}>`
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

module.exports = { catalogPage, detailPage, noticePage, statusOf, whyPlain, entriesOf, expandCatalog };
