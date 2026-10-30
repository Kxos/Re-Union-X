// Special tab web pages (WebView, opened from the Details button of the Special Catalog banner). Pure HTML, no
// player or master access: server.js passes the index and the context (specialCtx).
// The catalogue follows the Shop's Banner Catalog (server/gacha.js): period tabs, a summary line, a Filters sheet
// (FIND / TYPE / SHOW). Filtering only toggles a class on the rows (data-* attributes are read once at start).
'use strict';
const special = require('./special');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDay = (d) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };

// same pattern as the Shop catalogue (server/gacha.js): the element carries data-pin (POST URL) and data-on
const PIN_JS = 'var KHUX_PIN={1:["Pinned!","Leave and re-enter Special to see it.","pinmsg"],0:["Removed.","Leave and re-enter Special.","pinmsg off"]};'
  + 'function khuxSet(el,id,pinned){el.setAttribute("data-pin",pinned?"/web/special/unpin":"/web/special/pin/"+id);el.setAttribute("data-on",pinned?"0":"1");el.textContent=pinned?"Remove from Special":"📌 Keep in Special";}'
  + 'function khuxSay(box,cls,head,sub){box.className=cls;box.innerHTML="";var b=document.createElement("div"),s=document.createElement("small");b.textContent=head;s.textContent=sub;box.appendChild(b);box.appendChild(s);box.style.display="block";if(box.scrollIntoView)box.scrollIntoView(false);}'
  + 'function khuxPin(el,box,onOk){var on=el.getAttribute("data-on")==="1",m=KHUX_PIN[on?1:0],x=new XMLHttpRequest();x.open("POST",el.getAttribute("data-pin"));'
  + 'x.onload=function(){if(x.status===200){khuxSay(box,m[2],m[0],m[1]);if(onOk)onOk(on);}else khuxSay(box,"pinmsg err","Could not change Special","This quest cannot be kept.");};'
  + 'x.onerror=function(){khuxSay(box,"pinmsg err","Could not reach the server","Try again.");};x.send("");return false;}'
  + 'function khuxClick(el){return khuxPin(el,document.getElementById("pinmsg"),function(on){var id=el.getAttribute("data-id");'
  + 'var all=document.querySelectorAll("[data-id]"),i;for(i=0;i<all.length;i++){if(all[i].getAttribute("data-on")==="0")khuxSet(all[i],all[i].getAttribute("data-id"),false);}'
  + 'if(on)khuxSet(el,id,true);});}';

