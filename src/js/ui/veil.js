/**
 * ベール画面（タイトル、ホットシート、オンライン）
 */

import { G, cur, who } from '../state.js';
import { getPlayerName, setPlayerName, getCurrentUserId } from '../online/supabase.js';
import { showStatsPopup } from './statsPopup.js';
import {
  createRoom,
  joinRoom,
  subscribeToRoom,
  joinMatchmakingQueue,
  subscribeToMatchmaking,
  cancelMatchmaking
} from '../online/room.js';
import {
  startOnlineGameAsHost,
  startOnlineGameAsGuest,
  restartOnlineGame
} from '../online/onlineFlow.js';
import { renderEmoteBar, hideEmoteBar } from './render.js';
import { playTrack, playSE, resetResultSE } from '../audio.js';

// タイトル画面のオプション
export let TITLE_OPT = { madmanDog: false, medium: false, pit: false, large: false };

// 選択中のモード（オプション画面で使用）
let selectedMode = null;

// オンライン状態
let onlineScreen = null; // 'menu' | 'create' | 'join' | 'matchmaking' | 'waiting'
let currentRoom = null;
let unsubscribeRoom = null;
let unsubscribeMatchmaking = null;
let matchmakingQueueId = null;

// newGame関数（外部から注入）
let _newGame = null;
let _render = null;

export function setVeilCallbacks({ newGame, render }) {
  _newGame = newGame;
  _render = render;
}

/**
 * タイトル画面を表示（モード選択のみ）
 */
export function showTitle() {
  onlineScreen = null;
  selectedMode = null;
  cleanupOnlineSubscriptions();
  hideEmoteBar();
  playTrack('title');

  const el = document.getElementById('veil');
  el.style.display = 'flex';
  el.classList.add('title-screen');
  el.classList.remove('menu-screen');
  document.body.style.overflow = 'hidden';
  document.body.classList.remove('game-active');
  document.querySelector('.wrap').style.display = 'none';

  el.innerHTML = `<div class="inner">
    <div class="modebtns">
      <button class="big" onclick="window._selectMode('cpu')">対CPU<span class="note">1人で遊ぶ</span></button>
      <button class="big" onclick="window._selectMode('pvp')">2人で対戦<span class="note">1台を交代で使う</span></button>
      <button class="big" onclick="window._showOnlineMenu()">オンライン対戦<span class="note">遠くの相手と</span></button>
    </div>
    <button class="stats-btn" onclick="window._showMyStats()">成績</button>
  </div>`;
}

/**
 * モードを選択してオプション画面へ
 */
export function selectMode(m) {
  selectedMode = m;
  showOptions();
}

/**
 * オプション画面を表示
 */
export function showOptions() {
  const el = document.getElementById('veil');
  el.style.display = 'flex';
  el.classList.remove('title-screen');
  el.classList.add('menu-screen');
  document.body.style.overflow = 'hidden';

  const chip = (key, label, desc) =>
    '<button class="optchip ' + (TITLE_OPT[key] ? 'on' : '') + '" onclick="window._toggleOpt(\'' + key + '\')"><span class="ck">' +
    (TITLE_OPT[key] ? '✓' : '') + '</span>' + label + '<small>' + desc + '</small></button>';

  const modeLabel = selectedMode === 'cpu' ? '対CPU' : selectedMode === 'pvp' ? '2人で対戦' : 'オンライン対戦';

  el.innerHTML = `<div class="inner">
    <div class="title-sm">${modeLabel}</div>
    <div class="opts">
      <div class="optlabel">追加の役職（任意）</div>
      ${chip('madmanDog', '狂人 ＋ 犬飼い', '狂人の爪で研ぎ音を撹乱／犬飼いは本物の音を聞き分ける')}
      ${chip('medium', '霊媒師', '霊媒の札で、倒した相手の役職が分かる')}
      ${chip('pit', '落とし穴', '自分の村の道に仕掛ける。通った相手は持ち物を全部落とす')}
      <div class="optlabel" style="margin-top:12px">マップサイズ</div>
      ${chip('large', '9軒5日', '広い村（3×3）で、5日5夜の長期戦')}
    </div>
    <div class="modebtns">
      <button class="primary big" onclick="window._startGame()">ゲーム開始</button>
    </div>
    <button class="back" onclick="window._showTitle()">← 戻る</button>
  </div>`;
}

