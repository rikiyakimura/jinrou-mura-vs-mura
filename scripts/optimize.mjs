/**
 * アーキタイプパラメータ最適化
 *
 * 各アーキタイプを独自の評価指標で最適化する
 * - Hunter: 即勝利率を最大化
 * - Defender: 村人生存率を最大化
 * - Analyst: 狼位置特定精度を最大化
 * - Gambler: 勝利パターン多様性を最大化
 */

import {
  NAMES, setPreset, getConfig, getPreset, TICKS, SHARPEN, SPOIL, EXPOSE,
  AI_PARAMS, edgeKey
} from './sim-constants.mjs';

// ========== ユーティリティ ==========
const rnd = a => a[Math.floor(Math.random() * a.length)];
const shuf = a => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const other = p => p === 1 ? 2 : 1;

// ========== アーキタイプ定義 ==========
const ARCHETYPES = {
  hunter: {
    name: 'Hunter（狩人）',
    description: '狼を探索者として送り、相手の狼を暴いて即勝利を狙う',
    // パラメータ範囲（最適化対象）
    params: {
      wolfExplorerProb: 0.5,      // 狼を探索者として送る確率
      stake3Preference: 0.8,      // 3ティック張り込みの優先度
      sharpenTiming: 'early',     // 爪研ぎタイミング（early: tick 1優先）
      aggressiveness: 1.3         // 攻撃性（爪研ぎ確率乗数）
    }
  },
  defender: {
    name: 'Defender（守護者）',
    description: '護衛届を優先取得し、重要な村人を守る',
    params: {
      wolfExplorerProb: 0.15,
      permitPriority: 2.0,        // 護衛届の重要度
      guardProtection: true,      // 護衛を探索に出さない
      sharpenTiming: 'late',      // 爪研ぎタイミング（late: tick 3優先）
      aggressiveness: 0.85
    }
  },
  analyst: {
    name: 'Analyst（分析者）',
    description: '音情報を分析し、統計的に最適な判断を行う',
    params: {
      wolfExplorerProb: 0.3,
      soundWeightMultiplier: 1.5, // 音情報の重み
      patternAnalysis: true,      // パターン分析を使用
      sharpenTiming: 'calculated', // 計算に基づくタイミング
      aggressiveness: 1.0
    }
  },
  gambler: {
    name: 'Gambler（賭博師）',
    description: '予測困難な動きで相手を撹乱',
    params: {
      wolfExplorerProb: 0.4,      // Day1-2は高め
      randomFactor: 2.5,          // ランダム要素
      madClawUsage: 'deceptive',  // 狂人の爪を欺瞞的に使用
      sharpenTiming: 'random',
      aggressiveness: 1.1
    }
  },
  opportunist: {
    name: 'Opportunist（日和見）',
    description: '戦況を見て攻守を切り替える適応型',
    params: {
      adaptiveMode: true,         // 状況適応モード
      aggressiveThreshold: -1,    // 生存者差がこれ以下なら攻撃的
      defensiveThreshold: 1,      // 生存者差がこれ以上なら守備的
      wolfConfidenceThreshold: 0.4, // この確率以上で狼位置確信
      sharpenTiming: 'adaptive',
      aggressiveness: 1.0
    }
  }
};

// ========== ゲーム状態 ==========
let G = null;

// ========== 状態アクセサ ==========
const wolfOf = v => v.people.find(p => p.role === 'wolf');
const guardOf = v => v.people.find(p => p.role === 'guard');
const dogOf = v => v.people.find(p => p.role === 'dog');
const alive = v => v.people.filter(p => p.alive);
const madActive = v => {
  const m = v.people.find(p => p.role === 'madman');
  return m && m.alive && v.explorer !== m.id && v.madClaw;
};

// ========== 村生成 ==========
function initCPUMemory(config, archetype) {
  const wolfProbability = {};
  const prob = 1 / config.HOUSES.length;
  config.HOUSES.forEach(h => { wolfProbability[h] = prob; });
  return {
    archetype,
    opponentRoutes: [],
    opponentExplorers: [],
    wolfProbability,
    soundReports: [],
    correctPredictions: 0,
    totalPredictions: 0
  };
}

function rolesFor(opt) {
  const config = getConfig();
  const r = ['wolf', 'guard'];
  if (opt.madmanDog) r.push('madman', 'dog');
  if (opt.medium) r.push('medium');
  while (r.length < config.VILLAGERS) r.push('villager');
  return shuf(r);
}

const ROLE_ORDER = { wolf: 0, guard: 1, madman: 2, dog: 3, medium: 4, villager: 5 };

