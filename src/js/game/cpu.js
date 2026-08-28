/**
 * CPU意思決定（改良版）
 */

import { G, wolfOf, guardOf, dogOf, madActive, alive } from '../state.js';
import { TICKS, SHARPEN, edgeKey, getConfig, getPreset, AI_PARAMS } from '../constants.js';
import { rnd, shuf, other } from '../utils.js';
import { placeVillagers, placePit, selectExplorer, setRoute, setSharpenTiming, setMadSharpenTiming, setAttackTarget, setProtectTarget } from '../actions.js';
import { resolveDay, overlapFull, SPOIL, canAttack, canProtect, madSharpenTicks } from './resolve.js';

// アーキタイプ定義（シミュレーションで最適化済み）
const ARCHETYPES = {
  hunter: {
    name: 'Hunter（狩人）',
    wolfExplorerProb: 0.5,
    stake3Preference: 0.8,
    sharpenTiming: 'early',
    aggressiveness: 1.3,
    permitPriority: 1.0,
    guardProtection: false,
    randomFactor: 1.0
  },
  defender: {
    name: 'Defender（守護者）',
    wolfExplorerProb: 0.15,
    stake3Preference: 0.3,
    sharpenTiming: 'late',
    aggressiveness: 0.85,
    permitPriority: 2.0,
    guardProtection: true,
    randomFactor: 1.0
  },
  analyst: {
    name: 'Analyst（分析者）',
    wolfExplorerProb: 0.3,
    stake3Preference: 0.5,
    sharpenTiming: 'calculated',
    aggressiveness: 1.0,
    permitPriority: 1.2,
    guardProtection: false,
    randomFactor: 0.8
  },
  gambler: {
    name: 'Gambler（賭博師）',
    wolfExplorerProb: 0.4,
    stake3Preference: 0.5,
    sharpenTiming: 'random',
    aggressiveness: 1.1,
    permitPriority: 1.0,
    guardProtection: false,
    randomFactor: 2.5,
    madClawUsage: 'deceptive'
  },
  opportunist: {
    name: 'Opportunist（日和見）',
    wolfExplorerProb: 0.3,
    stake3Preference: 0.5,
    sharpenTiming: 'adaptive',
    aggressiveness: 1.0,
    permitPriority: 1.2,
    guardProtection: false,
    randomFactor: 1.0,
    adaptiveMode: true,
    aggressiveThreshold: -1,
    defensiveThreshold: 2,
    wolfConfidenceThreshold: 0.5
  }
};

/**
 * アーキタイプパラメータを取得
 */
function getArchetypeParams(v) {
  const archName = v.cpuMemory?.archetype || 'analyst';
  return ARCHETYPES[archName] || ARCHETYPES.analyst;
}

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
  const aiParams = getAIParams();
  const config = getConfig();
  const archParams = getArchetypeParams(v);

  let aggressiveness = archParams.aggressiveness;

  // Opportunist: 状況に応じて攻撃性を調整
  if (archParams.adaptiveMode) {
    const mySurvivors = alive(v).length;
    const oppSurvivors = alive(o).length;
    const diff = mySurvivors - oppSurvivors;

    if (diff <= (archParams.aggressiveThreshold || -1)) {
      aggressiveness = 1.4; // 劣勢 → より攻撃的に
    } else if (diff >= (archParams.defensiveThreshold || 1)) {
      aggressiveness = 0.7; // 優勢 → より守備的に
    }
  }

  let prob = aiParams.sharpenBaseProb * aggressiveness;

  // 飢餓ボーナス
  prob += (v.hungryStreak || 0) * 0.15;

  // 日数プレッシャー（終盤ほど攻撃的）
  prob += (G.day / config.DAYS) * 0.15;

  return Math.random() < Math.min(0.95, prob);
}

/**
 * 爪研ぎ開始ティックを決定
 */
