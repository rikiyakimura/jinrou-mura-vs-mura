// Playwright で主催者と参加者が実際にゲームを進めるテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  // コンソールログ監視
  const setupLogging = (page, name) => {
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'log' || type === 'error') {
        console.log(`[${name}] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => console.error(`[${name}][ERROR] ${err.message}`));
  };

  setupLogging(hostPage, 'HOST');
  setupLogging(guestPage, 'GUEST');

  console.log('=== ルーム作成 ===');
  await hostPage.goto('http://localhost:5174/');
  await hostPage.waitForTimeout(1000);
  await hostPage.click('button:has-text("オンライン対戦")');
  await hostPage.waitForTimeout(500);
  await hostPage.click('button:has-text("ルームを作成")');
  await hostPage.waitForTimeout(500);
  await hostPage.fill('#host-name-input', 'ホスト');
  await hostPage.click('button:has-text("ルーム作成")');
  await hostPage.waitForTimeout(2000);

  const roomCodeElement = await hostPage.locator('div:has-text("この暗証番号を友達に教えてください")').locator('..').locator('div[style*="font-size:48px"]');
  const roomCode = await roomCodeElement.textContent();
  console.log(`ルームコード: ${roomCode.trim()}\n`);

  console.log('=== ルーム参加 ===');
  await guestPage.goto('http://localhost:5174/');
  await guestPage.waitForTimeout(1000);
  await guestPage.click('button:has-text("オンライン対戦")');
  await guestPage.waitForTimeout(500);
  await guestPage.click('button:has-text("ルームに参加")');
  await guestPage.waitForTimeout(500);
  await guestPage.fill('#guest-name-input', 'ゲスト');
  await guestPage.fill('#room-code-input', roomCode.trim());
  await guestPage.click('button:has-text("参加")');
  await guestPage.waitForTimeout(3000);

  console.log('\n=== フェーズ1: 配置 (place) ===');

  // ホスト側の配置
  console.log('ホスト: 5人を配置中...');
  for (let i = 0; i < 5; i++) {
    await hostPage.click('.house.pick');
    await hostPage.waitForTimeout(300);
  }
  console.log('ホスト: 配置完了');

  // ゲスト側の配置
  console.log('ゲスト: 5人を配置中...');
  for (let i = 0; i < 5; i++) {
    await guestPage.click('.house.pick');
    await guestPage.waitForTimeout(300);
  }
  console.log('ゲスト: 配置完了\n');

  await hostPage.waitForTimeout(2000);

  // 現在のフェーズを確認
  const hostPhase1 = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, day: c.day };
  });
  const guestPhase1 = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, day: c.day };
  });

  console.log('=== フェーズ確認 (配置後) ===');
  console.log('ホスト:', hostPhase1);
  console.log('ゲスト:', guestPhase1);
  console.log();

  // スクリーンショット
  await hostPage.screenshot({ path: 'play-host-after-place.png' });
  await guestPage.screenshot({ path: 'play-guest-after-place.png' });

  console.log('=== フェーズ2: 探索者選定 (explorer) ===');

  // 探索者を選択できるチップがあるか確認
  const hostExplorerAvailable = await hostPage.locator('.chip').count();
  const guestExplorerAvailable = await guestPage.locator('.chip').count();

  console.log(`ホスト: 探索者選択可能数 = ${hostExplorerAvailable}`);
  console.log(`ゲスト: 探索者選択可能数 = ${guestExplorerAvailable}`);

  if (hostExplorerAvailable > 0) {
    console.log('ホスト: 探索者を選択中...');
    await hostPage.locator('.chip').first().click();
    await hostPage.waitForTimeout(1000);
    console.log('ホスト: 探索者選択完了');
  }

  if (guestExplorerAvailable > 0) {
    console.log('ゲスト: 探索者を選択中...');
    await guestPage.locator('.chip').first().click();
    await guestPage.waitForTimeout(1000);
    console.log('ゲスト: 探索者選択完了\n');
  }

  await hostPage.waitForTimeout(2000);

  // フェーズ確認
  const hostPhase2 = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, day: c.day };
  });
  const guestPhase2 = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, day: c.day };
  });

  console.log('=== フェーズ確認 (探索者選定後) ===');
  console.log('ホスト:', hostPhase2);
  console.log('ゲスト:', guestPhase2);
  console.log();

  await hostPage.screenshot({ path: 'play-host-after-explorer.png' });
  await guestPage.screenshot({ path: 'play-guest-after-explorer.png' });

  console.log('\n=== 30秒間画面を確認できます ===');
  await hostPage.waitForTimeout(30000);

  await browser.close();
  console.log('テスト完了');
})();
