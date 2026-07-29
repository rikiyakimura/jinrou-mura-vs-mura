// 盤面と定数
export const HOUSES = ['tl', 'tr', 'c', 'bl', 'br'];
export const HLABEL = { tl: '北西', tr: '北東', c: '中央', bl: '南西', br: '南東' };
export const ADJ = {
  tl: ['tr', 'bl', 'c'],
  tr: ['tl', 'br', 'c'],
  bl: ['tl', 'br', 'c'],
  br: ['tr', 'bl', 'c'],
  c: ['tl', 'tr', 'bl', 'br']
};
export const POS = {
  tl: [20, 18],
  tr: [80, 18],
  c: [50, 46],
  bl: [20, 74],
  br: [80, 74]
};
export const EDGES = [
  ['tl', 'tr'], ['tl', 'bl'], ['tr', 'br'], ['bl', 'br'],
  ['c', 'tl'], ['c', 'tr'], ['c', 'bl'], ['c', 'br']
];
export const edgeKey = (a, b) => [a, b].sort().join('-');
export const EDGE_KEYS = EDGES.map(([a, b]) => edgeKey(a, b));

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
  '佐吉', '源蔵', '卯之助', '六助', '甚平', '与市', '平次', '権三', '伊助', '藤吉', '弥七', '太一', '喜三郎', '徳蔵',
  '民江', 'きく', 'さと', 'とめ', 'つる', 'うめ', 'しの', 'かね', 'ふじ', 'なつ', 'いと', 'はな', 'よね', 'すえ'
];