/**
 * オプションをトグル
 */
export function toggleOpt(k) {
  TITLE_OPT[k] = !TITLE_OPT[k];
  showOptions();
}

/**
 * ゲームを開始
 */
export function startGame() {
  playSE('confirm');
  resetResultSE();
  document.body.style.overflow = '';
  if (_newGame) _newGame(selectedMode, { ...TITLE_OPT });
}

/**
 * モードを選択してゲーム開始（後方互換性のため維持）
 */
export function pick(m) {
  selectedMode = m;
  startGame();
}

/**
 * 同じ設定でゲームを再開始（リマッチ）
 */
export function restartGame() {
  if (!G) {
    showTitle();
    return;
  }
  resetResultSE();

  if (G.mode === 'online') {
    // オンライン：同じルームで再戦
    restartOnlineGame(_render);
  } else {
    // オフライン：同じモードとオプションで再スタート
    const mode = G.mode;
    const opt = { ...G.opt };
    document.body.style.overflow = '';
    if (_newGame) _newGame(mode, opt);
  }
}

/**
 * オンラインメニューを表示
 */
export function showOnlineMenu() {
  onlineScreen = 'menu';
  selectedMode = 'online';
  const el = document.getElementById('veil');
  el.classList.remove('title-screen');
  el.classList.add('menu-screen');
  const savedName = getPlayerName();

  el.innerHTML = `<div class="inner online-menu">
    <div class="title-sm">オンライン対戦</div>
    <div class="name-input">
      <label>あなたの名前</label>
      <input type="text" id="player-name" value="${savedName}" placeholder="ニックネーム" maxlength="10" oninput="window._savePlayerName(this.value)" onchange="window._savePlayerName(this.value)" onblur="window._savePlayerName(this.value)">
    </div>
    <div class="online-btns">
      <button class="big" onclick="window._showOnlineOptions('create')">ルームを作る<span class="note">コードを相手に伝える</span></button>
      <button class="big" onclick="window._showJoinRoom()">ルームに参加<span class="note">コードを入力する</span></button>
      <button class="big match" onclick="window._showOnlineOptions('match')">対戦相手を探す<span class="note">自動マッチング</span></button>
    </div>
    <button class="back" onclick="window._showTitle()">← 戻る</button>
  </div>`;
}

/**
 * オンラインオプション画面を表示（ルーム作成/マッチング前）
 */
export function showOnlineOptions(action) {
  // player-name 入力欄が存在する場合のみ名前を保存（toggleOptOnline からの再呼び出し時は存在しない）
  const nameInput = document.getElementById('player-name');
  if (nameInput) {
    const playerName = nameInput.value?.trim() || '名無し';
    setPlayerName(playerName);
  }

  onlineScreen = 'options';
  const el = document.getElementById('veil');
  el.classList.add('menu-screen');

  const chip = (key, label, desc) =>
    '<button class="optchip ' + (TITLE_OPT[key] ? 'on' : '') + '" onclick="window._toggleOptOnline(\'' + key + '\')"><span class="ck">' +
    (TITLE_OPT[key] ? '✓' : '') + '</span>' + label + '<small>' + desc + '</small></button>';

  const actionLabel = action === 'create' ? 'ルームを作る' : '対戦相手を探す';
  const onStart = action === 'create' ? 'window._showCreateRoom()' : 'window._startMatchmaking()';

  el.innerHTML = `<div class="inner">
    <div class="title-sm">${actionLabel}</div>
    <div class="opts">
      <div class="optlabel">追加の役職（任意）</div>
      ${chip('madmanDog', '狂人 ＋ 犬飼い', '狂人の爪で研ぎ音を撹乱／犬飼いは本物の音を聞き分ける')}
      ${chip('medium', '霊媒師', '霊媒の札で、倒した相手の役職が分かる')}
      ${chip('pit', '落とし穴', '自分の村の道に仕掛ける。通った相手は持ち物を全部落とす')}
      <div class="optlabel" style="margin-top:12px">マップサイズ</div>
      ${chip('large', '9軒5日', '広い村（3×3）で、5日5夜の長期戦')}
    </div>
    <div class="modebtns">
      <button class="primary big" onclick="${onStart}">開始</button>
    </div>
    <button class="back" onclick="window._showOnlineMenu()">← 戻る</button>
  </div>`;
}

