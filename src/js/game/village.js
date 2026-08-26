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

// 配置フェーズでの表示順序（役職持ちを先に）
const ROLE_ORDER = { wolf: 0, guard: 1, madman: 2, dog: 3, medium: 4, villager: 5 };

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
  const people = names.map((n, i) => ({
    id: i,
    name: n,
    role: roles[i],
    house: null,
    alive: true
  }));
  // 役職持ち順にソート（人狼→護衛→特殊役職→村人）
  people.sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
  // ソート後にidを振り直す
  people.forEach((p, i) => { p.id = i; });

  return {
    id,
    isCPU,
    people,
    permit: false,
    fed: false,
    hungryStreak: 0,
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
    mediumFound: null,
    mediumResult: null,
    pitEdge: [],
    pitSeen: [],
    gotPermit: false,
    gotClaw: false,
    gotMedium: false,
    suspicion: {}
  };
}
