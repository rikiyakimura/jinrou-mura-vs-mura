/**
 * パネル描画
 */

import { G, cur, who, me, opp, wolfOf, personAt, houseName, alive, guardAway } from '../state.js';
import { TICKS, SHARPEN, ROLE_LABEL, HLABEL, DAYS } from '../constants.js';
import { other } from '../utils.js';
import { sharpenTicks, overlapSoFar, madSharpenTicks, canSharpen, canSharpenMad, madManualNeeded, canAttack, canProtect, protectReason } from '../game/resolve.js';

// 外部関数（main.jsから注入）
let _render = null;
let _chooseExplorer = null;
let _confirmPit = null;
let _confirmRoute = null;
let _startSharpen = null;
let _startSharpenMad = null;
let _advanceTick = null;
let _finishDay = null;
let _confirmNight = null;
let _nextFromMorning = null;
let _showTitle = null;

export function setPanelCallbacks(callbacks) {
  _render = callbacks.render;
  _chooseExplorer = callbacks.chooseExplorer;
  _confirmPit = callbacks.confirmPit;
  _confirmRoute = callbacks.confirmRoute;
  _startSharpen = callbacks.startSharpen;
  _startSharpenMad = callbacks.startSharpenMad;
  _advanceTick = callbacks.advanceTick;
  _finishDay = callbacks.finishDay;
  _confirmNight = callbacks.confirmNight;
  _nextFromMorning = callbacks.nextFromMorning;
  _showTitle = callbacks.showTitle;
}

/**
 * パネルを描画
 */