/**
 * オンラインオプション画面でのトグル
 */
export function toggleOptOnline(k) {
  TITLE_OPT[k] = !TITLE_OPT[k];
  // 現在の画面を再描画
  const el = document.getElementById('veil');
  const isCreate = el.innerHTML.includes('ルームを作る');
  showOnlineOptions(isCreate ? 'create' : 'match');
}

/**
 * ルーム作成画面
 */
export async function showCreateRoom() {
  const playerName = getPlayerName() || '名無し';

  onlineScreen = 'create';
  const el = document.getElementById('veil');
  el.classList.add('menu-screen');
  el.innerHTML = `<div class="inner"><div class="loading">ルームを作成中...</div></div>`;

  const { room, error } = await createRoom(playerName, { ...TITLE_OPT });

  if (error) {
    el.innerHTML = `<div class="inner">
      <div class="error">エラー: ${error}</div>
      <button class="back" onclick="window._showOnlineMenu()">← 戻る</button>
    </div>`;
    return;
  }

  currentRoom = room;

  // ルームの変更を監視
  unsubscribeRoom = subscribeToRoom(room.id, (updatedRoom) => {
    if (updatedRoom.status === 'playing' && updatedRoom.guest_player_name) {
      // ゲスト参加 → ゲーム開始
      cleanupOnlineSubscriptions();
      startOnlineGameAsHost(updatedRoom, { ...TITLE_OPT });
      hideVeil(_render);
    }
  });

  el.innerHTML = `<div class="inner room-created">
    <div class="title-sm">ルームを作成しました</div>
    <div class="room-code">${room.room_code}</div>
    <p>このコードを相手に伝えてください。<br>相手が参加するとゲームが始まります。</p>
    <div class="waiting-indicator">
      <div class="spinner"></div>
      <span>相手の参加を待っています...</span>
    </div>
    <button class="back" onclick="window._cancelRoom()">キャンセル</button>
  </div>`;
}

/**
 * ルーム参加画面
 */
export function showJoinRoom() {
  const playerName = document.getElementById('player-name')?.value?.trim() || '名無し';
  setPlayerName(playerName);

  onlineScreen = 'join';
  const el = document.getElementById('veil');
  el.classList.add('menu-screen');

  el.innerHTML = `<div class="inner join-room">
    <div class="title-sm">ルームに参加</div>
    <div class="code-input">
      <label>ルームコード</label>
      <input type="text" id="room-code" placeholder="4文字" maxlength="4" style="text-transform:uppercase">
    </div>
    <button class="primary big" onclick="window._joinRoom()">参加する</button>
    <div id="join-error" class="error" style="display:none"></div>
    <button class="back" onclick="window._showOnlineMenu()">← 戻る</button>
  </div>`;

  // 入力欄にフォーカス
  setTimeout(() => {
    document.getElementById('room-code')?.focus();
  }, 100);
}

/**
 * ルームに参加
 */
export async function doJoinRoom() {
  const code = document.getElementById('room-code')?.value.trim().toUpperCase();
  const playerName = getPlayerName() || '名無し';
  const errorEl = document.getElementById('join-error');

  if (!code || code.length !== 4) {
    errorEl.textContent = '4文字のコードを入力してください';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';

  const { room, error } = await joinRoom(code, playerName);

  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = 'block';
    return;
  }

  // ゲーム開始
  currentRoom = room;
  await startOnlineGameAsGuest(room);
  hideVeil(_render);
}

/**
 * 自動マッチング開始
 */
