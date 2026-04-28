#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const mode = (process.argv[2] || '').toLowerCase();
const port = process.env.PORT || process.env.ASK_GOOSE_SWITCH_PORT || '3040';
const validModes = new Set(['api', 'qwen']);

if (!validModes.has(mode)) {
  console.error('Usage: node scripts/ask-goose-switch-mode.mjs <api|qwen>');
  console.error('  api  = current API-style explainer path (OpenAI when configured; deterministic fallback if not)');
  console.error('  qwen = local Ollama Qwen path (qwen2.5:7b-instruct)');
  process.exit(1);
}

const env = { ...process.env };
delete env.ASK_GOOSE_EXPLAINER_PROVIDER;
delete env.ASK_GOOSE_LOCAL_MODEL;

if (mode === 'qwen') {
  env.ASK_GOOSE_EXPLAINER_PROVIDER = 'ollama';
  env.ASK_GOOSE_LOCAL_MODEL = env.ASK_GOOSE_LOCAL_MODEL || 'qwen2.5:7b-instruct';
  env.ASK_GOOSE_OLLAMA_URL = env.ASK_GOOSE_OLLAMA_URL || 'http://127.0.0.1:11434';
  env.ASK_GOOSE_LOCAL_TIMEOUT_MS = env.ASK_GOOSE_LOCAL_TIMEOUT_MS || '60000';
  env.ASK_GOOSE_LOCAL_CACHE_TTL_MS = env.ASK_GOOSE_LOCAL_CACHE_TTL_MS || '300000';
}

const statePath = resolve('tmp/ask-goose-switch-state.json');
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, JSON.stringify({
  mode,
  port: Number(port),
  provider: env.ASK_GOOSE_EXPLAINER_PROVIDER || 'openai',
  model: env.ASK_GOOSE_LOCAL_MODEL || env.ASK_GOOSE_LLM_MODEL || null,
  ollamaUrl: env.ASK_GOOSE_OLLAMA_URL || null,
  startedAt: new Date().toISOString(),
}, null, 2));

console.log(`Ask Goose switch mode: ${mode}`);
console.log(`Local URL: http://localhost:${port}`);
console.log(`State: ${statePath}`);

const child = spawn('npm', ['run', 'dev', '--', '--port', port], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
