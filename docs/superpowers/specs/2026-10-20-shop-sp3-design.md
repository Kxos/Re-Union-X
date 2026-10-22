# Shop, sub-project 3: seasonal banners, Limited with tickets, Catalog filters, pinned banner — design

Status: draft of 20-10-2026, to be approved. It follows sub-projects 1, 2, 2b, 2c and the weekly rotation (I-165,
[shop.md#rotazione](../../notes/shop.md#rotazione)). It replaces sections 4.2, 4.3, 4.5, 4.6, 4.7 and 4.9 of the
[spec of 16-10](2026-10-16-shop-banner-design.md), partly superseded by the rotation. Sources: audit of 20-10
(`D:\Progetto_Restauro_KH_UX\tmp\sp3_audit\report.md`), user decisions of 20-10 (this conversation),
approved drafts of the Catalog (`D:\Progetto_Restauro_KH_UX\.superpowers\brainstorm\469-1792477598\content\`:
`catalog-filters-v3.html` for the flow, `catalog-years-v4.html` option A for the tabs).

## 1. Why

The rotation by story period (I-165) brings every banner into the Shop in its era, but:
- the holidays of the real calendar are not felt (Halloween in October, nothing happens);
- a banner whose period has passed never comes back to the Shop: it stays only in the Catalog;
- with 807 banners the Catalog without filters cannot be browsed;
- the Limited quests give Platinum Tickets and Draw Tickets hundreds of quests before a banner exists where
  they can be spent.

## 2. Goals

1. **Seasonal banners on the real calendar**: in the window of a season, at the top of the Shop, the most recent
   unlocked edition of the banners of that season.
2. **Limited with tickets** hidden until a banner that spends that ticket is unlocked.
3. **Catalog with tabs by game year and a Filters panel** (medal, currency, state).
4. **One old banner pinned in the Shop**, chosen by the player, changeable whenever they want.
5. Notices updated for every difference from the original.

Non-goals (user decisions of 20-10):
- B0079-B0085 (unlocked at 525 but outside the window of the 501-525 tranche): **stay as they are**; they are resolved
  when the story reaches 979 (project goal). No change to the unlock rule nor to the text.
- Distinct seasonal currencies (Spooky Cookie, Holiday Draw Ticket, Moogle Point): **later**, with the campaigns that
  give them (Union Cross, Proud). Today all of type 41 stays Draw Ticket.
- `SHOP_MAX` stays 20.
- 7-day debut, «2 recent + 1 archive» slots, group choice from the Catalog and «Novita'» (New) of the spec of 16-10:
  **removed** (the rotation already acts as a debut; the pinned banner replaces the archive; the Catalog does not change the Shop).

Anti-goals: client crashes (plates with padlock I-134, two payType 8 currencies together); medals before their
date (9.3); free or almost free banners available forever.

## 3. Constraints

- Original client not modified: server responses, served master, WebView pages are changed.
- Closing the Catalog WebView **does not reload** `/gacha/list` (tested on the bench, shop.md#prove): every Catalog action
  that changes the Shop must say «exit and re-enter the Shop».
- The master stays fixed for the session (revision fixed at login): the fields served in `drawMedalType` (count-
  down) change only at the next login.
- Repo: only our own code and documentation; derived data in `server/game_data/`.
- Game texts in English, like the current pages.

## 4. Seasonal banners on the real calendar

### 4.1 Season table (new, in the generated catalog)

Each seasonal banner receives a `season` field. The windows are **fixed per season** (user decision):
from the first start date to the last end date among all the editions, brought to month/day. Derived from the data on
20-10:

| season | banner | window (month/day) |
|---|---|---|
| `newyear` | B0072-B0076 (2017), B0219 (2017-18), B0774 (2021) | 22/12 - 17/01 |
| `lunar` | B0084 (2017) | 28/01 - 03/02 |
| `valentine` | B0085, B0086 (2017) | 03/02 - 17/02 |
| `anniversary` | B0106 (2017), B0272 (2018), B0493 (2019, INCOMPLETE), B0651 (2020) | 06/04 - 30/04 |
| `summer` | B0042 (2016) | 22/08 - 01/09 |
| `halloween` | B0731, B0732 (Spooky Cookies, payType 8), B0740 (2020) | 12/10 - 02/11 |
| `blackfriday` | B0066, B0067 (2016), B0621 (2019), B0752, B0754 (2020) | 22/11 - 09/12 |
| `holiday` | B0068 (2016), B0758, B0759 (2020, payType 8) | 07/12 - 06/01 |

- The windows that cross New Year apply across the turn of the year.
- The other banners with the `SEASONAL` flag in the catalog (Thank You Draw, Prime 7★ Deal, Free Jewels Draw, November 2018
  EX+, Free Celebratory Draw, Ticket Draw, SN Falling Price Deal, Daily Free Deal 2020, SN+ Falling Price Deal, Epic
  Medal Carnival B0089) **have no season**: they stay normal rotation banners.
- The table lives in the catalog generator (`recon/tools/make_banner_catalog.py` or a rules file next to it), not
  written by hand in the generated JSON.

### 4.2 Rule

- Reference date: the server's **real time** (`realNow()`, the same on which rotation and weeks advance;
  `-RealNow <ISO>` for tests), not the twin's fake date.
- If the real date falls in the window of a season: the **most recent unlocked edition** of that
  season is taken among the banners with `unlockQuest` <= last quest cleared, drawable (`drawable`). **All** the
  banners of that edition are shown (e.g. the five New Year's Deals 2017).
- **Edition** (Claude's choice, review of 20-10) = the occurrence of the window in which the banner's start date falls,
  not the calendar year: for `newyear` B0072-B0076 (start 01/01/2017) are the 2016-17 edition, B0219 (start
  22/12/2017) the 2017-18 edition, B0774 the 2020-21 one. The same for `holiday` (B0068 2016-17, B0758/B0759 2020-21).
- No unlocked edition: no banner of that season.
- Several seasons together (December: Black Friday, holiday, newyear): all of them, in the order of table 4.1.
- Position in the Shop: after the Catalog plate and the pinned banner (6), before the rotation. **User decision
  (20-10, from the bench):** display order Catalog, pinned, seasonal, rotation (before: Catalog, seasonal,
  pinned, rotation). The precedence below stays as before: it is decided which banners survive (season >
  pinned > rotation) and then the survivors are ordered with the pinned one at the top.
- A seasonal banner already present in the rotation week is not duplicated (it stays in the season's place).
- payType 8 (Spooky Cookies, Holiday Draw Tickets): never two payType 8 currencies together. In case of conflict (from
  quest 940: Draw Ticket banner pinned or in rotation during Halloween or the holidays) **the season wins**, then the
  pinned banner, then the rotation: the payType 8 banner that loses stays out of the Shop for the duration of the
  window and comes back afterwards (Claude's choice, review of 20-10; to be stated in the Notices, section «Keep one banner in
  the Shop»).
- Countdown (`displayTimeLeft`/`endDate` of `drawMedalType`, like the rotation): end of the season's
  window, in fake time like the quests (`clock.fakeString` with the revision's offset).
- The banner limits (`dayLimit`, `totalLimit`, Free Deal VIP) stay those of the banner: a «once» banner already used
  stays exhausted in the following seasons too.

## 5. Limited with tickets hidden until the unlock

- A Limited campaign that **gives** Platinum Tickets (reward 40) or Draw Tickets (reward 41) is active only if
  at least one drawable banner that **spends** that currency is unlocked (`unlockQuest` <= last quest cleared)
  (payType 7 for the Platinum, payType 8 with `currency` draw for the Draw Ticket).
- Today: W01 (rows 4059/4060, Platinum) from quest 815 (B0456), W02 (row 4091, Draw Ticket x100) from 840 (B0478).
  The thresholds are calculated from the catalog, not written by hand.
- Mechanism: the same as `weeklyMedalFrom` (`server.js limitedUnlocked`), extended to the groups that give tickets;
  it also applies to the monthly ones if one of them gives tickets. Before the unlock the week stays without that campaign.
- The tickets already accumulated in the saves stay.

## 6. Banner pinned in the Shop

### 6.1 What can be pinned

A banner is **pinnable** if:
- it is unlocked and drawable (`drawable`, sizes in `KHUX_GACHA_SIZES`, not `catalogOnly`);
- its period is **past**: it ends before the start of the period of the current tranche (it will never come back into the
  rotation);
- it is **not** a Free Deal, it does **not** cost 1 Jewel, it has **no** season (4.1) (user decision: the seasonal ones
  come back with the calendar; Free Deal and 1 Jewel for the balance of resources, I-164).
- Clarification (Claude's choice, review of 20-10): «Free Deal / 1 Jewel» = banner with **all** prices <= 1
  (`prices` [0], [1], ...) or `vipFree`, or a name starting with «Free» (Free Deal, Free Jewels Draw, Free
  10-Medal Draw, Free Celebratory Draw). The banners with **only the first draw free** and then paid
  (FIRST_FREE, Falling Price: `[0,3000]`, `[0,2500,2200,...]`) **can be pinned**: the free one applies once per
  player (counter `player.gacha.count`), so it does not give free draws forever.

### 6.2 Behaviour

- At most **one** pinned banner per player (`player.gacha.pinned` = rowId or absent).
- In the Details of a pinnable banner, opened from the Catalog: button **«📌 Keep in the Shop»**. If another one is already
  pinned, the text says which one will be replaced. In the Details of the pinned banner: **«Remove from the Shop»**.
- After the tap the page confirms with a clearly visible box (border and large text, green for «Pinned!», orange for
  «Removed.») in place of the button, scrolled into view: **«Pinned! Leave and re-enter the Shop to see it.»** (constraint 3).
  **User decision (20-10):** the same button («📌 Keep in the Shop» / «Remove from the Shop») is also on
  every pinnable row of the Catalog, without leaving the list: the row of the previously pinned banner loses the state, the
  new one becomes «📌 Kept in the Shop», with the same confirmation box. The request code is shared with the
  Details.
- In the Shop: **right after the Catalog plate, above the seasonal ones** (user decision, 20-10; see 4.2), before
  the rotation; no countdown. The plate shows only the banner image, so for the pinned one the
  `bannerUrl` is `/web/gacha/img/<id>-kept.png`: the same banner (same size) with the «📌 KEPT IN SHOP» badge
  at the top right (pin drawn as a shape), generated once by `recon/tools/kept_banner_badge.py` (Pillow)
  and kept in `game_data/gacha_img_kept/`; if the generation fails, the normal image is served.
- If the pinned banner stops being pinnable (it should not happen: past periods stay past), it disappears
  from the Shop and the Catalog shows it again as pinnable or not.
- It counts towards the `SHOP_MAX` cap.

### 6.3 WebView -> server communication

The Catalog WebView is served by our server over http (see the notes on WebView and TLS). The button makes a request
to the server (e.g. `POST /web/gacha/pin` with the rowId, or a GET link with a response that redraws the page) that updates
`player.gacha.pinned` and saves. The technical detail is left to the builder; requirement: work in the client's
WebView without external JavaScript.

## 7. Catalog: tabs by game year and Filters panel

Visual reference: `catalog-filters-v3.html` (three-step flow) and `catalog-years-v4.html` option A.

### 7.1 Tabs by game year

- Title above the tabs: **«GAME YEAR — each year runs from one anniversary (April 7) to the next»**.
- Tabs: **All years** (2016-2021), **Launch year** (Apr 7, 2016 → 1st 🎂), **Year 2** (1st 🎂 → 2nd 🎂),
  **Year 3**, **Year 4**, **Year 5**, **Final months** (5th 🎂 → end). Year of a banner = start date.
  **User decision (20-10):** a year tab without any banner in the whole catalog (independent of the filters) is not
  shown (today «Final months»: the last start is 2021-02-25); it reappears by itself if data arrive.
- Each tab shows how many banners match the active filters.
- The sentence above the list repeats the exact dates: «12 banners from the launch year (Apr 7, 2016 – Apr 6, 2017) match
  your filters».

### 7.2 Filters panel

- **«⚙ Filters»** button at the top right, with the number of filters turned on.
- It opens **over** the darkened list; it closes with the X or with the button at the bottom.
- Three sections:
  - **FIND A MEDAL**: search field by medal name, with the line «Shows the banners where this Medal can be
    drawn.» It matches if the medal is in the pool or in the guarantees of the banner (catalog names, case-
    insensitive, search by part of the name).
  - **PAID WITH**: All, 💎 Jewels, 🎫 Platinum Ticket, 🎟 Draw Ticket, 🎃 Seasonal tickets, 👑 VIP, Other.
    Definitions (Claude's choice, review of 20-10): Jewels = payType 1; Platinum = payType 7; Draw Ticket =
    payType 8 with `currency` draw; Seasonal tickets = payType 8 with spooky, holiday or moogle; VIP = banners with the
    `VIP` flag (any currency: it is a filter on the banner type, so a VIP banner paid in Jewels appears both in Jewels and in
    VIP); Other = payType 4/5/6/9 (Bronze/Silver/Gold Ticket, Draw Points, catalog only).
  - **SHOW**: All banners, ▶ In the Shop now, Unlocked, not in the Shop now, 🔒 Still locked (same colours as the
    states in the list).
- At the bottom: «Reset filters» and the **«Show N banners»** button with the number already calculated.
- Filtered list: sentence with the count and the active filters as labels with the × to remove them, plus «Clear all».
- Each banner: image on the left; on the right name, dates, price and state.
- The filter lives **only** in the Catalog: it does not change the Shop. It can be entirely page-side (inline JavaScript in the
  served page); remembering the filters between one opening and the next is optional.
- State in the list: add the «📌 Pinned» state and, for the pinnable ones, an indication that they can be pinned.

### 7.3 Broken catalog names (I-150)

To be fixed in the generator before the medal search: 5 boosted names without a medal («launchpad mcquakc»,
«webby vanderquakc», «axel [ex]», «kairi [ex+]», merged SN++ name), notes with U+FFFD («SN+ - KH III Namin<U+FFFD>»),
`pool.featured` of B0637/B0646 with «of the following». Closes I-150.

## 8. Notices

- «Shop» notice (INFORMATION): new sections «Seasonal banners» (windows of 4.1), «Keep one banner in the Shop»
  (rules 6.1-6.2, exit and re-enter), «Catalog filters».
- «Differences from the original game»: seasonal banners in fixed windows on the real calendar with the most recent
  unlocked edition; pinned banner (it did not exist); Limited with tickets only after the unlock of a banner that spends them.

## 9. Tests

- Offline tests (`server/test-gacha.js` or new ones): season active/not active on the windows across the year, most recent
  unlocked edition, none unlocked, several seasons together, no duplicates with the rotation; Limited with
  tickets before/after the threshold; pinnable/not pinnable for each exclusion; only one pinned, replacement,
  removal; Catalog filters (counts per year, medal, currency, state).
- Bench (test save or `player.json`, quest 525): `-RealNow` in a window (e.g. December: Black Friday 2016
  + Winter Holiday + New Year's Deal) and outside; pin a banner from the Catalog, exit and re-enter, draw; Catalog with
  tabs and filters; Notices. Screenshot at every step, style compared with the drafts.

## 10. Left to the builder

- Exact form of the `season` field and where table 4.1 lives (generator or rules file).
- Mechanism of the request of 6.3.
- Internal order among banners of the same seasonal edition (e.g. by `drawMedalTypeId`).
- Whether the medal search uses a precomputed index or filters on the fly.
