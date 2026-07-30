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
  sendAction,
  setPlayerReady,
  resetBothReady,
  updateGameState,
  fetchGameState,
  fetchPhaseActions,
  unsubscribeAll
} from './sync.js';
import { initGameState } from './room.js';
import { startTimeout, clearTimeoutTimer } from './timeout.js';
import { getPlayerName } from './supabase.js';

// 同時入力が必要なフェーズ
const SIMULTANEOUS_PHASES = ['place', 'pit', 'explorer', 'route', 'ticks', 'night'];

// オンライン状態
let onlineState = {
  roomId: null,
  myPlayerId: null,   // 1 or 2
  myPlayerName: null,
  opponentName: null,
  isHost: false,
  pendingAction: null,
  waitingForOpponent: false,
  waitingForRestart: false
};

// コールバック
let _render = null;
let _hideVeil = null;
let _showOnlineWaiting = null;
let _onTimeout = null;
let _onOpponentLeft = null;

/**
 * コールバック設定
 */
export function setOnlineFlowCallbacks(callbacks) {
  _render = callbacks.render;
  _hideVeil = callbacks.hideVeil;
  _showOnlineWaiting = callbacks.showOnlineWaiting;
  _onTimeout = callbacks.onTimeout;
  _onOpponentLeft = callbacks.onOpponentLeft;
}

/**
 * オンラインゲームを開始（ホスト用）
 * @param {object} room - ルームオブジェクト
 * @param {object} opt - ゲームオプション
 */
export async function startOnlineGameAsHost(room, opt) {
  onlineState.roomId = room.id;
  onlineState.myPlayerId = 1;
  onlineState.myPlayerName = getPlayerName() || room.host_player_name;
  onlineState.opponentName = room.guest_player_name;
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
    endView: 1,
    publicLog: [],
    done: false,
    swap: false,
    _shown: -1,
    // オンライン固有
    roomId: room.id,
    myPlayerId: 1,
    myPlayerName: onlineState.myPlayerName,
    opponentName: room.guest_player_name
  };

  setG(newG);
  G.totalHandoffs = countHandoffs(G.sched);

  // DBにゲーム状態を保存
  await initGameState(room.id, newG);

  // 同期を開始
  setupSync();

  // 最初の日の初期化
  startOnlineDay();

  if (_render) _render();
}

/**
 * オンラインゲームを開始（ゲスト用）
 * @param {object} room - ルームオブジェクト
 */
export async function startOnlineGameAsGuest(room) {
  onlineState.roomId = room.id;
  onlineState.myPlayerId = 2;
  onlineState.myPlayerName = getPlayerName() || room.guest_player_name;
  onlineState.opponentName = room.host_player_name;
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

  // プリセットを設定（ホストの設定に合わせる）
  setPreset(savedG.opt.large ? 'large' : 'classic');

  setG(savedG);

  // 同期を開始
  setupSync();

  if (_render) _render();
}

/**
 * 同期をセットアップ
 */
function setupSync() {
  const roomId = onlineState.roomId;
  const myPlayerId = onlineState.myPlayerId;

  // ゲーム状態の変更を監視
  subscribeToGameState(roomId, onGameStateChange, onBothPlayersReady);

  // 相手のアクションを監視
  subscribeToActions(roomId, myPlayerId, onOpponentAction);
}

/**
 * ゲーム状態変更時
 */
function onGameStateChange(newState) {
  if (!newState.game_data) return;

  const gameData = newState.game_data;

  // リスタート検出：現在ゲーム終了中で、新しいゲーム状態（idx=0, done=false）が来た場合
  if (G && G.done && gameData.idx === 0 && !gameData.done) {
    // 相手がリスタートした
    const savedG = { ...gameData };
    savedG.roomId = onlineState.roomId;
    savedG.myPlayerId = onlineState.myPlayerId;
    savedG.myPlayerName = onlineState.myPlayerName;
    savedG.opponentName = onlineState.opponentName;

    // プリセットを設定（ホストの設定に合わせる）
    setPreset(savedG.opt.large ? 'large' : 'classic');

    setG(savedG);

    // 最初の日の初期化
    startOnlineDay();

    // ベールを非表示にして描画
    if (_hideVeil) _hideVeil();
    if (_render) _render();
  }
}

/**
 * 両者ready時
 */
