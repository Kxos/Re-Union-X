#!/usr/bin/env node
// Required medals of Evolve from the khuxwiki (I-205). The client reads validEvolveNeed (how many) and
// evolveNeedId[5] (which ones) of the medal row; with validEvolveNeed 0 the five slots stay empty and
// Evolve only asks for munny. Original rows such as 301941 SN++ - KH III Terra -> 302008 carry
// validEvolve 1 + evolveId but validEvolveNeed 0 (the materials were set server side and are not in
// any dump), and the Roboloid rows (300000 + id) inherit the generic materials of the template medal
// they are copied from (make-game-tables.js). Sources on the medal pages of wiki_all.json:
// - «As of <date>, X can be evolved [into '''SN++ - Y'''] using one|two [[Fantasia Mickey B]] Medal(s).»
//   (the 2020-21 «Popular Medal Updates»; titles with «Illus.» are matched whole, no sentence split);
// - {{Evo|base=X N★|evo1=..|evo5=..|result=Y N★}} templates (combinations such as Hayner/Pence/Olette B
//   -> Hayner & Pence & Olette, self copies such as Hayner B 5★ -> 6★);
// - the «Evolving Puppy Medals» table of the Puppy page (puppyGroups): each 3★/4★/5★ row of a group evolves
//   with the other rows of its group (Puppy #1 + #2-#6 -> Puppy #1 - 6; Pongo + 3 Puppy 5★ + Perdita ->
//   101 Dalmatians); COMBOS is the 5★ group if the table cannot be read.
// Rules: rows that ALREADY evolve to the documented result get the wiki materials; a missing evolution is
// added (validEvolve 1 + evolveId) only for the results in ADD (user decision 23-10: Sora & Riku & Meow Wow,
// Sora & Donald & Goofy C, the Puppy steps, Blue Fairy LV n -> n+1) and only on rows that evolve nowhere
// (a row evolving elsewhere is reported, the client has one evolveId per row); evolveMoney stays the row's.
// Original SE rows (medalId < 300000) keep their materials unless they have none (differences are
// reported); boosted and cut-in alias copies (groupId = the row) follow their row.
// Idempotent; called by make-game-tables.js after the Blue Fairy rule, or in place:
//
//   node server/evolve-wiki.js [master folder] [wiki_all.json]      (then raise the master revision)
'use strict';

const fs = require('fs');
const path = require('path');

const FANTASIA_MICKEY_B = 300913;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 };
// 5★ -> 101 Dalmatians 6★: khuxwiki «Puppy», table «Evolving Puppy Medals» (5★ || 6★)
// missing evolutions that may be added, by the normalised result name
const ADD = /^(sora & riku & meow wow|sora & donald & goofy c|101 dalmatians|puppy #\d+ - \d+|blue fairy sa bonus lv [2-8])$/;
const COMBOS = [{
  result: ['101 Dalmatians', 6],
  members: [['Puppy #1 - 36', 5], ['Puppy #37 - 72', 5], ['Puppy #73 - 99', 5], ['Pongo', 5], ['Perdita', 5]],
}];

// names of the wiki and of the master compared without case, brackets/parentheses, «Ver.», spaces
const norm = (s) => String(s || '').toLowerCase().replace(/\{\{kh\|([^}|]*)(\|[^}]*)?\}\}/g, '$1')
  .replace(/[()[\]]/g, ' ').replace(/\bver\.\s*/g, '').replace(/\s+/g, ' ').trim();

