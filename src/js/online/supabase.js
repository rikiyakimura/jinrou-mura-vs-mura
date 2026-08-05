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
    console.error('Anonymous sign-in failed:', error);
    return null;
  }
  currentUser = data.user;
  await ensurePlayerRecord();
  return currentUser;
}

/**
 * playersテーブルにレコードがなければ作成
 */
async function ensurePlayerRecord() {
  if (!currentUser) return;

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('id', currentUser.id)
    .single();

  if (!existing) {
    const name = getPlayerName() || '名無し';
    await supabase.from('players').insert({
      id: currentUser.id,
      display_name: name
    });
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
 */
export async function updateStats(mode, result) {
  if (!currentUser) return;

  const column = `${mode}_${result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'}`;

  // 現在の値を取得してインクリメント
  const { data: current } = await supabase
    .from('players')
    .select(column)
    .eq('id', currentUser.id)
    .single();

  if (current) {
    await supabase
      .from('players')
      .update({
        [column]: (current[column] || 0) + 1,
        last_played_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);
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
