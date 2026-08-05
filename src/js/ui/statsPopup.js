/**
 * 戦績ポップアップ
 */

import { getPlayerStats, getCurrentUserId } from '../online/supabase.js';

/**
 * 戦績ポップアップを表示
 * @param {string} playerId - プレイヤーID
 * @param {string} playerName - 表示名（フォールバック用）
 */
export async function showStatsPopup(playerId, playerName = '不明') {
  // 既存のポップアップを削除
  hideStatsPopup();

  // ローディング表示
  const overlay = document.createElement('div');
  overlay.id = 'stats-popup-overlay';
  overlay.className = 'stats-popup-overlay';
  overlay.innerHTML = `
    <div class="stats-popup">
      <div class="stats-popup-header">
        <span class="stats-popup-title">読み込み中...</span>
        <button class="stats-popup-close" onclick="window._hideStatsPopup()">×</button>
      </div>
      <div class="stats-popup-body">
        <div class="stats-loading">読み込み中...</div>
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideStatsPopup();
  });
  document.body.appendChild(overlay);

  // 戦績を取得
  const stats = await getPlayerStats(playerId);

  if (!stats) {
    // 戦績がない場合（未登録ユーザー）
    overlay.querySelector('.stats-popup-title').textContent = `${playerName} の戦績`;
    overlay.querySelector('.stats-popup-body').innerHTML = `
      <div class="stats-no-data">戦績データがありません</div>
    `;
    return;
  }

  // 勝率計算
  const onlineTotal = stats.online_wins + stats.online_losses + stats.online_draws;
  const onlineWinRate = onlineTotal > 0 ? Math.round(stats.online_wins / onlineTotal * 100) : 0;
  const cpuTotal = stats.cpu_wins + stats.cpu_losses + stats.cpu_draws;
  const cpuWinRate = cpuTotal > 0 ? Math.round(stats.cpu_wins / cpuTotal * 100) : 0;

  // 自分かどうか
  const isMe = playerId === getCurrentUserId();

  // ポップアップを更新
  overlay.querySelector('.stats-popup-title').textContent = `${stats.display_name} の戦績`;
  overlay.querySelector('.stats-popup-body').innerHTML = `
    ${isMe ? '<div class="stats-me-badge">あなた</div>' : ''}
    <div class="stats-section">
      <div class="stats-section-title">ネット対戦</div>
      <div class="stats-row">
        <span class="stats-label">勝ち</span>
        <span class="stats-value win">${stats.online_wins}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">負け</span>
        <span class="stats-value loss">${stats.online_losses}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">引分</span>
        <span class="stats-value draw">${stats.online_draws}</span>
      </div>
      <div class="stats-row total">
        <span class="stats-label">勝率</span>
        <span class="stats-value">${onlineWinRate}%</span>
      </div>
    </div>
    <div class="stats-section">
      <div class="stats-section-title">対CPU</div>
      <div class="stats-row">
        <span class="stats-label">勝ち</span>
        <span class="stats-value win">${stats.cpu_wins}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">負け</span>
        <span class="stats-value loss">${stats.cpu_losses}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">引分</span>
        <span class="stats-value draw">${stats.cpu_draws}</span>
      </div>
      <div class="stats-row total">
        <span class="stats-label">勝率</span>
        <span class="stats-value">${cpuWinRate}%</span>
      </div>
    </div>
  `;
}

/**
 * 戦績ポップアップを非表示
 */
export function hideStatsPopup() {
  const existing = document.getElementById('stats-popup-overlay');
  if (existing) existing.remove();
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window._hideStatsPopup = hideStatsPopup;
}
