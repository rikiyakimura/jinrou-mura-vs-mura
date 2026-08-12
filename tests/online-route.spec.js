import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-mura-vs-mura.vercel.app';

test('オンライン対戦: 経路選択まで', async ({ browser }) => {
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
      who: window.G?.sched?.[window.G?.idx]?.who,
      explorer1: window.G?.V?.[1]?.explorer,
      explorer2: window.G?.V?.[2]?.explorer,
      route1: window.G?.V?.[1]?.route?.length,
      route2: window.G?.V?.[2]?.route?.length
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
    console.log('ホスト配置完了');

    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await guestPage.waitForTimeout(200);
    }
    console.log('ゲスト配置完了');

    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'Host after place');
    await checkState(guestPage, 'Guest after place');

    // ===== 探索者選択フェーズ =====
    console.log('\n===== STEP 3: 探索者選択 =====');

    const hostChips = await hostPage.$$('#panel .chip');
    if (hostChips.length > 0) {
      await hostChips[0].click();
      console.log('ホストが探索者を選択');
    }
    await hostPage.waitForTimeout(500);

    const guestChips = await guestPage.$$('#panel .chip');
    if (guestChips.length > 0) {
      await guestChips[0].click();
      console.log('ゲストが探索者を選択');
    }
    await guestPage.waitForTimeout(500);

    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);
    await checkState(hostPage, 'Host after explorer');
    await checkState(guestPage, 'Guest after explorer');

    // ===== 経路選択フェーズ =====
    console.log('\n===== STEP 4: 経路選択 =====');

    // ホストが経路を選択（5回クリック）
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-foe .house.pick');
      if (houses.length > 0) {
        await houses[0].click();
        console.log(`ホスト: 経路 ${i + 1}/5 選択`);
      }
      await hostPage.waitForTimeout(300);
    }

    // 経路確定ボタンをクリック（"昼へ進む"）
    const hostConfirmBtn = await hostPage.$('button:has-text("昼へ進む")');
    if (hostConfirmBtn) {
      await hostConfirmBtn.click();
      console.log('ホスト: 経路確定');
    } else {
      console.log('ホスト: 確定ボタンが見つからない');
    }
    await hostPage.waitForTimeout(500);

    // ゲストが経路を選択
    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-foe .house.pick');
      if (houses.length > 0) {
        await houses[0].click();
        console.log(`ゲスト: 経路 ${i + 1}/5 選択`);
      }
      await guestPage.waitForTimeout(300);
    }

    const guestConfirmBtn = await guestPage.$('button:has-text("昼へ進む")');
    if (guestConfirmBtn) {
      await guestConfirmBtn.click();
      console.log('ゲスト: 経路確定');
    } else {
      console.log('ゲスト: 確定ボタンが見つからない');
    }
    await guestPage.waitForTimeout(500);

    // 同期待ち
    console.log('\n===== STEP 5: 同期待ち =====');
    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    // 最終状態
    console.log('\n===== STEP 6: 最終状態 =====');
    await checkState(hostPage, 'Host final');
    await checkState(guestPage, 'Guest final');

    // パネル内容
    const hostPanel = await hostPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 300));
    const guestPanel = await guestPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 300));
    console.log('Host panel:', hostPanel);
    console.log('Guest panel:', guestPanel);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-host-route.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-guest-route.png', fullPage: true });

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