export function renderPanel() {
  const el = document.getElementById('panel'), c = cur(), w = who();
  const H = (h, b) => `<h3>${h}</h3>${b}`;
  const v = w ? me() : null, o = w ? opp() : null;
  const tag = (G.mode === 'cpu' || G.mode === 'online') ? '' : `${v ? v.id : ''}P・`;

  if (c.ph === 'place') {
    const p = v.people[v.placeIdx];
    el.innerHTML = H(`${tag}配置`, `
      <p class="lead"><b>${p.name}（${ROLE_LABEL[p.role]}）</b>をどの家に住まわせる？ <b>自分の村の地図</b>で選ぶ。</p>
      <p>一度決めたら3夜のあいだ動かせない。</p>
      <p style="color:var(--kinari-faint)">残り ${5 - v.placeIdx} 人</p>`);
    return;
  }

  if (c.ph === 'pit') {
    const placed = !!v.pitEdge;
    const pitLabel = placed ? (function () {
      const [a, b] = v.pitEdge.split('-');
      return houseName(v, a) + '〜' + houseName(v, b);
    })() : '';
    el.innerHTML = H(`${tag}落とし穴を仕掛ける`, `
      <p class="lead"><b>自分の村の地図</b>で、道を1本選んで落とし穴を仕掛ける。相手の探索者がその道を通ると、<b>その時持っている護衛届・狂人の爪・霊媒の札を全部落とす</b>。</p>
      <p>相手は一度その道を通るまで、落とし穴の場所を知らない。落ちた後は相手にも見える。アイテムを取る前に通られると落とせないので、<b>アイテムのある家から出る道</b>に仕掛けると効きやすい。一度決めたら変えられない。</p>
      ${placed ? `<p class="good">${pitLabel}の道に仕掛けた。</p>` : `<p style="color:var(--kinari-faint)">道（点線）をタップして選ぶ。</p>`}
      <div class="btnrow"><button class="primary" onclick="window._confirmPit()" ${placed ? '' : 'disabled'}>これでいく</button></div>`);
    return;
  }

  if (c.ph === 'explorer') {
    let med = '';
    if (v.mediumResult) {
      med = `<div class="notice"><b>${v.mediumResult}</b></div>`;
    }
    let extra = '';
    if (G.opt && G.opt.madmanDog) {
      extra += '<p>犬飼いを送ると、狂人の贋物を無視して<b>人狼の爪の音だけ</b>を聞き分けられる。狂人を送ると、その夜は狂人の爪が鳴らない。</p>';
    }
    el.innerHTML = H(`${G.day}日目・昼　探索者を選ぶ`, `
      ${med}
      <p class="lead">相手の村へ送る探索者を1人選ぶ。<b>互いに伏せて選ぶ</b>ので、相手が誰を出すかはまだ分からない。</p>
      <p><b>探索から帰った者は疲れて眠る。</b>その夜、能力は使えない。人狼を送れば襲撃できず、護衛を送れば守れず、霊媒師を送れば札は働かない。一般村人には夜の役目がないので、影響はない。</p>
      <p>ただし人狼を送り、相手の爪研ぎ3ティックすべてに居合わせれば<b>その場で勝てる</b>。</p>
      ${extra}
      <div class="chips">${alive(v).map(p =>
      `<div class="chip" onclick="window._chooseExplorer(${p.id})">${p.name}<small>${ROLE_LABEL[p.role]}</small></div>`).join('')}</div>`);
    return;
  }

  if (c.ph === 'route') {
    const mine = v.people[v.explorer], theirs = o.people[o.explorer];
    const tickRow = [1, 2, 3, 4, 5].map(i => {
      const h = v.route[i - 1];
      return `<div class="tick ${h ? 'done' : ''}">${i}　${h ? houseName(o, h) : '—'}</div>`;
    }).join('');

    if (v.routeDone) {
      const got = [];
      if (v.permitFound) got.push('護衛届');
      if (v.madClawFound) got.push('狂人の爪');
      if (v.mediumFound) got.push('霊媒の札');
      const gotLine = got.length
        ? `<div class="notice"><b>手に入れたもの：${got.join('、')}</b><span class="where">${v.route.map(h => houseName(o, h)).join(' → ')}</span></div>`
        : `<div class="notice quiet"><b>この探索では、何も手に入らなかった。</b><span class="where">${v.route.map(h => houseName(o, h)).join(' → ')}</span></div>`;
      el.innerHTML = H(`${G.day}日目・昼　経路が決まった`, `
        ${gotLine}
        <p class="lead">${mine.name}は5軒を回り終えた。</p>
        <div class="ticks">${tickRow}</div>
        <div class="btnrow"><button class="primary" onclick="window._confirmRoute()">昼へ進む</button></div>`);
      return;
    }

    el.innerHTML = H(`${G.day}日目・昼　経路を組む（${v.route.length}/${TICKS}）`, `
      ${v.notice ? `<div class="notice">${v.notice}</div>` : ''}
      <p class="lead">こちらの探索者は <b>${mine.name}</b>、相手から来ているのは <b>${theirs.name}</b>。</p>
      <p>${mine.name}が回る家を、<b>相手の村の地図</b>で1つずつ選ぶ。同じ家に留まるのも1ティック。5軒すべて回れば護衛届は必ず見つかるが、2ティック留まらないと爪研ぎは妨げられない。</p>
      <div class="ticks">${tickRow}</div>
      <p class="warn" style="font-size:13px">選んだ家は戻せない。護衛届はその場で判定される。</p>`);
    return;
  }

  if (c.ph === 'ticks') {
    const wl = wolfOf(v), s = v.sharpenStart, st = sharpenTicks(v);
    const row = [1, 2, 3, 4, 5].map(i => {
      let cl = 'tick';
      if (i <= G.tickIdx) cl += ' done';
      if (st.includes(i)) cl += ' claw';
      if (i <= G.tickIdx && st.includes(i) && o.route[i - 1] === wl.house) cl += ' seen';
      if (i === G.tickIdx + 1) cl += ' now';
      const nm = i <= G.tickIdx ? (personAt(v, o.route[i - 1]) ? personAt(v, o.route[i - 1]).name : HLABEL[o.route[i - 1]]) : '—';
      return `<div class="${cl}"><b>${i}</b><span>${nm}</span></div>`;
    }).join('');

    let b = `<p class="lead">${o.people[o.explorer].name}の位置が、1ティックずつ明らかになる。表示は自分の村での位置。</p>
      <div class="ticks">${row}</div>`;

    if (!wl.alive) b += `<p>自村の人狼はもういない。</p>`;
    else if (v.explorer === wl.id) b += `<p>人狼は探索に出ている。今夜は襲撃できない。</p>`;
    else if (s !== null) {
      const seen = overlapSoFar(v, o.route);
      if (v.spoiled) b += `<p class="warn">研ぎを2度見られた。今夜の襲撃はできない。</p>`;
      else {
        b += `<p class="warn">ティック${s}〜${s + SHARPEN - 1}で爪を研いでいる。止められない。${seen ? `（すでに${seen}度、居合わせられた）` : ''}</p>`;
        if (seen >= 2) b += `<p class="warn">あと1度居合わせられ、あの訪問者が人狼だったら、この村は負ける。</p>`;
      }
    }
    else if (canSharpen(v)) { /* 説明はボタンに集約 */ }
    else b += `<p class="dim">もう研ぎ始められない。今夜の襲撃は放棄になる。</p>`;

    // 狂人の爪
    const md = v.people.find(p => p.role === 'madman');
    if (madManualNeeded(v)) {
      const ms = v.madStart, mst = madSharpenTicks(v);
      const mrow = [1, 2, 3, 4, 5].map(i => {
        let cl = 'tick';
        if (i <= G.tickIdx) cl += ' done';
        if (mst.includes(i)) cl += ' claw';
        if (i === G.tickIdx + 1) cl += ' now';
        return `<div class="${cl}">${i}</div>`;
      }).join('');
      const madHouseName = md ? (personAt(v, md.house) ? personAt(v, md.house).name : HLABEL[md.house]) : '';
      b += `<div class="madsec">
        <div class="madhead"><b>狂人の爪</b>（${madHouseName}）
          <button class="mini" onclick="G._madHelp=!G._madHelp;window._render()">${G._madHelp ? '閉じる' : '？'}</button></div>`;
      if (G._madHelp) b += `<p class="dim small">人狼とは別に狂人を研がせられる。人狼に研がせず狂人だけ鳴らせば、相手を狼の家から遠ざけられる。捕まっても何も起きない。</p>`;
      if (ms !== null) b += `<p class="good">狂人はティック${ms}〜${Math.min(ms + SHARPEN - 1, TICKS)}で研いでいる。</p>`;
      b += `<div class="ticks">${mrow}</div>`;
      if (ms === null && canSharpenMad(v)) b += `<div class="btnrow"><button class="danger" onclick="window._startSharpenMad()">狂人を研がせる</button></div>`;
      b += `</div>`;
    }

    b += `<div class="btnrow tickbtns">`;
    if (v.tickDone) {
      b += `<button class="primary" onclick="window._finishDay()">昼を終える</button>`;
    } else {
      if (canSharpen(v)) b += `<button class="danger" onclick="window._startSharpen()">爪を研ぐ</button>`;
      b += `<button class="primary" onclick="window._advanceTick()">次へ</button>`;
    }
    b += `</div>`;

    const head = v.tickDone
      ? `${G.day}日目・昼　5ティック目まで明けた`
      : `${G.day}日目・昼　ティック ${G.tickIdx}/${TICKS}`;
    el.innerHTML = H(head, b);
    return;
  }

  if (c.ph === 'night') {
    let b = '';
    if (v.heardToday !== null) {
      const where = [...new Set(v.route)].map(h => houseName(o, h)).join('・');
      const exRole = v.people[v.explorer] ? v.people[v.explorer].role : null;
      if (exRole === 'dog') {
        b += v.heardToday
          ? `<div class="notice"><b>犬が反応した。人狼の爪を研ぐ音がした。</b>狂人の贋物ではない。相手の人狼は、今日犬飼いが入った家のどれかにいる。<span class="where">回った家：${where}</span></div>`
          : `<div class="notice quiet"><b>犬は人狼の爪の音を捉えなかった。</b>相手が研がなかったか、居合わせなかったか。<span class="where">回った家：${where}</span></div>`;
      } else {
        b += v.heardToday
          ? `<div class="notice"><b>探索の途中、どこかで爪を研ぐ音を聞いた。</b>ただし狂人の贋物かもしれない。今日${v.people[v.explorer].name}が入った家のどれかで鳴った。<span class="where">回った家：${where}</span></div>`
          : `<div class="notice quiet"><b>探索の途中、怪しい音はなかった。</b>相手が研がなかったか、居合わせなかったかは分からない。<span class="where">回った家：${where}</span></div>`;
      }
    }
    if (canAttack(v)) {
      b += `<p class="lead">爪は研げた。相手の村の誰を襲う？ 下のチップか、相手の村の地図の家をタップして選ぶ。人狼を狙うと空振りになる。</p>
        <div class="chips">${alive(o).map(p =>
        `<div class="chip ${v.attackTarget === p.id ? 'sel' : ''}" onclick="G.V[${v.id}].attackTarget=${p.id};window._render()">${p.name}<small>${HLABEL[p.house]}の家</small></div>`).join('')}</div>`;
    } else {
      b += `<p class="warn">今夜、こちらから襲撃はできない。${v.spoiled ? '研ぎを見られた。' : ''}</p>`;
    }
    if (canProtect(v)) {
      b += `<p class="good">護衛届がある。味方1人を守れる（護衛自身と人狼は守れない）。</p>
        <div class="chips">${alive(v).filter(p => p.role !== 'guard' && p.role !== 'wolf').map(p =>
        `<div class="chip ${v.protectTarget === p.id ? 'sel' : ''}" onclick="G.V[${v.id}].protectTarget=${p.id};window._render()">${p.name}<small>${ROLE_LABEL[p.role]}</small></div>`).join('')}</div>`;
    } else {
      b += `<p class="${guardAway(v) ? 'warn' : ''}">護衛は使えない。${protectReason(v)}</p>`;
      v.protectTarget = null;
    }
    const need = canAttack(v) && v.attackTarget === null;
    b += `<div class="btnrow"><button class="primary" onclick="window._confirmNight()" ${need ? 'disabled' : ''}>夜を明かす</button></div>`;
    el.innerHTML = H(`${G.day}日目・夜${(G.mode === 'cpu' || G.mode === 'online') ? '' : `　（${v.id}P）`}`, b);
    return;
  }

  if (c.ph === 'morning') {
    const r = G.publicLog.find(x => x.day === G.day) || {};
    const myId = G.myPlayerId || 1;
    const oppId = myId === 1 ? 2 : 1;
    const myName = G.myPlayerName || '自分';
    const oppName = G.opponentName || '相手';
    const n1 = G.mode === 'cpu' ? '自分の村' : G.mode === 'online' ? `${myName}の村` : '1Pの村';
    const n2 = G.mode === 'cpu' ? '相手の村' : G.mode === 'online' ? `${oppName}の村` : '2Pの村';
    const ra = G.mode === 'online' ? r[myId === 1 ? 'a' : 'b'] : r.a;
    const rb = G.mode === 'online' ? r[myId === 1 ? 'b' : 'a'] : r.b;
    el.innerHTML = H(`${G.day}日目・夜明け`, `
      <p class="lead">${n1}：${ra ? `<b>${ra}</b>が死んだ。` : '誰も欠けていない。'}</p>
      <p class="lead">${n2}：${rb ? `<b>${rb}</b>が死んだ。` : '誰も欠けていない。'}</p>
      <p>失敗の理由は、襲われた側にしか分からない。</p>
      <div class="btnrow"><button class="primary" onclick="window._nextFromMorning()">${G.day >= DAYS ? '決着を見る' : '次の日へ'}</button></div>`);
    return;
  }

  if (c.ph === 'end') {
    const myId = G.myPlayerId || 1;
    const oppId = myId === 1 ? 2 : 1;
    const myName = G.myPlayerName || '自分';
    const oppName = G.opponentName || '相手';
    const a = alive(G.V[1]).length, f = alive(G.V[2]).length;
    const myAlive = alive(G.V[myId]).length, oppAlive = alive(G.V[oppId]).length;
    const nm = p => {
      if (G.mode === 'cpu') return p === 1 ? 'あなた' : 'CPU';
      if (G.mode === 'online') return p === myId ? myName : oppName;
      return `${p}P`;
    };
    let verdict, head, note = '';
    if (G.instantWin) {
      head = `${G.day}日目の昼、決着した`;
      if (G.instantWin === 'draw') { verdict = '引き分け'; note = '双方の人狼が同時に暴かれた。'; }
      else {
        const won = (G.mode === 'cpu' || G.mode === 'online') ? (G.instantWin === myId) : null;
        verdict = G.mode === 'cpu' ? (won ? '勝ち' : '負け')
          : G.mode === 'online' ? (won ? '勝ち' : '負け')
          : `${G.instantWin}P の勝ち`;
        note = `${nm(other(G.instantWin))}の人狼が暴かれた。生存数は問わない。`;
      }
    } else {
      head = '3夜が明けた';
      if (G.mode === 'cpu' || G.mode === 'online') {
        verdict = myAlive > oppAlive ? '勝ち' : myAlive < oppAlive ? '負け' : '引き分け';
      } else {
        verdict = a > f ? '1P の勝ち' : a < f ? '2P の勝ち' : '引き分け';
      }
    }
    // オンライン・CPUモードでは自分→相手の順、pvpモードでは1P→2Pの順
    const first = (G.mode === 'cpu' || G.mode === 'online') ? myId : 1;
    const second = (G.mode === 'cpu' || G.mode === 'online') ? oppId : 2;
    const scoreLeft = (G.mode === 'cpu' || G.mode === 'online') ? myAlive : a;
    const scoreRight = (G.mode === 'cpu' || G.mode === 'online') ? oppAlive : f;
    el.innerHTML = `<div class="final">
      <div class="sub">${head}</div>
      <div class="score">${scoreLeft} — ${scoreRight}</div>
      <div class="verdict">${verdict}</div>
      ${note ? `<p style="color:var(--kinari-dim);margin-top:8px">${note}</p>` : ''}
      <p style="color:var(--midori);margin-top:6px;font-size:13px">覚え書きに、伏せられていたことを書き足した。</p>
      <div class="btnrow" style="justify-content:center;margin-top:18px">
        <button onclick="G.endView=${first};window._render()">${nm(first)}の覚え書き</button>
        <button onclick="G.endView=${second};window._render()">${nm(second)}の覚え書き</button>
        <button class="primary" onclick="window._restartGame()">もう一度</button>
      </div>
      <div class="reveal">
        ${nm(first)}の村：${G.V[first].people.map(p => `${p.name}（${ROLE_LABEL[p.role]}${p.alive ? '' : '・死亡'}）`).join('　')}<br>
        ${nm(second)}の村：${G.V[second].people.map(p => `${p.name}（${ROLE_LABEL[p.role]}${p.alive ? '' : '・死亡'}）`).join('　')}
      </div></div>`;
    return;
  }
}
