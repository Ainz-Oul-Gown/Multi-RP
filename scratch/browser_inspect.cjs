const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Влад\\.gemini\\antigravity-ide\\brain\\309115da-3faa-4014-bfd1-ce130383714c';

async function main() {
  console.log('1. Launching Chrome at:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  console.log('2. Navigating to https://ainz-oul-gown.github.io/Multi-RP/ ...');
  await page.goto('https://ainz-oul-gown.github.io/Multi-RP/', { waitUntil: 'networkidle2', timeout: 30000 });

  await new Promise(r => setTimeout(r, 2000));

  const title = await page.title();
  console.log('Page title:', title);

  const screenshotPath = path.join(ARTIFACT_DIR, 'auth_screen.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Check if register link exists
  const html = await page.content();
  console.log('Page HTML length:', html.length);

  await browser.close();
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
