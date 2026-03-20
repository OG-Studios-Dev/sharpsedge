import { chromium } from 'playwright';

const base = 'https://goosalytics.vercel.app';
const routes = ['/', '/picks', '/schedule', '/props', '/trends', '/golf'];

async function collectPageMetrics(page, route) {
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (['error', 'warning'].includes(type)) {
      consoleMessages.push({ type, text: msg.text() });
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`));

  const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const html = document.documentElement;
    const vw = window.innerWidth;
    const scrollW = Math.max(html.scrollWidth, document.body?.scrollWidth || 0);
    const overflow = scrollW - vw;
    const skeletonCount = document.querySelectorAll('.skeleton-surface').length;
    const heading = document.querySelector('h1')?.textContent?.trim() || null;
    const hasEmptyCopy = /(No .* yet|No .* qualify|No .* match|coming soon|not live yet|launch Week 1|first in this build)/i.test(bodyText);
    return {
      title: document.title,
      heading,
      bodyLength: bodyText.length,
      scrollWidth: scrollW,
      viewportWidth: vw,
      overflow,
      skeletonCount,
      hasEmptyCopy,
      bodyStart: bodyText.slice(0, 500),
    };
  });

  return {
    route,
    status: response?.status() ?? null,
    url: page.url(),
    consoleMessages,
    pageErrors,
    failedRequests,
    metrics,
  };
}

async function testLeagueSwitcher(page, route, targets) {
  const results = [];
  for (const label of targets) {
    try {
      const dropdown = page.locator('button').filter({ hasText: /All Sports|NHL|NBA|MLB|PGA|EPL|Serie A/ }).first();
      await dropdown.click({ timeout: 5000 });
      const option = page.getByRole('button', { name: new RegExp(label) }).last();
      await option.click({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const snapshot = await page.evaluate(() => ({
        url: location.pathname,
        text: document.body?.innerText?.slice(0, 600) || '',
        h1: document.querySelector('h1')?.textContent?.trim() || null,
      }));
      results.push({ label, ok: true, snapshot });
    } catch (error) {
      results.push({ label, ok: false, error: String(error) });
    }
  }
  return { route, results };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3 });

const pageResults = [];
for (const route of routes) {
  const page = await context.newPage();
  try {
    pageResults.push(await collectPageMetrics(page, route));
  } finally {
    await page.close();
  }
}

const switcherChecks = [];
for (const route of ['/schedule', '/props', '/trends', '/picks']) {
  const page = await context.newPage();
  try {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1000);
    switcherChecks.push(await testLeagueSwitcher(page, route, ['NHL', 'NBA', 'PGA', 'EPL']));
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(JSON.stringify({ pageResults, switcherChecks }, null, 2));
