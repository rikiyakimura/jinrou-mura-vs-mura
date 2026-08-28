/**
 * CPU vs CPU シミュレーション（自己完結版）
 *
 * 使い方:
 *   node scripts/simulate.mjs [games] [options]
 *
 * 例:
 *   node scripts/simulate.mjs 100
 *   node scripts/simulate.mjs 50 --large
 *   node scripts/simulate.mjs 100 --madmanDog --medium
 */

// シミュレーション用の定数をインポート（JSON依存なし）
import {
  NAMES, setPreset, getConfig, getPreset, TICKS, SHARPEN, SPOIL, EXPOSE,
  ROLE_LABEL, AI_PARAMS, edgeKey
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

// ========== ゲーム状態 ==========
let G = null;

// ========== 状態アクセサ ==========
const wolfOf = v => v.people.find(p => p.role === 'wolf');
const guardOf = v => v.people.find(p => p.role === 'guard');
const dogOf = v => v.people.find(p => p.role === 'dog');
const madmanOf = v => v.people.find(p => p.role === 'madman');
const mediumOf = v => v.people.find(p => p.role === 'medium');
const alive = v => v.people.filter(p => p.alive);
const madActive = v => {
  const m = madmanOf(v);
  return m && m.alive && v.explorer !== m.id && v.madClaw;
};

// ========== パーソナリティ ==========
const PERSONALITY_NAMES = ['aggressive', 'cautious', 'analytical', 'chaotic'];
const PERSONALITIES = {
  aggressive: { wolfMult: 1.3, sharpenMult: 1.1, randomMult: 0.6, routePref: 'stake' },
  cautious:   { wolfMult: 0.7, sharpenMult: 0.85, randomMult: 1.0, routePref: 'tour' },
  analytical: { wolfMult: 1.0, sharpenMult: 1.0, randomMult: 0.5, routePref: 'pattern' },
  chaotic:    { wolfMult: 0.9, sharpenMult: 0.9, randomMult: 1.8, routePref: 'random' }
};

// ========== 村生成 ==========
function initCPUMemory(config) {
  const personality = rnd(PERSONALITY_NAMES);
  const wolfProbability = {};
  const prob = 1 / config.HOUSES.length;
  config.HOUSES.forEach(h => { wolfProbability[h] = prob; });
  return {
    personality,
    opponentRoutes: [],
    opponentExplorers: [],
    wolfProbability,
    roleInference: {},
    soundReports: [],
    attackResults: []
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

function mkVillage(id, names, isCPU, opt) {
  const config = getConfig();
  const roles = rolesFor(opt);
  const people = names.map((n, i) => ({
    id: i,
    name: n,
    role: roles[i],
    house: null,
    alive: true
  }));
  people.sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
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
    suspicion: {},
    cpuMemory: isCPU ? initCPUMemory(config) : null
  };
}

// ========== スケジュール ==========
function buildSchedule(opt) {
  opt = opt || {};
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
    const isPermitHouse = Array.isArray(permitHouses) ? permitHouses.includes(h) : permitHouses === h;
    if (isPermitHouse && !got.permit) {
      held.permit = true;
      got.permit = true;
      got.permitFoundHouse = h;
    }
    const madHouses = G.madHouse[playerId];
    const isMadHouse = madHouses && (Array.isArray(madHouses) ? madHouses.includes(h) : madHouses === h);
    if (isMadHouse && !got.mad) {
      held.mad = true;
      got.mad = true;
      got.madFoundHouse = h;
    }
    const mediumHouses = G.mediumHouse[playerId];
    const isMediumHouse = mediumHouses && (Array.isArray(mediumHouses) ? mediumHouses.includes(h) : mediumHouses === h);
    if (isMediumHouse && !got.medium) {
      held.medium = true;
      got.medium = true;
      got.mediumFoundHouse = h;
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

// ========== CPU AI ==========
function getAIParams() {
  const preset = getPreset();
  return AI_PARAMS[preset] || AI_PARAMS.classic;
}

function normalizeWolfProb(prob) {
  const sum = Object.values(prob).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    Object.keys(prob).forEach(h => { prob[h] /= sum; });
  }
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

  normalizeWolfProb(prob);
}

function updateCPUMemory(v, o, config) {
  const mem = v.cpuMemory;
  if (!mem) return;

  mem.opponentRoutes.push({
    day: G.day,
    route: [...(o.route || [])],
    explorer: o.explorer
  });
  mem.opponentExplorers.push(o.explorer);
  mem.soundReports.push({
    day: G.day,
    heard: v.heardToday,
    route: [...(v.route || [])]
  });

  const heardAt = v.heardToday ? wolfOf(o).house : null;
  updateWolfProbability(mem, heardAt, v.route || [], config);
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
  const x = rnd(ADJ[a].concat([a]));
  return [x, a, t, t, t];
}

function cpuSharpen(v, o, tick) {
  const params = getAIParams();
  const config = getConfig();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  let prob = params.sharpenBaseProb * pers.sharpenMult;
  prob += (v.hungryStreak || 0) * 0.15;
  prob += (G.day / config.DAYS) * 0.15;

  return Math.random() < Math.min(0.95, prob);
}

function cpuPickAttack(v, o) {
  const targets = alive(o);
  if (!targets.length) return null;

  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const susp = v.suspicion || {};

  if (Math.random() < 0.3 * pers.randomMult) {
    return rnd(targets).id;
  }

  const scored = targets.map(p => {
    let score = 0;
    const suspVal = susp[p.id] || 1;
    score += (1 - suspVal) * 2.0;
    if (o.explorer === p.id) score += params.explorerTargetBonus;
    if (mem && mem.opponentExplorers) {
      const expCount = mem.opponentExplorers.filter(e => e === p.id).length;
      score += expCount * 0.5;
    }
    score += Math.random() * params.randomFactor * pers.randomMult;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

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

function cpuPlace(v, config) {
  const { HOUSES, ADJ } = config;
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  const scored = HOUSES.map(h => ({
    house: h,
    score: ADJ[h].length + Math.random() * (pers.randomMult > 1 ? 2 : 0.5)
  }));
  scored.sort((a, b) => b.score - a.score);

  const wolfHouse = scored[0].house;
  const others = shuf(HOUSES.filter(h => h !== wolfHouse));
  return [wolfHouse, ...others];
}

function cpuPlacePit(v, o, config) {
  const { EDGE_KEYS, PITS } = config;
  const w = wolfOf(v);
  const mem = v.cpuMemory;

  const edgeScores = EDGE_KEYS.map(edge => {
    const [a, b] = edge.split('-');
    let score = 0;
    if (a === 'c' || b === 'c') score += 1.5;
    if (a === w.house || b === w.house) score += 1.0;
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

function cpuSelectExplorer(v, o) {
  const params = getAIParams();
  const config = getConfig();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const w = wolfOf(v);
  const dog = dogOf(v);
  const liv = alive(v);

  const safe = (v.hungryStreak || 0) < 2;
  let baseProb = safe ? params.wolfSendSafe : params.wolfSendHungry;
  baseProb *= pers.wolfMult;
  const dayFactor = 1 + (G.day - 1) * 0.1;
  baseProb *= dayFactor;
  if (!v.memo.length) baseProb = 0;

  if (w.alive && Math.random() < baseProb) {
    v._sendWolf = true;
    return w.id;
  }

  if (dog && dog.alive && v.memo.length && Math.random() < 0.4) {
    v._sendWolf = false;
    return dog.id;
  }

  const plain = liv.filter(p => p.role === 'villager' || p.role === 'dog');
  v._sendWolf = false;
  return (plain.length ? rnd(plain) : rnd(liv)).id;
}

function cpuSelectRoute(v, o, config) {
  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;
  const { HOUSES } = config;

  let targets;
  if (mem && mem.wolfProbability) {
    targets = Object.entries(mem.wolfProbability)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);
  } else {
    targets = v.memo.length ? v.memo.slice(0, 3) : [rnd(HOUSES)];
  }

  const candidates = [];
  targets.forEach(t => {
    candidates.push({ route: stake2(t), type: 'stake2', score: 0 });
    if (v._sendWolf) {
      candidates.push({ route: stake3(t), type: 'stake3', score: 0 });
    }
  });
  for (let i = 0; i < 3; i++) {
    candidates.push({ route: tour(), type: 'tour', score: 0 });
  }

  candidates.forEach(c => {
    targets.forEach((t, idx) => {
      if (c.route.includes(t)) c.score += (3 - idx) * 0.5;
    });
    if (pers.routePref === 'stake' && c.type.startsWith('stake')) c.score += 1;
    if (pers.routePref === 'tour' && c.type === 'tour') c.score += 1;
    const pitHits = countPitHits(c.route, o.pitSeen || []);
    c.score -= pitHits * 5;
    c.score += Math.random() * params.randomFactor * pers.randomMult;
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].route;
}

function cpuPickProtect(v, o) {
  const params = getAIParams();
  const mem = v.cpuMemory;
  const pers = mem ? PERSONALITIES[mem.personality] : PERSONALITIES.analytical;

  const guard = alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf');
  if (!guard.length) return null;

  if (Math.random() < 0.3 * pers.randomMult) {
    return rnd(guard).id;
  }

  const scored = guard.map(p => {
    let score = 0;
    const roleValue = { medium: 4, dog: 3, madman: 1, villager: 2 };
    score += roleValue[p.role] || 1;
    if (v.explorer === p.id) score += 1.5;
    score += Math.random() * 0.5;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p.id;
}

function runCPU(c, v) {
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
    updateCPUMemory(v, o, config);
    return;
  }

  if (c.ph === 'night') {
    cpuUpdateSuspicion(v, o);
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
    const explorerPerson = (att.explorer !== null && att.explorer !== undefined) ? att.people[att.explorer] : null;
    const isDog = explorerPerson && def === G.V[other(att.id)] && explorerPerson.role === 'dog';
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
    return;
  }
}

function resolveNight() {
  const A = G.V[1], B = G.V[2];

  const strike = (att, def) => {
    if (!canAttack(att) || att.attackTarget === null) return null;
    const t = def.people[att.attackTarget];
    if (!t || !t.alive) return null;
    if (def.protectTarget === t.id) return { ok: false, t, why: 'guard' };
    if (t.role === 'wolf') return { ok: false, t, why: 'wolf' };
    t.alive = false; att.fed = true; att.hungryStreak = 0; return { ok: true, t };
  };

  const rA = strike(A, B), rB = strike(B, A);

  if (!rA || !rA.ok) A.hungryStreak = (A.hungryStreak || 0) + 1;
  if (!rB || !rB.ok) B.hungryStreak = (B.hungryStreak || 0) + 1;

  const aStarved = (A.hungryStreak || 0) >= 3;
  const bStarved = (B.hungryStreak || 0) >= 3;

  if (aStarved || bStarved) {
    G.starved = true;
    if (aStarved) wolfOf(A).alive = false;
    if (bStarved) wolfOf(B).alive = false;
    if (aStarved && bStarved) {
      const aliveA = alive(A).length;
      const aliveB = alive(B).length;
      G.instantWin = aliveA > aliveB ? 1 : (aliveB > aliveA ? 2 : 'draw');
    } else {
      G.instantWin = aStarved ? 2 : 1;
    }
    G.done = true;
    return;
  }
}

// ========== ゲーム実行 ==========
function runGame(opt = {}) {
  opt = { madmanDog: false, medium: false, large: false, pit: false, ...opt };

  setPreset(opt.large ? 'large' : 'classic');
  const config = getConfig();

  const pool = shuf([...NAMES]);
  const villagerCount = config.VILLAGERS;

  G = {
    mode: 'cpu',
    opt,
    V: {
      1: mkVillage(1, pool.slice(0, villagerCount), true, opt),
      2: mkVillage(2, pool.slice(villagerCount, villagerCount * 2), true, opt)
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
    done: false
  };

  startDay();

  let guard = 0;
  while (!G.done && guard++ < 1000) {
    const c = G.sched[G.idx];
    if (!c) break;

    if (c.who === 0) {
      if (c.ph === 'morning') {
        if (G.day >= config.DAYS) {
          G.done = true;
        } else {
          G.idx++;
        }
      } else if (c.ph === 'end') {
        break;
      }
      continue;
    }

    const v = G.V[c.who];
    runCPU(c, v);

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

  const alive1 = G.V[1].people.filter(p => p.alive).length;
  const alive2 = G.V[2].people.filter(p => p.alive).length;

  let winner;
  if (G.instantWin === 'draw') winner = 0;
  else if (G.instantWin) winner = G.instantWin;
  else if (alive1 > alive2) winner = 1;
  else if (alive2 > alive1) winner = 2;
  else winner = 0;

  return {
    winner,
    instantWin: G.instantWin,
    starved: G.starved,
    alive1,
    alive2,
    days: G.day
  };
}

function startDay() {
  const config = getConfig();

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
    v.mediumFound = null;
    v.gotPermit = false;
    v.gotClaw = false;
    v.gotMedium = false;
  });

  G.tickIdx = 0;

  const HOUSES = config.HOUSES;
  [1, 2].forEach(p => {
    const isLarge = G.opt.large;
    const shuffled = shuf([...HOUSES]);

    if (isLarge) {
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

// ========== 統計 ==========
function simulate(games, opt) {
  const results = {
    games,
    wins: { 1: 0, 2: 0, draw: 0 },
    instantWins: { 1: 0, 2: 0 },
    starved: { 1: 0, 2: 0 },
    totalAlive: { 1: 0, 2: 0 },
    totalDays: 0
  };

  for (let i = 0; i < games; i++) {
    const r = runGame(opt);

    if (r.winner === 0) results.wins.draw++;
    else results.wins[r.winner]++;

    if (r.instantWin && r.instantWin !== 'draw') {
      results.instantWins[r.instantWin]++;
    }

    if (r.starved) {
      if (r.winner === 1) results.starved[2]++;
      else if (r.winner === 2) results.starved[1]++;
    }

    results.totalAlive[1] += r.alive1;
    results.totalAlive[2] += r.alive2;
    results.totalDays += r.days;
  }

  return results;
}

// ========== メイン ==========
const args = process.argv.slice(2);
const games = parseInt(args.find(a => !a.startsWith('--')) || '100');
const opt = {
  large: args.includes('--large'),
  madmanDog: args.includes('--madmanDog'),
  medium: args.includes('--medium'),
  pit: args.includes('--pit')
};

console.log(`\nCPU vs CPU シミュレーション`);
console.log(`ゲーム数: ${games}`);
console.log(`オプション: ${JSON.stringify(opt)}\n`);

const results = simulate(games, opt);

console.log(`結果:`);
console.log(`  P1勝利: ${results.wins[1]} (${(results.wins[1] / games * 100).toFixed(1)}%)`);
console.log(`  P2勝利: ${results.wins[2]} (${(results.wins[2] / games * 100).toFixed(1)}%)`);
console.log(`  引き分け: ${results.wins.draw} (${(results.wins.draw / games * 100).toFixed(1)}%)`);
console.log(`\n詳細:`);
console.log(`  即勝利(暴露): P1=${results.instantWins[1]}, P2=${results.instantWins[2]}`);
console.log(`  餓死: P1=${results.starved[1]}, P2=${results.starved[2]}`);
console.log(`  平均生存者: P1=${(results.totalAlive[1] / games).toFixed(2)}, P2=${(results.totalAlive[2] / games).toFixed(2)}`);
console.log(`  平均日数: ${(results.totalDays / games).toFixed(2)}`);
