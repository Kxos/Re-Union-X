// Seasonal home plaza by date (I-233): node server/test-home-plaza.js
'use strict';
const { plazaId, anniversaryId } = require('./home-plaza');
const errors = [];
const check = (got, want, msg) => { if (got !== want) errors.push(`${msg}: ${got}, want ${want}`); };
// game day: 08:00 UTC starts the day
const at = (iso, story = '2016-04-07') => plazaId(Date.parse(iso), story);

check(at('2027-01-01T08:00:00Z'), 170111, '1 Jan New Year');
check(at('2027-01-01T07:59:59Z'), 161231, '1 Jan before 08:00 UTC is still 31 Dec');
check(at('2027-01-14T20:00:00Z'), 170111, '14 Jan');
check(at('2027-01-15T09:00:00Z'), 150911, '15 Jan normal');
check(at('2027-02-01T09:00:00Z'), 160211, '1 Feb Valentine');
check(at('2027-02-14T23:00:00Z'), 160211, '14 Feb Valentine');
check(at('2027-02-15T09:00:00Z'), 150911, '15 Feb normal');
check(at('2027-03-10T09:00:00Z'), 160311, '10 Mar White Day');
check(at('2027-03-15T09:00:00Z'), 150911, '15 Mar normal');
check(at('2027-04-01T09:00:00Z'), 160911, '1 Apr anniversary (story 2016) = 1st');
check(at('2027-04-30T09:00:00Z', '2019-06-01'), 190911, '30 Apr anniversary (story 2019) = 4th');
check(at('2027-05-01T09:00:00Z'), 150911, 'May normal');
check(at('2027-09-15T09:00:00Z', '2021-06-28'), 200911, 'Sep anniversary (story 2021) clamped to the 5th');
check(at('2027-10-01T09:00:00Z'), 161011, '1 Oct Halloween');
check(at('2027-10-31T23:00:00Z'), 161011, '31 Oct Halloween');
check(at('2027-11-05T09:00:00Z'), 150911, 'November normal');
check(at('2027-12-01T09:00:00Z'), 161211, '1 Dec winter');
check(at('2027-12-20T09:00:00Z'), 161211, '20 Dec winter');
check(at('2027-12-21T09:00:00Z'), 161221, '21 Dec Christmas');
check(at('2027-12-26T09:00:00Z'), 161221, '26 Dec Christmas');
check(at('2027-12-27T09:00:00Z'), 161231, '27 Dec end of year');
check(at('2027-12-31T09:00:00Z'), 161231, '31 Dec end of year');
check(at('2031-02-05T09:00:00Z'), 160211, 'every year');
for (const [y, id] of [['2015', 160911], ['2016', 160911], ['2017', 170911], ['2018', 180911], ['2019', 190911], ['2020', 200911], ['2024', 200911]]) {
  check(anniversaryId(`${y}-05-05`), id, `anniversary of story year ${y}`);
}
check(anniversaryId(undefined), 160911, 'no story date: 1st');

if (errors.length) { console.log(`ERRORS (${errors.length}):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log('test-home-plaza: OK');
