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
// - COMBOS: the «Evolving Puppy Medals» table of the Puppy page (5★ -> 101 Dalmatians).
// Rules: only rows that ALREADY evolve to the documented result are changed (no new evolutions);
// original SE rows (medalId < 300000) keep their materials unless they have none (differences are
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
  for (const c of COMBOS) {
    for (const b of c.members) out.push({ page: 'Puppy (COMBOS)', base: b, needs: c.members.filter((x) => x !== b), result: c.result });
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

  // 2. {{Evo}} templates and COMBOS
  const find = ([name, rare]) => byName.get(`${norm(name)}|${rare}`) || [];
  for (const t of evoTemplates(wiki)) {
    const results = new Set(find(t.result).map((m) => m.medalId));
    const bases = find(t.base).filter((m) => m.validEvolve && results.has(m.evolveId));
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
    if (ids.some((x) => !x)) { report.push({ kind: 'evo', page: t.page, rule: t, why: 'required medal not in the master' }); continue; }
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
      if (!same) setNeed(b, own, 'evo', t.page);
    }
  }

  // 3. copies that follow their row: boosted (1/2/3xxxxxx) and cut-in aliases (groupId = the row)
  const fixed = new Map(changes.map((c) => [c.id, byId.get(c.id)]));
  for (const r of medals) {
    const b = r.groupId && fixed.get(r.groupId);
    if (!b || r.evolveId !== b.evolveId) continue;
    if (r.validEvolveNeed === b.validEvolveNeed && r.evolveNeedId.every((v, i) => v === b.evolveNeedId[i])) continue;
    const before = fields(r);
    Object.assign(r, { validEvolveNeed: b.validEvolveNeed, evolveNeedId: [...b.evolveNeedId] });
    changes.push({ id: r.medalId, name: r.name, kind: 'copy', src: String(b.medalId), before, after: fields(r) });
  }
  return { changes, report };
}

// rows that still evolve with no required medal (base rows only)
const stillEmpty = (medals) => medals.filter((r) => r.medalId < 1000000 && !r.groupId && r.validEvolve && r.evolveId && !r.validEvolveNeed);

module.exports = { FANTASIA_MICKEY_B, COMBOS, norm, fmbRules, evoTemplates, applyWikiEvolve, stillEmpty };

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, 'master_data');
  const wikiFile = process.argv[3] || process.env.KHUX_WIKI_ALL || 'D:\\Progetto_Restauro_KH_UX\\wiki\\wiki_all.json';
  const file = path.join(dir, 'medal.json');
  const medals = JSON.parse(fs.readFileSync(file, 'utf8'));
  const wiki = JSON.parse(fs.readFileSync(wikiFile, 'utf8'));
  const { changes, report } = applyWikiEvolve(medals, wiki);
  const kinds = changes.reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] || 0) + 1 }), {});
  for (const c of changes) console.log(`${c.kind}\t${c.id}\t${c.name}\t${c.before.validEvolveNeed}:${c.before.evolveNeedId.join(',')} -> ${c.after.validEvolveNeed}:${c.after.evolveNeedId.join(',')}`);
  for (const r of report) console.log(`REPORT ${r.kind}\t${r.page}\t${r.id || ''}\t${r.why}\t${JSON.stringify(r.rule.base || r.rule.from)} -> ${JSON.stringify(r.rule.result || r.rule.to)}${r.wiki ? '\twiki ' + r.wiki.join(',') + ' ours ' + r.ours.evolveNeedId.join(',') : ''}`);
  for (const r of stillEmpty(medals)) console.log(`EMPTY\t${r.medalId}\t${r.name} -> ${r.evolveId}`);
  console.log(`changed rows: ${changes.length} ${JSON.stringify(kinds)}`);
  if (changes.length && !process.env.DRY_RUN) fs.writeFileSync(file, JSON.stringify(medals));
}
