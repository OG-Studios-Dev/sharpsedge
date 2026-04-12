#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cachePath = process.argv[2];
const sport = (process.argv[3] || 'NBA').toUpperCase();
if (!cachePath) throw new Error('Usage: node scripts/sgo-normalize-cache.mjs <cachePath> <sport>');

const abs = path.isAbsolute(cachePath) ? cachePath : path.join(process.cwd(), cachePath);
const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
const payload = raw.payload ?? raw;

const mod = await import(pathToFileURL(path.join(process.cwd(), 'scripts/lib/sgo-normalize-standalone.mjs')).href);
const mapped = mod.mapSportsGameOddsToGoose2(payload, sport);

const outPath = abs.replace(/\.json$/i, `.goose2.${sport}.json`);
fs.writeFileSync(outPath, JSON.stringify(mapped, null, 2));
console.log(JSON.stringify({ outPath, summary: mapped.summary }, null, 2));
