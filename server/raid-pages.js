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
// Two sections (user 06-11): Worldwide and Japan only, each with its own year tabs, year chips and Filters; a row's section
// is data-sec. TYPE of a row (family of its census row): [value, label, icon key]; the TYPE / TIER chips without a row in the
// current section are hidden (data-sec of the chip). A Japan-only row is typed by its JP family.
const JP_TYPE = { event: 'jpev', 'super-hard weekend': 'jpshw', 'monthly (30-minute)': 'jpmo', 'daily rotating': 'jpday' };
const secOf = (row) => (row.jp ? 'jp' : 'ww');
const typeOf = (row) => (row.jp ? JP_TYPE[row.family] || 'jpev' : row.family === 'radiant reward' ? 'radiant' : /^weekly \(/.test(row.family) || EVENT_FAMILIES.has(row.family) ? 'event' : 'weekly');
const TYPE_OPTS = [['all', 'All'], ['weekly', 'Weekly', 'weekday'], ['radiant', 'Radiant Reward', 'jewel'], ['event', 'Raid Events', 'camp'],
  ['jpev', 'Raid Events', 'camp'], ['jpshw', 'Super-Hard Weekends', 'raid'], ['jpmo', 'Monthly 30-Minute', 'bonus'], ['jpday', 'Daily Rotating', 'daily']];
const SECTIONS = [['ww', 'Worldwide', 'raid'], ['jp', 'Japan only', 'jp']];
// TIER chips (06-11): our drawn rank marks (special_icons.py): 1 / 2 / 3 stars, a crown, a large star, a «1» (one-tier raid)
const TIER_OPTS = [['all', 'All'], ['beginner', 'Beginner', 'tbeg'], ['intermediate', 'Intermediate', 'tint'], ['advanced', 'Advanced', 'tadv'], ['legendary', 'Legendary', 'tleg'],
  ['epic', 'Epic', 'tepic'], ['single', 'One tier', 'tone']];
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
// the two section tabs (Worldwide / Japan only, user 06-11): big gold-lit buttons above the year tabs; the Japan only intro box
// (.rc of the rule callout, RULE_CSS) with one line per rule; the Keep button of a Japan-only row stands out (the only way to play it)
const SEC_CSS = '.secs{display:flex;gap:6px;margin:8px 0 6px}'
  + '.sec{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;border:2px solid #39a7cf;border-radius:12px;background:#0a4466;color:#d9e6ee;font:bold 16px sans-serif;padding:7px 6px;cursor:pointer;box-shadow:0 2px 0 #02202f;letter-spacing:.3px}'
  + '.sec .ic{width:1.5em;height:1.5em}.sec .sn{background:#043654;color:#ffa500;border-radius:10px;padding:0 8px;font-size:13px;line-height:1.6}'
  + '.sec.on{background:linear-gradient(#ffd866,#e0a020 60%,#a8700a);border-color:#ffe08a;color:#fff;text-shadow:0 1px 1px rgba(90,50,0,.7);box-shadow:0 2px 0 #6a4500}.sec.on .sn{background:#fff;color:#a8700a;text-shadow:none}'
  + '.rcl span{display:block;color:#d9e6ee;font-size:14.5px;padding:2px 0 2px 1.8em;text-indent:-1.8em}.rcl span .ic{width:1.35em;height:1.35em}.rcl b{color:#fff}'
  + '.pk.jk{font-size:15px;padding:5px 18px;box-shadow:0 0 0 3px rgba(255,205,74,.3),0 2px 0 #6a4500}';

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
const keepButton = (id, on, extra = '', cls = '') => `<a href="#" class="pk${cls}" data-id="${id}" data-on="${on}" data-pin="${on === 1 ? `/web/raid/keep/${id}` : '/web/raid/unkeep'}"${extra}>${on === 1 ? KEEP_LABEL : REMOVE_LABEL}</a>`;

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
var rows=[].map.call(document.querySelectorAll('.row'),function(el){return {el:el,id:attr(el,'data-eid'),st:attr(el,'data-show'),p:attr(el,'data-periods'),y:attr(el,'data-y'),sec:attr(el,'data-sec'),
t:attr(el,'data-type'),dn:attr(el,'data-done')==='1',bd:attr(el,'data-boards'),tr:' '+attr(el,'data-tier')+' ',ns:(attr(el,'data-search')||'').split(' | '),mt:q(el,'.mt')};});
var mls=[].map.call(document.querySelectorAll('.ml'),function(el){return el;});
var ycs=[].map.call(document.querySelectorAll('.yc'),function(el){return {el:el,y:attr(el,'data-yr'),n:q(el,'.yn')};});
// one state per section (its own tab, year and filters): switching section keeps the other's
function blank(sec){return {sec:sec,p:'all',type:'all',tier:'all',show:'all',prog:'all',bd:'all',q:''};}
var cur=blank('ww'),dr=null,yr=attr($('rows'),'data-defy')||'all',keep={jp:blank('jp')},keepY={jp:attr($('rows'),'data-defy-jp')||'all'};
function copy(s){return {sec:s.sec,p:s.p,type:s.type,tier:s.tier,show:s.show,prog:s.prog,bd:s.bd,q:s.q};}
function hits(r,qq,max){var o=[],i;for(i=0;i<r.ns.length&&o.length<max;i++)if(khuxMatch(qq,r.ns[i]))o.push(r.ns[i]);return o;}
function match(r,s,anyPeriod){
if(r.sec!==s.sec)return false;
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
[].forEach.call(document.querySelectorAll('.tab'),function(t){p=attr(t,'data-p');t.className='tab'+(p===cur.p?' on':'')+(attr(t,'data-n'+cur.sec)==='0'?' hide':'');$('tc'+p).textContent=c[p]||0;});
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
var none=$('none');var wq=(cur.prog==='done'?'completed ':cur.prog==='todo'?'incomplete ':'')+'raids'+(cur.bd==='done'?' with completed Raid Boards':cur.bd==='todo'?' with Raid Boards to complete':'');none.textContent=n?'':(cur.q?'No '+wq+' match "'+cur.q+'"':'No '+wq+' match your filters');none.style.display=n?'none':'';mark();}
// the section and year in the address (#jp.2017): the WebView's own back key comes back to them, not only the BACK button
function mark(){var hh='#'+cur.sec+(yr!=='all'?'.'+yr:'');if(location.hash===hh||!history.replaceState)return;try{history.replaceState(null,'',hh);}catch(e){}}
function setSec(s){if(s===cur.sec||(s!=='ww'&&s!=='jp'))return;keep[cur.sec]=cur;keepY[cur.sec]=yr;cur=keep[s]||blank(s);yr=keepY[s]||'all';
[].forEach.call(document.querySelectorAll('.sec'),function(b){b.className='sec'+(attr(b,'data-sec')===s?' on':'');});
hide($('jpi'),s!=='jp');var sp=$('span');if(sp)sp.textContent=attr(sp,'data-'+s)||'';render();}
// the chips (and a whole group) without a raid in the section are hidden: TYPE has its own chips per section, TIER one only in Japan only
function secChips(){[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var n=0;[].forEach.call(box.children,function(o){var ss=attr(o,'data-sec'),h=ss!==null&&(' '+ss+' ').indexOf(' '+cur.sec+' ')<0;hide(o,h);if(!h&&attr(o,'data-v')!=='all')n++;});
var hd=box.previousSibling;hide(box,n<2);if(hd&&hd.tagName==='H4')hide(hd,n<2);});}
// after a keep / remove: the kept row gold, the previous one back to «can be kept», the «Replaces» lines
function setRow(r,st){var pc=PILL[st];r.st=st;r.el.setAttribute('data-show',st);r.el.className='row '+pc[0]+(/ hide/.test(r.el.className)?' hide':'');var s=q(r.el,'.s');if(s){s.className='s s-'+pc[0];s.innerHTML=pc[1];}
var b=q(r.el,'.pk');if(b)kxSet(b,r.id,st==='kept');}
window.kxRow=function(id,on){var name='',i,r;for(i=0;i<rows.length;i++){r=rows[i];if(r.st==='kept')setRow(r,'can');if(r.id===id){setRow(r,on?'kept':'can');if(on)name=attr(r.el,'data-name');}}
for(i=0;i<rows.length;i++){var x=q(rows[i].el,'.rp');if(x){x.textContent=name?'Replaces\\u003a '+name:'';x.style.display=name&&rows[i].st==='can'?'':'none';}}render();};
[].forEach.call(rows,function(r){r.el.onclick=function(e){var t=e.target;while(t&&t!==r.el){if(t.tagName==='A')return;t=t.parentNode;}location.href=attr(r.el,'data-href');};});
function sync(){[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr),'result');}
function openF(){dr=copy(cur);secChips();$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
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
$('secs').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-sec'))t=t.parentNode;var s=attr(t,'data-sec');if(s)setSec(s);};
var hs=location.hash.slice(1);
render();
// BACK from a details page: #q<id> selects its section and year, then scrolls to it; #jp.2017 (mark, the WebView's back key)
// the section and year. hs is read before the first render, which writes the address
var h=hs&&document.getElementById(hs),m=/^(ww|jp)(?:\\.(\\d+))?$/.exec(hs);
if(h&&attr(h,'data-sec')){setSec(attr(h,'data-sec'));if(attr(h,'data-y')){yr=attr(h,'data-y');render();}if(h.scrollIntoView)h.scrollIntoView();}
else if(m){setSec(m[1]);if(m[2]){yr=m[2];render();}}
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
    // the TYPE of the row (06-11: one per JP family) only inside its attribute, so the rows of all types share their templates
    if (fields.t) h = h.split(`data-type="${fields.t}"`).join('data-type="\u0001t"');
    if (!tplIx.has(h)) { tplIx.set(h, tpl.length); tpl.push(h); }
    return [tplIx.get(h), fields.s ? fields.s.split(' | ').map(word) : [], fields.d, fields.n, fields.e, fields.y, label, fields.t];
  });
  // «</» never closes the script element: written <\/ inside the JSON
  return JSON.stringify({ t: tpl, w: dict, r: rows }).replace(/<\//g, '<\\/');
}
const unpackRow = (d, r) => r[6] + d.t[r[0]].replace(/\u0001([sdneyt])/g, (x, k) => ({ s: r[1].map((i) => d.w[i]).join(' | '), d: r[2], n: r[3], e: r[4], y: r[5], t: r[7] })[k]);
// the same expansion as UNPACK_JS, for the tests: the catalogue page with its rows written out
function expandCatalog(page) {
  const m = /<script id="kxrows" type="application\/json">([\s\S]*?)<\/script><script>[\s\S]*?<\/script>/.exec(page);
  if (!m) return page;
  const d = JSON.parse(m[1]);
  const html = d.r.map((r) => unpackRow(d, r)).join('');
  return page.replace(m[0], '').replace(/(<div id="rows"[^>]*>)/, (x) => x + html);
}
const UNPACK_JS = 'function kxImgs(){var a=document.querySelectorAll("#rows .row"),i,im;for(i=0;i<a.length;i++){if(/ hide/.test(a[i].className))continue;im=a[i].querySelector("img[data-src]");if(im&&!im.getAttribute("src"))im.setAttribute("src",im.getAttribute("data-src"));}}'
  + '(function(){var d=JSON.parse(document.getElementById("kxrows").textContent),o=[],i,r;for(i=0;i<d.r.length;i++){r=d.r[i];'
  + 'o.push(r[6]+d.t[r[0]].replace(/\u0001([sdneyt])/g,function(x,k){if(k==="s"){var s=[],j;for(j=0;j<r[1].length;j++)s.push(d.w[r[1][j]]);return s.join(" | ");}return k==="d"?r[2]:k==="n"?r[3]:k==="e"?r[4]:k==="t"?r[7]:r[5];}));}'
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
    const name = esc(titleOf(row)), line = `${dateRange(row)} · ${tiers.map((t) => esc(tierLabel(t))).join(' · ')}`, search = esc(searchOf(row, ctx));
    packed.push({ label, fields: { s: search, d: line, n: name, e: String(row.evStageId), y, t: typeOf(row) }, html: `<div class="row ${st.cls}" id="q${row.evStageId}" data-y="${y}" data-href="${href}" data-name="${esc(titleOf(row))}" data-eid="${row.evStageId}" data-show="${st.show}" data-sec="${secOf(row)}"`
      + ` data-periods="${gameYearOf(row.start)}" data-type="${typeOf(row)}" data-tier="${esc(tiers.map((t) => t.toLowerCase()).join(' '))}" data-search="${search}" data-done="${done ? 1 : 0}" data-boards="${bd}">`
      + `<a class="im" href="${href}"><img width="320" height="70" data-src="${imgOf(ctx, row.evStageId)}" alt=""></a>`
      + `<div class="info"><a class="nm" href="${href}">${name}${done ? CROWN : ''}</a><div class="d">${line}</div>${st.pill}`
      + `${replacesLine(st, kept)}${st.button === null ? '' : `<div>${keepButton(row.evStageId, st.button, ' onclick="var b=this;return kxKeep(b,function(on){kxRow(b.getAttribute(\'data-id\'),on);})"', row.jp ? ' jk' : '')}</div>`}`
      + '<div class="mt"></div></div><a class="go" href="' + href + '" aria-label="Details">›</a></div>\n' });
  });
  const data = packCatalog(packed);
  const years = [...new Set(rows.map((r) => r.start.slice(0, 4)))];
  // the two sections (user 06-11): the page opens on Worldwide; each section has its default year (the Shop year when it has raids)
  const bySec = { ww: rows.filter((r) => !r.jp), jp: rows.filter((r) => r.jp) }, ww = bySec.ww;
  const yearsOf = (list) => [...new Set(list.map((r) => r.start.slice(0, 4)))];
  const shopYear = String(ctx.shopFrom || '').slice(0, 4), defOf = (list) => (yearsOf(list).includes(shopYear) ? shopYear : 'all');
  const defYear = defOf(ww);
  // the span under «All years»: the game's (YEAR_SPAN) for Worldwide, the years of its raids for Japan only (2015–2018)
  const spanOf = (list) => { const y = yearsOf(list); return y.length ? (y.length > 1 ? `${y[0]}–${y[y.length - 1]}` : y[0]) : YEAR_SPAN; };
  const yearChip = (y, label, n) => `<button type="button" class="yc${y === defYear ? ' on' : ''}${y !== 'all' && !n ? ' hide' : ''}" data-yr="${y}">${label} <span class="yn">${n}</span></button>`;
  // tabs = the Shop's game years (special-pages.js; user 06-11): a tab only for a year with raids, no «Now» mark; data-nww / data-njp:
  // the raids of the section in that year (a tab without any is hidden in that section)
  const perYearOf = (list) => GAME_YEARS.map((g, i) => list.filter((r) => gameYearOf(r.start) === i).length);
  const perYear = perYearOf(rows), perSec = { ww: perYearOf(ww), jp: perYearOf(bySec.jp) };
  const tab = (p, name, sub, n, nww, njp, subAttr = '') => `<button type="button" class="tab${p === 'all' ? ' on' : ''}${nww ? '' : ' hide'}" data-p="${p}" data-nww="${nww}" data-njp="${njp}"><b>${esc(name)}</b>`
    + `<small${subAttr}>${esc(sub)}</small><span class="c" id="tc${p}">${n}</span></button>`;
  // TYPE / TIER chips: data-sec = the sections that have a raid of that value (secChips of the page script hides the others)
  const tiersOf = (r) => r.entries.map((e) => String(e.tier).toLowerCase());
  const has = { type: (v, list) => list.some((r) => typeOf(r) === v), tier: (v, list) => list.some((r) => tiersOf(r).includes(v)) };
  const secAttr = (g) => (v) => (v === 'all' || !has[g] ? '' : ` data-sec="${SECTIONS.map(([k]) => k).filter((k) => has[g](v, bySec[k])).join(' ')}"`);
  const opts = (list, cls = () => '', sa = () => '') => list.map((o, i) => `<button type="button" class="o${cls(o[0])}${i ? '' : ' on'}" data-v="${o[0]}"${sa(o[0])}>${optLabel(o)}</button>`).join('');
  const secTab = ([k, name, ic]) => `<button type="button" class="sec${k === 'ww' ? ' on' : ''}" data-sec="${k}">${icon(ic)}<span>${esc(name)}</span><span class="sn">${bySec[k].length}</span></button>`;
  // the Japan only intro (user 06-11), in the style of the rule callout (.rc): one short line per rule, with the catalogues' icons
  const jpIntro = `<div class="rc rcl hide" id="jpi"><div class="rch">${icon('jp')}Raids of the Japanese version<span class="ng">NOT ORIGINAL</span></div>`
    + `<span>${icon('jp')}These raids were held <b>only in the Japanese version</b> of the game.</span>`
    + `<span>${icon('pin')}They never appear in Events by themselves: to play one, <b>keep it here</b> (Keep in Events).</span>`
    + `<span>${icon('lock')}Like every raid, each one unlocks when your Story reaches its dates.</span>`
    + `<span>${icon('replaced')}<b>One kept raid for both sections</b>: keeping a Japanese raid releases the kept worldwide raid, and the other way round.</span>`
    + `<span>${icon('bdone')}Reconstructed banners and Raid Boards are marked on their pages; the translations are ours.</span>`
    + `<p class="rcf">See the ${RULE_LINK}</p></div>`;
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map((o) => [o[0], optLabel(o)])));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(GAME_YEARS.map((g, i) => [i, g.name]))))
    .replace('__TYPE__', labels(TYPE_OPTS)).replace('__TIER__', labels(TIER_OPTS)).replace('__SHOW__', labels(SHOW_OPTS)).replace('__PROG__', labels(PROG_OPTS)).replace('__BD__', JSON.stringify(Object.fromEntries(BOARD_OPTS.slice(1).map((o) => [o[0], `Raid Boards: ${optLabel(o)}`])))).replace('__SHOWSET__', JSON.stringify(SHOW_SETS))
    .replace('__PILL__', JSON.stringify({ kept: PILLS.kept, can: PILLS.can })).replace('__MATCH__', () => MATCH_JS);
  return PAGE_HEAD('Raid Catalog', CSS + RULE_CSS + SEC_CSS) + '<body>'
    + '<div class="hdr"><h1>Raid Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + `<p class="n">Every raid week of the game, by date. Tap a raid for its bosses, tiers and Raid Boards.${bySec.jp.length ? ' Two sections: <b>Worldwide</b> and <b>Japan only</b>.' : ''} A past raid can be kept in the Events tab, one at a time. The Raid Catalog is an addition of this server.</p>`
    // no Japan-only raid served (raid_config.json jpRaids.served false, user 06-11): the section tabs and the intro stay in the DOM, hidden
    + `<div class="secs${bySec.jp.length ? '' : ' hide'}" id="secs">${SECTIONS.map(secTab).join('')}</div>${jpIntro}`
    + `<div class="tabs" id="tabs">${tab('all', 'All years', YEAR_SPAN, ww.length, ww.length, bySec.jp.length, ` id="span" data-ww="${YEAR_SPAN}" data-jp="${spanOf(bySec.jp)}"`)}`
    + `${GAME_YEARS.map((g, i) => (perYear[i] ? tab(i, g.name, g.sub, perSec.ww[i], perSec.ww[i], perSec.jp[i]) : '')).join('')}</div><div class="tabline"></div>`
    + `<div class="yrs" id="yrs">${yearChip('all', 'All years', ww.length)}${years.map((y) => yearChip(y, y, ww.filter((r) => r.start.startsWith(y)).length)).join('')}</div>`
    + `<div class="sum" id="sum"><span class="n1">${plural(ww.length, 'raid')}</span> · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows" data-defy="${defYear}" data-defy-jp="${defOf(bySec.jp)}">${packed.length ? '' : '<p class="n">No raids.</p>'}</div>`
    + (packed.length ? `<script id="kxrows" type="application/json">${data}</script><script>${UNPACK_JS}</script>` : '')
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Boss, board or reward name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in boss names and in the Raid Board rewards (e.g. Behemoth, Sora, Mythril).</div>'
    + `<h4>TYPE</h4><div class="opts" data-g="type">${opts(TYPE_OPTS, undefined, secAttr('type'))}</div>`
    + `<h4>TIER</h4><div class="opts" data-g="tier">${opts(TIER_OPTS, undefined, secAttr('tier'))}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS, (v) => (v === 'all' ? '' : ` st-${v === 'removed' ? 'removed' : v}`))}</div>`
    + `<h4>PROGRESS</h4><div class="opts" data-g="prog">${opts(PROG_OPTS, progCls)}</div>`
    + `<h4>RAID BOARDS</h4><div class="opts" data-g="bd">${opts(BOARD_OPTS, boardCls)}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${plural(ww.length, 'result')}</button></div></div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${KEEP_JS}</script><script>${js}</script></body></html>`;
}