const CSS = 'body{margin:0;background:#043654;color:#fff;font:17px/1.6 sans-serif;letter-spacing:.4px;padding:6px 18px 40px}'
  + 'h1{font-size:22px;margin:8px 0 4px}h2{color:#00d4ed;font-size:18px;margin:18px 0 2px}h2:before{content:"■  "}'
  + '.n{color:#b9cfdc;font-size:14px}p{margin:4px 0 8px}img{height:auto;display:block;margin:0;border-radius:4px}'
  + '.hdr{display:flex;align-items:center;justify-content:space-between;gap:10px}'
  + '.fbtn,.ok{border:0;color:#fff;background:linear-gradient(#f08a3a,#d4541c);border-radius:18px;padding:5px 16px;font:bold 15px sans-serif;box-shadow:0 2px 0 #8a3510;cursor:pointer;white-space:nowrap}'
  + '.dot{display:inline-block;background:#fff;color:#d4541c;border-radius:10px;padding:0 7px;margin-left:6px;font-size:13px;line-height:1.5}.dot:empty{display:none}'
  + '.tabs{display:flex;gap:3px;margin-top:8px}.tab{flex:1 1 0;min-width:0;border:0;font-family:inherit;cursor:pointer;text-align:center;background:#0d4a70;border-radius:7px 7px 0 0;padding:4px 1px 3px;line-height:1.15;color:#b9cfdc;letter-spacing:0}'
  + '.tab b{display:block;font-size:11.5px;color:#fff}.tab .c{display:block;color:#ffa500;font-weight:bold;font-size:12px}'
  + '.tab .now{display:block;background:#2e9e3e;color:#fff;border-radius:8px;font-size:9px;margin:1px 2px 0}'
  + '.tab.on{background:linear-gradient(#25c4d8,#0a8fa3);color:#e9fbff}.tabline{height:3px;background:#0a8fa3;margin-bottom:8px}'
  + '.sum{background:#06283e;border-radius:6px;padding:6px 10px;margin:0 0 6px;font-size:15px;line-height:1.7}.sum .n1{color:#ffa500;font-weight:bold}'
  + '.tag{display:inline-block;background:#0d5f86;border:1px solid #39a7cf;border-radius:14px;padding:0 4px 0 10px;margin:3px 4px 0 0;font-size:14px;line-height:1.6}'
  + '.tag a{display:inline-block;background:#043654;border-radius:10px;width:20px;text-align:center;margin-left:5px;color:#fff;text-decoration:none}.clear{font-size:14px;margin-left:3px}'
  + '.hide{display:none}'
  // banners at half size (640x140 -> 320x70) next to the text; the text wraps under the picture on a narrow phone
  + '.q{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 0;border-bottom:1px solid #2f5d78}.q.pinned{border-left:5px solid #b8860b;padding-left:10px}.q.lt .im{opacity:.55;filter:grayscale(.6)}'
  + '.im{flex:0 0 auto;width:320px;max-width:100%}.im img{width:100%}.info{flex:1 1 160px;min-width:0;line-height:1.4}'
  + '.nm{font-weight:bold}.d{color:#b9cfdc;font-size:14px}.vip{color:#ffcd4a;font-weight:bold}'
  + '.st{font-size:14px;margin:3px 0}.st.later,.st.none{color:#9fb7c6}.rp{color:#ffcd4a;font-size:13px}'
  + '.pk{margin-top:5px;border:2px solid #ffe08a;border-radius:10px;color:#fff;font:bold 14px sans-serif;padding:4px 14px;background:linear-gradient(#e0a020,#a8700a);cursor:pointer;text-decoration:none;display:inline-block}'
  + '.pk[data-on="0"]{border-color:#ffb0b0;background:linear-gradient(#ff5a5a,#d81e2e 55%,#9c1020)}'
  + '.pinmsg{display:none;position:sticky;bottom:6px;background:#2e9e3e;border-radius:8px;padding:6px 10px;font-size:16px;margin-top:10px}.pinmsg small{display:block;font-size:13px}'
  + '.pinmsg.off{background:#1a6fa8}.pinmsg.err{background:#b02020}'
  + '.ov{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,12,20,.68);z-index:5}'
  + '.sheet{display:none;position:fixed;left:10px;right:10px;top:52px;max-width:560px;margin:0 auto;max-height:calc(100% - 64px);overflow:auto;box-sizing:border-box;'
  + 'background:#0b3d5c;border:2px solid #39a7cf;border-radius:10px;padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.6);z-index:6;line-height:1.5}'
  + 'body.fo .ov,body.fo .sheet{display:block}.shd{display:flex;justify-content:space-between;align-items:center}.shd b{font-size:18px}'
  + '.x{background:#043654;border:1px solid #39a7cf;border-radius:50%;width:30px;height:30px;color:#fff;font-size:15px;cursor:pointer;padding:0}'
  + '.sheet h4{margin:10px 0 4px;color:#00d4ed;font-size:13px;letter-spacing:1px}'
  + '.search{display:flex;align-items:center;background:#fff;border-radius:18px;padding:2px 12px;color:#7a8a96}'
  + '.search input{flex:1;min-width:0;border:0;outline:0;font:16px sans-serif;color:#222;background:transparent;padding:4px 6px}'
  + '.hint{color:#9fb7c6;font-size:13px;margin:3px 0 0 4px}.opts{display:flex;flex-wrap:wrap;gap:6px}'
  + '.o{border:1px solid #5d8aa6;border-radius:16px;padding:3px 12px;font:14px sans-serif;color:#d9e6ee;background:#083048;cursor:pointer}'
  + '.o.on{background:#00a6bb;border-color:#7beaf7;color:#fff;font-weight:bold}'
  + '.foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px}.ok{padding:6px 20px}.reset{color:#b9cfdc;font-size:14px}';

