#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const apiKeys = Array.from(new Set(
  [process.env.SPORTSGAMEODDS_API_KEYS, process.env.SPORTSGAMEODDS_API_KEY]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
));

if (!apiKeys.length) throw new Error('Missing SPORTSGAMEODDS_API_KEY(S)');

async function checkKey(key, index) {
  const res = await fetch('https://api.sportsgameodds.com/v2/account/usage', {
    headers: { accept: 'application/json', 'x-api-key': key },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const usage = data?.data?.rateLimits?.['per-month'] ?? null;
  return {
    keyIndex: index + 1,
    ok: res.ok,
    status: res.status,
    usage,
    remainingApprox: usage ? Number(usage['max-entities'] ?? 0) - Number(usage['current-entities'] ?? 0) : null,
  };
}

const results = [];
for (let i = 0; i < apiKeys.length; i += 1) {
  results.push(await checkKey(apiKeys[i], i));
}

results.sort((a, b) => (b.remainingApprox ?? -Infinity) - (a.remainingApprox ?? -Infinity));
console.log(JSON.stringify({ ok: true, keys: results.length, ranked: results }, null, 2));
