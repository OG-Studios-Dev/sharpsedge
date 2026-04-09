#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const htmlPath = process.argv[2] ?? 'out/dk-persistent/capture-002.txt';
const outDir = process.argv[3] ?? 'out/dk-derived';
mkdirSync(outDir, { recursive: true });

const html = readFileSync(htmlPath, 'utf8');
const marker = 'window.__INITIAL_STATE__ = ';
const idx = html.indexOf(marker);
if (idx === -1) throw new Error('No INITIAL_STATE marker found');

const windowChunk = html.slice(idx, idx + 220000);

function extractArray(afterMarker) {
  const markerIndex = windowChunk.indexOf(afterMarker);
  if (markerIndex === -1) return null;
  const start = windowChunk.indexOf('[', markerIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < windowChunk.length; i++) {
    const ch = windowChunk[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return windowChunk.slice(start, i + 1);
      }
    }
  }
  return null;
}

const sportsArrayText = extractArray('"sports":{"data":');
if (!sportsArrayText) throw new Error('Could not isolate sports.data array');
const sports = JSON.parse(sportsArrayText);
const golf = sports.find((sport) => sport.displayName === 'Golf') ?? null;
const masters = golf?.eventGroupInfos?.find((group) => group.urlName === 'us-masters' || /masters/i.test(group.eventGroupName)) ?? null;

const result = {
  golf,
  masters,
};

writeFileSync(path.join(outDir, 'dk-golf-bootstrap.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  golfDisplayGroupId: golf?.displayGroupId ?? null,
  mastersEventGroupId: masters?.eventGroupId ?? null,
  mastersUrlName: masters?.urlName ?? null,
  golfEventGroups: golf?.eventGroupInfos?.length ?? 0,
}, null, 2));
