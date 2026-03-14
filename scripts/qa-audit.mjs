import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, ".next", "server", "app");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function checkPageShells() {
  const checks = [
    ["home", "index.html", ["GOOSE AI PICKS", "100% Club", "Same-Game Parlays", "Trending Now", "Today&#x27;s Schedule"]],
    ["picks", "picks.html", ["GOOSE AI PICKS", "Today&#x27;s Goose AI Picks"]],
    ["props", "props.html", ["Props &amp; Analytics", "100% Club", "1P (Coming Soon)"]],
    ["trends", "trends.html", ["Trends", "Player", "Team"]],
    ["schedule", "schedule.html", ["Schedule", "Standings"]],
    ["teams", "teams.html", ["Teams", "League directory"]],
    ["search", "search.html", ["Search", "Search players, teams, or matchups"]],
    ["parlays", "parlays.html", ["Same-Game Parlays", "combined hit probability"]],
  ];

  return checks.map(([name, file, snippets]) => {
    const html = readText(path.join(".next", "server", "app", file));
    const missing = snippets.filter((snippet) => !html.includes(snippet));
    assert(missing.length === 0, `${name} shell missing: ${missing.join(", ")}`);
    return { name, status: "ok" };
  });
}

function checkStaticApiBodies() {
  const dashboard = readJson(".next/server/app/api/dashboard.body");
  const nbaDashboard = readJson(".next/server/app/api/nba/dashboard.body");
  const trends = readJson(".next/server/app/api/trends.body");
  const nbaTrends = readJson(".next/server/app/api/nba/trends.body");

  assert(Array.isArray(dashboard.props) && dashboard.props.length > 0, "dashboard props missing");
  assert(Array.isArray(dashboard.teamTrends) && dashboard.teamTrends.length > 0, "dashboard teamTrends missing");
  assert(Array.isArray(nbaDashboard.props) && nbaDashboard.props.length > 0, "nba dashboard props missing");
  assert(Array.isArray(nbaDashboard.teamTrends) && nbaDashboard.teamTrends.length > 0, "nba dashboard teamTrends missing");
  assert(Array.isArray(trends.props), "trends props missing");
  assert(Array.isArray(trends.teamTrends), "trends teamTrends missing");
  assert(Array.isArray(nbaTrends.props), "nba trends props missing");
  assert(Array.isArray(nbaTrends.teamTrends), "nba trends teamTrends missing");

  return {
    dashboard: { props: dashboard.props.length, teamTrends: dashboard.teamTrends.length },
    nbaDashboard: { props: nbaDashboard.props.length, teamTrends: nbaDashboard.teamTrends.length },
    trends: { props: trends.props.length, teamTrends: trends.teamTrends.length },
    nbaTrends: { props: nbaTrends.props.length, teamTrends: nbaTrends.teamTrends.length },
  };
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
    apis: checkStaticApiBodies(),
    resolve: await checkResolveRoute(),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
