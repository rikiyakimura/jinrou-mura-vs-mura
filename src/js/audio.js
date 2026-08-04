/**
 * BGM管理モジュール
 */

const tracks = {
  title: new Audio('/music/TITLE.mp3'),
  day: new Audio('/music/DAY.mp3'),
  night: new Audio('/music/NIGHT.mp3')
};

// 全トラックをループ設定
Object.values(tracks).forEach(t => {
  t.loop = true;
});

let current = null;
let unlocked = false;
let muted = localStorage.getItem('audioMuted') === 'true';

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

  if (tracks[name] && !muted) {
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
const seWin = new Audio('/SE/win.mp3');
const seLoss = new Audio('/SE/loss.mp3');
const seItem = new Audio('/SE/item.mp3');
const seHole = new Audio('/SE/hole.mp3');
const seWolfHowl = new Audio('/SE/wolf_howl.mp3');
let lastSharpeningDay = null;
let lastSharpenResultDay = null;
let lastResultPlayed = null;
let lastItemDay = null;

/**
 * SEを再生
 */
export function playSE(name, day) {
  if (muted) return;
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
  } else if (name === 'win') {
    if (lastResultPlayed !== null) return;
    lastResultPlayed = 'win';
    seWin.currentTime = 0;
    seWin.play().catch(() => {});
  } else if (name === 'loss') {
    if (lastResultPlayed !== null) return;
    lastResultPlayed = 'loss';
    seLoss.currentTime = 0;
    seLoss.play().catch(() => {});
  } else if (name === 'item') {
    if (day !== undefined && day === lastItemDay) return;
    lastItemDay = day;
    seItem.currentTime = 0;
    seItem.play().catch(() => {});
  } else if (name === 'hole') {
    seHole.currentTime = 0;
    seHole.play().catch(() => {});
  } else if (name === 'wolf_howl') {
    seWolfHowl.currentTime = 0;
    seWolfHowl.play().catch(() => {});
  }
}

/**
 * 結果SEのフラグをリセット（ゲーム開始時に呼ぶ）
 */
export function resetResultSE() {
  lastResultPlayed = null;
  lastItemDay = null;
}

/**
 * ミュート切り替え
 */
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('audioMuted', muted);
  if (muted) {
    Object.values(tracks).forEach(t => t.pause());
  } else {
    if (current && tracks[current]) tracks[current].play().catch(() => {});
  }
  return muted;
}

/**
 * ミュート状態を取得
 */
export function isMuted() {
  return muted;
}
