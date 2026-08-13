// 스퀘리파이드 트리맵 레이아웃 (Bruls et al.) — 라이브러리 없이 순수 계산.
// 값 비례 면적의 사각형들을 최대한 정사각형에 가깝게 배치한다.
// 좌표는 호출자가 넘긴 rect 단위 그대로 반환 — 렌더링 쪽에서 %로 환산해 쓴다.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed<T> {
  rect: Rect;
  data: T;
}

/** items(value>0만 유효)를 rect 안에 면적 비례로 배치. 값 내림차순으로 처리한다. */
export function squarify<T>(items: { value: number; data: T }[], rect: Rect): Placed<T>[] {
  const valid = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (valid.length === 0) return [];
  const total = valid.reduce((s, i) => s + i.value, 0);
  const area = rect.w * rect.h;
  const scaled = valid.map(i => ({ area: (i.value / total) * area, data: i.data }));

  const out: Placed<T>[] = [];
  const r: Rect = { ...rect };
  let row: typeof scaled = [];

  // 행(row)을 이 변에 붙였을 때 최악의 종횡비 — 작을수록 정사각형에 가깝다
  const worst = (rw: typeof scaled, side: number): number => {
    const s = rw.reduce((a, b) => a + b.area, 0);
    let mx = 0;
    for (const it of rw) {
      const ratio = Math.max((side * side * it.area) / (s * s), (s * s) / (side * side * it.area));
      mx = Math.max(mx, ratio);
    }
    return mx;
  };

  const placeRow = (rw: typeof scaled) => {
    const s = rw.reduce((a, b) => a + b.area, 0);
    if (r.w >= r.h) {
      // 왼쪽에 세로 열로 배치
      const w = s / r.h;
      let y = r.y;
      for (const it of rw) {
        const h = it.area / w;
        out.push({ rect: { x: r.x, y, w, h }, data: it.data });
        y += h;
      }
      r.x += w;
      r.w -= w;
    } else {
      // 위쪽에 가로 행으로 배치
      const h = s / r.w;
      let x = r.x;
      for (const it of rw) {
        const w = it.area / h;
        out.push({ rect: { x, y: r.y, w, h }, data: it.data });
        x += w;
      }
      r.y += h;
      r.h -= h;
    }
  };

  for (let i = 0; i < scaled.length; ) {
    const side = Math.min(r.w, r.h);
    const next = scaled[i];
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      i++;
    } else {
      placeRow(row);
      row = [];
    }
  }
  if (row.length) placeRow(row);
  return out;
}
