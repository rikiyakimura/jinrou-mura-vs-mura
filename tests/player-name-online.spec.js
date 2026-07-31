import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('オンライン: ホストとゲストの名前が正しく表示される', async ({ browser }) => {
  test.setTimeout(60000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  const hostLogs = [];
  const guestLogs = [];

  hostPage.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      hostLogs.push(msg.text());
      console.log('[HOST] ' + msg.text());
    }
  });
  guestPage.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      guestLogs.push(msg.text());
      console.log('[GUEST] ' + msg.text());
    }
  });

  try {
    // ===== ホスト: ルーム作成 =====
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.modebtns', { timeout: 10000 });
    await hostPage.click('button.online');
    await hostPage.waitForSelector('#player-name', { timeout: 5000 });

    // ホストの名前を入力
    await hostPage.fill('#player-name', 'HostPlayer');
    await hostPage.waitForTimeout(300);

    // localStorage確認
    const hostStoredBefore = await hostPage.evaluate(() => localStorage.getItem('jinrou_player_name'));
    console.log(`[HOST] localStorage before click: ${hostStoredBefore}`);

    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.click('button:has-text("開始")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });

    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    // ===== ゲスト: ルーム参加 =====
    await guestPage.goto(BASE_URL);
    await guestPage.waitForSelector('.modebtns', { timeout: 10000 });
    await guestPage.click('button.online');
    await guestPage.waitForSelector('#player-name', { timeout: 5000 });

    // ゲストの名前を入力
    await guestPage.fill('#player-name', 'GuestPlayer');
    await guestPage.waitForTimeout(300);

    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    // ゲーム開始を待つ
    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('ゲーム開始');

    // 名前を確認
    const hostMyName = await hostPage.evaluate(() => window.G?.myPlayerName);
    const hostOppName = await hostPage.evaluate(() => window.G?.opponentName);
    const guestMyName = await guestPage.evaluate(() => window.G?.myPlayerName);
    const guestOppName = await guestPage.evaluate(() => window.G?.opponentName);

    console.log('=== 名前確認 ===');
    console.log(`Host側: 自分=${hostMyName}, 相手=${hostOppName}`);
    console.log(`Guest側: 自分=${guestMyName}, 相手=${guestOppName}`);

    // パネルのテキストを確認
    const hostPanelText = await hostPage.evaluate(() => document.getElementById('panel')?.innerText);
    const guestPanelText = await guestPage.evaluate(() => document.getElementById('panel')?.innerText);
    console.log(`Host panel: ${hostPanelText?.substring(0, 100)}`);
    console.log(`Guest panel: ${guestPanelText?.substring(0, 100)}`);

    // 地図タイトルを確認
    const hostMapTitle = await hostPage.evaluate(() => document.querySelector('#map-mine .title')?.innerText);
    const guestMapTitle = await guestPage.evaluate(() => document.querySelector('#map-mine .title')?.innerText);
    console.log(`Host map title: ${hostMapTitle}`);
    console.log(`Guest map title: ${guestMapTitle}`);

    // 検証
    expect(hostMyName).toBe('HostPlayer');
    expect(hostOppName).toBe('GuestPlayer');
    expect(guestMyName).toBe('GuestPlayer');
    expect(guestOppName).toBe('HostPlayer');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
