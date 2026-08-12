/**
 * メイン描画
 */

import { G, cur, who, me, opp, wolfOf, guardOf, alive, vname, freeHouse, personAt, guardAway } from '../state.js';
import { TICKS, getPreset, getConfig, edgeKey } from '../constants.js';
import { other } from '../utils.js';
import { drawMap } from './map.js';
import { renderLedger } from './ledger.js';
import { renderPanel } from './panel.js';
import { canAttack, routeValid } from '../game/resolve.js';
import { playTrack, getTrackForPhase } from '../audio.js';
import { showStatsPopup } from './statsPopup.js';

// 外部関数
let _placeNext = null;
let _placePit = null;
let _pickRoute = null;
let _pickAttackHouse = null;

// エモート一覧
const EMOTES = ['👍', '😊', '🤔', '⏳', '🙏', '😅', '❤️', '💀', '😏', '😜', '🤭', '👋', '😤', '👀', '🔥'];

// エモートバーの開閉状態
let emoteBarOpen = false;

// 落とし穴エフェクト状態（一度だけトリガー）
let pitFallTrigger = false;
let oppPitFallTrigger = false;
let lastCheckedTickIdx = -1;

/**
 * 落とし穴エフェクトをトリガー（自分）- 一度だけ
 */
export function triggerPitFallEffect() {
  pitFallTrigger = true;
}

/**
 * 相手の落とし穴エフェクトをトリガー - 一度だけ
 */
function triggerOppPitFallEffect() {
  oppPitFallTrigger = true;
}

export function setRenderCallbacks(callbacks) {
  _placeNext = callbacks.placeNext;
  _placePit = callbacks.placePit;
  _pickRoute = callbacks.pickRoute;
  _pickAttackHouse = callbacks.pickAttackHouse;
}

const isNarrow = () => !!(window.matchMedia && window.matchMedia('(max-width:820px)').matches);
const mainSide = ph => (ph === 'route' || ph === 'night') ? 'opp' : 'own';

export function toggleSwap() {
  G.swap = !G.swap;
  render();
}

function applyStage(c, pub) {
  const stage = document.getElementById('stage');
  const bm = document.getElementById('board-mine'), bf = document.getElementById('board-foe');
  const flip = document.getElementById('stageflip');
  stage.className = 'stage';
  bm.className = 'board';
  bf.className = 'board';
  flip.innerHTML = '';

  if (pub) {
    stage.classList.add('equal');
    bm.classList.add('is-main');
    bf.classList.add('is-main');
    return;
  }
  if (c.ph === 'place') {
    stage.classList.add('solo');
    bm.classList.add('is-main');
    bf.classList.add('is-hidden');
    return;
  }
  let side = mainSide(c.ph);
  if (G.swap) side = (side === 'own') ? 'opp' : 'own';
  const ownMain = (side === 'own');
  bm.classList.add(ownMain ? 'is-main' : 'is-sub');
  bf.classList.add(ownMain ? 'is-sub' : 'is-main');
  if (isNarrow()) {
    const sub = ownMain ? bf : bm;
    sub.classList.remove('is-sub');
    sub.classList.add('is-hidden');
    stage.classList.add('solo');
  }
  flip.innerHTML = `<button class="flip" onclick="window._toggleSwap()">` +
    (isNarrow() ? (ownMain ? '相手の村を見る' : '自分の村を見る') : '大きく映す村を入れ替える') + ` ⇄</button>`;
}

/**
 * 画面全体を描画
 */
