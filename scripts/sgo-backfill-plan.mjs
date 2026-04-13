#!/usr/bin/env node

const start = new Date(process.argv[2] || '2024-02-01T00:00:00Z');
const end = new Date(process.argv[3] || new Date().toISOString());
const leagues = (process.argv[4] || 'NBA,NHL,MLB').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

function monthStart(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}
function nextMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
}
function iso(d) { return d.toISOString(); }
function monthKey(d) { return d.toISOString().slice(0, 7); }

const rows = [];
for (const league of leagues) {
  for (let cur = monthStart(start); cur <= end; cur = nextMonth(cur)) {
    const next = nextMonth(cur);
    const windowEnd = next < end ? new Date(next.getTime() - 1000) : end;
    rows.push({
      league,
      month: monthKey(cur),
      startsAfter: iso(cur),
      startsBefore: iso(windowEnd),
    });
  }
}
console.log(JSON.stringify(rows, null, 2));
