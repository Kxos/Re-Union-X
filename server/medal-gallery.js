// Medal Gallery (I-242, user requests 06-11; docs/notes/medaglie.md#medal-gallery): a server web page (WebView) with the two
// kinds of Medal the in-game Medal List cannot filter (the Sort/Filter popup's conditions are hardcoded in the client):
//   BGM Medals - the Medals with a music track (medal.bgm, server/medal_bgm.json applied by make-game-tables.js), with the
//                track name (medal_bgm.json «tracks», khuxwiki) and a player in the detail view;
//   Full Art   - the Medals with the Art button (imageCategory 2, server/medal-art.js), one section per artwork (55),
//                the CONTAINED Medals marked «Reconstructed».
// Not original: an addition of this server, in the style of the Raid / Special catalogues (tabs, Filters sheet, side bar,
// lazy pictures). Entry: a block on the Shop's Banner Catalog page (gacha.js catalogPage, entryHtml below), no client change.
// Pure HTML, no player or master access: server.js passes the medal rows and the owned Medals (ctx.owned, base medalIds).
// One card per Medal name: its star variants (6★ / 7★ rows of the same name) are chips on the card; boosted copies (groupId =
// base row) count for their base row. Cards whose pictures are practically identical (server/medal_gallery_groups.json, by
// image comparison: recon/tools/make_medal_gallery_groups.py) are shown once, the others on a «Variants:» line.
// Files: /web/medals/img/v<N>/<thumbId>[-l].png, /web/medals/art/v<N>/<artId>[-l].jpg, /web/medals/bgm/v<N>/<soundId>.ogg,
// written by recon/tools/make_medal_gallery_images.py into server/game_data/medal_img and medal_bgm (git-ignored, from the
// local medal_gen pack and the JP 4.3.1 data); a missing picture leaves an empty square of fixed size.
'use strict';
const art = require('./medal-art');
const { CSS: SPECIAL_CSS, esc, MATCH_JS, khuxMatch } = require('./special-pages');

// raise when the files change (the URL changes, the WebView cache is skipped)
const IMG_VERSION = 1;
const TABS = [['bgm', 'BGM Medals', 'music of the Medal'], ['art', 'Full Art', 'with the Art button']];
const OWN_OPTS = [['all', 'All'], ['own', 'Owned'], ['not', 'Not owned']];
const ATTR_OPTS = [['all', 'All'], ['p', 'Power'], ['g', 'Speed'], ['m', 'Magic']];
const RECON_TEXT = 'Reconstructed';
const UNVERIFIED_TEXT = 'sound match not verified';
// The page cannot pause the music of the game (user 06-11: «mute it as the Medal detail does»): the client's WebView has no
// bridge to the game (no JavaScript interface, no URL scheme handled by the game; docs/notes/medaglie.md#medal-gallery-music)
// and its sound engine does not react to Android audio focus. So the detail view says how to do it by hand: the BGM slider
// of Other > Settings (OptionDialog). HTML inside a single-quoted page string: no apostrophe.
const MUSIC_HINT = 'The music of the game keeps playing underneath: the gallery cannot pause it. To hear this track alone, lower <b>BGM</b> in <b>Other &gt; Settings</b>, then raise it again.';
// previews of the Banner Catalog block: HD Roxas 7★ (BGM Medal) and the artwork of Key Art #1
const PREVIEW = { thumbId: 300893, artId: 43086 };
const VARIANT_PREFIX = /^(SN\+{0,2}|Supernova\+?) - /;

