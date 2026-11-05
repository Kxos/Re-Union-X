# Conditional Present campaigns (I-234)

Original campaigns that sent Medals (and titles, Gems, Jewels, Draw Tickets) to the **Present Box** when the player met a
condition (own some Medals, unlock their Special Attack Bonus or traits, draw a Deal N times, clear a Story Quest, collect
N Medals of a kind, LUX level, Medal storage).
Without them some Medals of the master cannot be obtained in any other way.

- Data: [`server/campaign_gifts.json`](../../server/campaign_gifts.json) (Medals by master name, rarity for the
  rewards; ids resolved at load, so the I-225 renumbering does not matter).
- Rules: [`server/campaign-gifts.js`](../../server/campaign-gifts.js) (pure), wired in `server/server.js`
  (`checkCampaignGifts`, called by `/mypage` and `GET /user/present`; `addPresent(..., dots)` and
  `presetDots` for the «pre-strengthened to N dots» rewards, set when the present is collected).
- Player state: `player.campaignGifts[id] = {open, units | keys}` (what was already sent: never twice).
- Test: `node server/test-campaign-gifts.js` (pure rules, the real data against the served master, the server flow
  Home -> Present Box -> collect with dots).
- Notice: «Campaign Rewards» (IMPORTANT, 11/05; «Campaign Medals» before the non-Medal rewards),
  [NOTICES.md](../NOTICES.md#campaign-rewards).
- Reward rows: `{medal, rare, num, dots?, skill?, boosted?}` (present type 3), `{material}` (5), `{title}` (7),
  `{jewels: n}` (2, `freeStone`), `{ticket: currency, num}` (41, item id = index in `gacha.TICKET_CURRENCIES`: the
  payType 8 Shop currencies draw / holiday / spooky / moogle). Bronze / Silver / Gold Tickets have no balance the client
  is served (`drawTicket1-3` are always 0) and the Gold Ticket payType is the one the Banner Catalog plate is leaving
  (I-135): `compile` rejects them.

## Calendar

A campaign opens when the **Story Shop week** of the player (`storyCtx().shopTo`, the same calendar as the Shop
banners) reaches its start date, and then **stays open** (`open` flag): the original deadlines would make the rewards
unobtainable in a game that follows the Story, and the condition Medals stay drawable through the Banner Catalog. A
late-Story player gets every campaign at once, counting the Medals already owned. The original sent the rewards days
after the deadline; here they arrive at the next Home / Present Box load. Both are declared in the Notice.

## Campaigns found (WW notices, private notice archive outside the repository)

Search: every notice with «own / possess / in possession / unlock the Special Attack Bonus / for each condition /
by owning / Tally Date / Commemorative Medal / VIP Draw N times» (2,604 notices, 2016-2021). Paraphrased; the notice id
is the source.

| Id (json) | Notice | Original period (PT) | Condition | Reward | Otherwise obtainable? |
|---|---|---|---|---|---|
| story-q200-2016 | 20758 | 2016-09-05 → 09-11 | Story Quest 200 cleared | 600 Jewels | (Jewels) |
| tva-2016 | 20642 | 2016-09-02 → 09-08 | own Illustrated Terra / Ventus / Aqua (one each, duplicates no) | Terra & Ventus & Aqua 6★, 3 dots (up to 3) | **no** |
| mirror-2016 | 21433 | 2016-09-30 → 10-13 | SA Bonus unlocked on Sora & Donald & Goofy / SP Axel (one each) | 10 Magic Mirror | yes (Deal bonuses) |
| srk-2016 | 22102 | 2016-10-28 → 11-10 | SA Bonus on Illustrated Kairi / Sora (A) / Riku (A) (one each) | Sora & Riku & Kairi 6★, 2 dots | **no** |
| hdkm-sora-2016 | 23113 | 2016-11-25 → 12-02 | SA Bonus on HD Sora (once) | HD King Mickey 6★, 3 dots | **no** |
| hdkm-riku-2016 | 23118 | 2016-12-02 → 12-09 | SA Bonus on HD Riku (once) | HD King Mickey 6★, 3 dots | **no** |
| ka1-xion/axel/roxas-2016 | 23543, 23790, 23792 | 2016-12-16/22/26 → 2017-01-09 | SA Bonus on Illustrated Xion / HD Axel / Casual Roxas | Key Art #1 6★, 2 dots (one per campaign) | yes (Deals from 2017-01) |
| ka5-2017 | 27134 | 2017-04-06 → 04-24 | SA Bonus on Illustrated KH II Kairi / KH II Sora (one each) | Key Art #5 6★, 3 dots | **no** |
| orgxiii-2017 | 28243 | 2017-05-12 → 05-22 | own Key Art #6 and #7, or SA Bonus on either (once) | 13 Org. XIII A-type 6★ 5 dots + Scrooge 6★ with ATK B III Max & SP GA 2 | yes (Deals) |
| kh02tv-2017 | 28944, 28945, 28950 | 2017-05-26 → 06-08 | SA Bonus on KH 0.2 Aqua / KH 0.2 King Mickey (A) / Key Art #8 (one each) | KH 0.2 Terra & Ventus 6★, 2 dots | **no** |
| story-q50/q600-2017 | 30249 | 2017-07-03 → 07-09 | Story Quest 50 cleared / Story Quest 600 cleared | 3 Sora & Roxas 6★ 2 dots / Magic Broom | Sora & Roxas **no**; Broom yes |
| axelart-2017 | 30115 | 2017-07-07 → 07-20 | own Axel Art [EX] (once) | Fantasia Mickey B | yes |
| kh02kmb-2017 | 32512 | 2017-09-22 → 10-01 | SA Bonus on every KH 0.2 Terra / KH 0.2 Sora / Lingering Will copy (no limit) | KH 0.2 King Mickey B 6★, 2 dots each | **no** |
| annaelsa(-trait)-2018 | 47814 | 2018-12-10 → 12-23 | 5 VIP Draws of the Frozen Medals Deal (B0431) / every VIP Draw | Anna & Elsa 7★ (once) / Trait Medal #64 each | **no** / **no** |
| sntva(-trait)-2019 | 48236 | 2019-01-01 → 01-13 | 5 traits unlocked on 3 Medals among Supernova - HD Terra / Ventus / Aqua (once) / every draw of B0442-B0444 | Supernova - Terra, Ven, Aqua 7★ / Trait Medal #72 each | **no** / **no** |
| lux-tickets-2019 | 51531 | 2019-03-29 (LUX level read that day) | LUX level, read once (`once`: the first time the campaign is checked open; later levels add nothing) | one Draw Ticket per LUX level | (tickets; Ticket Draw B0488/B0489 that week) |
| storage-2020 | 69125 | 2020-09-03 → 10-01 (slots counted 09-02) | Medal storage at 3,000 slots (`maxMedal()`) | 30 Draw Tickets | (tickets; Ticket Draw B0711/B0712) |
| strelitzia-2020 | 69291, 69546 | 2020-09-14 → 10-07 | every 3 copies owned of the 9 SN++ - Illus. KH III Medals | SN++ - Strelitzia 7★ + 100 Trait Medal #256 | **no** |
| flantastic-2020 | 69376 | 2020-09-14 → 10-07 | collect 10/20/30/40/55/70/85/100/110 Sora & Moogle B (JP 5th anniversary entry Medal) | the 7 Flans, Trait Medals #239-#246 x30, Kyroo [SAB LV 10], Power/Speed/Magic/Sun/Moon Gems, title, SN++ - Flantastic Seven (Boosted at 110) | Flans and Flantastic **no** |
| momkairi-2020 | 71029 | 2020-11-02 → 11-30 | every 4 copies owned of SN++ - Stained Glass #10-#13 | SN++ - MoM Kairi 7★ + 100 Trait Medal #284 | **no** |

The tiers of `flantastic-2020` hold the **difference** between a tier and the previous one of the notice table (the
table lists the whole package at each count); the 110 tier adds the Boosted SN++ - Flantastic Seven (row 2302025).

Obtainability audit (05-11): every reward id was searched in the expanded pools, bonuses and pity gifts of all 807
banners of `game_data/gacha_catalog.json`, in the master tables (stage rewards, missions, moogleshop, sphere boards,
login bonus...), `game_data/special.json`, `game_data/raids.json`, `raid_config.json` and `limited_missions.tsv`.
The condition Medals are all drawable (their Deals, also from the Banner Catalog).

## Non-Medal rewards (user decision 05-11)

The notices of the implemented campaigns were re-read for rewards other than Medals: none was dropped (Flantastic Seven
already had its Gems and title; the Limited VIP Coins of 48236 and 69291 are a per-draw bonus of those Deals, not a
campaign reward). A second search of the 2,604 notices for conditional rewards of titles, Jewels, tickets, Gems and items
found the campaigns below. Pure ranking rewards (PvP, Coliseum, Union Cross, High Score, party Lux), party / community
campaigns (recruit a new player 46205 / 49894, Chocolate Valentines 50298, FFBE new players 58199), purchase bonuses
(Weekly Jewels Extravaganza Gold / Silver Tickets, Jewel Box 68889), sweepstakes (52165, 57269) and event quest rewards
are out.

| Notice | Original | Condition | Reward | Status |
|---|---|---|---|---|
| 20758 | Sep 2016 | Story Quest 200 cleared | 600 Jewels | **added** (`story-q200-2016`) |
| 51531 | Mar 2019 | LUX level on 2019-03-29 | 1 Draw Ticket per level | **added** (`lux-tickets-2019`) |
| 69125 | Sep 2020 | 3,000 Medal slots on 2020-09-02 | 30 Draw Tickets | **added** (`storage-2020`); here also when the slots are reached later |
| 23795 | Jan 2017 | Special Attack Bonus 100% on Classic Goofy | title Royal Captain (12048) | later: Classic Goofy came only from its event quest (in no drawable pool, mission or board) |
| 23804 | Jan 2017 | Special Attack Bonus on a Boosted Classic Donald | title Royal Magician (12050) | later: event quest not in the game, no Boosted Classic Donald in the master |
| 35148, 38663, 39482, 44153 | Dec 2017 - Sep 2018 | 1,000 Jewels for each Sora & Moogle / Illustrated Moogle / Toon Moogle / KH II Sora & Moogle owned at the end | Jewels | flagged: none of these Medals is in the master (only Sora & Moogle B), their Free Deals B0220 / B0274 are INCOMPLETE and the Toon Moogle login bonus is not served; an unbounded 1,000 Jewels per copy would also need a cap (the original days of the Deal) if they come back |
| 41796 | Jun 2018 | 5 draws of the Prime 7★ Deal | 1 Silver Ticket | flagged: an apology (with 600 Jewels to all), and the Silver Ticket Draws (B0312, B0392) are PvP-ticket Deals that cannot be drawn, with no Silver balance served; for the compensation list of I-164 |
| 67355 | 2020 | LUX level 300 / 350 | KHDR Quest Keys | out: Dark Road item |

The Jewels of these campaigns (600) and the Draw Tickets count in the resource balance study (I-164).

## Not implemented

- **Timeless River Mickey** (17717, April 2016): clear one of the LV 140 Proud Quests of the 2016 event. Those event
  quests are not in the game: the Medal stays unobtainable (named in the Notice).
- **Fantasia Mickey B** for Proud Mode Quest 350 (32020, September 2017): the Medal is obtainable elsewhere.
- **6★ Chip and Dale** for evolving Snow White / Seven Dwarfs to 6★ (18440, 2016 event Medals): obtainable elsewhere.
- **SN++ - FF7R Aerith** (64600): a limited mission, already in `mission.json`.
- Titles 23795 / 23804 and the per-Medal Jewels of 35148 / 38663 / 39482 / 44153: see the table above. The login
  campaigns (special login rewards) belong to I-164.
- High Score Challenge / ranking rewards: competitive, not a condition on the player's own box.
