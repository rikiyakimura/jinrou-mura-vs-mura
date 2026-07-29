// オンライン対戦機能

import {
  createRoom,
  findRoomByCode,
  joinRoom,
  createGameState,
  updateGameState,
  getGameState,
  subscribeToGameState,
  subscribeToRoom,
  logPlayerAction
} from './supabase.js';

// グローバル変数
let currentRoomId = null;
let currentRoomCode = null;
let currentPlayerId = null; // 1=ホスト, 2=ゲスト
let gameStateSubscription = null;
let roomSubscription = null;
let isAdvancing = false; // 自分が現在advance中かを示すフラグ

/**
 * オンライン対戦のモード選択画面を表示
 */
export function showOnlineMenu() {
  const el = document.getElementById('veil');
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  el.innerHTML = `<div class="inner">
    <h1 class="title">オンライン対戦</h1>
    <p class="tagline">インターネット経由で友達と対戦</p>

    <div class="modebtns">
      <button class="primary big" onclick="window.onlineShowCreateRoom()">
        ルームを作成
        <span class="note">暗証番号を発行して友達を招待</span>
      </button>
      <button class="big" onclick="window.onlineShowJoinRoom()">
        ルームに参加
        <span class="note">暗証番号を入力して参加</span>
      </button>
      <button onclick="window.showTitle()">戻る</button>
    </div>
  </div>`;
}

/**
 * ルーム作成画面を表示
 */
export function showCreateRoom() {
  const el = document.getElementById('veil');
  el.innerHTML = `<div class="inner">
    <h1 class="title">ルームを作成</h1>
    <p>あなたの名前を入力してください</p>

    <div class="opts">
      <input type="text" id="host-name-input" placeholder="プレイヤー名"
             style="width:100%;padding:12px;font-size:14px;border:1px solid var(--indigo-edge);
                    border-radius:3px;background:var(--indigo);color:var(--kinari);margin-bottom:20px;">
    </div>

    <div class="modebtns">
      <button class="primary big" onclick="window.onlineCreateRoom()">
        ルーム作成
      </button>
      <button onclick="window.onlineShowMenu()">戻る</button>
    </div>
  </div>`;

  // 入力フィールドにフォーカス
  setTimeout(() => {
    document.getElementById('host-name-input').focus();
  }, 100);
}

/**
 * ルーム作成を実行
 */
export async function executeCreateRoom() {
  const nameInput = document.getElementById('host-name-input');
  const playerName = nameInput.value.trim();

  if (!playerName) {
    alert('プレイヤー名を入力してください');
    return;
  }

  try {
    // ローディング表示
    const el = document.getElementById('veil');
    el.innerHTML = `<div class="inner">
      <p>ルームを作成中...</p>
    </div>`;

    // ゲームオプションを取得（タイトル画面で設定されたもの）
    const gameOptions = window.TITLE_OPT || { madmanDog: false, medium: false, pit: false };

    // ルーム作成
    const { room_id, room_code } = await createRoom(playerName, gameOptions);

    // グローバル変数に保存
    currentRoomId = room_id;
    currentRoomCode = room_code;
    currentPlayerId = 1; // ホスト

    // ルームの変更を監視（ゲストが参加したら通知）
    watchRoomForGuest(room_id);

    // 待機画面を表示
    showWaitingForGuest(room_code);

  } catch (error) {
    console.error('ルーム作成エラー:', error);
    alert('ルーム作成に失敗しました: ' + error.message);
    showCreateRoom();
  }
}

/**
 * ゲスト参加待機画面を表示
 */
function showWaitingForGuest(roomCode) {
  const el = document.getElementById('veil');
  el.innerHTML = `<div class="inner">
    <h1 class="title">ルーム作成完了</h1>
    <p class="lead">この暗証番号を友達に教えてください</p>

    <div style="font-family:var(--mono);font-size:48px;letter-spacing:0.2em;
                margin:20px 0;color:var(--kuchiba);font-weight:700;">
      ${roomCode}
    </div>

    <p>相手の参加を待っています...</p>

    <div class="modebtns">
      <button onclick="window.onlineCancelRoom()">キャンセル</button>
    </div>
  </div>`;
}

/**
 * ルームにゲストが参加するのを監視
 */
function watchRoomForGuest(roomId) {
  roomSubscription = subscribeToRoom(roomId, (payload) => {
    if (payload.eventType === 'UPDATE' && payload.new.guest_player_name) {
      // ゲストが参加した！
      console.log('ゲストが参加:', payload.new.guest_player_name);

      // サブスクリプション解除
      if (roomSubscription) {
        roomSubscription.unsubscribe();
        roomSubscription = null;
      }

      // ゲーム開始
      startOnlineGame(payload.new);
    }
  });
}

