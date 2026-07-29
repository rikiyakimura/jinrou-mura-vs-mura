/**
 * 判定処理
 */

import { G, wolfOf, guardOf, mediumOf, madActive, log, houseName, alive } from '../state.js';
import { TICKS, SHARPEN, SPOIL as SPOIL_CONST, EXPOSE, DAYS, ROLE_LABEL, ADJ } from '../constants.js';

// SPOILをエクスポート
export const SPOIL = SPOIL_CONST;
import { other } from '../utils.js';

// 爪研ぎティック
export const sharpenTicks = v => v.sharpenStart === null ? [] : [0, 1, 2].map(i => v.sharpenStart + i).filter(t => t <= TICKS);

// 経路との重複回数
export function overlapSoFar(v, route) {
  const w = wolfOf(v);
  return sharpenTicks(v).filter(t => t <= G.tickIdx && route[t - 1] === w.house).length;
}

export function overlapFull(v, route) {
  const w = wolfOf(v);
  return sharpenTicks(v).filter(t => route[t - 1] === w.house).length;
}

// 狂人の爪研ぎティック
export function madSharpenTicks(v) {
  if (!madActive(v)) return [];
  const start = v.madStart;
  if (start === null || start === undefined) return [];
  return [0, 1, 2].map(i => start + i).filter(t => t <= TICKS);
}

// 狂人との重複
export function overlapMad(v, route) {
  const m = v.people.find(p => p.role === 'madman');
  if (!m || !madActive(v)) return 0;
  return madSharpenTicks(v).filter(t => route[t - 1] === m.house).length;
}

// 経路が有効か
export function routeValid(v, h) {
  const r = v.route;
  if (r.length >= TICKS) return false;
  if (r.length === 0) return true;
  const last = r[r.length - 1];
  return h === last || ADJ[last].includes(h);
}

// 爪研ぎ可能か
export function canSharpen(v) {
  const w = wolfOf(v);
  return w.alive && v.explorer !== w.id && v.sharpenStart === null && G.tickIdx <= TICKS - SHARPEN;
}

// 狂人の爪研ぎが必要か
export function madManualNeeded(v) { return madActive(v); }

export function canSharpenMad(v) {
  return madManualNeeded(v) && v.madStart === null && G.tickIdx <= TICKS - SHARPEN;
}

// 襲撃可能か
export function canAttack(v) {
  const w = wolfOf(v);
  return w.alive && v.explorer !== w.id && v.sharpenStart !== null && !v.spoiled && sharpenTicks(v).length === SHARPEN;
}

// 護衛可能か
export function canProtect(v) {
  const g = guardOf(v);
  return g.alive && v.permit && v.explorer !== g.id && alive(v).some(p => p.role !== 'guard' && p.role !== 'wolf');
}

export function protectReason(v) {
  const g = guardOf(v);
  if (!g.alive) return '護衛が生きていない。';
  if (v.explorer === g.id) return '護衛は探索から帰って眠っている。今夜は守れない。';
  if (!v.permit) return '護衛届を取れなかった。';
  return '守れる一般村人がいない。';
}

// 人狼の行動説明
export function wolfActOf(v) {
  const w = wolfOf(v);
  if (v.explorer === w.id) return '探索に出ていた。この夜は襲えなかった';
  if (v.sharpenStart === null) return '爪を研がなかった';
  if (v.spoiled) return '爪を研いだが、探索者に見つかって止まった';
  return '爪を研ぎ切って、襲撃してきた';
}

// 音の報告
export function reportHearing(att, def, r) {
  const where = [...new Set(att.route)].map(h => houseName(def, h)).join('・');
  if (r.isDog) {
    if (r.wolfHit >= 1) log(att, '犬が反応した。人狼の爪を研ぐ音がした。狂人の贋物ではない。', 'hintline');
    else log(att, '犬は人狼の爪の音を捉えなかった。', 'none');
  } else {
    const any = r.wolfHit + r.madHit;
    if (any >= 1) log(att, '探索の途中、どこかで爪を研ぐ音を聞いた。', 'hintline');
    else log(att, '探索の途中、怪しい音はなかった。', 'none');
  }
  att._heardWhere = where;
}

