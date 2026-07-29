// ゲスト側のG.V構造を確認
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

  // G.Vの構造を確認
  const guestGV = await guestPage.evaluate(() => {
    if (!window.G || !window.G.V) return { error: 'G.V not found' };
    return {
      hasV: !!window.G.V,
      V_keys: Object.keys(window.G.V),
      V1_exists: !!window.G.V[1],
      V2_exists: !!window.G.V[2],
      V1_id: window.G.V[1]?.id,
      V2_id: window.G.V[2]?.id,
      V1_placeIdx: window.G.V[1]?.placeIdx,
      V2_placeIdx: window.G.V[2]?.placeIdx,
    };
  });

  console.log('\n=== ゲスト側 G.V 構造 ===');
  console.log(JSON.stringify(guestGV, null, 2));

  await browser.close();
})();
