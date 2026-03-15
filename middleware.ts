import { NextResponse, type NextRequest } from "next/server";
import { setSessionCookies } from "@/lib/session-cookies";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, restoreSession } from "@/lib/supabase-shared";
import { PROFILE_TIER_COOKIE_NAME } from "@/lib/session-cookies";
import { hasTierAccess, isPreLaunchMode, normalizeTier, type ProfileTier } from "@/lib/tier-access";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);
const AUTH_ROUTES = new Set(["/login", "/signup"]);
const TIER_GATED_ROUTES: Array<{
  prefix: string;
  requiredTier: ProfileTier;
  feature: string;
}> = [
  { prefix: "/odds", requiredTier: "pro", feature: "odds_board" },
  { prefix: "/parlays", requiredTier: "sharp", feature: "sgp_builder" },
  { prefix: "/my-picks", requiredTier: "sharp", feature: "my_picks" },
];

function isAssetPath(pathname: string) {
  return pathname.startsWith("/_next")
    || pathname.startsWith("/api")
    || pathname.startsWith("/auth")
    || pathname === "/favicon.ico"
    || pathname === "/manifest.json"
    || pathname.startsWith("/icon-");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAssetPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value ?? null;
  const session = await restoreSession(accessToken, refreshToken);

  if (AUTH_ROUTES.has(pathname) && session) {
    const response = NextResponse.redirect(new URL("/", request.url));
    setSessionCookies(response, session);
    return response;
  }

  if (!PUBLIC_ROUTES.has(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session && pathname !== "/upgrade") {
    const gate = TIER_GATED_ROUTES.find((route) => pathname.startsWith(route.prefix));
    if (gate) {
      const tierCookie = request.cookies.get(PROFILE_TIER_COOKIE_NAME)?.value;
      const currentTier = isPreLaunchMode()
        ? "beta"
        : normalizeTier(tierCookie);

      if (!hasTierAccess(currentTier, gate.requiredTier)) {
        const upgradeUrl = new URL("/upgrade", request.url);
        upgradeUrl.searchParams.set("feature", gate.feature);
        upgradeUrl.searchParams.set("tier", gate.requiredTier);
        return NextResponse.redirect(upgradeUrl);
      }
    }
  }

  const response = NextResponse.next();
  if (session) {
    setSessionCookies(response, session);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
