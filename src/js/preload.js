/**
 * 画像プリロード
 */

import { NAMES, NAME_TO_KEY } from './constants.js';

const ROLES = ['wolf', 'guard', 'villager', 'madman', 'medium', 'dog'];

// プリロードする背景画像（topBG.webpは即座に表示されるので不要）
const BG_IMAGES = [
  '/assets/BG/nontitleBG.webp',
  '/assets/resultBG/win.webp',
  '/assets/resultBG/loss.webp',
  '/assets/resultBG/draw.webp'
];

// プリロードするアイテム画像
const ITEM_IMAGES = [
  '/item/goeitodoke.webp',
  '/item/kyoujinnotume.webp',
  '/item/reibainohuda.webp'
];

// プリロードした画像の参照を保持（GC回避）
let criticalImages = null;
let portraitImages = null;

/**
 * 重要な画像を即座にプリロード（背景・アイテム）
 */
export function preloadCritical() {
  if (criticalImages) return;

  criticalImages = [];

  // 背景画像
  for (const src of BG_IMAGES) {
    const img = new Image();
    img.src = src;
    criticalImages.push(img);
  }

  // アイテム画像
  for (const src of ITEM_IMAGES) {
    const img = new Image();
    img.src = src;
    criticalImages.push(img);
  }

  console.log(`[Preload] ${criticalImages.length} critical images loading (BG + items)`);
}

/**
 * ポートレート画像をバックグラウンドでプリロード
 */
export function preloadPortraits() {
  if (portraitImages) return;

  portraitImages = [];

  for (const name of NAMES) {
    const key = NAME_TO_KEY[name];
    if (!key) continue;

    for (const role of ROLES) {
      const img = new Image();
      img.src = `/portraits/${key}_${role}.webp`;
      portraitImages.push(img);
    }
  }

  console.log(`[Preload] ${portraitImages.length} portrait images queued`);
}
