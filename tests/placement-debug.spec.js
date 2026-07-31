import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('配置フェーズ: 後から配置した方が固まるか確認', async ({ browser }) => {
  test.setTimeout(60000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST] ${msg.text()}`));

  try {
    // ===== ルーム作成 =====
    console.log('=== ルーム作成 ===');
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.modebtns', { timeout: 10000 });
    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'Host');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.click('button:has-text("開始")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    // ===== ゲスト参加 =====
    console.log('=== ゲスト参加 ===');
    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'Guest');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    // ゲーム画面待ち
    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // ===== 配置フェーズ =====
    console.log('=== 配置フェーズ開始 ===');

    // ホストが先に配置（5人）
    console.log('ホスト配置開始...');
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      console.log(`ホスト: 配置可能な家 ${houses.length} 件`);
      if (houses.length > 0) {
        await houses[0].click();
        await hostPage.waitForTimeout(300);
      } else {
        console.log(`ホスト: ${i}人目で配置可能な家がなくなった`);
        break;
      }
    }
    console.log('ホスト配置完了');

    // ホストの状態確認
    const hostPlaced = await hostPage.evaluate(() =>
      window.G?.V?.[1]?.people?.filter(p => p.house !== null).length
    );
    console.log(`ホスト配置済み: ${hostPlaced}人`);

    await hostPage.waitForTimeout(1000);

    // ゲストが後から配置（5人）
    console.log('ゲスト配置開始...');
    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-mine .house.pick');
      console.log(`ゲスト: 配置可能な家 ${houses.length} 件 (${i}人目)`);
      if (houses.length > 0) {
        await houses[0].click();
        await guestPage.waitForTimeout(300);
      } else {
        console.log(`ゲスト: ${i}人目で配置可能な家がなくなった！ ← バグ？`);

        // デバッグ情報
        const guestState = await guestPage.evaluate(() => ({
          idx: window.G?.idx,
          phase: window.G?.sched?.[window.G?.idx]?.ph,
          placed: window.G?.V?.[2]?.people?.filter(p => p.house !== null).length,
          panel: document.getElementById('panel')?.innerText?.substring(0, 200)
        }));
        console.log('ゲスト状態:', JSON.stringify(guestState, null, 2));
        break;
      }
    }

    // ゲストの状態確認
    const guestPlaced = await guestPage.evaluate(() =>
      window.G?.V?.[2]?.people?.filter(p => p.house !== null).length
    );
    console.log(`ゲスト配置済み: ${guestPlaced}人`);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-results/host-placement.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-results/guest-placement.png', fullPage: true });

    // 結果
    if (guestPlaced < 5) {
      console.log('!!! バグ確認: ゲストが5人配置できていない !!!');
    } else {
      console.log('配置フェーズ正常完了');
    }

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
