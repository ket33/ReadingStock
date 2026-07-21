// 스크리너 필터 공용 로직 — 종목 골라보기(ScreenerPage)와 워치리스트 카드가 함께 쓴다.
// UI는 각자 두되, '조건 통과 판정·프리셋 일치·컬럼 프리셋'은 여기서 한 곳으로 모은다.
import type { ScreenerRow } from "./screener-data";
import { type Preset, CATS, METRICS, BY_KEY } from "./metrics-catalog";

export interface MetricFilter {
  key: string;  // 지표 key
  min: string;  // 입력 문자열 (빈 값 = 조건 없음)
  max: string;
}

/** 컬럼 프리셋 — '기본'은 시가총액만. 카테고리를 고르면 그 지표 열이 붙는다. */
export const COL_PRESETS: { name: string; cols: string[] }[] = [
  { name: "기본", cols: ["market_cap"] },
  ...CATS.map(c => ({
    name: c,
    cols: [
      "market_cap",
      ...METRICS.filter(m => m.cat === c && m.key !== "market_cap").map(m => m.key as string),
    ],
  })),
];

/** 한 종목이 지표 필터 하나를 통과하는지 */
export function passes(row: ScreenerRow, f: MetricFilter): boolean {
  const def = BY_KEY.get(f.key);
  if (!def) return true;
  const min = f.min.trim() === "" ? null : parseFloat(f.min) * def.mult;
  const max = f.max.trim() === "" ? null : parseFloat(f.max) * def.mult;
  if (min == null && max == null) return true;  // 값 미입력 → 통과
  const v = row[def.key] as number | null;
  if (v == null) return false;                   // 조건이 있는데 값이 없으면 제외
  // 적자로 음수가 된 밸류에이션 배수는 'PER 15 이하' 의도(저평가+흑자)와 어긋나 제외
  if (def.cat === "밸류에이션" && v < 0) return false;
  if (min != null && !Number.isNaN(min) && v < min) return false;
  if (max != null && !Number.isNaN(max) && v > max) return false;
  return true;
}

/** 프리셋 칩이 현재 입력값과 일치하는지 (활성 표시용) */
export function presetActive(f: MetricFilter, p: Preset): boolean {
  const eq = (s: string, n?: number) =>
    n == null ? s.trim() === "" : parseFloat(s) === n;
  return eq(f.min, p.min) && eq(f.max, p.max);
}
