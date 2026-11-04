// Raid Catalog web pages (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 9, spec step 4): WebView opened from the
// Details button of the Raid Catalog banner (evStage 8000 of make-raid.js) in the Events tab. Pure HTML, no player or master
// access: server.js passes the index (game_data/raids.json) and the context (routes-raid.js catalogCtx plus the pages' lookups).
// Same style and rules as the Special Catalog (server/special-pages.js, whose CSS, icons and word-start search are reused):
// period tabs and year chips, one minimal row per raid week (card, bosses, one date line, ONE status line, at most ONE Keep
// button, «›»), a Filters sheet (FIND / TYPE / TIER / SHOW / PROGRESS / RAID BOARDS) with a «Matches:» line, a details page per raid.
// ctx: {shopFrom, shopTo, current (Set of census ids of the week), kept (census id), periods, unlockQuestOf(row) -> N | null,
// boardItems(sphereBoardId) -> [item names], boardName(sphereBoardId) -> name, imgVersion, fromCatalog,
// stageDone(stageId) -> true when that quest has all its objectives done (PROGRESS filter and crown; absent: nothing completed),
// boardDone(sphereBoardId) -> true when every node of that Raid Board is unlocked (RAID BOARDS filter; absent: none completed)}.
'use strict';
const special = require('./special-pages');
const calendar = require('./raid-calendar');

const { CSS: SPECIAL_CSS, DETAIL_CSS, esc, niceDay, monthYear, icon, MATCH_JS, khuxMatch, CROWN, PROG_OPTS, progCls } = special;

const KEEP_LABEL = `${icon('pin')}Keep in Events`, REMOVE_LABEL = 'Remove from Events';
const FAMILY_LABEL = { weekly: 'Weekly Raid', 'radiant reward': 'Radiant Reward Raid', 'weekly (pre-series raid event)': 'Raid Event (before the Weekly Raids)',
  // the event raids of 2016-2018 (Task 10)
  'one-off event': 'Raid Event', 'weekend-only': 'Weekend Raid', monthly: 'Monthly Raid', daily: 'Daily Raid', 'daily showdown': 'Daily Raid Showdown' };
