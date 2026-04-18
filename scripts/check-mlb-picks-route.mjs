const base = process.env.BASE_URL || 'http://localhost:3000';
const date = process.argv[2] || new Date().toISOString().slice(0, 10);

const res = await fetch(`${base}/api/mlb/picks?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }
console.log(JSON.stringify({ status: res.status, data }, null, 2));
