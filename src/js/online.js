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
      // 相手がアクションを実行した
      const newGameData = payload.new.game_data;

      // 自分のターンではない場合のみ更新
      if (payload.new.waiting_for_player !== currentPlayerId) {
        window.G = newGameData;
        window.render();
      }
    }
  });
}

/**
 * 自分のアクションをDBに反映
 */
export async function syncGameState() {
  if (!currentRoomId) return;

  // 現在のプレイヤーを確認
  const currentTurn = window.G.sched[window.G.idx];
  const waitingFor = currentTurn.who === 0 ? (currentPlayerId === 1 ? 2 : 1) : currentTurn.who;

  await updateGameState(currentRoomId, {
    game_data: window.G,
    current_player: currentTurn.who || currentPlayerId,
    current_phase: currentTurn.ph,
    current_day: currentTurn.day || null,
    waiting_for_player: waitingFor
  });
}

// window オブジェクトに関数を公開
window.onlineShowMenu = showOnlineMenu;
window.onlineShowCreateRoom = showCreateRoom;
window.onlineCreateRoom = executeCreateRoom;
window.onlineCancelRoom = cancelRoom;
window.onlineShowJoinRoom = showJoinRoom;
window.onlineJoinRoom = executeJoinRoom;
window.onlineSyncGameState = syncGameState;
window.getCurrentRoom = getCurrentRoom;

// 現在のルーム情報を取得する関数（他のモジュールから使用）
export function getCurrentRoom() {
  return {
    roomId: currentRoomId,
    roomCode: currentRoomCode,
    playerId: currentPlayerId
  };
}
