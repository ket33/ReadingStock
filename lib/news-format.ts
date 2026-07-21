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
