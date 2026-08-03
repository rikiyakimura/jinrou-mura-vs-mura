/**
 * 地図描画
 */

import { ROLE_LABEL, edgeKey, getConfig, NAME_TO_KEY } from '../constants.js';
import { personAt } from '../state.js';

/**
 * 地図を描画
 * @param {HTMLElement} el - 描画先の要素
 * @param {object} village - 村オブジェクト
 * @param {object} o - オプション
 */
export function drawMap(el, village, o) {
  const config = getConfig();
  const { HOUSES, EDGES, POS, HLABEL } = config;

  el.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  // 道（辺）を描画
  const pitEdges = []; // 落とし穴マークは後で描画
  EDGES.forEach(([a, b]) => {
    const key = edgeKey(a, b);
    const isPit = (o.pitEdge && o.pitEdge.includes(key));
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', POS[a][0]); l.setAttribute('y1', POS[a][1]);
    l.setAttribute('x2', POS[b][0]); l.setAttribute('y2', POS[b][1]);
    if (isPit) {
      l.setAttribute('style', 'stroke:var(--akane-glow);stroke-width:2.4;stroke-dasharray:none;opacity:0.9');
      pitEdges.push([a, b]); // 後で描画するために保存
    }
    svg.appendChild(l);

    // 辺を選ぶモード
    if (o.edgePick) {
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hit.setAttribute('class', 'edge-pick');
      hit.setAttribute('x1', POS[a][0]); hit.setAttribute('y1', POS[a][1]);
      hit.setAttribute('x2', POS[b][0]); hit.setAttribute('y2', POS[b][1]);
      hit.setAttribute('style', 'cursor:pointer;stroke:rgba(0,0,0,0.001);stroke-width:13;stroke-dasharray:none;stroke-linecap:round');
      hit.addEventListener('click', () => o.onEdgePick(key));
      svg.appendChild(hit);
    }
  });

  // 経路の矢印
  const rp = o.routePath || [];
  for (let i = 0; i < rp.length - 1; i++) {
    const a = rp[i], b = rp[i + 1];
    if (a === b) continue;
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const x1 = POS[a][0], y1 = POS[a][1], x2 = POS[b][0], y2 = POS[b][1];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const pad = 9;
    ln.setAttribute('x1', x1 + ux * pad); ln.setAttribute('y1', y1 + uy * pad);
    ln.setAttribute('x2', x2 - ux * pad); ln.setAttribute('y2', y2 - uy * pad);
    const arrowColor = o.routeMine ? 'var(--moon)' : 'var(--kuchiba)';
    ln.setAttribute('style', `stroke:${arrowColor};stroke-width:1.5;opacity:0.7;stroke-dasharray:none`);
    ln.setAttribute('marker-end', 'url(#arrow-' + (o.routeMine ? 'm' : 'f') + ')');
    svg.appendChild(ln);
  }

  // 矢印マーカー定義
  if (rp.length > 1) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    ['m', 'f'].forEach(k => {
      const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      mk.setAttribute('id', 'arrow-' + k);
      mk.setAttribute('markerWidth', '5'); mk.setAttribute('markerHeight', '5');
      mk.setAttribute('refX', '4'); mk.setAttribute('refY', '2.5');
      mk.setAttribute('orient', 'auto');
      const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pa.setAttribute('d', 'M0,0 L5,2.5 L0,5 Z');
      const markerColor = k === 'm' ? 'var(--moon)' : 'var(--kuchiba)';
      pa.setAttribute('style', `fill:${markerColor};opacity:0.8`);
      mk.appendChild(pa); defs.appendChild(mk);
    });
    svg.appendChild(defs);
  }

  // 落とし穴マーク（ルート矢印の上に描画）
  pitEdges.forEach(([a, b]) => {
    const key = edgeKey(a, b);
    const mx = (POS[a][0] + POS[b][0]) / 2, my = (POS[a][1] + POS[b][1]) / 2;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.setAttribute('cx', mx); circ.setAttribute('cy', my); circ.setAttribute('r', '5.5');
    circ.setAttribute('fill', 'var(--akane)');
    circ.setAttribute('stroke', 'var(--kinari)');
    circ.setAttribute('stroke-width', '0.6');
    const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tx.setAttribute('x', mx); tx.setAttribute('y', my);
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('dominant-baseline', 'central');
    tx.setAttribute('fill', 'var(--kinari)');
    tx.setAttribute('font-size', '8'); tx.setAttribute('font-weight', '700');
    tx.textContent = '!';
    g.appendChild(circ); g.appendChild(tx);
    // 配置モードではクリックで解除可能
    if (o.edgePick) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => o.onEdgePick(key));
    }
    svg.appendChild(g);
  });

  // ティック番号を集める
  const tickNums = {};
  rp.forEach((h, i) => { (tickNums[h] = tickNums[h] || []).push(i + 1); });

  el.appendChild(svg);

  // 家を描画
  HOUSES.forEach(h => {
    const d = document.createElement('div');
    d.className = 'house';
    d.style.left = POS[h][0] + '%';
    d.style.top = POS[h][1] + '%';

    let occ = '—', cls = 'role-villager', rt = '', occCls = '', badge = '';
    const p = personAt(village, h);
    if (p) {
      occ = p.name;
      if (!p.alive) { cls = 'role-dead'; rt = '死亡'; occCls = ' occ-dead'; }
      else if (o.omniscient) { cls = 'role-' + p.role; rt = ROLE_LABEL[p.role]; }
      else if (o.showExplorer && village.explorer === p.id) { cls = 'role-away'; rt = '探索者'; }

      // ポートレートバッジ
      const imgKey = NAME_TO_KEY[p.name];
      if (imgKey) {
        const role = o.omniscient ? p.role : 'villager';
        badge = `<img class="house-badge${!p.alive ? ' dead' : ''}" src="/portraits/${imgKey}_${role}.webp" alt="">`;
      }
    }

    d.innerHTML = `${badge}<span class="hname">${HLABEL[h]}</span><span class="occ${occCls}">${occ}</span><span class="role ${cls}">${rt}</span>`;

    if (o.omniscient && o.sharpenHouse === h) {
      d.classList.add('sharpening');
      if (village.spoiled) d.classList.add('spoiled');
    }

    if (!o.omniscient && o.itemHouses) {
      const badges = [];
      if (o.itemHouses.permit === h) badges.push('<img src="/item/goeitodoke.webp" class="item-badge" title="護衛届">');
      if (o.itemHouses.claw === h) badges.push('<img src="/item/kyoujinnotume.webp" class="item-badge" title="狂人の爪">');
      if (o.itemHouses.medium === h) badges.push('<img src="/item/reibainohuda.webp" class="item-badge" title="霊媒の札">');
      if (badges.length) {
        d.classList.add('permitfound');
        badges.forEach(b => { d.innerHTML += '<span class="badge">' + b + '</span>'; });
      }
    }

    if (o.pickable) {
      if (o.pickable(h)) {
        d.classList.add('pick');
        d.onclick = () => o.onPick(h);
      } else {
        d.classList.add('disabled');
      }
    }

    if (o.attackTargetHouse === h) {
      d.classList.add('attacksel');
    }

    if (tickNums[h]) {
      const nb = document.createElement('div');
      nb.className = 'ticknum' + (o.routeMine ? ' mine' : '');
      nb.textContent = tickNums[h].join(',');
      d.appendChild(nb);
    }

    el.appendChild(d);
  });

  // トークン
  (o.tokens || []).forEach(t => {
    const s = document.createElement('div');
    s.className = 'token' + (t.mine ? ' mine' : '');
    s.textContent = t.label;
    s.style.left = POS[t.house][0] + '%';
    s.style.top = (POS[t.house][1] + 13) + '%';
    el.appendChild(s);
  });
}
