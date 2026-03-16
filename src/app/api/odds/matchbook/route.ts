import { NextResponse } from "next/server";

// Run this function from Ireland to bypass Matchbook's region block
export const runtime = "edge";
export const preferredRegion = "dub1";

const MATCHBOOK_BASE = "https://api.matchbook.com/bpapi/rest";
const MB_USERNAME = process.env.MATCHBOOK_USERNAME;
const MB_PASSWORD = process.env.MATCHBOOK_PASSWORD;

let sessionCache: { token: string; expires: number } | null = null;

async function getSessionToken(): Promise<string | null> {
  if (sessionCache && Date.now() < sessionCache.expires) {
    return sessionCache.token;
  }

  if (!MB_USERNAME || !MB_PASSWORD) return null;

  try {
    const res = await fetch(`${MATCHBOOK_BASE}/security/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: MB_USERNAME, password: MB_PASSWORD }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const token = data["session-token"];
    if (!token) return null;

    // Cache for 5 hours (sessions last ~6 hours)
    sessionCache = { token, expires: Date.now() + 5 * 60 * 60 * 1000 };
    return token;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const token = await getSessionToken();
    if (!token) {
      return NextResponse.json({ events: [], error: "auth_failed" });
    }

    // Fetch NBA events from Matchbook
    const res = await fetch(`${MATCHBOOK_BASE}/events?offset=0&per-page=20&states=open&exchange-type=back-lay&odds-type=US&include-prices=true&price-depth=1&sport-ids=15`, {
      headers: {
        "session-token": token,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ events: [], error: `matchbook_${res.status}` });
    }

    const data = await res.json();
    return NextResponse.json({ events: data.events || [], total: data.total || 0 });
  } catch (error) {
    return NextResponse.json({ events: [], error: "fetch_failed" });
  }
}
