// Order of the Events tab (GET /stage/event, category 2). User 10-11-2026: the two catalog banners first (Raid Catalog,
// Event Catalog), then the kept raid and the kept event, then the week's raids and the week's events.
// A catalog banner is a card of eventType 0; a kept card is the «-kept» copy of a banner (routes-raid.js, routes-events.js).
const isCatalog = (c) => c.eventType === 0;
const isKept = (c) => /-kept\.png$/.test(String(c.bannerUrl || ''));

function eventsTabOrder(raids = [], eventCatalog = [], events = []) {
  const raidCatalog = raids.filter(isCatalog), raidRest = raids.filter((c) => !isCatalog(c));
  return [...raidCatalog, ...eventCatalog,
    ...raidRest.filter(isKept), ...events.filter(isKept),
    ...raidRest.filter((c) => !isKept(c)), ...events.filter((c) => !isKept(c))];
}

module.exports = { eventsTabOrder, isKept };
