// ユーティリティ関数
export const rnd = a => a[Math.floor(Math.random() * a.length)];

export const shuf = a => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const other = p => p === 1 ? 2 : 1;
