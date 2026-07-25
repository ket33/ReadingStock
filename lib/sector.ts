// 금융업 판정 — 은행·보험·증권은 재무구조가 제조업과 달라 지표·차트를 다르게 다룬다.
// (파이썬 파이프라인 load_financial_toplines._is_financial 과 동일 규칙)
const FIN_SECTORS = ["금융", "은행", "보험", "증권"];

export function isFinancialSector(sector: string | null | undefined): boolean {
  const s = sector ?? "";
  return FIN_SECTORS.includes(s) || s.includes("금융");
}
