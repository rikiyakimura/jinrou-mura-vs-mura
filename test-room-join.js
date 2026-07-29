// Playwright でルーム作成→参加をテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });

  // ホスト側のページ
  const hostPage = await browser.newPage();
  // ゲスト側のページ
  const guestPage = await browser.newPage();

  // コンソールログを監視
  const setupConsoleLogging = (page, name) => {
    page.on('console', msg => {
      console.log(`[${name}][${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', error => {
      console.error(`[${name}][ERROR] ${error.message}`);
    });
  };

  setupConsoleLogging(hostPage, 'HOST');
  setupConsoleLogging(guestPage, 'GUEST');

  console.log('=== ホスト: ルームを作成 ===');
  await hostPage.goto('http://localhost:5174/');
  await hostPage.waitForTimeout(1000);

  await hostPage.click('button:has-text("オンライン対戦")');
  await hostPage.waitForTimeout(500);

  await hostPage.click('button:has-text("ルームを作成")');
  await hostPage.waitForTimeout(500);

  await hostPage.fill('#host-name-input', 'ホストプレイヤー');
  await hostPage.waitForTimeout(300);

  await hostPage.click('button:has-text("ルーム作成")');
  await hostPage.waitForTimeout(2000);

  // 暗証番号を取得
  const roomCodeElement = await hostPage.locator('div:has-text("この暗証番号を友達に教えてください")').locator('..').locator('div[style*="font-size:48px"]');
  const roomCode = await roomCodeElement.textContent();
  console.log(`\n🔑 ルームコード: ${roomCode.trim()}\n`);

  await hostPage.screenshot({ path: 'screenshot-host-waiting.png' });

  console.log('=== ゲスト: ルームに参加 ===');
  await guestPage.goto('http://localhost:5174/');
  await guestPage.waitForTimeout(1000);

  await guestPage.click('button:has-text("オンライン対戦")');
  await guestPage.waitForTimeout(500);

  await guestPage.click('button:has-text("ルームに参加")');
  await guestPage.waitForTimeout(500);

  await guestPage.fill('#guest-name-input', 'ゲストプレイヤー');
  await guestPage.waitForTimeout(300);

  await guestPage.fill('#room-code-input', roomCode.trim());
  await guestPage.waitForTimeout(300);

  console.log('\n=== ゲスト: 参加ボタンをクリック ===');
  await guestPage.click('button:has-text("参加")');

  // エラーやアラートを待機
  await guestPage.waitForTimeout(5000);

  await guestPage.screenshot({ path: 'screenshot-guest-join-attempt.png' });
  await hostPage.screenshot({ path: 'screenshot-host-after-join.png' });

  console.log('\n=== 10秒後にブラウザを閉じます ===');
  await guestPage.waitForTimeout(10000);

  await browser.close();
  console.log('テスト完了');
})();
