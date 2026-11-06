// Medal Gallery (I-242, user request 06-11; docs/notes/medaglie.md#medal-gallery): a server web page (WebView) with the two
// kinds of Medal the in-game Medal List cannot filter (the Sort/Filter popup's conditions are hardcoded in the client):
//   BGM Medals - the Medals with a music track (medal.bgm, server/medal_bgm.json applied by make-game-tables.js);
//   Full Art   - the Medals with the Art button (imageCategory 2, server/medal-art.js), one section per artwork (55),
//                the CONTAINED Medals marked «Reconstructed».
// Not original: an addition of this server, in the style of the Raid / Special catalogues (tabs, Filters sheet, side bar,
// lazy pictures). Opened from a link on the Shop's Banner Catalog page (gacha.js catalogPage), no client change.
// Pure HTML, no player or master access: server.js passes the medal rows and the owned Medals (ctx.owned, base medalIds).
// One card per Medal name: its star variants (6★ / 7★ rows of the same name) are chips on the card; boosted copies (groupId =
// base row) count for their base row. Pictures: /web/medals/img/v<N>/<thumbId>.png and /web/medals/art/v<N>/<artId>[-l].jpg,
// written by recon/tools/make_medal_gallery_images.py into server/game_data/medal_img (git-ignored, from the local medal_gen
// pack and the JP 4.3.1 data); a missing picture leaves an empty square of fixed size.
'use strict';
const art = require('./medal-art');
const { CSS: SPECIAL_CSS, esc, MATCH_JS, khuxMatch } = require('./special-pages');

// raise when the pictures change (the URL changes, the WebView cache is skipped)
const IMG_VERSION = 1;
const ATTR = { 1: ['p', 'Power'], 2: ['g', 'Speed'], 3: ['m', 'Magic'] };
const DARKLIGHT = { 1: 'Upright', 2: 'Reversed' };
const TABS = [['bgm', 'BGM Medals', 'with a music track'], ['art', 'Full Art', 'with the Art button']];
const OWN_OPTS = [['all', 'All'], ['own', 'Owned'], ['not', 'Not owned']];
const ATTR_OPTS = [['all', 'All'], ['p', 'Power'], ['g', 'Speed'], ['m', 'Magic']];
const RECON_TEXT = 'Reconstructed';

const baseOf = (m) => (m.groupId && m.groupId !== m.medalId ? m.groupId : m.medalId);
const isBase = (m) => baseOf(m) === m.medalId;
const medalImg = (thumbId) => `/web/medals/img/v${IMG_VERSION}/${thumbId}.png`;
const artImg = (artId, large = false) => `/web/medals/art/v${IMG_VERSION}/${artId}${large ? '-l' : ''}.jpg`;
// URL path of a picture -> file name in game_data/medal_img (<thumbId>.png, art_<artId>.jpg, art_<artId>-l.jpg); null when it
// is not one of these URLs or not of the current version (only these names are ever read: no free path)
function imageFile(urlPath) {
  let m = /^\/web\/medals\/img\/v(\d+)\/(\d+)\.png$/i.exec(urlPath);
  if (m) return Number(m[1]) === IMG_VERSION ? `${Number(m[2])}.png` : null;
  m = /^\/web\/medals\/art\/v(\d+)\/(\d+)(-l)?\.jpg$/i.exec(urlPath);
  return m && Number(m[1]) === IMG_VERSION ? `art_${Number(m[2])}${m[3] ? '-l' : ''}.jpg` : null;
}

// cards of a list of base rows: one per name, in album order (sortId, then medalId); the picture of the highest star
function cardsOf(rows) {
  const by = new Map();
  for (const m of rows) {
    if (!by.has(m.name)) by.set(m.name, []);
    by.get(m.name).push(m);
  }
  return [...by.entries()].map(([name, list]) => {
    list.sort((a, b) => a.rare - b.rare || a.medalId - b.medalId);
    const top = list[list.length - 1];
    return { name, ids: list.map((m) => m.medalId), stars: list.map((m) => ({ id: m.medalId, rare: m.rare })), thumbId: top.thumbId || top.imageId || top.medalId,
      attribute: top.attribute, darklight: top.darklight, sortId: Math.min(...list.map((m) => m.listSortId || m.sortId || 0)), first: Math.min(...list.map((m) => m.medalId)) };
  }).sort((a, b) => a.sortId - b.sortId || a.first - b.first);
}

