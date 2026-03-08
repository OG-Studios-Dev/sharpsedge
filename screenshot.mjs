import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
await page.goto('http://localhost:3000/trends', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/Users/tonysoprano/Projects/sharpedge/screenshot-trends-v2.jpg', type: 'jpeg', quality: 90, fullPage: true });
await browser.close();