const baseOf = (m) => (m.groupId && m.groupId !== m.medalId ? m.groupId : m.medalId);
const isBase = (m) => baseOf(m) === m.medalId;
const medalImg = (thumbId, large = false) => `/web/medals/img/v${IMG_VERSION}/${thumbId}${large ? '-l' : ''}.png`;
const artImg = (artId, large = false) => `/web/medals/art/v${IMG_VERSION}/${artId}${large ? '-l' : ''}.jpg`;
const bgmUrl = (soundId) => `/web/medals/bgm/v${IMG_VERSION}/${soundId}.ogg`;
// URL path of a file -> { dir: 'img' | 'bgm', file, type } in game_data/medal_img or medal_bgm; null when it is not one of
// these URLs or not of the current version (only these names are ever read: no free path)
function mediaFile(urlPath) {
  let m = /^\/web\/medals\/img\/v(\d+)\/(\d+)(-l)?\.png$/i.exec(urlPath);
  if (m) return Number(m[1]) === IMG_VERSION ? { dir: 'img', file: `${Number(m[2])}${m[3] ? '-l' : ''}.png`, type: 'image/png' } : null;
  m = /^\/web\/medals\/art\/v(\d+)\/(\d+)(-l)?\.jpg$/i.exec(urlPath);
  if (m) return Number(m[1]) === IMG_VERSION ? { dir: 'img', file: `art_${Number(m[2])}${m[3] ? '-l' : ''}.jpg`, type: 'image/jpeg' } : null;
  m = /^\/web\/medals\/bgm\/v(\d+)\/(\d+)\.ogg$/i.exec(urlPath);
  return m && Number(m[1]) === IMG_VERSION ? { dir: 'bgm', file: `${Number(m[2])}.ogg`, type: 'audio/ogg' } : null;
}
const imageFile = (urlPath) => { const f = mediaFile(urlPath); return f && f.dir === 'img' ? f.file : null; };

// track names: medal_bgm.json «tracks» (khuxwiki names «(EX)» -> «[EX]», as make-game-tables.js); an SN / Supernova takes
// the track of its base Medal (user decision 16-10); _incerti: the sound file matched to the Medal is not verified
const bgmKey = (s) => String(s).toLowerCase().replace(/\(ex(\+?)\)/, '[ex$1]').replace(/[^a-z0-9[\]+&]/g, '');
function trackLookup(bgmJson) {
  const by = new Map(Object.entries((bgmJson && bgmJson.tracks) || {}).map(([n, t]) => [bgmKey(n), { title: t, uncertain: !!(bgmJson._incerti || {})[n] }]));
  return (name) => {
    const base = String(name).replace(VARIANT_PREFIX, '');
    return by.get(bgmKey(name)) || by.get(bgmKey(base)) || by.get(bgmKey(base.replace(/ A$/, ''))) || null;
  };
}
const defaultGroups = () => require('./medal_gallery_groups.json').groups;
const defaultBgm = () => require('./medal_bgm.json');

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
    return { name, ids: list.map((m) => m.medalId), top: top.medalId, stars: list.map((m) => ({ id: m.medalId, rare: m.rare })), thumbId: top.thumbId || top.imageId || top.medalId,
      attribute: top.attribute, darklight: top.darklight, bgm: top.bgm || 0, sortId: Math.min(...list.map((m) => m.listSortId || m.sortId || 0)), first: Math.min(...list.map((m) => m.medalId)), variants: [] };
  }).sort((a, b) => a.sortId - b.sortId || a.first - b.first);
}
// the cards of one group (same picture) become one: the Medal without an SN / Supernova prefix first, then album order
function mergeGroups(cards, list, groups) {
  const byTop = new Map(cards.map((c) => [c.top, c]));
  const gone = new Set();
  for (const g of groups.filter((x) => String(x.list) === String(list))) {
    const members = g.ids.map((id) => byTop.get(id)).filter(Boolean);
    if (members.length < 2) continue;
    members.sort((a, b) => VARIANT_PREFIX.test(a.name) - VARIANT_PREFIX.test(b.name) || a.sortId - b.sortId || a.first - b.first);
    members[0].variants.push(...members.slice(1));
    members.slice(1).forEach((c) => gone.add(c));
  }
  return cards.filter((c) => !gone.has(c));
}
const memberIds = (c) => [...c.ids, ...c.variants.flatMap((v) => v.ids)];

