/**
 * 村の生成
 */

import { shuf } from '../utils.js';
import { getConfig } from '../constants.js';

/**
 * 役職の配列を生成
 * @param {object} opt - オプション
 * @returns {string[]} シャッフルされた役職配列
 */
export function rolesFor(opt) {
  const config = getConfig();
  const r = ['wolf', 'guard'];
  if (opt.madmanDog) r.push('madman', 'dog');
  if (opt.medium) r.push('medium');
  while (r.length < config.VILLAGERS) r.push('villager');
  return shuf(r);
}

/**
 * 村を生成
 * @param {number} id - 村のID (1 or 2)
 * @param {string[]} names - 村人の名前配列（5人分）
 * @param {boolean} isCPU - CPUかどうか
 * @param {object} opt - オプション
 * @returns {object} 村オブジェクト
 */
export function mkVillage(id, names, isCPU, opt) {
  const roles = rolesFor(opt);
  return {
    id,
    isCPU,
    people: names.map((n, i) => ({
      id: i,
      name: n,
      role: roles[i],
      house: null,
      alive: true
    })),
    permit: false,
    fed: false,
    explorer: null,
    route: [],
    sharpenStart: null,
    spoiled: false,
    attackTarget: null,
    protectTarget: null,
    log: [],
    reveal: [],
    placeIdx: 0,
    permitFound: null,
    notice: null,
    memo: [],
    heardToday: null,
    madClaw: false,
    madClawFound: null,
    madStart: null,
    mediumFound: false,
    mediumResult: null,
    pitEdge: [],
    pitSeen: [],
    gotPermit: false,
    gotClaw: false,
    gotMedium: false,
    suspicion: {}
  };
}