// -> { bgm: [card], art: [{ artId, name, cards: [card + reconstructed] }], counts }
// bgm: base rows with medal.bgm; art: base rows with imageCategory 2, grouped by artId in the order of medal-art.js ART
function galleryModel(medals) {
  const bases = medals.filter(isBase);
  const contained = new Set(art.CONTAINED.flatMap(([, ids]) => ids));
  const bgm = cardsOf(bases.filter((m) => m.bgm));
  const artRows = bases.filter((m) => m.imageCategory === art.IMAGE_CATEGORY_ART);
  const sections = art.ART.map(([artId, name]) => {
    const cards = cardsOf(artRows.filter((m) => m.artId === artId)).map((c) => ({ ...c, reconstructed: c.ids.every((id) => contained.has(id)) }));
    // the Medal that carries the art first, then the others in album order
    cards.sort((a, b) => (b.name === name) - (a.name === name));
    return { artId, name, cards };
  }).filter((s) => s.cards.length);
  return { bgm, art: sections,
    counts: { bgmCards: bgm.length, bgmRows: bgm.reduce((n, c) => n + c.ids.length, 0), arts: sections.length,
      artCards: sections.reduce((n, s) => n + s.cards.length, 0), artRows: sections.reduce((n, s) => n + s.cards.reduce((k, c) => k + c.ids.length, 0), 0),
      reconstructed: sections.reduce((n, s) => n + s.cards.filter((c) => c.reconstructed).length, 0) } };
}

// owned base medalIds of a save's medal list ([{medalId}]): a boosted copy counts for its base row
function ownedBases(userMedals, medals) {
  const by = new Map(medals.map((m) => [m.medalId, m]));
  const out = new Set();
  for (const u of userMedals || []) { const m = by.get(Number(u.medalId)); out.add(m ? baseOf(m) : Number(u.medalId)); }
  return out;
}

const CSS = SPECIAL_CSS
  + '.row{cursor:default;padding-right:6px}.row.own{border-left-color:#2e9e3e}.row.not{border-left-color:#5a6470}.row.not .mi img{opacity:.75}'
  + '.mi{flex:0 0 64px;width:64px;height:64px}.mi img{width:64px;height:64px;border-radius:0}.info{flex:1 1 150px}'
  + '.st{display:inline-block;border-radius:10px;padding:0 7px;margin:3px 4px 0 0;vertical-align:middle;font-size:12.5px;line-height:1.7;background:#3d4750;color:#b0bac2;white-space:nowrap}.st.on{background:#2e9e3e;color:#fff;font-weight:bold}'
  + '.p{color:#ff4a74}.g{color:#5cd94a}.m{color:#62a7ff}.s-own{background:#2e9e3e;font-weight:bold}.s-not{background:#5a6470;color:#e0e6ea}.s-rec{background:transparent;border:1px solid #ffcd4a;color:#ffcd4a;font-size:12.5px}'
  + '.sec{display:flex;gap:12px;align-items:center;padding:12px 0 6px;border-bottom:2px solid #0a8fa3}.sec .av{flex:0 0 80px;width:80px;height:120px;background:#06283e;border-radius:4px;display:block}'
  + '.sec .av img{width:80px;height:120px}.sec b{display:block;color:#00d4ed;font-size:17px}'
  + '#big{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,12,20,.92);z-index:7;text-align:center;padding:10px}#big img{display:inline-block;max-width:100%;max-height:calc(100% - 50px);width:auto}'
  + '#big .x{position:absolute;right:12px;top:10px}#big .n{margin:4px 0}'
  + 'body.hb{padding-bottom:90px}.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(2,24,40,0),rgba(2,24,40,.92) 35%);z-index:4}'
  + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5)}';