export function render() {
  if (!G) return;
  const c = cur(), w = who();
  if (G._shown !== G.idx) {
    G.swap = false;
    G._shown = G.idx;
    lastCheckedTickIdx = -1; // 新しいフェーズでリセット
    if (document.body.classList) document.body.classList.remove('ledger-open');
  }
  const pub = (w === 0), revealAll = (c.ph === 'end');
  const myId = G.myPlayerId || 1;
  const oppId = myId === 1 ? 2 : 1;
  const myName = G.myPlayerName || '自分';
  const oppName = G.opponentName || '相手';
  // 結果発表時は endView で切り替え可能
  const M = pub ? G.V[G.endView] : me();
  const F = pub ? G.V[other(G.endView)] : opp();

  // 地図タイトル
  const mineTitle = pub
    ? (G.mode === 'online' ? `${myName}の村の地図` : `${vname(M)}の地図`)
    : (G.mode === 'online' ? `${myName}の村の地図` : '自分の村の地図');
  const foeTitle = pub
    ? (G.mode === 'online' ? `${oppName}の村の地図` : `${vname(F)}の地図`)
    : (G.mode === 'online' ? `${oppName}の村の地図` : '相手の村の地図');
  document.getElementById('t-mine').textContent = mineTitle;
  document.getElementById('t-foe').textContent = foeTitle;
  const ledgerOwner = G.mode === 'online' ? (M.id === myId ? myName : oppName) + 'の村' : vname(M);
  document.getElementById('ledger-title').textContent = pub ? `覚え書き（${ledgerOwner}）` : '覚え書き';

  const st = document.getElementById('status');
  // アイテム取得行を構築（非pub時のみ）
  let itemLine = '';
  if (!pub) {
    const items = [];
    items.push(`<span class="${M.permit ? 'on' : ''}"><img src="/item/goeitodoke.webp" class="item-icon-sm">護衛届 ${M.permit ? '取得' : '—'}</span>`);
    if (G.opt && G.opt.madmanDog) {
      items.push(`<span class="${M.madClaw ? 'on' : ''}"><img src="/item/kyoujinnotume.webp" class="item-icon-sm">狂人の爪 ${M.madClaw ? '取得' : '—'}</span>`);
    }
    if (G.opt && G.opt.medium) {
      items.push(`<span class="${M.mediumFound ? 'on' : ''}"><img src="/item/reibainohuda.webp" class="item-icon-sm">霊媒の札 ${M.mediumFound ? '取得' : '—'}</span>`);
    }
    itemLine = `<div class="status-items">${items.join('')}</div>`;
  }
  st.innerHTML = `<span><b>${G.day}</b>日目 / ${getConfig().DAYS}</span>` +
    (G.mode === 'cpu'
      ? `<span>自村 <b>${alive(G.V[1]).length}</b>人</span><span>敵村 <b>${alive(G.V[2]).length}</b>人</span>`
      : (G.mode === 'online'
        ? `<span><button class="player-name-btn" data-user-id="${G.myUserId || ''}" data-name="${myName}">${myName}</button> <b>${alive(G.V[myId]).length}</b>人</span><span><button class="player-name-btn" data-user-id="${G.opponentUserId || ''}" data-name="${oppName}">${oppName}</button> <b>${alive(G.V[oppId]).length}</b>人</span>`
        : `<span>1P <b>${alive(G.V[1]).length}</b>人</span><span>2P <b>${alive(G.V[2]).length}</b>人</span>`)) +
    (pub
      ? `<span class="turnbadge pub">${G.mode === 'pvp' ? '1P・2P とも観覧可' : '結果'}</span>`
      : (M.explorer !== null && guardAway(M) ? `<span style="color:var(--akane-glow)">護衛は探索中</span>` : '') +
      `<span>狼餓死まで <b>${3 - (M.hungryStreak || 0)}</b>日</span>` +
      (G.mode === 'cpu' ? '' : (G.mode === 'online' ? '' : `<span class="turnbadge p${w}">${w}P の手番</span>`)) +
      itemLine);

  // 名前ボタンにクリックイベントを設定
  st.querySelectorAll('.player-name-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      const name = btn.dataset.name;
      console.log('Name button clicked:', { name, userId, myUserId: G.myUserId, oppUserId: G.opponentUserId });
      if (userId) showStatsPopup(userId, name);
    });
  });

  const wl = wolfOf(M);
  const sharpH = (!pub && M.sharpenStart !== null && wl.alive) ? wl.house : null;
  const mineTokens = [], foeTokens = [];
  let minePortrait = null, foePortrait = null;
  if (!pub) {
    if (c.ph === 'route' && M.route.length) {
      // 経路選択中: 相手の村に自分の探索者を表示
      const shouldTriggerPitFall = pitFallTrigger;
      pitFallTrigger = false; // 一度だけ
      foePortrait = {
        house: M.route[M.route.length - 1],
        person: M.people[M.explorer],
        isMine: true,
        isPitFall: shouldTriggerPitFall
      };
    } else if (c.ph === 'ticks' && G.tickIdx > 0) {
      // ティック進行中: 両方の探索者を表示（夜は表示しない）
      if (M.route[G.tickIdx - 1]) {
        foePortrait = {
          house: M.route[G.tickIdx - 1],
          person: M.people[M.explorer],
          isMine: true
        };
      }
      // 相手が落とし穴に落ちたかチェック
      if (G.tickIdx > lastCheckedTickIdx && G.tickIdx >= 2) {
        const prevHouse = F.route[G.tickIdx - 2];
        const currHouse = F.route[G.tickIdx - 1];
        if (prevHouse && currHouse && prevHouse !== currHouse) {
          const pitKey = edgeKey(prevHouse, currHouse);
          if (M.pitEdge && M.pitEdge.includes(pitKey)) {
            triggerOppPitFallEffect();
          }
        }
        lastCheckedTickIdx = G.tickIdx;
      }
      if (F.route[G.tickIdx - 1]) {
        const shouldTriggerOppPitFall = oppPitFallTrigger;
        oppPitFallTrigger = false; // 一度だけ
        minePortrait = {
          house: F.route[G.tickIdx - 1],
          person: F.people[F.explorer],
          isMine: false,
          isPitFall: shouldTriggerOppPitFall
        };
      }
    }
  }

  let myRoutePath = [];
  if (!pub && (c.ph === 'route' || c.ph === 'ticks' || c.ph === 'night')) myRoutePath = M.route.slice();
  let foeRoutePath = [];
  if (!pub && (c.ph === 'ticks' || c.ph === 'night')) foeRoutePath = F.route.slice(0, G.tickIdx);

  const pitPicking = (!pub && c.ph === 'pit');

  // 9軒モード・夜モード・夜明けモード・負けモードのクラス設定
  const isLarge = getPreset() === 'large';
  const isNight = c.ph === 'night';
  const isDawn = c.ph === 'morning';
  const isEnd = c.ph === 'end' || c.ph === 'unknown' || G.done;
  // 負け判定（終了時のみ、負けた側の村だけloss背景）
  let myLoss = false;
  let oppLoss = false;
  if (isEnd) {
    const myId = G.myPlayerId || 1;
    const myAlive = M.people ? M.people.filter(p => p.alive).length : 0;
    const oppAlive = F.people ? F.people.filter(p => p.alive).length : 0;
    if (G.instantWin) {
      if (G.instantWin !== 'draw') {
        myLoss = G.instantWin !== myId;
        oppLoss = G.instantWin === myId;
      }
    } else {
      myLoss = myAlive < oppAlive;
      oppLoss = myAlive > oppAlive;
    }
  }
  const mapMine = document.getElementById('map-mine');
  const mapFoe = document.getElementById('map-foe');
  mapMine.classList.toggle('large', isLarge);
  mapFoe.classList.toggle('large', isLarge);
  mapMine.classList.toggle('night', isNight);
  mapFoe.classList.toggle('night', isNight);
  mapMine.classList.toggle('dawn', isDawn);
  mapFoe.classList.toggle('dawn', isDawn);
  mapMine.classList.toggle('loss', myLoss);
  mapFoe.classList.toggle('loss', oppLoss);

  drawMap(mapMine, M, {
    omniscient: pub ? revealAll : true,
    sharpenHouse: sharpH,
    tokens: mineTokens,
    routePath: foeRoutePath,
    routeMine: false,
    pitEdge: (pub ? (revealAll ? M.pitEdge : null) : M.pitEdge),
    edgePick: pitPicking,
    onEdgePick: _placePit,
    pickable: (!pub && c.ph === 'place') ? (h => freeHouse(M, h)) : null,
    onPick: _placeNext,
    explorerPortrait: minePortrait
  });

  const nightPick = (!pub && c.ph === 'night' && canAttack(M));
  drawMap(mapFoe, F, {
    omniscient: pub ? revealAll : false,
    showExplorer: !pub && ['route', 'ticks', 'night'].includes(c.ph),
    itemHouses: pub ? null : {
      permit: M.gotPermit ? G.permitHouse[M.id] : null,
      claw: M.gotClaw ? G.madHouse[M.id] : null,
      medium: M.gotMedium ? G.mediumHouse[M.id] : null
    },
    tokens: foeTokens,
    routePath: myRoutePath,
    routeMine: true,
    pitEdge: (pub ? (revealAll ? F.pitEdge : null) : (F.pitSeen && F.pitSeen.length > 0 ? F.pitSeen : null)),
    attackTargetHouse: (nightPick && M.attackTarget !== null) ? F.people[M.attackTarget].house : null,
    pickable: (!pub && c.ph === 'route') ? routeValidWrapper : (nightPick ? (h => !!personAt(F, h)) : null),
    onPick: (!pub && c.ph === 'route') ? _pickRoute : (nightPick ? _pickAttackHouse : null),
    explorerPortrait: foePortrait
  });

  applyStage(c, pub);

  if (pub && !revealAll && G.mode === 'pvp') {
    // ホットシートのみ覚え書きを隠す（CPU・オンラインは常に表示）
    document.getElementById('ledger').innerHTML = '<div class="entry none">覚え書きは各自の手番でだけ開く。</div>';
    document.getElementById('ledger-title').textContent = '覚え書き';
  } else {
    renderLedger(M);
  }
  renderPanel();
  renderEmoteBar();

  // BGM切り替え
  const track = getTrackForPhase(c.ph, isEnd);
  playTrack(track);
}

