import { NextRequest, NextResponse } from "next/server";
import { fullScrape } from "@/lib/datagolf-scraper";
import { setDGCache, isDGCacheStale, analyzeBestScrapeDay } from "@/lib/datagolf-cache";

export async function POST(request: NextRequest) {
  // Protect endpoint
  const scrapeKey = request.headers.get("X-Scrape-Key");
  const expected = process.env.SCRAPE_SECRET;
  if (expected && scrapeKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";

  if (!force && !isDGCacheStale()) {
    return NextResponse.json({
      success: true,
      cached: true,
      message: "Cache is fresh (< 24h). Use ?force=true to override.",
    });
  }

  try {
    const result = await fullScrape();
    setDGCache(result);

    // Check if we have enough data to recommend optimal scrape day
    const scrapeAnalysis = analyzeBestScrapeDay();

    return NextResponse.json({
      success: true,
      cached: false,
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
    optimization: analyzeBestScrapeDay(),
  });
}
