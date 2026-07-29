// Playwright でゲーム終了まで進めるテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  // コンソールログ監視
  const setupLogging = (page, name) => {
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error') {
        console.log(`[${name}][ERROR] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => console.error(`[${name}][PAGEERROR] ${err.message}`));
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
  // タイムスタンプを使ってユニークな名前にする
  const timestamp = Date.now();
  await hostPage.fill('#host-name-input', `ホスト${timestamp}`);
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
  await hostPage.waitForTimeout(3000);

  console.log('\n=== フェーズ1: 配置 (place) ===');
  for (let i = 0; i < 5; i++) {
    await hostPage.click('.house.pick');
    await hostPage.waitForTimeout(200);
  }
  for (let i = 0; i < 5; i++) {
    await guestPage.click('.house.pick');
    await guestPage.waitForTimeout(200);
  }
  await hostPage.waitForTimeout(3000);

  console.log('\n=== フェーズ2: 落とし穴 (pit) ===');
  // 落とし穴を仕掛ける道を選択
  const hostEdges = await hostPage.locator('line[onclick]').count();
  if (hostEdges > 0) {
    await hostPage.locator('line[onclick]').first().click();
    await hostPage.waitForTimeout(500);
    await hostPage.click('button:has-text("これでいく")');
  }

  const guestEdges = await guestPage.locator('line[onclick]').count();
  if (guestEdges > 0) {
    await guestPage.locator('line[onclick]').first().click();
    await guestPage.waitForTimeout(500);
    await guestPage.click('button:has-text("これでいく")');
  }
  await hostPage.waitForTimeout(3000);

  // 3日分のゲームループ
  for (let day = 1; day <= 3; day++) {
    console.log(`\n=== ${day}日目 ===`);

    console.log(`${day}日目: 探索者選定 (explorer)`);

    // スクリーンショット撮影
    await hostPage.screenshot({ path: `day${day}-explorer-host.png` });
    await guestPage.screenshot({ path: `day${day}-explorer-guest.png` });

    const hostChips = await hostPage.locator('.chip').count();
    const guestChips = await guestPage.locator('.chip').count();
    console.log(`  ホスト: 選択可能数 = ${hostChips}`);
    console.log(`  ゲスト: 選択可能数 = ${guestChips}`);

    if (hostChips === 0 || guestChips === 0) {
      console.log('  エラー: 探索者選択画面が表示されていません');
      throw new Error('探索者選択画面が表示されていない');
    }

    await hostPage.locator('.chip').first().click();
    await hostPage.waitForTimeout(1000);
    await guestPage.locator('.chip').first().click();
    await hostPage.waitForTimeout(3000);

    console.log(`${day}日目: 経路組み (route)`);
    // 5ティック分の経路を選択
    for (let tick = 0; tick < 5; tick++) {
      // ホスト側
      const hostHouses = await hostPage.locator('.house.pick').count();
      if (hostHouses > 0) {
        await hostPage.locator('.house.pick').first().click();
        await hostPage.waitForTimeout(300);
      }
    }

    for (let tick = 0; tick < 5; tick++) {
      // ゲスト側
      const guestHouses = await guestPage.locator('.house.pick').count();
      if (guestHouses > 0) {
        await guestPage.locator('.house.pick').first().click();
        await guestPage.waitForTimeout(300);
      }
    }
    await hostPage.waitForTimeout(2000);

    // 「昼へ進む」ボタン
    const hostGoToDay = await hostPage.locator('button:has-text("昼へ進む")').count();
    const guestGoToDay = await guestPage.locator('button:has-text("昼へ進む")').count();
    console.log(`  ホスト: 昼へ進むボタン=${hostGoToDay}, ゲスト: 昼へ進むボタン=${guestGoToDay}`);

    if (hostGoToDay > 0) {
      await hostPage.click('button:has-text("昼へ進む")');
    }
    if (guestGoToDay > 0) {
      await guestPage.click('button:has-text("昼へ進む")');
    }
    await hostPage.waitForTimeout(3000);

    console.log(`${day}日目: 爪研ぎ (ticks)`);
    // 各ティックで行動
    for (let tick = 0; tick < 5; tick++) {
      console.log(`  ティック ${tick + 1}/5`);

      // 研ぐボタンがあれば押す
      const hostTick = await hostPage.locator('button:has-text("研ぐ")').count();
      if (hostTick > 0) {
        await hostPage.click('button:has-text("研ぐ")');
        await hostPage.waitForTimeout(500);
      }

      const guestTick = await guestPage.locator('button:has-text("研ぐ")').count();
      if (guestTick > 0) {
        await guestPage.click('button:has-text("研ぐ")');
        await guestPage.waitForTimeout(500);
      }

      // 「次へ」ボタン
      const hostNext = await hostPage.locator('button:has-text("次へ")').count();
      const guestNext = await guestPage.locator('button:has-text("次へ")').count();
      console.log(`    ホスト: 次へボタン=${hostNext}, ゲスト: 次へボタン=${guestNext}`);

      if (hostNext > 0) {
        await hostPage.click('button:has-text("次へ")');
      }
      if (guestNext > 0) {
        await guestPage.click('button:has-text("次へ")');
      }
      await hostPage.waitForTimeout(1500);

      // フェーズ確認
      const hostPhase = await hostPage.evaluate(() => {
        if (!window.G) return null;
        const c = window.G.sched[window.G.idx];
        return { idx: window.G.idx, ph: c.ph, tickIdx: window.G.tickIdx };
      });
      const guestPhase = await guestPage.evaluate(() => {
        if (!window.G) return null;
        const c = window.G.sched[window.G.idx];
        return { idx: window.G.idx, ph: c.ph, tickIdx: window.G.tickIdx };
      });
      console.log(`    フェーズ: ホスト=${JSON.stringify(hostPhase)}, ゲスト=${JSON.stringify(guestPhase)}`);
    }

    // 「昼を終える」ボタン
    const hostFinishDay = await hostPage.locator('button:has-text("昼を終える")').count();
    const guestFinishDay = await guestPage.locator('button:has-text("昼を終える")').count();
    console.log(`  ホスト: 昼を終えるボタン=${hostFinishDay}, ゲスト: 昼を終えるボタン=${guestFinishDay}`);

    if (hostFinishDay > 0) {
      await hostPage.click('button:has-text("昼を終える")');
    }
    if (guestFinishDay > 0) {
      await guestPage.click('button:has-text("昼を終える")');
    }
    await hostPage.waitForTimeout(3000);

    console.log(`${day}日目: 夜の選択 (night)`);

    // スクリーンショット撮影
    await hostPage.screenshot({ path: `day${day}-night-before-host.png` });
    await guestPage.screenshot({ path: `day${day}-night-before-guest.png` });

    // 襲撃対象を選択
    const hostAttack = await hostPage.locator('.chip').count();
    const guestAttack = await guestPage.locator('.chip').count();
    console.log(`  ホスト: chip数 = ${hostAttack}`);
    console.log(`  ゲスト: chip数 = ${guestAttack}`);

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
    console.log(`  ホスト: 夜を明かすボタン数 = ${hostNightButton}`);
    console.log(`  ゲスト: 夜を明かすボタン数 = ${guestNightButton}`);

    if (hostNightButton > 0) {
      await hostPage.click('button:has-text("夜を明かす")');
    }
    if (guestNightButton > 0) {
      await guestPage.click('button:has-text("夜を明かす")');
    }
    await hostPage.waitForTimeout(3000);

    // スクリーンショット撮影（確定後）
    await hostPage.screenshot({ path: `day${day}-night-after-host.png` });
    await guestPage.screenshot({ path: `day${day}-night-after-guest.png` });

    console.log(`${day}日目: 夜明け (morning)`);

    // スクリーンショット撮影
    await hostPage.screenshot({ path: `day${day}-morning-host.png` });
    await guestPage.screenshot({ path: `day${day}-morning-guest.png` });

    // 現在のフェーズを確認
    const hostBeforeMorning = await hostPage.evaluate(() => {
      if (!window.G) return null;
      const c = window.G.sched[window.G.idx];
      return { idx: window.G.idx, ph: c.ph, who: c.who, day: window.G.day || c.day };
    });
    const guestBeforeMorning = await guestPage.evaluate(() => {
      if (!window.G) return null;
      const c = window.G.sched[window.G.idx];
      return { idx: window.G.idx, ph: c.ph, who: c.who, day: window.G.day || c.day };
    });
    console.log(`  現在: ホスト=${JSON.stringify(hostBeforeMorning)}, ゲスト=${JSON.stringify(guestBeforeMorning)}`);

    // 「次の日へ」または「決着を見る」ボタン
    const hostMorning = await hostPage.locator('button:has-text("次の日へ"), button:has-text("決着を見る")').count();
    const guestMorning = await guestPage.locator('button:has-text("次の日へ"), button:has-text("決着を見る")').count();
    console.log(`  ホスト: ボタン数 = ${hostMorning}`);
    console.log(`  ゲスト: ボタン数 = ${guestMorning}`);

    if (hostMorning > 0) {
      await hostPage.locator('button:has-text("次の日へ"), button:has-text("決着を見る")').first().click();
    }
    if (guestMorning > 0) {
      await guestPage.locator('button:has-text("次の日へ"), button:has-text("決着を見る")').first().click();
    }
    await hostPage.waitForTimeout(3000);

    // ゲーム終了チェック
    const hostDone = await hostPage.evaluate(() => window.G && window.G.done);
    const guestDone = await guestPage.evaluate(() => window.G && window.G.done);
    console.log(`  ゲーム終了: ホスト=${hostDone}, ゲスト=${guestDone}`);

    if (hostDone || guestDone) {
      console.log(`\n${day}日目でゲーム終了！`);
      break;
    }

    // 現在の状態を確認
    const hostPhase = await hostPage.evaluate(() => {
      if (!window.G) return null;
      const c = window.G.sched[window.G.idx];
      return { idx: window.G.idx, ph: c.ph, day: window.G.day };
    });
    const guestPhase = await guestPage.evaluate(() => {
      if (!window.G) return null;
      const c = window.G.sched[window.G.idx];
      return { idx: window.G.idx, ph: c.ph, day: window.G.day };
    });
    console.log(`  次のフェーズ: ホスト=${JSON.stringify(hostPhase)}, ゲスト=${JSON.stringify(guestPhase)}`);
  }

  // 最終状態を確認
  const finalHost = await hostPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return {
      idx: window.G.idx,
      ph: c.ph,
      day: window.G.day,
      done: window.G.done,
      winner: window.G.winner
    };
  });
  const finalGuest = await guestPage.evaluate(() => {
    if (!window.G) return null;
    const c = window.G.sched[window.G.idx];
    return {
      idx: window.G.idx,
      ph: c.ph,
      day: window.G.day,
      done: window.G.done,
      winner: window.G.winner
    };
  });

  console.log('\n=== 最終状態 ===');
  console.log('ホスト:', finalHost);
  console.log('ゲスト:', finalGuest);

  await hostPage.screenshot({ path: 'final-host.png' });
  await guestPage.screenshot({ path: 'final-guest.png' });

  console.log('\n30秒間確認...');
  await hostPage.waitForTimeout(30000);

  await browser.close();
  console.log('テスト完了');
})();
