/**
 * アクション関数（核心）
 *
 * 全てのゲームアクションを純粋な関数として定義。
 * CPU/2P/オンライン対戦で共通して使用される。
 * 各関数はDB送信用データを返す。
 */

import { G, houseName, log, madmanOf, mediumOf } from './state.js';
import { edgeKey } from './constants.js';
import { other } from './utils.js';

// ========== 配置フェーズ ==========

/**
 * 村人を家に配置（一括）
 * @param {number} playerId - プレイヤーID (1 or 2)
 * @param {string[]} houses - 家の配列 ['tl', 'tr', 'c', 'bl', 'br']
 * @returns {object} DB送信用データ
 */
export function placeVillagers(playerId, houses) {
  const v = G.V[playerId];
  houses.forEach((h, i) => {
    v.people[i].house = h;
  });
  v.placeIdx = 5;

  return {
    playerId,
    phase: 'place',
    data: { houses }
  };
}

/**
 * 落とし穴を配置
 * @param {number} playerId - プレイヤーID
 * @param {string} edge - 道のキー（例: 'tl-tr'）
 * @returns {object} DB送信用データ
 */
export function placePit(playerId, edge) {
  const v = G.V[playerId];
  v.pitEdge = edge;

  return {
    playerId,
    phase: 'pit',
    data: { edge }
  };
}

// ========== 昼フェーズ ==========

/**
 * 探索者を選択
 * @param {number} playerId - プレイヤーID
 * @param {number} personId - 村人のID
 * @returns {object} DB送信用データ
 */
export function selectExplorer(playerId, personId) {
  const v = G.V[playerId];
  v.explorer = personId;
  v.mediumResult = null;

  return {
    playerId,
    phase: 'explorer',
    data: { personId }
  };
}

/**
 * 経路を設定（一括）
 * アイテム取得・落とし穴の処理も行う
 * @param {number} playerId - プレイヤーID
 * @param {string[]} route - 経路の配列
 * @returns {object} DB送信用データ
 */
export function setRoute(playerId, route) {
  const v = G.V[playerId];
  const o = G.V[other(playerId)];

  v.route = route;

  // アイテム取得計算（落とし穴も考慮）
  let held = { permit: false, mad: false, medium: false };
  let got = { permit: false, mad: false, medium: false };

  for (let i = 0; i < route.length; i++) {
    // 落とし穴チェック
    if (i > 0 && route[i - 1] !== route[i] && o.pitEdge === edgeKey(route[i - 1], route[i])) {
      if (held.permit || held.mad || held.medium) o.pitSeen = true;
      else if (o.pitEdge) o.pitSeen = true;
      held = { permit: false, mad: false, medium: false };
    }

    const h = route[i];
    if (h === G.permitHouse[playerId] && !got.permit) {
      held.permit = true;
      got.permit = true;
    }
    if (G.madHouse[playerId] && h === G.madHouse[playerId] && !got.mad) {
      held.mad = true;
      got.mad = true;
    }
    if (G.mediumHouse[playerId] && h === G.mediumHouse[playerId] && !got.medium) {
      held.medium = true;
      got.medium = true;
    }
  }

  v.permit = held.permit;
  v.permitFound = held.permit ? G.permitHouse[playerId] : null;
  v.madClaw = held.mad;
  v.madClawFound = held.mad ? G.madHouse[playerId] : null;
  v.mediumFound = held.medium;
  v.gotPermit = got.permit;
  v.gotClaw = got.mad;
  v.gotMedium = got.medium;

  return {
    playerId,
    phase: 'route',
    data: { route, explorer: v.explorer }
  };
}

/**
 * 爪研ぎのタイミングを設定
 * @param {number} playerId - プレイヤーID
 * @param {number|null} startTick - 開始ティック（1-3）、またはnull（研がない）
 * @returns {object} DB送信用データ
 */
export function setSharpenTiming(playerId, startTick) {
  const v = G.V[playerId];
  v.sharpenStart = startTick;

  return {
    playerId,
    phase: 'ticks',
    data: { sharpenStart: startTick }
  };
}

/**
 * 狂人の爪研ぎタイミングを設定
 * @param {number} playerId - プレイヤーID
 * @param {number|null} startTick - 開始ティック
 * @returns {object} DB送信用データ
 */
export function setMadSharpenTiming(playerId, startTick) {
  const v = G.V[playerId];
  v.madStart = startTick;

  return {
    playerId,
    phase: 'madTicks',
    data: { madStart: startTick }
  };
}

// ========== 夜フェーズ ==========

/**
 * 襲撃対象を設定
 * @param {number} playerId - プレイヤーID
 * @param {number|null} targetPersonId - 対象村人のID、またはnull
 * @returns {object} DB送信用データ
 */
export function setAttackTarget(playerId, targetPersonId) {
  const v = G.V[playerId];
  v.attackTarget = targetPersonId;

  return {
    playerId,
    phase: 'attack',
    data: { attack: targetPersonId }
  };
}

/**
 * 護衛対象を設定
 * @param {number} playerId - プレイヤーID
 * @param {number|null} targetPersonId - 対象村人のID、またはnull
 * @returns {object} DB送信用データ
 */
export function setProtectTarget(playerId, targetPersonId) {
  const v = G.V[playerId];
  v.protectTarget = targetPersonId;

  return {
    playerId,
    phase: 'protect',
    data: { protect: targetPersonId }
  };
}

// ========== 受信データ適用 ==========

/**
 * 受信したアクションデータを適用
 * @param {object} action - アクションデータ
 */
export function applyAction(action) {
  const { playerId, phase, data } = action;

  switch (phase) {
    case 'place':
      placeVillagers(playerId, data.houses);
      break;
    case 'pit':
      placePit(playerId, data.edge);
      break;
    case 'explorer':
      selectExplorer(playerId, data.personId);
      break;
    case 'route':
      setRoute(playerId, data.route);
      break;
    case 'ticks':
      if (data.sharpenStart !== undefined) setSharpenTiming(playerId, data.sharpenStart);
      if (data.madStart !== undefined) setMadSharpenTiming(playerId, data.madStart);
      break;
    case 'attack':
      setAttackTarget(playerId, data.attack);
      break;
    case 'protect':
      setProtectTarget(playerId, data.protect);
      break;
    case 'night':
      // 夜は attack + protect をまとめて受信する場合
      if (data.attack !== undefined) setAttackTarget(playerId, data.attack);
      if (data.protect !== undefined) setProtectTarget(playerId, data.protect);
      break;
  }
}
