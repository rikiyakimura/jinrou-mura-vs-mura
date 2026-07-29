// Playwright でルーム作成をテスト
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('ブラウザを起動しました');
  await page.goto('http://localhost:5174/');

  // コンソールログとエラーを全てキャプチャ
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[${type}] ${text}`);
  });

  page.on('pageerror', error => {
    console.error('ページエラー:', error.message);
    console.error('スタックトレース:', error.stack);
  });

  console.log('\nオンライン対戦ボタンをクリック...');
  await page.click('button:has-text("オンライン対戦")');
  await page.waitForTimeout(1000);

  console.log('\nルームを作成ボタンをクリック...');
  await page.click('button:has-text("ルームを作成")');
  await page.waitForTimeout(1000);

  console.log('\nプレイヤー名を入力...');
  await page.fill('#host-name-input', 'テストプレイヤー');
  await page.waitForTimeout(500);

  console.log('\nルーム作成ボタンをクリック...');
  await page.click('button:has-text("ルーム作成")');

  // エラーやアラートが出るまで待機
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'screenshot-room-create-error.png' });
  console.log('\nスクリーンショット保存: screenshot-room-create-error.png');

  console.log('\n10秒後にブラウザを閉じます...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('テスト完了');
})();
