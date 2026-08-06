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

// プリロードするマップ背景画像
const MAP_IMAGES = [
  '/map/5_day.webp',
  '/map/5_night.webp',
  '/map/5_loss.webp',
  '/map/9_day.webp',
  '/map/9_night.webp',
  '/map/9_loss.webp'
];

// プリロードするエフェクト画像
const EFFECT_IMAGES = [
  '/finge_transparent.gif'
];

// プリロードした画像の参照を保持（GC回避）
let criticalImages = null;

// 死亡エフェクトGIFのBlob（再利用可能）
let deathGifBlob = null;
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

  // マップ背景画像
  for (const src of MAP_IMAGES) {
    const img = new Image();
    img.src = src;
    criticalImages.push(img);
  }

  // エフェクト画像
  for (const src of EFFECT_IMAGES) {
    const img = new Image();
    img.src = src;
    criticalImages.push(img);
  }

  console.log(`[Preload] ${criticalImages.length} critical images loading (BG + items + maps + effects)`);
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

/**
 * 死亡エフェクトGIFをBlobとしてプリロード
 */
export async function preloadDeathGif() {
  if (deathGifBlob) return;
  try {
    const res = await fetch('/finge_transparent.gif');
    deathGifBlob = await res.blob();
    console.log('[Preload] Death GIF blob loaded');
  } catch (e) {
    console.error('[Preload] Failed to load death GIF:', e);
  }
}

/**
 * 死亡エフェクトGIFの新しいBlob URLを取得（毎回アニメーションが最初から再生される）
 */
export function getDeathGifUrl() {
  if (!deathGifBlob) return '/finge_transparent.gif';
  return URL.createObjectURL(deathGifBlob);
}
