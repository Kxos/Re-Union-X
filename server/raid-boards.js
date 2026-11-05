// Raid Boards: master rows sphere / sphereArray / sphereMasu of type 5 (paid in raidSpherePoint) for the Weekly and Radiant
// census rows (plan docs/superpowers/plans/2026-11-02-raids-part2.md Task 7, client facts docs/notes/bacheche.md «Raid Boards»).
// Input: the private board list (raid_rewards/a_weekly/boards_weekly.json: {boards: [{id, name, cells: [{n, cost, kind, reward,
// qty}], completion_reward, title}], weeks: [{census_id, family, boards: [{board}]}]}) and the board corrections of
// raid_rewards/CORRECTIONS.md, both read by make-raid.js; never copied into the repository.
// - One board set per census row (the week): every tier shares it, and two weeks with the same layout get their own ids, so each
//   raid keeps its own progress. Ids: raid_ids.json `boards` {"<censusId>/<boardKey>": n}, sphereBoardId = arryId = masuId =
//   3000000 + n, append-only like the other raid ids.
// - Cells in the wiki's order n along one path from START (the order of purchase is not documented: plan, builder's call), on
//   the 5 x 9 grid of the client: nodes on cells with (row + column) even, path pieces between them.
// - Every reward name is matched against the master tables (medal, material, petParts, avatarParts, title). A name with no
//   item stops the build with the list, unless raid_config.json `boards.unmatched` declares it: then its cell is left off the
//   board and reported. No item is ever invented.
'use strict';

const BOARD_BASE = 3000000, BOARD_MAX = 3999999, TYPE = 5;
const NODES = 22, MASU = 23, COMPLETION = 22; // nodes 1..22; index 22 of sphereMasu = completion reward (crash with 0)
const FAMILIES = new Set(['weekly', 'radiant reward']); // the 130 rows; make-raid.js adds the pre-series and event families (Task 10, families option)
const SEL = { jewel: 2, medal: 3, material: 5, title: 7, pet: 33, drawTicket: 41 }; // rewardSelect = item type of grantItem
const PARTS_SEL = { 2: 23, 3: 19, 7: 20 }; // avatarParts.partsType -> rewardSelect (clothes, hairstyle, accessory)
// Draw Ticket and the seasonal currencies (rewardSelect 41): rewardId = index in gacha.js TICKET_CURRENCIES (gacha.ticketCurrency).
// The original had one currency renamed by the event, always rewardId 0; ours are separate wallets (docs/notes/shop.md).
const TICKETS = { 'draw ticket': 0, 'holiday draw ticket': 1, 'spooky cookie': 2, 'moogle points': 3, 'moogle point': 3 };
// Board names that the wiki writes differently from the item (raid_config.json boards.aliases:
// {"<wiki name>": {"item": "<name matched instead>", "why": "..."}}); the week gets the label boardAlias.
const START = '2015-01-01 00:00:00', END = '2099-12-31 23:59:59';
const MASU_KEYS = ['spherePoint', 'rewardSelect', 'medalCategory', 'rewardId', 'rewardExpand', 'rewardExpandId', 'rewardValue', 'burstUpperNumber'];
const PIECE = { UD: 1001, LR: 1002, UL: 1003, UR: 1004, DL: 1005, DR: 1006 };
const STARTCELL = 1000;

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[:,.'’!]/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = (s) => parseInt(String(s ?? '').replace(/,/g, ''), 10) || 0;

// The path: rows left to right, then right to left (a snake), START in the top-left corner. Cells along it alternate between
// node (even) and piece (odd), so the n-th node is at index 2n.
function snake() {
  const cells = [];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 9; k++) cells.push([r, r % 2 ? 8 - k : k]);
  return cells;
}
const SNAKE = snake();
const side = ([r, c], [r2, c2]) => (r2 < r ? 'U' : r2 > r ? 'D' : c2 < c ? 'L' : 'R');
const pieceOf = (a, b) => { const s = new Set([a, b]); return ['UD', 'LR', 'UL', 'UR', 'DL', 'DR'].find((p) => s.has(p[0]) && s.has(p[1])); };

// sphereArray row of a board with n nodes: node k (1-based) = masu index k - 1.
function gridRow(arryId, n) {
  if (n < 1 || n > NODES) throw new Error(`raid boards: a board of ${n} cells does not fit the grid (1-${NODES})`);
  const grid = Array.from({ length: 5 }, () => Array(9).fill(0));
  for (let i = 0; i <= 2 * n; i++) {
    const [r, c] = SNAKE[i];
    if (i === 0) grid[r][c] = STARTCELL;
    else if (i % 2 === 0) grid[r][c] = i / 2;
    else grid[r][c] = PIECE[pieceOf(side(SNAKE[i], SNAKE[i - 1]), side(SNAKE[i], SNAKE[i + 1]))];
  }
  return { arryId, spCol4: grid[4], spCol3: grid[3], spCol2: grid[2], spCol1: grid[1], spCol0: grid[0] };
}

