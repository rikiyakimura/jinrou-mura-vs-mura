import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('オンライン: 降参すると相手に通知される', async ({ browser }) => {
  test.setTimeout(60000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  // コンソールログを監視
  hostPage.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      console.log('[HOST] ' + msg.text());
    }
  });
  guestPage.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      console.log('[GUEST] ' + msg.text());
    }
  });

  // アラートを監視
  let guestAlertText = null;
  guestPage.on('dialog', async dialog => {
    guestAlertText = dialog.message();
    console.log(`[GUEST] Alert: ${guestAlertText}`);
    await dialog.accept();
  });

  let hostAlertText = null;
  hostPage.on('dialog', async dialog => {
    hostAlertText = dialog.message();
    console.log(`[HOST] Alert: ${hostAlertText}`);
    await dialog.accept();
  });

  try {
    // ===== ルーム作成・参加 =====
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.modebtns', { timeout: 10000 });
    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'Host');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.click('button:has-text("開始")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'Guest');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    // ゲーム開始を待つ
    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('ゲーム開始');

    // やめるボタンがあるか確認
    const hostQuitBtn = await hostPage.$('button.quit');
    expect(hostQuitBtn).toBeTruthy();
    console.log('ホストのやめるボタンを確認');

    // ホストがやめるボタンをクリック（confirmダイアログが出る）
    console.log('ホストがやめるをクリック...');
    await hostPage.click('button.quit');

    // confirmダイアログ後、DBに書き込まれるまで待つ
    await hostPage.waitForTimeout(2000);

    // ゲストにアラートが表示されるまで待つ
    console.log('ゲストのアラートを待機...');
    for (let i = 0; i < 10; i++) {
      if (guestAlertText) break;
      await guestPage.waitForTimeout(500);
    }

    console.log(`ゲストのアラート内容: ${guestAlertText}`);

    // 検証
    expect(guestAlertText).toContain('降参');
    console.log('テスト成功: 降参が相手に通知されました');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