// Light page (as the Raid Catalog, docs/notes/raid.md#catalog-light): the cards travel as compact JSON and kxBuild writes
// their markup in the page before the filter script runs; the same function runs in node for the tests (expandGallery).
// card = [name, thumbId, attribute 1-3, darklight, [[stars, owned 0/1]...], reconstructed 0/1];
// d = {v: picture version, b: [card], a: [[artId, art name, [card]]]}
const BUILD_JS = `var KX_AT={1:["p","Power"],2:["g","Speed"],3:["m","Magic"]},KX_DL={1:"Upright",2:"Reversed"};
function kxEsc(t){return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}
function kxCard(c,t,v){var own=0,i,st="",a=KX_AT[c[2]]||["",""],o;
for(i=0;i<c[4].length;i++){if(c[4][i][1])own=1;st+='<span class="st'+(c[4][i][1]?' on':'')+'">'+c[4][i][0]+'\\u2605</span>';}
o=own?"own":"not";
return '<div class="row '+o+'" data-tab="'+t+'" data-own="'+o+'" data-at="'+a[0]+'" data-name="'+kxEsc(c[0])+'">'
+'<div class="mi"><img width="64" height="64" data-src="/web/medals/img/v'+v+'/'+c[1]+'.png" alt=""></div>'
+'<div class="info"><span class="nm">'+kxEsc(c[0])+'</span><div class="d">'+(a[1]?'<span class="'+a[0]+'">'+a[1]+'</span>':'')+(KX_DL[c[3]]?' \\u00b7 '+KX_DL[c[3]]:'')+'</div><div>'+st
+'<span class="s s-'+o+'">'+(own?'Owned':'Not owned')+'</span>'+(c[5]?' <span class="s s-rec">Reconstructed</span>':'')+'</div></div></div>\\n';}
function kxBuild(d){var h="",i,j,s,n;for(i=0;i<d.b.length;i++)h+=kxCard(d.b[i],"bgm",d.v);
for(i=0;i<d.a.length;i++){s=d.a[i];n=s[2].length;
h+='<div class="sec" data-tab="art"><a class="av" href="#" data-big="/web/medals/art/v'+d.v+'/'+s[0]+'-l.jpg" data-title="'+kxEsc(s[1])+'" aria-label="Full artwork">'
+'<img width="80" height="120" data-src="/web/medals/art/v'+d.v+'/'+s[0]+'.jpg" alt=""></a><div><b>'+kxEsc(s[1])+'</b><div class="d">Full artwork \\u00b7 '+n+' Medal'+(n===1?'':'s')+'</div></div></div>\\n';
for(j=0;j<n;j++)h+=kxCard(s[2][j],"art",d.v);}return h;}`;
const kxBuild = new Function(`${BUILD_JS};return kxBuild;`)();

const packCard = (c, owned) => [c.name, c.thumbId, c.attribute || 0, c.darklight || 0, c.stars.map((s) => [s.rare, owned.has(s.id) ? 1 : 0]), c.reconstructed ? 1 : 0];
const pageData = (model, owned) => ({ v: IMG_VERSION, b: model.bgm.map((c) => packCard(c, owned)),
  a: model.art.map((s) => [s.artId, s.name, s.cards.map((c) => packCard(c, owned))]) });
const DATA_RE = /<script id="kxdata" type="application\/json">([\s\S]*?)<\/script><script>[\s\S]*?<\/script>/;
// the page with its cards written out (tests)
function expandGallery(page) {
  const m = DATA_RE.exec(page);
  if (!m) return page;
  const html = kxBuild(JSON.parse(m[1]));
  return page.replace(m[0], '').replace(/(<div id="rows" data-tab="[a-z]+">)/, (x) => x + html);
}

