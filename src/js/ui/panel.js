/**
 * パネル描画
 */

import { G, cur, who, me, opp, wolfOf, personAt, houseName, alive, guardAway } from '../state.js';
import { TICKS, SHARPEN, ROLE_LABEL, HLABEL, getConfig, NAME_TO_KEY } from '../constants.js';
import { other } from '../utils.js';
import { sharpenTicks, overlapSoFar, madSharpenTicks, canSharpen, canSharpenMad, madManualNeeded, canAttack, canProtect, protectReason } from '../game/resolve.js';
import { isProcessing } from '../online/onlineFlow.js';
import { playSE } from '../audio.js';

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
 * 村配置グリッド用カード生成
 * @param {Array} people - 村人配列
 * @param {Object} options - オプション
 *   - onClickAttr: クリック時の属性文字列（{id}がIDに置換される）
 *   - selectedId: 選択中のID
 *   - showRole: 役職を表示するか
 *   - forceVillagerImg: 全員villager画像を使うか
 *   - excludeRoles: 対象外とする役職配列
 *   - disabled: 全体を無効化するか
 * @returns {Object} { cards: string, gridClass: string }
 */
function villageGridCards(people, options = {}) {
  const config = getConfig();
  const isClassic = config.VILLAGERS === 5;

  // Classic: 2列レイアウト用の順序（中央は最後で重ねる）
  // Large: 3×3グリッド
  const gridOrder = isClassic
    ? ['tl', 'tr', 'bl', 'br', 'c']
    : ['tl', 'tm', 'tr', 'ml', 'c', 'mr', 'bl', 'bm', 'br'];

  const cards = gridOrder.map(house => {
    // 存在しない家は空白（Largeモード用）
    if (!config.HOUSES.includes(house)) {
      return '<div class="explorer-card blank"></div>';
    }

    // この家に住んでいる人を探す
    const person = people.find(p => p.house === house);
    if (!person) {
      return '<div class="explorer-card blank"></div>';
    }

    const isAlive = person.alive !== false;
    const isExcluded = options.excludeRoles?.includes(person.role);
    const isSelected = options.selectedId === person.id;
    const imgKey = NAME_TO_KEY[person.name];
    const imgSrc = options.forceVillagerImg
      ? `/portraits/${imgKey}_villager.webp`
      : `/portraits/${imgKey}_${person.role}.webp`;

    let statusLabel = '';
    let cardClass = 'explorer-card';
    let clickAttr = '';
    const isExplorer = options.explorerId === person.id;

    if (!isAlive) {
      statusLabel = '<span class="status">死亡</span>';
      cardClass += ' dead';
    } else if (isExcluded) {
      statusLabel = '<span class="status">対象外</span>';
      cardClass += ' excluded';
    } else if (options.disabled) {
      cardClass += ' disabled';
    } else {
      clickAttr = options.onClickAttr ? options.onClickAttr.replace('{id}', person.id) : '';
      if (isSelected) cardClass += ' sel';
    }
    if (isExplorer) {
      cardClass += ' is-explorer';
    }

    const roleLabel = options.showRole
      ? ROLE_LABEL[person.role]
      : `${config.HLABEL[house]}の家`;

    return `<div class="${cardClass}" ${clickAttr}>
      ${imgKey ? `<img src="${imgSrc}" alt="${person.name}">` : ''}
      ${isExplorer ? '<span class="explorer-badge">探索者</span>' : ''}
      <span class="name">${person.name}</span>
      <span class="role">${roleLabel}</span>
      ${statusLabel}
    </div>`;
  }).join('');

  return { cards, gridClass: isClassic ? 'classic' : '' };
}

/**
 * パネルを描画
 */