// -> { bgm: [card], art: [{ artId, name, cards }], counts }. opts: { groups, bgmJson } (defaults: the repo files)
// bgm: base rows with medal.bgm; art: base rows with imageCategory 2, grouped by artId in the order of medal-art.js ART
function galleryModel(medals, opts = {}) {
  const groups = opts.groups || defaultGroups(), track = trackLookup(opts.bgmJson || defaultBgm());
  const bases = medals.filter(isBase);
  const contained = new Set(art.CONTAINED.flatMap(([, ids]) => ids));
  const withTrack = (c) => { const t = c.bgm ? track(c.name) : null; c.track = t ? t.title : ''; c.uncertain = !!(t && t.uncertain); return c; };
  const all = cardsOf(bases.filter((m) => m.bgm)).map(withTrack);
  const bgm = mergeGroups(all, 'bgm', groups);
  const artRows = bases.filter((m) => m.imageCategory === art.IMAGE_CATEGORY_ART);
  let artAll = 0;
  const sections = art.ART.map(([artId, name]) => {
    const cards = cardsOf(artRows.filter((m) => m.artId === artId)).map((c) => withTrack({ ...c, reconstructed: c.ids.every((id) => contained.has(id)) }));
    artAll += cards.length;
    const shown = mergeGroups(cards, artId, groups);
    // the Medal that carries the art first, then the others in album order
    shown.sort((a, b) => (b.name === name) - (a.name === name));
    return { artId, name, cards: shown };
  }).filter((s) => s.cards.length);
  const rows = (list) => list.reduce((n, c) => n + memberIds(c).length, 0);
  return { bgm, art: sections,
    counts: { bgmCards: bgm.length, bgmNames: all.length, bgmRows: rows(bgm), arts: sections.length, artCards: sections.reduce((n, s) => n + s.cards.length, 0), artNames: artAll,
      artRows: sections.reduce((n, s) => n + rows(s.cards), 0), reconstructed: sections.reduce((n, s) => n + s.cards.filter((c) => c.reconstructed).length, 0),
      tracks: new Set(all.map((c) => c.track).filter(Boolean)).size } };
}

// owned base medalIds of a save's medal list ([{medalId}]): a boosted copy counts for its base row
function ownedBases(userMedals, medals) {
  const by = new Map(medals.map((m) => [m.medalId, m]));
  const out = new Set();
  for (const u of userMedals || []) { const m = by.get(Number(u.medalId)); out.add(m ? baseOf(m) : Number(u.medalId)); }
  return out;
}

