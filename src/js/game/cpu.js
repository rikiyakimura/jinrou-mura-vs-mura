/**
 * CPU意思決定（改良版）
 */

import { G, wolfOf, guardOf, dogOf, madActive, alive } from '../state.js';
import { TICKS, SHARPEN, edgeKey, getConfig, getPreset, AI_PARAMS } from '../constants.js';
import { rnd, shuf, other } from '../utils.js';
import { placeVillagers, placePit, selectExplorer, setRoute, setSharpenTiming, setMadSharpenTiming, setAttackTarget, setProtectTarget } from '../actions.js';
import { resolveDay, overlapFull, SPOIL, canAttack, canProtect, madSharpenTicks } from './resolve.js';

// パーソナリティ定義
const PERSONALITIES = {
  aggressive: { wolfMult: 1.3, sharpenMult: 1.1, randomMult: 0.6, routePref: 'stake' },
  cautious:   { wolfMult: 0.7, sharpenMult: 0.85, randomMult: 1.0, routePref: 'tour' },
  analytical: { wolfMult: 1.0, sharpenMult: 1.0, randomMult: 0.5, routePref: 'pattern' },
  chaotic:    { wolfMult: 0.9, sharpenMult: 0.9, randomMult: 1.8, routePref: 'random' }
};

/**
 * AIパラメータを取得
 */
function getAIParams() {
  const preset = getPreset();
  return AI_PARAMS[preset] || AI_PARAMS.classic;
}

/**
 * 狼確率マップを正規化
 */
function normalizeWolfProb(prob) {
  const sum = Object.values(prob).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    Object.keys(prob).forEach(h => { prob[h] /= sum; });
  }
}

/**
 * 狼確率マップを更新
 */
function updateWolfProbability(mem, heardAt, route, config) {
  const ADJ = config.ADJ;
  const prob = mem.wolfProbability;

  if (heardAt) {
    // 聴覚あり：その家と隣接家の確率を上昇
    const candidates = [heardAt, ...(ADJ[heardAt] || [])];
    candidates.forEach(h => { if (prob[h] !== undefined) prob[h] *= 1.5; });
    // 非隣接家の確率を下降
    Object.keys(prob).forEach(h => {
      if (!candidates.includes(h)) prob[h] *= 0.7;
    });
  } else {
    // 聴覚なし：訪問した家の確率を下降
    route.forEach(h => { if (prob[h] !== undefined) prob[h] *= 0.6; });
  }

  normalizeWolfProb(prob);
}

/**
 * CPUメモリを更新（日終了時）
 */
function updateCPUMemory(v, o, config) {
  const mem = v.cpuMemory;
  if (!mem) return;

  // ルート履歴を記録
  mem.opponentRoutes.push({
    day: G.day,
    route: [...(o.route || [])],
    explorer: o.explorer
  });

  // 探索者履歴
  mem.opponentExplorers.push(o.explorer);

  // 聴覚情報を記録
  mem.soundReports.push({
    day: G.day,
    heard: v.heardToday,
    route: [...(v.route || [])]
  });

  // 狼確率を更新（聴覚情報から）
  const heardAt = v.heardToday ? wolfOf(o).house : null;
  updateWolfProbability(mem, heardAt, v.route || [], config);
}

/**
 * 落とし穴に当たる回数をカウント
 */
function countPitHits(route, pitEdges) {
  let hits = 0;
  for (let i = 0; i < route.length - 1; i++) {
    if (route[i] !== route[i + 1]) {
      const edge = edgeKey(route[i], route[i + 1]);
      if (pitEdges.includes(edge)) hits++;
    }
  }
  return hits;
}

/**
 * ランダムな5軒巡回ルートを生成
 */
function tour() {
  const config = getConfig();
  const { HOUSES, ADJ } = config;
  for (let k = 0; k < 400; k++) {
    const r = [rnd(HOUSES)];
    while (r.length < TICKS) {
      const nx = ADJ[r[r.length - 1]].filter(h => !r.includes(h));
      if (!nx.length) break;
      r.push(rnd(nx));
    }
    if (r.length === TICKS) return r;
  }
  // フォールバック：最初のTICKS個の家を返す
  return HOUSES.slice(0, TICKS);
}

/**
 * 2ティック張り込みルート
 */
function stake2(t) {
  const { ADJ } = getConfig();
  const a = rnd(ADJ[t]);
  return [t, t, a, a, rnd(ADJ[a].concat([a]))];
}