export function renderPanel() {
  const el = document.getElementById('panel'), c = cur(), w = who();
  const H = (h, b) => `<h3>${h}</h3>${b}`;
  const v = w ? me() : null, o = w ? opp() : null;
  const tag = (G.mode === 'cpu' || G.mode === 'online') ? '' : `${v ? v.id : ''}P・`;
  const myName = G.myPlayerName || '自分';
  const myMapLabel = G.mode === 'online' ? `${myName}の村の地図` : '自分の村の地図';
  const quitBtn = '<div class="quitrow"><button class="quit" onclick="window._quitGame()">ゲームをやめる</button></div>';

  if (c.ph === 'place') {
    // 配置完了済みの場合は待機画面を表示
    if (v.placeIdx >= getConfig().VILLAGERS) {
      el.innerHTML = H(`${tag}配置完了`, `
        <p class="lead">全員の配置が完了しました。</p>
        <p style="color:var(--kinari-faint)">相手の操作を待っています...</p>
        ${quitBtn}`);
      return;
    }
    const p = v.people[v.placeIdx];
    const imgKey = NAME_TO_KEY[p.name];
    const imgSrc = imgKey ? `/portraits/${imgKey}_${p.role}.webp` : '';
    el.innerHTML = H(`${tag}配置`, `
      <div class="place-card">
        ${imgKey ? `<img src="${imgSrc}" class="portrait" alt="${p.name}">` : ''}
        <div class="place-info">
          <p class="lead"><b>${p.name}（${ROLE_LABEL[p.role]}）</b></p>
          <p>をどの家に住まわせる？</p>
          <p><b>${myMapLabel}</b>で選ぶ。</p>
          <p style="color:var(--kinari-faint)">残り ${getConfig().VILLAGERS - v.placeIdx} 人</p>
        </div>
      </div>
      <div class="btnrow"><button class="btn" onclick="window._placeAllRandom()">残りをランダム配置</button></div>
      ${quitBtn}`);
    return;
  }

  if (c.ph === 'pit') {
    const config = getConfig();
    const pitCount = config.PITS;
    const placedCount = v.pitEdge ? v.pitEdge.length : 0;
    const allPlaced = placedCount >= pitCount;
    const pitLabels = v.pitEdge.map(edge => {
      const [a, b] = edge.split('-');
      return houseName(v, a) + '〜' + houseName(v, b);
    });
    const remaining = pitCount - placedCount;
    const pitHelp = G._pitHelp ? `
      <p class="dim small">相手は一度その道を通るまで、落とし穴の場所を知らない。落ちた後は相手にも見える。アイテムを取る前に通られると落とせないので、<b>アイテムのある家から出る道</b>に仕掛けると効きやすい。一度決めたら変えられない。</p>
    ` : '';
    el.innerHTML = H(`${tag}落とし穴を仕掛ける`, `
      <p class="lead"><b>${myMapLabel}</b>で、道を${pitCount}本選んで落とし穴を仕掛ける。相手の探索者がその道を通ると、<b>その時持っている護衛届・狂人の爪・霊媒の札を全部落とす</b>。
        <button class="mini" onclick="G._pitHelp=!G._pitHelp;window._render()">${G._pitHelp ? '閉じる' : '？'}</button>
      </p>
      ${pitHelp}
      ${placedCount > 0 ? `<p class="good">${pitLabels.join('、')}の道に仕掛けた。</p>` : ''}
      ${allPlaced ? '' : `<p style="color:var(--kinari-faint)">道（点線）をタップして選ぶ。残り${remaining}本</p>`}
      <div class="btnrow"><button class="primary" onclick="window._confirmPit()" ${allPlaced && !(G.mode === 'online' && isProcessing()) ? '' : 'disabled'}>これでいく</button></div>
      ${quitBtn}`);
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
    const { cards: explorerCards, gridClass } = villageGridCards(v.people, {
      onClickAttr: G.mode === 'online' && isProcessing() ? '' : 'onclick="window._chooseExplorer({id})"',
      showRole: true,
      disabled: G.mode === 'online' && isProcessing()
    });
    const explorerHelp = G._explorerHelp ? `
      <p class="dim small"><b>探索から帰った者は疲れて眠る。</b>その夜、能力は使えない。人狼を送れば襲撃できず、護衛を送れば守れず、霊媒師を送れば札は働かない。一般村人には夜の役目がないので、影響はない。</p>
      <p class="dim small">ただし人狼を送り、相手の爪研ぎ3ティックすべてに居合わせれば<b>その場で勝てる</b>。</p>
      ${extra ? `<p class="dim small">${extra.replace(/<\/?p>/g, '')}</p>` : ''}
    ` : '';
    el.innerHTML = H(`${G.day}日目・昼　探索者を選ぶ`, `
      ${med}
      <p class="lead">相手の村へ送る探索者を1人選ぶ。<b>互いに伏せて選ぶ</b>ので、相手が誰を出すかはまだ分からない。
        <button class="mini" onclick="G._explorerHelp=!G._explorerHelp;window._render()">${G._explorerHelp ? '閉じる' : '？'}</button>
      </p>
      ${explorerHelp}
      <div class="explorer-grid ${gridClass}">${explorerCards}</div>
      ${quitBtn}`);
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
      if (v.permitFound) got.push('<img src="/item/goeitodoke.webp" class="item-icon">護衛届');
      if (v.madClawFound) got.push('<img src="/item/kyoujinnotume.webp" class="item-icon">狂人の爪');
      if (v.mediumFound) got.push('<img src="/item/reibainohuda.webp" class="item-icon">霊媒の札');
      const gotLine = got.length
        ? `<div class="notice"><b>手に入れたもの：${got.join('、')}</b><span class="where">${v.route.map(h => houseName(o, h)).join(' → ')}</span></div>`
        : `<div class="notice quiet"><b>この探索では、何も手に入らなかった。</b><span class="where">${v.route.map(h => houseName(o, h)).join(' → ')}</span></div>`;
      el.innerHTML = H(`${G.day}日目・昼　経路が決まった`, `
        ${gotLine}
        <p class="lead">${mine.name}は5軒を回り終えた。</p>
        <div class="ticks">${tickRow}</div>
        <div class="btnrow"><button class="primary" ${G.mode === 'online' && isProcessing() ? 'disabled' : ''} onclick="window._confirmRoute()">昼へ進む</button></div>
        ${quitBtn}`);
      return;
    }

    const routeHelp = G._routeHelp ? `
      <p class="dim small">同じ家に留まるのも1ティック。5軒すべて回れば護衛届は必ず見つかるが、2ティック留まらないと爪研ぎは妨げられない。</p>
    ` : '';
    el.innerHTML = H(`${G.day}日目・昼　経路を組む（${v.route.length}/${TICKS}）`, `
      ${v.notice ? `<div class="notice">${v.notice}</div>` : ''}
      <p class="lead">こちらの探索者は <b>${mine.name}</b>、相手から来ているのは <b>${theirs.name}</b>。</p>
      <p>${mine.name}が回る家を、<b>相手の村の地図</b>で1つずつ選ぶ。
        <button class="mini" onclick="G._routeHelp=!G._routeHelp;window._render()">${G._routeHelp ? '閉じる' : '？'}</button>
      </p>
      ${routeHelp}
      <div class="ticks">${tickRow}</div>
      <p class="warn" style="font-size:13px">選んだ家は戻せない。護衛届はその場で判定される。</p>
      ${quitBtn}`);
    return;
  }

  if (c.ph === 'ticks') {
    const wl = wolfOf(v), s = v.sharpenStart, st = sharpenTicks(v);
    // 研ぎ完了判定
    const sharpenEnd = s !== null ? Math.min(s + SHARPEN - 1, TICKS) : null;
    const sharpenDone = s !== null && G.tickIdx >= sharpenEnd;  // 完了後ずっと（状態用）
    const justFinished = s !== null && G.tickIdx === sharpenEnd;  // 完了した瞬間（アニメーション用）
    const heardCount = sharpenDone ? st.filter(t => t <= G.tickIdx && o.route[t - 1] === wl.house).length : 0;
    // 研ぎ完了時にSEを再生
    if (justFinished) {
      playSE(heardCount >= 2 ? 'sharpen_miss' : 'sharpen_success', G.day);
    }
    const row = [1, 2, 3, 4, 5].map(i => {
      let cl = 'tick';
      if (i <= G.tickIdx) cl += ' done';
      if (st.includes(i)) cl += ' claw';
      const heardThis = i <= G.tickIdx && st.includes(i) && o.route[i - 1] === wl.house;
      if (heardThis) cl += ' seen';
      if (i === G.tickIdx + 1) cl += ' now';
      // 今通過したティックにフラッシュ（完了フラッシュ以外）
      if (i === G.tickIdx && st.includes(i) && !justFinished) cl += ' flash';
      // 研ぎ完了時の結果クラス（3マス全部、完了後ずっと維持）
      if (sharpenDone && st.includes(i)) {
        cl += heardCount >= 2 ? ' fail' : ' success';
        // 完了した瞬間だけフラッシュ（成功時のみ）
        if (justFinished && heardCount < 2) cl += ' flash';
      }
      const nm = i <= G.tickIdx ? (personAt(v, o.route[i - 1]) ? personAt(v, o.route[i - 1]).name : getConfig().HLABEL[o.route[i - 1]]) : '—';
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
        if (mst.includes(i)) cl += ' madclaw';
        // 狂人が聞かれた（良いこと）
        if (md && i <= G.tickIdx && mst.includes(i) && o.route[i - 1] === md.house) cl += ' madheard';
        if (i === G.tickIdx + 1) cl += ' now';
        // 今通過したティックにフラッシュ
        if (i === G.tickIdx && mst.includes(i)) cl += ' flash';
        return `<div class="${cl}">${i}</div>`;
      }).join('');
      const madHouseName = md ? (personAt(v, md.house) ? personAt(v, md.house).name : getConfig().HLABEL[md.house]) : '';
      b += `<div class="madsec">
        <div class="madhead"><b>狂人の爪</b>（${madHouseName}）
          <button class="mini" onclick="G._madHelp=!G._madHelp;window._render()">${G._madHelp ? '閉じる' : '？'}</button></div>`;
      if (G._madHelp) b += `<p class="dim small">人狼とは別に狂人を研がせられる。人狼に研がせず狂人だけ鳴らせば、相手を狼の家から遠ざけられる。捕まっても何も起きない。</p>`;
      if (ms !== null) b += `<p class="good">狂人はティック${ms}〜${Math.min(ms + SHARPEN - 1, TICKS)}で研いでいる。</p>`;
      b += `<div class="ticks">${mrow}</div>`;
      if (ms === null && canSharpenMad(v)) b += `<div class="btnrow"><button class="madman" onclick="window._startSharpenMad()">狂人を研がせる</button></div>`;
      b += `</div>`;
    }

    b += `<div class="btnrow tickbtns">`;
    const tickDisabled = G.mode === 'online' && isProcessing() ? 'disabled' : '';
    if (v.tickDone) {
      b += `<button class="primary" ${tickDisabled} onclick="window._finishDay()">昼を終える</button>`;
    } else {
      if (canSharpen(v)) b += `<button class="danger" ${tickDisabled} onclick="window._startSharpen()">爪を研ぐ</button>`;
      b += `<button class="primary" ${tickDisabled} onclick="window._advanceTick()">次へ</button>`;
    }
    b += `</div>`;
    b += quitBtn;

    const head = v.tickDone
      ? `${G.day}日目・昼　5ティック目まで明けた`
      : `${G.day}日目・昼　ティック ${G.tickIdx}/${TICKS}`;
    el.innerHTML = H(head, b);
    return;
  }

  if (c.ph === 'night') {
    let b = '';
    if (v.heardToday !== null) {
      // 爪研ぎ音SE（聞こえた時のみ、同じ日に1回だけ、0.5秒遅延）
      if (v.heardToday) setTimeout(() => playSE('sharpening', G.day), 500);
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
      const { cards: attackCards, gridClass: attackGridClass } = villageGridCards(o.people, {
        onClickAttr: `onclick="window._selectAttack({id})"`,
        selectedId: v.attackTarget,
        forceVillagerImg: true,
        explorerId: o.explorer
      });
      b += `<p class="lead">爪は研げた。相手の村の誰を襲う？ 下のカードか、相手の村の地図の家をタップして選ぶ。人狼を狙うと空振りになる。</p>
        <div class="explorer-grid ${attackGridClass}">${attackCards}</div>`;
    } else {
      b += `<p class="warn">今夜、こちらから襲撃はできない。${v.spoiled ? '研ぎを見られた。' : ''}</p>`;
    }
    if (canProtect(v)) {
      const { cards: protectCards, gridClass: protectGridClass } = villageGridCards(v.people, {
        onClickAttr: `onclick="window._selectProtect({id})"`,
        selectedId: v.protectTarget,
        showRole: true,
        excludeRoles: ['guard', 'wolf'],
        explorerId: v.explorer
      });
      b += `<p class="good">護衛届がある。味方1人を守れる（護衛自身と人狼は守れない）。</p>
        <div class="explorer-grid ${protectGridClass}">${protectCards}</div>`;
    } else {
      b += `<p class="${guardAway(v) ? 'warn' : ''}">護衛は使えない。${protectReason(v)}</p>`;
      v.protectTarget = null;
    }
    const need = canAttack(v) && v.attackTarget === null;
    const nightDisabled = need || (G.mode === 'online' && isProcessing()) ? 'disabled' : '';
    b += `<div class="btnrow"><button class="primary" onclick="window._confirmNight()" ${nightDisabled}>夜を明かす</button></div>`;
    b += quitBtn;
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
      <div class="btnrow"><button class="primary" ${G.mode === 'online' && isProcessing() ? 'disabled' : ''} onclick="window._nextFromMorning()">${G.day >= getConfig().DAYS ? '決着を見る' : '次の日へ'}</button></div>
      ${quitBtn}`);
    // 自分の村人は無事 + 相手を倒した場合、success SE（ホットシートでは無効）
    if (!ra && rb && G.mode !== 'pvp' && G._successPlayed !== G.day) {
      G._successPlayed = G.day;
      playSE('success');
    }
    // 自分の村人が死亡した場合、GIF + 赤フラッシュ + SE + シェイク（ホットシートでは無効）
    if (ra && G.mode !== 'pvp' && G._deathFlashPlayed !== G.day) {
      G._deathFlashPlayed = G.day;
      // GIFエフェクト（最初に追加、キャッシュ回避で毎回再生）
      const gifEffect = document.createElement('img');
      gifEffect.src = '/finge_transparent.gif';
      gifEffect.className = 'death-gif';
      document.body.appendChild(gifEffect);
      setTimeout(() => gifEffect.remove(), 2000);
      // SE + シェイク
      playSE('wolf_howl');
      const scrollY = window.scrollY;
      const wrap = document.querySelector('.wrap');
      wrap.style.position = 'fixed';
      wrap.style.top = `-${scrollY}px`;
      wrap.style.left = '0';
      wrap.style.right = '0';
      wrap.classList.add('shake');
      setTimeout(() => {
        wrap.classList.remove('shake');
        wrap.style.position = '';
        wrap.style.top = '';
        wrap.style.left = '';
        wrap.style.right = '';
        window.scrollTo(0, scrollY);
      }, 400);
      const flash = document.createElement('div');
      flash.className = 'death-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 500);
    }
    return;
  }

  // end または idx範囲外 または done の場合は決着画面を表示
  const schedLen = G.sched ? G.sched.length : 0;
  const idxOutOfBounds = G.idx < 0 || G.idx >= schedLen;
  if (c.ph === 'end' || c.ph === 'unknown' || idxOutOfBounds || G.done) {
    // idx を安全な値に修正
    if (idxOutOfBounds && schedLen > 0) {
      G.idx = schedLen - 1;
    }
    const myId = G.myPlayerId || 1;
    const oppId = myId === 1 ? 2 : 1;
    const myName = G.myPlayerName || '自分';
    const oppName = G.opponentName || '相手';
    // 安全にaliveカウントを取得
    const safeAlive = (vObj) => {
      if (!vObj || !vObj.people) return [];
      return vObj.people.filter(p => p.alive);
    };
    const a = safeAlive(G.V[1]).length, f = safeAlive(G.V[2]).length;
    const myAlive = safeAlive(G.V[myId]).length, oppAlive = safeAlive(G.V[oppId]).length;
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
      head = `${getConfig().DAYS}夜が明けた`;
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
    // 背景画像の決定
    const bgType = verdict === '勝ち' ? 'win' : verdict === '負け' ? 'loss' : verdict.includes('勝ち') ? 'win' : 'draw';
    // 勝敗SE（ホットシートは常にloss、それ以外は勝敗に応じて）
    if (G.mode === 'pvp') {
      playSE('loss');
    } else if (bgType === 'win') {
      playSE('win');
    } else {
      playSE('loss');
    }
    el.innerHTML = `<div class="final ${bgType}">
      <div class="final-content">
        <div class="sub">${head}</div>
        <div class="score">${scoreLeft} — ${scoreRight}</div>
        <div class="verdict">${verdict}</div>
        ${note ? `<p class="note">${note}</p>` : ''}
        <p class="ledger-note">覚え書きに、伏せられていたことを書き足した。</p>
      </div>
      <div class="final-actions">
        <div class="final-btns">
          <div class="ledger-btns">
            <button onclick="window._playSE('casual');G.endView=${first};window._render()">${nm(first)}の覚え書き</button>
            <button onclick="window._playSE('casual');G.endView=${second};window._render()">${nm(second)}の覚え書き</button>
          </div>
          <button class="primary" onclick="window._restartGame()">もう一度</button>
        </div>
        <div class="quitrow" style="border:none;margin-top:12px">
          <button class="quit" onclick="window._backToTitle()">タイトルに戻る</button>
        </div>
      </div>
      <div class="reveal">
        ${G.V[first]?.people ? `${nm(first)}の村：${G.V[first].people.map(p => `${p.name}（${ROLE_LABEL[p.role]}${p.alive ? '' : '・死亡'}）`).join('　')}<br>` : ''}
        ${G.V[second]?.people ? `${nm(second)}の村：${G.V[second].people.map(p => `${p.name}（${ROLE_LABEL[p.role]}${p.alive ? '' : '・死亡'}）`).join('　')}` : ''}
      </div>
    </div>`;
    return;
  }

  // どのフェーズにも該当しない場合（デバッグ用フォールバック）
  console.error('Unknown phase:', c?.ph, 'idx:', G.idx, 'sched length:', G.sched?.length);
  el.innerHTML = `<div class="error" style="padding:20px;color:var(--akane-glow)">
    <p>予期しない状態が発生しました</p>
    <p style="font-size:12px;color:var(--kinari-faint)">フェーズ: ${c?.ph || '不明'} / idx: ${G.idx}</p>
    <button class="primary" onclick="window._showTitle()">タイトルに戻る</button>
  </div>`;
}
