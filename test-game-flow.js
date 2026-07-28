// Playwright で夜フェーズまで進めるテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('ブラウザを起動しました');
  await page.goto('http://localhost:5174/');

  // コンソールエラーを監視
  page.on('pageerror', error => {
    console.error('ページエラー:', error.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('コンソールエラー:', msg.text());
    }
  });

  console.log('対CPUボタンをクリック...');
  await page.click('button:has-text("対CPU")');
  await page.waitForTimeout(1000);

  // 配置フェーズをスキップ（自動配置される）
  console.log('配置完了を待機...');
  await page.waitForTimeout(2000);

  // 探索者を選択
  console.log('探索者を選択...');
  const explorerChips = await page.locator('.chip').all();
  if (explorerChips.length > 0) {
    await explorerChips[0].click();
    await page.waitForTimeout(1000);
  }

  // ルート選択
  console.log('ルート選択...');
  for (let i = 0; i < 5; i++) {
    const houses = await page.locator('.house.pick').all();
    if (houses.length > 0) {
      await houses[0].click();
      await page.waitForTimeout(500);
    }
  }

  // 「昼を終える」ボタンをクリック
  const finishButton = await page.locator('button:has-text("昼を終える")');
  if (await finishButton.count() > 0) {
    console.log('昼を終えるボタンをクリック...');
    await finishButton.click();
    await page.waitForTimeout(1000);
  }

  // スクリーンショット
  await page.screenshot({ path: 'screenshot-night-phase.png' });
  console.log('夜フェーズのスクリーンショットを保存');

  // 襲撃対象の選択ボタンを確認
  const attackChips = await page.locator('.chip').all();
  console.log('襲撃対象の選択肢:', attackChips.length);

  if (attackChips.length > 0) {
    console.log('襲撃対象を選択...');
    await attackChips[0].click();
    await page.waitForTimeout(1000);

    // スクリーンショット
    await page.screenshot({ path: 'screenshot-after-attack-select.png' });
    console.log('襲撃対象選択後のスクリーンショットを保存');
  }

  console.log('\n10秒後にブラウザを閉じます...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('テスト完了');
})();