/**
 * ルームキャンセル
 */
export function cancelRoom() {
  if (roomSubscription) {
    roomSubscription.unsubscribe();
    roomSubscription = null;
  }

  currentRoomId = null;
  currentRoomCode = null;
  currentPlayerId = null;

  showOnlineMenu();
}

/**
 * ルーム参加画面を表示
 */
export function showJoinRoom() {
  const el = document.getElementById('veil');
  el.innerHTML = `<div class="inner">
    <h1 class="title">ルームに参加</h1>

    <div class="opts">
      <p style="margin-bottom:8px;">あなたの名前</p>
      <input type="text" id="guest-name-input" placeholder="プレイヤー名"
             style="width:100%;padding:12px;font-size:14px;border:1px solid var(--indigo-edge);
                    border-radius:3px;background:var(--indigo);color:var(--kinari);margin-bottom:20px;">

      <p style="margin-bottom:8px;">暗証番号（4桁）</p>
      <input type="text" id="room-code-input" placeholder="0000" maxlength="4"
             style="width:100%;padding:12px;font-size:24px;letter-spacing:0.2em;text-align:center;
                    border:1px solid var(--indigo-edge);border-radius:3px;
                    background:var(--indigo);color:var(--kinari);font-family:var(--mono);">
    </div>

    <div class="modebtns">
      <button class="primary big" onclick="window.onlineJoinRoom()">
        参加
      </button>
      <button onclick="window.onlineShowMenu()">戻る</button>
    </div>
  </div>`;

  // 入力フィールドにフォーカス
  setTimeout(() => {
    document.getElementById('guest-name-input').focus();
  }, 100);
}

/**
 * ルーム参加を実行
 */
export async function executeJoinRoom() {
  const nameInput = document.getElementById('guest-name-input');
  const codeInput = document.getElementById('room-code-input');

  const playerName = nameInput.value.trim();
  const roomCode = codeInput.value.trim();

  if (!playerName) {
    alert('プレイヤー名を入力してください');
    return;
  }

  if (roomCode.length !== 4 || !/^\d{4}$/.test(roomCode)) {
    alert('4桁の暗証番号を入力してください');
    return;
  }

  try {
    // ローディング表示
    const el = document.getElementById('veil');
    el.innerHTML = `<div class="inner">
      <p>ルームを検索中...</p>
    </div>`;

    // ルームを検索
    const room = await findRoomByCode(roomCode);

    if (!room) {
      alert('ルームが見つかりませんでした。\n暗証番号が正しいか確認してください。');
      showJoinRoom();
      return;
    }

    // ルームに参加
    const updatedRoom = await joinRoom(room.id, playerName);

    // グローバル変数に保存
    currentRoomId = updatedRoom.id;
    currentRoomCode = updatedRoom.room_code;
    currentPlayerId = 2; // ゲスト

    // ゲーム開始
    startOnlineGame(updatedRoom);

  } catch (error) {
    console.error('ルーム参加エラー:', error);
    alert('ルーム参加に失敗しました: ' + error.message);
    showJoinRoom();
  }
}

/**
 * オンラインゲームを開始
 */
async function startOnlineGame(room) {
  console.log('オンラインゲーム開始:', room);

  // ゲーム開始メッセージを表示
  const el = document.getElementById('veil');
  el.innerHTML = `<div class="inner">
    <h1 class="title">対戦相手が見つかりました！</h1>
    <p class="lead">${room.host_player_name} vs ${room.guest_player_name}</p>
    <p>ゲームを開始します...</p>
  </div>`;

  // ホストの場合、ゲームを初期化してDBに保存
  if (currentPlayerId === 1) {
    // main.jsのnewGame()を呼び出してゲームを初期化
    // ただし、モードは'online'にする
    window.newGame('online', room.game_options);

    // ゲーム状態をDBに保存
    const gameData = window.G; // グローバルなゲーム状態
    await createGameState(
      currentRoomId,
      gameData,
      1, // プレイヤー1から開始
      gameData.sched[gameData.idx].ph
    );

    // ゲーム状態の監視を開始
    subscribeToGameUpdates();

    // ベールを隠してゲーム画面を表示
    setTimeout(() => {
      document.getElementById('veil').style.display = 'none';
      document.body.style.overflow = '';
    }, 2000);
  }
  // ゲストの場合、DBからゲーム状態を取得
  else {
    // ゲスト側：ホストがゲーム状態を作成するまで待つ
    let retries = 0;
    const maxRetries = 20;

    const checkGameState = async () => {
      const gameState = await getGameState(currentRoomId);

      if (gameState) {
        // ゲーム状態を取得できた
        window.G = gameState.game_data;

        // ゲーム状態の監視を開始
        subscribeToGameUpdates();

        // モードライン更新
        const extra = [];
        if (gameState.game_data.opt.madmanDog) extra.push('狂人＋犬飼い');
        if (gameState.game_data.opt.medium) extra.push('霊媒師');
        document.getElementById('modeline').textContent =
          'オンライン対戦' + (extra.length ? '　／　' + extra.join('・') : '');

        // ベールを隠してゲーム画面を表示
        document.getElementById('veil').style.display = 'none';
        document.body.style.overflow = '';
        window.render();
      } else if (retries < maxRetries) {
        // まだゲーム状態がない場合、500ms後に再試行
        retries++;
        setTimeout(checkGameState, 500);
      } else {
        alert('ゲームの開始に失敗しました');
        showOnlineMenu();
      }
    };

    checkGameState();
  }
}