function cpuSelectSharpenTick(v, o) {
  const archParams = getArchetypeParams(v);
  const timing = archParams.sharpenTiming;

  if (timing === 'early') return 1;
  if (timing === 'late') return 3;
  if (timing === 'random') return 1 + Math.floor(Math.random() * 3);
  if (timing === 'adaptive') {
    // Opportunist: 状況に応じて変える
    const mySurvivors = alive(v).length;
    const oppSurvivors = alive(o).length;
    if (mySurvivors < oppSurvivors) return 1; // 劣勢 → 早めに確定
    if (mySurvivors > oppSurvivors) return 3; // 優勢 → 様子見
    return 2;
  }
  // calculated: デフォルトは中間
  return 2;
}

/**
 * CPUの襲撃先選択
 */
function cpuPickAttack(v, o) {
  const targets = alive(o);
  if (!targets.length) return null;

  const aiParams = getAIParams();
  const archParams = getArchetypeParams(v);
  const mem = v.cpuMemory;
  const susp = v.suspicion || {};

  // ランダム選択（アーキタイプで調整）
  if (Math.random() < 0.15 * archParams.randomFactor) {
    return rnd(targets).id;
  }

  const scored = targets.map(p => {
    let score = 0;

    // 疑惑スコア（低い=非狼=狙う）
    const suspVal = susp[p.id] || 1;
    score += (1 - suspVal) * 2.0;

    // 探索者ボーナス
    if (o.explorer === p.id) score += aiParams.explorerTargetBonus;

    // 過去に探索者だった人は非狼の可能性高い
    if (mem && mem.opponentExplorers) {
      const expCount = mem.opponentExplorers.filter(e => e === p.id).length;
      score += expCount * 0.5;
    }

    // 護衛は殺せない可能性が高い
    if (p.role === 'guard' && o.permit) score -= 0.5;

    // 狂人は殺しても相手は困らない
    if (p.role === 'madman') score -= 0.3;

    // ランダム
    score += Math.random() * aiParams.randomFactor * (archParams.randomFactor / 2);

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
  const archParams = getArchetypeParams(v);

  // 狼配置：隣接数でスコアリング（逃走経路確保）
  const scored = HOUSES.map(h => ({
    house: h,
    score: ADJ[h].length + Math.random() * (archParams.randomFactor > 1.5 ? 2 : 0.5)
  }));
  scored.sort((a, b) => b.score - a.score);

  const wolfHouse = scored[0].house;
  const others = shuf(HOUSES.filter(h => h !== wolfHouse));
  return [wolfHouse, ...others];
}

/**
 * CPUの落とし穴配置を決定（アーキタイプ別戦略）
 */
function cpuPlacePit(v, o, config) {
  const { EDGE_KEYS, PITS, ADJ } = config;
  const w = wolfOf(v);
  const mem = v.cpuMemory;
  const archParams = getArchetypeParams(v);

  // 相手のアイテム位置を取得
  const oppItemHouses = [];
  if (G.permitHouse && G.permitHouse[o.id]) {
    const h = G.permitHouse[o.id];
    oppItemHouses.push(...(Array.isArray(h) ? h : [h]));
  }
  if (G.madHouse && G.madHouse[o.id]) {
    const h = G.madHouse[o.id];
    oppItemHouses.push(...(Array.isArray(h) ? h : [h]));
  }
  if (G.mediumHouse && G.mediumHouse[o.id]) {
    const h = G.mediumHouse[o.id];
    oppItemHouses.push(...(Array.isArray(h) ? h : [h]));
  }

  // 辺のスコアリング
  const edgeScores = EDGE_KEYS.map(edge => {
    const [a, b] = edge.split('-');
    let score = 0;

    // === アーキタイプ別戦略 ===

    // Defender: 狼防御を最優先
    if (archParams.guardProtection) {
      if (a === w.house || b === w.house) score += 2.0;
      if (a === 'c' || b === 'c') score += 1.0;
    }
    // Hunter: 相手のアイテム妨害を優先（攻撃的）
    else if (archParams.stake3Preference > 0.7) {
      if (oppItemHouses.includes(a) || oppItemHouses.includes(b)) score += 2.0;
      if (a === 'c' || b === 'c') score += 1.5;
      // 狼の位置は隠す（狼から離れた場所）
      if (a !== w.house && b !== w.house) score += 0.5;
    }
    // Analyst: パターン分析重視
    else if (archParams.randomFactor < 1) {
      if (a === 'c' || b === 'c') score += 1.5;
      // 相手の過去ルートから頻度計算（重み増）
      if (mem && mem.opponentRoutes) {
        mem.opponentRoutes.forEach(rec => {
          for (let i = 0; i < rec.route.length - 1; i++) {
            if (edgeKey(rec.route[i], rec.route[i + 1]) === edge) {
              score += 1.0; // 通常より高い
            }
          }
        });
      }
    }
    // Gambler: ランダム重視
    else if (archParams.randomFactor > 2) {
      score += Math.random() * 3.0;
    }
    // Opportunist/デフォルト: バランス
    else {
      if (a === 'c' || b === 'c') score += 1.5;
      if (oppItemHouses.includes(a) || oppItemHouses.includes(b)) score += 1.2;
      // 狼防御は控えめ（位置バレ防止）
      if (a === w.house || b === w.house) score += 0.3;
    }

    // 共通: 相手のアイテム位置
    if (!archParams.guardProtection && !archParams.stake3Preference) {
      if (oppItemHouses.includes(a) || oppItemHouses.includes(b)) score += 1.0;
    }

    // 共通: 相手の過去ルート（Analyst以外）
    if (archParams.randomFactor >= 1 && mem && mem.opponentRoutes) {
      mem.opponentRoutes.forEach(rec => {
        for (let i = 0; i < rec.route.length - 1; i++) {
          if (edgeKey(rec.route[i], rec.route[i + 1]) === edge) {
            score += 0.5;
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
  const aiParams = getAIParams();
  const archParams = getArchetypeParams(v);
  const mem = v.cpuMemory;
  const w = wolfOf(v);
  const dog = dogOf(v);
  const g = guardOf(v);
  const liv = alive(v);

  // 狼を送る確率（アーキタイプ基準）
  let wolfProb = archParams.wolfExplorerProb || 0.3;

  // Gambler: 日によって変える
  if (archParams.randomFactor > 2) {
    wolfProb = G.day <= 2 ? archParams.wolfExplorerProb : 0.1;
  }

  // Opportunist: 狼位置に高確信があれば狼を送る
  if (archParams.adaptiveMode && mem && mem.wolfProbability) {
    const topProb = Math.max(...Object.values(mem.wolfProbability));
    const threshold = archParams.wolfConfidenceThreshold || 0.4;
    if (topProb >= threshold && v.memo.length >= 2) {
      wolfProb = 0.7; // 高確信 → 狼を送って即勝利狙い
    }
  }

  // 情報がなければ狼を送らない
  if (!v.memo.length) wolfProb = 0;

  // 狼を送るか判定
  if (w.alive && Math.random() < wolfProb) {
    v._sendWolf = true;
    return w.id;
  }
  v._sendWolf = false;

  // 犬飼いを送る判断: 相手が狂人の爪を取った可能性がある時
  if (dog && dog.alive && G.opt?.madmanDog) {
    const madHouses = G.madHouse?.[o.id];
    const oppRoutes = mem?.opponentRoutes || [];
    let oppMightHaveClaw = false;
    if (madHouses) {
      const madArr = Array.isArray(madHouses) ? madHouses : [madHouses];
      oppMightHaveClaw = oppRoutes.some(r => r.route?.some(h => madArr.includes(h)));
    }
    const dogProb = oppMightHaveClaw ? 0.7 : 0.3;
    if (Math.random() < dogProb) {
      return dog.id;
    }
  }

  // Defender: 護衛を探索に出さない
  const candidates = liv.filter(p => {
    if (archParams.guardProtection && p.role === 'guard') return false;
    if (p.role === 'wolf') return false;
    return true;
  });

  // 一般村人を送る
  const plain = candidates.filter(p => p.role === 'villager' || p.role === 'dog');
  return (plain.length ? rnd(plain) : rnd(candidates.length ? candidates : liv)).id;
}

/**
 * CPUのルート選択
 */
function cpuSelectRoute(v, o, config) {
  const aiParams = getAIParams();
  const archParams = getArchetypeParams(v);
  const mem = v.cpuMemory;
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

  // アイテム位置を収集
  const itemHouses = [];

  // 護衛届の家（まだ持っていなければ）
  if (!v.permit && G.permitHouse?.[v.id]) {
    const h = G.permitHouse[v.id];
    const houses = Array.isArray(h) ? h : [h];
    itemHouses.push(...houses);
    // Defender: 護衛届を最優先
    if (archParams.permitPriority > 1) {
      targets = [...houses, ...targets.filter(t => !houses.includes(t))].slice(0, 3);
    }
  }

  // 狂人の爪（Day1-2で価値あり）
  if (G.opt?.madmanDog && G.day <= 2 && G.madHouse?.[v.id]) {
    const h = G.madHouse[v.id];
    itemHouses.push(...(Array.isArray(h) ? h : [h]));
  }

  // 霊媒の札（攻撃予定があれば価値あり）
  if (G.opt?.medium && v.sharpenStart !== null && G.mediumHouse?.[v.id]) {
    const h = G.mediumHouse[v.id];
    itemHouses.push(...(Array.isArray(h) ? h : [h]));
  }

  // 候補ルート生成
  const candidates = [];

  // 張り込み系
  targets.forEach(t => {
    candidates.push({ route: stake2(t), type: 'stake2', score: 0 });
    // Hunter/狼送り: stake3を追加
    if (v._sendWolf || archParams.stake3Preference > 0.5) {
      candidates.push({ route: stake3(t), type: 'stake3', score: archParams.stake3Preference || 0 });
    }
  });

  // 巡回系
  for (let i = 0; i < 3; i++) {
    candidates.push({ route: tour(), type: 'tour', score: 0 });
  }

  // スコアリング
  candidates.forEach(c => {
    // 狼確率の高い家を通るルートにボーナス
    targets.forEach((t, idx) => {
      if (c.route.includes(t)) c.score += (3 - idx) * 0.5;
    });

    // アイテムの家を通るルートにボーナス
    itemHouses.forEach(h => {
      if (c.route.includes(h)) c.score += 0.8;
    });

    // 落とし穴回避
    const pitHits = countPitHits(c.route, o.pitSeen || []);
    c.score -= pitHits * 5;

    // ランダム要素
    c.score += Math.random() * (archParams.randomFactor || 1);
  });

  // 最高スコアのルートを選択
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].route;
}

/**
 * CPUの護衛選択
 */
function cpuPickProtect(v, o) {
  const archParams = getArchetypeParams(v);

  const guard = alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf');
  if (!guard.length) return null;

  // ランダム選択（アーキタイプで調整）
  if (Math.random() < 0.15 * archParams.randomFactor) {
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
    const archParams = getArchetypeParams(v);

    if (w.alive && v.explorer !== w.id && cpuSharpen(v, o, 1)) {
      const tick = cpuSelectSharpenTick(v, o);
      setSharpenTiming(v.id, tick);
    }

    // 狂人の爪
    if (madActive(v)) {
      const m = v.people.find(p => p.role === 'madman');
      // Gambler: 狂人を別タイミングで鳴らす（欺瞞的）
      if (archParams.madClawUsage === 'deceptive' && v.sharpenStart !== null) {
        const madTick = v.sharpenStart === 1 ? 3 : 1;
        setMadSharpenTiming(v.id, madTick);
      } else {
        // 通常: 狼と同タイミングまたは最適タイミング
        let best = null, bestScore = -1;
        for (let k = 1; k <= TICKS - SHARPEN + 1; k++) {
          let sc = [0, 1, 2].map(i => k + i).filter(t => t <= TICKS).filter(t => o.route[t - 1] === m.house).length;
          if (v.sharpenStart !== null && k === v.sharpenStart) sc += 0.5;
          if (sc > bestScore) { bestScore = sc; best = k; }
        }
        const madStart = (bestScore >= 1) ? best : (v.sharpenStart !== null ? v.sharpenStart : best);
        setMadSharpenTiming(v.id, madStart);
      }
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