const CSS = SPECIAL_CSS
  + 'body{font-size:16px}.row{cursor:pointer;flex-wrap:nowrap;background:#06314d;border-radius:8px;border-bottom:0;margin:8px 0;padding:10px 26px 10px 10px;gap:12px;align-items:center}'
  + '.row.own{border-left-color:#2e9e3e}.row.not{border-left-color:#5a6470}.row:active{background:#0b4466}'
  + '.mi{flex:0 0 96px;width:96px;height:96px}.mi img{width:96px;height:96px;border-radius:0}.row.ta .mi{flex-basis:76px;width:76px;height:76px}.row.ta .mi img{width:76px;height:76px}'
  + '.info{flex:1 1 auto;min-width:0;line-height:1.35}.row .nm{font-size:17px;margin-bottom:3px}.d{font-size:14px;color:#c6d8e4}'
  + '.tk{color:#ffcd4a;font-size:14.5px;margin:3px 0 1px}.tk i{font-style:normal;color:#b9cfdc;font-size:12.5px}'
  + '.cps{margin-top:3px}.st{display:inline-block;vertical-align:middle;border-radius:10px;padding:0 7px;margin:3px 4px 0 0;font-size:12.5px;line-height:1.7;background:#3d4750;color:#c4ccd2;white-space:nowrap}.st.on{background:#2e9e3e;color:#fff;font-weight:bold}'
  + '.vrt{font-size:13px;color:#b9cfdc;margin-top:5px;line-height:1.5}.vrt b{color:#9fe0ff;font-weight:normal}.vv{white-space:nowrap}.vv.on{color:#7be08a}'
  + '.p{color:#ff6b8a}.g{color:#6be05a}.m{color:#7ab4ff}.s{vertical-align:middle;font-size:12.5px}.s-own{background:#2e9e3e;font-weight:bold}.s-not{background:#5a6470;color:#e0e6ea}.s-rec{background:transparent;border:1px solid #ffcd4a;color:#ffcd4a}'
  + '.go{color:#9fd4ff}'
  + '.sec{display:flex;gap:14px;align-items:center;padding:16px 0 4px;margin-top:6px;border-bottom:2px solid #0a8fa3}.sec .av{flex:0 0 80px;width:80px;height:120px;background:#06283e;border-radius:6px;display:block;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.5)}'
  + '.sec .av img{width:80px;height:120px}.sec b{display:block;color:#00d4ed;font-size:18px}.sec .d{margin-top:2px}'
  + '.ovl{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,12,20,.94);z-index:7;overflow:auto;padding:12px 14px 30px;box-sizing:border-box}'
  + '.ovl .x{position:absolute;right:12px;top:10px}#big{text-align:center}#big img{display:inline-block;max-width:100%;max-height:calc(100% - 50px);width:auto}#big .n{margin:4px 40px 4px 0}'
  + '#det{text-align:center}#det .lg{display:block;width:240px;height:240px;margin:6px auto 4px;max-width:70vw;max-height:70vw}#det h2{color:#fff;font-size:21px;margin:4px 30px 2px}#det h2:before{content:none}'
  + '#det .d{font-size:15px}#det .tk{font-size:17px;margin:10px 0 4px}#det .vl{text-align:left;max-width:440px;margin:12px auto 0;padding:0;list-style:none}#det .vl li{padding:6px 0;border-bottom:1px solid #2f5d78}'
  + '.play{border:2px solid #ffe08a;border-radius:22px;color:#fff;font:bold 17px sans-serif;padding:7px 26px;background:linear-gradient(#e0a020,#a8700a);cursor:pointer;margin:8px 0 2px}.play.on{border-color:#ffb0b0;background:linear-gradient(#ff5a5a,#d81e2e 55%,#9c1020)}'
  + '#amsg{color:#b9cfdc;font-size:13px;min-height:1.4em}.mh{color:#b9cfdc;font-size:13px;line-height:1.45;max-width:440px;margin:2px auto 6px}.mh b{color:#fff}'
  + 'body.hb{padding-bottom:90px}.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:linear-gradient(rgba(2,24,40,0),rgba(2,24,40,.92) 35%);z-index:4}'
  + '.back{display:inline-block;padding:7px 26px 8px;border-radius:10px;border:2px solid #9fd4ff;color:#fff;text-decoration:none;font:italic bold 20px sans-serif;letter-spacing:1px;background:linear-gradient(#5aa8ff,#2556c8 55%,#1b3f9c);box-shadow:0 2px 0 #0b2a66,inset 0 1px 0 rgba(255,255,255,.5)}';

