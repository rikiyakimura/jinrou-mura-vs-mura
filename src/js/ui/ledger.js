/**
 * 覚え書き
 */

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
 * 覚え書きを描画
 */
export function renderLedger(v) {
  const el = document.getElementById('ledger');
  if (!v.log.length) {
    el.innerHTML = '<div class="entry none">まだ何も起きていない。</div>';
    return;
  }
  el.innerHTML = v.log.slice().reverse().map(d =>
    `<div class="dayblock"><div class="dayhead">${d.day}日目</div>` +
    d.lines.map(l => `<div class="entry ${l.cls || ''}">${l.t}</div>`).join('') + `</div>`).join('');
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
