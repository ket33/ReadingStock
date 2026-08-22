// 구조화 데이터(schema.org JSON-LD) 조립.
//
// 검색엔진이 '이 페이지가 어떤 기업에 대한 무슨 문서인지'를 문장이 아니라 구조로 읽게 한다.
// 종목 페이지는 세 가지를 함께 낸다:
//   Corporation  — 종목 실체(이름·종목코드·업종). tickerSymbol이 지식 패널 연결의 핵심.
//   Article      — 리포트(제목·발행일·저자). 리포트가 없는 종목은 내지 않는다.
//   BreadcrumbList — 홈 → 종목. 검색결과에 경로가 붙는다.
//
// ※ 값이 없으면 그 속성을 아예 빼야 한다. null·빈 문자열을 넣으면 구글이 오류로 잡는다.
import { SITE_URL, SITE_NAME } from "./seo";

/** JSON-LD를 <script>에 넣을 때 </script>로 조기 종료되는 걸 막는다 (XSS 방어) */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== ""),
  ) as T;
}

export interface StockJsonLdInput {
  name: string;
  stockCode: string;
  market: string | null;
  sector: string | null;
  description: string;
  articleHeadline: string | null;
  articleCreatedAt: string | null;
  articleUpdatedAt: string | null;
}

/** 종목 페이지용 JSON-LD 묶음 (@graph로 한 번에 낸다) */
export function stockJsonLd(i: StockJsonLdInput) {
  const url = `${SITE_URL}/stock/${i.stockCode}`;
  const orgId = `${url}#corporation`;

  // KRX 종목코드는 ISIN 같은 국제 표준이 아니라 거래소 티커다. tickerSymbol만으로는
  // 어느 시장인지 모호하므로 identifier에 시장(KOSPI/KOSDAQ)을 함께 밝힌다.
  const corporation = clean({
    "@type": "Corporation",
    "@id": orgId,
    name: i.name,
    tickerSymbol: i.stockCode,
    url,
    ...(i.sector ? { industry: i.sector } : {}),
    identifier: [{
      "@type": "PropertyValue",
      propertyID: i.market ?? "KRX",
      value: i.stockCode,
    }],
  });

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: i.name, item: url },
    ],
  };

  const graph: Record<string, unknown>[] = [corporation, breadcrumb];

  // 리포트가 있을 때만 Article — 없는 종목에 빈 기사를 주장하면 안 된다
  if (i.articleHeadline && i.articleCreatedAt) {
    graph.push(clean({
      "@type": "Article",
      "@id": `${url}#article`,
      headline: i.articleHeadline.slice(0, 110),  // 구글 권장 상한
      description: i.description,
      datePublished: i.articleCreatedAt,
      dateModified: i.articleUpdatedAt ?? i.articleCreatedAt,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      about: { "@id": orgId },
      author: { "@type": "Organization", name: `${SITE_NAME}'s Analyst`, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      inLanguage: "ko-KR",
    }));
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/** 사이트 전역(홈) — 검색창 연결과 발행처 정체성 */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "ko-KR",
        publisher: { "@id": `${SITE_URL}#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: SITE_NAME,
        url: SITE_URL,
      },
    ],
  };
}
