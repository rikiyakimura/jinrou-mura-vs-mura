// Playwright で完全なオンラインゲームフローをテスト
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
      const type = msg.type();
      if (type === 'log' || type === 'error') {
        console.log(`[${name}][${type}] ${msg.text()}`);
      }
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

  await hostPage.fill('#host-name-input', 'ホスト');
  await hostPage.waitForTimeout(300);

  await hostPage.click('button:has-text("ルーム作成")');
  await hostPage.waitForTimeout(2000);

  // 暗証番号を取得
  const roomCodeElement = await hostPage.locator('div:has-text("この暗証番号を友達に教えてください")').locator('..').locator('div[style*="font-size:48px"]');
  const roomCode = await roomCodeElement.textContent();
  console.log(`\n🔑 ルームコード: ${roomCode.trim()}\n`);

  console.log('=== ゲスト: ルームに参加 ===');
  await guestPage.goto('http://localhost:5174/');
  await guestPage.waitForTimeout(1000);

  await guestPage.click('button:has-text("オンライン対戦")');
  await guestPage.waitForTimeout(500);

  await guestPage.click('button:has-text("ルームに参加")');
  await guestPage.waitForTimeout(500);

  await guestPage.fill('#guest-name-input', 'ゲスト');
  await guestPage.waitForTimeout(300);

  await guestPage.fill('#room-code-input', roomCode.trim());
  await guestPage.waitForTimeout(300);

  console.log('\n=== ゲスト: 参加ボタンをクリック ===');
  await guestPage.click('button:has-text("参加")');

  // ゲーム開始を待つ
  await hostPage.waitForTimeout(3000);
  await guestPage.waitForTimeout(3000);

  console.log('\n=== ゲーム画面のスクリーンショット ===');
  await hostPage.screenshot({ path: 'screenshot-host-game.png' });
  await guestPage.screenshot({ path: 'screenshot-guest-game.png' });
  console.log('保存: screenshot-host-game.png, screenshot-guest-game.png');

  // veil要素（待機画面）の状態を確認
  const hostVeilVisible = await hostPage.evaluate(() => {
    const veil = document.getElementById('veil');
    return veil && veil.style.display !== 'none';
  });
  const guestVeilVisible = await guestPage.evaluate(() => {
    const veil = document.getElementById('veil');
    return veil && veil.style.display !== 'none';
  });

  console.log(`\nホスト待機画面表示: ${hostVeilVisible ? 'はい（待機中）' : 'いいえ（ゲーム中）'}`);
  console.log(`ゲスト待機画面表示: ${guestVeilVisible ? 'はい（待機中）' : 'いいえ（ゲーム中）'}`);

  // ゲームデータの確認
  const hostGameData = await hostPage.evaluate(() => {
    if (!window.G) return null;
    return {
      mode: window.G.mode,
      day: window.G.day,
      currentPhase: window.G.sched[window.G.idx].ph,
      currentPlayer: window.G.sched[window.G.idx].who
    };
  });

  const guestGameData = await guestPage.evaluate(() => {
    if (!window.G) return null;
    return {
      mode: window.G.mode,
      day: window.G.day,
      currentPhase: window.G.sched[window.G.idx].ph,
      currentPlayer: window.G.sched[window.G.idx].who
    };
  });

  console.log('\nホストのゲームデータ:', hostGameData);
  console.log('ゲストのゲームデータ:', guestGameData);

  console.log('\n=== 30秒後にブラウザを閉じます ===');
  await browser.waitForTimeout(30000);

  await browser.close();
  console.log('テスト完了');
})();