function mkVillage(id, names, isCPU, opt, archetype) {
  const config = getConfig();
  const roles = rolesFor(opt);
  const people = names.map((n, i) => ({
    id: i, name: n, role: roles[i], house: null, alive: true
  }));
  people.sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
  people.forEach((p, i) => { p.id = i; });

  return {
    id, isCPU, people,
    permit: false, fed: false, hungryStreak: 0,
    explorer: null, route: [], sharpenStart: null, spoiled: false,
    attackTarget: null, protectTarget: null,
    log: [], reveal: [], placeIdx: 0,
    permitFound: null, notice: null, memo: [],
    heardToday: null, madClaw: false, madClawFound: null, madStart: null,
    mediumFound: null, mediumResult: null,
    pitEdge: [], pitSeen: [],
    gotPermit: false, gotClaw: false, gotMedium: false,
    suspicion: {},
    cpuMemory: isCPU ? initCPUMemory(config, archetype) : null
  };
}

// ========== スケジュール ==========
function buildSchedule(opt) {
  const config = getConfig();
  const s = [{ who: 1, ph: 'place' }];
  if (opt.pit) s.push({ who: 1, ph: 'pit' });
  s.push({ who: 2, ph: 'place' });
  if (opt.pit) s.push({ who: 2, ph: 'pit' });

  for (let d = 1; d <= config.DAYS; d++) {
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

// ========== 判定処理 ==========
const sharpenTicks = v => v.sharpenStart === null ? [] : [0, 1, 2].map(i => v.sharpenStart + i).filter(t => t <= TICKS);

function overlapFull(v, route) {
  const w = wolfOf(v);
  return sharpenTicks(v).filter(t => route[t - 1] === w.house).length;
}

function madSharpenTicks(v) {
  if (!madActive(v)) return [];
  const start = v.madStart;
  if (start === null || start === undefined) return [];
  return [0, 1, 2].map(i => start + i).filter(t => t <= TICKS);
}

function overlapMad(v, route) {
  const m = v.people.find(p => p.role === 'madman');
  if (!m || !madActive(v)) return 0;
  return madSharpenTicks(v).filter(t => route[t - 1] === m.house).length;
}

function canAttack(v) {
  const w = wolfOf(v);
  return w.alive && v.explorer !== w.id && v.sharpenStart !== null && !v.spoiled && sharpenTicks(v).length === SHARPEN;
}

function canProtect(v) {
  const g = guardOf(v);
  return g.alive && v.permit && v.explorer !== g.id && alive(v).some(p => p.role !== 'guard' && p.role !== 'wolf');
}

// ========== アクション ==========
function placeVillagers(playerId, houses) {
  const v = G.V[playerId];
  houses.forEach((h, i) => { v.people[i].house = h; });
  v.placeIdx = getConfig().VILLAGERS;
}

function placePit(playerId, edges) {
  G.V[playerId].pitEdge = edges;
}

function selectExplorer(playerId, personId) {
  const v = G.V[playerId];
  v.explorer = personId;
  v.mediumResult = null;
}

function setRoute(playerId, route) {
  const v = G.V[playerId];
  const o = G.V[other(playerId)];
  v.route = route;

  let held = { permit: false, mad: false, medium: false };
  let got = { permit: false, mad: false, medium: false };

  for (let i = 0; i < route.length; i++) {
    const pitKey = i > 0 && route[i - 1] !== route[i] ? edgeKey(route[i - 1], route[i]) : null;
    if (pitKey && o.pitEdge && o.pitEdge.includes(pitKey)) {
      if (!o.pitSeen) o.pitSeen = [];
      if (!o.pitSeen.includes(pitKey)) o.pitSeen.push(pitKey);
      held = { permit: false, mad: false, medium: false };
    }

    const h = route[i];
    const permitHouses = G.permitHouse[playerId];
    if ((Array.isArray(permitHouses) ? permitHouses.includes(h) : permitHouses === h) && !got.permit) {
      held.permit = true; got.permit = true; got.permitFoundHouse = h;
    }
    const madHouses = G.madHouse[playerId];
    if (madHouses && (Array.isArray(madHouses) ? madHouses.includes(h) : madHouses === h) && !got.mad) {
      held.mad = true; got.mad = true; got.madFoundHouse = h;
    }
    const mediumHouses = G.mediumHouse[playerId];
    if (mediumHouses && (Array.isArray(mediumHouses) ? mediumHouses.includes(h) : mediumHouses === h) && !got.medium) {
      held.medium = true; got.medium = true; got.mediumFoundHouse = h;
    }
  }

  v.permit = held.permit;
  v.permitFound = held.permit ? got.permitFoundHouse : null;
  v.madClaw = held.mad;
  v.madClawFound = held.mad ? got.madFoundHouse : null;
  v.mediumFound = held.medium ? got.mediumFoundHouse : null;
  v.gotPermit = got.permit;
  v.gotClaw = got.mad;
  v.gotMedium = got.medium;
}

function setSharpenTiming(playerId, startTick) {
  G.V[playerId].sharpenStart = startTick;
}

function setMadSharpenTiming(playerId, startTick) {
  G.V[playerId].madStart = startTick;
}

function setAttackTarget(playerId, targetPersonId) {
  G.V[playerId].attackTarget = targetPersonId;
}

function setProtectTarget(playerId, targetPersonId) {
  G.V[playerId].protectTarget = targetPersonId;
}

// ========== アーキタイプ別CPU AI ==========
function getArchetypeParams(v) {
  const archName = v.cpuMemory?.archetype || 'analyst';
  return ARCHETYPES[archName]?.params || ARCHETYPES.analyst.params;
}

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
  return HOUSES.slice(0, TICKS);
}

function stake2(t) {
  const { ADJ } = getConfig();
  const a = rnd(ADJ[t]);
  return [t, t, a, a, rnd(ADJ[a].concat([a]))];
}

function stake3(t) {
  const { ADJ } = getConfig();
  const a = rnd(ADJ[t]), b = rnd(ADJ[t]), pat = Math.floor(Math.random() * 3);
  if (pat === 0) return [t, t, t, a, rnd(ADJ[a].concat([a]))];
  if (pat === 1) return [a, t, t, t, b];
  return [rnd(ADJ[a].concat([a])), a, t, t, t];
}

function cpuSharpen(v, o) {
  const params = getArchetypeParams(v);
  const config = getConfig();
  const baseProb = AI_PARAMS[getPreset()].sharpenBaseProb;

  let aggressiveness = params.aggressiveness;

  // Opportunist: 状況に応じて攻撃性を調整
  if (params.adaptiveMode) {
    const mySurvivors = alive(v).length;
    const oppSurvivors = alive(o).length;
    const diff = mySurvivors - oppSurvivors;

    if (diff <= (params.aggressiveThreshold || -1)) {
      // 劣勢 → より攻撃的に
      aggressiveness = 1.4;
    } else if (diff >= (params.defensiveThreshold || 1)) {
      // 優勢 → より守備的に
      aggressiveness = 0.7;
    }
  }

  let prob = baseProb * aggressiveness;
  prob += (v.hungryStreak || 0) * 0.15;
  prob += (G.day / config.DAYS) * 0.15;

  return Math.random() < Math.min(0.95, prob);
}

function cpuSelectSharpenTick(v, o, params) {
  const timing = params.sharpenTiming;
  if (timing === 'early') return 1;
  if (timing === 'late') return 3;
  if (timing === 'random') return 1 + Math.floor(Math.random() * 3);
  if (timing === 'adaptive') {
    // Opportunist: 状況に応じて変える
    const mySurvivors = alive(v).length;
    const oppSurvivors = alive(o).length;
    if (mySurvivors < oppSurvivors) {
      return 1; // 劣勢 → 早めに確定
    } else if (mySurvivors > oppSurvivors) {
      return 3; // 優勢 → 様子見
    }
    return 2;
  }
  // calculated: デフォルトは中間
  return 2;
}

function cpuPlace(v, config) {
  const { HOUSES, ADJ } = config;
  const scored = HOUSES.map(h => ({
    house: h,
    score: ADJ[h].length + Math.random() * 0.5
  }));
  scored.sort((a, b) => b.score - a.score);
  const wolfHouse = scored[0].house;
  return [wolfHouse, ...shuf(HOUSES.filter(h => h !== wolfHouse))];
}

function cpuPlacePit(v, o, config) {
  const { EDGE_KEYS, PITS, ADJ } = config;
  const w = wolfOf(v);

  // 相手のアイテム位置（ゲーム開始時点ではまだ不明だが、後の日では分かる）
  const oppItemHouses = [];
  const permitH = G.permitHouse[o.id];
  if (permitH) oppItemHouses.push(...(Array.isArray(permitH) ? permitH : [permitH]));
  const madH = G.madHouse[o.id];
  if (madH) oppItemHouses.push(...(Array.isArray(madH) ? madH : [madH]));
  const medH = G.mediumHouse[o.id];
  if (medH) oppItemHouses.push(...(Array.isArray(medH) ? medH : [medH]));

  const edgeScores = EDGE_KEYS.map(edge => {
    const [a, b] = edge.split('-');
    let score = 0;
    // 中央接続は通行頻度が高い
    if (a === 'c' || b === 'c') score += 1.5;
    // 自村の狼の家からの辺は防御に有効
    if (a === w.house || b === w.house) score += 1.0;
    // 相手のアイテムの家からの辺を狙う
    if (oppItemHouses.includes(a) || oppItemHouses.includes(b)) score += 1.2;
    score += Math.random() * 0.4;
    return { edge, score };
  });
  edgeScores.sort((a, b) => b.score - a.score);
  return edgeScores.slice(0, PITS).map(e => e.edge);
}

function cpuSelectExplorer(v, o) {
  const params = getArchetypeParams(v);
  const w = wolfOf(v);
  const dog = dogOf(v);
  const liv = alive(v);
  const g = guardOf(v);
  const mem = v.cpuMemory;

  // 狼を送る確率
  let wolfProb = params.wolfExplorerProb || 0.3;

  // Gambler: 日によって変える
  if (params.randomFactor > 2) {
    wolfProb = G.day <= 2 ? params.wolfExplorerProb : 0.1;
  }

  // Opportunist: 狼位置に高確信があれば狼を送る
  if (params.adaptiveMode && mem && mem.wolfProbability) {
    const topProb = Math.max(...Object.values(mem.wolfProbability));
    const threshold = params.wolfConfidenceThreshold || 0.4;
    if (topProb >= threshold && v.memo.length >= 2) {
      // 高確信 → 狼を送って即勝利狙い
      wolfProb = 0.7;
    }
  }

  // 情報がなければ送らない
  if (!v.memo.length) wolfProb = 0;

  if (w.alive && Math.random() < wolfProb) {
    v._sendWolf = true;
    return w.id;
  }
  v._sendWolf = false;

  // 犬飼いを送る判断: 相手が狂人の爪を取った可能性がある時
  if (dog && dog.alive && G.opt.madmanDog) {
    const madHouses = G.madHouse[o.id];
    const oppRoutes = mem?.opponentRoutes || [];
    // 相手が狂人の爪の家を通ったか確認
    let oppMightHaveClaw = false;
    if (madHouses) {
      const madArr = Array.isArray(madHouses) ? madHouses : [madHouses];
      oppMightHaveClaw = oppRoutes.some(r => r.route.some(h => madArr.includes(h)));
    }
    // 相手が爪を取った可能性が高ければ犬飼いを送る
    const dogProb = oppMightHaveClaw ? 0.7 : 0.3;
    if (Math.random() < dogProb) {
      return dog.id;
    }
  }

  // Defender: 護衛を探索に出さない
  const candidates = liv.filter(p => {
    if (params.guardProtection && p.role === 'guard') return false;
    if (p.role === 'wolf') return false;
    return true;
  });

  const plain = candidates.filter(p => p.role === 'villager' || p.role === 'dog');
  return (plain.length ? rnd(plain) : rnd(candidates.length ? candidates : liv)).id;
}

function cpuSelectRoute(v, o, config) {
  const params = getArchetypeParams(v);
  const { HOUSES } = config;
  const mem = v.cpuMemory;

  let targets;
  if (mem && mem.wolfProbability) {
    targets = Object.entries(mem.wolfProbability)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);
  } else {
    targets = v.memo.length ? v.memo.slice(0, 3) : [rnd(HOUSES)];
  }

  // アイテム位置を収集
  const itemHouses = [];

  // 護衛届の家（まだ持っていなければ）
  if (!v.permit) {
    const permitH = G.permitHouse[v.id];
    if (permitH) {
      const houses = Array.isArray(permitH) ? permitH : [permitH];
      itemHouses.push(...houses);
      // Defender: 護衛届を最優先
      if (params.permitPriority > 1) {
        targets = [...houses, ...targets.filter(h => !houses.includes(h))].slice(0, 3);
      }
    }
  }

  // 狂人の爪（Day1-2で価値あり）
  if (G.opt.madmanDog && G.day <= 2) {
    const madH = G.madHouse[v.id];
    if (madH) {
      const houses = Array.isArray(madH) ? madH : [madH];
      itemHouses.push(...houses);
    }
  }

  // 霊媒の札（攻撃予定があれば価値あり）
  if (G.opt.medium && v.sharpenStart !== null) {
    const medH = G.mediumHouse[v.id];
    if (medH) {
      const houses = Array.isArray(medH) ? medH : [medH];
      itemHouses.push(...houses);
    }
  }

  const candidates = [];
  targets.forEach(t => {
    candidates.push({ route: stake2(t), type: 'stake2', score: 0 });
    // Hunter: stake3を優先
    if (v._sendWolf || params.stake3Preference > 0.5) {
      candidates.push({ route: stake3(t), type: 'stake3', score: params.stake3Preference || 0 });
    }
  });
  for (let i = 0; i < 3; i++) {
    candidates.push({ route: tour(), type: 'tour', score: 0 });
  }

  candidates.forEach(c => {
    // 狼確率の高い家を通るルートにボーナス
    targets.forEach((t, idx) => {
      if (c.route.includes(t)) c.score += (3 - idx) * 0.5;
    });
    // アイテムの家を通るルートにボーナス
    itemHouses.forEach(h => {
      if (c.route.includes(h)) c.score += 0.8;
    });
    // 落とし穴を避ける
    const pitHits = countPitHits(c.route, o.pitSeen || []);
    c.score -= pitHits * 5;
    c.score += Math.random() * (params.randomFactor || 1);
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].route;
}

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

function cpuPickAttack(v, o) {
  const targets = alive(o);
  if (!targets.length) return null;

  // 霊媒結果から相手の狼でないことが分かった人を記録
  const knownNotWolf = new Set();
  if (v.mediumResult && v.mediumResult.role !== 'wolf') {
    // 前回殺した人は狼ではなかった → 残りの誰かが狼
  }

  const scored = targets.map(p => {
    let score = Math.random() * 2;
    // 探索に出ている人は狙いやすい（護衛されにくい）
    if (o.explorer === p.id) score += 1.5;
    // 護衛は殺せない可能性が高いので優先度下げ
    if (p.role === 'guard' && o.permit) score -= 0.5;
    // 狂人は殺しても相手は困らない
    if (p.role === 'madman') score -= 0.3;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

function cpuPickProtect(v, o) {
  const guard = alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf');
  if (!guard.length) return null;

  const scored = guard.map(p => {
    let score = 0;
    const roleValue = { medium: 4, dog: 3, madman: 1, villager: 2 };
    score += roleValue[p.role] || 1;
    score += Math.random() * 0.5;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

function updateWolfProbability(mem, heardAt, route, config) {
  const ADJ = config.ADJ;
  const prob = mem.wolfProbability;

  if (heardAt) {
    const candidates = [heardAt, ...(ADJ[heardAt] || [])];
    candidates.forEach(h => { if (prob[h] !== undefined) prob[h] *= 1.5; });
    Object.keys(prob).forEach(h => {
      if (!candidates.includes(h)) prob[h] *= 0.7;
    });
  } else {
    route.forEach(h => { if (prob[h] !== undefined) prob[h] *= 0.6; });
  }

  const sum = Object.values(prob).reduce((a, b) => a + b, 0);
  if (sum > 0) Object.keys(prob).forEach(h => { prob[h] /= sum; });
}

function updateCPUMemory(v, o, config) {
  const mem = v.cpuMemory;
  if (!mem) return;

  mem.opponentRoutes.push({ day: G.day, route: [...(o.route || [])], explorer: o.explorer });
  mem.opponentExplorers.push(o.explorer);
  mem.soundReports.push({ day: G.day, heard: v.heardToday, route: [...(v.route || [])] });

  // 予測精度を記録（音を聞く前の予測と実際の狼位置を比較）
  const actualWolfHouse = wolfOf(o).house;
  const topGuess = Object.entries(mem.wolfProbability).sort((a, b) => b[1] - a[1])[0];
  if (topGuess) {
    mem.totalPredictions++;
    if (topGuess[0] === actualWolfHouse) {
      mem.correctPredictions++;
    }
  }

  // 音情報で確率を更新
  const heardAt = v.heardToday ? actualWolfHouse : null;
  updateWolfProbability(mem, heardAt, v.route || [], config);
}

function runCPU(c, v) {
  const o = G.V[other(v.id)];
  const config = getConfig();
  const params = getArchetypeParams(v);

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
    if (w.alive && v.explorer !== w.id && cpuSharpen(v, o)) {
      const tick = cpuSelectSharpenTick(v, o, params);
      setSharpenTiming(v.id, tick);
    }

    if (madActive(v)) {
      const m = v.people.find(p => p.role === 'madman');
      // Gambler: 狂人を別タイミングで鳴らす
      if (params.madClawUsage === 'deceptive' && v.sharpenStart) {
        const madTick = v.sharpenStart === 1 ? 3 : 1;
        setMadSharpenTiming(v.id, madTick);
      } else {
        setMadSharpenTiming(v.id, v.sharpenStart || 1);
      }
    }

    G.tickIdx = TICKS;
    if (overlapFull(v, o.route) >= SPOIL) v.spoiled = true;
    updateCPUMemory(v, o, config);
    return;
  }

  if (c.ph === 'night') {
    setAttackTarget(v.id, canAttack(v) ? cpuPickAttack(v, o) : null);
    setProtectTarget(v.id, canProtect(v) ? cpuPickProtect(v, o) : null);
    return;
  }
}

// ========== 判定処理 ==========
function resolveDay() {
  const A = G.V[1], B = G.V[2];
  [A, B].forEach(v => {
    const e = G.V[other(v.id)];
    if (overlapFull(v, e.route || []) >= SPOIL) v.spoiled = true;
  });

  function hearing(att, def) {
    const explorerPerson = att.people[att.explorer];
    const isDog = explorerPerson && explorerPerson.role === 'dog';
    const wolfHit = overlapFull(def, att.route || []);
    const madHit = madActive(def) ? overlapMad(def, att.route || []) : 0;
    return { isDog, wolfHit, madHit };
  }

  const rHearA = hearing(A, B), rHearB = hearing(B, A);
  A.heardToday = rHearA.isDog ? (rHearA.wolfHit >= 1) : ((rHearA.wolfHit + rHearA.madHit) >= 1);
  B.heardToday = rHearB.isDog ? (rHearB.wolfHit >= 1) : ((rHearB.wolfHit + rHearB.madHit) >= 1);
  if (rHearA.wolfHit >= 1) A.memo = A.memo.concat([wolfOf(B).house]);
  if (rHearB.wolfHit >= 1) B.memo = B.memo.concat([wolfOf(A).house]);

  const aWin = (A.explorer === wolfOf(A).id) && rHearA.wolfHit >= EXPOSE;
  const bWin = (B.explorer === wolfOf(B).id) && rHearB.wolfHit >= EXPOSE;

  if (aWin || bWin) {
    G.instantWin = (aWin && bWin) ? 'draw' : (aWin ? 1 : 2);
    if (aWin) wolfOf(B).alive = false;
    if (bWin) wolfOf(A).alive = false;
    G.done = true;
  }
}

function resolveNight() {
  const A = G.V[1], B = G.V[2];

  const strike = (att, def) => {
    if (!canAttack(att) || att.attackTarget === null) return null;
    const t = def.people[att.attackTarget];
    if (!t || !t.alive) return null;
    if (def.protectTarget === t.id) return { ok: false, why: 'guard' };
    if (t.role === 'wolf') return { ok: false, why: 'wolf' };
    t.alive = false; att.fed = true; att.hungryStreak = 0;
    // 霊媒師の札を持っていれば役職が分かる
    if (att.mediumFound) {
      att.mediumResult = { personId: t.id, role: t.role };
    }
    return { ok: true, victim: t };
  };

  const rA = strike(A, B), rB = strike(B, A);

  if (!rA || !rA.ok) A.hungryStreak = (A.hungryStreak || 0) + 1;
  if (!rB || !rB.ok) B.hungryStreak = (B.hungryStreak || 0) + 1;

  const aStarved = A.hungryStreak >= 3;
  const bStarved = B.hungryStreak >= 3;

  if (aStarved || bStarved) {
    G.starved = true;
    if (aStarved) wolfOf(A).alive = false;
    if (bStarved) wolfOf(B).alive = false;
    if (aStarved && bStarved) {
      G.instantWin = alive(A).length > alive(B).length ? 1 : (alive(B).length > alive(A).length ? 2 : 'draw');
    } else {
      G.instantWin = aStarved ? 2 : 1;
    }
    G.done = true;
  }
}

// ========== ゲーム実行 ==========
function runGame(opt, arch1, arch2) {
  setPreset(opt.large ? 'large' : 'classic');
  const config = getConfig();
  const pool = shuf([...NAMES]);

  G = {
    mode: 'cpu', opt,
    V: {
      1: mkVillage(1, pool.slice(0, config.VILLAGERS), true, opt, arch1),
      2: mkVillage(2, pool.slice(config.VILLAGERS, config.VILLAGERS * 2), true, opt, arch2)
    },
    sched: buildSchedule(opt),
    idx: 0, day: 1, tickIdx: 0,
    instantWin: null, starved: false,
    permitHouse: { 1: null, 2: null },
    madHouse: { 1: null, 2: null },
    mediumHouse: { 1: null, 2: null },
    done: false
  };

  startDay();

  let guard = 0;
  while (!G.done && guard++ < 1000) {
    const c = G.sched[G.idx];
    if (!c) break;

    if (c.who === 0) {
      if (c.ph === 'morning') {
        if (G.day >= config.DAYS) G.done = true;
        else G.idx++;
      } else if (c.ph === 'end') break;
      continue;
    }

    runCPU(c, G.V[c.who]);

    if (c.ph === 'ticks' && c.who === 2) {
      resolveDay();
      if (G.done) break;
    }

    if (c.ph === 'night' && c.who === 1) {
      resolveNight();
      if (G.done) break;
      if (G.day < config.DAYS) startDay();
    }

    G.idx++;
    const next = G.sched[G.idx];
    if (next && next.day) G.day = next.day;
  }

  const v1 = G.V[1], v2 = G.V[2];
  const alive1 = alive(v1).length, alive2 = alive(v2).length;

  let winner;
  if (G.instantWin === 'draw') winner = 0;
  else if (G.instantWin) winner = G.instantWin;
  else if (alive1 > alive2) winner = 1;
  else if (alive2 > alive1) winner = 2;
  else winner = 0;

  // アーキタイプ別メトリクス
  const mem1 = v1.cpuMemory, mem2 = v2.cpuMemory;

  return {
    winner,
    instantWin: G.instantWin,
    starved: G.starved,
    alive1, alive2,
    days: G.day,
    // P1のメトリクス
    p1: {
      archetype: mem1?.archetype,
      instantWin: G.instantWin === 1,
      survivors: alive1,
      predictionAccuracy: mem1?.totalPredictions > 0 ? mem1.correctPredictions / mem1.totalPredictions : 0,
      wolfSent: v1._sendWolf || false
    },
    // P2のメトリクス
    p2: {
      archetype: mem2?.archetype,
      instantWin: G.instantWin === 2,
      survivors: alive2,
      predictionAccuracy: mem2?.totalPredictions > 0 ? mem2.correctPredictions / mem2.totalPredictions : 0,
      wolfSent: v2._sendWolf || false
    }
  };
}

function startDay() {
  const config = getConfig();
  [1, 2].forEach(p => {
    const v = G.V[p];
    v.permit = false; v.route = []; v.sharpenStart = null; v.spoiled = false;
    v.explorer = null; v.attackTarget = null; v.protectTarget = null;
    v.permitFound = null; v.notice = null; v.heardToday = null;
    v.madClaw = false; v.madClawFound = null; v.madStart = null;
    v.mediumFound = null; v.gotPermit = false; v.gotClaw = false; v.gotMedium = false;
  });
  G.tickIdx = 0;

  const HOUSES = config.HOUSES;
  [1, 2].forEach(p => {
    const shuffled = shuf([...HOUSES]);
    if (G.opt.large) {
      G.permitHouse[p] = [shuffled[0], shuffled[1]];
      G.madHouse[p] = G.opt.madmanDog ? [shuffled[2], shuffled[3]] : null;
      G.mediumHouse[p] = G.opt.medium ? [shuffled[4], shuffled[5]] : null;
    } else {
      G.permitHouse[p] = shuffled[0];
      G.madHouse[p] = G.opt.madmanDog ? shuffled[1] : null;
      G.mediumHouse[p] = G.opt.medium ? shuffled[2] : null;
    }
  });
}

// ========== 評価関数 ==========
function evaluateArchetype(archetype, results) {
  switch (archetype) {
    case 'hunter':
      // 即勝利率を最大化
      return results.instantWinRate;
    case 'defender':
      // 生存者率を最大化
      return results.avgSurvivors / (getConfig().VILLAGERS);
    case 'analyst':
      // 予測精度を最大化
      return results.avgPredictionAccuracy;
    case 'gambler':
      // 勝利パターンの多様性（エントロピー）
      const methods = [results.instantWins, results.normalWins, results.starvedWins];
      const total = methods.reduce((a, b) => a + b, 0);
      if (total === 0) return 0;
      let entropy = 0;
      methods.forEach(m => {
        if (m > 0) {
          const p = m / total;
          entropy -= p * Math.log2(p);
        }
      });
      return entropy / Math.log2(3); // 正規化
    case 'opportunist':
      // 総合勝率を最大化（適応型なので勝つことが目標）
      return results.winRate;
    default:
      return results.winRate;
  }
}

// ========== シミュレーション ==========
function simulate(archetype, games, opt) {
  const results = {
    games,
    wins: 0,
    instantWins: 0,
    normalWins: 0,
    starvedWins: 0,
    totalSurvivors: 0,
    totalPredictionAccuracy: 0,
    predictionCount: 0
  };

  for (let i = 0; i < games; i++) {
    // 対戦相手はランダムなアーキタイプ
    const opponents = ['hunter', 'defender', 'analyst', 'gambler'];
    const opponent = rnd(opponents);

    const r = runGame(opt, archetype, opponent);

    if (r.winner === 1) {
      results.wins++;
      if (r.instantWin === 1) results.instantWins++;
      else if (r.starved) results.starvedWins++;
      else results.normalWins++;
    }

    results.totalSurvivors += r.p1.survivors;
    if (r.p1.predictionAccuracy > 0) {
      results.totalPredictionAccuracy += r.p1.predictionAccuracy;
      results.predictionCount++;
    }
  }

  return {
    winRate: results.wins / games,
    instantWinRate: results.instantWins / games,
    avgSurvivors: results.totalSurvivors / games,
    avgPredictionAccuracy: results.predictionCount > 0 ? results.totalPredictionAccuracy / results.predictionCount : 0,
    instantWins: results.instantWins,
    normalWins: results.normalWins,
    starvedWins: results.starvedWins
  };
}

// ========== メイン ==========
const args = process.argv.slice(2);
const games = parseInt(args.find(a => !a.startsWith('--')) || '200');
const opt = {
  large: args.includes('--large'),
  madmanDog: args.includes('--madmanDog'),
  medium: args.includes('--medium'),
  pit: args.includes('--pit')
};

console.log(`\n=== アーキタイプ評価 ===`);
console.log(`ゲーム数: ${games} x 4 = ${games * 4}`);
console.log(`オプション: ${JSON.stringify(opt)}\n`);

const archetypes = ['hunter', 'defender', 'analyst', 'gambler', 'opportunist'];
const evaluations = {};

for (const arch of archetypes) {
  console.log(`${ARCHETYPES[arch].name} を評価中...`);
  const results = simulate(arch, games, opt);
  const score = evaluateArchetype(arch, results);
  evaluations[arch] = { results, score };
}

console.log(`\n=== 結果 ===\n`);

for (const arch of archetypes) {
  const { results, score } = evaluations[arch];
  const archInfo = ARCHETYPES[arch];
  console.log(`【${archInfo.name}】`);
  console.log(`  ${archInfo.description}`);
  console.log(`  勝率: ${(results.winRate * 100).toFixed(1)}%`);
  console.log(`  即勝利率: ${(results.instantWinRate * 100).toFixed(1)}%`);
  console.log(`  平均生存者: ${results.avgSurvivors.toFixed(2)}`);
  console.log(`  予測精度: ${(results.avgPredictionAccuracy * 100).toFixed(1)}%`);
  console.log(`  評価スコア: ${(score * 100).toFixed(1)}%`);
  console.log();
}

// 最適パラメータの提案
console.log(`=== 現在のパラメータ ===\n`);
for (const arch of archetypes) {
  console.log(`${arch}: ${JSON.stringify(ARCHETYPES[arch].params)}`);
}

// パラメータ最適化モード
if (args.includes('--optimize')) {
  console.log(`\n=== パラメータ最適化 ===\n`);

  const targetArch = args.find(a => archetypes.includes(a)) || 'hunter';
  console.log(`対象: ${ARCHETYPES[targetArch].name}`);

  // パラメータ探索範囲
  const paramRanges = {
    hunter: {
      wolfExplorerProb: [0.3, 0.5, 0.7],
      stake3Preference: [0.5, 0.7, 0.9],
      aggressiveness: [1.0, 1.3, 1.5]
    },
    defender: {
      wolfExplorerProb: [0.05, 0.15, 0.25],
      permitPriority: [1.5, 2.0, 2.5],
      aggressiveness: [0.7, 0.85, 1.0]
    },
    analyst: {
      wolfExplorerProb: [0.2, 0.3, 0.4],
      soundWeightMultiplier: [1.2, 1.5, 2.0],
      aggressiveness: [0.9, 1.0, 1.1]
    },
    gambler: {
      wolfExplorerProb: [0.3, 0.4, 0.5],
      randomFactor: [2.0, 2.5, 3.0],
      aggressiveness: [1.0, 1.1, 1.2]
    },
    opportunist: {
      aggressiveThreshold: [-2, -1, 0],
      defensiveThreshold: [0, 1, 2],
      wolfConfidenceThreshold: [0.3, 0.4, 0.5]
    }
  };

  const ranges = paramRanges[targetArch];
  const keys = Object.keys(ranges);

  let best = { score: -Infinity, params: null };
  let tested = 0;
  const total = keys.reduce((acc, k) => acc * ranges[k].length, 1);

  // グリッドサーチ
  function* combinations(keys, ranges, current = {}) {
    if (keys.length === 0) {
      yield { ...current };
      return;
    }
    const [key, ...rest] = keys;
    for (const val of ranges[key]) {
      yield* combinations(rest, ranges, { ...current, [key]: val });
    }
  }

  for (const params of combinations(keys, ranges)) {
    // パラメータを一時的に上書き
    const original = { ...ARCHETYPES[targetArch].params };
    Object.assign(ARCHETYPES[targetArch].params, params);

    const results = simulate(targetArch, 50, opt);
    const score = evaluateArchetype(targetArch, results);

    tested++;
    if (tested % 5 === 0) {
      process.stdout.write(`\r  ${tested}/${total} 組み合わせをテスト中...`);
    }

    if (score > best.score) {
      best = { score, params: { ...ARCHETYPES[targetArch].params }, results };
    }

    // 元に戻す
    ARCHETYPES[targetArch].params = original;
  }

  console.log(`\n\n  最適パラメータ:`)
  console.log(`    ${JSON.stringify(best.params)}`);
  console.log(`  評価スコア: ${(best.score * 100).toFixed(1)}%`);
  console.log(`  勝率: ${(best.results.winRate * 100).toFixed(1)}%`);
  console.log(`  即勝利率: ${(best.results.instantWinRate * 100).toFixed(1)}%`);
  console.log(`  平均生存者: ${best.results.avgSurvivors.toFixed(2)}`);
}
