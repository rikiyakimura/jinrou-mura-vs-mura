// 探索者のデータを確認
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

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

  console.log('\n=== 配置フェーズ ===');
  for (let i = 0; i < 5; i++) {
    await hostPage.click('.house.pick');
    await hostPage.waitForTimeout(200);
  }
  for (let i = 0; i < 5; i++) {
    await guestPage.click('.house.pick');
    await guestPage.waitForTimeout(200);
  }
  await hostPage.waitForTimeout(3000);

  console.log('\n=== 探索者選択フェーズ ===');
  await hostPage.locator('.chip').first().click();
  await hostPage.waitForTimeout(1000);
  await guestPage.locator('.chip').first().click();
  await guestPage.waitForTimeout(3000);

  // 探索者のデータを確認
  const hostData = await hostPage.evaluate(() => {
    const v1 = window.G.V[1];
    const v2 = window.G.V[2];
    return {
      v1_explorer: v1.explorer,
      v2_explorer: v2.explorer,
      v1_people_length: v1.people.length,
      v2_people_length: v2.people.length,
      v1_people_ids: v1.people.map(p => p.id),
      v2_people_ids: v2.people.map(p => p.id)
    };
  });

  const guestData = await guestPage.evaluate(() => {
    const v1 = window.G.V[1];
    const v2 = window.G.V[2];
    return {
      v1_explorer: v1.explorer,
      v2_explorer: v2.explorer,
      v1_people_length: v1.people.length,
      v2_people_length: v2.people.length,
      v1_people_ids: v1.people.map(p => p.id),
      v2_people_ids: v2.people.map(p => p.id)
    };
  });

  console.log('\n【ホスト側のデータ】');
  console.log(JSON.stringify(hostData, null, 2));
  console.log('\n【ゲスト側のデータ】');
  console.log(JSON.stringify(guestData, null, 2));

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
})();