// routeValidをラップ
function routeValidWrapper(h) {
  const v = me();
  const r = v.route;
  const { ADJ } = getConfig();
  if (r.length >= TICKS) return false;
  if (r.length === 0) return true;
  const last = r[r.length - 1];
  return h === last || ADJ[last].includes(h);
}

/**
 * エモートバーの開閉を切り替え
 */
export function toggleEmoteBar() {
  emoteBarOpen = !emoteBarOpen;
  renderEmoteBar();
}

/**
 * エモートバーを描画（オンラインモードのみ）
 */
export function renderEmoteBar() {
  // 既存のバーを削除
  const existing = document.getElementById('emote-bar');
  if (existing) existing.remove();

  // オンラインモードでなければ表示しない
  if (!G || G.mode !== 'online') return;

  // タイトル画面・メニュー画面では表示しない（待機画面は除く）
  const veil = document.getElementById('veil');
  if (veil && veil.style.display !== 'none' && !veil.innerHTML.includes('waiting')) return;

  const bar = document.createElement('div');
  bar.id = 'emote-bar';
  bar.className = emoteBarOpen ? 'emote-bar open' : 'emote-bar';

  if (emoteBarOpen) {
    bar.innerHTML = `
      <div class="emote-grid">
        ${EMOTES.map(e => `<button class="emote-btn" onclick="window._sendEmote('${e}')">${e}</button>`).join('')}
        <button class="emote-btn text-btn" onclick="window._openTextChat()">T</button>
      </div>
      <button class="emote-toggle close" onclick="window._toggleEmoteBar()">×</button>
    `;
  } else {
    bar.innerHTML = `<button class="emote-toggle" onclick="window._toggleEmoteBar()">エモート</button>`;
  }

  document.body.appendChild(bar);
}

/**
 * エモートバーを削除（タイトル画面などで）
 */
export function hideEmoteBar() {
  emoteBarOpen = false;
  const existing = document.getElementById('emote-bar');
  if (existing) existing.remove();
}

// リサイズ時に再描画
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', () => { if (G) render(); });
}