// Light page (as the Raid Catalog, docs/notes/raid.md#catalog-light): the cards travel as compact JSON and kxBuild writes
// their markup in the page before the filter script runs; the same function runs in node for the tests (expandGallery).
// card = {n: name, t: thumbId, a: attribute 1-3, d: darklight, s: [[stars, owned 0/1]...], r: reconstructed 0/1,
//   k: track index in d.k or -1, u: sound match not verified 0/1, b: sound id or 0, v: [[name, [[stars, owned]...]]...]}
// d = {v: file version, k: [track names], b: [card], a: [[artId, art name, [card]]]}; cards are numbered in build order
// (kxCards[i], data-i) for the detail view.
const BUILD_JS = `var KX_AT={1:["p","Power"],2:["g","Speed"],3:["m","Magic"]},KX_DL={1:"Upright",2:"Reversed"},kxCards=[],kxD=null;
function kxEsc(t){return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}
function kxOwn(c){var i,j;for(i=0;i<c.s.length;i++)if(c.s[i][1])return 1;for(i=0;i<c.v.length;i++)for(j=0;j<c.v[i][1].length;j++)if(c.v[i][1][j][1])return 1;return 0;}
function kxStars(s){var h="",i;for(i=0;i<s.length;i++)h+='<span class="st'+(s[i][1]?' on':'')+'">'+s[i][0]+'\\u2605</span>';return h;}
function kxVOwn(v){for(var j=0;j<v[1].length;j++)if(v[1][j][1])return 1;return 0;}
function kxVStars(v){var o=[],j;for(j=0;j<v[1].length;j++)o.push(v[1][j][0]+'\\u2605');return o.join('/');}
function kxCard(c,t){var own=kxOwn(c),a=KX_AT[c.a]||["",""],o=own?"own":"not",i=kxCards.length,ns=[c.n],vs=[],j;kxCards.push(c);
for(j=0;j<c.v.length;j++){ns.push(c.v[j][0]);vs.push('<span class="vv'+(kxVOwn(c.v[j])?' on':'')+'">'+kxEsc(c.v[j][0])+' '+kxVStars(c.v[j])+'</span>');}
return '<div class="row '+o+' t'+t.charAt(0)+'" data-i="'+i+'" data-tab="'+t+'" data-own="'+o+'" data-at="'+a[0]+'" data-name="'+kxEsc(ns.join(' | '))+'">'
+'<div class="mi"><img width="96" height="96" data-src="/web/medals/img/v'+kxD.v+'/'+c.t+'.png" alt=""></div>'
+'<div class="info"><div class="nm">'+kxEsc(c.n)+'</div><div class="d">'+(a[1]?'<span class="'+a[0]+'">'+a[1]+'</span>':'')+(KX_DL[c.d]?' \\u00b7 '+KX_DL[c.d]:'')+'</div>'
+(c.k>=0?'<div class="tk">\\u266a '+kxEsc(kxD.k[c.k])+(c.u?' <i>(${UNVERIFIED_TEXT})</i>':'')+'</div>':'')
+'<div class="cps">'+kxStars(c.s)+'<span class="s s-'+o+'">'+(own?'Owned':'Not owned')+'</span>'+(c.r?' <span class="s s-rec">${RECON_TEXT}</span>':'')+'</div>'
+(vs.length?'<div class="vrt"><b>Variants:</b> '+vs.join(', ')+'</div>':'')+'</div><span class="go">\\u203a</span></div>\\n';}
function kxBuild(d){var h="",i,j,s,n;kxD=d;kxCards=[];for(i=0;i<d.b.length;i++)h+=kxCard(d.b[i],"bgm");
for(i=0;i<d.a.length;i++){s=d.a[i];n=s[2].length;
h+='<div class="sec" data-tab="art"><a class="av" href="#" data-big="/web/medals/art/v'+d.v+'/'+s[0]+'-l.jpg" data-title="'+kxEsc(s[1])+'" aria-label="Full artwork">'
+'<img width="80" height="120" data-src="/web/medals/art/v'+d.v+'/'+s[0]+'.jpg" alt=""></a><div><b>'+kxEsc(s[1])+'</b><div class="d">Full artwork \\u00b7 '+n+' Medal'+(n===1?'':'s')+' \\u00b7 tap to enlarge</div></div></div>\\n';
for(j=0;j<n;j++)h+=kxCard(s[2][j],"art");}return h;}`;
const kxBuild = new Function(`${BUILD_JS};return kxBuild;`)();

