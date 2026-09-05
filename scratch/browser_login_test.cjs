const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Влад\\.gemini\\antigravity-ide\\brain\\309115da-3faa-4014-bfd1-ce130383714c';

async function main() {
  console.log('1. Launching Chrome...');
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
  console.log('2. Navigating to https://ainz-oul-gown.github.io/Multi-RP/ ...');
  await page.goto('https://ainz-oul-gown.github.io/Multi-RP/', { waitUntil: 'networkidle2', timeout: 30000 });

  await new Promise(r => setTimeout(r, 1500));

  // Type login credentials
  console.log('3. Logging in with auto_test_player_2026@test.com ...');
  await page.waitForSelector('#authEmail', { timeout: 5000 });
  await page.type('#authEmail', 'auto_test_player_2026@test.com');
  await page.type('#authPassword', 'TestPassword123!');
  await page.click('#authSubmit');

  console.log('4. Waiting for Lobby to load...');
  await page.waitForSelector('.lobby-header', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  const lobbyScreenshot = path.join(ARTIFACT_DIR, 'lobby_screen.png');
  await page.screenshot({ path: lobbyScreenshot, fullPage: true });
  console.log('✅ Lobby screenshot saved:', lobbyScreenshot);

  // Click account settings modal
  console.log('5. Opening Account Settings Modal...');
  await page.click('#accountSettingsBtn');
  await new Promise(r => setTimeout(r, 1000));

  const settingsScreenshot = path.join(ARTIFACT_DIR, 'settings_modal.png');
  await page.screenshot({ path: settingsScreenshot, fullPage: true });
  console.log('✅ Settings modal screenshot saved:', settingsScreenshot);

  // Close settings modal
  await page.click('#closeAccountModal');
  await new Promise(r => setTimeout(r, 500));

  // Switch to Characters tab
  console.log('6. Switching to Characters tab...');
  const charTab = await page.$('.lobby-tab[data-tab="characters"]');
  if (charTab) {
    await charTab.click();
    await new Promise(r => setTimeout(r, 1000));
    const charsScreenshot = path.join(ARTIFACT_DIR, 'characters_tab.png');
    await page.screenshot({ path: charsScreenshot, fullPage: true });
    console.log('✅ Characters tab screenshot saved:', charsScreenshot);
  }

  // Switch to Sessions tab and enter session if any
  console.log('7. Checking Sessions tab...');
  const sessTab = await page.$('.lobby-tab[data-tab="sessions"]');
  if (sessTab) {
    await sessTab.click();
    await new Promise(r => setTimeout(r, 1000));

    const joinBtn = await page.$('[data-action="join"]');
    if (joinBtn) {
      console.log('Entering game session...');
      await joinBtn.click();
      await new Promise(r => setTimeout(r, 2500));
      const gameScreenshot = path.join(ARTIFACT_DIR, 'game_screen.png');
      await page.screenshot({ path: gameScreenshot, fullPage: true });
      console.log('✅ Game screen screenshot saved:', gameScreenshot);
    }
  }

  await browser.close();
  console.log('🎉 Full automated test completed successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
