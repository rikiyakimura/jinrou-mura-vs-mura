import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('マネタイズ機能', () => {
  test('タイトル画面に支援ボタンが表示される', async ({ page }) => {
    await page.goto(BASE_URL);

    // タイトル画面を待つ
    await page.waitForSelector('.modebtns', { timeout: 10000 });

    // 支援するボタンが存在することを確認
    const supportBtn = page.locator('button:has-text("支援する")');
    await expect(supportBtn).toBeVisible();

    console.log('タイトル画面に支援ボタンあり');
  });

  test('支援画面が正しく表示される', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('.modebtns', { timeout: 10000 });

    // 支援ボタンをクリック
    await page.click('button:has-text("支援する")');

    // 支援画面が表示されることを確認
    await page.waitForSelector('.support-screen', { timeout: 5000 });

    // 各要素を確認
    await expect(page.locator('.support-screen .title-sm')).toContainText('人狼村vs村を支援する');
    await expect(page.locator('#support-amount')).toBeVisible();
    await expect(page.locator('#support-agree')).toBeVisible();
    await expect(page.locator('#support-btn')).toBeDisabled(); // 同意前は無効

    console.log('支援画面が正しく表示された');

    // 同意にチェック
    await page.click('#support-agree');

    // ボタンが有効になる
    await expect(page.locator('#support-btn')).toBeEnabled();

    console.log('同意チェック後、支援ボタンが有効になった');

    // 戻るボタンで戻れる
    await page.click('button:has-text("戻る")');
    await page.waitForSelector('.modebtns', { timeout: 5000 });

    console.log('タイトル画面に戻れた');
  });

  test('オンラインメニューで状態が表示される', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('.modebtns', { timeout: 10000 });

    // オンライン対戦をクリック
    await page.click('button:has-text("オンライン対戦")');

    // オンラインメニューが表示される（状態チェック中のローディングを待つ）
    await page.waitForSelector('.online-menu', { timeout: 15000 });

    // 状態表示が存在する（trial, free, or premium のいずれか）
    const statusEl = page.locator('.online-status');
    const statusExists = await statusEl.count() > 0;

    if (statusExists) {
      const statusClass = await statusEl.getAttribute('class');
      console.log('オンライン状態表示:', statusClass);

      // trial, free, premium のいずれか
      const hasValidStatus = statusClass.includes('trial') ||
                            statusClass.includes('free') ||
                            statusClass.includes('premium');
      expect(hasValidStatus).toBe(true);
    } else {
      // 制限到達の場合は limit-reached 画面
      const limitReached = await page.locator('.limit-reached').count() > 0;
      if (limitReached) {
        console.log('制限到達画面が表示された');
        await expect(page.locator('.limit-reached')).toBeVisible();
      }
    }

    console.log('オンラインメニューの状態表示を確認');
  });
});
