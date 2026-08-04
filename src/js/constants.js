// 盤面と定数

// プリセット定義
export const PRESETS = {
  classic: {
    HOUSES: ['tl', 'tr', 'c', 'bl', 'br'],
    HLABEL: { tl: '北西', tr: '北東', c: '中央', bl: '南西', br: '南東' },
    ADJ: {
      tl: ['tr', 'bl', 'c'],
      tr: ['tl', 'br', 'c'],
      bl: ['tl', 'br', 'c'],
      br: ['tr', 'bl', 'c'],
      c: ['tl', 'tr', 'bl', 'br']
    },
    POS: {
      tl: [20, 20],
      tr: [80, 20],
      c: [50, 50],
      bl: [20, 80],
      br: [80, 80]
    },
    EDGES: [
      ['tl', 'tr'], ['tl', 'bl'], ['tr', 'br'], ['bl', 'br'],
      ['c', 'tl'], ['c', 'tr'], ['c', 'bl'], ['c', 'br']
    ],
    DAYS: 3,
    TICKS: 5,
    VILLAGERS: 5,
    PITS: 1
  },
  large: {
    HOUSES: ['tl', 'tm', 'tr', 'ml', 'c', 'mr', 'bl', 'bm', 'br'],
    HLABEL: {
      tl: '北西', tm: '北', tr: '北東',
      ml: '西', c: '中央', mr: '東',
      bl: '南西', bm: '南', br: '南東'
    },
    ADJ: {
      tl: ['tm', 'ml', 'c'],
      tm: ['tl', 'tr', 'ml', 'c', 'mr'],
      tr: ['tm', 'c', 'mr'],
      ml: ['tl', 'tm', 'c', 'bl', 'bm'],
      c: ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'],
      mr: ['tm', 'tr', 'c', 'bm', 'br'],
      bl: ['ml', 'c', 'bm'],
      bm: ['ml', 'c', 'mr', 'bl', 'br'],
      br: ['c', 'mr', 'bm']
    },
    POS: {
      tl: [17, 16], tm: [50, 16], tr: [83, 16],
      ml: [17, 49], c: [50, 49], mr: [83, 49],
      bl: [17, 82], bm: [50, 82], br: [83, 82]
    },
    EDGES: [
      // 外周（8本）
      ['tl', 'tm'], ['tm', 'tr'], ['tr', 'mr'], ['mr', 'br'],
      ['br', 'bm'], ['bm', 'bl'], ['bl', 'ml'], ['ml', 'tl'],
      // 内部縦横（4本）
      ['tm', 'c'], ['c', 'bm'], ['ml', 'c'], ['c', 'mr'],
      // 角から中央への斜め（4本）
      ['tl', 'c'], ['tr', 'c'], ['bl', 'c'], ['br', 'c'],
      // 辺同士の斜め（4本）
      ['tm', 'ml'], ['tm', 'mr'], ['bm', 'ml'], ['bm', 'mr']
    ],
    DAYS: 5,
    TICKS: 5,
    VILLAGERS: 9,
    PITS: 2
  }
};

// 現在のアクティブな設定
let activePreset = 'classic';

// edgeKeyユーティリティ関数
export const edgeKey = (a, b) => [a, b].sort().join('-');

// 動的設定を取得
export function getConfig() {
  const preset = PRESETS[activePreset];
  return {
    ...preset,
    EDGE_KEYS: preset.EDGES.map(([a, b]) => edgeKey(a, b))
  };
}

// プリセットを切り替え
export function setPreset(name) {
  if (PRESETS[name]) {
    activePreset = name;
  }
}

// 現在のプリセット名を取得
export function getPreset() {
  return activePreset;
}

// 後方互換性のため、既存のexportを維持（classicプリセットの値）
export const HOUSES = PRESETS.classic.HOUSES;
export const HLABEL = PRESETS.classic.HLABEL;
export const ADJ = PRESETS.classic.ADJ;
export const POS = PRESETS.classic.POS;
export const EDGES = PRESETS.classic.EDGES;
export const EDGE_KEYS = PRESETS.classic.EDGES.map(([a, b]) => edgeKey(a, b));

export const ROLE_LABEL = {
  wolf: '人狼',
  guard: '護衛',
  villager: '村人',
  madman: '狂人',
  medium: '霊媒師',
  dog: '犬飼い'
};

export const TICKS = 5;
export const SHARPEN = 3;
export const SPOIL = 2;
export const EXPOSE = 3;
export const DAYS = 3;

export const NAMES = [
  '佐吉', '源蔵', '卯之助', '六助', '甚平', '与市', '平次', '権三', '伊助',
  '民江', 'きく', 'さと', 'とめ', 'つる', 'うめ', 'しの', 'かね', 'ふじ'
];

export const NAME_TO_KEY = {
  '佐吉': 'sakichi', '源蔵': 'genzo', '卯之助': 'unosuke',
  '六助': 'rokusuke', '甚平': 'jinpei', '与市': 'yoichi',
  '平次': 'heiji', '権三': 'gonza', '伊助': 'isuke',
  '民江': 'tamie', 'きく': 'kiku', 'さと': 'sato',
  'とめ': 'tome', 'つる': 'tsuru', 'うめ': 'ume',
  'しの': 'shino', 'かね': 'kane', 'ふじ': 'fuji'
};
