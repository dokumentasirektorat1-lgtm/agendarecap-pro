const { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } = require('date-fns');

const currentDate = new Date('2026-07-01T12:00:00.000Z'); // test July 2026 (shows June 28)

const monthStart = startOfMonth(currentDate);
const monthEnd = endOfMonth(monthStart);
const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

let day = startDate;
let weekCount = 0;
let allDays = [];
let dupesInAll = 0;
while (day <= endDate) {
  let daysStr = [];
  for (let i = 0; i < 7; i++) {
    daysStr.push(`day-${day.toISOString()}`);
    allDays.push(`day-${day.toISOString()}`);
    day = addDays(day, 1);
  }
  let dupes = daysStr.filter((item, index) => daysStr.indexOf(item) !== index);
  if (dupes.length > 0) console.log('\nDUPLICATE IN DAYS:', dupes);
  weekCount++;
}
console.log('Total days generated:', allDays.length);
console.log('Unique days generated:', new Set(allDays).size);
