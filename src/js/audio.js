/**
 * BGM管理モジュール
 */

const tracks = {
  title: new Audio('/music/TITLE.mp3'),
  day: new Audio('/music/DAY.mp3'),
  night: new Audio('/music/NIGHT.mp3')
};

// 全トラックをループ設定 + 音量0.5
Object.values(tracks).forEach(t => {
  t.loop = true;
  t.volume = 0.5;
});

let current = null;
let unlocked = false;

/**
 * ユーザー操作後に呼ぶ（autoplay制限回避）
 */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
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

  if (tracks[name]) {
    // 常に再生を試みる（ブラウザがブロックしたらcatchで無視）
    tracks[name].play().then(() => {
      unlocked = true;
    }).catch(() => {});
  }
}

/**
 * フェーズから曲名を決定
 */
export function getTrackForPhase(ph, isDone) {
  if (isDone) return 'title';
  if (ph === 'end' || ph === 'unknown') return 'title';
  if (ph === 'night' || ph === 'morning') return 'night';
  return 'day'; // place, pit, explorer, route, ticks
}

// SE
const seSharpening = new Audio('/SE/sharpening.mp3');
const seCasual = new Audio('/SE/casual.mp3');
const seConfirm = new Audio('/SE/confirm button.mp3');
const seSharpenStart = new Audio('/SE/sharpen_start.mp3');
const seSharpenSuccess = new Audio('/SE/sharpen_success.mp3');
const seSharpenMiss = new Audio('/SE/sharpen_miss.mp3');
let lastSharpeningDay = null;
let lastSharpenResultDay = null;

/**
 * SEを再生
 */
export function playSE(name, day) {
  if (name === 'sharpening') {
    if (day !== undefined && day === lastSharpeningDay) return;
    lastSharpeningDay = day;
    seSharpening.currentTime = 0;
    seSharpening.play().catch(() => {});
  } else if (name === 'casual') {
    seCasual.currentTime = 0;
    seCasual.play().catch(() => {});
  } else if (name === 'confirm') {
    seConfirm.currentTime = 0;
    seConfirm.play().catch(() => {});
  } else if (name === 'sharpen_start') {
    seSharpenStart.currentTime = 0;
    seSharpenStart.play().catch(() => {});
  } else if (name === 'sharpen_success') {
    if (day !== undefined && day === lastSharpenResultDay) return;
    lastSharpenResultDay = day;
    seSharpenSuccess.currentTime = 0;
    seSharpenSuccess.play().catch(() => {});
  } else if (name === 'sharpen_miss') {
    if (day !== undefined && day === lastSharpenResultDay) return;
    lastSharpenResultDay = day;
    seSharpenMiss.currentTime = 0;
    seSharpenMiss.play().catch(() => {});
  }
}
