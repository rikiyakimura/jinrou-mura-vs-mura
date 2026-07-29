/**
 * CPU意思決定
 */

import { G, wolfOf, guardOf, dogOf, madActive, alive } from '../state.js';
import { HOUSES, TICKS, SHARPEN, EDGE_KEYS, edgeKey } from '../constants.js';
import { rnd, shuf, other } from '../utils.js';
import { placeVillagers, placePit, selectExplorer, setRoute, setSharpenTiming, setMadSharpenTiming, setAttackTarget, setProtectTarget } from '../actions.js';
import { resolveDay, overlapFull, SPOIL, canAttack, canProtect, madSharpenTicks } from './resolve.js';

/**
 * ランダムな5軒巡回ルートを生成
 */
function tour() {
  const ADJ = {
    tl: ['tr', 'bl', 'c'],
    tr: ['tl', 'br', 'c'],
    bl: ['tl', 'br', 'c'],
    br: ['tr', 'bl', 'c'],
    c: ['tl', 'tr', 'bl', 'br']
  };
  for (let k = 0; k < 400; k++) {
    const r = [rnd(HOUSES)];
    while (r.length < TICKS) {
      const nx = ADJ[r[r.length - 1]].filter(h => !r.includes(h));
      if (!nx.length) break;
      r.push(rnd(nx));
    }
    if (r.length === TICKS) return r;
  }
  return ['tl', 'tr', 'br', 'bl', 'c'];
}

/**
 * 2ティック張り込みルート
 */
function stake2(t) {
  const ADJ = {
    tl: ['tr', 'bl', 'c'],
    tr: ['tl', 'br', 'c'],
    bl: ['tl', 'br', 'c'],
    br: ['tr', 'bl', 'c'],
    c: ['tl', 'tr', 'bl', 'br']
  };
  const a = rnd(ADJ[t]);
  return [t, t, a, a, rnd(ADJ[a].concat([a]))];
}

/**
 * 3ティック張り込みルート
 */
function stake3(t) {
  const ADJ = {
    tl: ['tr', 'bl', 'c'],
    tr: ['tl', 'br', 'c'],
    bl: ['tl', 'br', 'c'],
    br: ['tr', 'bl', 'c'],
    c: ['tl', 'tr', 'bl', 'br']
  };
  const a = rnd(ADJ[t]), b = rnd(ADJ[t]), pat = Math.floor(Math.random() * 3);
  if (pat === 0) return [t, t, t, a, rnd(ADJ[a].concat([a]))];
  if (pat === 1) return [a, t, t, t, b];
  const x = rnd(ADJ[a].concat([a]));
  return [x, a, t, t, t];
}

/**
 * 爪研ぎを始めるか判断
 */
function cpuSharpen(v, o, tick) {
  const w = wolfOf(v);
  const route = o.route;
  let hit = 0;
  for (let i = 0; i < SHARPEN; i++) {
    if (route[tick + i - 1] === w.house) hit++;
  }
  if (hit >= 2) return false; // 2度居合わせられるなら開始しない
  return Math.random() < 0.85;
}

/**
 * CPUの襲撃先選択
 */
