import { NextResponse, type NextRequest } from "next/server";
import { setSessionCookies } from "@/lib/session-cookies";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, restoreSession } from "@/lib/supabase-shared";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);
const AUTH_ROUTES = new Set(["/login", "/signup"]);

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

  if (session) {
    if (pathname === "/" || AUTH_ROUTES.has(pathname)) {
      const response = NextResponse.redirect(new URL("/dashboard", request.url));
      setSessionCookies(response, session);
      return response;
    }
  } else {
    if (!PUBLIC_ROUTES.has(pathname)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
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
