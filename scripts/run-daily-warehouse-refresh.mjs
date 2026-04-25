#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const baseUrl = (process.env.GOOSALYTICS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://goosalytics.vercel.app').replace(/\/$/, '');
const cronSecret = process.env.CRON_SECRET || '';
const sports = process.env.SGO_DAILY_SPORTS || 'NBA,NHL,MLB,NFL';
const reason = process.env.SGO_DAILY_REASON || 'lm-daily-archive';
const timeoutMs = Number(process.env.SGO_DAILY_TIMEOUT_MS || 120000);

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function callSnapshot() {
  if (!cronSecret) {
    throw new Error('CRON_SECRET is required because /api/odds/aggregated/snapshot?cron=true fails closed without it');
  }

  const url = `${baseUrl}/api/odds/aggregated/snapshot?cron=true&capture=true&sports=${encodeURIComponent(sports)}&reason=${encodeURIComponent(reason)}`;
  const { controller, timeout } = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok || body?.ok === false) {
      throw new Error(`Snapshot capture failed HTTP ${response.status}: ${text.slice(0, 1000)}`);
    }
    return { ok: true, url, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

const result = await callSnapshot();
console.log(JSON.stringify({
  ok: true,
  ranAt: new Date().toISOString(),
  baseUrl,
  sports: sports.split(',').map((s) => s.trim()).filter(Boolean),
  reason,
  snapshot: result.body,
}, null, 2));