/**
 * 3ティック張り込みルート
 */
function stake3(t) {
  const { ADJ } = getConfig();
  const a = rnd(ADJ[t]), b = rnd(ADJ[t]), pat = Math.floor(Math.random() * 3);
  if (pat === 0) return [t, t, t, a, rnd(ADJ[a].concat([a]))];
  if (pat === 1) return [a, t, t, t, b];
  const x = rnd(ADJ[a].concat([a]));
  return [x, a, t, t, t];
}

/**
 * 爪研ぎを始めるか判断（プレイヤーのルートは見ない）
 */
function cpuSharpen(v, o, tick) {
  const params = getAIParams();
  const config = getConfig();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  let prob = params.sharpenBaseProb * pers.sharpenMult;

  // 飢餓ボーナス
  prob += (v.hungryStreak || 0) * 0.15;

  // 日数プレッシャー（終盤ほど攻撃的）
  prob += (G.day / config.DAYS) * 0.15;

  return Math.random() < Math.min(0.95, prob);
}

/**
 * CPUの襲撃先選択
 */
function cpuPickAttack(v, o) {
  const targets = alive(o);
  if (!targets.length) return null;

  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const susp = v.suspicion || {};

  // ランダム選択（パーソナリティで調整）
  if (Math.random() < 0.3 * pers.randomMult) {
    return rnd(targets).id;
  }

  const scored = targets.map(p => {
    let score = 0;

    // 疑惑スコア（低い=非狼=狙う）
    const suspVal = susp[p.id] || 1;
    score += (1 - suspVal) * 2.0;

    // 探索者ボーナス
    if (o.explorer === p.id) score += params.explorerTargetBonus;

    // 過去に探索者だった人は非狼の可能性高い
    if (mem && mem.opponentExplorers) {
      const expCount = mem.opponentExplorers.filter(e => e === p.id).length;
      score += expCount * 0.5;
    }

    // ランダム
    score += Math.random() * params.randomFactor * pers.randomMult;

    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

/**
 * CPUの推理更新
 */
function cpuUpdateSuspicion(v, foe) {
  const params = getAIParams();
  if (!v.suspicion) v.suspicion = {};
  const s = v.suspicion;
  foe.people.forEach(p => { if (s[p.id] === undefined) s[p.id] = 1; });
  const exp = foe.explorer;
  if (exp !== null) {
    s[exp] = Math.max(0, (s[exp] || 1) - params.explorerSuspicionDecrease);
  }
}

/**
 * CPUの配置を決定
 */
function cpuPlace(v, config) {
  const { HOUSES, ADJ } = config;
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  // 狼配置：隣接数でスコアリング（逃走経路確保）
  const scored = HOUSES.map(h => ({
    house: h,
    score: ADJ[h].length + Math.random() * (pers.randomMult > 1 ? 2 : 0.5)
  }));
  scored.sort((a, b) => b.score - a.score);

  const wolfHouse = scored[0].house;
  const others = shuf(HOUSES.filter(h => h !== wolfHouse));
  return [wolfHouse, ...others];
}

/**
 * CPUの落とし穴配置を決定
 */
function cpuPlacePit(v, o, config) {
  const { EDGE_KEYS, PITS } = config;
  const w = wolfOf(v);
  const mem = v.cpuMemory;

  // 辺のスコアリング
  const edgeScores = EDGE_KEYS.map(edge => {
    const [a, b] = edge.split('-');
    let score = 0;

    // 中央接続（高トラフィック）
    if (a === 'c' || b === 'c') score += 1.5;

    // 狼防御
    if (a === w.house || b === w.house) score += 1.0;

    // 相手の過去ルートから頻度計算
    if (mem && mem.opponentRoutes) {
      mem.opponentRoutes.forEach(rec => {
        for (let i = 0; i < rec.route.length - 1; i++) {
          if (edgeKey(rec.route[i], rec.route[i + 1]) === edge) {
            score += 0.6;
          }
        }
      });
    }

    score += Math.random() * 0.4;
    return { edge, score };
  });

  edgeScores.sort((a, b) => b.score - a.score);
  return edgeScores.slice(0, PITS).map(e => e.edge);
}

/**
 * CPUの探索者選択
 */
function cpuSelectExplorer(v, o) {
  const params = getAIParams();
  const config = getConfig();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const w = wolfOf(v);
  const dog = dogOf(v);
  const liv = alive(v);

  // 基準確率（モード別）
  const safe = (v.hungryStreak || 0) < 2;
  let baseProb = safe ? params.wolfSendSafe : params.wolfSendHungry;

  // パーソナリティ調整
  baseProb *= pers.wolfMult;

  // 日数調整（後半ほど攻撃的に）
  const dayFactor = 1 + (G.day - 1) * 0.1;
  baseProb *= dayFactor;

  // 情報がなければ狼を送らない
  if (!v.memo.length) baseProb = 0;

  // 狼を送るか判定
  let sendWolf = false;
  if (w.alive && Math.random() < baseProb) {
    sendWolf = true;
    v._sendWolf = true;
    return w.id;
  }

  // 犬飼いを送る（狂人検出用）
  if (dog && dog.alive && v.memo.length && Math.random() < 0.4) {
    v._sendWolf = false;
    return dog.id;
  }

  // 一般村人を送る
  const plain = liv.filter(p => p.role === 'villager' || p.role === 'dog');
  v._sendWolf = false;
  return (plain.length ? rnd(plain) : rnd(liv)).id;
}

/**
 * CPUのルート選択
 */
function cpuSelectRoute(v, o, config) {
  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const { HOUSES } = config;

  // ターゲット家屋を確率順に取得（狼確率マップから）
  let targets;
  if (mem && mem.wolfProbability) {
    targets = Object.entries(mem.wolfProbability)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);
  } else {
    // フォールバック：メモから
    targets = v.memo.length ? v.memo.slice(0, 3) : [rnd(HOUSES)];
  }

  // 候補ルート生成
  const candidates = [];

  // 張り込み系
  targets.forEach(t => {
    candidates.push({ route: stake2(t), type: 'stake2', score: 0 });
    if (v._sendWolf) {
      candidates.push({ route: stake3(t), type: 'stake3', score: 0 });
    }
  });

  // 巡回系
  for (let i = 0; i < 3; i++) {
    candidates.push({ route: tour(), type: 'tour', score: 0 });
  }

  // スコアリング
  candidates.forEach(c => {
    // ターゲットカバー率
    targets.forEach((t, idx) => {
      if (c.route.includes(t)) c.score += (3 - idx) * 0.5;
    });

    // パーソナリティ傾向
    if (pers.routePref === 'stake' && c.type.startsWith('stake')) c.score += 1;
    if (pers.routePref === 'tour' && c.type === 'tour') c.score += 1;

    // 落とし穴回避
    const pitHits = countPitHits(c.route, o.pitSeen || []);
    c.score -= pitHits * 5;

    // ランダム要素
    c.score += Math.random() * params.randomFactor * pers.randomMult;
  });

  // 最高スコアのルートを選択
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].route;
}

/**
 * CPUの護衛選択
 */
function cpuPickProtect(v, o) {
  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  const guard = alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf');
  if (!guard.length) return null;

  // ランダム選択（パーソナリティで調整）
  if (Math.random() < 0.3 * pers.randomMult) {
    return rnd(guard).id;
  }

  const scored = guard.map(p => {
    let score = 0;

    // 役職価値
    const roleValue = { medium: 4, dog: 3, madman: 1, villager: 2 };
    score += roleValue[p.role] || 1;

    // 探索者だった場合（疲れて狙われやすい）
    if (v.explorer === p.id) score += 1.5;

    // ランダム
    score += Math.random() * 0.5;

    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

/**
 * CPUの手番を実行
 */
export function runCPU(c, v) {
  const o = G.V[other(v.id)];
  const config = getConfig();

  if (c.ph === 'place') {
    placeVillagers(v.id, cpuPlace(v, config));
    return;
  }

  if (c.ph === 'pit') {
    placePit(v.id, cpuPlacePit(v, o, config));
    return;
  }

  if (c.ph === 'explorer') {
    v.mediumResult = null;
    selectExplorer(v.id, cpuSelectExplorer(v, o));
    return;
  }

  if (c.ph === 'route') {
    setRoute(v.id, cpuSelectRoute(v, o, config));
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

    // CPUメモリを更新（日終了時）
    updateCPUMemory(v, o, config);

    if (v.id === 2) resolveDay(null);
    return;
  }

  if (c.ph === 'night') {
    cpuUpdateSuspicion(v, o);
    setAttackTarget(v.id, canAttack(v) ? cpuPickAttack(v, o) : null);
    setProtectTarget(v.id, canProtect(v) ? cpuPickProtect(v, o) : null);
    return;
  }
}
