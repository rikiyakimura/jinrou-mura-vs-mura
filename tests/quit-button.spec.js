import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5179';

test('やめるボタンが表示される', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('.modebtns', { timeout: 10000 });

  // CPUモードでゲーム開始
  await page.click('button:has-text("対CPU")');
  await page.click('button:has-text("ゲーム開始")');

  // ゲーム画面に入る
  await page.waitForSelector('#map-mine .house', { timeout: 10000 });

  // やめるボタンが存在するか
  const quitBtn = await page.$('button.quit');
  expect(quitBtn).toBeTruthy();
  console.log('やめるボタンが見つかりました');

  // ボタンのテキストを確認
  const btnText = await quitBtn.textContent();
  expect(btnText).toContain('やめる');
  console.log('ボタンテキスト確認OK');
});

test('CPUモードでやめるボタンをクリックするとタイトルに戻る', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('.modebtns', { timeout: 10000 });

  // CPUモードでゲーム開始
  await page.click('button:has-text("対CPU")');
  await page.click('button:has-text("ゲーム開始")');

  // ゲーム画面に入る
  await page.waitForSelector('#map-mine .house', { timeout: 10000 });

  // ダイアログを自動承認
  page.on('dialog', dialog => dialog.accept());

  // やめるボタンをクリック
  const quitBtn = await page.$('button.quit');
  await quitBtn.click();

  // タイトル画面に戻ったか確認
  await page.waitForSelector('.modebtns', { timeout: 5000 });
  console.log('タイトルに戻りました');
});