const EVENT_FAMILIES = new Set(['one-off event', 'weekend-only', 'monthly', 'daily', 'daily showdown']);
const TIER_LABEL = { single: 'One tier' };
const tierLabel = (t) => TIER_LABEL[t] || t;
// TYPE of a row (family of its census row): [value, label, icon key]
const typeOf = (row) => (row.family === 'radiant reward' ? 'radiant' : /^weekly \(/.test(row.family) || EVENT_FAMILIES.has(row.family) ? 'event' : 'weekly');
const TYPE_OPTS = [['all', 'All'], ['weekly', 'Weekly', 'weekday'], ['radiant', 'Radiant Reward', 'jewel'], ['event', 'Raid Events', 'camp']];
const TIER_OPTS = [['all', 'All'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['legendary', 'Legendary'], ['epic', 'Epic'], ['single', 'One tier']];
const SHOW_OPTS = [['all', 'All raids'], ['now', 'In Events now', 'now'], ['can', 'Can be kept now', 'pin'], ['kept', 'Kept', 'pin'], ['later', 'Later in the Story', 'later'],
  ['removed', 'Not restored yet', 'removed']];
const SHOW_SETS = { now: ['now', 'kept'] };
const optLabel = ([, l, k]) => (k ? icon(k) : '') + esc(l);
// PROGRESS (user 03-11): every playable tier of the week (available; a tier not restored cannot be played) with all its
// objectives done (ctx.stageDone, the crown rule); no playable tier = incomplete
const doneOf = (row, ctx) => {
  const play = row.entries.filter((e) => e.available);
  return !!ctx.stageDone && play.length > 0 && play.every((e) => ctx.stageDone(e.stageId));
};

// RAID BOARDS (user 03-11, ours): 'done' when every Raid Board of the playable tiers (the boards a raid hands out) is complete in
// the save (ctx.boardDone, the rule of the board screen; a board is one per raid week, so a kept raid shares its week's progress),
// 'todo' otherwise, 'none' for a raid without boards (neither completed nor not)
const boardsOf = (row, ctx) => {
  const ids = [...new Set(row.entries.filter((e) => e.available).flatMap((e) => e.sphereBoardIds || []))];
  if (!ids.length) return 'none';
  return ctx.boardDone && ids.every((id) => ctx.boardDone(id)) ? 'done' : 'todo';
};
const BOARD_OPTS = [['all', 'All'], ['done', 'Completed', 'unlocked'], ['todo', 'Not completed', 'lock']];
const boardCls = (v) => (v === 'all' ? '' : ` bd-${v}`);
// chips chosen: Completed blue (the open padlock), Not completed grey
const CSS = SPECIAL_CSS + '.o.bd-done.on{background:#1a6fa8;border-color:#62a7ff}.o.bd-todo.on{background:#5a6470;border-color:#9aa4ae}';

const pill = (c, k, text) => `<span class="s s-${c}">${k ? icon(k) : ''}${text}</span>`;
// the pills the page script writes after a keep / remove: [row class, html]
const PILLS = { kept: ['pinned', `${icon('pin')}Kept in the raid list`], can: ['can', `${icon('pin')}Past raid — can be kept`] };
const titleOf = (row) => row.bosses.join(' · ') || row.censusId;
const dateRange = (row) => `${niceDay(row.start)} – ${niceDay(row.end)}`;
const periodOf = (day, periods) => { let n = periods[0].n; for (const p of periods) if (day >= p.from) n = p.n; return n; };
const imgOf = (ctx, id, kept) => `/web/raid/img/v${ctx.imgVersion || 1}/${id}${kept ? '-kept' : ''}.png`;
const detailHref = (id) => `/web/raid/raid/${id}?from=catalog`;

// Status of a row: show (SHOW value), cls (side bar), pill (status line), button (1 Keep, 0 Remove, null none), why (details page)
function statusOf(row, ctx) {
  const st = calendar.rowState(row, ctx);
  if (st === 'removed') {
    return { show: st, cls: 'off', pill: pill('off', 'removed', 'Not restored yet'), button: null,
      why: 'Its raid boss cannot be served yet: its graphics or data are incomplete in the surviving game files. It comes back when they are recovered.' };
  }
  if (st === 'other') {
    return { show: st, cls: 'other', pill: pill('other', '', 'This week, not open now'), button: null,
      why: 'Your Story has reached its dates, but it is not in the Events tab now. It cannot be kept while its week is current.' };
  }
  if (st === 'now') return { show: st, cls: 'now', pill: pill('now', 'now', 'In Events this week'), button: null, why: 'It is in the Events tab this week, as in the original game.' };
  if (st === 'kept') {
    return { show: st, cls: 'pinned', pill: pill(PILLS.kept[0], '', PILLS.kept[1]), button: 0,
      why: 'You keep this raid in the Events tab, beside the raids of the week. Its boss has a level of its own, from LV 1.' };
  }
  if (st === 'can') {
    return { show: st, cls: 'can', pill: pill(PILLS.can[0], '', PILLS.can[1]), button: 1,
      why: 'Its week is over: you can keep it in the Events tab, one raid at a time. Its boss starts at LV 1 with a level of its own (the boss of the week keeps its level); '
        + 'its Raid Boards are the same as in its week, so a board reward is never given twice; Raid Coins are given at every win.' };
  }
  const q = ctx.unlockQuestOf ? ctx.unlockQuestOf(row) : undefined;
  const text = q === undefined ? 'Reached later in the Story' : q === null ? 'Not reached in this version of the Story' : `Unlocks at Story Quest ${q}`;
  const why = q === undefined || q === null ? 'Its week comes later in the Story: it opens when your Story reaches it.' : `Its week comes later in the Story: it opens when you reach Story Quest ${q}.`;
  return { show: 'later', cls: 'off', pill: pill('off', 'later', text), button: null, why };
}
const keepButton = (id, on, extra = '') => `<a href="#" class="pk" data-id="${id}" data-on="${on}" data-pin="${on === 1 ? `/web/raid/keep/${id}` : '/web/raid/unkeep'}"${extra}>${on === 1 ? KEEP_LABEL : REMOVE_LABEL}</a>`;

// keep / remove (XHR POST, as the Special catalogue): the element carries data-pin (URL) and data-on (1 keep, 0 remove)
const KEEP_JS = `var KX_KEEP=${JSON.stringify(KEEP_LABEL)},KX_REMOVE=${JSON.stringify(REMOVE_LABEL)};`
  + 'function kxSet(el,id,kept){el.setAttribute("data-pin",kept?"/web/raid/unkeep":"/web/raid/keep/"+id);el.setAttribute("data-on",kept?"0":"1");el.innerHTML=kept?KX_REMOVE:KX_KEEP;}'
  + 'function kxSay(box,cls,head,sub){box.className=cls;box.innerHTML="";var b=document.createElement("div"),s=document.createElement("small");b.textContent=head;s.textContent=sub;box.appendChild(b);box.appendChild(s);box.style.display="block";if(box.scrollIntoView)box.scrollIntoView(false);}'
  + 'function kxKeep(el,onOk){var on=el.getAttribute("data-on")==="1",box=document.getElementById("pinmsg"),x=new XMLHttpRequest();x.open("POST",el.getAttribute("data-pin"));'
  + 'x.onload=function(){if(x.status===200){if(on)kxSay(box,"pinmsg","Kept!","Leave and re-enter Events to see it.");else kxSay(box,"pinmsg off","Removed.","Leave and re-enter Events.");if(onOk)onOk(on);}'
  + 'else kxSay(box,"pinmsg err","Could not change Events","This raid cannot be kept.");};'
  + 'x.onerror=function(){kxSay(box,"pinmsg err","Could not reach the server","Try again.");};x.send("");return false;}';

// ES5, no external script. Rows read once at start; a period tab, a year chip and the Filters sheet only toggle a class.
const JS = `(function(){
var PN=__PN__,LAB={type:__TYPE__,tier:__TIER__,show:__SHOW__,prog:__PROG__,bd:__BD__},SHOWSET=__SHOWSET__,PILL=__PILL__;
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
function q(el,s){return el.querySelector(s);}
var rows=[].map.call(document.querySelectorAll('.row'),function(el){return {el:el,id:attr(el,'data-eid'),st:attr(el,'data-show'),p:attr(el,'data-periods'),y:attr(el,'data-y'),
t:attr(el,'data-type'),dn:attr(el,'data-done')==='1',bd:attr(el,'data-boards'),tr:' '+attr(el,'data-tier')+' ',ns:(attr(el,'data-search')||'').split(' | '),mt:q(el,'.mt')};});
var mls=[].map.call(document.querySelectorAll('.ml'),function(el){return el;});
var ycs=[].map.call(document.querySelectorAll('.yc'),function(el){return {el:el,y:attr(el,'data-yr'),n:q(el,'.yn')};});
var cur={p:'all',type:'all',tier:'all',show:'all',prog:'all',bd:'all',q:''},dr=null,yr=attr($('rows'),'data-defy')||'all';
function copy(s){return {p:s.p,type:s.type,tier:s.tier,show:s.show,prog:s.prog,bd:s.bd,q:s.q};}
function hits(r,qq,max){var o=[],i;for(i=0;i<r.ns.length&&o.length<max;i++)if(khuxMatch(qq,r.ns[i]))o.push(r.ns[i]);return o;}
function match(r,s,anyPeriod){
if(!anyPeriod&&s.p!=='all'&&r.p!==s.p)return false;
if(s.type!=='all'&&r.t!==s.type)return false;
if(s.tier!=='all'&&r.tr.indexOf(' '+s.tier+' ')<0)return false;
if(s.show!=='all'&&(SHOWSET[s.show]||[s.show]).indexOf(r.st)<0)return false;
if(s.prog!=='all'&&r.dn!==(s.prog==='done'))return false;
if(s.bd!=='all'&&r.bd!==s.bd)return false;
return !s.q||hits(r,s.q,1).length>0;}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.type!=='all'?1:0)+(s.tier!=='all'?1:0)+(s.show!=='all'?1:0)+(s.prog!=='all'?1:0)+(s.bd!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function hide(el,h){el.className=el.className.replace(/ hide/g,'')+(h?' hide':'');}
function render(){
var c={},yc={all:0},ys=[],n=0,i,r,on,p;
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur)){yc.all++;if(!yc[r.y]){yc[r.y]=0;ys.push(r.y);}yc[r.y]++;}}
// a search goes to the one year it finds (or All years); a filter or a tab: a year with no matching raid gives way
if(cur.q)yr=ys.length===1?ys[0]:'all';else if(yr!=='all'&&!yc[yr])yr=ys.length===1?ys[0]:'all';
for(i=0;i<ycs.length;i++){ycs[i].n.textContent=yc[ycs[i].y]||0;ycs[i].el.className='yc'+(ycs[i].y===yr?' on':'')+(ycs[i].y!=='all'&&!yc[ycs[i].y]?' hide':'');}
c.all=0;for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true)){c.all++;c[r.p]=(c[r.p]||0)+1;}on=match(r,cur)&&(yr==='all'||r.y===yr);hide(r.el,!on);if(on)n++;}
for(i=0;i<mls.length;i++){var e=mls[i].nextSibling,vis=false;while(e&&!/\\bml\\b/.test(e.className||'')){if(e.className&&e.className.indexOf(' hide')<0)vis=true;e=e.nextSibling;}hide(mls[i],!vis);}
[].forEach.call(document.querySelectorAll('.tab'),function(t){p=attr(t,'data-p');t.className='tab'+(p===cur.p?' on':'');$('tc'+p).textContent=c[p]||0;});
var f=nf(cur),h='<span class="n1">'+plural(n,'raid')+'</span>';
if(cur.p!=='all')h+=' in <b>'+esc(PN[cur.p])+'</b>';
if(yr!=='all')h+=' · '+esc(yr);
if(!f)h+=' · no filters';
else{h+=' match your filters:';
if(cur.type!=='all')h+=' '+tag('type',LAB.type[cur.type]);
if(cur.tier!=='all')h+=' '+tag('tier',LAB.tier[cur.tier]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.prog!=='all')h+=' '+tag('prog',LAB.prog[cur.prog]);
if(cur.bd!=='all')h+=' '+tag('bd',LAB.bd[cur.bd]);
if(cur.q)h+=' '+tag('q','Find: &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=f?f:'';
for(i=0;i<rows.length;i++){r=rows[i];if(!r.mt)continue;var w=cur.q&&r.el.className.indexOf(' hide')<0?hits(r,cur.q,3):[];r.mt.textContent=w.length?'Matches: '+w.join(', '):'';r.mt.style.display=w.length?'':'none';}
var none=$('none');var wq=(cur.prog==='done'?'completed ':cur.prog==='todo'?'incomplete ':'')+'raids'+(cur.bd==='done'?' with completed Raid Boards':cur.bd==='todo'?' with Raid Boards to complete':'');none.textContent=n?'':(cur.q?'No '+wq+' match "'+cur.q+'"':'No '+wq+' match your filters');none.style.display=n?'none':'';}
// after a keep / remove: the kept row gold, the previous one back to «can be kept», the «Replaces» lines
function setRow(r,st){var pc=PILL[st];r.st=st;r.el.setAttribute('data-show',st);r.el.className='row '+pc[0]+(/ hide/.test(r.el.className)?' hide':'');var s=q(r.el,'.s');if(s){s.className='s s-'+pc[0];s.innerHTML=pc[1];}
var b=q(r.el,'.pk');if(b)kxSet(b,r.id,st==='kept');}
window.kxRow=function(id,on){var name='',i,r;for(i=0;i<rows.length;i++){r=rows[i];if(r.st==='kept')setRow(r,'can');if(r.id===id){setRow(r,on?'kept':'can');if(on)name=attr(r.el,'data-name');}}
for(i=0;i<rows.length;i++){var x=q(rows[i].el,'.rp');if(x){x.textContent=name?'Replaces\\u003a '+name:'';x.style.display=name&&rows[i].st==='can'?'':'none';}}render();};
[].forEach.call(rows,function(r){r.el.onclick=function(e){var t=e.target;while(t&&t!==r.el){if(t.tagName==='A')return;t=t.parentNode;}location.href=attr(r.el,'data-href');};});
function sync(){[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr),'result');}
function openF(){dr=copy(cur);$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){dr.q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var t=e.target;while(t&&t!==box&&!attr(t,'data-v'))t=t.parentNode;var v=attr(t,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();dr.type='all';dr.tier='all';dr.show='all';dr.prog='all';dr.bd='all';dr.q='';$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr)return;var s=dr;s.p=cur.p;closeF();cur=s;render();};
$('sum').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-x'))t=t.parentNode;var x=attr(t,'data-x');if(!x)return;e.preventDefault();
if(x==='type'||x==='all')cur.type='all';if(x==='tier'||x==='all')cur.tier='all';if(x==='show'||x==='all')cur.show='all';if(x==='prog'||x==='all')cur.prog='all';if(x==='bd'||x==='all')cur.bd='all';if(x==='q'||x==='all')cur.q='';render();};
$('yrs').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-yr'))t=t.parentNode;var y=attr(t,'data-yr');if(!y)return;yr=y;render();};
$('tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-p'))t=t.parentNode;if(!t)return;cur.p=attr(t,'data-p');render();};
render();
// BACK from a details page: #q<id> selects its year, then scrolls to it
var h=location.hash&&document.getElementById(location.hash.slice(1));if(h){if(attr(h,'data-y')){yr=attr(h,'data-y');render();}if(h.scrollIntoView)h.scrollIntoView();}
})();`;

// item names of a row for FIND («Matches:»): bosses, tiers, type, board names, board rewards, without repeats (case aside)
function searchOf(row, ctx) {
  const ids = [...new Set(row.entries.flatMap((e) => e.sphereBoardIds || []))];
  const parts = [...row.bosses, ...row.entries.map((e) => tierLabel(e.tier)), FAMILY_LABEL[row.family] || row.family, ...new Set(row.entries.flatMap((e) => e.boards || [])),
    ...ids.flatMap((id) => (ctx.boardItems ? ctx.boardItems(id) : []))];
  const seen = new Set();
  return parts.map((x) => String(x || '').replace(/\s+/g, ' ').replace(/ \| /g, ' / ').trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(' | ');
}
const keptRow = (rows, ctx) => rows.find((r) => calendar.rowState(r, ctx) === 'kept');
// «Replaces: <kept raid>» over a Keep button; hidden on the kept row, which gets it back when another raid is kept (kxRow)
const replacesLine = (st, kept) => (st.button === null ? ''
  : `<div class="rp"${st.button === 1 && kept ? '' : ' style="display:none"'}>${st.button === 1 && kept ? `Replaces: ${esc(titleOf(kept))}` : ''}</div>`);

const PAGE_HEAD = (title, css) => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + `<title>${esc(title)}</title><style>${css}</style></head>`;

function catalogPage(index, ctx = {}) {
  const periods = ctx.periods, rows = calendar.catalogRows(index), kept = keptRow(rows, ctx);
  const curPeriod = ctx.shopFrom ? periodOf(ctx.shopFrom, periods) : null;
  let lastM = '';
  const html = rows.map((row) => {
    const st = statusOf(row, ctx), href = detailHref(row.evStageId), y = row.start.slice(0, 4), m = row.start.slice(0, 7);
    const label = m !== lastM ? `<div class="ml" data-m="${m}">${monthYear(`${m}-01`)}</div>` : '';
    lastM = m;
    const tiers = [...new Set(row.entries.map((e) => e.tier))], done = doneOf(row, ctx), bd = boardsOf(row, ctx);
    return `${label}<div class="row ${st.cls}" id="q${row.evStageId}" data-y="${y}" data-href="${href}" data-name="${esc(titleOf(row))}" data-eid="${row.evStageId}" data-show="${st.show}"`
      + ` data-periods="${periodOf(row.start, periods)}" data-type="${typeOf(row)}" data-tier="${esc(tiers.map((t) => t.toLowerCase()).join(' '))}" data-search="${esc(searchOf(row, ctx))}" data-done="${done ? 1 : 0}" data-boards="${bd}">`
      + `<a class="im" href="${href}"><img loading="lazy" width="320" height="70" src="${imgOf(ctx, row.evStageId)}" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${esc(titleOf(row))}${done ? CROWN : ''}</a><div class="d">${dateRange(row)} · ${tiers.map((t) => esc(tierLabel(t))).join(' · ')}</div>${st.pill}`
      + `${replacesLine(st, kept)}${st.button === null ? '' : `<div>${keepButton(row.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(on){kxRow(b.getAttribute(\'data-id\'),on);})"')}</div>`}`
      + '<div class="mt"></div></div><a class="go" href="' + href + '" aria-label="Details">›</a></div>\n';
  }).join('');
  const years = [...new Set(rows.map((r) => r.start.slice(0, 4)))];
  const shopYear = String(ctx.shopFrom || '').slice(0, 4), defYear = years.includes(shopYear) ? shopYear : 'all';
  const yearChip = (y, label, n) => `<button type="button" class="yc${y === defYear ? ' on' : ''}" data-yr="${y}">${label} <span class="yn">${n}</span></button>`;
  const tab = (p, name, n, now) => `<button type="button" class="tab${p === 'all' ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b>${now ? '<span class="now">Now</span>' : ''}<span class="c" id="tc${p}">${n}</span></button>`;
  const opts = (list, cls = () => '') => list.map((o, i) => `<button type="button" class="o${cls(o[0])}${i ? '' : ' on'}" data-v="${o[0]}">${optLabel(o)}</button>`).join('');
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map((o) => [o[0], optLabel(o)])));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(periods.map((p) => [p.n, p.name]))))
    .replace('__TYPE__', labels(TYPE_OPTS)).replace('__TIER__', labels(TIER_OPTS)).replace('__SHOW__', labels(SHOW_OPTS)).replace('__PROG__', labels(PROG_OPTS)).replace('__BD__', JSON.stringify(Object.fromEntries(BOARD_OPTS.slice(1).map((o) => [o[0], `Raid Boards: ${optLabel(o)}`])))).replace('__SHOWSET__', JSON.stringify(SHOW_SETS))
    .replace('__PILL__', JSON.stringify({ kept: PILLS.kept, can: PILLS.can })).replace('__MATCH__', () => MATCH_JS);
  return PAGE_HEAD('Raid Catalog', CSS) + '<body>'
    + '<div class="hdr"><h1>Raid Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Every raid week of the game, by date. Tap a raid for its bosses, tiers and Raid Boards. A past raid can be kept in the Events tab, one at a time. The Raid Catalog is an addition of this server.</p>'
    + `<div class="tabs" id="tabs">${tab('all', 'All', rows.length)}${periods.map((p) => tab(p.n, p.name, rows.filter((r) => periodOf(r.start, periods) === p.n).length, p.n === curPeriod)).join('')}</div><div class="tabline"></div>`
    + `<div class="yrs" id="yrs">${yearChip('all', 'All years', rows.length)}${years.map((y) => yearChip(y, y, rows.filter((r) => r.start.startsWith(y)).length)).join('')}</div>`
    + `<div class="sum" id="sum"><span class="n1">${plural(rows.length, 'raid')}</span> · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows" data-defy="${defYear}">${html || '<p class="n">No raids.</p>'}</div>`
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Boss, board or reward name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in boss names and in the Raid Board rewards (e.g. Behemoth, Sora, Mythril).</div>'
    + `<h4>TYPE</h4><div class="opts" data-g="type">${opts(TYPE_OPTS)}</div>`
    + `<h4>TIER</h4><div class="opts" data-g="tier">${opts(TIER_OPTS)}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v === 'removed' ? 'removed' : v}`))}</div>`
    + `<h4>PROGRESS</h4><div class="opts" data-g="prog">${opts(PROG_OPTS, progCls)}</div>`
    + `<h4>RAID BOARDS</h4><div class="opts" data-g="bd">${opts(BOARD_OPTS, boardCls)}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${plural(rows.length, 'result')}</button></div></div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${KEEP_JS}</script><script>${js}</script></body></html>`;
}

// Details page of one raid week: GET /web/raid/raid/<evStageId>. Header: card, bosses, the status line and why, the Keep / Remove
// button; then the week, the tiers (boss, quest level, HP; a tier not restored says so), the Raid Boards with their rewards, the
// reconstructed values with their reasons, and the other weeks of the same bosses, newest first. null = unknown id (404).
const RECON_LABEL = { atk: 'ATK', def: 'DEF', partHp: 'HP of the weak points', upMinutes: 'time limit', useAp: 'AP of a further attempt', coinOdds: 'Raid Coin odds',
  lux: 'Lux', moves: 'moves', hp: 'boss HP (from the tier tables)', hp_step: 'the week of an HP change', atk_curve: 'ATK below the level cap',
  attribute: 'attribute (from the boss colour)', background: 'fight background', boardAlias: 'a Raid Board reward name', boardPath: 'the order of the Raid Board cells',
  boardTexture: 'a Spirit part texture', boardCost: 'a Raid Board cell cost', boardSet: 'which Raid Boards ran this week',
  boardArt: 'a Raid Board card picture (cut from a screenshot)', boardNoArt: 'a Raid Board card picture (missing)' };
const RAID_DETAIL_CSS = '.tt{table-layout:auto}.tt td:nth-child(4){white-space:nowrap}.tt td.r{color:#ffcd4a}ul.ow{list-style:none;padding:0;margin:4px 0 10px}ul.ow li{padding:6px 0;border-bottom:1px solid #2f5d78}ul.ow a{color:#9fd4ff}';
function detailPage(index, evStageId, ctx = {}) {
  const rows = calendar.catalogRows(index), row = rows.find((r) => r.evStageId === Number(evStageId));
  if (!row) return null;
  const st = statusOf(row, ctx), kept = keptRow(rows, ctx), title = titleOf(row), periods = ctx.periods;
  const button = st.button === null ? '' : `<div>${keepButton(row.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(){b.style.display=\'none\';})"')}</div>`;
  const pName = (periods.find((p) => p.n === periodOf(row.start, periods)) || {}).name || '';
  const kv = [['Dates', dateRange(row)], ['Type', FAMILY_LABEL[row.family] || row.family], ['Period', pName]].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const tierRows = row.entries.map((e) => `<tr><td>${esc(tierLabel(e.tier))}</td><td>${esc(e.boss || '')}</td><td>${e.level ?? ''}</td>`
    + `<td${e.available ? '' : ' class="r"'}>${e.available ? Number(e.hp || 0).toLocaleString('en-US') : 'Not restored yet'}</td></tr>`).join('');
  const ids = [...new Set(row.entries.flatMap((e) => e.sphereBoardIds || []))];
  const names = [...new Set(row.entries.flatMap((e) => e.boards || []))];
  const boards = (names.length ? `<p>${names.map(esc).join(', ')}</p>` : '<p class="n">No Raid Boards this week.</p>')
    + (ids.length ? `<ul class="pl">${ids.map((id) => {
      const items = [...new Set(ctx.boardItems ? ctx.boardItems(id) : [])], name = ctx.boardName ? ctx.boardName(id) : '';
      return `<li>${name ? `<b>${esc(name)}</b>: ` : ''}<span class="dr">${items.map(esc).join(', ') || '—'}</span></li>`;
    }).join('')}</ul>` : '');
  // the labels of raids.json in the player's words (index.reasons holds the builder's notes: file names, config keys)
  const labels = [...new Set(row.entries.flatMap((e) => e.reconstructed || []))].map((l) => RECON_LABEL[l] || l);
  const recon = labels.length ? `<h2>Reconstructed values</h2><p>${labels.map(esc).join(', ')}.</p>`
    + '<p class="n">The original values are lost: these are rebuilt from the surviving sources, as the Raid Bosses notice explains.</p>' : '';
  const others = rows.filter((r) => r !== row && r.bosses.some((b) => row.bosses.includes(b))).sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  const other = others.length ? `<h2>Other weeks of ${esc(title)}</h2><ul class="ow">${others.map((r) => `<li><a href="${detailHref(r.evStageId)}">${dateRange(r)}</a> · ${esc(titleOf(r))}<br>${statusOf(r, ctx).pill}</li>`).join('')}</ul>` : '';
  const back = ctx.fromCatalog ? `<div class="bar"><a class="back" href="/web/raid/catalog#q${row.evStageId}">BACK<span></span></a></div>` : '';
  return PAGE_HEAD(title, CSS + DETAIL_CSS + RAID_DETAIL_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(title)}</h1><img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
    + `${st.pill}<div id="pinmsg" class="pinmsg"></div><div class="why ${st.cls}">${st.why}</div>${replacesLine(st, kept)}${button}`
    + `<h2>Week</h2><table class="kv">${kv}</table>`
    + `<h2>Tiers</h2><table class="tt"><tr><th>Tier</th><th>Boss</th><th>Quest LV</th><th>Boss HP</th></tr>${tierRows}</table>`
    + '<p class="n">The boss starts at LV 1 and gains a level at every win, up to LV 99; levels reset on the 1st of every month.</p>'
    + `<h2>Raid Boards</h2>${boards}${recon}${other}`
    + `<p class="n">The Raid Catalog is an addition of this server: in the original game a raid was played only in its own week.</p>${back}<script>${KEEP_JS}</script></body></html>`;
}

module.exports = { catalogPage, detailPage, statusOf, khuxMatch };
