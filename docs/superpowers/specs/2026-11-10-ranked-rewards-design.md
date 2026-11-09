# Ranked rewards in single player: score thresholds instead of leaderboards

Date: 2026-11-10. Status: design, waiting for the user's approval.
Applies first to Events Part 8 (High Score Challenges); the same rules are reused later by the Damage Contests, the
Swiftstriker Championships, the weekly / Deluxe Lux rankings, the Coliseum and PvP when those modes are built.

## 1. Intent

In the original game several modes paid rewards by **leaderboard position** among all players at the end of a period.
On our server there is one player per save, so a leaderboard cannot exist. The rewards must stay obtainable in an
organic, balanced way, calibrated on what real players did, without inventing values.

Decision (user, 10-11-2026): **the reward depends on the player's own result, not on a position.** Each ranked
event gets **score thresholds**; each threshold stands for one original rank bracket and pays that bracket's original
rewards.

## 2. Goals

1. Every original ranked reward stays obtainable by playing, through thresholds of the player's own result.
2. Thresholds are calibrated on the original numbers and on what a solo player can do (section 5), never guessed.
3. The original screens keep working and keep their meaning: the leaderboard shows a position that **rises with the
   thresholds reached**, the reward list shows thresholds instead of rank ranges.
4. Every deviation is declared in the in-game Notices (project rule).

## 3. Non-goals and anti-goals

- Non-goal: simulating other players' scores or a fake population.
- Non-goal: changing the score-based rewards that already existed in the original (point milestones, Coliseum
  round/tier coins and boards, PvP point milestones, Lux missions). They stay exactly as they were.
- Anti-goal: a fixed «1st place» shown regardless of the result (rejected by the user).
- Anti-goal: thresholds copied raw from the original where the original top needed effort no single player can give
  (thousands of raids a week, ~50 hours of auto battle a month): the top bracket would be unreachable.
- Anti-goal: rewards farmable without end (reruns, catalog-kept events).

## 4. Rules decided with the user

1. **Metric = the original metric of the mode**, best result kept:
   - HSC, Damage Contest: best single-run score (proven: the ranking used the best run, not a total).
   - Swiftstriker: best time.
   - Coliseum: total rounds cleared in the month (proven original metric; tie-break by reach time is not needed).
   - Weekly / Deluxe Lux: Lux earned in the week (the week is the «event»).
   - PvP: points of the period (details decided when PvP is built; the original had no score cutoffs, only a ladder).
2. **Thresholds per event**, one per original rank bracket of that event (the bracket tables are known for every era,
   see section 7).
3. **Paid once per event** (user 10-11): each threshold's reward is paid once for that event id, ever — rotation
   reruns and catalog-kept plays included. The best result is saved and keeps counting toward thresholds not reached
   yet. Weekly Lux rankings are the exception by nature: each week is its own event with its own thresholds.
4. **Shown position rises with the thresholds** (user 10-11): the position shown in the original leaderboard views is
   the best rank of the bracket whose threshold the player has reached (e.g. reaching the threshold that stands for
   101-1,000 shows «101st»). Below the lowest threshold the player shows the lowest bracket's upper bound. «1st» only
   above the top threshold.
5. **Reward list shows thresholds** with their rewards, in place of rank ranges.
6. **Original point milestones stay** beside the new thresholds (user OK on the playback).
7. **Low brackets = easy thresholds, top = hard but reachable** by a very dedicated solo player (user OK).
8. **Top threshold proportioned to a single player** (user 10-11): where the original top needed effort impossible
   alone, the top threshold is what the reference solo player (section 5) can do; the other thresholds keep the
   original proportions between brackets.
