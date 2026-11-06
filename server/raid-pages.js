// Raid Catalog web pages (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 9, spec step 4): WebView opened from the
// Details button of the Raid Catalog banner (evStage 8000 of make-raid.js) in the Events tab. Pure HTML, no player or master
// access: server.js passes the index (game_data/raids.json) and the context (routes-raid.js catalogCtx plus the pages' lookups).
// Same style and rules as the Special Catalog (server/special-pages.js, whose CSS, icons and word-start search are reused):
// game-year tabs (the Shop catalogue's, 06-11) and year chips, one minimal row per raid week (card, bosses, one date line, ONE status line, at most ONE Keep
// button, «›»), a Filters sheet (FIND / TYPE / TIER / SHOW / PROGRESS / RAID BOARDS) with a «Matches:» line, a details page per raid.
// ctx: {shopFrom, shopTo, current (Set of census ids of the week), kept (census id), periods, unlockQuestOf(row) -> N | null,
// boardItems(sphereBoardId) -> [item names], boardName(sphereBoardId) -> name, imgVersion, fromCatalog,
// stageDone(stageId) -> true when that quest has all its objectives done (PROGRESS filter and crown; absent: nothing completed),
// boardDone(sphereBoardId) -> true when every node of that Raid Board is unlocked (RAID BOARDS filter; absent: none completed)}.
'use strict';
const special = require('./special-pages');
const calendar = require('./raid-calendar');
const windows = require('./raid-windows');

const { CSS: SPECIAL_CSS, DETAIL_CSS, esc, niceDay, monthYear, icon, MATCH_JS, khuxMatch, CROWN, PROG_OPTS, progCls, gameYearOf, GAME_YEARS, YEAR_SPAN } = special;

const KEEP_LABEL = `${icon('pin')}Keep in Events`, REMOVE_LABEL = 'Remove from Events';
const FAMILY_LABEL = { weekly: 'Weekly Raid', 'radiant reward': 'Radiant Reward Raid', 'weekly (pre-series raid event)': 'Raid Event (before the Weekly Raids)',
  // the event raids of 2016-2018 (Task 10)
  'one-off event': 'Raid Event', 'weekend-only': 'Weekend Raid', monthly: 'Monthly Raid', daily: 'Daily Raid', 'daily showdown': 'Daily Raid Showdown',
  // the raids held only in the Japanese version (I-232): JP names translated (超難度レイド super-hard raid, 月間レイド討伐戦 monthly raid, 日替わりレイド daily rotating raid)
  event: 'Raid Event (Japan)', 'super-hard weekend': 'Super-Hard Weekend Raid (Japan)', 'monthly (30-minute)': 'Monthly 30-Minute Raid (Japan)', 'daily rotating': 'Daily Rotating Raid (Japan)' };
