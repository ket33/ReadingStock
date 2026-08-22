import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStockPageData } from "@/lib/data";
import { articleDescription, summaryDescription, SITE_URL, SITE_NAME, SITE_SLOGAN, OG_IMAGE } from "@/lib/seo";
import StockPage from "@/components/StockPage";
import { stockJsonLd, jsonLdScript } from "@/lib/jsonld";

// 5분마다 재검증 (주가·글이 갱신되면 반영)
export const revalidate = 300;

// generateMetadata와 페이지가 같은 요청에서 DB를 두 번 치지 않도록 캐시로 감싼다
const loadStock = cache(getStockPageData);

export async function generateMetadata({ params }: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const data = await loadStock(code);
  if (!data) return {}; // 없는 종목은 notFound가 처리 — 기본 메타 유지

  const { company, article } = data;
  const title = `${company.name} (${company.stock_code}) 기업 분석`;
  // 우선순위: 상단 요약(관통 문장+핵심 1 — 기업명 포함) → 본문 첫 문단 → 기본 문구
  const description =
    summaryDescription(article?.summary ?? null) ??
    (article?.body ? articleDescription(article.body) : null) ??
    `${company.name}(${company.stock_code})의 재무제표·실적·밸류에이션을 쉽게 풀어드려요. ${SITE_SLOGAN}`;
  const url = `${SITE_URL}/stock/${company.stock_code}`;

  return {
    title, // 문서 제목: "…기업 분석 - Reading Stock" (layout 템플릿 적용)
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url,
      title: `${title} - ${SITE_NAME}`,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - ${SITE_NAME}`,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function Page({ params }: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await loadStock(code);
  if (!data) notFound();

  const { company, article } = data;
  // 리포트 본문 첫 H1이 헤드라인 — 없으면 Article 블록 자체를 내지 않는다
  const headline = article?.body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
  const jsonLd = stockJsonLd({
    name: company.name,
    stockCode: company.stock_code,
    market: company.market,
    sector: data.primaryGroup ?? company.sector,
    description:
      summaryDescription(article?.summary ?? null) ??
      (article?.body ? articleDescription(article.body) : null) ??
      `${company.name}(${company.stock_code})의 재무제표·실적·밸류에이션을 쉽게 풀어드려요.`,
    articleHeadline: headline,
    articleCreatedAt: article?.created_at ?? null,
    articleUpdatedAt: article?.created_at ?? null,
  });

  return (
    <>
      {/* Material Symbols (사이드바 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      {/* 구조화 데이터 — 검색엔진이 '어떤 기업의 무슨 문서'인지 구조로 읽는다 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <StockPage data={data} />
    </>
  );
}
