// ゲスト側のデバッグテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  // ホスト: ルーム作成
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
  console.log(`ルームコード: ${roomCode.trim()}`);

  // ゲスト: ルーム参加
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

  // デバッグ情報を取得
  const guestDebug = await guestPage.evaluate(() => {
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    const G = window.G;
    const me = window.me ? window.me() : null;
    const opp = window.opp ? window.opp() : null;

    return {
      hasGetCurrentRoom: !!window.getCurrentRoom,
      room: room,
      hasG: !!G,
      G: G ? { mode: G.mode, idx: G.idx, sched_length: G.sched?.length } : null,
      hasMe: !!window.me,
      me: me ? { id: me.id, placeIdx: me.placeIdx } : null,
      hasOpp: !!window.opp,
      opp: opp ? { id: opp.id } : null,
    };
  });

  console.log('\n=== ゲスト側デバッグ情報 ===');
  console.log(JSON.stringify(guestDebug, null, 2));

  await guestPage.screenshot({ path: 'debug-guest.png' });
  console.log('\nスクリーンショット: debug-guest.png');

  await browser.waitForEvent('close', { timeout: 30000 }).catch(() => {});
  await browser.close();
})();
