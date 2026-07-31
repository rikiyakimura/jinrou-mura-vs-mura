import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('配置フェーズ: 同時配置で固まるか確認', async ({ browser }) => {
  test.setTimeout(60000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST] ${msg.text()}`));

  try {
    // ルーム作成・参加
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.modebtns', { timeout: 10000 });
    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'Host');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.click('button:has-text("開始")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'Guest');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // ===== 同時配置 =====
    console.log('=== 同時配置開始 ===');

    // 両者が交互に1人ずつ配置（ほぼ同時）
    for (let i = 0; i < 5; i++) {
      const hostHouses = await hostPage.$$('#map-mine .house.pick');
      const guestHouses = await guestPage.$$('#map-mine .house.pick');

      console.log(`ラウンド${i + 1}: Host ${hostHouses.length}件, Guest ${guestHouses.length}件`);

      // 同時にクリック
      const promises = [];
      if (hostHouses.length > 0) {
        promises.push(hostHouses[0].click());
      }
      if (guestHouses.length > 0) {
        promises.push(guestHouses[0].click());
      }
      await Promise.all(promises);

      await hostPage.waitForTimeout(200);
      await guestPage.waitForTimeout(200);
    }

    // 結果確認
    const hostPlaced = await hostPage.evaluate(() =>
      window.G?.V?.[1]?.people?.filter(p => p.house !== null).length
    );
    const guestPlaced = await guestPage.evaluate(() =>
      window.G?.V?.[2]?.people?.filter(p => p.house !== null).length
    );

    console.log(`結果: Host ${hostPlaced}人, Guest ${guestPlaced}人`);

    // 残りの配置を試みる
    if (hostPlaced < 5) {
      console.log('ホストが追加配置を試みる...');
      for (let i = hostPlaced; i < 5; i++) {
        const houses = await hostPage.$$('#map-mine .house.pick');
        console.log(`Host追加: ${houses.length}件`);
        if (houses.length > 0) await houses[0].click();
        await hostPage.waitForTimeout(200);
      }
    }

    if (guestPlaced < 5) {
      console.log('ゲストが追加配置を試みる...');
      for (let i = guestPlaced; i < 5; i++) {
        const houses = await guestPage.$$('#map-mine .house.pick');
        console.log(`Guest追加: ${houses.length}件`);
        if (houses.length > 0) await houses[0].click();
        await guestPage.waitForTimeout(200);
      }
    }

    // 最終結果
    const finalHost = await hostPage.evaluate(() =>
      window.G?.V?.[1]?.people?.filter(p => p.house !== null).length
    );
    const finalGuest = await guestPage.evaluate(() =>
      window.G?.V?.[2]?.people?.filter(p => p.house !== null).length
    );

    console.log(`最終結果: Host ${finalHost}人, Guest ${finalGuest}人`);

    await hostPage.screenshot({ path: 'test-results/host-concurrent.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-results/guest-concurrent.png', fullPage: true });

    if (finalHost < 5 || finalGuest < 5) {
      console.log('!!! バグ: 配置が完了していない !!!');
    }

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
