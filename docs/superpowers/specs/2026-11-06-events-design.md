# Events: design

Status: written 6 November 2026 from the event census of the same day. Decisions marked **(author)** come from the author;
**(builder's call)** marks proposals made while writing, open to change. The four open questions were answered the same day
(section «Answered by the author»).

## Intent

Restore **all the worldwide events of the original game** that can be played **(author: «it is the heart of the game, we must
find them all»)**: event quests, event coins and boards, Org XIII and story events, gem quests, High Score, limited avatar
boards, Boosters and the campaigns that changed the rules of the game. Only worldwide content is served **(author, 06-11)**.
The game behaves as in the original wherever the original is known; every deviation is declared in the in-game Notices.

## Goals

- Every playable family of the census, with its original quests, enemies, objectives, rewards, boards and dates where known.
- Events follow the player's story date, like the Shop, Special and Raid tabs.
- Nothing is lost for good: past events stay reachable from an **Event Catalog**, as raids are from the Raid Catalog.
- Events close the waiting issues: I-166 (Boosters), I-227 (the last raid board cell), the type 15 reward paid into Raid Coins.

## Non-goals

- Raids, Union Cross (incl. Union Challenge), Coliseum (incl. the Cups), PvP: separate areas.
- Off-game contests and purchase campaigns (188 rows): not gameplay; at most an original notice in the catalogue.
- Deluxe ranking weeks (91 rows): they go with a future Rankings area.
- Japan-only events (kept privately for a later decision).
- Resource balance (I-164): campaigns are restored as data, the balance study comes after.

## Anti-goals (a failure even if it works)

- Invented quests, enemies or rewards presented as original: every reconstructed value is labelled in the data and declared.
- An event list that ignores the story date (every event of every year at once).
- A catalogue that lets a one-time reward be taken twice.
- SE files, notice texts, decompiled code or private sources in the public repository.

## Sources

All private and local, under `D:\Progetto_Restauro_KH_UX\private\events\sources\event_census\`:

- `EVENT_CENSUS.md` and `event_census.json`: **the calendar of record**, 1,531 WW occurrences in 20 types (728 quest events),
  every row with its sources and the conflicts between them (section H). Per-source sheets in `sources\`.
- Official WW notices: local archive (ReLux Team donation, `reference\banners\notices.json`), practically complete
  (checked against the community archives and the r/KHUx notice bot: 9 missing ids, none an event).
- khuxwiki: 4,635 quest pages and 331 event pages (quest count, level, AP, targets, objectives, rewards, boards, Boosters).
- Donated WW master snapshot (~mid-2021, ReLux Team): 3,103 evStage rows, stage, enemy, sphere, emblem, evScoreReward,
  evCampaign. **Verified only as a schedule**; stage lists, rewards and enemies must be cross-checked before use.
- WW master 1.1.3 (2016-04..10) and JP 4.3.1 data (90 % of the event stage maps, enemy models).

**Order of trust (builder's call):** official notice > khuxwiki > donated master (after cross-check) > JP twin > reconstruction.

## How a player meets events

**Which events the player sees (author).** The Events tab follows the story date like the Raid tab: the story date
picks the original period, then one original week per real Monday (`storyCtx` shopFrom / shopTo). Every event whose original
window overlaps the week is listed beside the raids. An event that ran three weeks stays three real weeks.

**Short windows (author).** Surprise events and Time Missions ran for 15-60 minutes (donor evStage category 3, about 2,500 rows,
mostly 2020). Open them for their whole original day, not only the original minutes, because a solo player cannot
wait for an exact hour; declared in the Notices. (Corrected 10 Nov 2026: every WW Surprise notice gave a whole Pacific day, so
a Surprise event open all day is original; only the Time Missions targets ran at four set hours a day, notice 67747.)

**Event Catalog (author).** A banner in the Events tab opens a web page with every event by period,
with filters, details and the original notice. One past event can be kept and played at a time, labelled KEPT.

**Rewards (builder's call, as for raids).** Objectives and first-clear rewards once per quest; drops and event coins on every
clear; each board cell once.

**Event coins (author).** In the original they were spent on the boards of the month and expired at its end. Here: one coin
balance per event board set, never expiring, so a kept event can always be completed; declared.

## The work, in parts

Each part is usable when finished and has its own plan. The order follows value and available data (census section E).

1. **Bench spike and framework (M).** What the client needs to list event quests in category 2 beside the raids and to play
   them: evStage rows, stage rows kind 2, `/stage/start` with an event id, clear with objectives and rewards, restrictions.
   Then the generator: census row -> evStage + stages (re-using the Special pipeline for maps), the story-week calendar, the
   Event Catalog and the notice pages (re-using the Raid Catalog). **Pilot: one month of 2019** with donor rows, khuxwiki
   quests and JP maps.
2. **Gem quests (S, 82 rows).** One quest a week or month, best data, high value for the economy.
3. **Event coins and event boards (M, 22 coin events + the monthly boards).** Coin balance (`stageSpherePoint`), sphere type 4
   boards with windows; reward type 15 stops paying Raid Coins.
4. **Challenge and battle events 2018-04..2021 (M per year, about 250 rows),** with keyblade challenges (21) and quizzes (6);
   Surprise events and Time Missions last.
5. **Org XIII monthly events (M, 26 WW runs)** and Challenge Organization XIII, mostly rebuilt from khuxwiki and the JP
   13-stage tables.
6. **Boosters (M), I-166.** Emblem rows with effects rebuilt from the descriptions and notices, `emblemIds` in the responses,
   the Boosters screen, the damage bonus; the Booster challenges; **closes I-227**.
7. **Limited and returning avatar boards (M, 277 rows):** board windows, prices, «stays unlocked once bought».
8. **High Score Challenge and Damage Contest (L, 71 rows):** score mode, score rewards, rank tiers as score thresholds.
9. **Campaigns (S):** AP, Sp. Atk and Lux x2 (evCampaign), special login campaigns, event missions; with I-164.
10. **2016-11..2018-03 events, collabs, celebrations, scenario events (M-L):** the data hole (164 quest rows without master rows),
    rebuilt from notices, khuxwiki, JP twins and footage; scenario texts last.

## Values

- **Enemies (author, 06-11: «every missing enemy must be found»).** Story enemies reuse their story rows. Every enemy of an
  event that we do not have is **searched until found**, never replaced by another: our master, then the donated enemy table
  (cross-checked), the WW 1.1.3 rows, JP 4.3.1 (rows, models, textures), khuxwiki and footage. Its model is imported like the
  raid bosses and shown to the author assembled in its animations. A quest whose enemy is still missing is not served yet: it is
  listed with what is known and the research goes on. Only stats that no source holds are deduced, labelled and declared.
- **Quests without a master row** (the 2016-11..2018-03 hole and the gaps elsewhere): built from khuxwiki infoboxes (world,
  level, AP, targets, objectives, rewards) with the Special pipeline, labelled reconstructed.
- **Unknown rewards:** the quest ships with the rewards that are known; nothing invented as a rare reward (as for raids).

## Graphics

- Event banners (640x140): original plates by notice image key, downloaded privately, shown to the author before serving.
- Event-only enemies and bosses: check model and texture coverage in JP 4.3.1 per part, as for raids; anything rebuilt is
  shown assembled in its animations before serving.

## Notices (mandatory)

A new IMPORTANT notice declares the story-week rotation of events, the Event Catalog and kept events, the short windows opened
for the whole day, the never-expiring coins, every reconstructed quest, enemy or reward, and Boosters rebuilt from their
descriptions. Run `node server/export-notices.js`.

## Answered by the author (6 November 2026)

1. **Rotation:** as for raids: the story date picks the original period, one original week per real Monday.
2. **Surprise events and Time Missions:** open for their whole original day, declared.
3. **Event Catalog:** one kept event at a time, as the Raid Catalog.
4. **Event coins:** one balance per event board set, never expiring, declared.

## Known gaps

From census section G: the 2016-11..2018-03 hole; unverified donor data; event-only enemy stats; WW coin and board rules per
month; Booster effect parameters; High Score scoring after 2018; banners not yet downloaded; English scenario texts. The game
is built with what is known; a later source replaces a reconstructed value without a design change.
