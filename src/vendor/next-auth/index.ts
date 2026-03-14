import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  buildSessionFromToken,
  decodeToken,
  encodeToken,
  getSessionMaxAge,
  getTokenFromCookies,
  SESSION_COOKIE_NAME,
} from "./shared";
import type { DefaultSession, JWT, NextAuthOptions, Session, User } from "./types";

function getRouteParts(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const authIndex = segments.lastIndexOf("auth");

  return {
    action: segments[authIndex + 1] ?? "",
    provider: segments[authIndex + 2] ?? "",
  };
}

async function parseRequestBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return request.json().catch(() => ({}));
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return {};
  }

  return Object.fromEntries(formData.entries());
}

async function handleCredentialsCallback(request: NextRequest, options: NextAuthOptions) {
  const { provider } = getRouteParts(request);
  const config = options.providers.find((entry) => entry.id === provider);

  if (!config) {
    return NextResponse.json({ ok: false, error: "Unsupported provider", status: 400, url: null }, { status: 400 });
  }

  const body = await parseRequestBody(request);
  const user = await config.authorize(body);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "CredentialsSignin", status: 401, url: null },
      { status: 401 },
    );
  }

  const maxAge = getSessionMaxAge(options);
  const now = Math.floor(Date.now() / 1000);
  let token: JWT = {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + maxAge,
  };

  if (options.callbacks?.jwt) {
    token = await options.callbacks.jwt({ token, user: user as User });
    token.iat = now;
    token.exp = now + maxAge;
  }

  const sessionToken = await encodeToken(token, options.secret);
  const callbackUrl = typeof body.callbackUrl === "string" && body.callbackUrl ? body.callbackUrl : "/";
  const response = NextResponse.json({ ok: true, error: null, status: 200, url: callbackUrl });

  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return response;
}

async function handleSignOut(request: NextRequest) {
  const body = await parseRequestBody(request);
  const callbackUrl = typeof body.callbackUrl === "string" && body.callbackUrl ? body.callbackUrl : "/";
  const response = NextResponse.json({ ok: true, status: 200, url: callbackUrl });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

async function handleSession(options: NextAuthOptions) {
  const rawToken = getTokenFromCookies();
  const token = await decodeToken(rawToken, options.secret);

  if (!token) {
    return NextResponse.json(null);
  }

  const session = await buildSessionFromToken(token, options);
  return NextResponse.json(session);
}

export default function NextAuth(options: NextAuthOptions) {
  return async function handler(request: NextRequest) {
    const { action, provider } = getRouteParts(request);

    if (request.method === "POST" && action === "callback" && provider) {
      return handleCredentialsCallback(request, options);
    }

    if (request.method === "POST" && action === "signout") {
      return handleSignOut(request);
    }

    if (request.method === "GET" && action === "session") {
      return handleSession(options);
    }

    if (request.method === "GET" && action === "signin") {
      const signInUrl = new URL(options.pages?.signIn ?? "/login", request.url);
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  };
}

export async function getServerSession(options: NextAuthOptions): Promise<Session | null> {
  const rawToken = cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
  const token = await decodeToken(rawToken, options.secret);

  if (!token) {
    return null;
  }

  return buildSessionFromToken(token, options);
}

export type { DefaultSession, NextAuthOptions, Session, User } from "./types";