async function onBothPlayersReady(state) {
  if (!onlineState.waitingForOpponent) return;

  onlineState.waitingForOpponent = false;
  clearTimeoutTimer();

  const c = cur();
  const currentPhase = c.ph;

  // 両者のアクションを取得して適用（最新の2件のみ使用）
  const { data: allActions } = await fetchPhaseActions(onlineState.roomId, currentPhase);

  // 最新の2件（現在のターンのアクション）のみ取得
  const actions = allActions ? allActions.slice(-2) : [];

  if (actions && actions.length >= 2) {
    // 両者のアクションを適用
    actions.forEach(a => {
      applyAction({
        playerId: a.player_id,
        phase: a.action_type,
        data: a.action_data
      });
    });

    // ready状態をリセット
    await resetBothReady(onlineState.roomId);

    // 同時入力フェーズの場合、両者分のスケジュールをスキップ
    if (SIMULTANEOUS_PHASES.includes(currentPhase)) {
      // place/pitフェーズは特殊処理（スケジュールが1P→2P交互になっているため）
      if (currentPhase === 'place') {
        if (G.opt?.pit) {
          // pitがある場合：placeの次のpitフェーズへ（idx 1）
          G.idx = 1;
        } else {
          // pitがない場合：explorerフェーズへ（idx 2）
          G.idx = 2;
        }
      } else if (currentPhase === 'pit') {
        // pitの後はexplorerフェーズへ（スケジュールを検索）
        const explorerIdx = G.sched.findIndex(e => e.ph === 'explorer');
        G.idx = explorerIdx >= 0 ? explorerIdx : G.idx + 2;
      } else {
        // explorer, route, ticks, night - 2エントリをスキップ
        G.idx += 2;
      }

      // ticksフェーズ終了後の解決処理
      if (currentPhase === 'ticks') {
        resolveDay(_hideVeil);
        if (G.done) {
          if (_render) _render();
          return;
        }
      }

      // nightフェーズ終了後の解決処理
      if (currentPhase === 'night') {
        resolveNight();
        if (G.done) {
          if (_render) _render();
          return;
        }
        // 次の日の開始
        const config = getConfig();
        if (G.day < config.DAYS) {
          startOnlineDay();
        }
      }

      // 次の日の初期化が必要な場合
      const next = cur();
      if (next.day) G.day = next.day;
      if (next.ph === 'ticks') G.tickIdx = 0;

      // ゲーム状態をDBに保存
      updateGameState(onlineState.roomId, {
        game_data: getG(),
        current_phase: next.ph,
        current_day: G.day,
        current_player: next.who
      });

      if (_hideVeil) _hideVeil();
      if (_render) _render();
    } else {
      // 順次入力フェーズへ
      advanceOnline();
    }
  }
}

/**
 * 相手のアクション受信時
 */
function onOpponentAction(action) {
  // 同時入力フェーズでない場合は即座に適用
  const c = cur();
  if (!SIMULTANEOUS_PHASES.includes(c.ph)) {
    applyAction(action);
    if (_render) _render();
  }
  // 同時入力フェーズの場合はonBothPlayersReadyで処理
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
 * アクションを送信して完了を待つ
 * @param {object} action - アクションデータ
 */
export async function submitOnlineAction(action) {
  const roomId = onlineState.roomId;
  const myPlayerId = onlineState.myPlayerId;

  // アクションを送信
  await sendAction(roomId, action);

  const c = cur();

  if (SIMULTANEOUS_PHASES.includes(c.ph)) {
    // 同時入力フェーズ → ready状態にして相手を待つ
    await setPlayerReady(roomId, myPlayerId, true);
    onlineState.waitingForOpponent = true;

    // 待機中表示
    if (_showOnlineWaiting) {
      _showOnlineWaiting('相手の操作を待っています...');
    }

    // タイムアウト開始（相手の操作待ち）
    startTimeout(() => {
      if (_onTimeout) _onTimeout();
    });
  } else {
    // 順次入力フェーズ → 即座に次へ
    advanceOnline();
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
  onlineState = {
    roomId: null,
    myPlayerId: null,
    myPlayerName: null,
    opponentName: null,
    isHost: false,
    pendingAction: null,
    waitingForOpponent: false,
    waitingForRestart: false
  };
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
    endView: 1,
    publicLog: [],
    done: false,
    swap: false,
    _shown: -1,
    roomId: onlineState.roomId,
    myPlayerId: myPlayerId,
    myPlayerName: onlineState.myPlayerName,
    opponentName: onlineState.opponentName
  };

  setG(newG);
  G.totalHandoffs = countHandoffs(G.sched);

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
