#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const input = process.argv[2] ?? 'out/dk-persistent/capture-002.txt';
const outputDir = process.argv[3] ?? 'out/dk-derived';
mkdirSync(outputDir, { recursive: true });

const html = readFileSync(input, 'utf8');
const marker = 'window.__INITIAL_STATE__ = ';
const start = html.indexOf(marker);
if (start === -1) throw new Error('INITIAL_STATE marker not found');

const afterMarker = html.slice(start + marker.length);

function tryBalancedObject(text) {
  let inString = false;
  let escape = false;
  let depth = 0;
  let begun = false;
  let objectStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!begun) {
      if (ch === '{') {
        begun = true;
        objectStart = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(objectStart, i + 1);
      }
    }
  }

  return null;
}

let jsonText = tryBalancedObject(afterMarker);

if (!jsonText) {
  const lastBrace = afterMarker.lastIndexOf('}');
  if (lastBrace !== -1) {
    jsonText = afterMarker.slice(afterMarker.indexOf('{'), lastBrace + 1);
  }
}

if (!jsonText) throw new Error('Could not extract INITIAL_STATE object');

let state;
try {
  state = JSON.parse(jsonText);
} catch (error) {
  const lastBrace = jsonText.lastIndexOf('}');
  if (lastBrace === -1) throw error;
  state = JSON.parse(jsonText.slice(0, lastBrace + 1));
}

writeFileSync(path.join(outputDir, 'initial-state.json'), JSON.stringify(state, null, 2));

const golf = state?.sports?.data?.find((sport) => sport.displayName === 'Golf') ?? null;
const masters = golf?.eventGroupInfos?.find((group) =>
  group.urlName === 'us-masters' || /masters/i.test(group.eventGroupName ?? ''),
) ?? null;

const result = {
  golfSport: golf ? {
    displayGroupId: golf.displayGroupId,
    displayName: golf.displayName,
    eventGroupCount: golf.eventGroupInfos?.length ?? 0,
  } : null,
  mastersEventGroup: masters,
  sampleGolfEventGroups: golf?.eventGroupInfos?.slice(0, 20) ?? [],
};

writeFileSync(path.join(outputDir, 'golf-summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
