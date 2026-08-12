import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-mura-vs-mura.vercel.app';

test('オンライン対戦: ルーム作成と参加', async ({ browser }) => {
  // 2つのブラウザコンテキストを作成（ホストとゲスト）
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  // コンソールログを収集
  const hostLogs = [];
  const guestLogs = [];

  hostPage.on('console', msg => {
    hostLogs.push(`[HOST] ${msg.type()}: ${msg.text()}`);
  });

  guestPage.on('console', msg => {
    guestLogs.push(`[GUEST] ${msg.type()}: ${msg.text()}`);
  });

  // エラーを収集
  hostPage.on('pageerror', err => {
    hostLogs.push(`[HOST ERROR] ${err.message}`);
  });

  guestPage.on('pageerror', err => {
    guestLogs.push(`[GUEST ERROR] ${err.message}`);
  });

  try {
    // ホスト: ページを開く
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.title', { timeout: 10000 });
    console.log('Host: タイトル画面表示');

    // ホスト: オンライン対戦をクリック
    await hostPage.click('button.online');
    await hostPage.waitForSelector('.online-menu', { timeout: 5000 });
    console.log('Host: オンラインメニュー表示');

    // ホスト: 名前入力
    await hostPage.fill('#player-name', 'ホスト');

    // ホスト: ルームを作る
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });

    // ルームコードを取得
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`Host: ルーム作成完了 - コード: ${roomCode}`);

    // ゲスト: ページを開く
    await guestPage.goto(BASE_URL);
    await guestPage.waitForSelector('.title', { timeout: 10000 });
    console.log('Guest: タイトル画面表示');

    // ゲスト: オンライン対戦をクリック
    await guestPage.click('button.online');
    await guestPage.waitForSelector('.online-menu', { timeout: 5000 });
    console.log('Guest: オンラインメニュー表示');

    // ゲスト: 名前入力
    await guestPage.fill('#player-name', 'ゲスト');

    // ゲスト: ルームに参加
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.waitForSelector('#room-code', { timeout: 5000 });
    console.log('Guest: ルーム参加画面表示');

    // ゲスト: ルームコード入力
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');
    console.log('Guest: 参加ボタンクリック');

    // 3秒待機して状態を確認
    await guestPage.waitForTimeout(3000);

    // ホスト側の画面状態を確認
    const hostVeilDisplay = await hostPage.evaluate(() => {
      return document.getElementById('veil')?.style.display;
    });
    console.log(`Host: veil display = ${hostVeilDisplay}`);

    // ゲスト側の画面状態を確認
    const guestVeilDisplay = await guestPage.evaluate(() => {
      return document.getElementById('veil')?.style.display;
    });
    console.log(`Guest: veil display = ${guestVeilDisplay}`);

    // ゲスト側のHTML確認
    const guestBodyHTML = await guestPage.evaluate(() => {
      return document.body.innerHTML.substring(0, 1000);
    });
    console.log(`Guest body (first 1000 chars): ${guestBodyHTML}`);

    // ホスト側の.wrap内容確認
    const hostWrapContent = await hostPage.evaluate(() => {
      const wrap = document.querySelector('.wrap');
      return wrap ? wrap.innerHTML.substring(0, 500) : 'No .wrap element';
    });
    console.log(`Host .wrap: ${hostWrapContent}`);

    // ゲスト側の.wrap内容確認
    const guestWrapContent = await guestPage.evaluate(() => {
      const wrap = document.querySelector('.wrap');
      return wrap ? wrap.innerHTML.substring(0, 500) : 'No .wrap element';
    });
    console.log(`Guest .wrap: ${guestWrapContent}`);

    // G(ゲーム状態)の確認
    const hostG = await hostPage.evaluate(() => {
      return window.G ? { mode: window.G.mode, idx: window.G.idx, myPlayerId: window.G.myPlayerId } : null;
    });
    console.log(`Host G: ${JSON.stringify(hostG)}`);

    const guestG = await guestPage.evaluate(() => {
      return window.G ? { mode: window.G.mode, idx: window.G.idx, myPlayerId: window.G.myPlayerId } : null;
    });
    console.log(`Guest G: ${JSON.stringify(guestG)}`);

    // ログ出力
    console.log('\n=== Host Console Logs ===');
    hostLogs.forEach(log => console.log(log));

    console.log('\n=== Guest Console Logs ===');
    guestLogs.forEach(log => console.log(log));

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-host.png' });
    await guestPage.screenshot({ path: 'test-guest.png' });
    console.log('Screenshots saved');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