// 昼の判定
export function resolveDay(hideVeil) {
  const A = G.V[1], B = G.V[2];
  [A, B].forEach(v => {
    const e = G.V[other(v.id)];
    if (overlapFull(v, e.route) >= SPOIL) v.spoiled = true;
  });

  const path = (v, r) => r.map(h => houseName(v, h)).join(' → ');
  log(A, `自分の探索者 ${A.people[A.explorer].name}：${path(B, A.route)}`, 'route');
  log(A, `相手の探索者 ${B.people[B.explorer].name}：${path(A, B.route)}`, 'route');
  log(B, `自分の探索者 ${B.people[B.explorer].name}：${path(A, B.route)}`, 'route');
  log(B, `相手の探索者 ${A.people[A.explorer].name}：${path(B, A.route)}`, 'route');

  function hearing(att, def) {
    const isDog = att.explorer !== null && def === G.V[other(att.id)] &&
      att.people[att.explorer] && att.people[att.explorer].role === 'dog';
    const wolfHit = overlapFull(def, att.route);
    const madHit = madActive(def) ? overlapMad(def, att.route) : 0;
    return { isDog, wolfHit, madHit };
  }

  const rHearA = hearing(A, B), rHearB = hearing(B, A);
  reportHearing(A, B, rHearA);
  reportHearing(B, A, rHearB);
  A._todayHear = rHearA; B._todayHear = rHearB;
  A.heardToday = rHearA.isDog ? (rHearA.wolfHit >= 1) : ((rHearA.wolfHit + rHearA.madHit) >= 1);
  B.heardToday = rHearB.isDog ? (rHearB.wolfHit >= 1) : ((rHearB.wolfHit + rHearB.madHit) >= 1);
  if (rHearA.wolfHit >= 1) A.memo = A.memo.concat([wolfOf(B).house]);
  if (rHearB.wolfHit >= 1) B.memo = B.memo.concat([wolfOf(A).house]);

  const aWin = (A.explorer === wolfOf(A).id) && rHearA.wolfHit >= EXPOSE;
  const bWin = (B.explorer === wolfOf(B).id) && rHearB.wolfHit >= EXPOSE;

  if (aWin || bWin) {
    G.instantWin = (aWin && bWin) ? 'draw' : (aWin ? 1 : 2);
    if (aWin) {
      wolfOf(B).alive = false;
      log(A, `${A.people[A.explorer].name}が、相手の人狼${wolfOf(B).name}を暴き追放した。`, 'kill');
      log(B, `訪ねてきた${A.people[A.explorer].name}に、自村の人狼${wolfOf(B).name}を暴かれた。`, 'kill');
    }
    if (bWin) {
      wolfOf(A).alive = false;
      log(B, `${B.people[B.explorer].name}が、相手の人狼${wolfOf(A).name}を暴き追放した。`, 'kill');
      log(A, `訪ねてきた${B.people[B.explorer].name}に、自村の人狼${wolfOf(A).name}を暴かれた。`, 'kill');
    }
    [A, B].forEach(v => {
      const e = G.V[other(v.id)];
      const hear = v._todayHear || {};
      const heardMad = (hear.madHit || 0) >= 1;
      const vExpRole = (v.explorer !== null && v.people[v.explorer]) ? v.people[v.explorer].role : null;
      const got = [];
      if (e.permitFound) got.push('護衛届');
      if (e.madClawFound) got.push('狂人の爪');
      if (e.mediumFound) got.push('霊媒の札');
      v.reveal.push({
        day: G.day, hasNight: false, wolfAct: wolfActOf(e),
        heardMad: heardMad, dogHeardMad: (heardMad && vExpRole === 'dog'), foeGot: got, foeMedium: null
      });
    });
    finish(hideVeil);
    return;
  }
}

