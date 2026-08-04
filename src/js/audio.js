/**
 * BGM管理モジュール
 */

const tracks = {
  title: new Audio('/music/TITLE.mp3'),
  day: new Audio('/music/DAY.mp3'),
  night: new Audio('/music/NIGHT.mp3')
};

// 全トラックをループ設定
Object.values(tracks).forEach(t => t.loop = true);

let current = null;
let userInteracted = false;

/**
 * ユーザー操作後に呼ぶ（autoplay制限回避）
 */
export function unlockAudio() {
  if (userInteracted) return;
  userInteracted = true;
  // 現在のトラックがあれば再生開始
  if (current && tracks[current]) {
    tracks[current].play().catch(() => {});
  }
}

/**
 * 曲を切り替え
 */
export function playTrack(name) {
  if (current === name) return; // 同じ曲なら何もしない

  // 現在の曲を停止
  Object.values(tracks).forEach(t => {
    t.pause();
    t.currentTime = 0;
  });

  current = name;

  // ユーザー操作済みなら再生
  if (userInteracted && tracks[name]) {
    tracks[name].play().catch(() => {});
  }
}

/**
 * フェーズから曲名を決定
 */
export function getTrackForPhase(ph, isTitle) {
  if (isTitle) return 'title';
  if (ph === 'end') return 'title';
  if (ph === 'night' || ph === 'morning') return 'night';
  return 'day'; // place, pit, explorer, route, ticks
}
