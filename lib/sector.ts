// 금융업 판정 — 은행·보험·증권은 재무구조가 제조업과 달라 지표·차트를 다르게 다룬다.
// (파이썬 파이프라인 load_financial_toplines._is_financial 과 동일 규칙)
const FIN_SECTORS = ["금융", "은행", "보험", "증권"];

export function isFinancialSector(sector: string | null | undefined): boolean {
  const s = sector ?? "";
  return FIN_SECTORS.some((t) => s.includes(t));
}

/** 금융 업종군 — 손익계산서 표시구조가 같은 것끼리 묶는다.
 *  load_financial_toplines.py의 fin_group()과 반드시 같은 판정이어야 한다.
 *  (여신금융은 '금융'도 포함하므로 은행/금융보다 먼저 걸러야 한다.) */
export type FinGroup = "SEC" | "INS" | "CARD" | "BANK";

export function finGroup(sector: string | null | undefined): FinGroup | null {
  const s = sector ?? "";
  if (s.includes("증권")) return "SEC";
  if (s.includes("보험")) return "INS";
  if (s.includes("여신") || s.includes("카드") || s.includes("캐피탈")) return "CARD";
  if (s.includes("은행") || s.includes("금융")) return "BANK";
  return null;
}
