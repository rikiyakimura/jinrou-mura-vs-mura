import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オンライン対戦: 探索者選択まで', async ({ browser }) => {
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
      explorer2: window.G?.V?.[2]?.explorer
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

    // ホスト配置
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await hostPage.waitForTimeout(200);
    }
    console.log('ホスト配置完了');

    // ゲスト配置
    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await guestPage.waitForTimeout(200);
    }
    console.log('ゲスト配置完了');

    // 同期待ち
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(1000);

    await checkState(hostPage, 'Host after place');
    await checkState(guestPage, 'Guest after place');

    // ===== 探索者選択フェーズ =====
    console.log('\n===== STEP 3: 探索者選択 =====');

    // パネル内のchipを確認
    const hostChips = await hostPage.$$('#panel .chip');
    const guestChips = await guestPage.$$('#panel .chip');
    console.log(`Host chips: ${hostChips.length}, Guest chips: ${guestChips.length}`);

    // ホストが探索者を選択
    if (hostChips.length > 0) {
      console.log('ホストが探索者を選択...');
      await hostChips[0].click();
      await hostPage.waitForTimeout(500);
    } else {
      console.log('ホスト: chipが見つからない');
    }
    await checkState(hostPage, 'Host after explorer');

    // ホストの画面状態
    const hostVeil = await hostPage.evaluate(() => ({
      display: document.getElementById('veil')?.style.display,
      text: document.getElementById('veil')?.innerText?.substring(0, 100)
    }));
    console.log('Host veil:', JSON.stringify(hostVeil));

    // ゲストが探索者を選択
    const guestChipsAfter = await guestPage.$$('#panel .chip');
    if (guestChipsAfter.length > 0) {
      console.log('ゲストが探索者を選択...');
      await guestChipsAfter[0].click();
      await guestPage.waitForTimeout(500);
    } else {
      console.log('ゲスト: chipが見つからない');
    }
    await checkState(guestPage, 'Guest after explorer');

    // ゲストの画面状態
    const guestVeil = await guestPage.evaluate(() => ({
      display: document.getElementById('veil')?.style.display,
      text: document.getElementById('veil')?.innerText?.substring(0, 100)
    }));
    console.log('Guest veil:', JSON.stringify(guestVeil));

    // 同期待ち
    console.log('\n===== STEP 4: 同期待ち =====');
    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    // 最終状態
    console.log('\n===== STEP 5: 最終状態 =====');
    await checkState(hostPage, 'Host final');
    await checkState(guestPage, 'Guest final');

    // パネル内容
    const hostPanel = await hostPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 200));
    const guestPanel = await guestPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 200));
    console.log('Host panel:', hostPanel);
    console.log('Guest panel:', guestPanel);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-host-explorer.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-guest-explorer.png', fullPage: true });

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
