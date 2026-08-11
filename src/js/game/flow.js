/**
 * ゲーム進行制御
 */

import { G, setG, cur, who, me, opp } from '../state.js';
import { NAMES, setPreset, getConfig } from '../constants.js';
import { shuf, other } from '../utils.js';
import { mkVillage } from './village.js';
import { buildSchedule, countHandoffs } from './schedule.js';
import { resolveDay, resolveNight, finish, overlapFull, SPOIL } from './resolve.js';

// レンダリング関数（外部から注入）
let _render = null;
let _hideVeil = null;
let _showVeilIfNeeded = null;
let _runCPU = null;

export function setFlowCallbacks({ render, hideVeil, showVeilIfNeeded, runCPU }) {
  _render = render;
  _hideVeil = hideVeil;
  _showVeilIfNeeded = showVeilIfNeeded;
  _runCPU = runCPU;
}

/**
 * 新しいゲームを開始
 */
export function newGame(mode, opt) {
  opt = opt || { madmanDog: false, medium: false, large: false };

  // プリセットを設定
  setPreset(opt.large ? 'large' : 'classic');
  const config = getConfig();

  const pool = shuf(NAMES);
  const villagerCount = config.VILLAGERS;

  const newG = {
    mode,
    opt,
    V: {
      1: mkVillage(1, pool.slice(0, villagerCount), false, opt),
      2: mkVillage(2, pool.slice(villagerCount, villagerCount * 2), mode === 'cpu', opt)
    },
    sched: buildSchedule(opt),
    idx: 0,
    day: 1,
    tickIdx: 0,
    instantWin: null,
    starved: false,
    permitHouse: { 1: null, 2: null },
    madHouse: { 1: null, 2: null },
    mediumHouse: { 1: null, 2: null },
    handoffs: 0,
    endView: 1,
    publicLog: [],
    done: false,
    swap: false,
    _shown: -1
  };

  setG(newG);
  G.totalHandoffs = countHandoffs(G.sched);

  const extra = [];
  if (opt.madmanDog) extra.push('狂人＋犬飼い');
  if (opt.medium) extra.push('霊媒師');

  document.getElementById('modeline').textContent =
    (mode === 'cpu' ? '対CPU' : '1台を交代で使う2人対戦 ／ ホットシート') +
    (extra.length ? '　／　' + extra.join('・') : '');

  startDay();
  sync();
}

/**
 * 次のフェーズへ進む
 */
export function advance() {
  G.idx++;
  const c = cur();
  if (c.day) G.day = c.day;
  if (c.ph === 'ticks') G.tickIdx = 0;
  sync();
}

/**
 * CPUの手番を自動で消化し、人の手番で止める
 */
export function sync() {
  let guard = 0;
  while (guard++ < 400) {
    const c = cur();
    if (!c || c.who === 0) break;
    const v = G.V[c.who];
    if (!v || !v.isCPU) break;
    try {
      if (_runCPU) _runCPU(c, v);
    } catch (e) {
      console.error('CPU error in phase', c.ph, ':', e);
      break;
    }
    if (G.done) return;
    G.idx++;
    const n = cur();
    if (n && n.day) G.day = n.day;
    if (n && n.ph === 'ticks') G.tickIdx = 0;
  }
  if (_showVeilIfNeeded) _showVeilIfNeeded();
}

/**
 * 日の始まりの初期化
 */
export function startDay() {
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
 * 昼を終える
 */
export function finishDay() {
  const v = me();
  v.tickDone = false;
  if (v.id === 2) {
    resolveDay(_hideVeil);
    if (G.done) return;
  }
  advance();
}

/**
 * 夜を終える
 */
export function confirmNight() {
  if (me().id === 1) endOfNight();
  else advance();
}

/**
 * 夜の終了処理
 */
export function endOfNight() {
  const config = getConfig();
  resolveNight();
  if (G.done) {
    advance();  // 餓死でゲーム終了した場合もUIを更新
    return;
  }
  if (G.day < config.DAYS) startDay();
  advance();
}

/**
 * 朝の表示から進む
 */
export function nextFromMorning() {
  const config = getConfig();
  if (G.day >= config.DAYS) finish(_hideVeil);
  else advance();
}
