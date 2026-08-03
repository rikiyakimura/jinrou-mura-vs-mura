/**
 * 覚え書き
 */

import { getConfig } from '../constants.js';

/**
 * 覚え書きパネルを開閉
 */
export function toggleLedger() {
  document.body.classList.toggle('ledger-open');
}

export function openLedger() {
  document.body.classList.add('ledger-open');
}

export function closeLedger() {
  document.body.classList.remove('ledger-open');
}

/**
 * ミニマップを描画（経路表示用）
 */
function drawMiniMap(routes) {
  const config = getConfig();
  const { HOUSES, POS } = config;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'mini-map-svg');

  // 家を小さな点で描画
  HOUSES.forEach(h => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', POS[h][0]);
    c.setAttribute('cy', POS[h][1]);
    c.setAttribute('r', '4');
    c.setAttribute('fill', 'var(--kinari-faint)');
    svg.appendChild(c);
  });

  // 矢印マーカー定義
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // 自分用マーカー（青）
  const mkOwn = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  mkOwn.setAttribute('id', 'arrow-own');
  mkOwn.setAttribute('markerWidth', '4');
  mkOwn.setAttribute('markerHeight', '4');
  mkOwn.setAttribute('refX', '3');
  mkOwn.setAttribute('refY', '2');
  mkOwn.setAttribute('orient', 'auto');
  const paOwn = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  paOwn.setAttribute('d', 'M0,0 L4,2 L0,4 Z');
  paOwn.setAttribute('fill', 'var(--moon)');
  mkOwn.appendChild(paOwn);
  defs.appendChild(mkOwn);

  // 相手用マーカー（オレンジ）
  const mkOpp = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  mkOpp.setAttribute('id', 'arrow-opp');
  mkOpp.setAttribute('markerWidth', '4');
  mkOpp.setAttribute('markerHeight', '4');
  mkOpp.setAttribute('refX', '3');
  mkOpp.setAttribute('refY', '2');
  mkOpp.setAttribute('orient', 'auto');
  const paOpp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  paOpp.setAttribute('d', 'M0,0 L4,2 L0,4 Z');
  paOpp.setAttribute('fill', 'var(--kuchiba)');
  mkOpp.appendChild(paOpp);
  defs.appendChild(mkOpp);

  svg.appendChild(defs);

  // 経路描画関数
  const drawRoute = (path, isOwn, offset) => {
    if (!path || path.length < 2) return;
    const color = isOwn ? 'var(--moon)' : 'var(--kuchiba)';
    const markerId = isOwn ? 'arrow-own' : 'arrow-opp';

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (a === b) continue;

      const x1 = POS[a][0], y1 = POS[a][1];
      const x2 = POS[b][0], y2 = POS[b][1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // 線を少しオフセット（重ならないように）
      const ox = -uy * offset, oy = ux * offset;
      const pad = 6;

      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1 + ux * pad + ox);
      ln.setAttribute('y1', y1 + uy * pad + oy);
      ln.setAttribute('x2', x2 - ux * pad + ox);
      ln.setAttribute('y2', y2 - uy * pad + oy);
      ln.setAttribute('stroke', color);
      ln.setAttribute('stroke-width', '1.5');
      ln.setAttribute('marker-end', `url(#${markerId})`);
      svg.appendChild(ln);
    }

    // ティック番号を表示
    const tickNums = {};
    path.forEach((h, i) => { (tickNums[h] = tickNums[h] || []).push(i + 1); });
    Object.entries(tickNums).forEach(([h, nums]) => {
      const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tx.setAttribute('x', POS[h][0] + (isOwn ? -7 : 7) + offset);
      tx.setAttribute('y', POS[h][1] + (isOwn ? -5 : 8));
      tx.setAttribute('fill', color);
      tx.setAttribute('font-size', '6');
      tx.setAttribute('font-weight', '600');
      tx.textContent = nums.join(',');
      svg.appendChild(tx);
    });
  };

  // 自分の経路
  if (routes.own) drawRoute(routes.own.path, true, -1.5);
  // 相手の経路
  if (routes.opp) drawRoute(routes.opp.path, false, 1.5);

  return svg.outerHTML;
}

/**
 * 覚え書きを描画
 */
export function renderLedger(v) {
  const el = document.getElementById('ledger');
  if (!v.log.length) {
    el.innerHTML = '<div class="entry none">まだ何も起きていない。</div>';
    return;
  }
  el.innerHTML = v.log.slice().reverse().map(d => {
    const linesHtml = d.lines.map(l => `<div class="entry ${l.cls || ''}">${l.t}</div>`).join('');
    const mapHtml = d.routes && (d.routes.own || d.routes.opp)
      ? `<div class="mini-map">${drawMiniMap(d.routes)}</div>`
      : '';
    return `<div class="dayblock"><div class="dayhead">${d.day}日目</div>${linesHtml}${mapHtml}</div>`;
  }).join('');
}

/**
 * スワイプイベントの初期化
 */
export function initLedgerSwipe() {
  let x0 = null, y0 = null, tracking = false;
  const isMobile = () => window.matchMedia('(max-width:980px)').matches;

  window.addEventListener('touchstart', e => {
    if (!isMobile()) return;
    const t = e.touches[0];
    x0 = t.clientX;
    y0 = t.clientY;
    const open = document.body.classList.contains('ledger-open');
    tracking = open || (x0 > window.innerWidth - 24);
  }, { passive: true });

  window.addEventListener('touchend', e => {
    if (!isMobile() || !tracking || x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) openLedger(); else closeLedger();
    }
    x0 = y0 = null;
    tracking = false;
  }, { passive: true });
}
