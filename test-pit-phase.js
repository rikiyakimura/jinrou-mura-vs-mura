// 落とし穴フェーズのテスト
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
  await hostPage.fill('#host-name-input', `ホスト${Date.now()}`);
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
  await hostPage.waitForTimeout(3000);

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

  console.log('\n=== 落とし穴フェーズ ===');

  // フェーズ確認
  const hostPhaseBefore = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, pitEdge: window.G.V[1].pitEdge };
  });
  const guestPhaseBefore = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who, pitEdge: window.G.V[2].pitEdge };
  });
  console.log('開始時 - ホスト:', hostPhaseBefore);
  console.log('開始時 - ゲスト:', guestPhaseBefore);

  // ホストが落とし穴を設置
  await hostPage.screenshot({ path: 'pit-host-before.png' });
  const hostEdges = await hostPage.locator('line[onclick]').count();
  console.log(`ホスト: クリック可能な道の数 = ${hostEdges}`);
  if (hostEdges > 0) {
    await hostPage.locator('line[onclick]').first().click();
    await hostPage.waitForTimeout(500);
    console.log('ホスト: 道を選択');
  }

  // ゲストが落とし穴を設置
  await guestPage.screenshot({ path: 'pit-guest-before.png' });
  const guestEdges = await guestPage.locator('line[onclick]').count();
  console.log(`ゲスト: クリック可能な道の数 = ${guestEdges}`);
  if (guestEdges > 0) {
    await guestPage.locator('line[onclick]').first().click();
    await guestPage.waitForTimeout(500);
    console.log('ゲスト: 道を選択');
  }

  await hostPage.waitForTimeout(1000);

  // 選択後のデータ確認
  const hostAfterSelect = await hostPage.evaluate(() => {
    return { pitEdge: window.G.V[1].pitEdge };
  });
  const guestAfterSelect = await guestPage.evaluate(() => {
    return { pitEdge: window.G.V[2].pitEdge };
  });
  console.log('選択後 - ホスト:', hostAfterSelect);
  console.log('選択後 - ゲスト:', guestAfterSelect);

  // ホストが「これでいく」をクリック
  console.log('\nホスト: 「これでいく」をクリック');
  const hostButton = await hostPage.locator('button:has-text("これでいく")').count();
  console.log(`ホスト: ボタン数 = ${hostButton}`);
  if (hostButton > 0) {
    await hostPage.click('button:has-text("これでいく")');
    await hostPage.waitForTimeout(2000);
  }

  // フェーズ確認
  const hostPhaseAfterHost = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who };
  });
  const guestPhaseAfterHost = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who };
  });
  console.log('ホスト完了後 - ホスト:', hostPhaseAfterHost);
  console.log('ホスト完了後 - ゲスト:', guestPhaseAfterHost);

  await hostPage.screenshot({ path: 'pit-host-after-click.png' });
  await guestPage.screenshot({ path: 'pit-guest-after-host.png' });

  // ゲストが「これでいく」をクリック
  console.log('\nゲスト: 「これでいく」をクリック');
  const guestButton = await guestPage.locator('button:has-text("これでいく")').count();
  console.log(`ゲスト: ボタン数 = ${guestButton}`);
  if (guestButton > 0) {
    await guestPage.click('button:has-text("これでいく")');
    await hostPage.waitForTimeout(3000);
  }

  // 最終フェーズ確認
  const hostPhaseFinal = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who };
  });
  const guestPhaseFinal = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, ph: c.ph, who: c.who };
  });
  console.log('\n最終 - ホスト:', hostPhaseFinal);
  console.log('最終 - ゲスト:', guestPhaseFinal);

  await hostPage.screenshot({ path: 'pit-host-final.png' });
  await guestPage.screenshot({ path: 'pit-guest-final.png' });

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
})();
