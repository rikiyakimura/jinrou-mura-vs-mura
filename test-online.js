// オンライン対戦のテスト
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
  await hostPage.fill('#host-name-input', `ホスト${Date.now()}`);
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

  // ゲーム状態を確認
  const hostState = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    return {
      idx: window.G.idx,
      phase: c.ph,
      who: c.who,
      day: c.day,
      playerId: room ? room.playerId : null
    };
  });

  const guestState = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    return {
      idx: window.G.idx,
      phase: c.ph,
      who: c.who,
      day: c.day,
      playerId: room ? room.playerId : null
    };
  });

  console.log('\n=== 初期状態 ===');
  console.log('ホスト:', hostState);
  console.log('ゲスト:', guestState);

  await hostPage.screenshot({ path: 'test-host-start.png' });
  await guestPage.screenshot({ path: 'test-guest-start.png' });

  console.log('\n=== 配置フェーズ ===');

  // ホストが配置
  console.log('ホスト: 配置開始');
  for (let i = 0; i < 5; i++) {
    const houses = await hostPage.locator('.house.pick').count();
    console.log(`  ホスト: クリック可能な家の数 = ${houses}`);
    if (houses > 0) {
      await hostPage.locator('.house.pick').first().click();
      await hostPage.waitForTimeout(300);
    }
  }

  // ゲストが配置
  console.log('ゲスト: 配置開始');
  for (let i = 0; i < 5; i++) {
    const houses = await guestPage.locator('.house.pick').count();
    console.log(`  ゲスト: クリック可能な家の数 = ${houses}`);
    if (houses > 0) {
      await guestPage.locator('.house.pick').first().click();
      await guestPage.waitForTimeout(300);
    }
  }

  await hostPage.waitForTimeout(3000);

  // 配置後の状態確認
  const hostAfterPlace = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, phase: c.ph, who: c.who };
  });
  const guestAfterPlace = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, phase: c.ph, who: c.who };
  });

  console.log('\n配置後:');
  console.log('ホスト:', hostAfterPlace);
  console.log('ゲスト:', guestAfterPlace);

  await hostPage.screenshot({ path: 'test-host-after-place.png' });
  await guestPage.screenshot({ path: 'test-guest-after-place.png' });

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
})();
