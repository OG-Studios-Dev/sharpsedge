import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = process.env.PORT || '3110';
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const sport = process.argv[3] || '';
const lookbackDays = Number(process.argv[4] || process.env.SGO_GRADE_LOOKBACK_DAYS || 3);
const limit = Number(process.env.SGO_GRADE_LIMIT || 2000);

const child = spawn('./node_modules/.bin/next', ['dev', '-p', port], {
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
let logs = '';
child.stdout.on('data', (buf) => {
  const text = buf.toString();
  logs += text;
  process.stdout.write(text);
  if (text.includes('Ready in') || text.includes('Local:')) ready = true;
});
child.stderr.on('data', (buf) => {
  const text = buf.toString();
  logs += text;
  process.stderr.write(text);
  if (text.includes('Ready in') || text.includes('Local:')) ready = true;
});

try {
  for (let i = 0; i < 60 && !ready; i += 1) {
    await delay(1000);
  }
  if (!ready) throw new Error(`Next server did not become ready. Logs:\n${logs.slice(-4000)}`);

  const url = new URL(`http://127.0.0.1:${port}/api/admin/goose2/grade`);
  if (date) url.searchParams.set('date', date);
  if (sport) url.searchParams.set('sport', sport);

  const payload = {
    date: date || undefined,
    sport: sport || undefined,
    limit,
    lookbackDays,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  console.log('\n--- ROUTE RESPONSE ---');
  console.log(body);
  if (!response.ok) process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
