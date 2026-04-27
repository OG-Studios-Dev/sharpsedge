import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function requireMatch(text, pattern, label) {
  assert(pattern.test(text), `${label} missing expected pattern: ${pattern}`);
}

function main() {
  const avatar = readText("src/components/PlayerAvatar.tsx");
  const header = readText("src/components/player/PlayerHeader.tsx");
  const nbaRoute = readText("src/app/api/nba/player/[name]/game-log/route.ts");
  const playerResearch = readText("src/lib/player-research.ts");

  requireMatch(avatar, /useState/, "PlayerAvatar stateful fallback");
  requireMatch(avatar, /const\s+displaySrc\s*=\s*imageError\s*\?\s*null\s*:\s*src/, "PlayerAvatar broken-image fallback guard");
  requireMatch(avatar, /onError=\{\(\) => setImageError\(true\)\}/, "PlayerAvatar onError fallback");
  requireMatch(avatar, /<TeamLogo[\s\S]*sport=\{league \?\? undefined\}/, "PlayerAvatar team logo fallback render");

  requireMatch(header, /imageError\s*\?\s*null\s*:\s*getPlayerHeadshot/, "PlayerHeader broken-image fallback guard");
  requireMatch(header, /onError=\{\(\) => setImageError\(true\)\}/, "PlayerHeader onError fallback");
  requireMatch(header, /<TeamLogo team=\{team \|\| name\.slice\(0, 3\)\}/, "PlayerHeader team logo fallback render");

  requireMatch(nbaRoute, /playerId:\s*logs\[0\]\?\.playerId \? Number\(logs\[0\]\.playerId\) : rosterEntry\?\.id/, "NBA player route playerId payload");
  requireMatch(playerResearch, /playerId\?: string \| number \| null;/, "PlayerIdentity playerId field");

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "PlayerAvatar missing-headshot fallback",
      "PlayerAvatar broken-headshot fallback",
      "PlayerHeader broken-headshot fallback",
      "NBA player route exposes playerId for shared headshot resolver"
    ]
  }, null, 2));
}

main();
