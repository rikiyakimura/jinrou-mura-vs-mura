import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('配置フェーズ: 9軒モードで確認', async ({ browser }) => {
  test.setTimeout(90000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => console.log(`[HOST] ${msg.text()}`));
  guestPage.on('console', msg => console.log(`[GUEST] ${msg.text()}`));

  try {
    // ルーム作成（9軒モード）
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.modebtns', { timeout: 10000 });
    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'Host');
    await hostPage.click('button:has-text("ルームを作る")');

    // 9軒モードを選択
    await hostPage.click('.optchip:has-text("9軒5日")');
    await hostPage.waitForTimeout(300);

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
    console.log('両者がゲーム画面に入りました（9軒モード）');

    // 家の数確認
    const hostHouseCount = await hostPage.$$eval('#map-mine .house', els => els.length);
    const guestHouseCount = await guestPage.$$eval('#map-mine .house', els => els.length);
    console.log(`家の数: Host ${hostHouseCount}件, Guest ${guestHouseCount}件`);

    // 配置人数確認
    const villagerCount = await hostPage.evaluate(() => window.G?.V?.[1]?.people?.length);
    console.log(`配置する村人数: ${villagerCount}人`);

    // ===== ホスト配置 =====
    console.log('=== ホスト配置 ===');
    for (let i = 0; i < 9; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      if (houses.length === 0) {
        console.log(`ホスト: ${i}人目で終了（配置可能な家なし）`);
        break;
      }
      console.log(`ホスト ${i + 1}人目: ${houses.length}件から選択`);
      await houses[0].click();
      await hostPage.waitForTimeout(200);
    }

    const hostPlaced = await hostPage.evaluate(() =>
      window.G?.V?.[1]?.people?.filter(p => p.house !== null).length
    );
    console.log(`ホスト配置完了: ${hostPlaced}人`);

    // ===== ゲスト配置 =====
    console.log('=== ゲスト配置 ===');
    for (let i = 0; i < 9; i++) {
      // 配置前の状態
      const beforeState = await guestPage.evaluate(() => ({
        placeIdx: window.G?.V?.[window.G?.myPlayerId]?.placeIdx,
        placed: window.G?.V?.[window.G?.myPlayerId]?.people?.filter(p => p.house !== null).length,
        myPlayerId: window.G?.myPlayerId,
        villagers: window.getConfig?.()?.VILLAGERS
      }));
      console.log(`ゲスト ${i + 1}人目 前: placeIdx=${beforeState.placeIdx}, placed=${beforeState.placed}, VILLAGERS=${beforeState.villagers}`);

      const houses = await guestPage.$$('#map-mine .house.pick');
      if (houses.length === 0) {
        console.log(`ゲスト: ${i}人目で終了（配置可能な家なし）`);
        const debugInfo = await guestPage.evaluate(() => ({
          phase: window.G?.sched?.[window.G?.idx]?.ph,
          idx: window.G?.idx,
          placeIdx: window.G?.V?.[window.G?.myPlayerId]?.placeIdx
        }));
        console.log('ゲストデバッグ:', JSON.stringify(debugInfo, null, 2));
        break;
      }
      console.log(`ゲスト ${i + 1}人目: ${houses.length}件から選択`);
      await houses[0].click();
      await guestPage.waitForTimeout(300);

      // 配置後の状態
      const afterState = await guestPage.evaluate(() => ({
        placeIdx: window.G?.V?.[window.G?.myPlayerId]?.placeIdx,
        placed: window.G?.V?.[window.G?.myPlayerId]?.people?.filter(p => p.house !== null).length,
        waiting: document.querySelector('.waiting-indicator') !== null
      }));
      console.log(`ゲスト ${i + 1}人目 後: placeIdx=${afterState.placeIdx}, placed=${afterState.placed}, waiting=${afterState.waiting}`);
    }

    const guestPlaced = await guestPage.evaluate(() =>
      window.G?.V?.[2]?.people?.filter(p => p.house !== null).length
    );
    console.log(`ゲスト配置完了: ${guestPlaced}人`);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-results/host-large.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-results/guest-large.png', fullPage: true });

    // 結果
    console.log(`最終: Host ${hostPlaced}人, Guest ${guestPlaced}人`);
    if (hostPlaced < villagerCount || guestPlaced < villagerCount) {
      console.log('!!! バグ: 配置が完了していない !!!');
    }

    // ===== 配置後の同期を待つ =====
    console.log('=== 配置後の同期待ち ===');

    // 5秒待って状態確認
    for (let i = 0; i < 10; i++) {
      await hostPage.waitForTimeout(500);

      const hostState = await hostPage.evaluate(() => ({
        phase: window.G?.sched?.[window.G?.idx]?.ph,
        idx: window.G?.idx,
        veilDisplay: document.getElementById('veil')?.style.display,
        waitingText: document.querySelector('.waiting-indicator')?.innerText
      }));

      const guestState = await guestPage.evaluate(() => ({
        phase: window.G?.sched?.[window.G?.idx]?.ph,
        idx: window.G?.idx,
        veilDisplay: document.getElementById('veil')?.style.display,
        waitingText: document.querySelector('.waiting-indicator')?.innerText
      }));

      console.log(`${i + 1}回目: Host=${hostState.phase}(idx:${hostState.idx}), Guest=${guestState.phase}(idx:${guestState.idx})`);
      console.log(`  Host待機: ${hostState.waitingText || 'なし'}, Guest待機: ${guestState.waitingText || 'なし'}`);

      // explorerフェーズに進んだらOK
      if (hostState.phase === 'explorer' && guestState.phase === 'explorer') {
        console.log('=== 探索者選択フェーズに到達！ ===');
        break;
      }
    }

    // 最終状態
    const finalHostState = await hostPage.evaluate(() => ({
      phase: window.G?.sched?.[window.G?.idx]?.ph,
      panelText: document.getElementById('panel')?.innerText?.substring(0, 200)
    }));
    const finalGuestState = await guestPage.evaluate(() => ({
      phase: window.G?.sched?.[window.G?.idx]?.ph,
      panelText: document.getElementById('panel')?.innerText?.substring(0, 200)
    }));

    console.log('最終状態:');
    console.log('Host:', finalHostState.phase, finalHostState.panelText?.substring(0, 100));
    console.log('Guest:', finalGuestState.phase, finalGuestState.panelText?.substring(0, 100));

    await hostPage.screenshot({ path: 'test-results/host-after-place.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-results/guest-after-place.png', fullPage: true });

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