// Name -> item. Medals by rarity and name: a row whose groupId points at another row is a copy of it and does not count.
function itemIndex(master) {
  const by = (rows, key) => {
    const m = new Map();
    for (const r of rows || []) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  return {
    medal: by((master.medal || []).filter((r) => !r.groupId || r.groupId === r.medalId), (r) => `${r.rare}|${norm(r.name)}`),
    // boosted rows (medal-boost.js: a separate row, groupId = the normal medal) by normal id and bonus: `<groupId>:<STR>:<DEF>`
    boosted: (() => {
      const base = new Map((master.medal || []).map((r) => [r.medalId, r]));
      return by((master.medal || []).filter((r) => r.groupId && r.groupId !== r.medalId && base.has(r.groupId)),
        (r) => `${r.groupId}:${r.attack - base.get(r.groupId).attack}:${r.defense - base.get(r.groupId).defense}`);
    })(),
    material: by(master.material, (r) => norm(r.name)),
    pet: by(master.petParts, (r) => norm(r.name)),
    avatar: by(master.avatarParts, (r) => `${r.gender}|${norm(r.name)}`),
    title: by(master.title, (r) => norm(r.title)),
  };
}
const one = (list, what) => {
  if (!list || !list.length) return null;
  if (list.length > 1) return { why: `${what}: ${list.length} rows match` };
  return list[0];
};

// {sel, id, value} or {why}
const BOARD_BOOST = { str: 1000, def: 0 };
function matchReward(idx, kind, name, qty) {
  const k = norm(kind), value = qty || 1;
  if (k === 'jewel') return { sel: SEL.jewel, id: 0, value };
  if (TICKETS[norm(name)] !== undefined) return { sel: SEL.drawTicket, id: TICKETS[norm(name)], value };
  if (k === 'medal') {
    // «6★ Trickmaster (Boosted)»: the boosted row of that medal with the bonus the raid notices give: +1,000 base Strength only
    // (notices 33888 and 34680, khuxwiki; docs/notes/raid.md «Boosted medals on the boards»)
    const bm = /^(\d+)\s*★\s*(.+?)\s*\(Boosted\)\s*$/i.exec(String(name).trim());
    if (bm) {
      const base = one(idx.medal.get(`${bm[1]}|${norm(bm[2])}`), 'medal');
      if (!base) return { why: 'no medal of that name and rarity' };
      if (base.why) return base;
      const hit = one(idx.boosted && idx.boosted.get(`${base.medalId}:${BOARD_BOOST.str}:${BOARD_BOOST.def}`), 'boosted medal');
      return !hit ? { why: `no boosted row (+${BOARD_BOOST.str} STR, +${BOARD_BOOST.def} DEF) of that medal` } : hit.why ? hit : { sel: SEL.medal, id: hit.medalId, value };
    }
    const m = /^(\d+)\s*★\s*(.+)$/.exec(String(name).trim());
    const r = m && one(idx.medal.get(`${m[1]}|${norm(m[2])}`), 'medal');
    return !r ? { why: 'no medal of that name and rarity' } : r.why ? r : { sel: SEL.medal, id: r.medalId, value };
  }
  if (k === 'material') {
    const r = one(idx.material.get(norm(name)), 'material');
    return !r ? { why: 'no material of that name' } : r.why ? r : { sel: SEL.material, id: r.materialId, value };
  }
  if (k === 'pet') {
    const r = one(idx.pet.get(norm(name)), 'Spirit part');
    return !r ? { why: 'no Spirit part of that name' } : r.why ? r : { sel: SEL.pet, id: r.petPartsId, value: 1 };
  }
  if (k === 'avatar') {
    const m = /^(.+?)\s*\((male|female|♂|♀)\)\s*$/i.exec(String(name).trim());
    if (!m) return { why: 'avatar part without a gender' };
    const g = /^(male|♂)$/i.test(m[2]) ? 1 : 2;
    const r = one(idx.avatar.get(`${g}|${norm(m[1])}`), 'avatar part');
    if (!r) return { why: 'no avatar part of that name and gender' };
    if (r.why) return r;
    if (!PARTS_SEL[r.partsType]) return { why: `avatar part type ${r.partsType} has no reward code` };
    return { sel: PARTS_SEL[r.partsType], id: r.avatarPartsId, value: 1 };
  }
  if (k === 'title') {
    const r = one(idx.title.get(norm(name)), 'title');
    return !r ? { why: 'no title of that name' } : r.why ? r : { sel: SEL.title, id: r.titleId, value: 1 };
  }
  return { why: `no item type for the kind ${kind}` };
}

// Completion reward (index 22): the board's title, else its completion reward (a medal, else a material).
function matchCompletion(idx, board) {
  const title = board.title && (board.title.value || board.title);
  if (title) return { name: String(title), ...matchReward(idx, 'title', String(title)) };
  const v = board.completion_reward && (board.completion_reward.value ?? board.completion_reward);
  if (!v) return { name: null, why: 'no completion reward' };
  const name = Array.isArray(v) ? v[1] : String(v);
  const qty = board.completion_qty || 1;
  if (/★/.test(name)) return { name, ...matchReward(idx, 'medal', name, qty) };
  const mat = matchReward(idx, 'material', name, qty);
  return { name, ...(mat.why ? matchReward(idx, 'medal', name, qty) : mat) };
}

// CORRECTIONS.md, section «Boards»: «<Board name>, cell <n>: wiki <a>, ... need <b>» -> cost fixes
function parseBoardCorrections(md) {
  const out = [];
  const text = String(md || '');
  const sec = text.split(/^## /m).find((s) => /^Boards\b/.test(s)) || '';
  for (const m of sec.matchAll(/^- (.+?), cell (\d+): wiki ([\d,]+),[^\n]*?need ([\d,]+)/gm)) out.push({ board: m[1], n: num(m[2]), from: num(m[3]), to: num(m[4]) });
  return out;
}

// Cells of a board, in either source shape: the weekly list ({n, cost, kind, reward, qty}) or an event board that names its
// original 2016 table as the best source (best_cells «original_table.cells»: slots in table order, the table rules over the
// wiki, CORRECTIONS.md). Cost corrections apply on top; each corrected cell carries `corrected`.
function cellsOf(board, fixes = []) {
  let cells;
  if (board.best_cells === 'original_table.cells' && board.original_table && Array.isArray(board.original_table.cells)) {
    cells = [...board.original_table.cells].sort((a, b) => a.slot - b.slot)
      .map((c, i) => ({ n: i + 1, cost: c.cost, kind: c.type, reward: c.reward, qty: c.qty || 1, source: 'original table' }));
  } else {
    cells = [...(board.cells || [])].sort((a, b) => a.n - b.n).map((c) => ({ ...c, kind: c.kind || c.type }));
  }
  // an event board often writes the amount in the reward name («100 Jewels», «Draw Ticket x 10») with no qty: read it there
  // (user 04-11: Jewels & Mirrors paid 1 Jewel a cell instead of 100). Medals («6★ Chip») are never amounts.
  for (const c of cells) {
    if (c.qty || norm(c.kind) === 'medal') continue;
    const m = /^\s*([\d,]+)\s+(?!★)(.+)$/.exec(String(c.reward)) || /^(.+?)\s*[x×]\s*([\d,]+)\s*$/.exec(String(c.reward));
    if (!m) continue;
    const [n, name] = /^\s*[\d,]/.test(String(c.reward)) ? [m[1], m[2]] : [m[2], m[1]];
    c.qty = num(n);
    if (norm(c.kind) !== 'jewel') c.reward = name.trim();
  }
  for (const f of fixes) {
    if (slug(f.board) !== board.id && norm(f.board) !== norm(board.name)) continue;
    const c = cells.find((x) => x.n === f.n);
    if (c && c.cost === f.from) Object.assign(c, { cost: f.to, corrected: `cost ${f.from} -> ${f.to} (CORRECTIONS.md, inferred)` });
  }
  return cells;
}

// ids: copy of ids.boards with a number for every board of every Weekly / Radiant row (whatever the filter)
function allocateBoardIds(doc, ids, families = FAMILIES) {
  const boards = { ...((ids || {}).boards || {}) };
  const seen = new Map();
  for (const [k, v] of Object.entries(boards)) {
    if (!Number.isInteger(v) || v < 1 || v > BOARD_MAX - BOARD_BASE) throw new Error(`raid: raid_ids.json: board ${k} has number ${v}, outside 1-${BOARD_MAX - BOARD_BASE}`);
    if (seen.has(v)) throw new Error(`raid: raid_ids.json: board number ${v} repeats (${seen.get(v)}, ${k})`);
    seen.set(v, k);
  }
  let next = Math.max(0, ...Object.values(boards)) + 1;
  for (const w of weeksOf(doc, families)) {
    for (const b of w.boards || []) {
      const key = `${w.census_id}/${b.board}`;
      if (!(key in boards)) boards[key] = next++;
    }
  }
  return boards;
}
// 2019-10-14 -> 10/14/19 (the date added to a Raid Board title)
function usDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) throw new Error(`raid boards: no start date for the week ${iso}`);
  return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}`;
}
const weeksOf = (doc, families = FAMILIES) => ((doc || {}).weeks || []).filter((w) => families.has(w.family));

// Rows of the boards of the census rows in `censusIds` (null: all). Returns {sphereRows, arrayRows, masuRows, byCensus,
// labels (census id -> reconstructed labels: boardPath, boardSet, boardCost, boardCells), boardIds,
// report: {unmatched: [{board, n, kind, reward, why, weeks}], corrected: [...], dropped: [board ids with no cell left], bytes}}. Throws on a name that matches
// no item and is not declared in config.unmatched (with the whole list), and on a completion reward that matches nothing.
function buildBoards({ doc, correctionsMd, master, ids, config = {}, censusIds = null, families = FAMILIES }) {
  const boardIds = allocateBoardIds(doc, ids, families);
  const idx = itemIndex(master);
  const fixes = parseBoardCorrections(correctionsMd);
  const declared = config.unmatched || {};
  const aliases = config.aliases || {};
  const texture = new Set(config.reconstructedTexture || []); // rewards drawn with a reconstructed texture: label boardTexture
  const layouts = new Map((doc.boards || []).map((b) => [b.id, b]));
  // card: sphere.boardId = img/sphere_board/Board_%04d (background), img/sphere_incentive/<sphereBoardId>.png on top (config.art)
  const background = config.background || 1;
  const artOf = (key) => {
    const a = (config.art || {})[key];
    if (!a) return null;
    if (a.jp) return { jp: a.jp };
    if (a.screenshot) return { screenshot: a.screenshot };
    throw new Error(`raid boards: boards.art.${key} needs jp or screenshot`);
  };
  const out = { sphereRows: [], arrayRows: [], masuRows: [], art: [], byCensus: {}, labels: {}, boardIds, report: { unmatched: [], corrected: [], dropped: [], bytes: 0 } };
  const unknown = new Map(), unmatched = new Map(), built = new Map();

  // one resolved layout per board id: cells with their items, dropped cells, completion
  const resolve = (b) => {
    if (built.has(b.id)) return built.get(b.id);
    const cells = [], dropped = [];
    for (const c of cellsOf(b, fixes)) {
      const alias = aliases[c.reward] && aliases[c.reward].item;
      const m = matchReward(idx, c.kind, alias || c.reward, num(c.qty) || 1);
      if (!m.why) { cells.push({ ...c, item: m, ...(alias ? { alias } : {}) }); continue; }
      const why = declared[c.reward];
      if (why) dropped.push({ board: b.id, n: c.n, kind: c.kind, reward: c.reward, why });
      else unknown.set(`${c.kind}|${c.reward}`, `${c.kind} «${c.reward}» (${b.id} cell ${c.n}): ${m.why}`);
    }
    const done = matchCompletion(idx, b);
    if (done.why) unknown.set(`completion|${b.id}`, `completion of ${b.id} «${done.name}»: ${done.why}`);
    const r = { board: b, cells, dropped, done };
    built.set(b.id, r);
    return r;
  };

  for (const w of weeksOf(doc, families)) {
    for (const ref of w.boards || []) {
      const b = layouts.get(ref.board);
      if (!b) { unknown.set(`board|${ref.board}`, `${w.census_id}: board ${ref.board} is not in the board list`); continue; }
      resolve(b);
    }
  }
  if (unknown.size) throw new Error(`raid boards: reward names with no item (match them, or declare them in boards.unmatched of raid_config.json):\n  ${[...unknown.values()].join('\n  ')}`);

  for (const w of weeksOf(doc, families)) {
    if (censusIds && !censusIds.has(w.census_id)) continue;
    const list = [], labels = new Set();
    const weekDate = usDate(w.start || String(w.census_id).replace(/^WW-[A-Z0-9]+-/, ''));
    for (const ref of w.boards || []) {
      const r = built.get(ref.board);
      if (/inferred/i.test(ref.confidence || '')) labels.add('boardSet');
      if (r.cells.some((c) => c.corrected)) labels.add('boardCost');
      if (r.dropped.length) labels.add('boardCells');
      if (r.cells.some((c) => c.alias)) labels.add('boardAlias');
      if (r.cells.some((c) => texture.has(c.reward))) labels.add('boardTexture');
      for (const d of r.dropped) {
        const k = `${d.board}/${d.n}`;
        if (!unmatched.has(k)) unmatched.set(k, { ...d, weeks: 0 });
        unmatched.get(k).weeks++;
      }
      if (!r.cells.length) { if (!out.report.dropped.includes(r.board.id)) out.report.dropped.push(r.board.id); continue; } // every cell unmatched: no board
      const id = BOARD_BASE + boardIds[`${w.census_id}/${ref.board}`];
      for (const c of r.cells) {
        if (c.corrected && !out.report.corrected.some((x) => x.board === r.board.id && x.n === c.n)) out.report.corrected.push({ board: r.board.id, n: c.n, what: c.corrected });
      }
      // the original title (two boards of one week may share it, «Enhancement Board» twice in the 2019 screenshots: the card
      // picture tells them apart, config.art) + the week's start date, ours (user 3 Nov 2026: a kept raid's boards beside the
      // current week's). M/D/YY fits the title widgets: the longest, «JP 5th Anniv. Entry Medal Board 10/14/19», measures
      // about 520 px at 26 pt (list title bar 540) and 440 px at 22 pt (board screen title, 448 px since make_layouts 3 Nov).
      const boardName = `${String(r.board.name)} ${weekDate}`.slice(0, 128);
      // artFrom: a board standing in for an unknown one (Japan-only raids, make-raid.js) shows its donor board's card picture
      // (board = the key whose picture is used: a screenshot card is a file named by that key, artLines)
      const ownArt = artOf(r.board.id), art = ownArt || (r.board.artFrom ? artOf(r.board.artFrom) : null);
      if (!art) labels.add('boardNoArt');
      else if (art.screenshot) labels.add('boardArt');
      if (art) out.art.push({ sphereBoardId: id, board: ownArt ? r.board.id : r.board.artFrom, ...art });
      out.sphereRows.push({ sphereBoardId: id, boardName, kindId: 0, boardId: background, arryId: id, masuId: id, type: TYPE, openId: 0, openParam: 0, price: 0, detailUrl: '',
        startDatetime: START, endDatetime: END });
      out.arrayRows.push(gridRow(id, r.cells.length));
      const masu = { masuId: id, sphereBoardId: id };
      for (const key of MASU_KEYS) masu[key] = Array(MASU).fill(0);
      r.cells.forEach((c, i) => {
        masu.spherePoint[i] = num(c.cost);
        masu.rewardSelect[i] = c.item.sel;
        masu.rewardId[i] = c.item.id;
        masu.rewardValue[i] = c.item.value;
      });
      masu.rewardSelect[COMPLETION] = r.done.sel;
      masu.rewardId[COMPLETION] = r.done.id;
      masu.rewardValue[COMPLETION] = r.done.value || 1;
      out.masuRows.push(masu);
      list.push(id);
    }
    out.byCensus[w.census_id] = list;
    if (list.length) labels.add('boardPath');
    out.labels[w.census_id] = [...labels].sort();
  }
  out.report.unmatched = [...unmatched.values()];
  out.report.bytes = ['sphereRows', 'arrayRows', 'masuRows'].reduce((n, k) => n + out[k].reduce((m, r) => m + Buffer.byteLength(JSON.stringify(r)) + 1, 0), 0);
  return out;
}

// Lines of the list read by recon/tools/import_originals.py (destination, source, path): the card picture of every Raid Board
// under its own id. jp: the JP 4.3.1 file of the same art; screenshot: the card cut from a screenshot of the original game by
// recon/tools/raid_board_screens.py into the --loc folder (img/sphere_incentive_ww/<board key>.png, «:» of an event key as «_»:
// Windows file names have no colon).
function artLines(art) {
  const head = ['# Raid Board card pictures, written by server/make-raid.js from raid_config.json boards.art (docs/notes/bacheche.md «Raid Boards»).',
    '# Columns as in originals.tsv. jp = the JP 4.3.1 picture of the same board art; loc = cut from a screenshot of the original game.'];
  const line = (a) => [`img/sphere_incentive/${a.sphereBoardId}.png`, a.jp ? 'jp' : 'loc', a.jp || `=img/sphere_incentive_ww/${String(a.board).replace(/:/g, '_')}.png`].join('\t');
  return [...head, ...art.map(line)].join('\n') + '\n';
}

module.exports = { norm, artLines, usDate, buildBoards, cellsOf, gridRow, matchReward, itemIndex, parseBoardCorrections, allocateBoardIds, BOARD_BASE, BOARD_MAX, TYPE, NODES, COMPLETION, PIECE, STARTCELL };
