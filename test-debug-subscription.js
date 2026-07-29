// デバッグ: サブスクリプションとready flagsの動きを確認
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

  console.log('\n=== ホスト: 配置開始 ===');
  for (let i = 0; i < 5; i++) {
    await hostPage.click('.house.pick');
    await hostPage.waitForTimeout(300);
  }
  console.log('ホスト: 配置完了ボタンをクリック');

  // ホスト側の状態を確認（1人目完了後）
  await hostPage.waitForTimeout(1000);
  const afterHost = await hostPage.evaluate(() => {
    return {
      hostIdx: window.G.idx,
      hostPh: window.G.sched[window.G.idx].ph,
      hostWho: window.G.sched[window.G.idx].who
    };
  });
  console.log('\n【1人目完了後のホスト状態】');
  console.log(JSON.stringify(afterHost, null, 2));

  console.log('\n=== ゲスト: 配置開始 ===');
  for (let i = 0; i < 5; i++) {
    await guestPage.click('.house.pick');
    await guestPage.waitForTimeout(300);
  }
  console.log('ゲスト: 配置完了ボタンをクリック');

  // 両者の状態を確認（2人目完了後）
  await guestPage.waitForTimeout(2000);

  const afterGuest = await guestPage.evaluate(() => {
    return {
      guestIdx: window.G.idx,
      guestPh: window.G.sched[window.G.idx].ph,
      guestWho: window.G.sched[window.G.idx].who
    };
  });

  const afterGuestHost = await hostPage.evaluate(() => ({
    hostIdx: window.G.idx,
    hostPh: window.G.sched[window.G.idx].ph,
    hostWho: window.G.sched[window.G.idx].who
  }));

  console.log('\n【2人目完了後のゲスト状態】');
  console.log(JSON.stringify(afterGuest, null, 2));
  console.log('\n【2人目完了後のホスト状態】');
  console.log(JSON.stringify(afterGuestHost, null, 2));

  await hostPage.screenshot({ path: 'debug-sub-host.png' });
  await guestPage.screenshot({ path: 'debug-sub-guest.png' });

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
  console.log('テスト完了');
})();