const EVENT_FAMILIES = new Set(['one-off event', 'weekend-only', 'monthly', 'daily', 'daily showdown']);
const TIER_LABEL = { single: 'One tier' };
const tierLabel = (t) => TIER_LABEL[t] || t;
// TYPE of a row (family of its census row): [value, label, icon key]
const typeOf = (row) => (row.jp ? 'jp' : row.family === 'radiant reward' ? 'radiant' : /^weekly \(/.test(row.family) || EVENT_FAMILIES.has(row.family) ? 'event' : 'weekly');
const TYPE_OPTS = [['all', 'All'], ['weekly', 'Weekly', 'weekday'], ['radiant', 'Radiant Reward', 'jewel'], ['event', 'Raid Events', 'camp'], ['jp', 'Japan only']];
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
const BOARD_OPTS = [['all', 'All'], ['done', 'Completed', 'bdone'], ['todo', 'Not completed', 'btodo']];
const boardCls = (v) => (v === 'all' ? '' : ` bd-${v}`);
// chips chosen: Completed blue (the open padlock), Not completed grey
const CSS = SPECIAL_CSS + '.o.bd-done.on{background:#2e9e3e;border-color:#6fd47f}.o.bd-todo.on{background:#5a6470;border-color:#9aa4ae}';

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
$('sum').innerHTML=h;if(window.kxImgs)kxImgs();$('fdot').textContent=f?f:'';
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

// Light catalogue (task 3, 06-11: 366+ KB took long to show in the in-game WebView): the rows are sent packed and built by the
// page before its filter script runs, so the DOM and the filters are the same as before. Each row's markup becomes a template:
// its own values (search names, date line, name, evStageId, year) are replaced by markers \u0001<k>, so the rows share a few
// dozen templates; the search names go through one dictionary. Replacing a value and putting the same value back is
// lossless whatever else the text holds. Card pictures: data-src, loaded only for the rows shown (kxImgs after every render):
// the old WebView ignores loading="lazy" and fetched all the cards at once. The details of a raid stay on its own page.
const PACK_KEYS = ['s', 'd', 'n', 'e', 'y'];
function packCatalog(packed) {
  const tpl = [], tplIx = new Map(), dict = [], dictIx = new Map();
  const word = (w) => { if (!dictIx.has(w)) { dictIx.set(w, dict.length); dict.push(w); } return dictIx.get(w); };
  const rows = packed.map(({ label, fields, html }) => {
    let h = html;
    PACK_KEYS.forEach((k) => { if (fields[k]) h = h.split(fields[k]).join(`\u0001${k}`); });
    if (!tplIx.has(h)) { tplIx.set(h, tpl.length); tpl.push(h); }
    return [tplIx.get(h), fields.s ? fields.s.split(' | ').map(word) : [], fields.d, fields.n, fields.e, fields.y, label];
  });
  // «</» never closes the script element: written <\/ inside the JSON
  return JSON.stringify({ t: tpl, w: dict, r: rows }).replace(/<\//g, '<\\/');
}
const unpackRow = (d, r) => r[6] + d.t[r[0]].replace(/\u0001([sdney])/g, (x, k) => ({ s: r[1].map((i) => d.w[i]).join(' | '), d: r[2], n: r[3], e: r[4], y: r[5] })[k]);
// the same expansion as UNPACK_JS, for the tests: the catalogue page with its rows written out
function expandCatalog(page) {
  const m = /<script id="kxrows" type="application\/json">([\s\S]*?)<\/script><script>[\s\S]*?<\/script>/.exec(page);
  if (!m) return page;
  const d = JSON.parse(m[1]);
  const html = d.r.map((r) => unpackRow(d, r)).join('');
  return page.replace(m[0], '').replace(/(<div id="rows" data-defy="[^"]*">)/, (x) => x + html);
}
const UNPACK_JS = 'function kxImgs(){var a=document.querySelectorAll("#rows .row"),i,im;for(i=0;i<a.length;i++){if(/ hide/.test(a[i].className))continue;im=a[i].querySelector("img[data-src]");if(im&&!im.getAttribute("src"))im.setAttribute("src",im.getAttribute("data-src"));}}'
  + '(function(){var d=JSON.parse(document.getElementById("kxrows").textContent),o=[],i,r;for(i=0;i<d.r.length;i++){r=d.r[i];'
  + 'o.push(r[6]+d.t[r[0]].replace(/\u0001([sdney])/g,function(x,k){if(k==="s"){var s=[],j;for(j=0;j<r[1].length;j++)s.push(d.w[r[1][j]]);return s.join(" | ");}return k==="d"?r[2]:k==="n"?r[3]:k==="e"?r[4]:r[5];}));}'
  + 'document.getElementById("rows").innerHTML=o.join("");})();';
function catalogPage(index, ctx = {}) {
  const periods = ctx.periods, rows = calendar.catalogRows(index), kept = keptRow(rows, ctx);
  let lastM = '';
  const packed = [];
  rows.forEach((row) => {
    const st = statusOf(row, ctx), href = detailHref(row.evStageId), y = row.start.slice(0, 4), m = row.start.slice(0, 7);
    const label = m !== lastM ? `<div class="ml" data-m="${m}">${monthYear(`${m}-01`)}</div>` : '';
    lastM = m;
    const tiers = [...new Set(row.entries.map((e) => e.tier))], done = doneOf(row, ctx), bd = boardsOf(row, ctx);
    const name = esc(titleOf(row)), line = `${row.jp ? 'Japan only · ' : ''}${dateRange(row)} · ${tiers.map((t) => esc(tierLabel(t))).join(' · ')}`, search = esc(searchOf(row, ctx));
    packed.push({ label, fields: { s: search, d: line, n: name, e: String(row.evStageId), y }, html: `<div class="row ${st.cls}" id="q${row.evStageId}" data-y="${y}" data-href="${href}" data-name="${esc(titleOf(row))}" data-eid="${row.evStageId}" data-show="${st.show}"`
      + ` data-periods="${gameYearOf(row.start)}" data-type="${typeOf(row)}" data-tier="${esc(tiers.map((t) => t.toLowerCase()).join(' '))}" data-search="${search}" data-done="${done ? 1 : 0}" data-boards="${bd}">`
      + `<a class="im" href="${href}"><img width="320" height="70" data-src="${imgOf(ctx, row.evStageId)}" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${name}${done ? CROWN : ''}</a><div class="d">${line}</div>${st.pill}`
      + `${replacesLine(st, kept)}${st.button === null ? '' : `<div>${keepButton(row.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(on){kxRow(b.getAttribute(\'data-id\'),on);})"')}</div>`}`
      + '<div class="mt"></div></div><a class="go" href="' + href + '" aria-label="Details">›</a></div>\n' });
  });
  const data = packCatalog(packed);
  const years = [...new Set(rows.map((r) => r.start.slice(0, 4)))];
  const shopYear = String(ctx.shopFrom || '').slice(0, 4), defYear = years.includes(shopYear) ? shopYear : 'all';
  const yearChip = (y, label, n) => `<button type="button" class="yc${y === defYear ? ' on' : ''}" data-yr="${y}">${label} <span class="yn">${n}</span></button>`;
  // tabs = the Shop's game years (special-pages.js; user 06-11): a tab only for a year with raids, no «Now» mark
  const tab = (p, name, sub, n) => `<button type="button" class="tab${p === 'all' ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b><small>${esc(sub)}</small><span class="c" id="tc${p}">${n}</span></button>`;
  const perYear = GAME_YEARS.map((g, i) => rows.filter((r) => gameYearOf(r.start) === i).length);
  const opts = (list, cls = () => '') => list.map((o, i) => `<button type="button" class="o${cls(o[0])}${i ? '' : ' on'}" data-v="${o[0]}">${optLabel(o)}</button>`).join('');
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map((o) => [o[0], optLabel(o)])));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(GAME_YEARS.map((g, i) => [i, g.name]))))
    .replace('__TYPE__', labels(TYPE_OPTS)).replace('__TIER__', labels(TIER_OPTS)).replace('__SHOW__', labels(SHOW_OPTS)).replace('__PROG__', labels(PROG_OPTS)).replace('__BD__', JSON.stringify(Object.fromEntries(BOARD_OPTS.slice(1).map((o) => [o[0], `Raid Boards: ${optLabel(o)}`])))).replace('__SHOWSET__', JSON.stringify(SHOW_SETS))
    .replace('__PILL__', JSON.stringify({ kept: PILLS.kept, can: PILLS.can })).replace('__MATCH__', () => MATCH_JS);
  return PAGE_HEAD('Raid Catalog', CSS) + '<body>'
    + '<div class="hdr"><h1>Raid Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Every raid week of the game, by date. Tap a raid for its bosses, tiers and Raid Boards. A past raid can be kept in the Events tab, one at a time. The Raid Catalog is an addition of this server.</p>'
    + `<div class="tabs" id="tabs">${tab('all', 'All years', YEAR_SPAN, rows.length)}${GAME_YEARS.map((g, i) => (perYear[i] ? tab(i, g.name, g.sub, perYear[i]) : '')).join('')}</div><div class="tabline"></div>`
    + `<div class="yrs" id="yrs">${yearChip('all', 'All years', rows.length)}${years.map((y) => yearChip(y, y, rows.filter((r) => r.start.startsWith(y)).length)).join('')}</div>`
    + `<div class="sum" id="sum"><span class="n1">${plural(rows.length, 'raid')}</span> · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows" data-defy="${defYear}">${packed.length ? '' : '<p class="n">No raids.</p>'}</div>`
    + (packed.length ? `<script id="kxrows" type="application/json">${data}</script><script>${UNPACK_JS}</script>` : '')
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
  boardArt: 'a Raid Board card picture (cut from a screenshot)', boardNoArt: 'a Raid Board card picture (missing)',
  // the labels of the event raids (Task 10)
  rareOdds: 'odds of the rare boss', boardGender: 'both gender boards open', weekendTimer: 'weekend time limit', questObjectives: 'quest objectives',
  levelDrops: 'level drops', levelDropsPartial: 'level rewards (in part)', boardStandard: 'Raid Board (from a similar raid)', eventCoins: 'Raid Coin rewards',
  eventHp: 'boss HP (scaled by date)', setting2016: 'time limit and AP (from 2016)', hpTier: 'boss HP of the tiers', boardCells: 'missing Raid Board cells',
  // the labels of the story raid bosses (Task 11)
  // the labels of the Japan-only raids (I-232)
  jp: 'Japan only', jpQuest: 'quest (from a worldwide raid)', jpDates: 'end date', jp2016: 'boss values (worldwide 2016)', jpTimer: 'time limit (Japanese rules)', jpBoard: 'Raid Board (Japanese super-hard board)',
  jpBoardOriginal: 'Raid Boards (original Japanese boards)', jpBoardDeduced: 'Raid Boards (reconstructed)', jpNoBoard: 'Raid Boards (none: not known)',
  jpBossProbable: 'boss (probable)', jpHpProbable: 'boss HP (probable)', jpRewardProbable: 'level reward (probable match)',
  // the AP / Bonus Time rule (I-228, raid_config.json costRule): weekdayWeekend served, the opening hours of originalWindows kept off
  weekRule: 'AP and Bonus Time (one rule for all raids)', weekdayAp: 'weekday AP of a quest that was free',
  raidWindow: 'opening hours (open outside them at 90 AP)', jpWindow: 'opening hours (open outside them at 90 AP)', weeklyWindow: 'weekday hours (probable; open outside them at 90 AP)',
  storyBoss: 'story raid boss (unknown quest)', storyOmega: 'odds of the Ω boss in the story', storyConflict: 'story raid boss (sources disagree)', rareType2: 'odds of the rare boss (rule type)' };
// One short sentence per reconstructed value, for the player (user 04-11): what is not original and where the value comes from.
const RECON_TEXT = {
  atk: 'The boss\'s attack is not known after 2016: it is deduced from the bosses with original values.',
  def: 'The boss\'s defense is not known after 2016: it is deduced from the bosses with original values.',
  partHp: 'The HP of the weak points are a share of the boss HP, taken from the 2016 bosses.',
  upMinutes: 'The time limit comes from the videos and posts of the time, not from the game data.',
  useAp: 'The AP of a further attempt comes from the rules of the time, not from this raid\'s own data.',
  coinOdds: 'How many Raid Coins a win gives comes from the community tables, not from the game data.',
  lux: 'The Lux of a win is calculated from the boss HP.',
  moves: 'The boss uses the attacks of a similar boss with original data.',
  hp: 'The boss HP comes from the HP tables of the tiers, read from videos and posts of the time.',
  hp_step: 'The exact week of an HP change is not known: the middle of the known range is used.',
  atk_curve: 'The attack below the maximum level follows the growth of the 2016 bosses.',
  attribute: 'The boss attribute is deduced from its colour.',
  background: 'The fight background is the closest world to the original map.',
  boardAlias: 'A Raid Board reward is matched to its item by name.',
  boardPath: 'The cells of the Raid Boards follow one path: their original layout is not restored yet.',
  boardTexture: 'One Spirit part picture is rebuilt from the original files.',
  boardCost: 'One Raid Board cell cost is corrected (the source had a typo).',
  boardSet: 'Which Raid Boards ran this week comes from the community lists.',
  boardArt: 'A Raid Board card picture is cut from a screenshot of the original game.',
  boardNoArt: 'A Raid Board card picture is missing.',
  rareOdds: 'How often the rare boss appears is deduced from the 2016 data.',
  boardGender: 'Both the male and the female board are open (the original showed only your gender\'s).',
  weekendTimer: 'The weekend time limit comes from the rule of the time (3 hours, 1 hour from May 2018).',
  questObjectives: 'An objective of the event quest is replaced by the standard Raid objectives.',
  levelDrops: 'The level rewards of the notice are paid to your Present Box when the boss is defeated at that level.',
  levelDropsPartial: 'Some level rewards of the notice are not given: their item or amount is not known.',
  boardStandard: 'This raid\'s boards are not known: it uses the boards of a similar raid, without its exclusive medals.',
  eventCoins: 'The coin rewards of this event are not known: the standard Raid Coin table is used.',
  eventHp: 'The boss HP is scaled from its 2016 values up to the HP seen in 2018.',
  setting2016: 'The time limit and AP come from the 2016 data of the same boss.',
  hpTier: 'The HP of each tier is deduced, since no reading of the tiers exists.',
  boardCells: 'Some Raid Board cells are left out: their reward is not known.',
  jp: 'This raid was held only in the Japanese version of the game. Here it is played only from the Raid Catalog: keep it to play it.',
  jpQuest: 'No quest of the Japanese raid survives: it uses the map, level and AP of a worldwide raid of the same boss (or of the same time) and the standard Raid objectives.',
  jpDates: 'Only the start date is known: the raid lasts one week from it.',
  jp2016: 'The boss HP, attack, defense and rewards are its 2016 worldwide values: the Japanese values of this raid are not known.',
  jpTimer: 'The time limit follows the Japanese rules of the time (12 hours, 1 hour from May 2018, for the super-hard weekends; 30 minutes for the monthly raids).',
  jpBoard: 'The Raid Board is the Japanese super-hard board: the same cells, rewards and costs as the worldwide Legendary Raid Reward board.',
  jpBoardOriginal: 'The Raid Boards are the original Japanese ones (cells, costs and rewards from the game data); a Japanese-only medal that has no worldwide version yet is left out, and the cell positions are ours.',
  jpBoardDeduced: 'No Japanese board of this raid survives cell by cell: its Raid Boards are reconstructed from what is known (number of cells, total Raid Coins, main rewards and title from the Japanese wiki, the original board pictures), on the model of the original Japanese boards of the same time. The costs of single cells and the filler medals are ours.',
  jpNoBoard: 'Nothing is known of the Japanese Raid Board of this raid, so it has none here: the raid still gives Raid Coins.',
  jpBossProbable: 'No surviving Japanese source names this boss: it is the probable one (December 2016: the bosses of the worldwide 2016 Showdown! of the same days; September 2017: Crabby Cake for the Japanese «Furious Whole Cake»; August 4 and September 1, 2018: the next boss of the Japanese weekend cycle).',
  jpHpProbable: 'No HP of this weekend survives: it uses the HP players reported for the weekend of June 23, 2018 (about 1.5 billion at every level).',
  weekRule: 'One rule for every raid on this server (not original): from Monday to Friday the raid quest costs its original AP and there is no Bonus Time; on Saturday and Sunday (Pacific time) it costs 0 AP and the Lux of the raid boss is doubled, all day. The original game had its own hours instead: Bonus Time four times a day, and some raids open only at set hours.',
  weekdayAp: 'The original quest cost 0 AP (a free week or an AP 0 campaign of the time): with the rule of this server it costs 5 AP from Monday to Friday and 0 AP on Saturday and Sunday.',
  raidWindow: 'In the original the boss appeared only at set hours (Pacific time): 12:00 and 19:00 for one hour (four hours on the weekend of November 11-12, 2017), or 2:00, 8:00, 14:00 and 20:00 in July 2018. In those hours the raid follows its original rules. Outside them it stays open here (not original): each quest costs 90 AP, there is no Bonus Time, and the boss has a level of its own that does not change the level of the set hours.',
  jpWindow: 'In the original the raid opened twice a day for 30 minutes, 12:00-12:29 and 22:00-22:29 Japan time. In 2017 the boss went back to LV 1 after each window; in 2018 its level carried over to the next window (the months the Japanese notices do not cover follow their year: probable). Outside the windows the raid stays open here (not original): each quest costs 90 AP, there is no Bonus Time, and the boss has a level of its own that does not change the level of the windows.',
  weeklyWindow: 'From Monday to Friday this weekly raid boss came only in the four Bonus Time hours (2:00, 8:00, 14:00 and 20:00 Pacific time), and all day on Saturday and Sunday. Outside those hours it stays open here at 90 AP per quest, with no Bonus Time and a level of its own: the notices of February to July 2019 charged 90 AP outside the hours; before February 2019 players say the boss was not there at all (probable: no notice says so).',
  jpRewardProbable: 'A level reward of the Japanese notice is given as the worldwide Medal it most probably was (its rarity, bonus or guarantee is not stated).',
  storyBoss: 'The raid boss of this story quest is not known: the boss of the nearest quest is used.',
  storyOmega: 'How often the Ω boss appears in this story quest is not known: the boss\'s usual rule from the 2016 data is used.',
  storyConflict: 'The sources name two different raid bosses for this story quest: the community wiki\'s boss is used.',
  rareType2: 'The rule for the rare boss of this boss is not fully understood: it is read like the usual one-in-N chance.',
};
// The AP / Bonus Time rule of this server (I-228, raid-windows.js costRule weekdayWeekend; user 06-11): one line on the detail page,
// and a note at the top of every original notice page, whose AP costs, Bonus Time hours and opening times are the original game's
const RULE_LINE = 'AP and Bonus Time: one rule for every raid on this server (not original). From Monday to Friday each raid quest costs its original AP '
  + '(5 AP if it was free) and there is no Bonus Time; on Saturday and Sunday (Pacific time) raid quests cost 0 AP and the Lux of raid bosses is doubled, all day.';
const RULE_NOTE = `${RULE_LINE} The AP costs, Bonus Time hours and opening times in the notice below are those of the original game: see the «Raid Bosses» notice.`;
const ruleOn = () => windows.costRule() === windows.WEEKDAY_WEEKEND;
const ruleNote = () => (ruleOn() ? `<div class="why rule" style="border-color:#ffcd4a">${esc(RULE_NOTE)}</div>` : '');
const reconList = (codes) => `<ul class="pl">${codes.map((c) => `<li><b>${esc(RECON_LABEL[c] || c)}</b>: ${esc(RECON_TEXT[c] || 'rebuilt from the surviving sources.')}</li>`).join('')}</ul>`;
const RAID_DETAIL_CSS = '.tt{table-layout:auto}.tt td:nth-child(4){white-space:nowrap}.tt td.r{color:#ffcd4a}ul.ow{list-style:none;padding:0;margin:4px 0 10px}ul.ow li{padding:6px 0;border-bottom:1px solid #2f5d78}ul.ow a{color:#9fd4ff}';
// levels gained per win stated by the raid's own notice (make-raid.js entry.levelStep: the Japanese year-end raid of 2016, +10)
const stepOf = (row) => Math.max(1, ...row.entries.map((e) => Number(e.levelStep) || 1));
function detailPage(index, evStageId, ctx = {}) {
  const rows = calendar.catalogRows(index), row = rows.find((r) => r.evStageId === Number(evStageId));
  if (!row) return null;
  const st = statusOf(row, ctx), kept = keptRow(rows, ctx), title = titleOf(row), periods = ctx.periods;
  const button = st.button === null ? '' : `<div>${keepButton(row.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(){b.style.display=\'none\';})"')}</div>`;
  const pName = GAME_YEARS[gameYearOf(row.start)].name;
  const kv = [['Dates', dateRange(row)], ['Type', FAMILY_LABEL[row.family] || row.family], ['Game year', pName]].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const tierRows = row.entries.map((e) => `<tr><td>${esc(tierLabel(e.tier))}</td><td>${esc(e.boss || '')}</td><td>${e.level ?? ''}</td>`
    + `<td${e.available ? '' : ' class="r"'}>${e.available ? Number(e.hp || 0).toLocaleString('en-US') : 'Not restored yet'}</td></tr>`).join('');
  const ids = [...new Set(row.entries.flatMap((e) => e.sphereBoardIds || []))];
  const names = [...new Set(row.entries.flatMap((e) => e.boards || []))];
  // a Japan-only raid's boards have no census name, only the served boards' own (listed below): no «no boards» line then
  // a Japan-only raid with nothing known of its board (label jpNoBoard, user decision 06-11) says why it has none
  const noBoard = row.entries.some((e) => (e.reconstructed || []).includes('jpNoBoard'))
    ? '<p class="n">No Raid Boards: the Japanese board of this raid is not known, so none is served.</p>' : '<p class="n">No Raid Boards this week.</p>';
  const boards = (names.length ? `<p>${names.map(esc).join(', ')}</p>` : ids.length ? '' : noBoard)
    + (ids.length ? `<ul class="pl">${ids.map((id) => {
      const items = [...new Set(ctx.boardItems ? ctx.boardItems(id) : [])], name = ctx.boardName ? ctx.boardName(id) : '';
      return `<li>${name ? `<b>${esc(name)}</b>: ` : ''}<span class="dr">${items.map(esc).join(', ') || '—'}</span></li>`;
    }).join('')}</ul>` : '');
  // the labels of raids.json in the player's words (index.reasons holds the builder's notes: file names, config keys)
  const codes = [...new Set(row.entries.flatMap((e) => e.reconstructed || []))];
  const recon = codes.length ? `<h2>Reconstructed values</h2>${reconList(codes)}`
    + '<p class="n">The original values are lost: these are rebuilt from the surviving sources, as the Raid Bosses notice explains.</p>' : '';
  const others = rows.filter((r) => r !== row && r.bosses.some((b) => row.bosses.includes(b))).sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  const other = others.length ? `<h2>Other weeks of ${esc(title)}</h2><ul class="ow">${others.map((r) => `<li><a href="${detailHref(r.evStageId)}">${dateRange(r)}</a> · ${esc(titleOf(r))}<br>${statusOf(r, ctx).pill}</li>`).join('')}</ul>` : '';
  const back = ctx.fromCatalog ? `<div class="bar"><a class="back" href="/web/raid/catalog#q${row.evStageId}">BACK<span></span></a></div>` : '';
  return PAGE_HEAD(title, CSS + DETAIL_CSS + RAID_DETAIL_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(title)}</h1><img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
    + `${st.pill}<div id="pinmsg" class="pinmsg"></div><div class="why ${st.cls}">${st.why}</div>${replacesLine(st, kept)}${button}`
    + (row.jp ? `<ul class="ow"><li><a href="/web/raid/notice/${row.evStageId}?from=raid">Notice of this raid ›</a></li></ul>`
      : ctx.hasNotice && ctx.hasNotice(row.censusId) ? `<ul class="ow"><li><a href="/web/raid/notice/${row.evStageId}?from=raid">Original notice of this raid ›</a></li></ul>` : '')
    + `<h2>Week</h2><table class="kv">${kv}</table>`
    + `<h2>Tiers</h2><table class="tt"><tr><th>Tier</th><th>Boss</th><th>Quest LV</th><th>Boss HP</th></tr>${tierRows}</table>`
    + (ruleOn() ? `<p class="n">${esc(RULE_LINE)}</p>` : '')
    + `<p class="n">The boss starts at LV 1 and gains ${stepOf(row) > 1 ? `${stepOf(row)} levels` : 'a level'} at every win, up to LV 99; levels reset on the 1st of every month.</p>`
    + `<h2>Raid Boards</h2>${boards}${recon}${other}`
    + `<p class="n">The Raid Catalog is an addition of this server: in the original game a raid was played only in its own week.</p>${back}<script>${KEEP_JS}</script></body></html>`;
}

// Original notice of a raid (Details of its banner in the Events tab, as the event cards of the original game): GET
// /web/raid/notice/<evStageId>. doc = game_data/raid_notices.json (make-raid-notices.js, git-ignored SQUARE ENIX text):
// {rows: {censusId: {noticeId, how, confidence, note?}}, notices: {id: {title, date, time, category, body: [lines]}}}.
// Layout of the details pages (DETAIL_CSS): the card, the title, a category and date chip, then the notice in boxes, one per
// event of the notice (● headings; ★ before any ●), every sentence unchanged, only laid out: ■ headings h3, ▼ / ◇ headings h4,
// a ★ line under a heading as its tagline, «[Updated …]» lines marked, ・ / • lines one list, * lines notes, «Name x N» runs a
// table (item, quantity), a PT + UTC period pair a small table, the «Pacific Time / UTC» hour lists (PT column then UTC column
// in the source) paired in a table, ▽title▽ … △CLOSE△ a collapsed block. A notice of several events (2019-2021): the raid's
// section only (heading with «Raid», «Radiant» or a boss of the week; user 04-11: the other events go to their own catalogs
// later). Player rankings and page boilerplate are removed (make-raid-notices.js scrub, run again here). Last, the
// «On this server» box: the status of the raid here, the fake clock, the reconstructed values in the player's words (RECON_LABEL),
// the tiers not restored, links to the raid's details and the Raid Catalog. ctx.from === 'raid' (opened from the details
// page): BACK bar. No notice for the id (no file, unknown id): a friendly page, never an error.
const { scrub: scrubNotice, OMIT_LINE: OMIT } = require('./make-raid-notices');
const NOTICE_CSS = '.dt{margin:2px 0 10px}.chip{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:12px;padding:0 10px;margin:0 6px 4px 0;font-size:13px;line-height:1.7;color:#fff}'
  + '.chip.d{background:#06283e;border-color:#ffcd4a;color:#ffcd4a}'
  + '.ns{border-left:5px solid #5d8aa6;background:#06283e;border-radius:0 8px 8px 0;padding:6px 12px 8px;margin:10px 0;font-size:16px;line-height:1.55;overflow-wrap:break-word}'
  + '.ns.raid{border-left-color:#ffcd4a}.ns h2{margin:4px 0 4px}.ns.raid h2{color:#ffcd4a}.ns h3{font-size:16px;margin:12px 0 2px}.ns h4{color:#00d4ed;font-size:15px;margin:10px 0 2px}'
  + '.ns p{margin:3px 0 6px}.ns .tg{color:#fff;font-weight:bold;margin:2px 0 6px}.ns .upd{display:inline-block;background:#b8860b;border-radius:10px;padding:0 10px;font-size:13px;line-height:1.7;margin:4px 0}'
  + '.ns .nb{color:#b9cfdc;font-size:14px;margin:2px 0 4px}.ns .om{color:#b9cfdc;font-style:italic;font-size:14px;border:1px dashed #5d8aa6;border-radius:6px;padding:4px 10px}'
  + 'ul.nl{margin:2px 0 8px;padding-left:22px}ul.nl li{margin:2px 0}.ns table{margin:4px 0 10px}.rw td.q{width:28%;color:#ffcd4a;white-space:nowrap}.pd th{width:30%}.bt th{width:50%}'
  + 'details.fold{margin:6px 0;border:1px solid #2f5d78;border-radius:6px;padding:2px 10px}details.fold>summary{cursor:pointer;color:#00d4ed;padding:4px 0}'
  + 'details.oth{margin:10px 0}details.oth>summary{cursor:pointer;color:#b9cfdc;font-size:15px;padding:6px 10px;background:#0a4466;border-radius:6px}details.oth[open]>summary{color:#fff}'
  + 'h2.on{margin-top:20px}.srv{border:2px solid #ffcd4a;border-radius:8px;background:#0a4466;padding:4px 12px 10px;margin:18px 0}.srv h2{color:#ffcd4a;margin-top:6px}.srv h2:before{content:""}'
  + '.srv a,.na a{color:#9fd4ff}.srv li{margin:4px 0}';

// notice body (lines) -> {sections: [{head (null: the lines before the first heading), lines, raid}]}; bosses: of the week
// ● / ◆ open an event, except an hour line «● 2:00 p.m. - …» (a list line) and «● Raid Boss Bonus Time» (17890: a sub-heading)
const EVENT_HEAD = /^[●◆](?!\s*\d)(?!.*Bonus Time\s*$)\s*/, STAR = /^★\s*/, BRACKET = /^【[^】]*】$/;
function parseNotice(body, bosses = []) {
  const lines = scrubNotice((body || []).map((l) => String(l ?? ''))).body;
  const top = lines.some((l) => EVENT_HEAD.test(l) || BRACKET.test(l));
  const sections = [{ head: null, lines: [] }];
  let seenEvent = false;
  for (const l of lines) {
    const ev = EVENT_HEAD.test(l) || BRACKET.test(l);
    // ★ opens an event when the notice has no ● at all, or before its first ● (61221: the ★ events before the ● ones)
    if (ev || (STAR.test(l) && (!top || !seenEvent) && !(sections[sections.length - 1].head && !sections[sections.length - 1].lines.length))) {
      if (ev) seenEvent = true;
      sections.push({ head: l.replace(EVENT_HEAD, '').replace(STAR, '').replace(/^【([^】]*)】$/, '$1').trim(), star: !ev, lines: [] });
    } else sections[sections.length - 1].lines.push(l);
  }
  if (!sections[0].lines.length) sections.shift();
  const names = bosses.filter(Boolean).map((b) => b.toLowerCase());
  // «Radiant Rewards» is a raid section only when it is not the Union Cross one («New Year Union Cross Radiant Rewards», 2021)
  for (const s of sections) s.raid = !!s.head && (/\braid/i.test(s.head) || (/radiant/i.test(s.head) && !/union\s*cross|\bcross\b/i.test(s.head))
    || names.some((b) => s.head.toLowerCase().includes(b)));
  // no heading names the raid (65407 «May Special Campaign!», the end-of-service notice): the event that speaks of raids most
  if (!sections.some((s) => s.raid)) {
    const n = (s) => (s.head ? s.lines.filter((l) => /\braid/i.test(l)).length : 0);
    const best = sections.reduce((a, s) => (n(s) > n(a) ? s : a), sections[0]);
    if (best && n(best) >= 2) best.raid = true;
  }
  return { sections };
}

// an hour range «2:00 a.m. - 2:59 a.m.» / «9:00 to 10:00», or two of them around «→» (the daylight-saving change of 2017)
const RANGE = '\\d{1,2}:\\d\\d(\\s*[ap]\\.?m\\.?)?\\s*(-|–|~|to)\\s*\\d{1,2}:\\d\\d(\\s*[ap]\\.?m\\.?)?';
const PT_LINE = /^(.*\S)\s*\(PT\)$/, UTC_LINE = /^(.*\S)\s*\(UTC\)$/, HOURS = new RegExp(`^${RANGE}(\\s*→\\s*${RANGE})?$`, 'i');
// «Name x N» (one item: not «A x 1, B x 1»)
const REWARD = /^[・•]?\s*((?:(?![xX×]\s*\d).)+?)(?:\s+[xX]|\s*×)\s*(\d{1,3}(?:,\d{3})+|\d+)$/;
const LIST = /^(?:[・•]|[●◆](?=\s*\d))\s*/, NOTE = /^[*＊※]/, OPEN = /^▽\s*(.*?)\s*▽$/, CLOSE = /^△\s*CLOSE\s*△$/i;
// the lines of one section -> html (every line escaped; the markers are layout and are dropped, * notes keep theirs)
function noticeBlocks(lines) {
  let h = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = OPEN.exec(l))) {
      let j = i + 1;
      while (j < lines.length && !CLOSE.test(lines[j])) j++;
      h += `<details class="fold"><summary>${esc(m[1])}</summary>${noticeBlocks(lines.slice(i + 1, j))}</details>`;
      i = j;
    } else if (CLOSE.test(l)) {
      // a stray close marker: layout only
    } else if (l === OMIT) {
      h += `<p class="om">${esc(l)}</p>`;
    } else if (/^[■●◆](?!\s*\d)/.test(l)) {
      h += `<h3>${esc(l.replace(/^[■●◆]\s*/, ''))}</h3>`;
    } else if (/^[▼◇]\s*/.test(l)) {
      h += `<h4>${esc(l.replace(/^[▼◇]\s*/, ''))}</h4>`;
    } else if (STAR.test(l)) {
      h += `<p class="tg">${esc(l.replace(STAR, ''))}</p>`;
    } else if (/^\[?(Updated|Edited)\b/i.test(l)) {
      h += `<p><span class="upd">${esc(l)}</span></p>`;
    } else if (PT_LINE.test(l) && UTC_LINE.test(lines[i + 1] || '')) {
      h += `<table class="kv pd"><tr><th>Pacific Time</th><td>${esc(PT_LINE.exec(l)[1])}</td></tr><tr><th>UTC</th><td>${esc(UTC_LINE.exec(lines[i + 1])[1])}</td></tr></table>`;
      i++;
    } else if (/^Pacific Time$/i.test(l) && /^UTC$/i.test(lines[i + 1] || '')) {
      // optional caption line «(…)» under the header, then the PT column and the UTC column
      const cap = /^\(.*\)$/.test(lines[i + 2] || '') ? 1 : 0;
      let j = i + 2 + cap;
      while (j < lines.length && HOURS.test(lines[j].replace(/　/g, ' '))) j++;
      const hrs = lines.slice(i + 2 + cap, j), n = hrs.length / 2;
      if (n >= 1 && Number.isInteger(n)) {
        h += (cap ? `<p class="nb">${esc(lines[i + 2])}</p>` : '')
          + `<table class="bt"><tr><th>Pacific Time</th><th>UTC</th></tr>${hrs.slice(0, n).map((x, k) => `<tr><td>${esc(x)}</td><td>${esc(hrs[n + k])}</td></tr>`).join('')}</table>`;
        i = j - 1;
      } else h += `<p>${esc(l)}</p>`;
    } else if (REWARD.test(l)) {
      let j = i;
      while (j < lines.length && REWARD.test(lines[j])) j++;
      h += `<table class="rw"><tr><th>Item</th><th>Quantity</th></tr>${lines.slice(i, j).map((x) => { const [, a, b] = REWARD.exec(x); return `<tr><td>${esc(a)}</td><td class="q">× ${esc(b)}</td></tr>`; }).join('')}</table>`;
      i = j - 1;
    } else if (LIST.test(l)) {
      let j = i;
      while (j < lines.length && LIST.test(lines[j]) && !REWARD.test(lines[j])) j++;
      h += `<ul class="nl">${lines.slice(i, j).map((x) => `<li>${esc(x.replace(LIST, ''))}</li>`).join('')}</ul>`;
      i = j - 1;
    } else if (NOTE.test(l)) {
      h += `<p class="nb">${esc(l)}</p>`;
    } else h += `<p>${esc(l)}</p>`;
  }
  return h;
}
function noticeBody(body, bosses) {
  const { sections } = parseNotice(body, bosses);
  const box = (s, cls = '') => `<div class="ns${cls}">${s.head ? `<h2>${esc(s.head)}</h2>` : ''}${noticeBlocks(s.lines)}</div>`;
  const named = sections.filter((s) => s.head);
  if (named.length < 2 || !sections.some((s) => s.raid)) return sections.map((s) => box(s, s.raid ? ' raid' : '')).join('');
  // only the raid part (user 04-11): the other events of the notice belong to their own catalogs and are added there later
  return sections.filter((s) => s.raid).map((s) => box(s, ' raid')).join('');
}
function noticeMissing(row, ctx) {
  const back = row && ctx.from === 'raid' ? `<div class="bar"><a class="back" href="/web/raid/raid/${row.evStageId}?from=catalog">BACK<span></span></a></div>` : '';
  return PAGE_HEAD('Notice not available', CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}><h1>Notice not available</h1>`
    + '<p class="na">The original notice of this raid is not available on this server.'
    + (row ? ` <a href="/web/raid/raid/${row.evStageId}">See this raid in the Raid Catalog ›</a>` : '') + `</p>${back}</body></html>`;
}
function noticePage(index, evStageId, doc, ctx = {}) {
  let row = null;
  try {
    row = calendar.catalogRows(index || { entries: [] }).find((r) => r.evStageId === Number(evStageId)) || null;
    const hit = row && doc && doc.rows ? doc.rows[row.censusId] : null;
    const n = hit && doc.notices ? doc.notices[hit.noticeId] : null;
    const st = row && statusOf(row, ctx);
    const codes = row ? [...new Set(row.entries.flatMap((e) => e.reconstructed || []))] : [];
    const recon = codes.length ? `<p>Some values of this raid are lost and were rebuilt from the surviving sources:</p>${reconList(codes)}` : '';
    const off = row ? row.entries.filter((e) => !e.available) : [];
    const offLine = off.length ? `<p>Not restored yet: ${off.map((e) => esc(`${tierLabel(e.tier)} (${e.boss || ''})`)).join(', ')}. Its graphics or data are incomplete in the surviving game files.</p>` : '';
    const back = row && ctx.from === 'raid' ? `<div class="bar"><a class="back" href="/web/raid/raid/${row.evStageId}?from=catalog">BACK<span></span></a></div>` : '';
    const links = row ? `<ul class="ow"><li><a href="/web/raid/raid/${row.evStageId}">This raid in the Raid Catalog ›</a></li><li><a href="/web/raid/catalog">Raid Catalog ›</a></li></ul>` : '';
    // end-of-service weeks (from 2021-03-01, make-raid-notices.js eos): no notice of their own existed (user 04-11)
    if (hit && hit.eos) {
      const title = titleOf(row);
      return PAGE_HEAD(title, CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}>`
        + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
        + `<h1>${esc(title)}</h1><p class="dt"><span class="chip">EVENT</span><span class="chip d">${esc(dateRange(row))}</span></p>${ruleNote()}`
        + '<div class="ns raid"><h2>No notice for this week</h2><p>This raid ran in the last weeks of the original game, during the end of service: '
        + 'no specific notice was published for it. The end of service itself is announced in the game.</p></div>'
        + `<div class="srv"><h2>On this server</h2><p>This server follows your Story instead of the calendar: this week of the original game (${esc(dateRange(row))}) `
        + 'opens when your Story reaches it.</p>'
        + `${st.pill}<div class="why ${st.cls}">${st.why}</div>${recon}${offLine}${links}</div>${back}</body></html>`;
    }
    if (row && row.jp) return jpNoticePage(row, doc, ctx, { st, recon, offLine, back, links });
    if (!n || !Array.isArray(n.body)) return noticeMissing(row, ctx);
    return PAGE_HEAD(n.title, CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}>`
      + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
      + `<h1>${esc(n.title)}</h1><p class="dt">${n.category ? `<span class="chip">${esc(n.category)}</span>` : ''}<span class="chip d">${esc(niceDay(n.date))}${n.time ? ` · ${esc(n.time)} UTC` : ''}</span></p>`
      + ruleNote()
      + (hit.note ? `<div class="why off">${esc(hit.note)}</div>` : '')
      + noticeBody(n.body, row.bosses)
      + '<div class="srv"><h2>On this server</h2>'
      + '<p>The text above is the raid part of the original notice, unchanged (other events of the same notice and the lists of top players are left out). This server follows your Story instead of the calendar: the dates in the notice '
      + `are those of the original game (${esc(dateRange(row))}); the raid opens when your Story reaches that week.</p>`
      + `${st.pill}<div class="why ${st.cls}">${st.why}</div>${recon}${offLine}`
      + `${links}</div>${back}</body></html>`;
  } catch (e) {
    return noticeMissing(row, ctx);
  }
}

// Details page of a Japan-only raid (task 2, 06-11): no original JP notice page exists for its banner, so the page says plainly
// whether the JP notice was recovered and gives what is known. doc.jp[censusId] (make-raid-notices.js, from the private
// jp_notice_facts.json): the facts of the JP notice translated by us, shown marked as our translation; else «not recovered».
// Then the facts this server has: dates, bosses per day, HP, time limit, level rule, level rewards, Raid Boards with their
// label (original / reconstructed / Japanese super-hard board / none), the one-AP-rule note, and the «On this server» box.
// the texts printed on the original JP banners (server/raid_jp_banners.json, read by eye, our translation; user 06-11)
const JP_BANNERS = (() => { try { return require('./raid_jp_banners.json').rows || {}; } catch { return {}; } })();
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const minutesText = (m) => (!m ? '' : m % 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`);
const JP_BOARD_STATE = [['jpBoardOriginal', 'original Japanese boards'], ['jpBoard', 'the Japanese super-hard board (= worldwide Legendary Raid Reward)'],
  ['jpBoardDeduced', 'reconstructed from the surviving evidence'], ['jpNoBoard', 'none: not known']];