/**
 * ゲーム状態の更新を監視
 */
function subscribeToGameUpdates() {
  gameStateSubscription = subscribeToGameState(currentRoomId, (payload) => {
    if (payload.eventType === 'UPDATE') {
      const newState = payload.new;

      // 同時入力モードの場合
      if (newState.simultaneous_mode) {
        const otherPlayerId = currentPlayerId === 1 ? 2 : 1;
        const otherReady = newState[`player${otherPlayerId}_ready`];
        const myReady = newState[`player${currentPlayerId}_ready`];

        // 自分がadvance中の場合は、subscriptionの処理をスキップ
        if (isAdvancing) {
          return;
        }

        // 相手がreadyになった = 相手のアクションデータを取り込む
        if (otherReady && !myReady) {
          // 相手の村データだけ更新
          window.G.V[otherPlayerId] = newState.game_data.V[otherPlayerId];
        }

        // ready flagsがリセットされた = 相手がadvance完了した
        // この時点でgame_dataは最新の状態になっている
        if (!otherReady && !myReady) {
          window.G = newState.game_data;
          window.hideVeil();
          window.sync();
        }
      }
      // 順次実行モードの場合（既存ロジック）
      else {
        // waiting_for_player が null = 公開フェーズ（morningなど）、両方がアクセス可能
        if (newState.waiting_for_player === null) {
          window.G = newState.game_data;
          window.hideVeil();
          window.render();
        } else if (newState.waiting_for_player === currentPlayerId) {
          window.G = newState.game_data;
          window.hideVeil();
          window.render();
        } else {
          window.showVeilIfNeeded();
        }
      }
    }
  });
}

/**
 * フェーズが同時入力可能かを判定
 * オンラインモードでは全フェーズで同時入力可能（end以外）
 */
function isSimultaneousPhase(phase) {
  // end（終了）以外は全て同時入力
  return phase !== 'end';
}

/**
 * 自分のアクションをDBに反映
 */
export async function syncGameState() {
  if (!currentRoomId) return;

  const currentTurn = window.G.sched[window.G.idx];

  // 同時入力フェーズの場合: データマージで競合を防止
  if (isSimultaneousPhase(currentTurn.ph)) {
    // 最新のゲーム状態を取得
    const latestState = await getGameState(currentRoomId);
    const latestGameData = latestState.game_data;

    // 相手の村データは最新を維持、自分の村データだけ更新
    const otherPlayerId = currentPlayerId === 1 ? 2 : 1;
    const mergedGameData = {
      ...latestGameData,
      V: {
        ...latestGameData.V,
        [currentPlayerId]: window.G.V[currentPlayerId]
      }
    };

    await updateGameState(currentRoomId, {
      game_data: mergedGameData,
      simultaneous_mode: true
    });
  }
  // 順次実行フェーズ（既存ロジック）
  else {
    // who=0の場合はnull、それ以外はwhoを設定
    const waitingFor = currentTurn.who === 0 ? null : currentTurn.who;

    await updateGameState(currentRoomId, {
      game_data: window.G,
      current_player: currentTurn.who || currentPlayerId,
      current_phase: currentTurn.ph,
      current_day: currentTurn.day || null,
      waiting_for_player: waitingFor,
      simultaneous_mode: false,
      player1_ready: false,
      player2_ready: false
    });
  }
}

/**
 * 相手の入力を待っている画面を表示
 */
