/**
 * オンライン用ゲーム進行制御
 */

import { G, setG, getG, cur, who } from '../state.js';
import { applyAction } from '../actions.js';
import { NAMES, setPreset, getConfig } from '../constants.js';
import { shuf } from '../utils.js';
import { mkVillage } from '../game/village.js';
import { buildSchedule, countHandoffs } from '../game/schedule.js';
import { resolveDay, resolveNight, finish } from '../game/resolve.js';
import {
  subscribeToGameState,
  subscribeToActions,
  subscribeToEmotes,
  subscribeToPresence,
  sendAction,
  sendEmote as sendEmoteToDb,
  canSendEmote,
  setPlayerReady,
  resetBothReady,
  updateGameState,
  fetchGameState,
  fetchPhaseActions,
  fetchSetupActions,
  syncIdxFromDB,
  unsubscribeAll,
  setConnectionCallback
} from './sync.js';
import { initGameState } from './room.js';
import { startTimeout, clearTimeoutTimer } from './timeout.js';
import { getPlayerName } from './supabase.js';

// 待ち合わせが必要なフェーズ（explorer以降）
const WAIT_PHASES = ['explorer', 'route', 'ticks', 'night'];

// place/pitは待ち合わせなしで各自進行
const LOCAL_PHASES = ['place', 'pit'];

// オンライン状態
let onlineState = {
  roomId: null,
  myPlayerId: null,   // 1 or 2
  myPlayerName: null,
  opponentName: null,
  myUserId: null,     // Supabase user ID
  opponentUserId: null,
  isHost: false,
  pendingAction: null,
  waitingForOpponent: false,
  waitingForRestart: false,
  presenceInitialized: false,  // プレゼンス初期化完了フラグ
  processingAction: false  // 非同期処理中フラグ（連打防止）
};

/**
 * 処理中かどうかを返す（UI側でボタンdisabled制御に使用）
 */
export function isProcessing() {
  return onlineState.processingAction || onlineState.waitingForOpponent;
}

/**
 * 処理開始を即座にマーク（ボタンクリック時に最初に呼ぶ）
 * @returns {boolean} 処理を開始できたらtrue、既に処理中ならfalse
 */
export function startProcessing() {
  if (onlineState.processingAction || onlineState.waitingForOpponent) {
    return false;  // 既に処理中
  }
  onlineState.processingAction = true;
  // 即座に再描画してボタンを無効化
  if (_render) _render();
  return true;
}

/**
 * 処理完了をマーク
 */
export function endProcessing() {
  if (!onlineState.waitingForOpponent) {
    onlineState.processingAction = false;
  }
}

// コールバック
let _render = null;
let _hideVeil = null;
let _showOnlineWaiting = null;
let _onTimeout = null;
let _onOpponentLeft = null;
let _showTitle = null;
let _showEmoteToast = null;

// ポーリング用
let pollIntervalId = null;
const POLL_INTERVAL_MS = 3000;
let expectedIdxAfterTrigger = null;  // トリガー発火後の期待idx
let setupActionsFetched = false;  // place/pitアクションを取得済みか

// 切断検知用
let disconnectTimerId = null;
const DISCONNECT_TIMEOUT_SEC = 15;

// タブ/ブラウザを閉じる時の警告
function beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';  // Chrome用
  return '';  // 他ブラウザ用
}

/**
 * コールバック設定
 */
export function setOnlineFlowCallbacks(callbacks) {
  _render = callbacks.render;
  _hideVeil = callbacks.hideVeil;
  _showOnlineWaiting = callbacks.showOnlineWaiting;
  _onTimeout = callbacks.onTimeout;
  _onOpponentLeft = callbacks.onOpponentLeft;
  _showTitle = callbacks.showTitle;
  _showEmoteToast = callbacks.showEmoteToast;
}

/**
 * オンラインゲームを開始（ホスト用）
 * @param {object} room - ルームオブジェクト
 * @param {object} opt - ゲームオプション
 */
