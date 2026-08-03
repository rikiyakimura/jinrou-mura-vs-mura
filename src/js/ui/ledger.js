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
 * 単一の経路用ミニマップを描画
 */
function drawSingleRouteMap(path, isOwn) {
  if (!path || path.length < 2) return '';

  const config = getConfig();
  const { HOUSES, EDGES, POS } = config;
  const color = isOwn ? 'var(--moon)' : 'var(--kuchiba)';
  const markerId = 'arrow-' + (isOwn ? 'own' : 'opp') + '-' + Date.now();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'mini-map-svg');

  // 道（破線）を描画
  EDGES.forEach(([a, b]) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', POS[a][0]);
    l.setAttribute('y1', POS[a][1]);
    l.setAttribute('x2', POS[b][0]);
    l.setAttribute('y2', POS[b][1]);
    l.setAttribute('stroke', 'var(--indigo-edge)');
    l.setAttribute('stroke-width', '1');
    l.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(l);
  });

  // 矢印マーカー定義
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  mk.setAttribute('id', markerId);
  mk.setAttribute('markerWidth', '5');
  mk.setAttribute('markerHeight', '5');
  mk.setAttribute('refX', '4');
  mk.setAttribute('refY', '2.5');
  mk.setAttribute('orient', 'auto');
  const pa = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pa.setAttribute('d', 'M0,0 L5,2.5 L0,5 Z');
  pa.setAttribute('style', `fill:${color};opacity:0.9`);
  mk.appendChild(pa);
  defs.appendChild(mk);
  svg.appendChild(defs);

  // 経路矢印を描画
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (a === b) continue;

    const x1 = POS[a][0], y1 = POS[a][1];
    const x2 = POS[b][0], y2 = POS[b][1];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const pad = 7;

    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', x1 + ux * pad);
    ln.setAttribute('y1', y1 + uy * pad);
    ln.setAttribute('x2', x2 - ux * pad);
    ln.setAttribute('y2', y2 - uy * pad);
    ln.setAttribute('style', `stroke:${color};stroke-width:1.8;opacity:0.85`);
    ln.setAttribute('marker-end', `url(#${markerId})`);
    svg.appendChild(ln);
  }

  // 家を描画（丸いボックス風）
  HOUSES.forEach(h => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', POS[h][0]);
    c.setAttribute('cy', POS[h][1]);
    c.setAttribute('r', '5');
    c.setAttribute('fill', 'var(--indigo-lift)');
    c.setAttribute('stroke', 'var(--indigo-edge)');
    c.setAttribute('stroke-width', '0.8');
    svg.appendChild(c);
  });

  // ティック番号を表示
  const tickNums = {};
  path.forEach((h, i) => { (tickNums[h] = tickNums[h] || []).push(i + 1); });
  Object.entries(tickNums).forEach(([h, nums]) => {
    const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tx.setAttribute('x', POS[h][0]);
    tx.setAttribute('y', POS[h][1] - 8);
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('fill', color);
    tx.setAttribute('font-size', '7');
    tx.setAttribute('font-weight', '700');
    tx.textContent = nums.join(',');
    svg.appendChild(tx);
  });

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
    // 各行をレンダリング、経路エントリには直後にミニマップを追加
    const linesHtml = d.lines.map(l => {
      let html = `<div class="entry ${l.cls || ''}">${l.t}</div>`;

      // 経路エントリの場合、対応するミニマップを追加
      if (l.cls === 'route' && d.routes) {
        if (l.t.startsWith('自分') && d.routes.own && d.routes.own.path) {
          html += `<div class="mini-map">${drawSingleRouteMap(d.routes.own.path, true)}</div>`;
        } else if (l.t.startsWith('相手') && d.routes.opp && d.routes.opp.path) {
          html += `<div class="mini-map">${drawSingleRouteMap(d.routes.opp.path, false)}</div>`;
        }
      }
      return html;
    }).join('');

    return `<div class="dayblock"><div class="dayhead">${d.day}日目</div>${linesHtml}</div>`;
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
