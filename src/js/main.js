/**
 * メインエントリーポイント
 *
 * 全てのモジュールを統合し、グローバル関数を登録
 */

// 状態
import { G, me, opp, cur, who, houseName, log, madmanOf, mediumOf } from './state.js';
import { TICKS, ADJ, edgeKey, ROLE_LABEL, HLABEL, getConfig } from './constants.js';

// ゲームロジック
import { newGame, advance, startDay, finishDay, confirmNight, nextFromMorning, setFlowCallbacks } from './game/flow.js';
import { runCPU } from './game/cpu.js';
import { overlapSoFar, SPOIL } from './game/resolve.js';

// UI
import { render, toggleSwap, setRenderCallbacks, toggleEmoteBar } from './ui/render.js';
import { renderPanel, setPanelCallbacks } from './ui/panel.js';
import {
  showTitle, selectMode, showOptions, toggleOpt, pick, startGame,
  showVeilIfNeeded, hideVeil, setVeilCallbacks,
  showOnlineMenu, showOnlineOptions, toggleOptOnline, showCreateRoom, showJoinRoom, doJoinRoom,
  startMatchmaking, cancelRoom, cancelMatchmakingAction, showOnlineWaiting,
  restartGame
} from './ui/veil.js';
import { toggleLedger, openLedger, closeLedger, initLedgerSwipe } from './ui/ledger.js';

// オンライン
import { submitOnlineAction, setOnlineFlowCallbacks, advanceOnline, surrenderOnline, endOnlineGame, sendEmote, canSendEmote, markPlayerLeft } from './online/onlineFlow.js';
import { setPlayerName } from './online/supabase.js';
import { updateGameState } from './online/sync.js';

// ========== エモート表示 ==========

/**
 * エモートのトースト通知を表示
 */
