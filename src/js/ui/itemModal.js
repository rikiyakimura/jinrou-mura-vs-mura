/**
 * アイテム詳細ポップアップ
 */

// アイテムデータ
const ITEMS = {
  permit: {
    id: 'permit',
    name: '護衛届',
    image: '/item/goeitodoke.webp',
    description: '護衛に味方1人を守らせる許可証。ただし護衛自身と人狼は守れない。護衛が探索に出た夜は使えない。味方の護衛が生存していないと無効となる。'
  },
  mad: {
    id: 'mad',
    name: '狂人の爪',
    image: '/item/kyoujinnotume.webp',
    description: '狂人に爪を研がせて贋の音を鳴らす。人狼の居場所を撹乱できるが、犬飼いには偽物と見破られる。狂人が探索に出ると使えない。味方の狂人が生存していないと無効となる。'
  },
  medium: {
    id: 'medium',
    name: '霊媒の札',
    image: '/item/reibainohuda.webp',
    description: '相手の村人を襲撃した翌日、襲撃に成功した時のみ襲撃した相手村人の役職が分かる。霊媒師が探索に出た夜は札が働かない。味方の霊媒師が生存していないと無効となる。'
  }
};

// アイテム名からIDを取得
function getItemIdByName(name) {
  if (name.includes('護衛届')) return 'permit';
  if (name.includes('狂人の爪')) return 'mad';
  if (name.includes('霊媒の札')) return 'medium';
  return null;
}

// モーダル要素を作成
let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement('div');
  modalEl.id = 'item-modal';
  modalEl.className = 'item-modal';
  modalEl.innerHTML = `
    <div class="item-modal-backdrop"></div>
    <div class="item-modal-content">
      <img class="item-modal-image" src="" alt="">
      <h3 class="item-modal-name"></h3>
      <p class="item-modal-desc"></p>
      <button class="item-modal-close">閉じる</button>
    </div>
  `;
  document.body.appendChild(modalEl);

  // 閉じるイベント
  modalEl.querySelector('.item-modal-backdrop').addEventListener('click', closeItemModal);
  modalEl.querySelector('.item-modal-close').addEventListener('click', closeItemModal);

  return modalEl;
}

/**
 * アイテムモーダルを開く
 */
export function openItemModal(itemId) {
  const item = ITEMS[itemId];
  if (!item) return;

  const modal = ensureModal();
  modal.querySelector('.item-modal-image').src = item.image;
  modal.querySelector('.item-modal-name').textContent = item.name;
  modal.querySelector('.item-modal-desc').textContent = item.description;
  modal.classList.add('open');
}

/**
 * アイテムモーダルを閉じる
 */
export function closeItemModal() {
  if (modalEl) {
    modalEl.classList.remove('open');
  }
}

/**
 * アイテムクリックハンドラを初期化
 */
export function initItemClickHandlers() {
  // イベント委譲でアイテムクリックを処理
  document.addEventListener('click', (e) => {
    // ステータスバーのアイテムリスト（.status-items span）
    const statusItem = e.target.closest('.status-items span');
    if (statusItem) {
      const itemId = getItemIdByName(statusItem.textContent);
      if (itemId) {
        e.preventDefault();
        openItemModal(itemId);
        return;
      }
    }

    // アイテムアイコン画像（.item-icon, .item-icon-sm）
    // 地図上のアイテム（.item-badge）は除外
    const itemIcon = e.target.closest('.item-icon, .item-icon-sm');
    if (itemIcon && !e.target.closest('.item-badge')) {
      const src = itemIcon.src || '';
      let itemId = null;
      if (src.includes('goeitodoke')) itemId = 'permit';
      else if (src.includes('kyoujinnotume')) itemId = 'mad';
      else if (src.includes('reibainohuda')) itemId = 'medium';
      if (itemId) {
        e.preventDefault();
        openItemModal(itemId);
        return;
      }
    }
  });
}

// グローバルに公開（onclick属性から呼び出し用）
if (typeof window !== 'undefined') {
  window.openItemModal = openItemModal;
  window.closeItemModal = closeItemModal;
}
