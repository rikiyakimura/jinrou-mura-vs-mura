/**
 * Supabaseクライアント
 */

import { createClient } from '@supabase/supabase-js';

// 環境変数から取得（Vite用）
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zdrdpiikttpjxztcvgrk.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_H0c1j956NYT2EZ4Bgw1Lxg_5ClkCU2q';

// Supabaseクライアント作成
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// 現在のユーザー情報をキャッシュ
let currentUser = null;

/**
 * 匿名サインイン（初回アクセス時に自動実行）
 * 既にサインイン済みならそのセッションを使用
 */
export async function ensureSignedIn() {
  // 既存セッションを確認
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await ensurePlayerRecord();
    return currentUser;
  }

  // 匿名サインイン
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Anonymous sign-in failed:', error.message, error);
    return null;
  }
  console.log('Anonymous sign-in success:', data.user?.id);
  currentUser = data.user;
  await ensurePlayerRecord();
  return currentUser;
}

/**
 * playersテーブルにレコードがなければ作成
 */
async function ensurePlayerRecord() {
  if (!currentUser) return;

  const { data: existing, error: selectErr } = await supabase
    .from('players')
    .select('id')
    .eq('id', currentUser.id)
    .single();

  if (selectErr && selectErr.code !== 'PGRST116') {
    console.error('Player record check failed:', selectErr);
  }

  if (!existing) {
    const name = getPlayerName() || '名無し';
    const { error: insertErr } = await supabase.from('players').insert({
      id: currentUser.id,
      display_name: name
    });
    if (insertErr) {
      console.error('Player record insert failed:', insertErr);
    } else {
      console.log('Player record created:', currentUser.id);
    }
  }
}

/**
 * 現在のユーザーIDを取得
 */
export function getCurrentUserId() {
  return currentUser?.id || null;
}

/**
 * プレイヤーの戦績を取得
 * @param {string} playerId - プレイヤーID（省略時は自分）
 */
export async function getPlayerStats(playerId = null) {
  const id = playerId || currentUser?.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to get player stats:', error);
    return null;
  }
  return data;
}

/**
 * 戦績を更新
 * @param {'online'|'cpu'} mode - ゲームモード
 * @param {'win'|'loss'|'draw'} result - 結果
 * @param {object} options - 追加オプション
 * @param {'classic'|'large'} options.mapSize - マップサイズ
 * @param {boolean} options.isShutout - 完封勝利か
 * @param {boolean} options.isExpel - 追放勝利か
 * @param {number} options.survivors - 生存者数
 * @param {boolean} options.isDisconnect - 切断勝利か（相手が切断）
 */
export async function updateStats(mode, result, options = {}) {
  if (!currentUser) return;

  const { mapSize = 'classic', isShutout = false, isExpel = false, survivors = 0, isDisconnect = false } = options;

  // 更新するカラムを収集
  const updates = {
    last_played_at: new Date().toISOString()
  };

  // 勝敗カラム
  const resultCol = `${mode}_${result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'}_${mapSize}`;

  // 現在の値を取得
  const columns = [
    resultCol,
    `${mode}_survivors_${mapSize}`,
    `${mode}_max_streak`,
    `${mode}_current_streak`
  ];
  if (isShutout) columns.push(`${mode}_shutout_${mapSize}`);
  if (isExpel) columns.push(`${mode}_expel_${mapSize}`);
  if (mode === 'online' && isDisconnect) columns.push('online_disconnect');

  const { data: current } = await supabase
    .from('players')
    .select(columns.join(','))
    .eq('id', currentUser.id)
    .single();

  if (!current) return;

  // 勝敗をインクリメント
  updates[resultCol] = (current[resultCol] || 0) + 1;

  // 生存者数を加算
  const survivorsCol = `${mode}_survivors_${mapSize}`;
  updates[survivorsCol] = (current[survivorsCol] || 0) + survivors;

  // 連勝記録
  const currentStreakCol = `${mode}_current_streak`;
  const maxStreakCol = `${mode}_max_streak`;
  if (result === 'win') {
    const newStreak = (current[currentStreakCol] || 0) + 1;
    updates[currentStreakCol] = newStreak;
    if (newStreak > (current[maxStreakCol] || 0)) {
      updates[maxStreakCol] = newStreak;
    }
  } else {
    updates[currentStreakCol] = 0;
  }

  // 完封勝利
  if (isShutout && result === 'win') {
    const shutoutCol = `${mode}_shutout_${mapSize}`;
    updates[shutoutCol] = (current[shutoutCol] || 0) + 1;
  }

  // 追放勝利
  if (isExpel && result === 'win') {
    const expelCol = `${mode}_expel_${mapSize}`;
    updates[expelCol] = (current[expelCol] || 0) + 1;
  }

  // 切断（オンラインのみ、相手が切断して自分が勝った場合ではなく、自分が切断した場合）
  // ※ここでは isDisconnect は「切断勝利」として使用しない。切断ペナルティは別処理で。

  await supabase
    .from('players')
    .update(updates)
    .eq('id', currentUser.id);
}

/**
 * 相手の切断回数を記録（Edge Function経由）
 * @param {string} opponentId - 切断した相手のID
 */
export async function recordOpponentDisconnect(opponentId) {
  if (!opponentId) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/record-opponent-disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({ opponent_id: opponentId })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to record opponent disconnect:', error);
    }
  } catch (error) {
    console.error('Error calling Edge Function:', error);
  }
}

/**
 * 表示名を更新
 * @param {string} name - 新しい名前
 */
export async function updateDisplayName(name) {
  if (!currentUser) return;

  await supabase
    .from('players')
    .update({ display_name: name })
    .eq('id', currentUser.id);
}

// プレイヤーID生成（ブラウザごとにユニーク）- 後方互換性のため残す
export function getPlayerId() {
  // 匿名サインイン後はcurrentUser.idを返す
  if (currentUser) return currentUser.id;

  // フォールバック: 旧方式
  let id = localStorage.getItem('jinrou_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('jinrou_player_id', id);
  }
  return id;
}

// プレイヤー名取得・保存
export function getPlayerName() {
  return localStorage.getItem('jinrou_player_name') || '';
}

export function setPlayerName(name) {
  localStorage.setItem('jinrou_player_name', name);
  // DBも更新
  updateDisplayName(name);
}