// TYPE chips, derived from the index entry (an entry can have several types, e.g. the VIP Skill EXP is "vip skill"):
// campaign -> camp; vip flag or SQ22 -> vip; SQ12 -> daily (Daily Challenge: Cid); SQ09 / SQ07 -> mog (Moogle O' Glory,
// Keyblade Materials); SQ11 -> skill (Skill EXP); anything else (EXP/Evolve/Munny/Mythril/Adamantite... by weekday)
// -> weekday. A VIP-only quest of another family counts as vip only.
const TYPE_OPTS = [['all', 'All'], ['weekday', 'Weekday'], ['daily', 'Daily Cid'], ['vip', 'VIP'], ['mog', 'MOG / Keyblade'], ['skill', 'Skill'], ['camp', 'Campaigns']];
// SHOW chips, from the status logic of the row: can (past quest, can be kept), now (listed in Special this Shop week,
// VIP ones locked without VIP too), kept, replaced, removed (not restored), later (period not reached in the Story yet);
// `other` (current period, not this week) has no chip: All only
const SHOW_OPTS = [['all', 'All quests'], ['can', 'Can be kept now'], ['now', 'In Special now'], ['kept', 'Kept'], ['replaced', 'Replaced'], ['removed', 'Not restored'], ['later', 'Later in the Story']];
function typesOf(en) {
  const t = [];
  if (en.campaign) t.push('camp');
  if (en.vip || en.family === 'SQ22') t.push('vip');
  if (en.family === 'SQ12') t.push('daily');
  if (en.family === 'SQ09' || en.family === 'SQ07') t.push('mog');
  if (en.family === 'SQ11') t.push('skill');
  if (!t.length) t.push('weekday');
  return t.join(' ');
}

// Reward names for the search box. rows(name) returns the master table (server.js masterRows); the result has
// drop(rewardId) -> names of a drop table and objective(stageId) -> names of the stage's objective rewards.
const ITEM_NAMES = { 2: 'Jewels', 4: 'Munny', 11: 'Lux', 14: 'Avatar Coin', 26: 'Skip Ticket', 28: 'Skip Ticket+' };
function buildNames(rows) {
  let med, mat, rew, stg;
  const name = (type, id) => (type === 3 ? (med ??= new Map(rows('medal').map((m) => [m.medalId, m.name]))).get(id)
    : type === 5 ? (mat ??= new Map(rows('material').map((m) => [m.materialId, m.name]))).get(id) : ITEM_NAMES[type]);
  return {
    drop: (rid) => {
      rew ??= new Map(rows('reward').map((r) => [r.rewardId, r]));
      const r = rew.get(rid);
      return r ? r.type.map((t, i) => name(t, r.id[i])).filter(Boolean) : [];
    },
    objective: (sid) => {
      stg ??= new Map(rows('stage').map((r) => [r.stageId, r]));
      const r = stg.get(sid);
      return r ? (r.submissionRewardType || []).map((t, i) => name(t, r.submissionItemId[i])).filter(Boolean) : [];
    },
  };
}