// ES5, no external script. Rows read once; a tab and the Filters sheet only toggle a class; pictures load for shown rows only.
const JS = `(function(){
var LAB={own:__OWN__,at:__AT__};
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var rows=[].map.call(document.querySelectorAll('#rows .row'),function(el){return {el:el,t:attr(el,'data-tab'),o:attr(el,'data-own'),a:attr(el,'data-at'),n:attr(el,'data-name')};});
var secs=[].map.call(document.querySelectorAll('#rows .sec'),function(el){return el;});
var cur={t:attr($('rows'),'data-tab'),own:'all',at:'all',q:''},dr=null;
function copy(s){return {t:s.t,own:s.own,at:s.at,q:s.q};}
function match(r,s,anyTab){if(!anyTab&&r.t!==s.t)return false;if(s.own!=='all'&&r.o!==s.own)return false;if(s.at!=='all'&&r.a!==s.at)return false;return !s.q||khuxMatch(s.q,r.n);}
function count(s){var n=0;for(var i=0;i<rows.length;i++)if(match(rows[i],s))n++;return n;}
function nf(s){return (s.own!=='all'?1:0)+(s.at!=='all'?1:0)+(s.q?1:0);}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function tag(g,l){return '<span class="tag">'+l+'<a href="#" data-x="'+g+'" aria-label="Remove">×</a></span>';}
function hide(el,h){el.className=el.className.replace(/ hide/g,'')+(h?' hide':'');}
function load(el){var im=el.querySelector('img[data-src]');if(im&&!im.getAttribute('src'))im.setAttribute('src',im.getAttribute('data-src'));}
function render(){
var c={},n=0,i,r,on;
for(i=0;i<rows.length;i++){r=rows[i];if(match(r,cur,true))c[r.t]=(c[r.t]||0)+1;on=match(r,cur);hide(r.el,!on);if(on){n++;load(r.el);}}
for(i=0;i<secs.length;i++){var e=secs[i].nextSibling,vis=false;while(e&&!/\\bsec\\b/.test(e.className||'')){if(e.className&&e.className.indexOf(' hide')<0)vis=true;e=e.nextSibling;}hide(secs[i],!vis);if(vis)load(secs[i]);}
[].forEach.call(document.querySelectorAll('.tab'),function(t){var p=attr(t,'data-p');t.className='tab'+(p===cur.t?' on':'');$('tc'+p).textContent=c[p]||0;});
$('intro-bgm').style.display=cur.t==='bgm'?'':'none';$('intro-art').style.display=cur.t==='art'?'':'none';
var f=nf(cur),h='<span class="n1">'+plural(n,'Medal')+'</span>';
if(!f)h+=' · no filters';else{h+=' match your filters:';
if(cur.own!=='all')h+=' '+tag('own',LAB.own[cur.own]);if(cur.at!=='all')h+=' '+tag('at',LAB.at[cur.at]);
if(cur.q)h+=' '+tag('q','Find: &quot;'+esc(cur.q)+'&quot;');h+=' <a href="#" class="clear" data-x="all">Clear all</a>';}
$('sum').innerHTML=h;$('fdot').textContent=f?f:'';
var none=$('none');none.textContent=n?'':(cur.q?'No Medals match "'+cur.q+'"':'No Medals match your filters');none.style.display=n?'none':'';}
function sync(){[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){var g=attr(box,'data-g');[].forEach.call(box.children,function(o){o.className=o.className.replace(/ on/g,'')+(attr(o,'data-v')===dr[g]?' on':'');});});
$('fok').textContent='Show '+plural(count(dr),'result');}
function openF(){dr=copy(cur);$('fq').value=dr.q;if(document.body.className.indexOf('fo')<0)document.body.className+=' fo';sync();}
function closeF(){dr=null;document.body.className=document.body.className.replace(/ ?fo/g,'');}
$('fbtn').onclick=openF;$('fx').onclick=closeF;$('dim').onclick=closeF;
$('fq').oninput=function(){dr.q=this.value.replace(/\\s+/g,' ').replace(/^ | $/g,'');sync();};
$('fq').onkeydown=function(e){if(e.keyCode===13)this.blur();};
[].forEach.call(document.querySelectorAll('.sheet .opts'),function(box){box.onclick=function(e){var t=e.target;while(t&&t!==box&&!attr(t,'data-v'))t=t.parentNode;var v=attr(t,'data-v');if(!v||!dr)return;dr[attr(box,'data-g')]=v;sync();};});
$('freset').onclick=function(e){e.preventDefault();dr.own='all';dr.at='all';dr.q='';$('fq').value='';sync();};
$('fok').onclick=function(){if(!dr)return;var s=dr;s.t=cur.t;closeF();cur=s;render();};
$('sum').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-x'))t=t.parentNode;var x=attr(t,'data-x');if(!x)return;e.preventDefault();
if(x==='own'||x==='all')cur.own='all';if(x==='at'||x==='all')cur.at='all';if(x==='q'||x==='all')cur.q='';render();};
$('tabs').onclick=function(e){var t=e.target;while(t&&!attr(t,'data-p'))t=t.parentNode;if(!t)return;cur.t=attr(t,'data-p');render();window.scrollTo(0,0);};
// the full artwork, larger, on a tap of its thumbnail
$('rows').onclick=function(e){var t=e.target;while(t&&t!==this&&!attr(t,'data-big'))t=t.parentNode;var b=attr(t,'data-big');if(!b)return;e.preventDefault();
$('bigimg').setAttribute('src',b);$('bigname').textContent=attr(t,'data-title');$('big').style.display='block';};
$('bigx').onclick=function(){$('big').style.display='none';$('bigimg').removeAttribute('src');};
render();
})();`;