9. **Only the highest bracket reached is paid, not the sum** (user 10-11, as in the original where a player got only
   his own bracket's prize). When a later better result reaches a higher bracket, the player receives the difference
   (the new bracket's rewards minus what the lower bracket already paid, item by item, never negative). At the end the
   player holds exactly what an original player of that bracket received.

## 5. The reference solo player (user 10-11)

«A very dedicated player» is defined as:
- **time**: all the AP of each day for the whole event (natural regeneration, 1 AP per 3 min = 480 AP/day, plus the
  0-AP bonus hours where the original had them), no paid AP refills;
- **deck**: the best deck a **non-paying** player can own on our server at that story week (user 10-11, option A):
  medals, traits, keyblades and score-bonus medals obtainable by playing up to that week, including draws paid with
  the Jewels earned by playing; no «full collection» of every medal in duplicates (nobody buys Jewels on our server).

The **top threshold** of an event = the result this player reaches. The value is **computed** (section 6), then
checked on the bench with real plays, and the user can check it by playing.

## 6. Calibration method

1. **Measure, then estimate** (Claude's call 10-11). The score is computed by the client and reported to the server
   (the server stores `highScore` / per-stage `score`, it has no score formula), so the reference result of score
   modes is **measured on the bench**: a few sample events per era are played with the reference deck, and the other
   events of the same era are estimated from those samples (same scoring rules, scaled by the stage's enemies and the
   era's bonus medals). Reverse-engineering the client's scoring is not required. A small offline tool computes only
   the **time/AP budget** side: the Lux of one week of all-AP play (quests/raids of that story week, no party boosts)
   and the Coliseum rounds reachable in a month, using per-run values measured on the bench.
2. **Top threshold** = min(reference result, original top result where known).
3. **Lower thresholds are rescaled from the new top** with the original proportions between brackets (Claude's call
   10-11, following rule 4.8). The original point milestones are separate rewards and stay unchanged even when a
   bracket threshold ends up near or below a milestone. Proportions by mode type:
   - **Open-ended score (HSC/Damage Contest 2016-2018):** the original top milestone ≈ the top-5,000 cutoff
     (2017-18 evidence); top-1,000 ≈ 1.2-1.5x it, top-100 ≈ 2x, rank 1 ≈ 2.2x; brackets below 5,000 as fractions
     of the milestone (a normal run was ~0.8-1.05x, a 0%-bonus run ~0.5-0.7x).
   - **Ceiling score (HSC/Damage Contest 2019-2021):** shares of S_max: top-500 ≈ 99.99%, top-1,000 ≈ 98%,
     top-1,500 ≈ 97%, top-2,000 ≈ 96%; lower brackets interpolated down to the original top milestone. All brackets
     that the original packed within ~0.01% of the ceiling (ranks 1 .. ~500) collapse into one «ceiling reached»
     threshold with a small tolerance (Claude's call 10-11), so rank 1 is not made unreachable by estimation error;
     with rule 4.9 the player then holds the rank-1 rewards.
   - **Time trial (Swiftstriker):** the published final times as they are (top-100 26''96, top-1,000 40''94,
     top-5,000 1'40''77; run #1 top-5 times).
   - **Coliseum:** Era D (2019-05 on): Tier 10 clear ≈ top 3,000-5,000, +8 rounds ≈ top 1,000, +20-25 rounds ≈ top
     100; Era B (2017-05..2018-03) as fractions of rank 1 at month end: #100 ~0.6, #1,000 ~0.45-0.5, #2,500
     ~0.35-0.45, #10,000 ~0.25-0.33; Era A / C from the community statements in the findings.
   - **Lux weeks:** era tables keyed to the story week (inflation ~10x a year); late-2020 shape: engaged player
     ~1-1.5 T, top-25 party member 0.5 T, top-3 party member 20 T, top-5 solo 66-265 T, scaled so the top bracket =
     the reference solo week.
   When the original numbers for a bracket are unknown, the threshold is interpolated between known ones and labelled
   reconstructed.
4. Every threshold carries its source label (original value / scaled from original / interpolated) for the Notices
   and the details pages.

## 7. Evidence (private, local only)

- HSC: `D:\Progetto_Restauro_KH_UX\private\events\sources\hsc_ranking\` (HSC_RANKING.md, hsc_ranking.json: 75 rows,
  brackets and milestones for 74, real scores for 22 events, party top-500 lists).
- Lux / Union, PvP, Damage Contest, Coliseum: `D:\Progetto_Restauro_KH_UX\private\events\sources\ranking_research\
  {lux_union,pvp,damage_contest,coliseum}\FINDINGS.md` + data.json.
- Bracket tables for every era: khuxwiki, notices, the ReLux donor master (2019+ only where it matches khuxwiki).
- No original source ever published exact end-of-period cutoffs; known points are snapshots (videos, a player's daily
  Border Rank log for the Coliseum Oct-Dec 2017). This is why the thresholds are scaled/interpolated and labelled.

## 8. Client screens

- Leaderboard requests (`/ranking/.../own`, `/border`, top lists; HSC/Coliseum quest header «Current: Nth / Goal:
  next bracket», Border Rank view, month/event-end result popup) are answered by the server from the player's own
  best result and the threshold table:
  - own entry: the rising position of rule 4.4 and the player's result;
  - border view: one row per threshold (bracket edge rank + threshold value), so the original «Border Rank» screen
    becomes the threshold table;
  - top list: the player's own entry (no fake players).
- Reward list: where it is a server page (Details), it lists thresholds and rewards; where the client draws rank
  ranges from master data, the builder checks whether the text can carry the threshold, otherwise the thresholds are
  shown on the Details page next to it (decision recorded in the plan).

## 9. Left to the builder

- Data layout (threshold tables per event id, source labels), simulator design, how rewards are delivered (presents
  box like the original end-of-event rewards, or immediately on reaching a threshold — follow the original delivery
  where the client expects it).
- Exact handling of each client endpoint and field, found from the client and the docs/notes.
- Order of modes: HSC first (Part 8), then Damage Contest / Swiftstriker with the challenge events they belong to,
  Coliseum and PvP when built, weekly Lux rankings with the Lux ranking feature.
- **Scope of the first plan (Claude's call 10-11):** the mode-independent part (threshold tables per event id with
  source labels, highest-bracket payment with differences, server answers to the ranking screens:
  `/ranking/highscore{,/own,/border}` stubs in server/routes-party-ranking.js, `/ranking/reward/check` in server.js)
  plus the HSC data. The other modes reuse it when they are built; the time/AP tool for Lux and Coliseum is built
  with those modes.

## 10. Open for later (not blocking HSC)

- PvP points per battle (unknown in the original) and the opponent model (original = AI-played snapshots of saved
  decks, «ghost decks»).
- Party rankings (party HSC #54/#55, party Lux): the player is alone; to decide when built.
- Union / Cross-Union contests: no single-player meaning yet; to decide when built.
