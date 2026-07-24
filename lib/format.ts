// 숫자 표시 헬퍼

/** 원 단위 금액 → "433.9조" / "8,410억" 같은 한국식 표기 */
export function formatKrw(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${sign}${Math.round(abs / 1e8).toLocaleString()}억`;
  return `${sign}${abs.toLocaleString()}원`;
}

/** 원 단위 → 조 원 숫자 (차트 y축용) */
export function toJo(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round((value / 1e12) * 100) / 100;
}

/** 원 단위 → 억 원 숫자(정수). 차트는 이 값을 보관하고 규모에 따라 조/억을 골라 표기한다. */
export function toEok(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round(value / 1e8);
}

/** 주가(원) 표기 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString()}원`;
}

/** 지표값 표기 (배·% 등 단위 포함) */
export function formatMetric(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`;
}