export async function startMatchmaking() {
  const playerName = getPlayerName() || '名無し';

  onlineScreen = 'matchmaking';
  const el = document.getElementById('veil');
  el.classList.remove('menu-screen');
  el.innerHTML = `<div class="inner"><div class="loading">対戦相手を探しています...</div></div>`;

  const { queueId, room, matched, error, isHost } = await joinMatchmakingQueue(playerName, { ...TITLE_OPT });

  if (error) {
    el.innerHTML = `<div class="inner">
      <div class="error">エラー: ${error}</div>
      <button class="back" onclick="window._showOnlineMenu()">← 戻る</button>
    </div>`;
    return;
  }

  if (matched && room) {
    // 即座にマッチ → ゲーム開始
    currentRoom = room;
    if (isHost) {
      await startOnlineGameAsHost(room, { ...TITLE_OPT });
    } else {
      await startOnlineGameAsGuest(room);
    }
    hideVeil(_render);
    return;
  }

  // 待機中
  matchmakingQueueId = queueId;
  unsubscribeMatchmaking = subscribeToMatchmaking(queueId, async (room) => {
    // マッチ成功
    cleanupOnlineSubscriptions();
    currentRoom = room;
    // キューに登録した側はホスト
    await startOnlineGameAsHost(room, { ...TITLE_OPT });
    hideVeil(_render);
  });

  el.innerHTML = `<div class="inner matchmaking">
    <div class="title-sm">対戦相手を探しています</div>
    <div class="waiting-indicator">
      <div class="spinner"></div>
      <span>マッチング中...</span>
    </div>
    <p>同じオプションの相手が見つかるまでお待ちください。</p>
    <button class="back" onclick="window._cancelMatchmaking()">キャンセル</button>
  </div>`;
}

/**
 * ルーム作成をキャンセル
 */
export function cancelRoom() {
  cleanupOnlineSubscriptions();
  // TODO: ルームを削除
  showOnlineMenu();
}

/**
 * マッチングをキャンセル
 */
export async function cancelMatchmakingAction() {
  if (matchmakingQueueId) {
    await cancelMatchmaking(matchmakingQueueId);
  }
  cleanupOnlineSubscriptions();
  showOnlineMenu();
}

/**
 * オンライン購読をクリーンアップ
 */
function cleanupOnlineSubscriptions() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  if (unsubscribeMatchmaking) {
    unsubscribeMatchmaking();
    unsubscribeMatchmaking = null;
  }
  matchmakingQueueId = null;
  currentRoom = null;
}

/**
 * オンライン待機画面を表示
 * @param {string} message - 表示メッセージ
 * @param {string} status - 状態 ('normal' | 'warning' | 'error')
 */
export function showOnlineWaiting(message, status = 'normal') {
  const el = document.getElementById('veil');
  el.style.display = 'flex';
  el.classList.remove('menu-screen');
  document.body.style.overflow = 'hidden';

  const statusClass = status === 'error' ? 'error' : status === 'warning' ? 'warning' : '';

  el.innerHTML = `<div class="inner waiting">
    <div class="waiting-indicator ${statusClass}">
      <div class="spinner"></div>
      <span>${message}</span>
    </div>
    <div id="timeout-display" class="timeout-display"></div>
    <button class="quit" onclick="window._quitGame()">やめる</button>
  </div>`;

  // 待機中もエモートを使えるようにする
  renderEmoteBar();
}

/**
 * タイムアウト表示を更新
 */
export function updateTimeoutDisplay(seconds) {
  const el = document.getElementById('timeout-display');
  if (el) {
    el.textContent = `残り ${seconds} 秒`;
    if (seconds <= 10) {
      el.classList.add('urgent');
    }
  }
}

/**
 * ホットシート画面を表示（2人対戦時の手番交代）
 */
export function showVeilIfNeeded(render) {
  const el = document.getElementById('veil');
  const w = who();
  if (G.mode === 'cpu' || G.mode === 'online' || w === 0) { hideVeil(render); return; }

  let prev = null;
  for (let i = G.idx - 1; i >= 0; i--) {
    if (G.sched[i].who !== 0) { prev = G.sched[i].who; break; }
  }
  if (w === prev) { hideVeil(render); return; }

  G.handoffs++;
  el.className = 'veil';
  el.classList.remove('title-screen');
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 0);

  el.innerHTML = `<div class="inner">
    <div class="count">受け渡し ${G.handoffs} / ${G.totalHandoffs}</div>
    <div class="to p${w}">${w}P</div>
    <p>${w}P に端末を渡してください。<br>渡すまで画面を見ないこと。</p>
    <button class="primary" onclick="window._hideVeil()">${w}P です。準備できました</button>
  </div>`;
}

/**
 * ベールを非表示
 */
export function hideVeil(render) {
  const el = document.getElementById('veil');
  el.style.display = 'none';
  el.classList.remove('title-screen', 'menu-screen');
  document.body.style.overflow = '';
  document.body.classList.add('game-active');
  document.querySelector('.wrap').style.display = '';
  if (render) render();
}
