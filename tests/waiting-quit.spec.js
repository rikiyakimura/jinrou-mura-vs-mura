import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('オンライン: 待機画面にやめるボタンがある', async ({ browser }) => {
  test.setTimeout(60000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

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

    // ホストが配置を完了（相手待ち状態にする）
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await hostPage.waitForTimeout(200);
    }

    // 待機画面が表示されるまで待つ
    await hostPage.waitForSelector('.waiting-indicator', { timeout: 10000 });
    console.log('待機画面が表示された');

    // やめるボタンがあるか確認
    const quitBtn = await hostPage.$('#veil button.quit');
    expect(quitBtn).toBeTruthy();
    console.log('やめるボタンが見つかりました');

    // 待機メッセージを確認
    const waitingText = await hostPage.textContent('.waiting-indicator');
    console.log(`待機メッセージ: ${waitingText}`);
    expect(waitingText).toContain('相手の操作を待っています');

    console.log('テスト成功: 待機画面にやめるボタンがあります');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
