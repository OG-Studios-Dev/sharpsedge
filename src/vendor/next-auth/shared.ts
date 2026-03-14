import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { JWT, NextAuthOptions, Session } from "./types";

export const SESSION_COOKIE_NAME = "goosalytics.session-token";
const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getSecret(explicit?: string) {
  return explicit ?? process.env.NEXTAUTH_SECRET ?? "goosalytics-dev-secret";
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function signPayload(encodedPayload: string, secret?: string) {
  return toBase64Url(createHmac("sha256", getSecret(secret)).update(encodedPayload).digest());
}

export function getSessionMaxAge(options: NextAuthOptions) {
  return options.session?.maxAge ?? DEFAULT_SESSION_MAX_AGE;
}

export async function encodeToken(token: JWT, secret?: string) {
  const encodedPayload = toBase64Url(JSON.stringify(token));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function decodeToken(rawToken?: string | null, secret?: string) {
  if (!rawToken) {
    return null;
  }

  const [encodedPayload, providedSignature] = rawToken.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as JWT;

    if (typeof parsed.exp === "number" && parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function getTokenFromCookies() {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function buildSessionFromToken(token: JWT, options: NextAuthOptions): Promise<Session> {
  const expires = typeof token.exp === "number"
    ? new Date(token.exp * 1000).toISOString()
    : new Date(Date.now() + (getSessionMaxAge(options) * 1000)).toISOString();

  const session: Session = {
    user: {
      name: typeof token.name === "string" ? token.name : "",
      email: typeof token.email === "string" ? token.email : "",
    },
    expires,
  };

  if (token.sub) {
    session.user.id = token.sub;
  }

  if (options.callbacks?.session) {
    return options.callbacks.session({ session, token });
  }

  return session;
}