// ES5, no external script. Rows: one read of three attributes at start; filtering toggles " hide" on the row, and on
// the period section when none of its rows is visible.
const JS = `(function(){
var PN=__PN__,LAB={type:__TYPE__,show:__SHOW__};
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var rows=[].map.call(document.querySelectorAll('.q'),function(el){return {el:el,p:attr(el,'data-period'),t:' '+attr(el,'data-type')+' ',s:attr(el,'data-show'),q:attr(el,'data-search')||''};});
var secs=[].map.call(document.querySelectorAll('.sec'),function(el){return {el:el,p:attr(el,'data-p')};});
var cur={p:'all',type:'all',show:'all',q:''},dr=null;
function copy(s){return {p:s.p,type:s.type,show:s.show,q:s.q};}
function match(r,s,anyPeriod){
if(!anyPeriod&&s.p!=='all'&&r.p!==s.p)return false;
if(s.type!=='all'&&r.t.indexOf(' '+s.type+' ')<0)return false;
if(s.show!=='all'&&r.s!==s.show)return false;
return !s.q||r.q.indexOf(s.q.toLowerCase())>=0;}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.type!=='all'?1:0)+(s.show!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n){return n+' quest'+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function render(){
var c={all:0},n=0,i,r,on,sh={};
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true)){c.all++;c[r.p]=(c[r.p]||0)+1;}
on=match(r,cur);if(on){n++;sh[r.p]=1;}r.el.className=r.el.className.replace(/ hide/g,'')+(on?'':' hide');}
for(i=0;i<secs.length;i++)secs[i].el.className='sec'+(sh[secs[i].p]?'':' hide');
[].forEach.call(document.querySelectorAll('.tab'),function(t){var p=attr(t,'data-p');t.className='tab'+(p===cur.p?' on':'');$('tc'+p).textContent=c[p]||0;});
var k=nf(cur),h='<span class="n1">'+plural(n)+'</span>';
if(cur.p!=='all')h+=' from <b>'+esc(PN[cur.p])+'</b>';
if(!k)h+=cur.p==='all'?' · all periods, no filters':' · no filters';
else{h+=cur.p==='all'?' match:':' match your filters:';
if(cur.type!=='all')h+=' '+tag('type',LAB.type[cur.type]);
if(cur.show!=='all')h+=' '+tag('show',LAB.show[cur.show]);
if(cur.q)h+=' '+tag('q','🔍 &quot;'+esc(cur.q)+'&quot;');
h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=k?k:'';}
function sync(){
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className='o'+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr));}
function openF(){dr=copy(cur);$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){dr.q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var v=attr(e.target,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();dr.type='all';dr.show='all';dr.q='';$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr)return;var s=dr;s.p=cur.p;closeF();cur=s;render();};
$('sum').onclick=function(e){var x=attr(e.target,'data-x');if(!x)return;e.preventDefault();
if(x==='type'||x==='all')cur.type='all';if(x==='show'||x==='all')cur.show='all';if(x==='q'||x==='all')cur.q='';render();};
$('tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-p'))t=t.parentNode;if(!t)return;cur.p=attr(t,'data-p');render();};
render();
})();`;

