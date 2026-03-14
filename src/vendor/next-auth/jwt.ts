import type { NextRequest } from "next/server";
import { decodeToken, getTokenFromRequest } from "./shared";
import type { JWT } from "./types";

export async function getToken({
  req,
  secret,
}: {
  req: NextRequest;
  secret?: string;
}): Promise<JWT | null> {
  const rawToken = getTokenFromRequest(req);
  return decodeToken(rawToken, secret);
}

export type { JWT } from "./types";
