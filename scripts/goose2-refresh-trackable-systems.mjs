import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' });

const { refreshTrackableSystems } = await import('../src/lib/systems-tracking-store.ts');

const systems = await refreshTrackableSystems({ date: targetDate });
const summary = systems.map((system) => ({
  id: system.id,
  name: system.name,
  record_count: Array.isArray(system.records) ? system.records.length : 0,
  snapshot: system.snapshot ?? null,
  status: system.status,
}));

fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-trackable-refresh-report.json'), JSON.stringify({
  target_date: targetDate,
  refreshed_count: systems.length,
  systems: summary,
}, null, 2));

console.log(JSON.stringify({
  target_date: targetDate,
  refreshed_count: systems.length,
  systems: summary,
}, null, 2));
