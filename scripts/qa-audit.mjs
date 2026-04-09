import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, ".next", "server", "app");

function readBuildModule(relativePath) {
  return fs.readFileSync(path.join(APP_DIR, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function snippetVariants(snippet) {
  return [
    snippet,
    snippet.replaceAll("'", "&#x27;"),
    snippet.replaceAll("&", "&amp;"),
  ];
}

function hasSnippet(text, snippet) {
  return snippetVariants(snippet).some((candidate) => text.includes(candidate));
}

function assertHasAll(text, snippets, label) {
  const missing = snippets.filter((snippet) => !hasSnippet(text, snippet));
  assert(missing.length === 0, `${label} missing: ${missing.join(", ")}`);
}

function assertLacksAll(text, snippets, label) {
  const unexpected = snippets.filter((snippet) => hasSnippet(text, snippet));
  assert(unexpected.length === 0, `${label} should not include: ${unexpected.join(", ")}`);
}

function checkPageShells() {
  const checks = [
    {
      name: "login",
      sourceFile: "src/app/login/page.tsx",
      required: ["Continue with Google", "Sign in with Email", "Create Account"],
    },
    {
      name: "signup",
      sourceFile: "src/app/signup/page.tsx",
      required: ["Create account", "Confirm Password", "Minimum 8 characters"],
    },
    {
      name: "home",
      file: "page.js",
      required: ["100% Club", "Quick Hitters", "Same-Game Parlays", "Trending Now"],
      forbidden: ["Today's Schedule", "Today’s Schedule", "GOOSE AI PICKS"],
    },
    {
      name: "picks",
      file: path.join("picks", "page.js"),
      required: ["Season Record", "Today's AI Picks", "View History"],
    },
    {
      name: "props",
      file: path.join("props", "page.js"),
      required: ["Props", "100% Club", "Players", "Team"],
    },
    {
      name: "trends",
      file: path.join("trends", "page.js"),
      required: ["Trends", "Player", "Team", "Direction"],
    },
    {
      name: "schedule",
      file: path.join("schedule", "page.js"),
      required: ["Schedule", "Standings"],
    },
    {
      name: "odds",
      file: path.join("odds", "page.js"),
      required: ["Best Lines", "Movement", "Sharp"],
    },
    {
      name: "history",
      file: path.join("picks", "history", "page.js"),
      required: ["Pick History", "All Sports"],
    },
  ];

  return checks.map((check) => {
    const text = check.sourceFile
      ? readText(check.sourceFile)
      : readBuildModule(check.file);

    assertHasAll(text, check.required, check.name);
    if (check.forbidden) {
      assertLacksAll(text, check.forbidden, check.name);
    }
    return { name: check.name, status: "ok" };
  });
}

function checkSourceGuards() {
  const sourceChecks = [
    {
      name: "nba-dashboard-fallback",
      file: "src/app/api/nba/dashboard/route.ts",
      forbidden: ["dashboard.body"],
    },
    {
      name: "nba-picks-fallback",
      file: "src/app/api/nba/picks/route.ts",
      forbidden: ["dashboard.body", "readBuiltDashboardFallback", "buildFallbackPicks"],
    },
    {
      name: "mlb-previous-season-fallback",
      file: "src/lib/mlb-live-data.ts",
      forbidden: ["getMLBScheduleRange", "previousSeason", "getFallbackSlate"],
    },
    {
      name: "nhl-seed-stats-source",
      file: "src/lib/live-data.ts",
      forbidden: ['statsSource: "seed"'],
    },
    {
      name: "live-props-seed-stats-source",
      file: "src/lib/live-props.ts",
      forbidden: ['statsSource: "seed"'],
    },
    {
      name: "nhl-prop-model-seed-stats-source",
      file: "src/lib/nhl-prop-model.ts",
      forbidden: ['statsSource: "seed"'],
    },
  ];

  return sourceChecks.map((check) => {
    const text = readText(check.file);
    assertLacksAll(text, check.forbidden, check.name);
    return { name: check.name, status: "ok" };
  });
}

async function checkResolveRoute() {
  const resolveModule = require(path.join(APP_DIR, "api", "picks", "resolve", "route.js"));
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const href = String(url);

    if (href.includes("api-web.nhle.com") && href.includes("/gamecenter/123456789/boxscore")) {
      return {
        ok: true,
        async json() {
          return {
            gameState: "OFF",
            periodDescriptor: { periodType: "REG" },
            clock: { running: false },
            homeTeam: { abbrev: "BOS", score: 2 },
            awayTeam: { abbrev: "TOR", score: 4 },
            playerByGameStats: {
              awayTeam: {
                forwards: [{ name: { default: "Auston Matthews" }, shots: 6, assists: 1, goals: 2 }],
                defense: [],
              },
              homeTeam: { forwards: [], defense: [] },
            },
          };
        },
      };
    }

    if (href.includes("site.api.espn.com") && href.includes("summary?event=401000001")) {
      return {
        ok: true,
        async json() {
          return {
            header: {
              competitions: [{
                status: {
                  type: {
                    completed: true,
                    name: "STATUS_FINAL",
                    detail: "Final",
                    shortDetail: "Final",
                  },
                },
              }],
            },
            boxscore: {
              players: [{
                team: { abbreviation: "LAL" },
                statistics: [{
                  labels: ["PTS", "REB", "AST", "3PT"],
                  athletes: [{ athlete: { displayName: "LeBron James" }, stats: ["28", "8", "9", "2-5"] }],
                }],
              }],
            },
          };
        },
      };
    }

    throw new Error(`Unexpected fetch during resolve audit: ${href}`);
  };

  try {
    const request = {
      async json() {
        return {
          picks: [
            {
              id: "nhl-1",
              date: "2026-03-14",
              type: "player",
              playerName: "Auston Matthews",
              team: "TOR",
              teamColor: "#000",
              opponent: "BOS",
              isAway: true,
              propType: "Shots on Goal",
              line: 4.5,
              direction: "Over",
              pickLabel: "Auston Matthews Over 4.5 Shots on Goal",
              edge: 12,
              hitRate: 80,
              confidence: 80,
              reasoning: "",
              result: "pending",
              units: 1,
              gameId: "123456789",
              odds: -110,
              league: "NHL",
            },
            {
              id: "nba-1",
              date: "2026-03-14",
              type: "player",
              playerName: "LeBron James",
              team: "LAL",
              teamColor: "#000",
              opponent: "PHX",
              isAway: false,
              propType: "Points",
              line: 24.5,
              direction: "Over",
              pickLabel: "LeBron James Over 24.5 Points",
              edge: 9,
              hitRate: 70,
              confidence: 70,
              reasoning: "",
              result: "pending",
              units: 1,
              gameId: "401000001",
              odds: -110,
              league: "NBA",
            },
          ],
        };
      },
    };

    const response = await resolveModule.routeModule.userland.POST(request);
    const data = await response.json();
    assert(Array.isArray(data.picks), "resolve route returned no picks array");
    assert(data.picks.every((pick) => pick.result === "win"), "resolve route did not mark mocked picks as wins");

    return data.picks.map((pick) => ({ id: pick.id, result: pick.result }));
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  assert(fs.existsSync(APP_DIR), "Build output missing. Run `npm run build` first.");

  const summary = {
    pages: checkPageShells(),
    sources: checkSourceGuards(),
    resolve: await checkResolveRoute(),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
