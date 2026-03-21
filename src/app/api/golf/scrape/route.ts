import { NextRequest, NextResponse } from "next/server";
import { fullScrape } from "@/lib/datagolf-scraper";
import { setDGCache, isDGCacheStale, analyzeBestScrapeDay, getDGCacheSummary, summarizeDGCache } from "@/lib/datagolf-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function runScrape(force: boolean) {
  const cacheSummary = await getDGCacheSummary();

  if (!force && !(await isDGCacheStale())) {
    return NextResponse.json({
      success: true,
      cached: true,
      message: "Cache is populated and fresh (< 24h). Use ?force=true to override.",
      cache: cacheSummary,
    });
  }

  const result = await fullScrape();
  const scrapeSummary = summarizeDGCache({
    cache: {
      lastScrape: result.timestamp,
      tournament: result.tournament,
      data: result,
      scrapeHistory: [],
    },
  });

  if (!scrapeSummary.ready) {
    return NextResponse.json(
      {
        success: false,
        status: "unusable",
        cached: false,
        cacheUpdated: false,
        tournament: result.tournament,
        playersScraped: {
          rankings: result.rankings.length,
          predictions: result.predictions.length,
          courseFit: result.courseFit.length,
          field: result.field.length,
        },
        reason: scrapeSummary.reason,
        errors: [...result.errors, scrapeSummary.reason],
        cache: cacheSummary,
      },
      { status: 502 },
    );
  }

  await setDGCache(result);
  const updatedCacheSummary = await getDGCacheSummary();
  const scrapeAnalysis = await analyzeBestScrapeDay();

  return NextResponse.json({
    success: true,
    status: "usable",
    cached: false,
    cacheUpdated: true,
    tournament: result.tournament,
    playersScraped: {
      rankings: result.rankings.length,
      predictions: result.predictions.length,
      courseFit: result.courseFit.length,
      field: result.field.length,
    },
    errors: result.errors.length > 0 ? result.errors : undefined,
    scrapeOptimization: scrapeAnalysis
      ? {
          recommendedDay: scrapeAnalysis.recommendation,
          dayAnalysis: scrapeAnalysis.analysis,
          note: "Based on 2+ tournaments of daily scraping data",
        }
      : {
          note: "Need more scrape history (10+ daily scrapes across 2 tournaments) to recommend optimal day",
        },
    cache: updatedCacheSummary,
  });
}

export async function POST(request: NextRequest) {
  const scrapeKey = request.headers.get("X-Scrape-Key");
  const expected = process.env.SCRAPE_SECRET;
  if (expected && scrapeKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";

  try {
    return await runScrape(force);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}

/**
 * GET handler for Vercel Cron. Vercel crons only support GET requests.
 * Authenticates via CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(request: NextRequest) {
  const isCron = request.nextUrl.searchParams.get("cron") === "true";

  if (!isCron) {
    // Info endpoint
    return NextResponse.json({
      message: "POST to trigger scrape. Add ?cron=true for Vercel cron trigger.",
      stale: await isDGCacheStale(),
      cache: await getDGCacheSummary(),
      optimization: await analyzeBestScrapeDay(),
    });
  }

  // Verify Vercel cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    return await runScrape(true);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
