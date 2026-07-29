// オンライン対戦のテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  // コンソールログ監視
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
  await guestPage.waitForTimeout(3000);

  // ゲーム状態を確認
  const hostState = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    return {
      idx: window.G.idx,
      phase: c.ph,
      who: c.who,
      day: c.day,
      playerId: room ? room.playerId : null
    };
  });

  const guestState = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    return {
      idx: window.G.idx,
      phase: c.ph,
      who: c.who,
      day: c.day,
      playerId: room ? room.playerId : null
    };
  });

  console.log('\n=== 初期状態 ===');
  console.log('ホスト:', hostState);
  console.log('ゲスト:', guestState);

  await hostPage.screenshot({ path: 'test-host-start.png' });
  await guestPage.screenshot({ path: 'test-guest-start.png' });

  console.log('\n=== 配置フェーズ ===');

  // ホストが配置
  console.log('ホスト: 配置開始');
  for (let i = 0; i < 5; i++) {
    const houses = await hostPage.locator('.house.pick').count();
    console.log(`  ホスト: クリック可能な家の数 = ${houses}`);
    if (houses > 0) {
      await hostPage.locator('.house.pick').first().click();
      await hostPage.waitForTimeout(300);
    }
  }

  // ゲストが配置
  console.log('ゲスト: 配置開始');
  for (let i = 0; i < 5; i++) {
    const houses = await guestPage.locator('.house.pick').count();
    console.log(`  ゲスト: クリック可能な家の数 = ${houses}`);
    if (houses > 0) {
      await guestPage.locator('.house.pick').first().click();
      await guestPage.waitForTimeout(300);
    }
  }

  await hostPage.waitForTimeout(3000);

  // 配置後の状態確認
  const hostAfterPlace = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, phase: c.ph, who: c.who };
  });
  const guestAfterPlace = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return { idx: window.G.idx, phase: c.ph, who: c.who };
  });

  console.log('\n配置後:');
  console.log('ホスト:', hostAfterPlace);
  console.log('ゲスト:', guestAfterPlace);

  await hostPage.screenshot({ path: 'test-host-after-place.png' });
  await guestPage.screenshot({ path: 'test-guest-after-place.png' });

  console.log('\n=== 探索者選択 ===');

  // ホストが探索者を選択
  const hostChips = await hostPage.locator('.chip').count();
  console.log(`ホスト: 選択可能数 = ${hostChips}`);
  if (hostChips > 0) {
    await hostPage.locator('.chip').first().click();
    await hostPage.waitForTimeout(1000);
  }

  // ゲストが探索者を選択
  const guestChips = await guestPage.locator('.chip').count();
  console.log(`ゲスト: 選択可能数 = ${guestChips}`);
  if (guestChips > 0) {
    await guestPage.locator('.chip').first().click();
    await guestPage.waitForTimeout(3000);
  }

  console.log('\n=== 経路組み ===');

  // ホストが経路を組む（5回）
  for (let i = 0; i < 5; i++) {
    const houses = await hostPage.locator('.house.pick').count();
    if (houses > 0) {
      await hostPage.locator('.house').first().click();
      await hostPage.waitForTimeout(300);
    }
  }

  // ゲストが経路を組む（5回）
  for (let i = 0; i < 5; i++) {
    const houses = await guestPage.locator('.house.pick').count();
    if (houses > 0) {
      await guestPage.locator('.house').first().click();
      await guestPage.waitForTimeout(300);
    }
  }

  await hostPage.waitForTimeout(2000);

  // 「昼へ進む」ボタンをクリック
  const hostGoToDay = await hostPage.locator('button:has-text("昼へ進む")').count();
  const guestGoToDay = await guestPage.locator('button:has-text("昼へ進む")').count();
  console.log(`ホスト: 昼へ進むボタン=${hostGoToDay}, ゲスト=${guestGoToDay}`);

  if (hostGoToDay > 0) {
    await hostPage.click('button:has-text("昼へ進む")');
  }
  if (guestGoToDay > 0) {
    await guestPage.click('button:has-text("昼へ進む")');
  }

  await hostPage.waitForTimeout(3000);

  console.log('\n=== ティック処理 ===');

  // 5ティック分
  for (let tick = 0; tick < 5; tick++) {
    console.log(`ティック ${tick + 1}/5`);

    // 「研ぐ」ボタンがあれば押す
    const hostSharpen = await hostPage.locator('button:has-text("研ぐ")').count();
    if (hostSharpen > 0) {
      await hostPage.click('button:has-text("研ぐ")');
      await hostPage.waitForTimeout(500);
    }

    const guestSharpen = await guestPage.locator('button:has-text("研ぐ")').count();
    if (guestSharpen > 0) {
      await guestPage.click('button:has-text("研ぐ")');
      await guestPage.waitForTimeout(500);
    }

    // 「次へ」ボタン
    const hostNext = await hostPage.locator('button:has-text("次へ")').count();
    const guestNext = await guestPage.locator('button:has-text("次へ")').count();

    if (hostNext > 0) {
      await hostPage.click('button:has-text("次へ")');
    }
    if (guestNext > 0) {
      await guestPage.click('button:has-text("次へ")');
    }
    await hostPage.waitForTimeout(1500);
  }

  // 「昼を終える」ボタン
  const hostFinishDay = await hostPage.locator('button:has-text("昼を終える")').count();
  const guestFinishDay = await guestPage.locator('button:has-text("昼を終える")').count();
  console.log(`ホスト: 昼を終えるボタン=${hostFinishDay}, ゲスト=${guestFinishDay}`);

  if (hostFinishDay > 0) {
    await hostPage.click('button:has-text("昼を終える")');
  }
  if (guestFinishDay > 0) {
    await guestPage.click('button:has-text("昼を終える")');
  }

  await hostPage.waitForTimeout(3000);

  console.log('\n=== 夜の選択 ===');

  // 襲撃対象を選択
  const hostAttack = await hostPage.locator('.chip').count();
  const guestAttack = await guestPage.locator('.chip').count();
  console.log(`ホスト: chip数 = ${hostAttack}, ゲスト: chip数 = ${guestAttack}`);

  if (hostAttack > 0) {
    await hostPage.locator('.chip').first().click();
    await hostPage.waitForTimeout(500);
  }
  if (guestAttack > 0) {
    await guestPage.locator('.chip').first().click();
    await guestPage.waitForTimeout(500);
  }

  // 「夜を明かす」ボタン
  const hostNightButton = await hostPage.locator('button:has-text("夜を明かす")').count();
  const guestNightButton = await guestPage.locator('button:has-text("夜を明かす")').count();
  console.log(`ホスト: 夜を明かすボタン=${hostNightButton}, ゲスト=${guestNightButton}`);

  if (hostNightButton > 0) {
    await hostPage.click('button:has-text("夜を明かす")');
  }
  if (guestNightButton > 0) {
    await guestPage.click('button:has-text("夜を明かす")');
  }

  await hostPage.waitForTimeout(5000);

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
})();