const packStars = (stars, owned) => stars.map((s) => [s.rare, owned.has(s.id) ? 1 : 0]);
function pageData(model, owned) {
  const tracks = [], tix = new Map();
  const ti = (t) => { if (!t) return -1; if (!tix.has(t)) { tix.set(t, tracks.length); tracks.push(t); } return tix.get(t); };
  const pack = (c) => ({ n: c.name, t: c.thumbId, a: c.attribute || 0, d: c.darklight || 0, s: packStars(c.stars, owned), r: c.reconstructed ? 1 : 0,
    k: ti(c.track), u: c.uncertain ? 1 : 0, b: c.bgm || 0, v: c.variants.map((v) => [v.name, packStars(v.stars, owned)]) });
  const b = model.bgm.map(pack), a = model.art.map((s) => [s.artId, s.name, s.cards.map(pack)]);
  return { v: IMG_VERSION, k: tracks, b, a };
}
const DATA_RE = /<script id="kxdata" type="application\/json">([\s\S]*?)<\/script><script>[\s\S]*?<\/script>/;
// the page with its cards written out (tests)
function expandGallery(page) {
  const m = DATA_RE.exec(page);
  if (!m) return page;
  const html = kxBuild(JSON.parse(m[1]));
  return page.replace(m[0], '').replace(/(<div id="rows" data-tab="[a-z]+">)/, (x) => x + html);
}

// ES5, no external script. Rows read once; a tab and the Filters sheet only toggle a class; pictures load for shown rows only.
// A tap on a card opens its detail view (large picture, stars, variants, track and player); a tap on an artwork enlarges it.
const JS = `(function(){
var LAB={own:__OWN__,at:__AT__};
__MATCH__
function $(id){return document.getElementById(id);}
function attr(el,a){return el&&el.getAttribute?el.getAttribute(a):null;}
var rows=[].map.call(document.querySelectorAll('#rows .row'),function(el){return {el:el,t:attr(el,'data-tab'),o:attr(el,'data-own'),a:attr(el,'data-at'),ns:(attr(el,'data-name')||'').split(' | ')};});
var secs=[].map.call(document.querySelectorAll('#rows .sec'),function(el){return el;});
var cur={t:attr($('rows'),'data-tab'),own:'all',at:'all',q:''},dr=null;
function copy(s){return {t:s.t,own:s.own,at:s.at,q:s.q};}
function named(r,q){for(var i=0;i<r.ns.length;i++)if(khuxMatch(q,r.ns[i]))return true;return false;}
function match(r,s,anyTab){if(!anyTab&&r.t!==s.t)return false;if(s.own!=='all'&&r.o!==s.own)return false;if(s.at!=='all'&&r.a!==s.at)return false;return !s.q||named(r,s.q);}
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
// music of the detail view: one <audio>, started by the Play button (a tap: the WebView needs a gesture), stopped on close
var au=$('au'),playing=0;
function stop(){if(playing){try{au.pause();}catch(x){}}playing=0;var b=$('play');if(b){b.className='play';b.innerHTML='\\u25b6 Play the music';}}
au.onerror=function(){if(!au.getAttribute('src'))return;stop();$('amsg').textContent='Music not available on this server.';};
au.onplaying=function(){$('amsg').textContent='';};au.onwaiting=function(){$('amsg').textContent='Loading\\u2026';};
function detail(c){var a=KX_AT[c.a]||["",""],h='<img class="lg" src="/web/medals/img/v'+kxD.v+'/'+c.t+'-l.png" alt=""><h2>'+kxEsc(c.n)+'</h2>'
+'<div class="d">'+(a[1]?'<span class="'+a[0]+'">'+a[1]+'</span>':'')+(KX_DL[c.d]?' \\u00b7 '+KX_DL[c.d]:'')+'</div><div class="cps">'+kxStars(c.s)
+'<span class="s s-'+(kxOwn(c)?'own">Owned':'not">Not owned')+'</span>'+(c.r?' <span class="s s-rec">${RECON_TEXT}</span>':'')+'</div>';
if(c.k>=0)h+='<div class="tk">\\u266a '+kxEsc(kxD.k[c.k])+'</div>'+(c.u?'<div class="n">The sound file matched to this Medal is not verified.</div>':'');
if(c.b)h+='<button type="button" class="play" id="play" data-b="'+c.b+'">\\u25b6 Play the music</button><div id="amsg"></div><p class="mh">${MUSIC_HINT}</p>';
if(c.v.length){h+='<ul class="vl"><li><b>Variants with the same picture</b></li>';for(var j=0;j<c.v.length;j++)h+='<li>'+kxEsc(c.v[j][0])+' '+kxStars(c.v[j][1])+'<span class="s s-'+(kxVOwn(c.v[j])?'own">Owned':'not">Not owned')+'</span></li>';h+='</ul>';}
$('dbody').innerHTML=h;$('det').style.display='block';$('det').scrollTop=0;
var p=$('play');if(p)p.onclick=function(){if(playing){stop();return;}var u='/web/medals/bgm/v'+kxD.v+'/'+attr(p,'data-b')+'.ogg';if(au.getAttribute('src')!==u)au.setAttribute('src',u);
$('amsg').textContent='Loading\\u2026';try{var r=au.play();if(r&&r['catch'])r['catch'](function(x){stop();$('amsg').textContent=x&&x.name==='NotAllowedError'?'Tap Play again to start the music.':'Music not available on this server.';});}catch(x){}playing=1;p.className='play on';p.innerHTML='\\u25a0 Stop';};}
$('detx').onclick=function(){stop();$('det').style.display='none';};
$('rows').onclick=function(e){var t=e.target,b;while(t&&t!==this&&!attr(t,'data-big')&&!attr(t,'data-i'))t=t.parentNode;if(!t||t===this)return;
b=attr(t,'data-big');if(b){e.preventDefault();$('bigimg').setAttribute('src',b);$('bigname').textContent=attr(t,'data-title');$('big').style.display='block';return;}
detail(kxCards[+attr(t,'data-i')]);};
$('bigx').onclick=function(){$('big').style.display='none';$('bigimg').removeAttribute('src');};
render();
})();`;