function showEmoteToast(emote) {
  const toast = document.createElement('div');
  toast.className = 'emote-toast';
  toast.textContent = `相手: ${emote}`;
  document.body.appendChild(toast);

  // 3秒後にフェードアウトして削除
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== UIイベントハンドラ ==========

/**
 * 村人を1人ずつ配置
 */
function placeNext(h) {
  const v = me();
  v.people[v.placeIdx].house = h;
  v.placeIdx++;

  if (v.placeIdx >= getConfig().VILLAGERS) {
    if (G.mode === 'online') {
      // オンラインモード：配置完了をDBに送信して相手を待つ
      const houses = v.people.map(p => p.house);
      submitOnlineAction({
        playerId: G.myPlayerId,
        phase: 'place',
        data: { houses }
      });
    } else {
      advance();
    }
  } else {
    render();
  }
}

/**
 * 落とし穴を配置
 */
function placePit(key) {
  const v = me();
  const config = getConfig();
  if (!v.pitEdge) v.pitEdge = [];

  // 既に選択済みならトグルで解除
  const idx = v.pitEdge.indexOf(key);
  if (idx >= 0) {
    v.pitEdge.splice(idx, 1);
  } else if (v.pitEdge.length < config.PITS) {
    v.pitEdge.push(key);
  }
  render();
}

/**
 * 落とし穴確定
 */
function confirmPit() {
  if (G.mode === 'online') {
    const v = me();
    submitOnlineAction({
      playerId: G.myPlayerId,
      phase: 'pit',
      data: { edges: v.pitEdge }
    });
  } else {
    advance();
  }
}

/**
 * 探索者を選択
 */
function chooseExplorer(id) {
  const v = me();
  v.explorer = id;
  v.mediumResult = null;

  if (G.mode === 'online') {
    submitOnlineAction({
      playerId: G.myPlayerId,
      phase: 'explorer',
      data: { personId: id }
    });
  } else {
    advance();
  }
}

/**
 * 経路を1つずつ選択
 */
function pickRoute(h) {
  const v = me(), o = opp();
  const prev = v.route.length ? v.route[v.route.length - 1] : null;
  v.route.push(h);
  v.notice = null;

  // 落とし穴チェック
  const pitKey = prev !== null && prev !== h ? edgeKey(prev, h) : null;
  if (pitKey && o.pitEdge && o.pitEdge.includes(pitKey)) {
    const had = [];
    if (v.permit) had.push('護衛届');
    if (v.madClaw) had.push('狂人の爪');
    if (v.mediumFound) had.push('霊媒の札');
    if (!o.pitSeen) o.pitSeen = [];
    if (!o.pitSeen.includes(pitKey)) o.pitSeen.push(pitKey);
    if (had.length) {
      v.permit = false; v.permitFound = null;
      v.madClaw = false; v.madClawFound = null;
      v.mediumFound = false;
      v.notice = '<b>落とし穴に落ちた。</b>' + houseName(o, prev) + 'から' + houseName(o, h) + 'へ抜ける道に仕掛けてあり、' + had.join('・') + 'を落としてしまった。';
      log(v, houseName(o, prev) + '〜' + houseName(o, h) + 'の道の落とし穴に落ち、' + had.join('・') + 'を落とした。', 'kill');
    } else {
      v.notice = '<b>落とし穴があった。</b>' + houseName(o, prev) + 'から' + houseName(o, h) + 'へ抜ける道に仕掛けてあった。幸い、まだ何も持っていなかった。';
      log(v, houseName(o, prev) + '〜' + houseName(o, h) + 'の道に落とし穴があった（持ち物なし）。');
    }
  }

  // アイテム取得
  if (h === G.permitHouse[v.id] && !v.gotPermit) {
    v.permit = true; v.permitFound = h; v.gotPermit = true;
    v.notice = `<b>護衛届を手に入れた。</b>${houseName(opp(), h)}のタンスの中にあった。今夜、村人1人を守れる。`;
    log(v, `${houseName(opp(), h)}で護衛届を手に入れた。`);
  }
  else if (h === G.madHouse[v.id] && !v.gotClaw) {
    v.madClaw = true; v.madClawFound = h; v.gotClaw = true;
    const mad = madmanOf(v);
    const usable = mad && mad.alive && v.explorer !== mad.id;
    const madReason = !mad ? '' : (!mad.alive ? '狂人はすでにいない' : (v.explorer === mad.id ? '狂人は探索に出て眠っている' : ''));
    v.notice = '<b>狂人の爪を手に入れた。</b>' + houseName(opp(), h) + 'にあった。' +
      (usable ? '今夜、狂人に爪を研がせて相手の探索者を惑わせられる。'
        : 'だが今夜、' + madReason + '。爪は鳴らせない。');
    if (usable) log(v, houseName(opp(), h) + 'で狂人の爪を手に入れた。');
    else log(v, houseName(opp(), h) + 'で狂人の爪を取ったが、' + madReason + 'ため使えなかった。');
  }
  else if (h === G.mediumHouse[v.id] && !v.gotMedium) {
    v.mediumFound = true; v.gotMedium = true;
    const med = mediumOf(v);
    const usable = med && med.alive && v.explorer !== med.id;
    const medReason = !med ? '' : (!med.alive ? '霊媒師はすでにいない' : (v.explorer === med.id ? '霊媒師は探索に出て眠っている' : ''));
    v.notice = '<b>霊媒の札を手に入れた。</b>' + houseName(opp(), h) + 'にあった。' +
      (usable ? '今夜倒した相手がいれば、その正体が分かる。'
        : 'だが今夜、' + medReason + '。札は働かない。');
    if (usable) log(v, houseName(opp(), h) + 'で霊媒の札を手に入れた。');
    else log(v, houseName(opp(), h) + 'で霊媒の札を取ったが、' + medReason + 'ため使えなかった。');
  }

  if (v.route.length >= TICKS) v.routeDone = true;
  render();
}

/**
 * 経路確定
 */
function confirmRoute() {
  const v = me();
  v.routeDone = false;

  if (G.mode === 'online') {
    submitOnlineAction({
      playerId: G.myPlayerId,
      phase: 'route',
      data: { route: v.route, explorer: v.explorer }
    });
  } else {
    advance();
  }
}

/**
 * 襲撃対象を選択
 */
function pickAttackHouse(h) {
  const v = me(), o = opp();
  const p = o.people.find(x => x.house === h);
  if (!p || !p.alive) return;
  v.attackTarget = p.id;
  render();
}

/**
 * 爪研ぎ開始
 */
function startSharpen() {
  me().sharpenStart = G.tickIdx + 1;
  render();
}

/**
 * 狂人の爪研ぎ開始
 */
function startSharpenMad() {
  me().madStart = G.tickIdx + 1;
  render();
}

/**
 * ティック進行
 */
function advanceTick() {
  try {
    G.tickIdx++;
    const v = me();
    if (!v) {
      console.error('advanceTick: me() returned undefined');
      return;
    }
    const o = opp();
    if (!o || !o.route) {
      console.error('advanceTick: opp() or opp().route undefined', { o, route: o?.route });
      return;
    }
    if (overlapSoFar(v, o.route) >= SPOIL) v.spoiled = true;
    if (G.tickIdx >= TICKS) v.tickDone = true;
    render();
  } catch (e) {
    console.error('advanceTick error:', e);
  }
}

/**
 * 昼を終える（オンライン対応ラッパー）
 */
function finishDayOnline() {
  const v = me();
  v.tickDone = false;

  if (G.mode === 'online') {
    submitOnlineAction({
      playerId: G.myPlayerId,
      phase: 'ticks',
      data: {
        sharpenStart: v.sharpenStart,
        madStart: v.madStart
      }
    });
  } else {
    finishDay();
  }
}

/**
 * 夜を終える（オンライン対応ラッパー）
 */
function confirmNightOnline() {
  const v = me();

  if (G.mode === 'online') {
    submitOnlineAction({
      playerId: G.myPlayerId,
      phase: 'night',
      data: {
        attack: v.attackTarget,
        protect: v.protectTarget
      }
    });
  } else {
    confirmNight();
  }
}

/**
 * 朝の結果を確認して次の日へ（オンライン対応ラッパー）
 */
async function nextFromMorningOnline() {
  if (G.mode === 'online') {
    // オンラインモード：ローカルでidxを進め、DBにも保存
    const config = getConfig();
    if (G.day >= config.DAYS) {
      // 最終日 → 決着
      G.idx++;
      advanceOnline();
    } else {
      // 次の日へ
      G.idx++;
      const c = G.sched[G.idx];
      if (c && c.day) G.day = c.day;

      // DBに保存（トリガーが正しいidxを使えるように）
      const roomId = G.roomId;
      await updateGameState(roomId, {
        game_data: {
          ...G,
          idx: G.idx,
          day: G.day
        },
        current_phase: c ? c.ph : 'explorer',
        current_day: G.day,
        current_player: c ? c.who : 1
      });

      render();
    }
  } else {
    nextFromMorning();
  }
}

// ========== コールバック設定 ==========

// flow.jsのコールバック
setFlowCallbacks({
  render,
  hideVeil: () => hideVeil(render),
  showVeilIfNeeded: () => showVeilIfNeeded(render),
  runCPU
});

// veil.jsのコールバック
setVeilCallbacks({
  newGame,
  render
});

// オンラインフローのコールバック
setOnlineFlowCallbacks({
  render,
  hideVeil: () => hideVeil(render),
  showOnlineWaiting,
  showTitle,
  showEmoteToast
});

// render.jsのコールバック
setRenderCallbacks({
  placeNext,
  placePit,
  pickRoute,
  pickAttackHouse
});

// panel.jsのコールバック
setPanelCallbacks({
  render,
  chooseExplorer,
  confirmPit,
  confirmRoute,
  startSharpen,
  startSharpenMad,
  advanceTick,
  finishDay: finishDayOnline,
  confirmNight: confirmNightOnline,
  nextFromMorning: nextFromMorningOnline,
  showTitle
});

// ========== グローバル関数登録 ==========
// HTMLのonclick属性から呼び出すため

window._toggleOpt = toggleOpt;
window._pick = pick;
window._selectMode = selectMode;
window._showOptions = showOptions;
window._startGame = startGame;
window._hideVeil = () => hideVeil(render);
window._toggleSwap = toggleSwap;

// オンライン用
window._showOnlineMenu = showOnlineMenu;
window._showOnlineOptions = showOnlineOptions;
window._savePlayerName = (name) => setPlayerName(name.trim() || '名無し');
window._toggleOptOnline = toggleOptOnline;
window._showCreateRoom = showCreateRoom;
window._showJoinRoom = showJoinRoom;
window._joinRoom = doJoinRoom;
window._startMatchmaking = startMatchmaking;
window._cancelRoom = cancelRoom;
window._cancelMatchmaking = cancelMatchmakingAction;
window._confirmPit = confirmPit;
window._chooseExplorer = chooseExplorer;
window._confirmRoute = confirmRoute;
window._startSharpen = startSharpen;
window._startSharpenMad = startSharpenMad;
window._advanceTick = advanceTick;
window._finishDay = finishDayOnline;
window._confirmNight = confirmNightOnline;
window._nextFromMorning = nextFromMorningOnline;
window._showTitle = showTitle;
window._restartGame = restartGame;
window._quitGame = async () => {
  const msg = G.mode === 'online'
    ? '降参して終了しますか？（相手の勝ちになります）'
    : 'ゲームを終了しますか？';

  if (confirm(msg)) {
    if (G.mode === 'online') {
      await surrenderOnline();
    }
    endOnlineGame();
    showTitle();
  }
};
window._backToTitle = async () => {
  // 決着後にタイトルに戻る（降参ではない）
  if (G.mode === 'online') {
    await markPlayerLeft();
  }
  endOnlineGame();
  showTitle();
};
window._sendEmote = async (emote) => {
  if (G.mode !== 'online') return;
  const success = await sendEmote(emote);
  if (success) {
    // 送信成功時、一時的にボタンを無効化表示（CSSで対応）
    render();
  }
};
window._toggleEmoteBar = toggleEmoteBar;
window._render = render;

// 覚え書き用
window.toggleLedger = toggleLedger;
window.closeLedger = closeLedger;

// Gをグローバルに公開（パネルのonclick用）
window.G = G;

// ========== 初期化 ==========

initLedgerSwipe();
showTitle();