function cpuPickAttack(v, o) {
  const targets = alive(o);
  if (!targets.length) return null;
  const susp = v.suspicion || {};

  // 3割は素朴に選ぶ
  if (Math.random() < 0.3) return rnd(targets).id;

  const scored = targets.map(p => {
    let score = 0;
    score -= (susp[p.id] || 0) * 2.2;
    if (o.explorer === p.id) score += 1.6;
    score += Math.random() * 2.2;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

/**
 * CPUの推理更新
 */
function cpuUpdateSuspicion(v, foe) {
  if (!v.suspicion) v.suspicion = {};
  const s = v.suspicion;
  foe.people.forEach(p => { if (s[p.id] === undefined) s[p.id] = 1; });
  const exp = foe.explorer;
  if (exp !== null) {
    s[exp] = Math.max(0, (s[exp] || 1) - 0.8);
  }
}

/**
 * CPUの手番を実行
 */
export function runCPU(c, v) {
  const o = G.V[other(v.id)];

  if (c.ph === 'place') {
    placeVillagers(v.id, shuf(HOUSES));
    return;
  }

  if (c.ph === 'pit') {
    const w = wolfOf(v);
    const cand = EDGE_KEYS.filter(k => k.split('-').includes(w.house));
    placePit(v.id, rnd(cand.length ? cand : EDGE_KEYS));
    return;
  }

  if (c.ph === 'explorer') {
    v.mediumResult = null;
    const liv = alive(v), w = wolfOf(v);
    const plain = liv.filter(p => p.role === 'villager' || p.role === 'dog');
    let sendWolf = false;
    if (v.memo.length && w.alive) {
      const safe = v.fed || G.day < 3;
      sendWolf = Math.random() < (safe ? 0.5 : 0.12);
    }
    let pick;
    if (sendWolf) {
      pick = w;
    } else {
      const dog = dogOf(v);
      if (dog && dog.alive && v.memo.length && Math.random() < 0.4) pick = dog;
      else pick = (plain.length ? rnd(plain) : rnd(liv));
    }
    selectExplorer(v.id, pick.id);
    v._sendWolf = sendWolf;
    return;
  }

  if (c.ph === 'route') {
    let r;
    if (v._sendWolf && v.memo.length) r = stake3(rnd(v.memo));
    else if (v.memo.length && Math.random() < 0.7) r = stake2(rnd(v.memo));
    else if (Math.random() < 0.42) r = tour();
    else r = stake2(rnd(HOUSES));

    // 落とし穴を避ける
    if (o.pitEdge && o.pitSeen) {
      for (let tryn = 0; tryn < 12; tryn++) {
        let bad = false;
        for (let i = 0; i < r.length - 1; i++) {
          if (r[i] !== r[i + 1] && o.pitEdge === edgeKey(r[i], r[i + 1])) { bad = true; break; }
        }
        if (!bad) break;
        if (v._sendWolf && v.memo.length) r = stake3(rnd(v.memo));
        else if (v.memo.length && Math.random() < 0.7) r = stake2(rnd(v.memo));
        else if (Math.random() < 0.42) r = tour();
        else r = stake2(rnd(HOUSES));
      }
    }
    setRoute(v.id, r);
    return;
  }

  if (c.ph === 'ticks') {
    const w = wolfOf(v);
    if (w.alive && v.explorer !== w.id) {
      for (let k = 1; k <= TICKS - SHARPEN + 1; k++) {
        if (cpuSharpen(v, o, k)) {
          setSharpenTiming(v.id, k);
          break;
        }
      }
    }

    // 狂人の爪
    if (madActive(v)) {
      const m = v.people.find(p => p.role === 'madman');
      let best = null, bestScore = -1;
      for (let k = 1; k <= TICKS - SHARPEN + 1; k++) {
        let sc = [0, 1, 2].map(i => k + i).filter(t => t <= TICKS).filter(t => o.route[t - 1] === m.house).length;
        if (v.sharpenStart !== null && k === v.sharpenStart) sc += 0.5;
        if (sc > bestScore) { bestScore = sc; best = k; }
      }
      const madStart = (bestScore >= 1) ? best : (v.sharpenStart !== null ? v.sharpenStart : best);
      setMadSharpenTiming(v.id, madStart);
    }

    G.tickIdx = TICKS;
    if (overlapFull(v, o.route) >= SPOIL) v.spoiled = true;
    if (v.id === 2) resolveDay(null);
    return;
  }

  if (c.ph === 'night') {
    cpuUpdateSuspicion(v, o);
    setAttackTarget(v.id, canAttack(v) ? cpuPickAttack(v, o) : null);

    if (canProtect(v)) {
      const guard = alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf');
      if (Math.random() < 0.4) {
        setProtectTarget(v.id, rnd(guard).id);
      } else {
        const pri = p => p.role === 'medium' ? 3 : p.role === 'dog' ? 2 : 1;
        guard.sort((a, b) => pri(b) - pri(a));
        setProtectTarget(v.id, guard.length ? guard[0].id : null);
      }
    } else {
      setProtectTarget(v.id, null);
    }
    return;
  }
}
