import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('ホストの名前が正しく保存されるか確認', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      consoleLogs.push(msg.text());
      console.log(msg.text());
    }
  });

  await page.goto(BASE_URL);
  await page.waitForSelector('.modebtns', { timeout: 10000 });

  // オンラインモードへ
  await page.click('button.online');
  await page.waitForSelector('#player-name', { timeout: 5000 });

  // 名前を入力
  const testName = 'TestHost';
  await page.fill('#player-name', testName);
  console.log(`入力した名前: ${testName}`);

  // 少し待つ（oninputが発火するのを待つ）
  await page.waitForTimeout(500);

  // 入力値を確認
  const inputValue = await page.$eval('#player-name', el => el.value);
  console.log(`input要素の値: ${inputValue}`);

  // localStorageを確認
  const storedBefore = await page.evaluate(() => localStorage.getItem('jinrou_player_name'));
  console.log(`localStorage（ボタンクリック前）: ${storedBefore}`);

  // ルームを作るボタンをクリック
  await page.click('button:has-text("ルームを作る")');
  await page.waitForTimeout(500);

  // localStorageを再確認
  const storedAfterOptions = await page.evaluate(() => localStorage.getItem('jinrou_player_name'));
  console.log(`localStorage（オプション画面後）: ${storedAfterOptions}`);

  // 開始ボタンをクリック
  await page.click('button:has-text("開始")');
  await page.waitForTimeout(1000);

  // localStorageを再確認
  const storedAfterCreate = await page.evaluate(() => localStorage.getItem('jinrou_player_name'));
  console.log(`localStorage（ルーム作成後）: ${storedAfterCreate}`);

  // ルームコードが表示されるまで待つ
  await page.waitForSelector('.room-code', { timeout: 10000 });

  // G.myPlayerNameを確認
  const myPlayerName = await page.evaluate(() => window.G?.myPlayerName);
  console.log(`G.myPlayerName: ${myPlayerName}`);

  // コンソールログを出力
  console.log('\n=== DEBUG LOGS ===');
  consoleLogs.forEach(log => console.log(log));

  // 検証
  expect(storedAfterCreate).toBe(testName);
  expect(myPlayerName).toBe(testName);
});
