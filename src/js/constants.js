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
      tl: [17, 18], tm: [50, 18], tr: [83, 18],
      ml: [17, 50], c: [50, 50], mr: [83, 50],
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

// ルール要約
export const RULES = [
  '各村5人（人狼1／護衛1／村人3）。初日に家を決めたら以後動かせない。探索者はどの家からでも探索を始められる。',
  '昼は<b>5ティック</b>。探索者は互いに伏せて選び、両者を開いてから経路を1マスずつ組む。<b>一度選んだ家は戻せない</b>（護衛届はその場で判定されるため、組み直しで在り処を探れてしまう）。',
  '爪研ぎは<b>3ティック連続</b>、中断不可。開始できるのはティック1・2・3。',
  '研ぎの3ティックのうち<b>2ティック</b>を探索者に居合わせられると、その夜の襲撃ができなくなる（連続でなくてよい）。',
  '探索者が<b>人狼</b>で、<b>3ティックすべて</b>に居合わせた場合、相手の人狼を追放して<b>その場で勝ち</b>。生存数は問わない。',
  '1回以上居合わせると「どこかで爪を研ぐ音を聞いた」とだけ覚え書きに残る。回数も場所も分からない。居合わせなければ「怪しい音はなかった」と残る。',
  '護衛届は毎昼、相手の村のどこかに1つ。取得していて護衛が存命なら、夜に一般村人1人を守れる（護衛自身と人狼は守れない）。',
  '<b>探索から帰った者は疲れて眠る。その夜、能力は使えない。</b>人狼を送れば襲撃できず、護衛を送れば誰も守れない。一般村人には夜の役目がないので影響がない。護衛は探索先で護衛届を見つけること自体はできる。',
  '襲撃が失敗したとき、襲った側には理由が分からない。襲われた側には分かる。',
  '3夜を終えて一度も食べられなかった人狼は餓死。最終スコアは人狼を含む生存数。同点あり。',
  '<b>［狂人＋犬飼い を入れた場合］</b>狂人の爪を相手の村で取ると、その夜、自分の村の狂人が人狼と同じティックで爪を研ぎ、相手の探索者に聞こえる音を撹乱する（狂人が生きていて留守でないとき）。狂人自身は探索者に何ティック聞かれても何も起きない。犬飼いを探索に送ると、狂人の贋物を無視して<b>人狼の爪の音だけ</b>を聞き分ける。',
  '<b>［霊媒師 を入れた場合］</b>霊媒の札を相手の村で取ると、その夜に倒せた相手がいれば、翌日その正体（役職）が分かる。霊媒師が生きていて留守でないとき働く。取った日限りで、倒せた相手がいなくても札は失う。',
  '<b>狂人の爪と霊媒の札は、1日目と2日目にしか出ない（3日目は出ない）。護衛届は毎日出る。</b>いずれも護衛届とは別の家に出るので、複数を取るには家を余分に回る必要がある。'
];