function catalogPage(index, ctx = {}) {
  const periods = ctx.periods || special.PERIODS, cur = ctx.period, pinnedKey = ctx.pinnedKey || '';
  const names = ctx.names || { drop: () => [], objective: () => [] };
  const entries = index.entries.filter((en) => en.periods && en.key !== 'catalog' && !en.training);
  const byKey = new Map(index.entries.map((en) => [en.key, en]));
  const pinned = byKey.get(pinnedKey);
  const per = (en) => Math.min(...en.periods);
  // quests of this Shop week, as the Special tab lists them (special.specialEvents): ctx.period / shopFrom / shopTo
  const current = new Set(cur === undefined ? [] : special.currentEntries({ entries }, ctx));
  // searchable text of an entry: its name, its quests' names, the drop items and the objective rewards (lower case)
  const search = (en) => {
    const parts = [en.name];
    const stages = en.stages && en.stages.length ? en.stages : [{ dropRewardIds: en.dropRewardIds }];
    for (const s of stages) {
      if (s.quest) parts.push(s.quest);
      for (const rid of s.dropRewardIds || []) parts.push(...names.drop(rid));
    }
    for (const sid of en.stageIds || []) parts.push(...names.objective(sid));
    return [...new Set(parts.map((x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' | ');
  };
  const row = (en) => {
    const id = en.evStageId, isPinned = en.key === pinnedKey, can = special.pinnable(en, cur);
    const btn = (on, label) => `<a href="#" class="pk" data-id="${id}" data-on="${on}" data-pin="${on === 1 ? `/web/special/pin/${id}` : '/web/special/unpin'}" onclick="return khuxClick(this)">${label}</a>`;
    const later = per(en) > cur;
    let st = '', button = '', show;
    if (later) { show = 'later'; st = '<div class="st later">Reached later in the Story</div>'; }
    else if (en.removed) { show = 'removed'; st = '<div class="st none">Not restored: its materials have no use in this version</div>'; }
    else if (en.replacedBy) { show = 'replaced'; st = `<div class="st none">Replaced by ${esc(byKey.get(en.replacedBy)?.name || en.replacedBy)}</div>`; }
    else if (isPinned) { show = 'kept'; st = '<div class="st">📌 Kept in Special</div>'; button = btn(0, 'Remove from Special'); }
    else if (can.ok) {
      show = 'can';
      st = '<div class="st">Past quest: can be kept in Special</div>';
      if (pinned) st += `<div class="rp">Replaces: ${esc(pinned.name)}</div>`;
      button = btn(1, '📌 Keep in Special');
    } else if (!current.has(en)) {
      // current period, but not listed this Shop week: a campaign of another week, or an entry outside its from / to
      show = 'other';
      st = `<div class="st none">${en.campaign ? `Week of ${niceDay(en.campaign.start)}` : 'This period, not this week'}</div>`;
    } else if (en.vip && !ctx.vip) { show = 'now'; st = '<div class="st none">VIP only (locked)</div>'; }
    else { show = 'now'; st = '<div class="st">Open in Special now</div>'; }
    const days = en.days === 'all' ? 'Every day' : (en.days || []).join(', ');
    return `<div class="q${isPinned ? ' pinned' : ''}${later ? ' lt' : ''}" id="q${id}" data-period="${per(en)}" data-type="${typesOf(en)}" data-show="${show}" data-search="${esc(search(en))}">`
      + `<div class="im"><img loading="lazy" width="320" height="70" src="${special.imgPath(id)}" alt=""></div>`
      + `<div class="info"><div class="nm">${esc(en.name)}</div><div class="d">${esc(days)}${en.vip ? ' · <span class="vip">VIP only</span>' : ''}</div>${st}${button}</div></div>
`;
  };
  const sections = periods.map((p) => {
    const rows = entries.filter((en) => per(en) === p.n).map(row).join('');
    return `<div class="sec" data-p="${p.n}"><h2 class="per" id="p${p.n}">${esc(p.name)}</h2>`
      + `<div class="n">${niceDay(p.from)} – ${niceDay(p.to)}</div>${rows || '<p class="n">No quests.</p>'}</div>`;
  }).join('');
  const tab = (p, name, n, now) => `<button type="button" class="tab${p === 'all' ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b>${now ? '<span class="now">Now</span>' : ''}<span class="c" id="tc${p}">${n}</span></button>`;
  const opts = (list) => list.map(([v, l], i) => `<button type="button" class="o${i ? '' : ' on'}" data-v="${v}">${l}</button>`).join('');
  const n = entries.length, nq = `${n} quest${n === 1 ? '' : 's'}`;
  const js = JS.replace('__PN__', JSON.stringify(Object.fromEntries(periods.map((p) => [p.n, p.name]))))
    .replace('__TYPE__', JSON.stringify(Object.fromEntries(TYPE_OPTS.slice(1))))
    .replace('__SHOW__', JSON.stringify(Object.fromEntries(SHOW_OPTS.slice(1))));
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>Special Catalog</title><style>${CSS}</style></head><body>`
    + '<div class="hdr"><h1>Special Catalog</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Quests from past periods can be kept in Special. Only one can be kept at a time.</p>'
    + `<div class="tabs" id="tabs">${tab('all', 'All', n)}${periods.map((p) => tab(p.n, p.name, entries.filter((en) => per(en) === p.n).length, p.n === cur)).join('')}</div><div class="tabline"></div>`
    + `<div class="sum" id="sum"><span class="n1">${nq}</span> · all periods, no filters</div>${sections}`
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search">🔍<input type="search" id="fq" placeholder="Quest or reward name" autocomplete="off"></div>'
    + '<div class="hint">Matches quest names and the items they give (e.g. Huey, Mythril, Cid).</div>'
    + `<h4>TYPE</h4><div class="opts" data-g="type">${opts(TYPE_OPTS)}</div>`
    + `<h4>SHOW</h4><div class="opts" data-g="show">${opts(SHOW_OPTS)}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${nq}</button></div></div>`
    + `<div id="pinmsg" class="pinmsg"></div><script>${PIN_JS}</script><script>${js}</script></body></html>`;
}

module.exports = { catalogPage, buildNames, typesOf };
