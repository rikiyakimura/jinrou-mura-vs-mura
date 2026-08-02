/**
 * 画像プリロード
 */

import { NAMES, NAME_TO_KEY } from './constants.js';

const ROLES = ['wolf', 'guard', 'villager', 'madman', 'medium', 'dog'];

// プリロードした画像の参照を保持（GC回避）
let preloadedImages = null;

/**
 * 全ポートレート画像をバックグラウンドでプリロード
 */
export function preloadPortraits() {
  if (preloadedImages) return; // 既にプリロード済み

  preloadedImages = [];

  for (const name of NAMES) {
    const key = NAME_TO_KEY[name];
    if (!key) continue;

    for (const role of ROLES) {
      const img = new Image();
      img.src = `/portraits/${key}_${role}.webp`;
      preloadedImages.push(img);
    }
  }

  console.log(`[Preload] ${preloadedImages.length} portrait images queued`);
}
