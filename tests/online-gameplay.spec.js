import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オンライン対戦: フルゲームプレイテスト', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST ${msg.type()}] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST ${msg.type()}] ${msg.text()}`));
  hostPage.on('pageerror', err => console.log(`[HOST ERROR] ${err.message}`));
  guestPage.on('pageerror', err => console.log(`[GUEST ERROR] ${err.message}`));

  try {
    // ===== ルーム作成と参加 =====
    console.log('\n===== STEP 1: ルーム作成と参加 =====');

    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.title');
    await hostPage.click('button.online');
    await hostPage.waitForSelector('.online-menu');
    await hostPage.fill('#player-name', 'ホスト');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });

    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    await guestPage.goto(BASE_URL);
    await guestPage.waitForSelector('.title');
    await guestPage.click('button.online');
    await guestPage.waitForSelector('.online-menu');
    await guestPage.fill('#player-name', 'ゲスト');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    // 両者がゲーム画面に入るのを待つ
    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // ===== 初期状態確認 =====
    console.log('\n===== STEP 2: 初期状態確認 =====');

    const checkState = async (page, name) => {
      const state = await page.evaluate(() => ({
        mode: window.G?.mode,
        myPlayerId: window.G?.myPlayerId,
        idx: window.G?.idx,
        phase: window.G?.sched?.[window.G?.idx]?.ph,
        who: window.G?.sched?.[window.G?.idx]?.who,
        placeIdx1: window.G?.V?.[1]?.placeIdx,
        placeIdx2: window.G?.V?.[2]?.placeIdx,
        roomId: window.G?.roomId
      }));
      console.log(`${name} state:`, JSON.stringify(state));
      return state;
    };

    await checkState(hostPage, 'Host');
    await checkState(guestPage, 'Guest');

    // ===== 配置フェーズテスト =====
    console.log('\n===== STEP 3: 村人配置 =====');

    // ホストが村人を配置
    console.log('ホストが村人を配置...');
    for (let i = 0; i < 5; i++) {
      const pickableHouses = await hostPage.$$('#map-mine .house.pick');
      if (pickableHouses.length > 0) {
        await pickableHouses[0].click();
        await hostPage.waitForTimeout(300);
      }
    }
    console.log('ホスト配置完了');
    await checkState(hostPage, 'Host after place');

    // ホストの画面状態を確認
    const hostVeil = await hostPage.evaluate(() => ({
      display: document.getElementById('veil')?.style.display,
      innerHTML: document.getElementById('veil')?.innerHTML?.substring(0, 200)
    }));
    console.log('Host veil:', JSON.stringify(hostVeil));

    // ゲストが村人を配置
    console.log('\nゲストが村人を配置...');
    for (let i = 0; i < 5; i++) {
      const pickableHouses = await guestPage.$$('#map-mine .house.pick');
      if (pickableHouses.length > 0) {
        await pickableHouses[0].click();
        await guestPage.waitForTimeout(300);
      }
    }
    console.log('ゲスト配置完了');
    await checkState(guestPage, 'Guest after place');

    // ゲストの画面状態を確認
    const guestVeil = await guestPage.evaluate(() => ({
      display: document.getElementById('veil')?.style.display,
      innerHTML: document.getElementById('veil')?.innerHTML?.substring(0, 200)
    }));
    console.log('Guest veil:', JSON.stringify(guestVeil));

    // 同期待ち
    console.log('\n===== STEP 4: 同期待ち =====');
    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    // 最終状態確認
    console.log('\n===== STEP 5: 最終状態確認 =====');
    await checkState(hostPage, 'Host final');
    await checkState(guestPage, 'Guest final');

    // パネル内容確認
    const hostPanelText = await hostPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 300));
    const guestPanelText = await guestPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 300));
    console.log('Host panel:', hostPanelText);
    console.log('Guest panel:', guestPanelText);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-host-gameplay.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-guest-gameplay.png', fullPage: true });
    console.log('\nスクリーンショット保存完了');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
