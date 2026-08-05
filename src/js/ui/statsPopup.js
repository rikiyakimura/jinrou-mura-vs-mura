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
    <div class="stats-popup stats-popup-wide">
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
    overlay.querySelector('.stats-popup-title').textContent = `${playerName} の戦績`;
    overlay.querySelector('.stats-popup-body').innerHTML = `
      <div class="stats-no-data">戦績データがありません</div>
    `;
    return;
  }

  // 自分かどうか
  const isMe = playerId === getCurrentUserId();

  // 各種計算
  const calcStats = (prefix) => {
    const wC = stats[`${prefix}_wins_classic`] || 0;
    const lC = stats[`${prefix}_losses_classic`] || 0;
    const dC = stats[`${prefix}_draws_classic`] || 0;
    const wL = stats[`${prefix}_wins_large`] || 0;
    const lL = stats[`${prefix}_losses_large`] || 0;
    const dL = stats[`${prefix}_draws_large`] || 0;
    const totalC = wC + lC + dC;
    const totalL = wL + lL + dL;
    const rateC = totalC > 0 ? Math.round(wC / totalC * 100) : 0;
    const rateL = totalL > 0 ? Math.round(wL / totalL * 100) : 0;
    const shutoutC = stats[`${prefix}_shutout_classic`] || 0;
    const shutoutL = stats[`${prefix}_shutout_large`] || 0;
    const expelC = stats[`${prefix}_expel_classic`] || 0;
    const expelL = stats[`${prefix}_expel_large`] || 0;
    const survC = stats[`${prefix}_survivors_classic`] || 0;
    const survL = stats[`${prefix}_survivors_large`] || 0;
    const avgSurvC = totalC > 0 ? (survC / totalC).toFixed(1) : '-';
    const avgSurvL = totalL > 0 ? (survL / totalL).toFixed(1) : '-';
    const maxStreak = stats[`${prefix}_max_streak`] || 0;
    const disconnect = stats[`${prefix}_disconnect`] || 0;
    return {
      wC, lC, dC, wL, lL, dL,
      totalC, totalL, total: totalC + totalL,
      rateC, rateL,
      shutoutC, shutoutL,
      expelC, expelL,
      avgSurvC, avgSurvL,
      maxStreak, disconnect
    };
  };

  const online = calcStats('online');
  const cpu = calcStats('cpu');

  // セクション生成
  const renderSection = (title, s, showDisconnect = false) => `
    <div class="stats-section">
      <div class="stats-section-header">
        <span class="stats-section-title">${title}</span>
        <span class="stats-section-meta">総対戦: ${s.total}戦 / 連勝記録: ${s.maxStreak}${showDisconnect ? ` / 切断: ${s.disconnect}回` : ''}</span>
      </div>
      <table class="stats-table">
        <thead>
          <tr><th></th><th>5軒</th><th>9軒</th></tr>
        </thead>
        <tbody>
          <tr><td>勝ち</td><td class="win">${s.wC}</td><td class="win">${s.wL}</td></tr>
          <tr><td>負け</td><td class="loss">${s.lC}</td><td class="loss">${s.lL}</td></tr>
          <tr><td>引分</td><td class="draw">${s.dC}</td><td class="draw">${s.dL}</td></tr>
          <tr><td>勝率</td><td>${s.rateC}%</td><td>${s.rateL}%</td></tr>
          <tr><td>完封</td><td class="special">${s.shutoutC}</td><td class="special">${s.shutoutL}</td></tr>
          <tr><td>追放</td><td class="special">${s.expelC}</td><td class="special">${s.expelL}</td></tr>
          <tr><td>平均生存</td><td>${s.avgSurvC}人</td><td>${s.avgSurvL}人</td></tr>
        </tbody>
      </table>
    </div>
  `;

  // ポップアップを更新
  overlay.querySelector('.stats-popup-title').textContent = `${stats.display_name} の戦績`;
  overlay.querySelector('.stats-popup-body').innerHTML = `
    ${isMe ? '<div class="stats-me-badge">あなた</div>' : ''}
    ${renderSection('ネット対戦', online, true)}
    ${renderSection('対CPU', cpu, false)}
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
