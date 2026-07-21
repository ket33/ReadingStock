// 뉴스룸 공용 표시 헬퍼 — 목록(NewsTab)과 상세 페이지(/news/[id])가 같이 쓴다

export const CATEGORY_LABEL: Record<string, string> = {
  earnings: "실적",
  contract: "계약",
  invest: "투자",
  capital: "자본",
  shareholder: "주주환원",
  structure: "구조",
  risk: "리스크",
  governance: "지배구조",
};

export function formatNewsDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/** 기사 제목의 "종목명, " 접두어 제거 — 종목 문맥에선 중복이라 표시에서 뺀다 */
export function stripCompanyPrefix(title: string, companyName: string): string {
  const t = title.trim();
  if (t.startsWith(companyName)) {
    const rest = t.slice(companyName.length).replace(/^\s*[,·]\s*/, "");
    if (rest) return rest;
  }
  return t;
}
