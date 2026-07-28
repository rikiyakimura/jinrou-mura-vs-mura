// Supabase クライアントの初期化

import { createClient } from '@supabase/supabase-js';

// Supabase設定
// 本番環境では環境変数から取得すべきだが、開発中は直接記載
const SUPABASE_URL = 'https://zdrdpiikttpjxztcvgrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkcmRwaWlrdHRwanh6dGN2Z3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxNTE4NTksImV4cCI6MjA1MzcyNzg1OX0.7KvVv7iJoEQfPXnGqk3_mf0oyY8NzNxVWqS0q0s4H5I';

// Supabaseクライアントを作成
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// ルーム関連の関数

/**
 * ランダムな4桁のルームコードを生成
 */
export function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 新しいルームを作成
 * @param {string} hostPlayerName - ホストのプレイヤー名
 * @param {object} gameOptions - ゲームオプション {madmanDog, medium, pit}
 * @returns {Promise<{room_id, room_code}>}
 */
export async function createRoom(hostPlayerName, gameOptions) {
  const roomCode = generateRoomCode();

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      room_code: roomCode,
      host_player_name: hostPlayerName,
      status: 'waiting',
      game_options: gameOptions
    })
    .select()
    .single();

  if (error) {
    console.error('ルーム作成エラー:', error);
    throw error;
  }

  return {
    room_id: data.id,
    room_code: data.room_code
  };
}

/**
 * ルームコードでルームを検索
 * @param {string} roomCode - 4桁のルームコード
 * @returns {Promise<object|null>}
 */
export async function findRoomByCode(roomCode) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'waiting')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // データが見つからない
      return null;
    }
    console.error('ルーム検索エラー:', error);
    throw error;
  }

  return data;
}

/**
 * ルームに参加（ゲストとして）
 * @param {string} roomId - ルームID
 * @param {string} guestPlayerName - ゲストのプレイヤー名
 * @returns {Promise<object>}
 */
export async function joinRoom(roomId, guestPlayerName) {
  const { data, error } = await supabase
    .from('rooms')
    .update({
      guest_player_name: guestPlayerName,
      status: 'playing'
    })
    .eq('id', roomId)
    .select()
    .single();

  if (error) {
    console.error('ルーム参加エラー:', error);
    throw error;
  }

  return data;
}

/**
 * ゲーム状態を作成
 * @param {string} roomId - ルームID
 * @param {object} gameData - ゲームデータ（Gオブジェクト）
 * @param {number} currentPlayer - 現在のプレイヤー（1 or 2）
 * @param {string} currentPhase - 現在のフェーズ
 * @returns {Promise<object>}
 */
export async function createGameState(roomId, gameData, currentPlayer, currentPhase) {
  const { data, error } = await supabase
    .from('game_states')
    .insert({
      room_id: roomId,
      game_data: gameData,
      current_player: currentPlayer,
      current_phase: currentPhase,
      waiting_for_player: currentPlayer
    })
    .select()
    .single();

  if (error) {
    console.error('ゲーム状態作成エラー:', error);
    throw error;
  }

  return data;
}

/**
 * ゲーム状態を更新
 * @param {string} roomId - ルームID
 * @param {object} updates - 更新データ
 * @returns {Promise<object>}
 */
export async function updateGameState(roomId, updates) {
  const { data, error } = await supabase
    .from('game_states')
    .update(updates)
    .eq('room_id', roomId)
    .select()
    .single();

  if (error) {
    console.error('ゲーム状態更新エラー:', error);
    throw error;
  }

  return data;
}

/**
 * ゲーム状態を取得
 * @param {string} roomId - ルームID
 * @returns {Promise<object|null>}
 */
export async function getGameState(roomId) {
  const { data, error } = await supabase
    .from('game_states')
    .select('*')
    .eq('room_id', roomId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('ゲーム状態取得エラー:', error);
    throw error;
  }

  return data;
}

/**
 * ゲーム状態の変更をリアルタイムで監視
 * @param {string} roomId - ルームID
 * @param {function} callback - 変更時に呼ばれるコールバック
 * @returns {object} - サブスクリプションオブジェクト（unsubscribe用）
 */
export function subscribeToGameState(roomId, callback) {
  const subscription = supabase
    .channel(`game_state_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_states',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        console.log('ゲーム状態変更:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * ルームの変更をリアルタイムで監視
 * @param {string} roomId - ルームID
 * @param {function} callback - 変更時に呼ばれるコールバック
 * @returns {object} - サブスクリプションオブジェクト
 */
export function subscribeToRoom(roomId, callback) {
  const subscription = supabase
    .channel(`room_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        console.log('ルーム変更:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * プレイヤーアクションを記録
 * @param {string} roomId - ルームID
 * @param {number} playerId - プレイヤーID（1 or 2）
 * @param {string} actionType - アクションタイプ
 * @param {object} actionData - アクションデータ
 */
export async function logPlayerAction(roomId, playerId, actionType, actionData) {
  const { error } = await supabase
    .from('player_actions')
    .insert({
      room_id: roomId,
      player_id: playerId,
      action_type: actionType,
      action_data: actionData
    });

  if (error) {
    console.error('アクション記録エラー:', error);
    // エラーでも処理を続行（ログは重要ではない）
  }
}
