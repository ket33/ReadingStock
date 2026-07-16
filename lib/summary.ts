// 분석글 상단 "핵심 요약" — articles.summary(JSON 배열 문자열) 파서.
// 화면(ArticleTab)과 SEO(meta description)가 같은 파서를 쓴다.

/** '["…", …]' → string[] (파싱 실패·빈 배열이면 null → 요약 박스를 렌더하지 않는다) */
export function parseSummary(summary: string | null): string[] | null {
  if (!summary) return null;
  try {
    const parsed: unknown = JSON.parse(summary);
    if (!Array.isArray(parsed)) return null;
    const lines = parsed.filter((s): s is string => typeof s === "string" && s.trim() !== "");
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}
