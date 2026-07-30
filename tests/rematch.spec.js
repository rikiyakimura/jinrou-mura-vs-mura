import { test, expect } from '@playwright/test';

const BASE_URL = 'https://jinrou-tau.vercel.app';

test('オフライン: CPU対戦後リマッチ', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('.title');

  // 狂人オプションを有効化
  await page.click('.optchip:has-text("狂人")');
  await page.waitForTimeout(300);

  // CPU対戦を開始
  await page.click('button:has-text("対CPU")');
  await page.waitForSelector('#map-mine .house', { timeout: 5000 });

  // オプションが設定されていることを確認
  const opt1 = await page.evaluate(() => window.G?.opt?.madmanDog);
  console.log('opt.madmanDog (初回):', opt1);
  expect(opt1).toBe(true);

  // ゲームを終了させる（G.doneをtrueにする）
  await page.evaluate(() => {
    window.G.done = true;
    window.G.idx = window.G.sched.length - 1;
    window._render();
  });

  // 終了画面が表示されることを確認
  await page.waitForSelector('.final', { timeout: 5000 });
  console.log('終了画面が表示されました');

  // 「もう一度」ボタンをクリック
  await page.click('button:has-text("もう一度")');
  await page.waitForTimeout(500);

  // ゲームが再開されることを確認（配置フェーズ）
  await page.waitForSelector('#map-mine .house', { timeout: 5000 });

  // 同じオプションが維持されていることを確認
  const opt2 = await page.evaluate(() => window.G?.opt?.madmanDog);
  console.log('opt.madmanDog (リマッチ後):', opt2);
  expect(opt2).toBe(true);

  // モードがcpuのままであることを確認
  const mode = await page.evaluate(() => window.G?.mode);
  console.log('mode:', mode);
  expect(mode).toBe('cpu');

  console.log('リマッチ成功！');
});