export async function startOnlineGameAsHost(room, opt) {
  console.log('startOnlineGameAsHost room:', { host_user_id: room.host_user_id, guest_user_id: room.guest_user_id });
  onlineState.roomId = room.id;
  onlineState.myPlayerId = 1;
  onlineState.myPlayerName = getPlayerName() || room.host_player_name;
  onlineState.opponentName = room.guest_player_name;
  onlineState.myUserId = room.host_user_id;
  onlineState.opponentUserId = room.guest_user_id;
  onlineState.isHost = true;

  // プリセットを設定
  setPreset(opt.large ? 'large' : 'classic');
  const config = getConfig();
  const villagerCount = config.VILLAGERS;

  // 名前プールからランダムに選択
  const pool = shuf(NAMES);

  // ゲーム状態を初期化
  const newG = {
    mode: 'online',
    opt,
    V: {
      1: mkVillage(1, pool.slice(0, villagerCount), false, opt),
      2: mkVillage(2, pool.slice(villagerCount, villagerCount * 2), false, opt)
    },
    sched: buildSchedule(opt),
    idx: 0,
    day: 1,
    tickIdx: 0,
    instantWin: null,
    permitHouse: { 1: null, 2: null },
    madHouse: { 1: null, 2: null },
    mediumHouse: { 1: null, 2: null },
    handoffs: 0,
    endView: onlineState.myPlayerId,
    publicLog: [],
    done: false,
    swap: false,
    _shown: -1,
    // オンライン固有
    roomId: room.id,
    myPlayerId: 1,
    myPlayerName: onlineState.myPlayerName,
    opponentName: room.guest_player_name,
    myUserId: room.host_user_id,
    opponentUserId: room.guest_user_id
  };

  setG(newG);
  G.totalHandoffs = countHandoffs(G.sched);

  // DBにゲーム状態を保存
  await initGameState(room.id, newG);

  // 同期を開始
  setupSync();
  setupActionsFetched = false;

  // タブを閉じる時の警告を有効化
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // 最初の日の初期化
  startOnlineDay();

  if (_render) _render();
}

/**
 * オンラインゲームを開始（ゲスト用）
 * @param {object} room - ルームオブジェクト
 */
