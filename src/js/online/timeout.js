/**
 * タイムアウト監視
 * 60秒無操作で自動負け
 */

const TIMEOUT_SEC = 60;
let timeoutId = null;
let remainingTime = TIMEOUT_SEC;
let intervalId = null;
let onTickCallback = null;

/**
 * タイムアウトを開始
 * @param {function} onTimeout - タイムアウト時のコールバック
 * @param {function} onTick - 毎秒のコールバック（残り時間表示用）
 */
export function startTimeout(onTimeout, onTick = null) {
  clearTimeoutTimer();
  remainingTime = TIMEOUT_SEC;
  onTickCallback = onTick;

  // 毎秒カウントダウン
  if (onTick) {
    onTick(remainingTime);
    intervalId = setInterval(() => {
      remainingTime--;
      if (onTick) onTick(remainingTime);
    }, 1000);
  }

  // タイムアウト
  timeoutId = setTimeout(() => {
    clearTimeoutTimer();
    if (onTimeout) onTimeout();
  }, TIMEOUT_SEC * 1000);
}

/**
 * タイムアウトをクリア
 */
export function clearTimeoutTimer() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  remainingTime = TIMEOUT_SEC;
  onTickCallback = null;
}

/**
 * 残り時間を取得
 * @returns {number} 残り秒数
 */
export function getRemainingTime() {
  return remainingTime;
}

/**
 * タイムアウトが動作中か
 * @returns {boolean}
 */
export function isTimeoutActive() {
  return timeoutId !== null;
}
