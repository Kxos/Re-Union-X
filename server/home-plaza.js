// Seasonal home plaza (I-233, docs/notes/home_profilo.md#seasonal-backgrounds): the mypageBackground id that /mypage
// sends as backgroundId. The client draws only that row (its startTime/endTime are not read), so the server chooses by
// date, as the original server did. Dates reconstructed from the seasonal events (no notice states them; user 05-11),
// every year, on the game day (it starts at 08:00 UTC, like the daily reset: clock.js):
//   1-14 Jan New Year 170111, 1-14 Feb Valentine's Day 160211, 1-14 Mar White Day 160311 (JP custom),
//   1-30 Apr (WW anniversary) and 1-30 Sep (JP anniversary) Happy Nth Anniversary 1N0911, October Halloween 161011,
//   1-20 Dec winter 161211, 21-26 Dec Christmas night 161221, 27-31 Dec end of year 161231, otherwise 150911.
// N = year of the player's story date - 2015, clamped 1..5 (160911 = 1st ... 200911 = 5th).
'use strict';
const H8 = 8 * 3600000;
const NORMAL = 150911;

function anniversaryId(storyDay) {
  const year = Number(String(storyDay || '').slice(0, 4));
  const n = Math.min(5, Math.max(1, Number.isFinite(year) && year > 0 ? year - 2015 : 1));
  return (15 + n) * 10000 + 911;
}

// realMs: server real time (realNow, moved by -RealNow); storyDay: 'YYYY-MM-DD' of the player's story (storyCtx)
function plazaId(realMs, storyDay) {
  const d = new Date(realMs - H8);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if (m === 1 && day <= 14) return 170111;
  if (m === 2 && day <= 14) return 160211;
  if (m === 3 && day <= 14) return 160311;
  if ((m === 4 || m === 9) && day <= 30) return anniversaryId(storyDay);
  if (m === 10) return 161011;
  if (m === 12) return day <= 20 ? 161211 : day <= 26 ? 161221 : 161231;
  return NORMAL;
}

module.exports = { plazaId, anniversaryId, NORMAL };