function showWaitingForOpponent() {
  const el = document.getElementById('veil');
  el.className = 'veil';
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  el.innerHTML = `<div class="inner">
    <p class="lead">入力完了</p>
    <p>相手の入力を待っています...</p>
  </div>`;
}

/**
 * オンライン対戦用のadvance() - 同時入力に対応
 */
export async function onlineAdvance() {
  isAdvancing = true; // advance処理を開始
  const currentPhase = window.G.sched[window.G.idx];

  // 同時入力フェーズの場合
  if (isSimultaneousPhase(currentPhase.ph)) {
    // 自分が完了したことをマーク
    const readyField = `player${currentPlayerId}_ready`;
    await updateGameState(currentRoomId, {
      [readyField]: true,
      game_data: window.G,
      simultaneous_mode: true
    });

    // 相手も完了しているかチェック
    const gameState = await getGameState(currentRoomId);
    const otherPlayerId = currentPlayerId === 1 ? 2 : 1;
    const otherReady = gameState[`player${otherPlayerId}_ready`];

    if (otherReady) {
      // 最新のゲーム状態を取得して、相手のアクションを反映
      const latestState = await getGameState(currentRoomId);
      const latestGameData = latestState.game_data;
      // 自分のアクションは最新、相手のアクションはDBから取得
      window.G = {
        ...latestGameData,
        V: {
          ...latestGameData.V,
          [currentPlayerId]: window.G.V[currentPlayerId]
        }
      };

      // 両者完了 → 同じフェーズの最後を探す
      // フェーズが連続していない場合もあるので、全スケジュールから同じphを探す
      let lastIdxOfPhase = window.G.idx;
      for (let i = window.G.idx + 1; i < window.G.sched.length; i++) {
        if (window.G.sched[i].ph === currentPhase.ph) {
          lastIdxOfPhase = i;
        }
      }
      window.G.idx = lastIdxOfPhase;

      // この時点でG.idxは同じphaseの最後を指している
      const lastPhaseEntry = window.G.sched[window.G.idx];

      // resolveDay/resolveNightの処理
      if (lastPhaseEntry.ph === 'ticks' && lastPhaseEntry.who === 2) {
        window.resolveDay();
        if (window.G.done) {
          isAdvancing = false;
          return;
        }
      }
      if (lastPhaseEntry.ph === 'night' && lastPhaseEntry.who === 1) {
        window.resolveNight();
        if (window.G.done) {
          isAdvancing = false;
          return;
        }
        const DAYS = 3;
        if (window.G.day < DAYS) window.startDay();
      }

      // 次のフェーズへ進める
      window.G.idx++;
      const c = window.G.sched[window.G.idx];
      if (c.day) window.G.day = c.day;
      if (c.ph === 'ticks') window.G.tickIdx = 0;

      // 完了フラグをリセット
      // who=0の場合はnull、それ以外はwhoを設定
      await updateGameState(currentRoomId, {
        game_data: window.G,
        current_player: c.who || currentPlayerId,
        current_phase: c.ph,
        waiting_for_player: c.who === 0 ? null : c.who,
        player1_ready: false,
        player2_ready: false,
        simultaneous_mode: isSimultaneousPhase(c.ph)
      });

      window.sync();
      isAdvancing = false; // advance処理完了
    } else {
      // 相手待ち
      showWaitingForOpponent();
      isAdvancing = false; // advance処理完了
    }
  }
  // 順次実行フェーズ（既存ロジック）
  else {
    window.G.idx++;
    const c = window.G.sched[window.G.idx];
    if (c.day) window.G.day = c.day;
    if (c.ph === 'ticks') window.G.tickIdx = 0;
    window.sync();

    await syncGameState();
    isAdvancing = false; // advance処理完了
  }
}

// window オブジェクトに関数を公開
window.onlineShowMenu = showOnlineMenu;
window.onlineShowCreateRoom = showCreateRoom;
window.onlineCreateRoom = executeCreateRoom;
window.onlineCancelRoom = cancelRoom;
window.onlineShowJoinRoom = showJoinRoom;
window.onlineJoinRoom = executeJoinRoom;
window.onlineSyncGameState = syncGameState;
window.onlineAdvance = onlineAdvance;
window.isSimultaneousPhase = isSimultaneousPhase;
window.getCurrentRoom = getCurrentRoom;

// 現在のルーム情報を取得する関数（他のモジュールから使用）
export function getCurrentRoom() {
  return {
    roomId: currentRoomId,
    roomCode: currentRoomCode,
    playerId: currentPlayerId
  };
}