// the Medal Gallery block of the Banner Catalog page (gacha.js catalogPage, above the GAME YEAR tabs): title, a short line,
// two previews (a BGM Medal, an artwork) and a button, in the catalogue's colours; the whole block is the link
const ENTRY_CSS = '.mgx{display:flex;align-items:center;gap:12px;margin:6px 0 12px;padding:10px 12px;border:2px solid #39a7cf;border-radius:12px;'
  + 'background:linear-gradient(100deg,#0d5f86,#083a5a 60%,#06283e);color:#fff;text-decoration:none;box-shadow:0 3px 8px rgba(0,0,0,.45)}'
  + '.mgx:active{background:#0b4466}.mgp{flex:0 0 auto;display:flex;align-items:flex-end;gap:4px}.mgp img{display:block;margin:0;max-width:none;border-radius:4px}'
  + '.mgp .ar{width:44px;height:66px;box-shadow:0 1px 4px rgba(0,0,0,.6)}.mgp .md{width:64px;height:64px}'
  + '.mgt{flex:1 1 auto;min-width:0;line-height:1.35}.mgt b{display:block;font-size:19px;color:#fff;letter-spacing:.5px}.mgt small{display:block;font-size:13.5px;color:#cfe4f0}'
  + '.mgb{flex:0 0 auto;border:0;color:#fff;background:linear-gradient(#f08a3a,#d4541c);border-radius:18px;padding:5px 14px;font:bold 15px sans-serif;box-shadow:0 2px 0 #8a3510;white-space:nowrap}';
const ENTRY_HREF = '/web/medals/gallery?from=catalog';
function entryHtml() {
  return `<a class="mgx" href="${ENTRY_HREF}"><span class="mgp"><img class="md" width="64" height="64" src="${medalImg(PREVIEW.thumbId)}" alt="">`
    + `<img class="ar" width="44" height="66" src="${artImg(PREVIEW.artId)}" alt=""></span>`
    + '<span class="mgt"><b>Medal Gallery</b><small>BGM Medals with their music and Full Art Medals, owned or not. An addition of this server.</small></span>'
    + '<span class="mgb">Open ›</span></a>';
}