// 夜の判定
export function resolveNight() {
  const A = G.V[1], B = G.V[2];

  const strike = (att, def) => {
    if (!canAttack(att) || att.attackTarget === null) return null;
    const t = def.people[att.attackTarget];
    if (!t || !t.alive) return null;
    if (def.protectTarget === t.id) return { ok: false, t, why: 'guard' };
    if (t.role === 'wolf') return { ok: false, t, why: 'wolf' };
    t.alive = false; att.fed = true; return { ok: true, t };
  };

  const rA = strike(A, B), rB = strike(B, A);

  const report = (v, mine, theirs) => {
    if (mine) {
      if (mine.ok) log(v, `${mine.t.name}を襲撃した。息絶えた。`, 'kill');
      else log(v, `${mine.t.name}を襲撃したが、失敗した。理由は分からない。`);
    } else {
      log(v, `こちらからの襲撃はなかった。`, 'none');
    }
    if (theirs) {
      if (theirs.ok) log(v, `${theirs.t.name}が襲撃された。${theirs.t.name}は死んだ。`, 'kill');
      else if (theirs.why === 'wolf') log(v, `${theirs.t.name}が襲撃された。${theirs.t.name}は人狼なので襲撃を逃れた。`);
      else log(v, `${theirs.t.name}が襲撃された。${theirs.t.name}は護衛に守られた。`);
    } else {
      log(v, `襲撃は無かったようだ。`, 'none');
    }
  };

  report(A, rA, rB); report(B, rB, rA);

  // 霊媒の札
  const mediumWork = (att, r) => {
    att._mediumHit = null;
    if (!att.mediumFound) return;
    const med = mediumOf(att);
    if (!med || !med.alive || att.explorer === med.id) return;
    if (r && r.ok) {
      att.mediumResult = '昨晩倒した' + r.t.name + 'は、' + ROLE_LABEL[r.t.role] + 'だった。';
      att._mediumHit = { name: r.t.name, role: ROLE_LABEL[r.t.role] };
      log(att, '霊媒の札が働いた。' + r.t.name + 'は' + ROLE_LABEL[r.t.role] + 'だった。', 'hintline');
    } else {
      att.mediumResult = '霊媒の札は働いたが、昨晩は誰も倒せなかった。';
      log(att, '霊媒の札は働いたが、昨晩は誰も倒せず、正体は分からなかった。');
    }
  };

  mediumWork(A, rA); mediumWork(B, rB);

  [[A, rA], [B, rB]].forEach(([v, r]) => {
    const e = G.V[other(v.id)];
    const hear = v._todayHear || {};
    const heardMad = (hear.madHit || 0) >= 1;
    const vExpRole = (v.explorer !== null && v.people[v.explorer]) ? v.people[v.explorer].role : null;
    const got = [];
    if (e.permitFound) got.push('護衛届');
    if (e.madClawFound) got.push('狂人の爪');
    if (e.mediumFound) got.push('霊媒の札');
    v.reveal.push({
      day: G.day, hasNight: true, wolfAct: wolfActOf(e),
      failWhy: (r && !r.ok) ? r.why : null, failTarget: (r && !r.ok) ? r.t.name : null,
      protect: (e.protectTarget !== null && e.protectTarget !== undefined) ? e.people[e.protectTarget].name : null,
      heardMad: heardMad, dogHeardMad: (heardMad && vExpRole === 'dog'),
      foeGot: got,
      foeMedium: e._mediumHit ? ('相手は霊媒の札で、' + e._mediumHit.name + 'が' + e._mediumHit.role + 'だと見抜いていた。') : null
    });
  });

  G.publicLog.push({ day: G.day, a: rB && rB.ok ? rB.t.name : null, b: rA && rA.ok ? rA.t.name : null });
}

// reveal適用
export function applyReveal(v) {
  v.reveal.forEach(r => {
    const d = v.log.find(x => x.day === r.day); if (!d) return;
    const add = t => d.lines.push({ t: '◇ ' + t, cls: 'reveal-line' });
    add(`相手の人狼は${r.wolfAct}。`);
    if (!r.hasNight) {
      if (r.heardMad) {
        if (r.dogHeardMad) add('相手の狂人の爪研ぎを、あなたは犬飼いで聞き分けていた。');
        else add('あの日の音には、相手の狂人の爪研ぎが混じっていた。');
      }
      if (r.foeGot && r.foeGot.length) add('相手はこの日、' + r.foeGot.join('と') + 'を取っていた。');
      return;
    }
    if (r.failWhy === 'guard') add(`${r.failTarget}への襲撃は、護衛に守られて失敗していた。`);
    if (r.failWhy === 'wolf') add(`${r.failTarget}は相手の人狼だった。あの襲撃は空振りだった。`);
    add(r.protect ? `相手は${r.protect}を護衛していた。` : `相手はこの夜、誰も護衛していなかった。`);
    if (r.heardMad) {
      if (r.dogHeardMad) add('相手の狂人の爪研ぎを、あなたは犬飼いで聞き分けていた。');
      else add('あの日の音には、相手の狂人の爪研ぎが混じっていた。');
    }
    if (r.foeGot && r.foeGot.length) add('相手はこの日、' + r.foeGot.join('と') + 'を取っていた。');
    if (r.foeMedium) add(r.foeMedium);
  });
}

// ゲーム終了
export function finish(hideVeil) {
  [1, 2].forEach(p => {
    const v = G.V[p], w = wolfOf(v);
    if (w.alive && !v.fed && !G.instantWin) {
      w.alive = false;
      log(v, `自村の人狼${w.name}は一度も食べられず、飢えて死んだ。`, 'kill');
    }
  });
  [1, 2].forEach(p => applyReveal(G.V[p]));
  G.done = true;
  G.idx = G.sched.length - 1;
  if (hideVeil) hideVeil();
}
