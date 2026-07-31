/**
 * リアルタイム同期
 */

import { supabase } from './supabase.js';
import { applyAction } from '../actions.js';
import { setG, getG } from '../state.js';

// 現在のルームID
let currentRoomId = null;
let gameStateChannel = null;
let actionsChannel = null;

// 接続状態コールバック
let _onConnectionChange = null;

/**
 * 接続状態変更時のコールバックを設定
 * @param {function} callback - (status: 'connected' | 'disconnected' | 'error') => void
 */
export function setConnectionCallback(callback) {
  _onConnectionChange = callback;
}

/**
 * ゲーム状態の同期を開始
 * @param {string} roomId - ルームID
 * @param {function} onStateChange - 状態変更時コールバック
 * @param {function} onBothReady - 両者ready時コールバック
 */
export function subscribeToGameState(roomId, onStateChange, onBothReady) {
  currentRoomId = roomId;

  gameStateChannel = supabase
    .channel(`game_state:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_states',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        const newState = payload.new;

        // 両者readyチェック
        if (newState.player1_ready && newState.player2_ready && onBothReady) {
          onBothReady(newState);
        }

        if (onStateChange) {
          onStateChange(newState);
        }
      }
    )
    .subscribe((status) => {
      // 接続状態を通知
      if (_onConnectionChange) {
        if (status === 'SUBSCRIBED') {
          _onConnectionChange('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _onConnectionChange('error');
        } else if (status === 'CLOSED') {
          _onConnectionChange('disconnected');
        }
      }
    });

  return () => {
    if (gameStateChannel) {
      supabase.removeChannel(gameStateChannel);
      gameStateChannel = null;
    }
  };
}

/**
 * アクション履歴を監視
 * @param {string} roomId - ルームID
 * @param {number} myPlayerId - 自分のプレイヤーID（1 or 2）
 * @param {function} onOpponentAction - 相手のアクション受信時コールバック
 */
export function subscribeToActions(roomId, myPlayerId, onOpponentAction) {
  actionsChannel = supabase
    .channel(`actions:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'player_actions',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        const action = payload.new;
        // 相手のアクションのみ処理
        if (action.player_id !== myPlayerId && onOpponentAction) {
          onOpponentAction({
            playerId: action.player_id,
            phase: action.action_type,
            data: action.action_data
          });
        }
      }
    )
    .subscribe();

  return () => {
    if (actionsChannel) {
      supabase.removeChannel(actionsChannel);
      actionsChannel = null;
    }
  };
}

/**
 * アクションをDBに送信
 * @param {string} roomId - ルームID
 * @param {object} action - アクションデータ
 */
export async function sendAction(roomId, action) {
  const { error } = await supabase
    .from('player_actions')
    .insert({
      room_id: roomId,
      player_id: action.playerId,
      action_type: action.phase,
      action_data: action.data
    });

  return { error };
}

/**
 * プレイヤーのready状態を更新
 * @param {string} roomId - ルームID
 * @param {number} playerId - プレイヤーID（1 or 2）
 * @param {boolean} ready - ready状態
 */
export async function setPlayerReady(roomId, playerId, ready = true) {
  const column = playerId === 1 ? 'player1_ready' : 'player2_ready';
  const { error } = await supabase
    .from('game_states')
    .update({ [column]: ready })
    .eq('room_id', roomId);

  return { error };
}

/**
 * 両者のready状態をリセット
 * @param {string} roomId - ルームID
 */
export async function resetBothReady(roomId) {
  const { error } = await supabase
    .from('game_states')
    .update({
      player1_ready: false,
      player2_ready: false
    })
    .eq('room_id', roomId);

  return { error };
}

/**
 * ゲーム状態を更新
 * @param {string} roomId - ルームID
 * @param {object} updates - 更新データ
 */
export async function updateGameState(roomId, updates) {
  const { error } = await supabase
    .from('game_states')
    .update(updates)
    .eq('room_id', roomId);

  return { error };
}

/**
 * ゲーム状態を取得
 * @param {string} roomId - ルームID
 */
export async function fetchGameState(roomId) {
  const { data, error } = await supabase
    .from('game_states')
    .select('*')
    .eq('room_id', roomId)
    .single();

  return { data, error };
}

/**
 * 現在のフェーズのアクションを取得
 * @param {string} roomId - ルームID
 * @param {string} phase - フェーズ名
 */
export async function fetchPhaseActions(roomId, phase) {
  const { data, error } = await supabase
    .from('player_actions')
    .select('*')
    .eq('room_id', roomId)
    .eq('action_type', phase)
    .order('created_at', { ascending: true });

  return { data: data || [], error };
}

/**
 * 全ての同期を解除
 */
export function unsubscribeAll() {
  if (gameStateChannel) {
    supabase.removeChannel(gameStateChannel);
    gameStateChannel = null;
  }
  if (actionsChannel) {
    supabase.removeChannel(actionsChannel);
    actionsChannel = null;
  }
  currentRoomId = null;
}
