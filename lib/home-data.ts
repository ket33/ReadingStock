// 홈 화면 데이터 로더 — screener 표(종목당 한 줄 스냅샷) 하나만 읽는다.
//
// 이전 구조는 companies + screener + financials(1만행) + articles(본문 전량)
// + prices(종목당 1회 = N+1)를 서버에서 조립했는데, 2,500종목이면
//   - financials 조회가 PostgREST 1,000행 캡에 잘려 CAGR이 대부분 비고
//   - prices N+1이 2,500쿼리가 되어 렌더가 불가능해진다.
// 지금은 일일 배치(update_screener_daily.py)가 카드에 필요한 모든 값
// (시총·PER·배당·성장률·발췌문·산업그룹·발간시각·셔플 난수)을 screener에 채워 두고,
// 홈은 그걸 정렬·페이징해서 읽기만 한다. 종목 수와 무관하게 요청당 한 페이지 분량 고정.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { stripCompanyPrefix } from "./news-format";

/** 홈 종목 카드 페이지 크기 — 서버 첫 렌더와 클라이언트 '더보기'가 같은 값을 쓴다 */
export const HOME_PAGE_SIZE = 8;

// 홈 우측 '최신 뉴스' 한 줄 (종목명 + 뉴스 제목만)
export interface HomeNewsItem {
  id: number;
  stockCode: string;
  companyName: string;
  title: string;        // "종목명, " 접두어 제거본
  publishedAt: string;
  ret1d: number | null; // 일간 등락률(%)
}

export interface StockCard {
  stockCode: string;
  name: string;
  sector: string | null;
  industryGroup: string | null;    // 산업 그룹 분류 primary 그룹명 (배지용, 없으면 sector 폴백)
  marketCap: number | null;        // 원
  per: number | null;              // 최신(TTM 우선, 현재가 환산)
  divYield: number | null;         // %
  revCagr3y: number | null;        // % — screener.revenue_growth_3y (배치 계산)
  niCagr3y: number | null;         // % — screener.earnings_growth_3y
  excerpt: string | null;          // 분석글 섹션1 첫 문단 (배치가 발췌)
  latestArticleAt: string | null;  // 정렬(최신순)용
}

export type HomeSort = "random" | "marketCap" | "latest";

/** 홈 목록 한 페이지 + 전체 종목 수 */
export interface HomePageChunk {
  stocks: StockCard[];
  total: number;
}

// screener에서 카드로 쓰는 컬럼만 — 60여 컬럼 전체(*)를 받지 않는다
const CARD_COLS =
  "stock_code,name,sector,industry_group,market_cap,per,div_yield," +
  "revenue_growth_3y,earnings_growth_3y,excerpt,latest_article_at";

interface CardRow {
  stock_code: string;
  name: string;
  sector: string | null;
  industry_group: string | null;
  market_cap: number | null;
  per: number | null;
  div_yield: number | null;
  revenue_growth_3y: number | null;
  earnings_growth_3y: number | null;
  excerpt: string | null;
  latest_article_at: string | null;
}

function toCard(r: CardRow): StockCard {
  return {
    stockCode: r.stock_code,
    name: r.name,
    sector: r.sector,
    industryGroup: r.industry_group,
    marketCap: r.market_cap,
    per: r.per,
    divYield: r.div_yield,
    revCagr3y: r.revenue_growth_3y,
    niCagr3y: r.earnings_growth_3y,
    excerpt: r.excerpt,
    latestArticleAt: r.latest_article_at,
  };
}

/**
 * 홈 종목 카드 한 페이지.
 *
 * 정렬별 order 컬럼 (전부 sql/scale_2500.sql의 인덱스를 탄다):
 *   random    → shuffle (배치가 매일 새로 뿌리는 난수 — 페이징 가능한 '랜덤')
 *   marketCap → market_cap desc nulls last
 *   latest    → latest_article_at desc nulls last (발간글 없는 종목은 뒤로)
 */
export async function fetchHomeStocks(
  sb: SupabaseClient,
  sort: HomeSort,
  offset: number,
  limit: number,
  withCount = false,   // count 쿼리는 공짜가 아니라 필요할 때(첫 로드)만
): Promise<HomePageChunk> {
  // 리포트가 발간된 종목만 — 온보딩만 되고 리포트가 없는 기업(확장 후엔 다수)은
  // 발췌문 없는 빈 카드가 되므로 홈에서 뺀다. 홈 카드에만 거는 필터다:
  // 검색·스크리너·산업 페이지·최신 뉴스에서는 여전히 전 종목이 보인다.
  // latest_article_at은 일일 배치(update_screener_daily.py)가 articles에서 채우므로
  // 리포트 발간 → 다음 배치 + ISR 5분 후 자동으로 홈에 나타난다.
  // count도 같은 쿼리를 지나므로 랜덤 시작점·더보기 페이징이 필터와 어긋나지 않는다.
  let q = sb.from("screener")
    .select(CARD_COLS, withCount ? { count: "exact" } : undefined)
    .not("latest_article_at", "is", null);
  if (sort === "latest") {
    q = q.order("latest_article_at", { ascending: false, nullsFirst: false });
  } else if (sort === "marketCap") {
    q = q.order("market_cap", { ascending: false, nullsFirst: false });
  } else {
    // shuffle 난수가 아직 없는(배치 전) 행은 뒤로 — 시총순으로 2차 정렬해 순서 안정화
    q = q.order("shuffle", { ascending: true, nullsFirst: false })
         .order("market_cap", { ascending: false, nullsFirst: false });
  }
  const { data, count } = await q.range(offset, offset + limit - 1);
  return {
    stocks: ((data ?? []) as unknown as CardRow[]).map(toCard),
    total: count ?? 0,
  };
}

/** 서버(ISR) 편의 래퍼 — 홈 첫 페이지 렌더용. 전체 종목 수도 함께 돌려준다. */
export function getHomeStocks(
  sort: HomeSort,
  offset: number,
  limit: number,
): Promise<HomePageChunk> {
  return fetchHomeStocks(supabase, sort, offset, limit, true);
}

/** 홈 우측 최신 뉴스 — 전 종목 최신순 (10개씩 더보기라 넉넉히 100건) */
export async function getHomeNews(): Promise<HomeNewsItem[]> {
  const { data } = await supabase.from("company_news")
    .select("id,stock_code,title,published_at")
    .order("published_at", { ascending: false })
    .limit(100);
  const news = data ?? [];
  if (news.length === 0) return [];

  // 이름·등락률은 뉴스에 등장한 종목만 조회 (전 종목 스캔 금지 — 2,500행 캡·전송량 방지)
  const codes = [...new Set(news.map(n => n.stock_code as string))];
  const { data: scr } = await supabase.from("screener")
    .select("stock_code,name,ret_1d")
    .in("stock_code", codes);
  const meta = new Map((scr ?? []).map(s => [
    s.stock_code as string,
    { name: s.name as string, ret1d: (s.ret_1d as number | null) ?? null },
  ]));

  return news.map(n => {
    const m = meta.get(n.stock_code as string);
    const companyName = m?.name ?? (n.stock_code as string);
    return {
      id: n.id as number,
      stockCode: n.stock_code as string,
      companyName,
      title: stripCompanyPrefix(n.title as string, companyName),
      publishedAt: n.published_at as string,
      ret1d: m?.ret1d ?? null,
    };
  });
}