// GET /web/medals/gallery[?tab=art][&from=catalog]. ctx: { owned: Set of base medalIds, tab, fromCatalog }
function galleryPage(medals, ctx = {}) {
  const model = galleryModel(medals), owned = ctx.owned || new Set();
  const tab0 = ctx.tab === 'art' ? 'art' : 'bgm';
  // «</» never closes the script element: written <\/ inside the JSON
  const data = JSON.stringify(pageData(model, owned)).replace(/<\//g, '<\\/');
  const counts = { bgm: model.bgm.length, art: model.counts.artCards };
  const tab = ([p, name, sub]) => `<button type="button" class="tab${p === tab0 ? ' on' : ''}" data-p="${p}"><b>${esc(name)}</b><small>${esc(sub)}</small><span class="c" id="tc${p}">${counts[p]}</span></button>`;
  const opts = (list) => list.map(([v, l], i) => `<button type="button" class="o${i ? '' : ' on'}" data-v="${v}">${esc(l)}</button>`).join('');
  const labels = (list) => JSON.stringify(Object.fromEntries(list.slice(1).map(([v, l]) => [v, l])));
  const js = JS.replace('__OWN__', labels(OWN_OPTS)).replace('__AT__', labels(ATTR_OPTS)).replace('__MATCH__', () => MATCH_JS);
  const n = counts[tab0];
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>Medal Gallery</title><style>${CSS}</style></head><body${ctx.fromCatalog ? ' class="hb"' : ''}>`
    + '<div class="hdr"><h1>Medal Gallery</h1><button type="button" class="fbtn" id="fbtn">⚙ Filters<span class="dot" id="fdot"></span></button></div>'
    + '<p class="n">Medals the Medal List cannot filter. The Medal Gallery is an addition of this server.</p>'
    + `<div class="tabs" id="tabs">${TABS.map(tab).join('')}</div><div class="tabline"></div>`
    + `<p class="n" id="intro-bgm"${tab0 === 'bgm' ? '' : ' style="display:none"'}>Medals with their own music: it plays in the Medal's details and on the Home screen when the Medal is shared. Supernova versions play the track of their Medal (not original).</p>`
    + `<p class="n" id="intro-art"${tab0 === 'art' ? '' : ' style="display:none"'}>Medals with the <b>Art</b> button in their details, by artwork: tap a picture to see it larger. Medals marked <b>${RECON_TEXT}</b> show an artwork their own picture is part of, although the original data gave them none.</p>`
    + `<div class="sum" id="sum"><span class="n1">${n} Medal${n === 1 ? '' : 's'}</span> · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows" data-tab="${tab0}"></div>`
    + `<script id="kxdata" type="application/json">${data}</script><script>${BUILD_JS}\ndocument.getElementById("rows").innerHTML=kxBuild(JSON.parse(document.getElementById("kxdata").textContent));</script>`
    + '<div id="big" role="dialog" aria-label="Full artwork"><button type="button" class="x" id="bigx" aria-label="Close">✕</button><p class="n" id="bigname"></p><img id="bigimg" alt=""></div>'
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Medal name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in Medal names (e.g. Key Art, Xion, Stained).</div>'
    + `<h4>OWNED</h4><div class="opts" data-g="own">${opts(OWN_OPTS)}</div>`
    + `<h4>ATTRIBUTE</h4><div class="opts" data-g="at">${opts(ATTR_OPTS)}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${n} result${n === 1 ? '' : 's'}</button></div></div>`
    + (ctx.fromCatalog ? '<div class="bar"><a class="back" href="/web/gacha/catalog">BACK</a></div>' : '')
    + `<script>${js}</script></body></html>`;
}

module.exports = { IMG_VERSION, imageFile, galleryModel, galleryPage, expandGallery, pageData, ownedBases, medalImg, artImg, baseOf, khuxMatch, RECON_TEXT, BUILD_JS };
