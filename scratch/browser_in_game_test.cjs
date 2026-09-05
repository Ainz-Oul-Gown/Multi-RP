const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Влад\\.gemini\\antigravity-ide\\brain\\309115da-3faa-4014-bfd1-ce130383714c';

async function main() {
  console.log('1. Launching Chrome for in-game test...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    defaultViewport: { width: 1280, height: 850 }
  });

  const page = await browser.newPage();
  console.log('2. Navigating to live app...');
  await page.goto('https://ainz-oul-gown.github.io/Multi-RP/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  await new Promise(r => setTimeout(r, 1500));

  // Login
  await page.waitForSelector('#authEmail', { timeout: 5000 });
  await page.type('#authEmail', 'auto_test_player_2026@test.com');
  await page.type('#authPassword', 'TestPassword123!');
  await page.click('#authSubmit');

  await page.waitForSelector('.lobby-header', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  // Join session
  const joinBtn = await page.$('[data-action="join"]');
  if (joinBtn) {
    await joinBtn.click();
    console.log('3. Clicked join session...');
    await new Promise(r => setTimeout(r, 2000));

    // If character selection is shown, click "Выбрать этого героя"
    const selectBtn = await page.$('.char-select-btn');
    if (selectBtn) {
      console.log('4. Selecting hero «Валериан»...');
      await selectBtn.click();
      await new Promise(r => setTimeout(r, 3000));
    }

    // Capture in-game screen after toast fades
    await page.waitForSelector('.game-header', { timeout: 10000 });
    console.log('Waiting 4.5s for toast notification to fade...');
    await new Promise(r => setTimeout(r, 4500));

    const inGameScreenshot = path.join(ARTIFACT_DIR, 'in_game_play_clean.png');
    await page.screenshot({ path: inGameScreenshot, fullPage: true });
    console.log('✅ Clean In-game screenshot saved:', inGameScreenshot);

    // Also test mobile viewport (390 x 844)
    console.log('5. Testing mobile viewport 390x844 ...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 1500));
    const mobileGameScreenshot = path.join(ARTIFACT_DIR, 'in_game_mobile_clean.png');
    await page.screenshot({ path: mobileGameScreenshot, fullPage: true });
    console.log('✅ Mobile game screenshot saved:', mobileGameScreenshot);
  }

  await browser.close();
  console.log('🎉 Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