// Details page of one raid week: GET /web/raid/raid/<evStageId>. Header: card, bosses, the status line and why, the Keep / Remove
// button; then the week, the tiers (boss, quest level, HP; a tier not restored says so), the Raid Boards with their rewards, the
// reconstructed values with their reasons, and the other weeks of the same bosses, newest first. null = unknown id (404).
const RECON_LABEL = { atk: 'ATK', def: 'DEF', partHp: 'HP of the weak points', upMinutes: 'time limit', useAp: 'AP of a further attempt', coinOdds: 'Raid Coin odds',
  lux: 'Lux', moves: 'moves', hp: 'boss HP (from the tier tables)', hp_step: 'the week of an HP change', atk_curve: 'ATK below the level cap',
  attribute: 'attribute (from the boss colour)', background: 'fight background', boardAlias: 'a Raid Board reward name', boardPath: 'the order of the Raid Board cells',
  boardTexture: 'a Spirit part texture', boardCost: 'a Raid Board cell cost', boardSet: 'which Raid Boards ran this week',
  boardArt: 'a Raid Board card picture (cut from a screenshot)', boardNoArt: 'a Raid Board card picture (missing)', boardArtWiki: 'a Raid Board card picture (from the Japanese wiki)',
  // the labels of the event raids (Task 10)
  rareOdds: 'odds of the rare boss', boardGender: 'both gender boards open', weekendTimer: 'weekend time limit', questObjectives: 'quest objectives',
  levelDrops: 'level drops', levelDropsPartial: 'level rewards (in part)', boardStandard: 'Raid Board (from a similar raid)', eventCoins: 'Raid Coin rewards',
  eventHp: 'boss HP (scaled by date)', setting2016: 'time limit and AP (from 2016)', hpTier: 'boss HP of the tiers', boardCells: 'missing Raid Board cells',
  // the labels of the story raid bosses (Task 11)
  // the labels of the Japan-only raids (I-232)
  jp: 'Japan only', jpQuest: 'quest (from a worldwide raid)', jpDates: 'end date', jp2016: 'boss values (worldwide 2016)', jpTimer: 'time limit (Japanese rules)', jpBoard: 'Raid Board (Japanese super-hard board)',
  jpBoardOriginal: 'Raid Boards (original Japanese boards)', jpBoardProbable: 'Raid Board (original, tie to this raid probable)', jpBoardDeduced: 'Raid Boards (reconstructed)', jpNoBoard: 'Raid Boards (none: not known)',
  jpBoardWwShape: 'Raid Boards (on a worldwide model)', jpBoardShared: 'Raid Board rewards (shared with a worldwide raid)',
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
  boardArtWiki: 'A Raid Board card picture is the original card as shown on the Japanese fan wiki, enlarged: the picture file itself is not in the surviving game data.',
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
  jpBoardProbable: 'This original Japanese board survives in the game data, but no source ties it to this raid directly: it is the only board of November 2015, and its title True (真・) is the one the Japanese wiki gives for the Cid cells of the November 2015 raid board (probable).',
  jpBoardDeduced: 'No Japanese board of this raid survives cell by cell: its Raid Boards are reconstructed from what is known (number of cells, total Raid Coins, main rewards and title from the Japanese wiki, the original board pictures), on the model of the original Japanese boards of the same time. The costs of single cells and the filler medals are ours.',
  jpNoBoard: 'Nothing is known of the Japanese Raid Board of this raid, so it has none here: the raid still gives Raid Coins.',
  jpBoardWwShape: 'The Japanese board of this raid is known only by its rewards (its notice, banner and original board pictures): its cells, costs and filler Medals are copied from the worldwide Raid Board of the same kind and time, with the Japanese rewards in the place of the worldwide ones; the Japanese titles are the worldwide titles they most probably were.',
  jpBoardShared: 'A reward of this Japanese board that a worldwide raid board also gives (avatar part, title, Spirit part or collection Medal) stays in the worldwide raid: here that cell gives a 6★ Medal, Jewels or a material of the same cost instead, so no Raid Coins are spent on something you may already own. The changes are listed with the Raid Boards.',
  jpBossProbable: 'No surviving Japanese source names this boss: it is the probable one (December 2016: the bosses of the worldwide 2016 Showdown! of the same days; September 2017: Crabby Cake for the Japanese «Furious Whole Cake»).',
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
// The AP / Bonus Time rule of this server (I-228, raid-windows.js costRule weekdayWeekend; user 06-11): a callout on the detail page
// and at the top of every original notice page, whose AP costs, Bonus Time hours and opening times are the original game's.
// Callout (user 06-11, graphics): a gold-framed box with a title (Raid Coin icon) and a «NOT ORIGINAL» tag, two side-by-side blocks
// Monday – Friday / Saturday – Sunday with the catalogues' icons (calendar, AP medal, Lux star, Bonus Time clock), and a foot line
// with the link to the «Raid Bosses» notice (/web/notices#raid-bosses opens it, routes-info-album.js). Plain HTML / CSS, ES5-safe.
const RULE_CSS = '.rc{border:2px solid #ffcd4a;border-radius:10px;background:#06283e;padding:8px 10px 6px;margin:10px 0;line-height:1.45;font-size:15px}'
  + '.rch{color:#ffcd4a;font-weight:bold;font-size:17px;margin:0 0 6px}.rch .ic{width:1.5em;height:1.5em}'
  + '.ng{display:inline-block;background:#e8641c;background:-webkit-linear-gradient(top,#ffa13d,#e0521a);background:linear-gradient(#ffa13d,#e0521a);border:1px solid #ffc27a;color:#fff;border-radius:10px;padding:0 9px;margin-left:8px;font-size:11px;font-weight:bold;letter-spacing:.6px;vertical-align:2px;line-height:1.7;text-shadow:0 1px 1px rgba(90,25,0,.55);box-shadow:0 1px 3px rgba(0,0,0,.45)}'
  + '.rcs{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin:0 -4px}'
  + '.rcd{-webkit-box-flex:1;-webkit-flex:1 1 140px;flex:1 1 140px;min-width:140px;box-sizing:border-box;margin:0 4px 6px;padding:5px 9px 6px;border-radius:8px;background:#0a4466;border-top:4px solid #39a7cf}'
  + '.rcd.we{background:#0d4a3a;border-top-color:#2e9e3e}.rcd b{display:block;color:#fff;font-size:15px;margin-bottom:3px}'
  + '.rcd span{display:block;color:#d9e6ee;font-size:14px;padding:1px 0 1px 1.7em;text-indent:-1.7em}.rcd span .ic{width:1.35em;height:1.35em}.rcd span.ni{text-indent:0}'
  + '.rcf{color:#b9cfdc;font-size:13.5px;margin:2px 2px 0}.rcf a{color:#9fd4ff}';
const RULE_LINK = '<a href="/web/notices#raid-bosses">«Raid Bosses» notice ›</a>';
const ruleBox = (foot) => '<div class="rc">'
  + `<div class="rch">${icon('raid')}One raid rule on this server<span class="ng">NOT ORIGINAL</span></div>`
  + '<div class="rcs">'
  + `<div class="rcd"><b>${icon('weekday')}Monday – Friday</b><span>${icon('ap')}Original AP (5 AP if it was free)</span><span class="ni">No Bonus Time</span></div>`
  + `<div class="rcd we"><b>${icon('weekday')}Saturday – Sunday</b><span>${icon('ap')}0 AP</span><span>${icon('lux')}Lux of raid bosses doubled</span><span>${icon('bonus')}Bonus Time all day</span></div>`
  + `</div><p class="rcf">Every raid, Pacific time. ${foot} See the ${RULE_LINK}</p></div>`;
const ruleOn = () => windows.costRule() === windows.WEEKDAY_WEEKEND;
const ruleNote = () => (ruleOn() ? ruleBox('The AP costs, Bonus Time hours and opening times in the notice below are those of the original game.') : '');
const ruleLine = () => (ruleOn() ? ruleBox('The original game had its own hours instead.') : '');
const reconList = (codes) => `<ul class="pl">${codes.map((c) => `<li><b>${esc(RECON_LABEL[c] || c)}</b>: ${esc(RECON_TEXT[c] || 'rebuilt from the surviving sources.')}</li>`).join('')}</ul>`;
// «On this server» box of the notice pages (user 06-11, graphics: the bullet wall was hard to read in the game popup): the
// callout style (.rc of RULE_CSS: icon, gold title, NOT ORIGINAL tag), the status as one compact row, the rebuilt values in
// group cards (Boss / Rewards / Rules), each an icon, a short bold label and one short line (RECON_SHORT; the full sentences
// of RECON_TEXT stay one tap away in a folded block), the tiers not restored, the two links as pill buttons. The «AP and
// Bonus Time» label is left out while the rule callout is on the page (ruleOn: ruleNote() shows it at the top). Plain HTML / CSS.
// code -> [group, short label, one short line, icon key]
const RECON_SHORT = {
  atk: ['boss', 'ATK', 'Deduced from bosses with original values', 'tleg'],
  def: ['boss', 'DEF', 'Deduced from bosses with original values', 'tleg'],
  partHp: ['boss', 'Weak point HP', 'A share of the boss HP, as in 2016', 'tleg'],
  hp: ['boss', 'Boss HP', 'From the tier HP tables of the time', 'tleg'],
  hp_step: ['boss', 'HP change week', 'Middle of the known range', 'weekday'],
  atk_curve: ['boss', 'ATK below the level cap', 'Grows like the 2016 bosses', 'tleg'],
  attribute: ['boss', 'Attribute', 'Deduced from the boss colour', 'tleg'],
  moves: ['boss', 'Moves', 'The attacks of a similar boss', 'tleg'],
  background: ['boss', 'Fight background', 'The world closest to the original map', 'tleg'],
  rareOdds: ['boss', 'Rare boss odds', 'Deduced from the 2016 data', 'tleg'],
  rareType2: ['boss', 'Rare boss odds', 'Read as a one-in-N chance', 'tleg'],
  eventHp: ['boss', 'Boss HP', 'Scaled from 2016 up to the 2018 HP', 'tleg'],
  hpTier: ['boss', 'HP of the tiers', 'Deduced: no reading of the tiers', 'tleg'],
  storyBoss: ['boss', 'Story raid boss', 'The boss of the nearest quest', 'tleg'],
  storyOmega: ['boss', 'Ω boss odds', 'The usual rule of the 2016 data', 'tleg'],
  storyConflict: ['boss', 'Story raid boss', 'Sources disagree: the wiki\'s boss', 'tleg'],
  jp2016: ['boss', 'Boss values', 'Its 2016 worldwide values', 'tleg'],
  jpBossProbable: ['boss', 'Boss', 'Probable: no source names it', 'tleg'],
  jpHpProbable: ['boss', 'Boss HP', 'Probable: from the June 23, 2018 weekend', 'tleg'],
  lux: ['rewards', 'Lux', 'Calculated from the boss HP', 'lux'],
  coinOdds: ['rewards', 'Raid Coin odds', 'From the community tables', 'raid'],
  eventCoins: ['rewards', 'Raid Coin rewards', 'The standard Raid Coin table', 'raid'],
  levelDrops: ['rewards', 'Level rewards', 'To your Present Box at that level', 'medal'],
  levelDropsPartial: ['rewards', 'Level rewards', 'Some left out: item or amount unknown', 'medal'],
  jpRewardProbable: ['rewards', 'Level reward', 'The worldwide Medal it most probably was', 'medal'],
  boardAlias: ['rewards', 'Board reward names', 'Matched to their items by name', 'btodo'],
  boardPath: ['rewards', 'Board cell order', 'One path: original layout not restored yet', 'btodo'],
  boardSet: ['rewards', 'Boards of the week', 'From the community lists', 'btodo'],
  boardTexture: ['rewards', 'Spirit part picture', 'Rebuilt from the original files', 'btodo'],
  boardCost: ['rewards', 'Board cell cost', 'A typo of the source corrected', 'btodo'],
  boardArt: ['rewards', 'Board card picture', 'Cut from a screenshot of the game', 'btodo'],
  boardNoArt: ['rewards', 'Board card picture', 'Missing', 'btodo'],
  boardArtWiki: ['rewards', 'Board card picture', 'From the Japanese fan wiki, enlarged', 'btodo'],
  boardGender: ['rewards', 'Gender boards', 'Both open (the original: yours only)', 'btodo'],
  boardStandard: ['rewards', 'Raid Boards', 'Of a similar raid, no exclusive medals', 'btodo'],
  boardCells: ['rewards', 'Board cells', 'Some left out: reward unknown', 'btodo'],
  jpBoard: ['rewards', 'Raid Board', 'The Japanese super-hard board', 'btodo'],
  jpBoardOriginal: ['rewards', 'Raid Boards', 'Original Japanese; cell positions ours', 'btodo'],
  jpBoardProbable: ['rewards', 'Raid Board', 'Original; tie to this raid probable', 'btodo'],
  jpBoardDeduced: ['rewards', 'Raid Boards', 'Rebuilt from what is known; costs ours', 'btodo'],
  jpNoBoard: ['rewards', 'Raid Boards', 'None: nothing known of the board', 'btodo'],
  jpBoardWwShape: ['rewards', 'Raid Boards', 'Japanese rewards on a worldwide layout', 'btodo'],
  jpBoardShared: ['rewards', 'Shared rewards', 'Replaced: they stay in the worldwide raid', 'btodo'],
  upMinutes: ['rules', 'Time limit', 'From videos and posts of the time', 'bonus'],
  useAp: ['rules', 'AP of a further attempt', 'From the rules of the time', 'ap'],
  weekendTimer: ['rules', 'Weekend time limit', '3 hours; 1 hour from May 2018', 'bonus'],
  setting2016: ['rules', 'Time limit and AP', 'The 2016 data of the same boss', 'bonus'],
  questObjectives: ['rules', 'Quest objectives', 'Standard Raid objectives in part', 'weekday'],
  weekRule: ['rules', 'AP and Bonus Time', 'One rule for all raids', 'ap'],
  weekdayAp: ['rules', 'Weekday AP', 'Was free: 5 AP Mon–Fri, 0 AP weekends', 'ap'],
  raidWindow: ['rules', 'Opening hours', 'Original set hours; outside them 90 AP', 'bonus'],
  jpWindow: ['rules', 'Opening hours', 'Two 30-minute windows; outside them 90 AP', 'bonus'],
  weeklyWindow: ['rules', 'Weekday hours', 'Bonus Time hours (probable); else 90 AP', 'bonus'],
  jp: ['rules', 'Japan only', 'Played only from the Raid Catalog', 'jp'],
  jpQuest: ['rules', 'Quest', 'Map, level and AP of a worldwide raid', 'weekday'],
  jpDates: ['rules', 'End date', 'One week from the known start', 'weekday'],
  jpTimer: ['rules', 'Time limit', 'The Japanese rules of the time', 'bonus'],
};
const RECON_GROUPS = [['boss', 'Boss', 'tleg', ''], ['rewards', 'Rewards', 'raid', ' rw'], ['rules', 'Rules', 'weekday', ' ru'], ['other', 'Other', 'replaced', ' ot']];
const SRV_CSS = '.sb{border:2px solid #ffcd4a;border-radius:10px;background:#06283e;padding:8px 10px 8px;margin:18px 0 10px;line-height:1.45;font-size:15px}'
  + '.sb .why{margin:2px 0 6px;padding:4px 10px;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-box-align:center;-webkit-align-items:center;align-items:center}'
  + '.sb .why .s{margin:2px 10px 2px 0}.sbi{color:#b9cfdc;font-size:14px;margin:4px 2px 6px}'
  // the «Rebuilt values» head (user 06-11: it must read as a heading): gold title with an icon over a thin rule, the subtitle on its own line
  + '.sbh{margin:12px 2px 8px;padding:0 0 5px;border-bottom:2px solid #ffcd4a}.sbh b{display:block;color:#ffcd4a;font-size:17px;letter-spacing:.03em}'
  + '.sbh b .ic{width:1.3em;height:1.3em;margin-right:6px}.sbh span{display:block;color:#b9cfdc;font-weight:normal;font-size:13.5px;margin:1px 0 0 2px}'
  + '.rgs{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin:0 -4px}'
  + '.rg{-webkit-box-flex:1;-webkit-flex:1 1 260px;flex:1 1 260px;min-width:240px;box-sizing:border-box;margin:0 4px 8px;padding:0 9px 4px;border-radius:8px;background:#0a4466;overflow:hidden}'
  // the group heads (user 06-11: make clear they are categories): a full colour band, capitals, over the column
  + '.rg>b{display:block;margin:0 -9px 3px;padding:6px 10px 5px;background:#b8423a;color:#fff;font-size:16px;text-transform:uppercase;letter-spacing:.08em;text-shadow:0 1px 2px rgba(0,0,0,.5)}'
  + '.rg.rw>b{background:#a87a10}.rg.ru>b{background:#1f7ea6}.rg.ot>b{background:#5b7383}.rg>b .ic{width:1.35em;height:1.35em}.rg .ic{width:1.35em;height:1.35em}'
  + '.ri{padding:3px 0 3px 1.75em;text-indent:-1.75em;border-top:1px solid #1d5878}.ri b{color:#fff;font-size:14.5px}.ri span{display:block;text-indent:0;color:#d9e6ee;font-size:13.5px}'
  + '.sbo{color:#ffb3a8;font-size:14px;margin:2px 2px 6px}.sbo .ic{width:1.3em;height:1.3em}.sb details.fold{border-color:#1d5878;font-size:14px}.sb details.fold li{margin:3px 0}'
  + '.sbl{margin:8px 0 2px}.sbl a{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:16px;padding:3px 14px;margin:4px 8px 0 0;color:#fff;text-decoration:none;font-size:14.5px}';
// the «Why these values?» fold outside the notice pages (NOTICE_CSS has its own)
const FOLD_CSS = 'details.fold{margin:6px 0;border:1px solid #1d5878;border-radius:6px;padding:2px 10px;font-size:14px}details.fold>summary{cursor:pointer;color:#00d4ed;padding:4px 0}details.fold li{margin:3px 0}';
// the codes shown in the box: weekRule dropped while the rule callout is on the page
const srvCodes = (codes) => codes.filter((c) => !(c === 'weekRule' && ruleOn()));
// head: the «Rebuilt values» line (the notice box); the detail page has its own h2 instead
function reconCards(codes, head = true) {
  const shown = srvCodes(codes);
  if (!shown.length) return '';
  const cards = RECON_GROUPS.map(([g, name, ic, cls]) => {
    const rows = [], seen = new Set();
    for (const c of shown.filter((x) => (RECON_SHORT[x] ? RECON_SHORT[x][0] : 'other') === g)) {
      const [, label, line, k] = RECON_SHORT[c] || [g, RECON_LABEL[c] || c, 'Rebuilt from the surviving sources', ic];
      if (seen.has(`${label}|${line}`)) continue;
      seen.add(`${label}|${line}`);
      rows.push(`<div class="ri">${icon(k)}<b>${esc(label)}</b><span>${esc(line)}</span></div>`);
    }
    return rows.length ? `<div class="rg${cls}"><b>${icon(ic)}${esc(name)}</b>${rows.join('')}</div>` : '';
  }).join('');
  return (head ? `<p class="sbh"><b>${icon('replaced')}Rebuilt values</b><span>These values are lost in the original game data: this server rebuilt them from the surviving sources.</span></p>` : '')
    + `<div class="rgs">${cards}</div><details class="fold"><summary>Why these values?</summary>${reconList(shown)}</details>`;
}
// the box of a notice page: intro = one short line (html)
function srvBox(row, st, intro) {
  const codes = [...new Set(row.entries.flatMap((e) => e.reconstructed || []))];
  const off = row.entries.filter((e) => !e.available);
  return '<div class="sb">'
    + `<div class="rch">${icon('raid')}On this server<span class="ng">NOT ORIGINAL</span></div>`
    + `<div class="why ${st.cls}">${st.pill}<span>${st.why}</span></div><p class="sbi">${intro}</p>${reconCards(codes)}`
    + (off.length ? `<p class="sbo">${icon('lock')}Not restored yet: ${off.map((e) => esc(`${tierLabel(e.tier)} (${e.boss || ''})`)).join(', ')} (graphics or data incomplete in the surviving game files).</p>` : '')
    + `<p class="sbl"><a href="/web/raid/raid/${row.evStageId}">This raid in the Raid Catalog ›</a><a href="/web/raid/catalog">Raid Catalog ›</a></p></div>`;
}
const RAID_DETAIL_CSS = '.tt{table-layout:auto}.tt td:nth-child(4){white-space:nowrap}.tt td.r{color:#ffcd4a}ul.ow{list-style:none;padding:0;margin:4px 0 10px}ul.ow li{padding:6px 0;border-bottom:1px solid #2f5d78}ul.ow a{color:#9fd4ff}';
// levels gained per win stated by the raid's own notice (make-raid.js entry.levelStep: the Japanese year-end raid of 2016, +10)
const stepOf = (row) => Math.max(1, ...row.entries.map((e) => Number(e.levelStep) || 1));
// «+N in Bonus Time» of a JP raid's own notice (make-raid.js entry.bonusLevelStep: +5 for the JP raid events of 2016-2018), 0 when none
const bonusStepOf = (row) => Math.max(0, ...row.entries.map((e) => Number(e.bonusLevelStep) || 0));
const bonusStepText = (row) => (bonusStepOf(row) && stepOf(row) === 1 ? ` (${bonusStepOf(row)} levels in Bonus Time)` : '');
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
  // the same group cards as the «On this server» box of the notice pages (user 06-11, graphics), the full sentences folded
  const cards = reconCards(codes, false);
  const recon = cards ? `<h2>Reconstructed values</h2><p class="n">The original values are lost: these are rebuilt from the surviving sources, as the Raid Bosses notice explains.</p>${cards}` : '';
  const others = rows.filter((r) => r !== row && r.bosses.some((b) => row.bosses.includes(b))).sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  const other = others.length ? `<h2>Other weeks of ${esc(title)}</h2><ul class="ow">${others.map((r) => `<li><a href="${detailHref(r.evStageId)}">${dateRange(r)}</a> · ${esc(titleOf(r))}<br>${statusOf(r, ctx).pill}</li>`).join('')}</ul>` : '';
  const back = ctx.fromCatalog ? `<div class="bar"><a class="back" href="/web/raid/catalog#q${row.evStageId}">BACK<span></span></a></div>` : '';
  return PAGE_HEAD(title, CSS + DETAIL_CSS + RAID_DETAIL_CSS + RULE_CSS + SRV_CSS + FOLD_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<h1>${esc(title)}</h1><img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
    + `${st.pill}<div id="pinmsg" class="pinmsg"></div><div class="why ${st.cls}">${st.why}</div>${replacesLine(st, kept)}${button}`
    + (row.jp ? `<ul class="ow"><li><a href="/web/raid/notice/${row.evStageId}?from=raid">Notice of this raid ›</a></li></ul>`
      : ctx.hasNotice && ctx.hasNotice(row.censusId) ? `<ul class="ow"><li><a href="/web/raid/notice/${row.evStageId}?from=raid">Original notice of this raid ›</a></li></ul>` : '')
    + `<h2>Week</h2><table class="kv">${kv}</table>`
    + `<h2>Tiers</h2><table class="tt"><tr><th>Tier</th><th>Boss</th><th>Quest LV</th><th>Boss HP</th></tr>${tierRows}</table>`
    + ruleLine()
    + `<p class="n">The boss starts at LV 1 and gains ${stepOf(row) > 1 ? `${stepOf(row)} levels` : 'a level'} at every win${bonusStepText(row)}, up to LV 99; levels reset on the 1st of every month.</p>`
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
const NOTICE_CSS = RULE_CSS + '.dt{margin:2px 0 10px}.chip{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:12px;padding:0 10px;margin:0 6px 4px 0;font-size:13px;line-height:1.7;color:#fff}'
  + '.chip.d{background:#06283e;border-color:#ffcd4a;color:#ffcd4a}'
  + '.ns{border-left:5px solid #5d8aa6;background:#06283e;border-radius:0 8px 8px 0;padding:6px 12px 8px;margin:10px 0;font-size:16px;line-height:1.55;overflow-wrap:break-word}'
  + '.ns.raid{border-left-color:#ffcd4a}.ns h2{margin:4px 0 4px}.ns.raid h2{color:#ffcd4a}.ns h3{font-size:16px;margin:12px 0 2px}.ns h4{color:#00d4ed;font-size:15px;margin:10px 0 2px}'
  + '.ns p{margin:3px 0 6px}.ns .tg{color:#fff;font-weight:bold;margin:2px 0 6px}.ns .upd{display:inline-block;background:#b8860b;border-radius:10px;padding:0 10px;font-size:13px;line-height:1.7;margin:4px 0}'
  + '.ns .nb{color:#b9cfdc;font-size:14px;margin:2px 0 4px}.ns .om{color:#b9cfdc;font-style:italic;font-size:14px;border:1px dashed #5d8aa6;border-radius:6px;padding:4px 10px}'
  + 'ul.nl{margin:2px 0 8px;padding-left:22px}ul.nl li{margin:2px 0}.ns table{margin:4px 0 10px}.rw td.q{width:28%;color:#ffcd4a;white-space:nowrap}.pd th{width:30%}.bt th{width:50%}'
  + 'details.fold{margin:6px 0;border:1px solid #2f5d78;border-radius:6px;padding:2px 10px}details.fold>summary{cursor:pointer;color:#00d4ed;padding:4px 0}'
  + 'details.oth{margin:10px 0}details.oth>summary{cursor:pointer;color:#b9cfdc;font-size:15px;padding:6px 10px;background:#0a4466;border-radius:6px}details.oth[open]>summary{color:#fff}'
  + SRV_CSS + 'h2.on{margin-top:20px}.srv{border:2px solid #ffcd4a;border-radius:8px;background:#0a4466;padding:4px 12px 10px;margin:18px 0}.srv h2{color:#ffcd4a;margin-top:6px}.srv h2:before{content:""}'
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
    const back = row && ctx.from === 'raid' ? `<div class="bar"><a class="back" href="/web/raid/raid/${row.evStageId}?from=catalog">BACK<span></span></a></div>` : '';
    // end-of-service weeks (from 2021-03-01, make-raid-notices.js eos): no notice of their own existed (user 04-11)
    if (hit && hit.eos) {
      const title = titleOf(row);
      return PAGE_HEAD(title, CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}>`
        + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
        + `<h1>${esc(title)}</h1><p class="dt"><span class="chip">EVENT</span><span class="chip d">${esc(dateRange(row))}</span></p>${ruleNote()}`
        + '<div class="ns raid"><h2>No notice for this week</h2><p>This raid ran in the last weeks of the original game, during the end of service: '
        + 'no specific notice was published for it. The end of service itself is announced in the game.</p></div>'
        + srvBox(row, st, `This server follows your Story, not the calendar: this week (${esc(dateRange(row))}) opens when your Story reaches it.`)
        + `${back}</body></html>`;
    }
    if (row && row.jp) return jpNoticePage(row, doc, ctx, { st, back });
    if (!n || !Array.isArray(n.body)) return noticeMissing(row, ctx);
    return PAGE_HEAD(n.title, CSS + DETAIL_CSS + NOTICE_CSS) + `<body${back ? ' class="hb"' : ''}>`
      + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
      + `<h1>${esc(n.title)}</h1><p class="dt">${n.category ? `<span class="chip">${esc(n.category)}</span>` : ''}<span class="chip d">${esc(niceDay(n.date))}${n.time ? ` · ${esc(n.time)} UTC` : ''}</span></p>`
      + ruleNote()
      + (hit.note ? `<div class="why off">${esc(hit.note)}</div>` : '')
      + noticeBody(n.body, row.bosses)
      + srvBox(row, st, 'Above: the raid part of the original notice, unchanged (other events and top-player lists left out). '
        + `Its dates are the original game's (${esc(dateRange(row))}): here the raid opens when your Story reaches that week.`)
      + `${back}</body></html>`;
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
const JP_BOARD_STATE = [['jpBoardOriginal', 'original Japanese boards'], ['jpBoardProbable', 'its tie to this raid is probable'], ['jpBoard', 'the Japanese super-hard board (= worldwide Legendary Raid Reward)'],
  ['jpBoardDeduced', 'reconstructed from the surviving evidence'], ['jpBoardWwShape', 'cells and costs on a worldwide board of the same time'],
  ['jpBoardShared', 'rewards shared with a worldwide raid replaced'], ['jpNoBoard', 'none: not known']];
function jpNoticePage(row, doc, ctx, { st, back }) {
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
  // rewards a worldwide raid board also gives, replaced on this board (user rule 06-11, make-raid.js boardSubs)
  const subs = [...new Map(play.flatMap((e) => e.boardSubs || []).map((x) => [`${x.board}|${x.cell}`, x])).values()];
  const shared = subs.length ? '<h3>Rewards kept for the worldwide raids</h3><p class="nb">These Japanese rewards are also on a worldwide Raid Board, so here they are replaced:</p>'
    + `<ul class="nl">${subs.map((x) => `<li>${esc(x.board)}${typeof x.cell === 'number' ? `, cell ${x.cell}` : x.cell === 'title' ? ', title' : ', completion'}: ${esc(x.from)} → ${esc(x.to)} <span class="dr">(worldwide: ${esc(x.ww)})</span></li>`).join('')}</ul>` : '';
  const kv = [['Dates', `${dateRange(row)} (Japanese version only)`], ['Type', FAMILY_LABEL[row.family] || row.family], ['Open', open],
    ['Level', `LV 1, +${stepOf(row)} at every win${bonusStepOf(row) && stepOf(row) === 1 ? ` (+${bonusStepOf(row)} in Bonus Time)` : ''}, up to LV 99`], ['Raid Boards', state]].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  return PAGE_HEAD(title, CSS + DETAIL_CSS + NOTICE_CSS + RAID_DETAIL_CSS) + `<body${back ? ' class="hb"' : ''}>`
    + `<img class="banner" width="640" height="140" src="${imgOf(ctx, row.evStageId)}" alt="">`
    + `<h1>${esc(title)}</h1><p class="dt"><span class="chip">JAPAN ONLY</span><span class="chip d">${esc(dateRange(row))}</span></p>${ruleNote()}`
    + (JP_BANNERS[row.censusId] ? '<div class="ns"><h2>On the banner (our translation)</h2>'
      + `<p lang="ja" class="nb">${esc(JP_BANNERS[row.censusId].ja)}</p><p>${esc(JP_BANNERS[row.censusId].en)}</p>`
      // a banner rebuilt by this server (raid_jp_banners.json `reconstructed`, the two-day 150M weekends of 2018) says so instead
      + (JP_BANNERS[row.censusId].reconstructed ? `<p class="nb">${esc(JP_BANNERS[row.censusId].reconstructed)}</p></div>`
        : '<p class="nb">The Japanese text printed on the original banner of this raid, translated by this server.</p></div>') : '')
    + notice
    + `<div class="ns"><h2>What is known of this raid</h2><table class="kv">${kv}</table>`
    + `<table class="tt"><tr><th>Day / tier</th><th>Boss</th><th>HP at LV 1</th><th>Time limit</th></tr>${bossRows}</table>`
    + (drops.length ? `<h3>Level rewards</h3><ul class="nl">${drops.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '')
    + `<h3>Raid Boards</h3>${boards}${shared}</div>`
    + srvBox(row, st, `Held only in the Japanese version: here it is played only from the Raid Catalog, once your Story has passed its dates (${esc(dateRange(row))}).`)
    + `${back}</body></html>`;
}

module.exports = { expandCatalog, catalogPage, detailPage, noticePage, parseNotice, statusOf, khuxMatch, noticeBlocks, NOTICE_CSS }; // noticeBlocks, NOTICE_CSS: also the Shop notices (shop-notice-pages.js)
