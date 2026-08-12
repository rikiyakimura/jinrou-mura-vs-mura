import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-mura-vs-mura.vercel.app';

test('オンライン対戦: 1日目完走テスト', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST ${msg.type()}] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST ${msg.type()}] ${msg.text()}`));
  hostPage.on('pageerror', err => console.log(`[HOST ERROR] ${err.message}`));
  guestPage.on('pageerror', err => console.log(`[GUEST ERROR] ${err.message}`));

  const checkState = async (page, name) => {
    const state = await page.evaluate(() => ({
      idx: window.G?.idx,
      phase: window.G?.sched?.[window.G?.idx]?.ph,
      day: window.G?.day,
      tickIdx: window.G?.tickIdx
    }));
    console.log(`${name}:`, JSON.stringify(state));
    return state;
  };

  try {
    // ===== ルーム作成と参加 =====
    console.log('\n===== STEP 1: ルーム作成と参加 =====');
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.title');
    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'ホスト');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'ゲスト');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // ===== 配置フェーズ =====
    console.log('\n===== STEP 2: 村人配置 =====');
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await hostPage.waitForTimeout(200);
    }
    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await guestPage.waitForTimeout(200);
    }
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'After place');

    // ===== 探索者選択フェーズ =====
    console.log('\n===== STEP 3: 探索者選択 =====');
    const hostChips = await hostPage.$$('#panel .chip');
    if (hostChips.length > 0) await hostChips[0].click();
    await hostPage.waitForTimeout(500);
    const guestChips = await guestPage.$$('#panel .chip');
    if (guestChips.length > 0) await guestChips[0].click();
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'After explorer');

    // ===== 経路選択フェーズ =====
    console.log('\n===== STEP 4: 経路選択 =====');
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-foe .house.pick');
      if (houses.length > 0) await houses[0].click();
      await hostPage.waitForTimeout(200);
    }
    let btn = await hostPage.$('button:has-text("昼へ進む")');
    if (btn) await btn.click();
    await hostPage.waitForTimeout(500);

    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-foe .house.pick');
      if (houses.length > 0) await houses[0].click();
      await guestPage.waitForTimeout(200);
    }
    btn = await guestPage.$('button:has-text("昼へ進む")');
    if (btn) await btn.click();
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'After route');

    // ===== ティックフェーズ =====
    console.log('\n===== STEP 5: ティック =====');

    // 5ティック分進める
    for (let tick = 0; tick < 5; tick++) {
      console.log(`Tick ${tick + 1}/5`);

      // ホストが「次へ」をクリック
      btn = await hostPage.$('button:has-text("次へ")');
      if (btn) {
        await btn.click();
        await hostPage.waitForTimeout(300);
      }

      // ゲストが「次へ」をクリック
      btn = await guestPage.$('button:has-text("次へ")');
      if (btn) {
        await btn.click();
        await guestPage.waitForTimeout(300);
      }
    }

    // 昼終了ボタン
    btn = await hostPage.$('button:has-text("昼を終える")');
    if (btn) {
      await btn.click();
      console.log('ホスト: 昼を終える');
    } else {
      console.log('ホスト: 昼を終えるボタンが見つからない');
    }
    await hostPage.waitForTimeout(500);

    btn = await guestPage.$('button:has-text("昼を終える")');
    if (btn) {
      await btn.click();
      console.log('ゲスト: 昼を終える');
    } else {
      console.log('ゲスト: 昼を終えるボタンが見つからない');
    }
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'After ticks');

    // ===== 夜フェーズ =====
    console.log('\n===== STEP 6: 夜 =====');

    // 襲撃対象を選択（選択可能な場合）
    let attackHouses = await hostPage.$$('#map-foe .house.pick');
    if (attackHouses.length > 0) {
      await attackHouses[0].click();
      console.log('ホスト: 襲撃対象選択');
    } else {
      console.log('ホスト: 襲撃できない');
    }

    attackHouses = await guestPage.$$('#map-foe .house.pick');
    if (attackHouses.length > 0) {
      await attackHouses[0].click();
      console.log('ゲスト: 襲撃対象選択');
    } else {
      console.log('ゲスト: 襲撃できない');
    }

    // 夜を明かすボタン
    btn = await hostPage.$('button:has-text("夜を明かす")');
    if (btn) {
      await btn.click();
      console.log('ホスト: 夜を明かす');
    }
    await hostPage.waitForTimeout(500);

    btn = await guestPage.$('button:has-text("夜を明かす")');
    if (btn) {
      await btn.click();
      console.log('ゲスト: 夜を明かす');
    }
    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    // 最終状態
    console.log('\n===== STEP 7: 最終状態 =====');
    await checkState(hostPage, 'Host final');
    await checkState(guestPage, 'Guest final');

    // パネル内容
    const hostPanel = await hostPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 400));
    const guestPanel = await guestPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 400));
    console.log('Host panel:', hostPanel);
    console.log('Guest panel:', guestPanel);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-host-fullgame.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-guest-fullgame.png', fullPage: true });

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
