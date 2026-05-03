import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.LAUNCH_GATE_BASE_URL || "https://goosalytics.vercel.app";
const RUN_BUILD = !process.argv.includes("--skip-build");
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-");
const reportDir = path.join(ROOT, "logs", "launch-qa");
fs.mkdirSync(reportDir, { recursive: true });

const routes = [
  "/",
  "/standings",
  "/schedule",
  "/ask-goose",
  "/trends",
  "/props",
  "/my-picks",
  "/golf",
  "/api/dashboard",
];

function run(label, command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...options,
  });
  return {
    label,
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - started,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function extractJson(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function smoke(route) {
  const url = `${BASE_URL}${route}`;
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = await response.arrayBuffer();
    return {
      route,
      url: response.url,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      bytes: body.byteLength,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      route,
      url,
      status: 0,
      ok: false,
      bytes: 0,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const checks = [];

checks.push(run("asset_fallbacks", "npm", ["run", "qa:assets"]));
checks.push(run("ask_goose_quality", "npm", ["run", "qa:ask-goose"]));
if (RUN_BUILD) checks.push(run("build", "npm", ["run", "build"]));

const routeSmokes = [];
for (const route of routes) {
  routeSmokes.push(await smoke(route));
}

const learning = run("learning_status", "npm", ["run", "goose:learning-status"]);
checks.push(learning);
const signalGate = run("signal_promotion_gate", "npm", ["run", "goose:promotion-gate", "--", "--failOnBlock=false"]);
checks.push(signalGate);
const learningJson = extractJson(learning.stdout);
const signalGateJson = extractJson(signalGate.stdout);
const modelStatus = learningJson?.snapshot?.status || "unknown";
const modelReady = ["production_candidate", "production_live"].includes(modelStatus);
const modelReasons = learningJson?.snapshot?.reasons || [];
const signalGateSummary = signalGateJson?.summary || null;

const siteOk = checks
  .filter((check) => check.label !== "learning_status")
  .every((check) => check.ok) && routeSmokes.every((route) => route.ok);

const modelOk = learning.ok && modelReady;
const launchOk = siteOk && modelOk;

const report = {
  ok: launchOk,
  generatedAt: now.toISOString(),
  baseUrl: BASE_URL,
  site_status: siteOk ? "pass" : "fail",
  model_status: modelStatus,
  model_launch_ready: modelOk,
  model_reasons: modelReasons,
  signal_gate: signalGateSummary,
  checks: checks.map((check) => ({
    label: check.label,
    ok: check.ok,
    status: check.status,
    durationMs: check.durationMs,
    command: check.command,
    stdoutTail: check.stdout.split("\n").slice(-30).join("\n"),
    stderrTail: check.stderr.split("\n").slice(-30).join("\n"),
  })),
  routeSmokes,
};

const failedChecks = report.checks.filter((check) => !check.ok).map((check) => check.label);
const failedRoutes = report.routeSmokes.filter((route) => !route.ok).map((route) => ({ route: route.route, status: route.status }));
const reportPath = path.join(reportDir, `${stamp}-launch-gate.json`);
const summaryPath = path.join(ROOT, "tmp", "latest-launch-gate.md");
const latestJsonPath = path.join(ROOT, "tmp", "latest-launch-gate.json");

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));

const summaryLines = [
  "# Goosalytics Launch Gate",
  "",
  `Generated: ${report.generatedAt}`,
  `Base URL: ${report.baseUrl}`,
  "",
  `- Overall launch gate: ${report.ok ? "PASS" : "FAIL"}`,
  `- Site status: ${report.site_status.toUpperCase()}`,
  `- Model status: ${report.model_status}`,
  `- Model launch ready: ${report.model_launch_ready ? "yes" : "no"}`,
  `- Signal gate approved candidates: ${report.signal_gate?.approved ?? "unknown"}`,
  `- Signal gate production allowed: ${report.signal_gate?.productionPromotionAllowed ? "yes" : "no"}`,
  `- Failed checks: ${failedChecks.length ? failedChecks.join(", ") : "none"}`,
  `- Failed routes: ${failedRoutes.length ? failedRoutes.map((route) => `${route.route} (${route.status})`).join(", ") : "none"}`,
  "",
  "## Model readiness reasons",
  ...(report.model_reasons.length ? report.model_reasons.map((reason) => `- ${reason}`) : ["- none"]),
  "",
  "## Route smokes",
  ...report.routeSmokes.map((route) => `- ${route.route}: ${route.ok ? "PASS" : "FAIL"} HTTP ${route.status}, ${route.bytes} bytes, ${route.durationMs}ms`),
  "",
  `Full JSON report: ${reportPath}`,
];
fs.writeFileSync(summaryPath, `${summaryLines.join("\n")}\n`);

console.log(JSON.stringify({
  ok: report.ok,
  site_status: report.site_status,
  model_status: report.model_status,
  model_launch_ready: report.model_launch_ready,
  signal_gate: report.signal_gate,
  reportPath,
  summaryPath,
  failedChecks,
  failedRoutes,
  model_reasons: report.model_reasons,
}, null, 2));

process.exit(report.ok ? 0 : 1);
