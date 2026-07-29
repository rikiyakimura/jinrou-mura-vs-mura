import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オンライン対戦: 落とし穴テスト', async ({ browser }) => {
  test.setTimeout(120000);  // 2分のタイムアウト
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
      pitOpt: window.G?.opt?.pit,
      sched: window.G?.sched?.slice(0, 10).map(s => `${s.who}:${s.ph}`)
    }));
    console.log(`${name}:`, JSON.stringify(state));
    return state;
  };

  try {
    // ===== ルーム作成（落とし穴オプション有効） =====
    console.log('\n===== STEP 1: ルーム作成（落とし穴オプション有効） =====');
    await hostPage.goto(BASE_URL);
    await hostPage.waitForSelector('.title');

    // タイトル画面で落とし穴オプションを有効化（オンラインボタンを押す前に）
    const pitButton = await hostPage.$('.optchip:has-text("落とし穴")');
    if (pitButton) {
      await pitButton.click();
      console.log('落とし穴オプションを有効化');
      await hostPage.waitForTimeout(300);
    } else {
      console.log('落とし穴ボタンが見つからない');
    }

    await hostPage.click('button.online');
    await hostPage.fill('#player-name', 'ホスト');
    await hostPage.click('button:has-text("ルームを作る")');
    await hostPage.waitForSelector('.room-code', { timeout: 10000 });
    const roomCode = await hostPage.textContent('.room-code');
    console.log(`ルームコード: ${roomCode}`);

    // ゲスト参加
    await guestPage.goto(BASE_URL);
    await guestPage.click('button.online');
    await guestPage.fill('#player-name', 'ゲスト');
    await guestPage.click('button:has-text("ルームに参加")');
    await guestPage.fill('#room-code', roomCode.trim());
    await guestPage.click('button:has-text("参加する")');

    await hostPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    await guestPage.waitForSelector('#map-mine .house', { timeout: 15000 });
    console.log('両者がゲーム画面に入りました');

    // 初期状態確認
    await checkState(hostPage, 'Initial Host');
    await checkState(guestPage, 'Initial Guest');

    // ===== 配置フェーズ =====
    console.log('\n===== STEP 2: 村人配置 =====');
    for (let i = 0; i < 5; i++) {
      const houses = await hostPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await hostPage.waitForTimeout(200);
    }
    console.log('ホスト: 配置完了');

    for (let i = 0; i < 5; i++) {
      const houses = await guestPage.$$('#map-mine .house.pick');
      if (houses.length > 0) await houses[0].click();
      await guestPage.waitForTimeout(200);
    }
    console.log('ゲスト: 配置完了');

    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    const afterPlace = await checkState(hostPage, 'After place');
    console.log('期待: phase = pit');

    // ===== 落とし穴フェーズ =====
    console.log('\n===== STEP 3: 落とし穴配置 =====');

    // パネル内容を確認
    const hostPanel = await hostPage.evaluate(() => document.getElementById('panel')?.innerText?.substring(0, 300));
    console.log('Host panel:', hostPanel);

    // 落とし穴の辺を選択（SVG内のエッジをクリック）
    const hostEdges = await hostPage.$$('#map-mine svg .edge-pick');
    console.log(`ホスト: 選択可能なエッジ数: ${hostEdges.length}`);
    if (hostEdges.length > 0) {
      await hostEdges[0].click({ force: true });
      console.log('ホスト: 落とし穴の辺を選択');
      await hostPage.waitForTimeout(300);
    }

    // pitEdgeが設定されたか確認
    const hostPitEdge = await hostPage.evaluate(() => window.G?.V?.[window.G?.myPlayerId]?.pitEdge);
    console.log(`ホスト pitEdge: ${hostPitEdge}`);

    // 確定ボタンを探す
    let btn = await hostPage.$('button:has-text("これでいく")');
    console.log(`ホスト: これでいくボタン存在: ${!!btn}`);
    if (btn) {
      await btn.click();
      console.log('ホスト: 落とし穴確定');
    } else {
      console.log('ホスト: 確定ボタンが見つからない');
    }

    await hostPage.waitForTimeout(500);

    const guestEdges = await guestPage.$$('#map-mine svg .edge-pick');
    console.log(`ゲスト: 選択可能なエッジ数: ${guestEdges.length}`);
    if (guestEdges.length > 0) {
      await guestEdges[0].click({ force: true });
      console.log('ゲスト: 落とし穴の辺を選択');
      await guestPage.waitForTimeout(300);
    }

    // pitEdgeが設定されたか確認
    const guestPitEdge = await guestPage.evaluate(() => window.G?.V?.[window.G?.myPlayerId]?.pitEdge);
    console.log(`ゲスト pitEdge: ${guestPitEdge}`);

    btn = await guestPage.$('button:has-text("これでいく")');
    console.log(`ゲスト: これでいくボタン存在: ${!!btn}`);
    if (btn) {
      await btn.click();
      console.log('ゲスト: 落とし穴確定');
    } else {
      console.log('ゲスト: 確定ボタンが見つからない');
    }

    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    const afterPit = await checkState(hostPage, 'After pit');
    console.log('期待: phase = explorer');

    // ===== 探索者選択フェーズ =====
    console.log('\n===== STEP 4: 探索者選択 =====');
    const hostChips = await hostPage.$$('#panel .chip');
    console.log(`ホスト: 選択可能なチップ数: ${hostChips.length}`);
    if (hostChips.length > 0) {
      await hostChips[0].click();
      console.log('ホスト: 探索者を選択');
    }

    const guestChips = await guestPage.$$('#panel .chip');
    console.log(`ゲスト: 選択可能なチップ数: ${guestChips.length}`);
    if (guestChips.length > 0) {
      await guestChips[0].click();
      console.log('ゲスト: 探索者を選択');
    }

    await hostPage.waitForTimeout(3000);
    await guestPage.waitForTimeout(1000);

    await checkState(hostPage, 'After explorer');

    // スクリーンショット
    await hostPage.screenshot({ path: 'test-pit-host.png', fullPage: true });
    await guestPage.screenshot({ path: 'test-pit-guest.png', fullPage: true });

  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
