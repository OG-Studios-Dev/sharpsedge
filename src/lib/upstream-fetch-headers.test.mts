import assert from "node:assert/strict";
import test from "node:test";
import upstreamHeaders from "./upstream-fetch-headers.ts";

const { upstreamFetchHeaders } = upstreamHeaders;

test("ESPN requests keep the runtime User-Agent because ESPN blocks browser-like bot headers", () => {
  assert.deepEqual(upstreamFetchHeaders("https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=1"), {});
});

test("non-ESPN upstreams retain the Goosalytics User-Agent", () => {
  assert.equal(
    upstreamFetchHeaders("https://api-web.nhle.com/v1/schedule/now")["User-Agent"],
    "Mozilla/5.0 (compatible; Goosalytics/1.0; +https://goosalytics.vercel.app)",
  );
});
