// Spirit Blind Box WebView pages (03-11): Details of a pet plate (master detailUrl), Draw Odds (login link petOdds) and the
// Banner Catalog section with «Keep in the Shop» for past deals. Same style as the medal banner pages (gacha.page).
'use strict';
const { page, PIN_JS, esc } = require('./gacha');
const pd = require('./pet-draw');

const EXT_TEXT = 'Not original: once you own every part listed above, this deal also gives the Spirit parts that have no other way to be obtained in this restoration (the original game gave them in events not restored yet).';
const SOLD_OUT = 'You own every part of this deal.';

// ctx = {owned: Set, rows: petParts rows, elsewhere: Set, listedIds: Set, keepableOf(b), keptRowId, fromCatalog}
function partList(ids, names, owned) {
  return `<ul class="ml">${ids.map((id) => `<li>${owned.has(id) ? '✔ ' : ''}${esc(names.get(id) || id)}</li>`).join('')}</ul>`;
}

function keepButton(b, ctx) {
  if (!ctx.fromCatalog || !ctx.keepableOf(b)) return '';
  const kept = ctx.keptRowId === b.rowId;
  const url = kept ? '/web/gacha/unpinpet' : `/web/gacha/pinpet/${b.drawPetTypeId}`;
  return `<div class="pin"><a class="btn" id="pinbtn" href="#" data-pin="${url}" data-on="${kept ? 0 : 1}" `
    + `onclick="return khuxPin(this,document.getElementById('pinmsg'),function(){document.getElementById('pinbtn').style.display='none';})">${kept ? 'Remove from the Shop' : '📌 Keep in the Shop'}</a><div id="pinmsg" class="pinmsg"></div></div>`
    + `<script>${PIN_JS}</script>`;
}

function detailPage(b, ctx) {
  const names = new Map(ctx.rows.map((r) => [r.petPartsId, r.name]));
  const { ids, extended } = pd.candidates(b, ctx.owned, ctx.rows, ctx.elsewhere);
  const left = b.poolIds.filter((id) => !ctx.owned.has(id)).length;
  const state = ctx.listedIds.has(b.drawPetTypeId) ? '<span class="s s-now">In the Shop now</span>'
    : ctx.keptRowId === b.rowId ? '<span class="s s-pinned">Kept in the Shop</span>' : '<span class="s s-later">Not in the Shop now</span>';
  return page(b.name, `<img src="${pd.imgUrlOf(b.drawPetTypeId)}" alt="">${state}`
    + `<p class="n">${esc(b.start)} to ${esc(b.end)} (original notice ${b.notice})</p>`
    + `<h2>Price</h2><p><span class="y">${b.price} Jewels</span> per draw: 1 Spirit part.</p>`
    + '<p>Every time you draw, you get a part you do not own yet: no repeats.</p>'
    + keepButton(b, ctx)
    + `<h2>Spirit Parts (${b.poolIds.length}, ${left} not owned)</h2>${partList(b.poolIds, names, ctx.owned)}`
    + (b.missing.length ? `<p class="n">Also in the original deal, coming once their graphics are restored: ${esc(b.missing.join(', '))}.</p>` : '')
    + (b.extend === 'unobtainable' ? `<div class="why">${EXT_TEXT}${extended ? ` Parts left: ${ids.length}.` : ''}</div>` : '')
    + (!ids.length ? `<p class="k">${SOLD_OUT}</p>` : '')
    + '<p class="n">* Some Spirit parts shown as «Head» in the Outfit menu were listed as «Face» on the original draw odds page.</p>');
}

function oddsPage(list, ctx) {
  const body = list.map((b) => {
    const { ids, extended } = pd.candidates(b, ctx.owned, ctx.rows, ctx.elsewhere);
    const pct = ids.length ? Math.round(10000 / ids.length) / 100 : 0;
    return `<div class="b"><h3>${esc(b.name)}</h3>`
      + (ids.length ? `<p>Each of the ${ids.length} parts you do not own${extended ? ' (extension, not original)' : ''} has the same chance: <span class="y">${pct}%</span>.</p>` : `<p>${SOLD_OUT}</p>`)
      + '</div>';
  }).join('');
  return page('Draw Odds', body || '<p>No Spirit Blind Box in the Shop.</p>');
}

// Banner Catalog section (appended to the medal catalogue page)
function catalogSection(banners, ctx) {
  const rows = banners.map((b) => {
    const href = `/web/gacha/petdetail/${b.drawPetTypeId}?from=catalog`;
    const st = ctx.listedIds.has(b.drawPetTypeId) ? ['now', 'In the Shop now'] : ctx.keptRowId === b.rowId ? ['pinned', 'Kept in the Shop']
      : ctx.keepableOf(b) ? ['later', 'Past deal: can be kept in the Shop'] : ['locked', 'Unlocks with the Story'];
    return `<div class="b ${st[0]}"><a href="${href}"><img loading="lazy" src="${pd.imgUrlOf(b.drawPetTypeId)}" alt=""></a>`
      + `<a class="nm" href="${href}">${esc(b.name)}</a><div class="n">${esc(b.start)} to ${esc(b.end)} · ${b.price} Jewels per part</div>`
      + `<span class="s s-${st[0]}">${st[1]}</span></div>`;
  });
  return `<h2 id="spirit">Spirit Blind Box (${banners.length})</h2><p class="n">Spirit part deals: every draw gives a part you do not own.</p>${rows.join('')}`;
}

module.exports = { detailPage, oddsPage, catalogSection, EXT_TEXT };
