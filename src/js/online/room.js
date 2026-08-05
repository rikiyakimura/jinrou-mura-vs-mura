/**
 * ルーム管理
 * - ルーム作成・参加
 * - 自動マッチング
 */

import { supabase, getPlayerId, getPlayerName, getCurrentUserId } from './supabase.js';

// 4桁のルームコード生成
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * ルームをIDで取得
 * @param {string} roomId - ルームID
 * @returns {Promise<{room: object, error: string|null}>}
 */
export async function fetchRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error) {
    return { room: null, error: error.message };
  }
  return { room: data, error: null };
}

/**
 * ルームを作成（ホスト）
 * @param {string} playerName - プレイヤー名
 * @param {object} options - ゲームオプション
 * @param {string} [hostUserId] - ホストのユーザーID（省略時は現在のユーザー）
 * @returns {Promise<{room: object, error: string|null}>}
 */
export async function createRoom(playerName, options = {}, hostUserId = null) {
  const roomCode = generateRoomCode();
  const actualHostUserId = hostUserId || getCurrentUserId();
  console.log('[createRoom] Creating room with host_user_id:', actualHostUserId);

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      room_code: roomCode,
      host_player_name: playerName,
      host_user_id: actualHostUserId,
      game_options: options,
      status: 'waiting'
    })
    .select()
    .single();

  console.log('[createRoom] Room created:', { host_user_id: data?.host_user_id, guest_user_id: data?.guest_user_id });

  if (error) {
    // コード重複の場合はリトライ
    if (error.code === '23505') {
      return createRoom(playerName, options, hostUserId);
    }
    return { room: null, error: error.message };
  }

  return { room: data, error: null };
}

/**
 * ルームに参加（ゲスト）
 * @param {string} roomCode - ルームコード
 * @param {string} playerName - プレイヤー名
 * @returns {Promise<{room: object, error: string|null}>}
 */
export async function joinRoom(roomCode, playerName) {
  // ルームを検索
  const { data: room, error: findError } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  console.log('[joinRoom] Found room:', { host_user_id: room?.host_user_id, guest_user_id: room?.guest_user_id });

  if (findError || !room) {
    return { room: null, error: 'ルームが見つかりません' };
  }

  if (room.status !== 'waiting') {
    return { room: null, error: 'このルームはすでに開始済みです' };
  }

  if (room.guest_player_name) {
    return { room: null, error: 'このルームは満員です' };
  }

  const myUserId = getCurrentUserId();
  console.log('[joinRoom] My user ID:', myUserId);

  // ゲストとして参加
  const { data, error } = await supabase
    .from('rooms')
    .update({
      guest_player_name: playerName,
      guest_user_id: myUserId,
      status: 'playing'
    })
    .eq('id', room.id)
    .eq('status', 'waiting') // 競合防止
    .select()
    .single();

  console.log('[joinRoom] After update:', { host_user_id: data?.host_user_id, guest_user_id: data?.guest_user_id });

  if (error || !data) {
    return { room: null, error: '参加に失敗しました。もう一度お試しください' };
  }

  return { room: data, error: null };
}

/**
 * ルームの変更を監視
 * @param {string} roomId - ルームID
 * @param {function} callback - 変更時コールバック
 * @returns {function} unsubscribe関数
 */
export function subscribeToRoom(roomId, callback) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * 自動マッチング - キューに登録
 * @param {string} playerName - プレイヤー名
 * @param {object} options - ゲームオプション
 * @returns {Promise<{queueId: string, error: string|null}>}
 */
export async function joinMatchmakingQueue(playerName, options = {}) {
  const playerId = getPlayerId();
  const userId = getCurrentUserId();

  // まず既存のwaitingエントリを削除
  await supabase
    .from('matchmaking_queue')
    .delete()
    .eq('player_id', playerId);

  // 同じオプションで待機中の相手を探す
  const { data: waiting } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('status', 'waiting')
    .eq('game_options', JSON.stringify(options))
    .neq('player_id', playerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (waiting) {
    // 相手が見つかった → ルーム作成（待機側のuser_idをホストとして使用）
    const { room, error } = await createRoom(waiting.player_name, options, waiting.user_id);
    if (error) {
      return { queueId: null, room: null, matched: false, error };
    }

    // 相手をマッチ済みにしてルームに紐付け
    await supabase
      .from('matchmaking_queue')
      .update({ status: 'matched', room_id: room.id })
      .eq('id', waiting.id);

    // 自分がゲストとして参加
    const { room: joinedRoom, error: joinError } = await joinRoom(room.room_code, playerName);
    if (joinError) {
      return { queueId: null, room: null, matched: false, error: joinError };
    }

    return { queueId: null, room: joinedRoom, matched: true, error: null, isHost: false };
  }

  // 相手がいない → キューに登録して待機
  const { data, error } = await supabase
    .from('matchmaking_queue')
    .insert({
      player_id: playerId,
      player_name: playerName,
      user_id: userId,
      game_options: options,
      status: 'waiting'
    })
    .select()
    .single();

  if (error) {
    return { queueId: null, room: null, matched: false, error: error.message };
  }

  return { queueId: data.id, room: null, matched: false, error: null };
}

/**
 * マッチングキューを監視
 * @param {string} queueId - キューID
 * @param {function} onMatched - マッチ時コールバック
 * @returns {function} unsubscribe関数
 */
export function subscribeToMatchmaking(queueId, onMatched) {
  const channel = supabase
    .channel(`matchmaking:${queueId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matchmaking_queue',
        filter: `id=eq.${queueId}`
      },
      async (payload) => {
        if (payload.new.status === 'matched' && payload.new.room_id) {
          // ルーム情報を取得
          const { data: room } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', payload.new.room_id)
            .single();

          if (room) {
            onMatched(room);
          }
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * マッチングキューをキャンセル
 * @param {string} queueId - キューID
 */
export async function cancelMatchmaking(queueId) {
  await supabase
    .from('matchmaking_queue')
    .delete()
    .eq('id', queueId);
}

/**
 * ルームのゲーム状態を初期化
 * @param {string} roomId - ルームID
 * @param {object} gameData - 初期ゲームデータ
 */
export async function initGameState(roomId, gameData) {
  const { error } = await supabase
    .from('game_states')
    .insert({
      room_id: roomId,
      game_data: gameData,
      current_player: 1,
      current_phase: 'place',
      current_day: 1,
      simultaneous_mode: false,
      player1_ready: false,
      player2_ready: false
    });

  return { error };
}
