import { NextRequest, NextResponse } from "next/server";
import { fullScrape } from "@/lib/datagolf-scraper";
import { setDGCache, isDGCacheStale, analyzeBestScrapeDay, getDGCacheSummary } from "@/lib/datagolf-cache";

export async function POST(request: NextRequest) {
  // Protect endpoint
  const scrapeKey = request.headers.get("X-Scrape-Key");
  const expected = process.env.SCRAPE_SECRET;
  if (expected && scrapeKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const cacheSummary = getDGCacheSummary();

  if (!force && !isDGCacheStale()) {
    return NextResponse.json({
      success: true,
      cached: true,
      message: "Cache is populated and fresh (< 24h). Use ?force=true to override.",
      cache: cacheSummary,
    });
  }

  try {
    const result = await fullScrape();
    const scrapeSummary = getDGCacheSummary({
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

    setDGCache(result);
    const updatedCacheSummary = getDGCacheSummary();

    // Check if we have enough data to recommend optimal scrape day
    const scrapeAnalysis = analyzeBestScrapeDay();

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
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to trigger scrape. Include X-Scrape-Key header if SCRAPE_SECRET is set.",
    stale: isDGCacheStale(),
    cache: getDGCacheSummary(),
    optimization: analyzeBestScrapeDay(),
  });
}
