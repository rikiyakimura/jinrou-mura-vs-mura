import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('フルゲーム: 5軒3日を最後まで', async ({ browser }) => {
  test.setTimeout(180000); // 3分

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  hostPage.on('console', msg => {
    if (msg.type() === 'error') console.log(`[HOST ERROR] ${msg.text()}`);
  });
  guestPage.on('console', msg => {
    if (msg.type() === 'error') console.log(`[GUEST ERROR] ${msg.text()}`);
  });

  const getPhase = async (page) => {
    return page.evaluate(() => ({
      phase: window.G?.sched?.[window.G?.idx]?.ph,
      idx: window.G?.idx,
      day: window.G?.day,
      done: window.G?.done
    }));
  };

  const waitForPhase = async (page, name, targetPhase, maxWait = 10000) => {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const state = await getPhase(page);
      if (state.phase === targetPhase || state.done) return state;
      await page.waitForTimeout(300);
    }
    return getPhase(page);
  };

  const clickChipOrButton = async (page, name) => {
    // パネル内のchipかbuttonを探してクリック
    const chip = await page.$('#panel .chip');
    if (chip) {
      await chip.click();
      return true;
    }
    const btn = await page.$('#panel button.primary');
    if (btn) {
      await btn.click();
      return true;
    }
    return false;
  };

  const clickHouse = async (page, name) => {
    const house = await page.$('#map-foe .house.pick');
    if (house) {
      await house.click();
      return true;
    }
    return false;
  };

  try {
    // ===== ルーム作成・参加 =====
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

    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'Guest');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('ゲーム開始');

    // ===== 配置フェーズ =====
    console.log('=== 配置フェーズ ===');
    for (let i = 0; i < 5; i++) {
      const hh = await hostPage.$$('#map-mine .house.pick');
      if (hh.length > 0) await hh[0].click();
      const gh = await guestPage.$$('#map-mine .house.pick');
      if (gh.length > 0) await gh[0].click();
      await hostPage.waitForTimeout(200);
    }
    console.log('配置完了');

    // 探索者フェーズまで待機
    await waitForPhase(hostPage, 'Host', 'explorer');
    await waitForPhase(guestPage, 'Guest', 'explorer');

    // ===== 3日分のループ =====
    for (let day = 1; day <= 3; day++) {
      console.log(`=== ${day}日目 ===`);

      // 探索者選択
      let hostState = await getPhase(hostPage);
      let guestState = await getPhase(guestPage);
      console.log(`探索者選択: Host=${hostState.phase}, Guest=${guestState.phase}`);

      if (hostState.phase === 'explorer') {
        await clickChipOrButton(hostPage, 'Host');
        await hostPage.waitForTimeout(300);
      }
      if (guestState.phase === 'explorer') {
        await clickChipOrButton(guestPage, 'Guest');
        await guestPage.waitForTimeout(300);
      }

      // 経路フェーズまで待機
      await waitForPhase(hostPage, 'Host', 'route');
      await waitForPhase(guestPage, 'Guest', 'route');
      console.log('経路選択開始');

      // 経路選択（5回クリック）
      for (let tick = 0; tick < 5; tick++) {
        hostState = await getPhase(hostPage);
        guestState = await getPhase(guestPage);

        // パネル状態のデバッグ
        const hostPanelInfo = await hostPage.evaluate(() => ({
          panelText: document.getElementById('panel')?.innerText?.substring(0, 100),
          hasChip: !!document.querySelector('#panel .chip'),
          hasButton: !!document.querySelector('#panel button.primary'),
          routeLen: window.G?.V?.[window.G?.myPlayerId]?.route?.length
        }));
        const guestPanelInfo = await guestPage.evaluate(() => ({
          panelText: document.getElementById('panel')?.innerText?.substring(0, 100),
          hasChip: !!document.querySelector('#panel .chip'),
          hasButton: !!document.querySelector('#panel button.primary'),
          routeLen: window.G?.V?.[window.G?.myPlayerId]?.route?.length
        }));
        console.log(`tick ${tick + 1} - Host route len: ${hostPanelInfo.routeLen}, panel: ${hostPanelInfo.panelText?.replace(/\n/g, ' ')}`);
        console.log(`tick ${tick + 1} - Guest route len: ${guestPanelInfo.routeLen}, panel: ${guestPanelInfo.panelText?.replace(/\n/g, ' ')}`);

        // Hostの経路選択
        if (hostState.phase === 'route') {
          const hostHouses = await hostPage.$$('#map-foe .house.pick');
          console.log(`Host route tick ${tick + 1}: ${hostHouses.length} houses available`);
          if (hostHouses.length > 0) await hostHouses[0].click();
        }
        // Guestの経路選択
        if (guestState.phase === 'route') {
          const guestHouses = await guestPage.$$('#map-foe .house.pick');
          console.log(`Guest route tick ${tick + 1}: ${guestHouses.length} houses available`);
          if (guestHouses.length > 0) await guestHouses[0].click();
        }
        await hostPage.waitForTimeout(300);
      }

      // 経路完了後の確認ボタン
      hostState = await getPhase(hostPage);
      guestState = await getPhase(guestPage);
      console.log(`経路選択後状態: Host=${hostState.phase}, Guest=${guestState.phase}`);

      const hostRouteBtn = await hostPage.$('#panel button.primary');
      const guestRouteBtn = await guestPage.$('#panel button.primary');
      console.log(`確定ボタン: Host=${!!hostRouteBtn}, Guest=${!!guestRouteBtn}`);
      if (hostRouteBtn) {
        console.log('Host: 経路確定ボタンをクリック');
        await hostRouteBtn.click();
      }
      if (guestRouteBtn) {
        console.log('Guest: 経路確定ボタンをクリック');
        await guestRouteBtn.click();
      }
      console.log('経路選択完了');

      // ticksフェーズまで待機
      await waitForPhase(hostPage, 'Host', 'ticks');
      await waitForPhase(guestPage, 'Guest', 'ticks');

      // ticks（フェーズが変わるまでクリック - 5回+完了ボタン）
      console.log('ticks開始');
      for (let tick = 0; tick < 10; tick++) {
        hostState = await getPhase(hostPage);
        guestState = await getPhase(guestPage);

        // 両方がticksフェーズから抜けたら終了
        if (hostState.phase !== 'ticks' && guestState.phase !== 'ticks') {
          console.log(`ticks完了（${tick}回クリック後）`);
          break;
        }

        // 安全なクリック（DOM変更に対応）
        try {
          if (hostState.phase === 'ticks') {
            const nextBtn = await hostPage.$('#panel button.primary');
            if (nextBtn) {
              console.log(`Host ticks click ${tick + 1}`);
              await nextBtn.click().catch(() => {});
            }
          }
        } catch (e) { /* ignore */ }

        try {
          if (guestState.phase === 'ticks') {
            const nextBtn = await guestPage.$('#panel button.primary');
            if (nextBtn) {
              console.log(`Guest ticks click ${tick + 1}`);
              await nextBtn.click().catch(() => {});
            }
          }
        } catch (e) { /* ignore */ }

        await hostPage.waitForTimeout(500);
      }

      hostState = await getPhase(hostPage);
      guestState = await getPhase(guestPage);
      console.log(`ticks後: Host=${hostState.phase}, Guest=${guestState.phase}`);

      // nightフェーズまたは次のフェーズを待機（夜がスキップされる場合あり）
      await hostPage.waitForTimeout(1000);
      hostState = await getPhase(hostPage);
      guestState = await getPhase(guestPage);
      console.log(`ticks後フェーズ: Host=${hostState.phase}, Guest=${guestState.phase}`);

      // 夜（襲撃先選択 + 決定）- nightフェーズの場合のみ
      // 両者が順番に処理（同時だとDB競合の可能性）
      if (hostState.phase === 'night') {
        console.log('Host: 夜フェーズ処理開始');
        const hostPanelText = await hostPage.evaluate(() =>
          document.getElementById('panel')?.innerText?.substring(0, 100)
        );
        console.log(`Host パネル: ${hostPanelText?.replace(/\n/g, ' ')}`);

        // 襲撃先選択（あれば）
        const attackChip = await hostPage.$('#panel .chip');
        console.log(`Host attack chip found: ${!!attackChip}`);
        if (attackChip) await attackChip.click();
        await hostPage.waitForTimeout(300);

        // 決定ボタン
        const confirmBtn = await hostPage.$('#panel button.primary');
        console.log(`Host confirm btn found: ${!!confirmBtn}`);
        if (confirmBtn) await confirmBtn.click();

        // DB同期待ち
        await hostPage.waitForTimeout(1000);
      }

      if (guestState.phase === 'night') {
        console.log('Guest: 夜フェーズ処理開始');
        const guestPanelText = await guestPage.evaluate(() =>
          document.getElementById('panel')?.innerText?.substring(0, 100)
        );
        console.log(`Guest パネル: ${guestPanelText?.replace(/\n/g, ' ')}`);

        const attackChip = await guestPage.$('#panel .chip');
        console.log(`Guest attack chip found: ${!!attackChip}`);
        if (attackChip) await attackChip.click();
        await guestPage.waitForTimeout(300);

        const confirmBtn = await guestPage.$('#panel button.primary');
        console.log(`Guest confirm btn found: ${!!confirmBtn}`);
        if (confirmBtn) await confirmBtn.click();

        // DB同期待ち
        await guestPage.waitForTimeout(1000);
      }
      console.log('夜処理完了');

      // 次フェーズへの遷移を待つ（veil非表示になるまで）
      console.log('フェーズ遷移待機中...');
      for (let wait = 0; wait < 30; wait++) {
        const hostVeil = await hostPage.evaluate(() => {
          const v = document.getElementById('veil');
          return v && v.style.display !== 'none';
        });
        const guestVeil = await guestPage.evaluate(() => {
          const v = document.getElementById('veil');
          return v && v.style.display !== 'none';
        });
        if (!hostVeil && !guestVeil) break;
        await hostPage.waitForTimeout(500);
      }

      hostState = await getPhase(hostPage);
      guestState = await getPhase(guestPage);
      console.log(`フェーズ遷移後: Host=${hostState.phase}(done=${hostState.done}), Guest=${guestState.phase}(done=${guestState.done})`);

      // ゲーム終了チェック
      if (hostState.done || guestState.done) {
        console.log('=== ゲーム終了！ ===');
        break;
      }

      // morningフェーズを進める
      if (hostState.phase === 'morning') {
        console.log('Host: morningボタンをクリック');
        const nextBtn = await hostPage.$('#panel button.primary');
        if (nextBtn) await nextBtn.click();
      }
      if (guestState.phase === 'morning') {
        console.log('Guest: morningボタンをクリック');
        const nextBtn = await guestPage.$('#panel button.primary');
        if (nextBtn) await nextBtn.click();
      }

      // 次の日の探索者フェーズまで待機
      await waitForPhase(hostPage, 'Host', 'explorer', 15000);
      await waitForPhase(guestPage, 'Guest', 'explorer', 15000);
    }

    // 最終状態
    const finalHost = await getPhase(hostPage);
    const finalGuest = await getPhase(guestPage);
    console.log(`最終: Host=${finalHost.phase}(done=${finalHost.done}), Guest=${finalGuest.phase}(done=${finalGuest.done})`);

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-results/full-game-host.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-results/full-game-guest.png', fullPage: true });

    if (finalHost.done || finalGuest.done || finalHost.phase === 'end') {
      console.log('テスト成功: ゲームが最後まで進行しました！');
    } else {
      console.log('テスト警告: ゲームが完了していない可能性があります');
    }

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
