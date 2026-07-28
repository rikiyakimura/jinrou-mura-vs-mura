// Playwright でオンライン対戦UIテスト
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

  console.log('オンライン対戦ボタンを探します...');
  const onlineButton = await page.locator('button:has-text("オンライン対戦")');
  console.log('オンライン対戦ボタン:', await onlineButton.count() > 0 ? '見つかりました' : '見つかりません');

  if (await onlineButton.count() > 0) {
    console.log('オンライン対戦ボタンをクリック...');
    await onlineButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'screenshot-online-menu.png' });
    console.log('スクリーンショット保存: screenshot-online-menu.png');

    // ルーム作成ボタンを確認
    const createButton = await page.locator('button:has-text("ルームを作成")');
    console.log('ルーム作成ボタン:', await createButton.count() > 0 ? '見つかりました' : '見つかりません');
  }

  console.log('\n10秒後にブラウザを閉じます...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('テスト完了');
})();
