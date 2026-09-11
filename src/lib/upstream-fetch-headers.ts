const GOOSALYTICS_USER_AGENT = "Mozilla/5.0 (compatible; Goosalytics/1.0; +https://goosalytics.vercel.app)";

export function upstreamFetchHeaders(url: string): Record<string, string> {
  try {
    if (new URL(url).hostname === "site.api.espn.com") return {};
  } catch {
    // Let fetch surface malformed URLs; preserve the compatibility header here.
  }

  return { "User-Agent": GOOSALYTICS_USER_AGENT };
}

export default { upstreamFetchHeaders };
