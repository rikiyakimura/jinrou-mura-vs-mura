import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オンライン: リマッチテスト', async ({ browser }) => {
  test.setTimeout(120000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST ${msg.type()}] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST ${msg.type()}] ${msg.text()}`));

  try {
    // ===== ルーム作成 =====
    console.log('\n===== STEP 1: ルーム作成 =====');
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.title');

    // 狂人オプションを有効化
    await hostPage.click('.optchip:has-text("狂人")');
    await hostPage.waitForTimeout(300);

    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'ホスト');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    // ゲスト参加
    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'ゲスト');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // オプション確認
    const hostOpt = await hostPage.evaluate(() => window.G?.opt?.madmanDog);
    const guestOpt = await guestPage.evaluate(() => window.G?.opt?.madmanDog);
    console.log(`Host opt.madmanDog: ${hostOpt}, Guest opt.madmanDog: ${guestOpt}`);
    expect(hostOpt).toBe(true);

    // ===== ゲームを終了させる =====
    console.log('\n===== STEP 2: ゲーム終了 =====');
    await hostPage.evaluate(() => {
      window.G.done = true;
      window.G.idx = window.G.sched.length - 1;
      window._render();
    });
    await guestPage.evaluate(() => {
      window.G.done = true;
      window.G.idx = window.G.sched.length - 1;
      window._render();
    });

    await hostPage.waitForSelector('.final', { timeout: 5000 });
    await guestPage.waitForSelector('.final', { timeout: 5000 });
    console.log('両者の終了画面が表示されました');

    // ===== ホストが「もう一度」をクリック =====
    console.log('\n===== STEP 3: ホストがリマッチ =====');
    await hostPage.click('button:has-text("もう一度")');
    await hostPage.waitForTimeout(500);

    // ホストのゲームが再開されることを確認
    await hostPage.waitForSelector('#map-mine .house', { timeout: 5000 });
    const hostModeAfter = await hostPage.evaluate(() => window.G?.mode);
    const hostOptAfter = await hostPage.evaluate(() => window.G?.opt?.madmanDog);
    console.log(`Host mode after: ${hostModeAfter}, opt.madmanDog: ${hostOptAfter}`);
    expect(hostModeAfter).toBe('online');
    expect(hostOptAfter).toBe(true);

    // ===== ゲストが「もう一度」をクリック =====
    console.log('\n===== STEP 4: ゲストがリマッチ =====');
    await guestPage.click('button:has-text("もう一度")');
    await guestPage.waitForTimeout(500);

    // ゲストに待機画面が表示されるか、ゲームが再開されることを確認
    // （ホストがすでに再開しているので、すぐに同期される可能性がある）
    const guestWaiting = await guestPage.$('.waiting-indicator');
    if (guestWaiting) {
      console.log('ゲスト: 待機画面が表示されています');
      // ゲーム再開を待つ
      await guestPage.waitForSelector('#map-mine .house', { timeout: 10000 });
    }

    const guestModeAfter = await guestPage.evaluate(() => window.G?.mode);
    const guestOptAfter = await guestPage.evaluate(() => window.G?.opt?.madmanDog);
    console.log(`Guest mode after: ${guestModeAfter}, opt.madmanDog: ${guestOptAfter}`);
    expect(guestModeAfter).toBe('online');

    console.log('\n===== リマッチ成功！ =====');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