// «As of ..., X can be evolved [into '''Y''[']] using N [[Fantasia Mickey B]] Medal(s)»
function fmbRules(wiki) {
  const re = /As of [A-Z][a-z]+ \d{1,2}, \d{4}, ([^\n]+?) can be evolved(?: into '''(.+?)'{2,3})? using (\w+) \[\[Fantasia Mickey B\]\] Medals?/g;
  const out = [];
  for (const [page, text] of Object.entries(wiki)) {
    for (const [, from, to, n] of String(text).matchAll(re)) {
      const count = WORDS[n.toLowerCase()] || Number(n);
      if (count >= 1 && count <= 5) out.push({ page, from: from.trim(), to: to ? to.trim() : null, n: count });
    }
  }
  return out;
}

// «Name N★» / «Name ★» (1★) -> [name, rare]
function starName(s) {
  const m = /^(.*?)\s*(\d)?★$/.exec(String(s).trim());
  return m ? [m[1].trim(), m[2] ? Number(m[2]) : 1] : null;
}

// «Evolving Puppy Medals» of the Puppy page: sub-tables «!3★||4★» with the member rows and a «|rowspan="n"|'''No.''': Result»
// cell next to the first member of each group -> [{from, to, result, n, members[]}]. The wiki has typos in the result
// names (835 «Puppy #30 - 36»): applyWikiEvolve resolves a Puppy range that is not in the master by its members.
function puppyGroups(wiki) {
  const text = String(wiki.Puppy || '');
  const at = text.indexOf('==Evolving Puppy Medals==');
  if (at < 0) return [];
  const out = [];
  for (const sub of text.slice(at).split(/\{\|\s*class="wikitable/).slice(1)) {
    const head = /!(\d)★\|\|(\d)★/.exec(sub);
    if (!head) continue;
    const [from, to] = [Number(head[1]), Number(head[2])];
    let last = null, group = null;
    for (const raw of sub.split('\n')) {
      const line = raw.trim();
      const span = /^\|\s*rowspan="(\d+)"\s*\|(.*)$/.exec(line);
      if (span) {
        const result = span[2].replace(/'''\d+''':\s*/, '').replace(/\[\[|\]\]/g, '').trim();
        group = { from, to, result, n: Number(span[1]), members: last ? [last] : [] };
        out.push(group);
        continue;
      }
      if (!/^\|[^-}!]/.test(line) || /^\|\s*(colspan|valign)/.test(line)) continue;
      const name = line.slice(1).replace(/\[\[|\]\]/g, '').trim();
      if (group && group.members.length < group.n) group.members.push(name);
      else last = name;
    }
  }
  return out.filter((g) => g.members.length === g.n && g.n >= 2 && g.n <= 6);
}

// {{Evo|base=..|evo1..5=..|result=..}} -> [{page, base, needs[], result}] (duplicates across pages once)
function evoTemplates(wiki) {
  const out = [];
  const seen = new Set();
  for (const [page, text] of Object.entries(wiki)) {
    for (const [tpl] of String(text).matchAll(/\{\{Evo\|[^}]*\}\}/g)) {
      const f = Object.fromEntries(tpl.slice(6, -2).split('|').map((p) => p.split('=')).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
      const base = starName(f.base), result = starName(f.result);
      const needs = [1, 2, 3, 4, 5].map((i) => f['evo' + i]).filter(Boolean).map(starName);
      if (!base || !result || needs.some((x) => !x)) continue;
      const key = JSON.stringify([base, needs, result]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page, base, needs, result });
    }
  }
  const puppies = puppyGroups(wiki).map((g) => ({ page: 'Puppy', result: [g.result, g.to], members: g.members.map((m) => [m, g.from]) }));
  const groups = puppies.some((g) => g.result[1] === 6) ? puppies : [...puppies, ...COMBOS.map((c) => ({ ...c, page: 'Puppy (COMBOS)' }))];
  for (const c of groups) {
    for (const b of c.members) out.push({ page: c.page, base: b, needs: c.members.filter((x) => x !== b), result: c.result });
  }
  return out;
}

// apply on the medal rows (in place). -> { changes: [{id, name, kind, before, after}], report: [...] }
function applyWikiEvolve(medals, wiki) {
  const byId = new Map(medals.map((r) => [r.medalId, r]));
  const normals = medals.filter((r) => r.medalId < 1000000 && !r.groupId);
  const byName = new Map();
  for (const r of normals) {
    const k = `${norm(r.name)}|${r.rare}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(r);
  }
  const changes = [], report = [];
  const fields = (r) => ({ validEvolve: r.validEvolve, evolveId: r.evolveId, validEvolveNeed: r.validEvolveNeed, evolveNeedId: [...r.evolveNeedId] });
  const setNeed = (row, ids, kind, src) => {
    const want = Array.from({ length: 5 }, (_, i) => ids[i] || 0);
    if (row.validEvolveNeed === ids.length && row.evolveNeedId.every((v, i) => v === want[i])) return;
    const before = fields(row);
    Object.assign(row, { validEvolveNeed: ids.length, evolveNeedId: want });
    changes.push({ id: row.medalId, name: row.name, kind, src, before, after: fields(row) });
  };

  // 1. Fantasia Mickey B upgrades
  if (byId.has(FANTASIA_MICKEY_B)) {
    for (const r of fmbRules(wiki)) {
      const evolving = normals.filter((m) => m.validEvolve && byId.get(m.evolveId));
      let cand = r.to ? evolving.filter((m) => norm(byId.get(m.evolveId).name) === norm(r.to)) : [];
      if (cand.length > 1) cand = cand.filter((m) => norm(m.name) === norm(r.from));
      // «SN++ - KH III Terra can be evolved using one ...»: the evolvable row of that name (301941, not 302008)
      if (!cand.length) cand = evolving.filter((m) => norm(m.name) === norm(r.from));
      if (cand.length !== 1) { report.push({ kind: 'fmb', page: r.page, rule: r, why: cand.length ? 'ambiguous' : 'no evolving row in the master' }); continue; }
      setNeed(cand[0], Array(r.n).fill(FANTASIA_MICKEY_B), 'fmb', r.page);
    }
  }

  // 2. {{Evo}} templates and the Puppy table
  const find = ([name, rare]) => byName.get(`${norm(name)}|${rare}`) || [];
  // «Puppy #a - b» of the wiki missing from the master (typo): the Puppy range row of that rarity holding every member
  const nums = (name) => { const m = /^Puppy #(\d+)(?: - (\d+))?$/.exec(name); return m ? [Number(m[1]), Number(m[2] || m[1])] : null; };
  const fixedNames = new Set();
  const findResult = (t) => {
    const direct = find(t.result);
    if (direct.length || !nums(t.result[0])) return direct;
    const want = [t.base, ...t.needs].map(([n]) => nums(n));
    if (want.some((x) => !x)) return [];
    const lo = Math.min(...want.map((x) => x[0])), hi = Math.max(...want.map((x) => x[1]));
    const hit = normals.filter((m) => { const r = m.rare === t.result[1] && nums(m.name); return r && r[0] <= lo && hi <= r[1]; });
    if (hit.length === 1) fixedNames.add(`${t.result[0]} -> ${hit[0].name}`);
    return hit.length === 1 ? hit : [];
  };
  const added = new Map();   // medalId -> fields before the evolution was added
  for (const t of evoTemplates(wiki)) {
    const resultRows = findResult(t);
    const results = new Set(resultRows.map((m) => m.medalId));
    const bases = find(t.base).filter((m) => m.validEvolve && results.has(m.evolveId));
    if (!bases.length && find(t.base).length && results.size === 1 && ADD.test(norm(t.result[0]))) {
      const to = resultRows[0].medalId;
      for (const m of find(t.base)) {
        if (m.validEvolve || m.evolveId) { report.push({ kind: 'evo', page: t.page, rule: t, id: m.medalId, why: `already evolves into ${m.evolveId} (one evolveId per row: not added)` }); continue; }
        added.set(m.medalId, fields(m));
        Object.assign(m, { validEvolve: 1, evolveId: to });
        bases.push(m);
      }
    }
    if (!bases.length) {
      if (find(t.base).length && results.size) report.push({ kind: 'evo', page: t.page, rule: t, why: 'the master has no such evolution (not added)' });
      else report.push({ kind: 'evo', page: t.page, rule: t, why: 'medal not in the master' });
      continue;
    }
    const ids = t.needs.map((n) => {
      const c = find(n);
      // a copy of the base itself: the base row; otherwise the first row of that name and rarity
      return (c.find((m) => bases.includes(m)) || c[0] || {}).medalId;
    });
    if (ids.some((x) => !x)) {
      report.push({ kind: 'evo', page: t.page, rule: t, why: 'required medal not in the master' });
      for (const b of bases) if (added.has(b.medalId)) { Object.assign(b, added.get(b.medalId)); added.delete(b.medalId); }
      continue;
    }
    for (const b of bases) {
      const own = ids.map((id) => (find(t.base).some((m) => m.medalId === id) ? b.medalId : id));
      const want = Array.from({ length: 5 }, (_, i) => own[i] || 0);
      // same medals in another order count as the same (the client lists them as they come)
      const sorted = (a) => a.slice().sort((x, y) => x - y).join(',');
      const same = b.validEvolveNeed === own.length && sorted(b.evolveNeedId) === sorted(want);
      if (b.medalId < 300000 && b.validEvolveNeed && !same) {
        report.push({ kind: 'evo', page: t.page, rule: t, id: b.medalId, why: 'original SE materials differ from the wiki (kept)', ours: fields(b), wiki: want });
        continue;
      }
      if (added.has(b.medalId)) {
        Object.assign(b, { validEvolveNeed: own.length, evolveNeedId: want });
        changes.push({ id: b.medalId, name: b.name, kind: 'add', src: t.page, before: added.get(b.medalId), after: fields(b) });
        added.delete(b.medalId);
      } else if (!same) setNeed(b, own, 'evo', t.page);
    }
  }
  for (const x of fixedNames) report.push({ kind: 'evo', page: 'Puppy', rule: { base: x }, why: 'wiki result name not in the master, resolved by its members' });

  // 3. copies that follow their row: boosted (1/2/3xxxxxx) and cut-in aliases (groupId = the row)
  const fixed = new Map(changes.map((c) => [c.id, byId.get(c.id)]));
  for (const r of medals) {
    const b = r.groupId && fixed.get(r.groupId);
    // an added evolution also reaches the copies that evolve nowhere
    const adds = b && !r.validEvolve && !r.evolveId && changes.some((c) => c.id === b.medalId && c.kind === 'add');
    if (!b || (r.evolveId !== b.evolveId && !adds)) continue;
    if (!adds && r.validEvolveNeed === b.validEvolveNeed && r.evolveNeedId.every((v, i) => v === b.evolveNeedId[i])) continue;
    const before = fields(r);
    Object.assign(r, { validEvolve: b.validEvolve, evolveId: b.evolveId, validEvolveNeed: b.validEvolveNeed, evolveNeedId: [...b.evolveNeedId] });
    changes.push({ id: r.medalId, name: r.name, kind: 'copy', src: String(b.medalId), before, after: fields(r) });
  }
  return { changes, report };
}

// rows that still evolve with no required medal (base rows only)
const stillEmpty = (medals) => medals.filter((r) => r.medalId < 1000000 && !r.groupId && r.validEvolve && r.evolveId && !r.validEvolveNeed);

module.exports = { FANTASIA_MICKEY_B, ADD, COMBOS, norm, fmbRules, puppyGroups, evoTemplates, applyWikiEvolve, stillEmpty };

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  const wikiFile = process.argv[3] || process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json';
  const file = path.join(dir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const wiki = JSON.parse(fs.readFileSync(wikiFile, 'utf8'));
  const { changes, report } = applyWikiEvolve(medals, wiki);
  const kinds = changes.reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] || 0) + 1 }), {});
  for (const c of changes) console.log(`${c.kind}\t${c.id}\t${c.name}\t${c.after.evolveId}\t${c.before.validEvolveNeed}:${c.before.evolveNeedId.join(',')} -> ${c.after.validEvolveNeed}:${c.after.evolveNeedId.join(',')}`);
  for (const r of report) console.log(`REPORT ${r.kind}\t${r.page}\t${r.id || ''}\t${r.why}\t${JSON.stringify(r.rule.base || r.rule.from)} -> ${JSON.stringify(r.rule.result || r.rule.to || '')}${r.wiki ? '\twiki ' + r.wiki.join(',') + ' ours ' + r.ours.evolveNeedId.join(',') : ''}`);
  for (const r of stillEmpty(medals)) console.log(`EMPTY\t${r.medalId}\t${r.name} -> ${r.evolveId}`);
  console.log(`changed rows: ${changes.length} ${JSON.stringify(kinds)}`);
  if (changes.length && !process.env.DRY_RUN) fs.writeFileSync(file, JSON.stringify(medals));
}
