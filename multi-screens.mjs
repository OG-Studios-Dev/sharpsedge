import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const shots = [
  ['http://localhost:3000/', '/Users/tonysoprano/.openclaw/workspace-marco/out/goosalytics-home.jpg'],
  ['http://localhost:3000/trends', '/Users/tonysoprano/.openclaw/workspace-marco/out/goosalytics-trends.jpg'],
  ['http://localhost:3000/props', '/Users/tonysoprano/.openclaw/workspace-marco/out/goosalytics-props.jpg'],
  ['http://localhost:3000/leagues', '/Users/tonysoprano/.openclaw/workspace-marco/out/goosalytics-leagues.jpg']
];
for (const [url, path] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path, type: 'jpeg', quality: 90, fullPage: true });
}
await browser.close();