// GET /web/medals/gallery[?tab=art][&from=catalog]. ctx: { owned: Set of base medalIds, tab, fromCatalog, groups, bgmJson }
function galleryPage(medals, ctx = {}) {
  const model = galleryModel(medals, ctx), owned = ctx.owned || new Set();
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
    + '<p class="n">Medals the Medal List cannot filter. Tap a Medal for its details. The Medal Gallery is an addition of this server.</p>'
    + `<div class="tabs" id="tabs">${TABS.map(tab).join('')}</div><div class="tabline"></div>`
    + `<p class="n" id="intro-bgm"${tab0 === 'bgm' ? '' : ' style="display:none"'}>Medals with their own music: it plays in the Medal's details and on the Home screen when the Medal is shared. Tap a Medal to hear it. Supernova versions play the track of their Medal (not original).</p>`
    + `<p class="n" id="intro-art"${tab0 === 'art' ? '' : ' style="display:none"'}>Medals with the <b>Art</b> button in their details, by artwork: tap an artwork to see it larger. Medals marked <b>${RECON_TEXT}</b> show an artwork their own picture is part of, although the original data gave them none.</p>`
    + `<div class="sum" id="sum"><span class="n1">${n} Medal${n === 1 ? '' : 's'}</span> · no filters</div>`
    + '<div id="none" class="none" style="display:none"></div>'
    + `<div id="rows" data-tab="${tab0}"></div>`
    + `<script id="kxdata" type="application/json">${data}</script><script>${BUILD_JS}\ndocument.getElementById("rows").innerHTML=kxBuild(JSON.parse(document.getElementById("kxdata").textContent));</script>`
    + '<div id="big" class="ovl" role="dialog" aria-label="Full artwork"><button type="button" class="x" id="bigx" aria-label="Close">✕</button><p class="n" id="bigname"></p><img id="bigimg" alt=""></div>'
    + '<div id="det" class="ovl" role="dialog" aria-label="Medal details"><button type="button" class="x" id="detx" aria-label="Close">✕</button><div id="dbody"></div></div>'
    + '<audio id="au" preload="none" loop></audio>'
    + '<div class="ov" id="dim"></div><div class="sheet" id="sheet" role="dialog" aria-label="Filters">'
    + '<div class="shd"><b>Filters</b><button type="button" class="x" id="fx" aria-label="Close">✕</button></div>'
    + '<h4>FIND</h4><div class="search"><input type="search" id="fq" placeholder="Medal name" autocomplete="off"></div>'
    + '<div class="hint">Matches the start of words in Medal names, variants included (e.g. Key Art, Xion, Stained).</div>'
    + `<h4>OWNED</h4><div class="opts" data-g="own">${opts(OWN_OPTS)}</div>`
    + `<h4>ATTRIBUTE</h4><div class="opts" data-g="at">${opts(ATTR_OPTS)}</div>`
    + `<div class="foot"><a href="#" class="reset" id="freset">Reset filters</a><button type="button" class="ok" id="fok">Show ${n} result${n === 1 ? '' : 's'}</button></div></div>`
    + (ctx.fromCatalog ? '<div class="bar"><a class="back" href="/web/gacha/catalog">BACK</a></div>' : '')
    + `<script>${js}</script></body></html>`;
}

module.exports = { IMG_VERSION, PREVIEW, ENTRY_CSS, ENTRY_HREF, entryHtml, mediaFile, imageFile, bgmUrl, galleryModel, galleryPage, expandGallery, pageData,
  ownedBases, medalImg, artImg, baseOf, khuxMatch, trackLookup, RECON_TEXT, UNVERIFIED_TEXT, MUSIC_HINT, BUILD_JS };
