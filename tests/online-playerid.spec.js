import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オンライン対戦: プレイヤーID確認', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST ${msg.type()}] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST ${msg.type()}] ${msg.text()}`));

  try {
    // ルーム作成と参加
    console.log('\n===== ルーム作成と参加 =====');
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

    // ゲストが参加する前にホストがゲーム状態を初期化するのを待つ
    await hostPage.waitForTimeout(2000);

    await hostPage.waitForSelector('#map-mine .house', { timeout: 20000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 20000 });

    // プレイヤーIDを確認
    console.log('\n===== プレイヤーID確認 =====');

    const hostState = await hostPage.evaluate(() => ({
      mode: window.G?.mode,
      myPlayerId: window.G?.myPlayerId,
      meId: window.G?.V?.[window.G?.myPlayerId]?.id,
      me_placeIdx: window.G?.V?.[window.G?.myPlayerId]?.placeIdx,
      statusBadge: document.querySelector('#status .turnbadge')?.textContent,
      mapMineTitle: document.getElementById('t-mine')?.textContent
    }));
    console.log('Host state:', JSON.stringify(hostState));

    const guestState = await guestPage.evaluate(() => ({
      mode: window.G?.mode,
      myPlayerId: window.G?.myPlayerId,
      meId: window.G?.V?.[window.G?.myPlayerId]?.id,
      me_placeIdx: window.G?.V?.[window.G?.myPlayerId]?.placeIdx,
      statusBadge: document.querySelector('#status .turnbadge')?.textContent,
      mapMineTitle: document.getElementById('t-mine')?.textContent
    }));
    console.log('Guest state:', JSON.stringify(guestState));

    // 検証
    console.log('\n===== 検証 =====');
    console.log(`Host myPlayerId: ${hostState.myPlayerId} (期待値: 1)`);
    console.log(`Guest myPlayerId: ${guestState.myPlayerId} (期待値: 2)`);

    expect(hostState.myPlayerId).toBe(1);
    expect(guestState.myPlayerId).toBe(2);

    // 配置後の確認
    console.log('\n===== 配置後 =====');
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

    const hostAfter = await hostPage.evaluate(() => ({
      myPlayerId: window.G?.myPlayerId,
      placeIdx1: window.G?.V?.[1]?.placeIdx,
      placeIdx2: window.G?.V?.[2]?.placeIdx
    }));
    const guestAfter = await guestPage.evaluate(() => ({
      myPlayerId: window.G?.myPlayerId,
      placeIdx1: window.G?.V?.[1]?.placeIdx,
      placeIdx2: window.G?.V?.[2]?.placeIdx
    }));
    console.log('Host after place:', JSON.stringify(hostAfter));
    console.log('Guest after place:', JSON.stringify(guestAfter));

    expect(hostAfter.myPlayerId).toBe(1);
    expect(guestAfter.myPlayerId).toBe(2);
    expect(hostAfter.placeIdx1).toBe(5);
    expect(hostAfter.placeIdx2).toBe(5);
    expect(guestAfter.placeIdx1).toBe(5);
    expect(guestAfter.placeIdx2).toBe(5);

    console.log('\n===== 全検証パス =====');

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
