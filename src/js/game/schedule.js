/**
 * スケジュール生成
 */

import { DAYS } from '../constants.js';

/**
 * ゲームスケジュールを生成
 * @param {object} opt - オプション
 * @returns {object[]} スケジュール配列
 */
export function buildSchedule(opt) {
  opt = opt || {};
  const s = [{ who: 1, ph: 'place' }];
  if (opt.pit) s.push({ who: 1, ph: 'pit' });
  s.push({ who: 2, ph: 'place' });
  if (opt.pit) s.push({ who: 2, ph: 'pit' });

  for (let d = 1; d <= DAYS; d++) {
    s.push(
      { who: 1, ph: 'explorer', day: d },
      { who: 2, ph: 'explorer', day: d },
      { who: 2, ph: 'route', day: d },
      { who: 1, ph: 'route', day: d },
      { who: 1, ph: 'ticks', day: d },
      { who: 2, ph: 'ticks', day: d },
      { who: 2, ph: 'night', day: d },
      { who: 1, ph: 'night', day: d },
      { who: 0, ph: 'morning', day: d }
    );
  }
  s.push({ who: 0, ph: 'end' });
  return s;
}

/**
 * 手番交代の回数をカウント
 * @param {object[]} sched - スケジュール配列
 * @returns {number} 手番交代回数
 */
export function countHandoffs(sched) {
  let n = 0, prev = null;
  sched.forEach(e => {
    if (e.who === 0) return;
    if (e.who !== prev) n++;
    prev = e.who;
  });
  return n;
}
