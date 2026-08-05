/**
 * メイン描画
 */

import { G, cur, who, me, opp, wolfOf, guardOf, alive, vname, freeHouse, personAt, guardAway } from '../state.js';
import { TICKS, getPreset, getConfig } from '../constants.js';
import { other } from '../utils.js';
import { drawMap } from './map.js';
import { renderLedger } from './ledger.js';
import { renderPanel } from './panel.js';
import { canAttack, routeValid } from '../game/resolve.js';
import { playTrack, getTrackForPhase } from '../audio.js';

// 外部関数
let _placeNext = null;
let _placePit = null;
let _pickRoute = null;
let _pickAttackHouse = null;

// エモート一覧
const EMOTES = ['👍', '😊', '🤔', '⏳', '🙏', '😅', '❤️', '💀', '😏', '😜', '🤭', '👋', '😤', '👀', '🔥'];

// エモートバーの開閉状態
let emoteBarOpen = false;

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
    if (document.body.classList) document.body.classList.remove('ledger-open');
  }
  const pub = (w === 0), revealAll = (c.ph === 'end');
  const myId = G.myPlayerId || 1;
  const oppId = myId === 1 ? 2 : 1;
  const myName = G.myPlayerName || '自分';
  const oppName = G.opponentName || '相手';
  // オンラインモードでは自分→相手の順で表示
  const M = pub ? (G.mode === 'online' ? G.V[myId] : G.V[G.endView]) : me();
  const F = pub ? (G.mode === 'online' ? G.V[oppId] : G.V[other(G.endView)]) : opp();

  // 地図タイトル
  const mineTitle = pub
    ? (G.mode === 'online' ? `${myName}の村の地図` : `${vname(M)}の地図`)
    : (G.mode === 'online' ? `${myName}の村の地図` : '自分の村の地図');
  const foeTitle = pub
    ? (G.mode === 'online' ? `${oppName}の村の地図` : `${vname(F)}の地図`)
    : (G.mode === 'online' ? `${oppName}の村の地図` : '相手の村の地図');
  document.getElementById('t-mine').textContent = mineTitle;
  document.getElementById('t-foe').textContent = foeTitle;
  document.getElementById('ledger-title').textContent = pub ? `覚え書き（${vname(M)}）` : '覚え書き';

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
        ? `<span>${myName} <b>${alive(G.V[myId]).length}</b>人</span><span>${oppName} <b>${alive(G.V[oppId]).length}</b>人</span>`
        : `<span>1P <b>${alive(G.V[1]).length}</b>人</span><span>2P <b>${alive(G.V[2]).length}</b>人</span>`)) +
    (pub
      ? `<span class="turnbadge pub">${G.mode === 'pvp' ? '1P・2P とも観覧可' : '結果'}</span>`
      : (M.explorer !== null && guardAway(M) ? `<span style="color:var(--akane-glow)">護衛は探索中</span>` : '') +
      `<span>狼の食事 ${M.fed ? '済' : 'まだ'}</span>` +
      (G.mode === 'cpu' ? '' : (G.mode === 'online' ? '' : `<span class="turnbadge p${w}">${w}P の手番</span>`)) +
      itemLine);

  const wl = wolfOf(M);
  const sharpH = (!pub && M.sharpenStart !== null && wl.alive) ? wl.house : null;
  const mineTokens = [], foeTokens = [];
  if (!pub) {
    if (c.ph === 'route' && M.route.length) {
      foeTokens.push({ house: M.route[M.route.length - 1], label: M.people[M.explorer].name, mine: true });
    } else if ((c.ph === 'ticks' || c.ph === 'night') && G.tickIdx > 0 && M.route[G.tickIdx - 1]) {
      foeTokens.push({ house: M.route[G.tickIdx - 1], label: M.people[M.explorer].name, mine: true });
    }
    if ((c.ph === 'ticks' || c.ph === 'night') && G.tickIdx > 0 && F.route[G.tickIdx - 1]) {
      mineTokens.push({ house: F.route[G.tickIdx - 1], label: F.people[F.explorer].name, mine: false });
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
    onPick: _placeNext
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
    onPick: (!pub && c.ph === 'route') ? _pickRoute : (nightPick ? _pickAttackHouse : null)
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