export async function startOnlineGameAsGuest(room) {
  console.log('startOnlineGameAsGuest room:', { host_user_id: room.host_user_id, guest_user_id: room.guest_user_id });
  onlineState.roomId = room.id;
  onlineState.myPlayerId = 2;
  onlineState.myPlayerName = getPlayerName() || room.guest_player_name;
  onlineState.opponentName = room.host_player_name;
  onlineState.myUserId = room.guest_user_id;
  onlineState.opponentUserId = room.host_user_id;
  onlineState.isHost = false;

  // ホストが作成したゲーム状態を取得（リトライ付き）
  let gameState = null;
  const maxRetries = 10;
  const retryDelay = 500; // ms

  for (let i = 0; i < maxRetries; i++) {
    const { data, error } = await fetchGameState(room.id);
    if (data && data.game_data) {
      gameState = data;
      break;
    }
    console.log(`Waiting for game state... attempt ${i + 1}/${maxRetries}`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }

  if (!gameState || !gameState.game_data) {
    console.error('Failed to fetch game state after retries');
    return;
  }

  // ゲーム状態を復元
  const savedG = gameState.game_data;
  savedG.roomId = room.id;
  savedG.myPlayerId = 2;
  savedG.myPlayerName = onlineState.myPlayerName;
  savedG.opponentName = room.host_player_name;
  savedG.myUserId = room.guest_user_id;
  savedG.opponentUserId = room.host_user_id;
  savedG.endView = 2;  // 自分の覚え書きを最初に表示

  // プリセットを設定（ホストの設定に合わせる）
  setPreset(savedG.opt.large ? 'large' : 'classic');

  setG(savedG);

  // 同期を開始
  setupSync();
  setupActionsFetched = false;

  // タブを閉じる時の警告を有効化
  window.addEventListener('beforeunload', beforeUnloadHandler);

  // 最初の日の初期化（アイテム位置をローカルで生成）
  startOnlineDay();

  if (_render) _render();
}

/**
 * 同期をセットアップ
 */
function setupSync() {
  const roomId = onlineState.roomId;
  const myPlayerId = onlineState.myPlayerId;

  // 接続状態変更時のコールバック
  setConnectionCallback(onConnectionChange);

  // ゲーム状態の変更を監視
  subscribeToGameState(roomId, onGameStateChange, onBothPlayersReady);

  // 相手のアクションを監視
  subscribeToActions(roomId, myPlayerId, onOpponentAction);

  // エモートを監視
  subscribeToEmotes(roomId, myPlayerId, onEmoteReceived);

  // プレゼンス（相手のオンライン状態）を監視
  subscribeToPresence(roomId, myPlayerId, onPresenceChange);
}

/**
 * エモート受信時
 */
function onEmoteReceived(emote) {
  if (_showEmoteToast) {
    _showEmoteToast(emote);
  }
}

/**
 * 相手のプレゼンス状態が変化した時
 * @param {boolean} opponentPresent - 相手がオンラインかどうか
 */
function onPresenceChange(opponentPresent) {
  if (opponentPresent) {
    // 相手がオンライン → プレゼンス初期化完了をマーク
    if (!onlineState.presenceInitialized) {
      console.log('[presence] initialized: opponent detected');
      onlineState.presenceInitialized = true;
    }
    // タイマーをキャンセル
    if (disconnectTimerId) {
      clearTimeout(disconnectTimerId);
      disconnectTimerId = null;
    }
    if (_showOnlineWaiting && onlineState.waitingForOpponent) {
      _showOnlineWaiting('相手の操作を待っています...', 'normal');
    }
  } else {
    // 相手がオフライン
    // プレゼンス初期化前の false は無視（race condition 対策）
    if (!onlineState.presenceInitialized) {
      console.log('[presence] ignoring false disconnect before initialization');
      return;
    }

    // タイマーを開始（既に実行中なら何もしない）
    if (disconnectTimerId) return;

    if (_showOnlineWaiting) {
      _showOnlineWaiting(`接続が切れました。${DISCONNECT_TIMEOUT_SEC}秒以内に再接続しない場合、勝利となります。`, 'error');
    }
    disconnectTimerId = setTimeout(() => {
      disconnectTimerId = null;
      if (_onTimeout) _onTimeout();
    }, DISCONNECT_TIMEOUT_SEC * 1000);
  }
}

/**
 * 接続状態変更時
 */
function onConnectionChange(status) {
  if (!onlineState.waitingForOpponent) return;

  if (status === 'error' || status === 'disconnected') {
    // 切断検知 → 15秒タイマー開始
    if (!disconnectTimerId) {
      if (_showOnlineWaiting) {
        _showOnlineWaiting(`接続が切れました。${DISCONNECT_TIMEOUT_SEC}秒以内に再接続しない場合、勝利となります。`, 'error');
      }
      disconnectTimerId = setTimeout(() => {
        disconnectTimerId = null;
        if (_onTimeout) _onTimeout();
      }, DISCONNECT_TIMEOUT_SEC * 1000);
    }
  } else if (status === 'connected') {
    // 再接続 → タイマーキャンセル
    if (disconnectTimerId) {
      clearTimeout(disconnectTimerId);
      disconnectTimerId = null;
    }
    if (_showOnlineWaiting) {
      _showOnlineWaiting('相手の操作を待っています...', 'normal');
    }
  }
}

/**
 * ゲーム状態変更時
 */
function onGameStateChange(newState) {
  if (!newState.game_data) return;

  const gameData = newState.game_data;

  // 降参検出：相手が降参した場合
  if (gameData.surrendered && gameData.surrendered !== onlineState.myPlayerId) {
    alert('相手が降参しました。あなたの勝ちです！');
    endOnlineGame();
    if (_showTitle) _showTitle();
    return;
  }

  // 退出検出：相手が退出した場合
  if (gameData.playerLeft && gameData.playerLeft !== onlineState.myPlayerId) {
    alert('相手が退出しました。タイトルに戻ります。');
    endOnlineGame();
    if (_showTitle) _showTitle();
    return;
  }

  // リスタート検出：現在ゲーム終了中で、新しいゲーム状態（idx=0, done=false）が来た場合
  if (G && G.done && gameData.idx === 0 && !gameData.done) {
    // 相手がリスタートした
    const savedG = { ...gameData };
    savedG.roomId = onlineState.roomId;
    savedG.myPlayerId = onlineState.myPlayerId;
    savedG.myPlayerName = onlineState.myPlayerName;
    savedG.opponentName = onlineState.opponentName;
    savedG.myUserId = onlineState.myUserId;
    savedG.opponentUserId = onlineState.opponentUserId;
    savedG.endView = onlineState.myPlayerId;  // 自分の覚え書きを最初に表示

    // プリセットを設定（ホストの設定に合わせる）
    setPreset(savedG.opt.large ? 'large' : 'classic');

    setG(savedG);
    setupActionsFetched = false;

    // 最初の日の初期化
    startOnlineDay();

    // ベールを非表示にして描画
    if (_hideVeil) _hideVeil();
    if (_render) _render();
    return;
  }

  // トリガー発火検出：待機中にidxが期待値に変化した場合
  if (onlineState.waitingForOpponent && expectedIdxAfterTrigger !== null) {
    if (gameData.idx === expectedIdxAfterTrigger) {
      onBothPlayersReady(newState);
    }
  }
}

/**
 * 両者ready時 - 両プレイヤーのアクションを適用してフェーズを進める
 */
async function onBothPlayersReady(state) {
  if (!onlineState.waitingForOpponent) return;

  onlineState.waitingForOpponent = false;
  onlineState.processingAction = false;  // 処理完了、連打防止フラグをリセット
  expectedIdxAfterTrigger = null;  // リセット
  stopReadyPolling();
  clearTimeoutTimer();

  // トリガーにより更新されたidxを取得（currentPhase計算前に同期）
  const { data: latestState } = await fetchGameState(onlineState.roomId);
  if (latestState && latestState.game_data) {
    G.idx = latestState.game_data.idx;
  }
  // スケジュールから day を同期（idx が day の正しい情報源）
  const syncedEntry = cur();
  if (syncedEntry.day) G.day = syncedEntry.day;
  console.log('[onBothPlayersReady] synced from DB: idx=', G.idx, 'day=', G.day);

  // idx が範囲外なら即座に finish() を呼ぶ
  const schedLen = G.sched ? G.sched.length : 0;
  if (G.idx >= schedLen - 1 || G.done) {
    console.log('[onBothPlayersReady] idx out of bounds or done, finishing:', G.idx, 'schedLen:', schedLen);
    G.idx = Math.max(0, schedLen - 1);
    await resetBothReady(onlineState.roomId);
    await updateGameState(onlineState.roomId, {
      game_data: getG(),
      current_phase: 'end',
      current_day: G.day,
      current_player: 0
    });
    // 処理完了、フラグをリセット
    onlineState.processingAction = false;
    if (_hideVeil) _hideVeil();
    finish(_hideVeil);
    return;
  }

  // DB同期後にフェーズを確認（idx - 2 は安全な範囲で計算）
  const safeIdx = Math.max(0, G.idx - 2);
  const currentPhase = G.sched[safeIdx]?.ph;  // 直前のフェーズ
  console.log('[onBothPlayersReady] currentPhase:', currentPhase, 'G.idx:', G.idx, 'G.day:', G.day);

  // 両者のアクションを取得（リトライ付き）
  // 重要: 両プレイヤーのアクションが揃っていることを確認
  let actions = [];
  for (let retry = 0; retry < 8; retry++) {
    const { data: allActions } = await fetchPhaseActions(onlineState.roomId, currentPhase);
    const lastTwo = allActions ? allActions.slice(-2) : [];
    console.log('[onBothPlayersReady] fetch retry:', retry, 'total:', allActions?.length, 'lastTwo:', lastTwo.length);

    // 最後の2つが異なるプレイヤーからであることを確認
    if (lastTwo.length >= 2) {
      const p1 = lastTwo[0].player_id;
      const p2 = lastTwo[1].player_id;
      if (p1 !== p2) {
        actions = lastTwo;
        console.log('[onBothPlayersReady] both players found:', p1, p2);
        break;
      } else {
        console.log('[onBothPlayersReady] same player twice:', p1, '- waiting for other player');
      }
    }

    await new Promise(r => setTimeout(r, 400));
  }

  if (actions.length < 2) {
    console.error('Failed to fetch both actions after retries');
    onlineState.waitingForOpponent = true;
    startReadyPolling();
    return;
  }

  // explorerフェーズ完了時、相手のplace/pitアクションを取得・適用
  // （この時点で両者がexplorerを送信しているので、place/pitは必ず完了済み）
  if (currentPhase === 'explorer' && !setupActionsFetched) {
    await fetchAndApplySetupActions();
    setupActionsFetched = true;
  }

  // 両者のアクションを適用
  actions.forEach(a => {
    applyAction({
      playerId: a.player_id,
      phase: a.action_type,
      data: a.action_data
    });
  });

  // ticksフェーズ終了後の解決処理
  if (currentPhase === 'ticks') {
    resolveDay(_hideVeil);
  }

  // nightフェーズ終了後の解決処理
  if (currentPhase === 'night') {
    resolveNight();
    if (!G.done) {
      const config = getConfig();
      if (G.day < config.DAYS) {
        startOnlineDay();
      }
    }
  }

  // 次フェーズ情報を更新
  const next = cur();
  if (next.day) G.day = next.day;
  if (next.ph === 'ticks') G.tickIdx = 0;

  // end または unknown フェーズの場合は finish() を呼ぶ
  if (next.ph === 'end' || next.ph === 'unknown') {
    // idx を安全な値に修正
    const schedLen2 = G.sched ? G.sched.length : 0;
    G.idx = Math.max(0, schedLen2 - 1);

    // ready フラグをリセット（再入防止）
    await resetBothReady(onlineState.roomId);

    // ゲーム状態をDBに保存
    await updateGameState(onlineState.roomId, {
      game_data: getG(),
      current_phase: 'end',
      current_day: G.day,
      current_player: 0
    });

    // 処理完了、フラグをリセット
    onlineState.processingAction = false;

    if (_hideVeil) _hideVeil();
    finish(_hideVeil);
    return;
  }

  // ready フラグをリセット（再入防止）
  await resetBothReady(onlineState.roomId);

  // ゲーム状態をDBに保存（resolveDay/Night等の結果を反映）
  await updateGameState(onlineState.roomId, {
    game_data: getG(),
    current_phase: next.ph,
    current_day: G.day,
    current_player: next.who
  });

  // 処理完了、フラグをリセット
  onlineState.processingAction = false;

  if (_hideVeil) _hideVeil();
  if (_render) _render();
}

/**
 * 相手のアクション受信時
 */
function onOpponentAction(action) {
  // 待ち合わせフェーズ以外は即座に適用
  const c = cur();
  if (!WAIT_PHASES.includes(c.ph) && !LOCAL_PHASES.includes(c.ph)) {
    applyAction(action);
    if (_render) _render();
  }
  // 待ち合わせフェーズの場合はonBothPlayersReadyで処理
}

/**
 * 日の開始
 */
export function startOnlineDay() {
  [1, 2].forEach(p => {
    const v = G.V[p];
    v.permit = false;
    v.route = [];
    v.sharpenStart = null;
    v.spoiled = false;
    v.explorer = null;
    v.attackTarget = null;
    v.protectTarget = null;
    v.permitFound = null;
    v.notice = null;
    v.heardToday = null;
    v.madClaw = false;
    v.madClawFound = null;
    v.madStart = null;
    v.mediumFound = false;
    v.gotPermit = false;
    v.gotClaw = false;
    v.gotMedium = false;
    v.heardMad = null;
    v.heardWolf = null;
    v.routeDone = false;
    v.tickDone = false;
  });
  G.tickIdx = 0;

  const config = getConfig();
  const HOUSES = config.HOUSES;

  [1, 2].forEach(p => {
    const ph = shuf(HOUSES)[0];
    G.permitHouse[p] = ph;
    const pool = shuf(HOUSES.filter(h => h !== ph));
    G.madHouse[p] = (G.opt.madmanDog && G.day <= 2) ? pool[0] : null;
    G.mediumHouse[p] = (G.opt.medium && G.day <= 2) ? (pool[1] !== undefined ? pool[1] : pool[0]) : null;
  });
}

/**
 * 相手のplace/pitアクションを取得して適用
 */
async function fetchAndApplySetupActions() {
  const roomId = onlineState.roomId;
  const myPlayerId = onlineState.myPlayerId;

  // place/pitアクションを全て取得
  const { data: actions } = await fetchSetupActions(roomId);
  if (!actions || actions.length === 0) return;

  // 相手のアクションのみ適用（自分のは既にローカルで適用済み）
  actions.forEach(a => {
    if (a.player_id !== myPlayerId) {
      applyAction({
        playerId: a.player_id,
        phase: a.action_type,
        data: a.action_data
      });
    }
  });
}

/**
 * アクションを送信して完了を待つ
 * @param {object} action - アクションデータ
 * 注: 呼び出し元で startProcessing() を呼んでいるため、ここでは processingAction フラグは設定しない
 */
export async function submitOnlineAction(action) {
  try {
    const roomId = onlineState.roomId;
    const myPlayerId = onlineState.myPlayerId;

    // 送信前のフェーズを確認（LOCAL_PHASES判定用）
    const localPhase = cur().ph;
    console.log('[submitOnlineAction] localPhase:', localPhase, 'local idx:', G.idx, 'playerId:', myPlayerId, 'day:', G.day);

    // アクションを送信
    await sendAction(roomId, action);

    // place/pit は待ち合わせなし、ローカルで次へ進む（idx同期なし）
    if (LOCAL_PHASES.includes(localPhase)) {
      console.log('[submitOnlineAction] LOCAL_PHASE, advancing locally');
      await advanceLocal();
      return;
    }

    // WAIT_PHASES（explorer以降）は DB から idx を同期
    const { data: syncState } = await fetchGameState(roomId);
    if (syncState?.game_data) {
      G.idx = syncState.game_data.idx;
    }
    // スケジュールから day を同期（idx が day の正しい情報源）
    const syncedEntry = cur();
    if (syncedEntry.day) G.day = syncedEntry.day;
    console.log('[submitOnlineAction] synced from DB: idx=', G.idx, 'day=', G.day);

    // 同期後のフェーズで判定
    const syncedPhase = cur().ph;
    console.log('[submitOnlineAction] syncedPhase:', syncedPhase);

    // explorer以降は待ち合わせ
    if (WAIT_PHASES.includes(syncedPhase)) {
      // トリガー発火後の期待idxを記録
      expectedIdxAfterTrigger = G.idx + 2;
      const schedLen = G.sched.length;
      console.log('[submitOnlineAction] WAIT_PHASE, G.idx:', G.idx, 'expectedIdx:', expectedIdxAfterTrigger, 'sched.length:', schedLen, 'G.day:', G.day);

      // ready状態にして相手を待つ
      await setPlayerReady(roomId, myPlayerId, true);
      console.log('[submitOnlineAction] set ready, checking trigger...');

      // 即座にDBを確認（後からreadyにした方はここで検出できる）
      const { data: immediateCheck } = await fetchGameState(roomId);
      const immediateIdx = immediateCheck?.game_data?.idx;
      const p1Ready = immediateCheck?.player1_ready;
      const p2Ready = immediateCheck?.player2_ready;
      console.log('[submitOnlineAction] DB state: idx=', immediateIdx, 'p1Ready=', p1Ready, 'p2Ready=', p2Ready, 'expected=', expectedIdxAfterTrigger);

      // トリガーによりidxが進んでいれば発火済み
      if (immediateIdx === expectedIdxAfterTrigger) {
        // トリガー発火済み → 即座に進行
        console.log('[submitOnlineAction] trigger fired! proceeding...');
        onlineState.waitingForOpponent = true;
        onBothPlayersReady(immediateCheck);
        return;
      }

      // まだ相手が未完了 → 待機モードへ
      console.log('[submitOnlineAction] waiting for opponent...');
      onlineState.waitingForOpponent = true;

      // 待機中表示
      if (_showOnlineWaiting) {
        _showOnlineWaiting('相手の操作を待っています...', 'normal');
      }

      // ポーリング開始（Realtime欠落時のフォールバック）
      startReadyPolling();

      // タイムアウト開始（相手の操作待ち）
      startTimeout(() => {
        if (_onTimeout) _onTimeout();
      });
    } else {
      // 順次入力フェーズ → 即座に次へ
      advanceOnline();
    }
  } finally {
    // waitingForOpponent でない場合のみリセット（待機中はフラグを維持）
    if (!onlineState.waitingForOpponent) {
      onlineState.processingAction = false;
    }
  }
}

/**
 * place/pit完了後、ローカルで次のフェーズへ進む
 */
async function advanceLocal() {
  const c = cur();
  const myPlayerId = onlineState.myPlayerId;

  if (c.ph === 'place') {
    // place完了 → pit or explorer へ
    if (G.opt?.pit) {
      // pitあり: 自分の pit フェーズへ
      // P1: idx 1, P2: idx 3
      G.idx = myPlayerId === 1 ? 1 : 3;
    } else {
      // pitなし: explorer へ
      const explorerIdx = G.sched.findIndex(e => e.ph === 'explorer');
      G.idx = explorerIdx >= 0 ? explorerIdx : 2;
    }
  } else if (c.ph === 'pit') {
    // pit完了 → explorer へ
    const explorerIdx = G.sched.findIndex(e => e.ph === 'explorer');
    G.idx = explorerIdx >= 0 ? explorerIdx : G.idx + 2;
  }

  // DBにも保存（トリガーが正しいidxを使えるように）
  await updateGameState(onlineState.roomId, {
    game_data: getG(),
    current_phase: cur().ph,
    current_day: G.day,
    current_player: cur().who
  });

  // 処理完了、フラグをリセット
  onlineState.processingAction = false;

  if (_render) _render();
}

/**
 * トリガー発火をポーリングで確認
 * トリガーが発火するとidxが+2され、readyがfalseになる
 */
function startReadyPolling() {
  stopReadyPolling();
  pollIntervalId = setInterval(async () => {
    if (!onlineState.waitingForOpponent) {
      stopReadyPolling();
      return;
    }
    const { data } = await fetchGameState(onlineState.roomId);
    const dbIdx = data?.game_data?.idx;
    console.log('[polling] dbIdx:', dbIdx, 'expectedIdx:', expectedIdxAfterTrigger, 'p1Ready:', data?.player1_ready, 'p2Ready:', data?.player2_ready);
    // トリガー発火後はidxが期待値になっている
    if (dbIdx === expectedIdxAfterTrigger) {
      console.log('[polling] trigger detected! proceeding...');
      stopReadyPolling();
      onBothPlayersReady(data);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * ポーリングを停止
 */
function stopReadyPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

/**
 * 次のフェーズへ進む
 */
export function advanceOnline() {
  G.idx++;
  const c = cur();
  if (c.day) G.day = c.day;
  if (c.ph === 'ticks') G.tickIdx = 0;

  // 特殊フェーズの処理
  if (c.ph === 'morning') {
    // 朝の結果表示（両者に公開）
  }

  if (c.ph === 'end') {
    finish(_hideVeil);
  }

  // ゲーム状態をDBに保存
  updateGameState(onlineState.roomId, {
    game_data: getG(),
    current_phase: c.ph,
    current_day: G.day,
    current_player: c.who
  });

  if (_render) _render();
}

/**
 * 自分のターンかどうか
 */
export function isMyTurn() {
  const c = cur();
  // place/pitは常に同時入力（スケジュールの who に関係なく両者が操作可能）
  if (c.ph === 'place' || c.ph === 'pit') return true;
  const w = who();
  return w === onlineState.myPlayerId || w === 0;
}

/**
 * オンライン状態を取得
 */
export function getOnlineState() {
  return { ...onlineState };
}

/**
 * オンラインゲームを終了
 */
export function endOnlineGame() {
  unsubscribeAll();
  clearTimeoutTimer();
  stopReadyPolling();
  if (disconnectTimerId) {
    clearTimeout(disconnectTimerId);
    disconnectTimerId = null;
  }
  // タブを閉じる時の警告を解除
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  onlineState = {
    roomId: null,
    myPlayerId: null,
    myPlayerName: null,
    opponentName: null,
    myUserId: null,
    opponentUserId: null,
    isHost: false,
    pendingAction: null,
    waitingForOpponent: false,
    waitingForRestart: false,
    presenceInitialized: false,
    processingAction: false
  };
}

/**
 * オンラインゲームで降参
 */
export async function surrenderOnline() {
  if (!onlineState.roomId) return;

  // DBに降参を記録
  await updateGameState(onlineState.roomId, {
    game_data: { ...getG(), surrendered: onlineState.myPlayerId }
  });
}

/**
 * プレイヤーが退出したことを記録
 */
export async function markPlayerLeft() {
  if (!onlineState.roomId) return;

  await updateGameState(onlineState.roomId, {
    game_data: { ...getG(), playerLeft: onlineState.myPlayerId }
  });
}

/**
 * 同じルームでオンラインゲームを再開始（リマッチ）
 * どちらのプレイヤーからでも開始可能
 * @param {function} renderCallback - 描画コールバック
 */
export async function restartOnlineGame(renderCallback) {
  if (!onlineState.roomId) {
    console.error('No room to restart');
    return;
  }

  // 新しいゲーム状態を作成（どちらのプレイヤーからでもOK）
  const opt = { ...G.opt };
  setPreset(opt.large ? 'large' : 'classic');
  const config = getConfig();
  const villagerCount = config.VILLAGERS;
  const pool = shuf(NAMES);
  const myPlayerId = onlineState.myPlayerId;

  const newG = {
    mode: 'online',
    opt,
    V: {
      1: mkVillage(1, pool.slice(0, villagerCount), false, opt),
      2: mkVillage(2, pool.slice(villagerCount, villagerCount * 2), false, opt)
    },
    sched: buildSchedule(opt),
    idx: 0,
    day: 1,
    tickIdx: 0,
    instantWin: null,
    permitHouse: { 1: null, 2: null },
    madHouse: { 1: null, 2: null },
    mediumHouse: { 1: null, 2: null },
    handoffs: 0,
    endView: myPlayerId,
    publicLog: [],
    done: false,
    swap: false,
    _shown: -1,
    roomId: onlineState.roomId,
    myPlayerId: myPlayerId,
    myPlayerName: onlineState.myPlayerName,
    opponentName: onlineState.opponentName,
    myUserId: onlineState.myUserId,
    opponentUserId: onlineState.opponentUserId
  };

  setG(newG);
  G.totalHandoffs = countHandoffs(G.sched);
  setupActionsFetched = false;

  // onlineState のフラグをリセット
  onlineState.waitingForOpponent = false;
  onlineState.processingAction = false;
  onlineState.presenceInitialized = false;
  expectedIdxAfterTrigger = null;
  stopReadyPolling();
  clearTimeoutTimer();

  // DBに新しいゲーム状態を保存
  await updateGameState(onlineState.roomId, {
    game_data: newG,
    current_phase: 'place',
    current_day: 1,
    current_player: 1
  });

  // ready状態をリセット
  await resetBothReady(onlineState.roomId);

  // 最初の日の初期化
  startOnlineDay();

  if (renderCallback) renderCallback();
}

/**
 * エモートを送信
 * @param {string} emote - エモート絵文字
 * @returns {boolean} 送信成功したかどうか
 */
export async function sendEmote(emote) {
  if (!onlineState.roomId || !onlineState.myPlayerId) return false;
  if (!canSendEmote()) return false;

  const { error } = await sendEmoteToDb(onlineState.roomId, onlineState.myPlayerId, emote);
  return !error;
}

/**
 * エモートを送信可能かどうか
 */
export { canSendEmote };
