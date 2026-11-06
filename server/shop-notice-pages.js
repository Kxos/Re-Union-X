// Original notices of the Shop banners (make-shop-notices.js -> game_data/shop_notices.json, git-ignored SQUARE ENIX text).
// - detailSection(banner, doc, ctx): the «Original notice» part of a banner's Details page (gacha.js detailPage, ctx.noticeSection):
//   the notice title and date with a link to the notice page (and to the other notices that name the banner); without a notice,
//   a box that says plainly that the original notice has not been recovered and gives what is known (the community wiki's text
//   of the banner, the original banner art). doc null (file not generated on this machine): nothing.
// - noticePage(banner, doc, noticeId, ctx): GET /web/gacha/notice/<drawMedalTypeId>[?n=<noticeId>][&from=catalog]: the notice laid
//   out as the raid notices (raid-pages.js noticeBlocks: every sentence unchanged, only laid out), every section of it (a notice
//   often announced several deals), then the «On this server» box; BACK to the banner's Details. No notice: a friendly page.
'use strict';

const { page, esc } = require('./gacha');
const raidPages = require('./raid-pages');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => (/^\d{4}-\d\d-\d\d/.test(String(iso || '')) ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}` : '');
const CSS = '<style>' + raidPages.NOTICE_CSS + 'ul.ow{list-style:none;padding:0;margin:4px 0 10px}ul.ow li{padding:6px 0;border-bottom:1px solid #2f5d78}ul.ow a{color:#9fd4ff}'
  + '.why.off{border-color:#e8641c}.why .nw{color:#ffcd4a;font-weight:bold}.nt{font-weight:bold}h1+.dt{margin-top:0}</style>';
const CONFIDENCE = { low: 'This notice is related to the banner but may not describe this exact deal: no notice naming it was found.' };
const qs = (n, fromCatalog) => [n ? `n=${n}` : '', fromCatalog ? 'from=catalog' : ''].filter(Boolean).join('&');
const noticeHref = (b, n, fromCatalog) => { const q = qs(n, fromCatalog); return `/web/gacha/notice/${b.drawMedalTypeId}${q ? `?${q}` : ''}`; };

function detailSection(banner, doc, ctx = {}) {
  if (!doc || !doc.rows) return '';
  const hit = doc.rows[banner.rowId];
  const n = hit && doc.notices ? doc.notices[hit.noticeId] : null;
  if (n) {
    const alt = (hit.alt || []).filter((id) => doc.notices[id]);
    const altLinks = alt.map((id) => `<li><a href="${noticeHref(banner, id, ctx.fromCatalog)}">Also in: ${esc(doc.notices[id].title)} (${esc(day(doc.notices[id].date))}) ›</a></li>`).join('');
    return `<h2>Original notice</h2><p><span class="nt">${esc(n.title)}</span><br><span class="n">Published ${esc(day(n.date))} · original text, unchanged</span></p>`
      + (CONFIDENCE[hit.confidence] ? `<p class="n">${esc(CONFIDENCE[hit.confidence])}</p>` : '')
      + `<ul class="ow"><li><a href="${noticeHref(banner, null, ctx.fromCatalog)}">Read the original notice ›</a></li>${altLinks}</ul>`;
  }
  // no notice recovered (as the Japan-only raids): say it, and give what we know
  const known = [banner.notes ? `<p>${esc(banner.notes)}</p><p class="n">Text of the community wiki's Shop tables (khuxwiki), not the original notice.</p>` : '',
    banner.image ? '<p class="n">The banner picture at the top is the original art of this banner.</p>' : ''].join('');
  return `<h2>Original notice</h2><div class="why off"><p class="nw">The original notice of this banner has not been recovered.</p>`
    + '<p>It was searched for in the archived official notices of the worldwide game, on the official notice site and in archived copies of it: '
    + 'none names this banner.The details on this page come from the other surviving sources: '
    + 'the community wiki and the original banner art.</p>'
    + `${known}</div>`;
}

function missingPage(banner, ctx) {
  const back = banner ? `<div class="bar"><a class="back" href="/web/gacha/detail/${banner.drawMedalTypeId}${ctx.fromCatalog ? '?from=catalog' : ''}">BACK<span></span></a></div>` : '';
  return page('Notice not available', `${CSS}<p class="na">The original notice of this banner is not available on this server.</p>${back}`, back ? 'hb' : '');
}

function noticePage(banner, doc, noticeId, ctx = {}) {
  try {
    const hit = banner && doc && doc.rows ? doc.rows[banner.rowId] : null;
    const ids = hit ? [hit.noticeId, ...(hit.alt || [])] : [];
    const id = noticeId && ids.includes(Number(noticeId)) ? Number(noticeId) : hit ? hit.noticeId : null;
    const n = id !== null && doc.notices ? doc.notices[id] : null;
    if (!n || !Array.isArray(n.body)) return missingPage(banner, ctx);
    const { sections } = raidPages.parseNotice(n.body, []);
    const body = sections.map((s) => `<div class="ns">${s.head ? `<h2>${esc(s.head)}</h2>` : ''}${raidPages.noticeBlocks(s.lines)}</div>`).join('');
    const others = ids.filter((x) => x !== id && doc.notices[x]).map((x) => `<li><a href="${noticeHref(banner, x === hit.noticeId ? null : x, ctx.fromCatalog)}">${esc(doc.notices[x].title)} (${esc(day(doc.notices[x].date))}) ›</a></li>`).join('');
    const back = `<div class="bar"><a class="back" href="/web/gacha/detail/${banner.drawMedalTypeId}${ctx.fromCatalog ? '?from=catalog' : ''}">BACK<span></span></a></div>`;
    return page(n.title, `${CSS}<img src="/web/gacha/img/${banner.drawMedalTypeId}.png" alt="">`
      + `<p class="dt">${n.category ? `<span class="chip">${esc(n.category)}</span>` : ''}<span class="chip d">${esc(day(n.date))}${n.time ? ` · ${esc(n.time)} UTC` : ''}</span></p>`
      + (CONFIDENCE[hit.confidence] && id === hit.noticeId ? `<div class="why off">${esc(CONFIDENCE[hit.confidence])}</div>` : '')
      + body
      + '<div class="srv"><h2>On this server</h2><p>The text above is the original notice, unchanged (page boilerplate left out). '
      + `It may announce other deals or events of the same days too. This banner: «${esc(banner.name)}». This server follows your Story instead of the calendar: `
      + 'the dates in the notice are those of the original game, and the banner opens when your Story reaches them. Draw rates and Medals that this server '
      + 'reproduces are on the Details page.</p>'
      + `${others ? `<p>Other notices that name this banner:</p><ul class="ow">${others}</ul>` : ''}</div>${back}`, 'hb');
  } catch (e) {
    return missingPage(banner, ctx);
  }
}

module.exports = { detailSection, noticePage, noticeHref };