function jpNoticePage(row, doc, ctx, { st, recon, offLine, back, links }) {
  const title = titleOf(row), facts = doc && doc.jp ? doc.jp[row.censusId] : null;
  const codes = new Set(row.entries.flatMap((e) => e.reconstructed || []));
  const notice = facts && Array.isArray(facts.lines)
    ? `<div class="ns raid"><h2>Original Japanese notice (our translation)</h2>`
      + `<p class="dt"><span class="chip">JP notice ${esc(facts.noticeId)}</span><span class="chip d">${esc(niceDay(facts.date))}</span></p>`
      + `<p class="tg">«${esc(facts.title)}»</p><ul class="nl">${facts.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      + `<p class="nb">Translated by this server from the original Japanese notice${facts.standing ? ' (the standing notice of these raids, not one of this weekend)' : ''}: `
      + 'the facts are those of the notice, the wording is ours. Times are Japan time.</p></div>'
    : '<div class="ns raid"><h2>Notice not recovered</h2><p>The original Japanese notice of this raid has not been recovered.</p>'
      + '<p class="nb">Below is what is known of this raid from the other surviving sources.</p></div>';
  const play = row.entries.filter((e) => e.available);
  const bossRows = (play.length ? play : row.entries).map((e) => {
    const when = e.day ? (e.open === 'day' && row.entries.length > 1 ? `${WEEKDAY[new Date(`${e.day}T12:00:00Z`).getUTCDay()]}s` : niceDay(e.day)) : tierLabel(e.tier);
    return `<tr><td>${esc(when)}</td><td>${esc(e.boss || '')}</td><td>${e.available ? Number(e.hp || 0).toLocaleString('en-US') : 'Not restored yet'}</td><td>${esc(minutesText(e.upMinutes))}</td></tr>`;
  }).join('');
  const open = play.some((e) => e.open === 'weekend') ? 'Saturday and Sunday only' : play.some((e) => e.open === 'day') ? 'each boss on its own day' : 'every day of its dates';
  const drops = [...new Set(play.flatMap((e) => (e.levelDrops || []).map((d) => `LV ${d.level}: ${(d.items || []).join(', ')}`)))];
  const state = JP_BOARD_STATE.filter(([c]) => codes.has(c)).map(([, l]) => l).join('; ') || 'none';
  const ids = [...new Set(play.flatMap((e) => e.sphereBoardIds || []))];
  const boards = ids.length ? `<ul class="pl">${ids.map((id) => {
    const items = [...new Set(ctx.boardItems ? ctx.boardItems(id) : [])], name = ctx.boardName ? ctx.boardName(id) : '';
    return `<li>${name ? `<b>${esc(name)}</b>: ` : ''}<span class="dr">${items.map(esc).join(', ') || '—'}</span></li>`;
  }).join('')}</ul>` : '<p class="n">No Raid Boards: the Japanese board of this raid is not known, so none is served.</p>';
  const kv = [['Dates', `${dateRange(row)} (Japanese version only)`], ['Type', FAMILY_LABEL[row.family] || row.family], ['Open', open],
    ['Level', `LV 1, +${stepOf(row)} at every win, up to LV 99`], ['Raid Boards', state]].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  return PAGE_HEAD(title, CSS + DETAIL_CSS + NOTICE_CSS + RAID_DETAIL_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
    + `<h1>${esc(title)}</h1><p class="dt"><span class="chip">JAPAN ONLY</span><span class="chip d">${esc(dateRange(row))}</span></p>${ruleNote()}`
    + (JP_BANNERS[row.censusId] ? '<div class="ns"><h2>On the banner (our translation)</h2>'
      + `<p lang="ja" class="nb">${esc(JP_BANNERS[row.censusId].ja)}</p><p>${esc(JP_BANNERS[row.censusId].en)}</p>`
      + '<p class="nb">The Japanese text printed on the original banner of this raid, translated by this server.</p></div>' : '')
    + notice
    + `<div class="ns"><h2>What is known of this raid</h2><table class="kv">${kv}</table>`
    + `<table class="tt"><tr><th>Day / tier</th><th>Boss</th><th>HP at LV 1</th><th>Time limit</th></tr>${bossRows}</table>`
    + (drops.length ? `<h3>Level rewards</h3><ul class="nl">${drops.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '')
    + `<h3>Raid Boards</h3>${boards}</div>`
    + '<div class="srv"><h2>On this server</h2><p>This raid was held only in the Japanese version of the game: here it is played only from the Raid Catalog, '
    + `once your Story has passed its dates (${esc(dateRange(row))}).</p>`
    + `${st.pill}<div class="why ${st.cls}">${st.why}</div>${recon}${offLine}${links}</div>${back}</body></html>`;
}

module.exports = { expandCatalog, catalogPage, detailPage, noticePage, parseNotice, statusOf, khuxMatch };
