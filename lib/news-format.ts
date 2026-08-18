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

// 공시일은 KST 자정으로 저장된다(news/backfill_group.py: rcept_dt + tzinfo=KST).
// DB(timestamptz)는 이를 UTC로 돌려주므로 "2026-08-18 00:00 KST" → "2026-08-17T15:00:00+00:00".
// 그래서 ISO 문자열을 slice(0,10)로 자르면 하루 전 날짜가 나온다(실제 버그였음).
// 아래 두 함수는 반드시 Asia/Seoul을 명시해 변환한다 — 렌더링이 서버(UTC)에서 일어나든
// 브라우저에서 일어나든 같은 날짜가 나오게 하려면 timeZone 고정이 필수다.
// 날짜를 새로 표시하는 곳이 생기면 slice()를 쓰지 말고 이 함수들을 재사용할 것.
const KST = "Asia/Seoul";

/** 상세용 — "2026년 8월 18일" */
export function formatNewsDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", timeZone: KST,
  });
}

/** 목록·카드용 — "2026.08.18" */
export function formatNewsDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: KST,
  }).replace(/\.$/, "").replaceAll(". ", ".");
}

/** 정렬·매칭용 KST 날짜키 — "2026-08-18".
 *  prices.date(한국 거래일)와 같은 축에 놓고 비교하려면 반드시 이걸 써야 한다.
 *  UTC 기준으로 자르면 공시가 하루 앞 거래일에 찍힌다. */
export function kstDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: KST });
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
