// SEO 공통 상수 + 분석글에서 검색·미리보기용 설명 문구를 뽑는 헬퍼.
// 사이트 대표 주소는 여기 한 곳에서만 관리한다(도메인이 바뀌면 이 값만 수정).

export const SITE_URL = "https://readingstock.com";
export const SITE_NAME = "Reading Stock";
export const SITE_SLOGAN = "당신의 투자를, 당신이 이해하도록 도와드려요";

// 공통 브랜드 미리보기 이미지 (app/opengraph-image.tsx가 그리는 라우트).
// generateMetadata에서 openGraph를 지정하면 파일 컨벤션 이미지가 덮어써지므로 명시적으로 참조한다.
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};

/** 검색결과·SNS 미리보기 설명은 대략 150자 안팎이 적당 — 그보다 길면 잘라낸다 */
const DESC_MAX = 155;

function truncate(text: string, max = DESC_MAX): string {
  if (text.length <= max) return text;
  // 자연스러운 경계(문장부호/공백)에서 자르고 말줄임표를 붙인다
  const cut = text.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다 "), cut.lastIndexOf(" "));
  return (lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd() + "…";
}

/** 마크다운/차트 마커/기호를 걷어내 순수 텍스트로 */
function stripMarkdown(md: string): string {
  return md
    .replace(/[〔\[]\s*차트[^〕\]]*[〕\]]/g, "")   // 〔차트 …〕 마커 제거
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")           // 이미지
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")         // 링크 → 텍스트만
    .replace(/\*\*([^*]+)\*\*/g, "$1")               // 볼드
    .replace(/\*([^*]+)\*/g, "$1")                   // 이탤릭
    .replace(/`([^`]+)`/g, "$1")                     // 인라인 코드
    .replace(/^#+\s*/gm, "")                         // 헤딩 기호
    .replace(/^>\s*/gm, "")                          // 인용
    .replace(/\s+/g, " ")
    .trim();
}

import { parseSummary } from "./summary";

/**
 * 상단 요약(1~2줄: 관통 문장 + 핵심 사실 1)으로 설명 문구를 만든다.
 * 관통 문장에 기업명이 들어 있어 검색 결과에 더 적합 — 있으면 본문 첫 문단보다 우선.
 */
export function summaryDescription(summary: string | null): string | null {
  const lines = parseSummary(summary);
  if (!lines) return null;
  const text = lines.slice(0, 2).join(" ");
  return text.length >= 20 ? truncate(text) : null;
}

/**
 * 분석글 본문에서 페이지 설명(description) 문구를 만든다.
 * 우선순위: 섹션 1("## 1. …")의 첫 문단 → 없으면 본문의 첫 실질 문단.
 * 실패하면 null.
 */
export function articleDescription(body: string): string | null {
  if (!body) return null;

  // 섹션 1 헤딩 뒤 첫 문단
  const sec1 = body.match(/(?:^|\n)(?:#{1,3}\s*|\*\*)\s*1\.\s[^\n]*\n+/);
  if (sec1) {
    const rest = body.slice(sec1.index! + sec1[0].length);
    const para = stripMarkdown(rest.split(/\n\s*\n/)[0] ?? "");
    if (para.length >= 20) return truncate(para);
  }

  // 폴백: 제목/메타/구분선을 건너뛴 첫 실질 문단
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith("#") || t === "---") continue;
    if (t.startsWith("*") && t.endsWith("*") && !t.startsWith("**")) continue; // 메타/디스클레이머 줄
    const clean = stripMarkdown(t);
    if (clean.length >= 20) return truncate(clean);
  }
  return null;
}
