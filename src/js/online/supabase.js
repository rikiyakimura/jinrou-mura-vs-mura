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

// プレイヤーID生成（ブラウザごとにユニーク）
export function getPlayerId() {
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
}
