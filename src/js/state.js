import { other } from './utils.js';
import { HLABEL, getConfig } from './constants.js';

// ゲーム状態（グローバル）
// オブジェクトのプロパティとして保持し、参照を維持する
const state = {
  G: null
};

// Gへのアクセサ（他のモジュールからはこれを使う）
export function getG() {
  return state.G;
}

export function setG(newG) {
  state.G = newG;
  // windowオブジェクトにも設定（panel.jsのonclickからアクセス用）
  if (typeof window !== 'undefined') {
    window.G = newG;
  }
}

// 便利なゲッター（Gを直接参照する代わりに使う）
export const G = new Proxy({}, {
  get(target, prop) {
    return state.G ? state.G[prop] : undefined;
  },
  set(target, prop, value) {
    if (state.G) state.G[prop] = value;
    return true;
  }
});

// 参照関数
export const cur = () => {
  if (!state.G?.sched) return { ph: 'unknown', who: 0 };
  const idx = state.G.idx;
  if (idx < 0 || idx >= state.G.sched.length) {
    console.error('G.idx out of bounds:', idx, 'sched length:', state.G.sched.length);
    return { ph: 'unknown', who: 0 };
  }
  return state.G.sched[idx];
};
export const who = () => cur().who;

// オンラインモードでは自分のプレイヤーIDを使用
export const me = () => {
  if (state.G.mode === 'online' && state.G.myPlayerId) {
    return state.G.V[state.G.myPlayerId];
  }
  return state.G.V[who() || 1];
};

export const opp = () => {
  if (state.G.mode === 'online' && state.G.myPlayerId) {
    return state.G.V[other(state.G.myPlayerId)];
  }
  return state.G.V[other(who() || 1)];
};

// 役職検索
export const wolfOf = v => v.people.find(p => p.role === 'wolf');
export const guardOf = v => v.people.find(p => p.role === 'guard');
export const madmanOf = v => v.people.find(p => p.role === 'madman');
export const mediumOf = v => v.people.find(p => p.role === 'medium');
export const dogOf = v => v.people.find(p => p.role === 'dog');

// 生存者
export const alive = v => v.people.filter(p => p.alive);

// 家関連
export const personAt = (v, h) => v.people.find(p => p.house === h);
export const freeHouse = (v, h) => !personAt(v, h);

export function houseName(v, h) {
  const p = v.people.find(x => x.house === h);
  return p ? `${p.name}の家` : `${getConfig().HLABEL[h]}の家`;
}

// ログ追加
export function log(v, t, cls) {
  let d = v.log.find(x => x.day === state.G.day);
  if (!d) {
    d = { day: state.G.day, lines: [] };
    v.log.push(d);
  }
  d.lines.push({ t, cls });
}

// エモートをログに追加
export function addEmoteToLog(content, isOwn) {
  const v = me();
  if (!v || !v.log) return;

  const currentDay = state.G.day;
  let dayEntry = v.log.find(d => d.day === currentDay);

  if (!dayEntry) {
    dayEntry = { day: currentDay, lines: [] };
    v.log.push(dayEntry);
  }

  dayEntry.lines.push({
    t: isOwn ? `自分: ${content}` : `相手: ${content}`,
    cls: isOwn ? 'emote-own' : 'emote-opp'
  });
}

// 経路をログに保存（覚え書きの地図表示用）
export function logRoute(v, route, explorer, isOwn) {
  let d = v.log.find(x => x.day === state.G.day);
  if (!d) {
    d = { day: state.G.day, lines: [], routes: {} };
    v.log.push(d);
  }
  if (!d.routes) d.routes = {};
  const key = isOwn ? 'own' : 'opp';
  d.routes[key] = { path: [...route], explorer };
}

// 表示名：対CPUなら「自分／相手」、対人なら「1P／2P」
export function vname(v) {
  if (state.G.mode === 'cpu') return v.isCPU ? '相手の村' : '自分の村';
  return `${v.id}Pの村`;
}

// 狂人が有効か（狂人が生存、探索中でない、爪を持っている）
export function madActive(v) {
  const m = madmanOf(v);
  return m && m.alive && v.explorer !== m.id && v.madClaw;
}

// 護衛が探索中か
export function guardAway(v) {
  const g = guardOf(v);
  return g && g.alive && v.explorer === g.id;
}
