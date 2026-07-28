// Playwright でブラウザテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('ブラウザを起動しました');
  console.log('http://localhost:5174/ にアクセスします...');

  await page.goto('http://localhost:5174/');

  // ページタイトルを確認
  const title = await page.title();
  console.log('ページタイトル:', title);

  // 5秒待ってページが完全にロードされるのを待つ
  await page.waitForTimeout(3000);

  // コンソールエラーを取得
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    console.error('ページエラー:', error.message);
  });

  // ボタンが存在するか確認
  const cpuButton = await page.locator('button:has-text("対CPU")');
  const pvpButton = await page.locator('button:has-text("2人で対戦")');

  console.log('対CPUボタン:', await cpuButton.count() > 0 ? '見つかりました' : '見つかりません');
  console.log('2人で対戦ボタン:', await pvpButton.count() > 0 ? '見つかりました' : '見つかりません');

  // 対CPUボタンが有効か確認
  if (await cpuButton.count() > 0) {
    const isDisabled = await cpuButton.isDisabled();
    console.log('対CPUボタンの状態:', isDisabled ? '無効' : '有効');

    // スクリーンショットを撮る
    await page.screenshot({ path: 'screenshot-title.png' });
    console.log('スクリーンショットを保存: screenshot-title.png');

    // ボタンをクリックしてみる
    console.log('\n対CPUボタンをクリックします...');
    await cpuButton.click();

    // 3秒待つ
    await page.waitForTimeout(3000);

    // スクリーンショットを撮る
    await page.screenshot({ path: 'screenshot-after-click.png' });
    console.log('スクリーンショットを保存: screenshot-after-click.png');

    // ページの状態を確認
    const veilDisplay = await page.evaluate(() => {
      const veil = document.getElementById('veil');
      return veil ? window.getComputedStyle(veil).display : 'none';
    });
    console.log('veil要素のdisplay:', veilDisplay);
  }

  // コンソールエラーがあれば表示
  if (errors.length > 0) {
    console.log('\nコンソールエラー:');
    errors.forEach(err => console.log('  -', err));
  }

  console.log('\n10秒後にブラウザを閉じます...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('テスト完了');
})();
