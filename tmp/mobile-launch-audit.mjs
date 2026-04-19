import { chromium, devices } from 'playwright';

const routes = ['/', '/picks', '/trends', '/props', '/schedule', '/odds', '/my-picks', '/login', '/signup', '/upgrade'];
const base = 'https://goosalytics.vercel.app';
const device = devices['iPhone 13'];

function isIgnorableFailedRequest(url, errorText) {
  return errorText === 'net::ERR_ABORTED' && url.includes('_rsc=');
}

function isIgnorableResponse(url, status) {
  if (url.includes('/_next/')) return true;
  if (url.includes('_rsc=')) return true;
  if (status < 400) return true;
  return false;
}

function isIgnorableConsoleError(text) {
  return /Failed to load resource: the server responded with a status of (404|409)/i.test(text);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...device });
const page = await context.newPage();
const results = [];

for (const route of routes) {
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('requestfailed');
  page.removeAllListeners('response');

  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    const errorText = req.failure()?.errorText || 'failed';
    if (!isIgnorableFailedRequest(req.url(), errorText)) {
      failedRequests.push({
        url: req.url(),
        error: errorText,
        method: req.method(),
        resourceType: req.resourceType(),
      });
    }
  });
  page.on('response', (res) => {
    if (!isIgnorableResponse(res.url(), res.status())) {
      badResponses.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
        resourceType: res.request().resourceType(),
      });
    }
  });

  const entry = {
    route,
    ok: true,
    finalUrl: null,
    title: null,
    h1: null,
    pageErrors: [],
    consoleErrors: [],
    badResponses: [],
    failedRequests: [],
  };

  try {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    entry.finalUrl = page.url();
    entry.title = await page.title();
    const h1 = page.locator('h1').first();
    entry.h1 = await h1.count() ? await h1.textContent() : null;
  } catch (err) {
    pageErrors.push(`goto:${String(err)}`);
  }

  entry.pageErrors = pageErrors.slice(0, 10);
  entry.consoleErrors = consoleErrors.filter((text) => !isIgnorableConsoleError(text)).slice(0, 10);
  entry.badResponses = badResponses.slice(0, 10);
  entry.failedRequests = failedRequests.slice(0, 10);
  entry.ok = entry.pageErrors.length === 0
    && entry.consoleErrors.length === 0
    && entry.badResponses.length === 0
    && entry.failedRequests.length === 0;

  results.push(entry);
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
