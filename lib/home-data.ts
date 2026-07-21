// 홈 화면 데이터 로더 — 종목 카드에 필요한 값을 서버에서 조립
import { supabase } from "./supabase";
import { stripCompanyPrefix } from "./news-format";

// 홈 우측 '최신 뉴스' 한 줄 (종목명 + 뉴스 제목만)
export interface HomeNewsItem {
  id: number;
  stockCode: string;
  companyName: string;
  title: string;        // "종목명, " 접두어 제거본
  publishedAt: string;
}

export interface StockCard {
  stockCode: string;
  name: string;
  sector: string | null;
  marketCap: number | null;        // 원
  per: number | null;              // 최신(TTM 우선)
  divYield: number | null;         // %
  revCagr3y: number | null;        // % (최근 3년 연평균)
  niCagr3y: number | null;         // %
  excerpt: string | null;          // 분석글 섹션1 첫 문단
  latestArticleAt: string | null;  // 정렬(Latest)용
}

const QIDX = ["1Q", "2Q", "3Q", "4Q"];

/** (endYear, endQ)에서 뒤로 4개 단일분기 합 = TTM. 하나라도 없으면 null.
 *  단일분기 합은 중간 누적분기 값과 무관하게 FY로 텔레스코핑되므로 견고하다. */
function ttmSum(q: Map<string, number>, endYear: number, endQ: string): number | null {
  let i = QIDX.indexOf(endQ);
  if (i < 0) return null;
  let y = endYear, total = 0;
  for (let k = 0; k < 4; k++) {
    const v = q.get(`${y}-${QIDX[i]}`);
    if (v == null) return null;
    total += v;
    if (--i < 0) { i = 3; y--; }
  }
  return total;
}

/** 가장 최근 단일분기 (year, q). 없으면 null */
function latestQuarter(q: Map<string, number>): [number, string] | null {
  let by = -1, bi = -1, best: [number, string] | null = null;
  for (const key of q.keys()) {
    const [ys, qs] = key.split("-");
    const y = +ys, i = QIDX.indexOf(qs);
    if (i < 0) continue;
    if (y > by || (y === by && i > bi)) { by = y; bi = i; best = [y, qs]; }
  }
  return best;
}

/** 3년 CAGR(%): 끝점을 TTM(최근 4개 단일분기)으로, 기준점은 3년 전 같은 분기 종료 TTM으로.
 *  양끝 모두 '12개월 통째'라 계절성이 제거된다. 분기 이력이 부족하면 FY 양끝으로 폴백.
 *  이력 부족·음수/0 기반이면 null. */
function cagr3y(fy: Map<number, number>, q: Map<string, number>): number | null {
  let last: number | null = null, base: number | null = null;
  const lq = latestQuarter(q);
  if (lq) {
    last = ttmSum(q, lq[0], lq[1]);
    base = ttmSum(q, lq[0] - 3, lq[1]);
  }
  if (last == null || base == null) {          // TTM 불가 → FY 양끝으로 폴백
    if (fy.size === 0) return null;
    const years = [...fy.keys()].sort((a, b) => b - a);
    last = fy.get(years[0]) ?? null;
    base = fy.get(years[0] - 3) ?? null;
  }
  if (base == null || last == null || base <= 0 || last <= 0) return null;
  return Math.round((Math.pow(last / base, 1 / 3) - 1) * 1000) / 10;
}

/** 분석글에서 섹션 1의 첫 문단을 순수 텍스트로 발췌 */
function extractSection1(body: string): string | null {
  // "## 1. …" 또는 "**1. …**" 헤딩 뒤부터
  const m = body.match(/(?:^|\n)(?:#{1,3}\s*|\*\*)\s*1\.\s[^\n]*\n+/);
  if (!m) return null;
  const start = m.index! + m[0].length;
  // 다음 빈 줄(문단 끝)까지
  const rest = body.slice(start);
  const para = rest.split(/\n\s*\n/)[0] ?? "";
  const text = para
    .replace(/[〔\[]\s*차트[^〕\]]*[〕\]]/g, "")  // 차트 마커 제거
    .replace(/\*\*([^*]+)\*\*/g, "$1")            // 볼드 기호 제거
    .replace(/\*([^*]+)\*/g, "$1")                // 이탤릭 기호 제거
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/** 홈 우측 최신 뉴스 — 전 종목 최신순 (10개씩 더보기라 넉넉히 100건) */
export async function getHomeNews(): Promise<HomeNewsItem[]> {
  const [newsQ, companiesQ] = await Promise.all([
    supabase.from("company_news")
      .select("id,stock_code,title,published_at")
      .order("published_at", { ascending: false })
      .limit(100),
    supabase.from("companies").select("stock_code,name"),
  ]);
  const names = new Map((companiesQ.data ?? []).map(c => [c.stock_code as string, c.name as string]));
  return (newsQ.data ?? []).map(n => {
    const companyName = names.get(n.stock_code as string) ?? (n.stock_code as string);
    return {
      id: n.id as number,
      stockCode: n.stock_code as string,
      companyName,
      title: stripCompanyPrefix(n.title as string, companyName),
      publishedAt: n.published_at as string,
    };
  });
}

export async function getHomeData(): Promise<StockCard[]> {
  // 종목 수가 늘어도 동작하도록 전부 서버 조회 (5~수십 종목 규모 가정)
  const [companiesQ, screenerQ, finQ, articlesQ] = await Promise.all([
    supabase.from("companies").select("stock_code,name,sector"),
    // PER·배당수익률은 종목 페이지 상단과 동일하게 screener 스냅샷(오늘 주가 기준)에서 가져온다
    supabase.from("screener").select("stock_code,per,div_yield"),
    supabase.from("financials")
      .select("stock_code,fiscal_year,period,statement,account_std,value")
      .in("period", ["FY", "1Q", "2Q", "3Q", "4Q"])  // 누적분기(_cum) 제외 — 단일분기만
      .in("account_std", ["매출액", "당기순이익"])
      .in("statement", ["IS", "CIS"])
      .limit(10000),
    supabase.from("articles").select("stock_code,body,created_at")
      .order("created_at", { ascending: false }),
  ]);

  const companies = companiesQ.data ?? [];

  // 최신 시가총액: 종목별 최신 1행 (prices는 크니 종목별로 조회)
  const capEntries = await Promise.all(
    companies.map(async c => {
      const { data } = await supabase.from("prices")
        .select("market_cap")
        .eq("stock_code", c.stock_code)
        .order("date", { ascending: false })
        .limit(1);
      return [c.stock_code, data?.[0]?.market_cap ?? null] as const;
    })
  );
  const capMap = new Map(capEntries);

  // PER·배당수익률: screener 스냅샷(오늘 주가 기준) — 카드의 시가총액(현재가)·종목 페이지 상단과 정합
  const valuation = new Map<string, { per: number | null; div_yield: number | null }>();
  for (const s of screenerQ.data ?? []) {
    valuation.set(s.stock_code, { per: s.per, div_yield: s.div_yield });
  }

  // CAGR용: 연간(FY)과 단일분기를 분리 적재 (같은 키 중복이면 첫 값 유지)
  //  종목별로 매출은 한 statement에만 존재(SK=CIS, 삼성=IS)라 IS/CIS 혼선 없음.
  const revFY = new Map<string, Map<number, number>>();
  const niFY = new Map<string, Map<number, number>>();
  const revQ = new Map<string, Map<string, number>>();
  const niQ = new Map<string, Map<string, number>>();
  for (const r of finQ.data ?? []) {
    if (r.value == null) continue;
    const isRev = r.account_std === "매출액";
    if (r.period === "FY") {
      const t = isRev ? revFY : niFY;
      let m = t.get(r.stock_code);
      if (!m) { m = new Map(); t.set(r.stock_code, m); }
      if (!m.has(r.fiscal_year)) m.set(r.fiscal_year, r.value);
    } else {
      const t = isRev ? revQ : niQ;
      let m = t.get(r.stock_code);
      if (!m) { m = new Map(); t.set(r.stock_code, m); }
      const key = `${r.fiscal_year}-${r.period}`;
      if (!m.has(key)) m.set(key, r.value);
    }
  }

  // 종목별 최신 분석글
  const latestArticle = new Map<string, { body: string; created_at: string }>();
  for (const a of articlesQ.data ?? []) {
    if (!latestArticle.has(a.stock_code)) latestArticle.set(a.stock_code, a);
  }

  return companies.map(c => {
    const val = valuation.get(c.stock_code);
    const art = latestArticle.get(c.stock_code);
    return {
      stockCode: c.stock_code,
      name: c.name,
      sector: c.sector,
      marketCap: capMap.get(c.stock_code) ?? null,
      per: val?.per ?? null,
      divYield: val?.div_yield ?? null,
      revCagr3y: cagr3y(revFY.get(c.stock_code) ?? new Map(), revQ.get(c.stock_code) ?? new Map()),
      niCagr3y: cagr3y(niFY.get(c.stock_code) ?? new Map(), niQ.get(c.stock_code) ?? new Map()),
      excerpt: art ? extractSection1(art.body) : null,
      latestArticleAt: art?.created_at ?? null,
    };
  });
}
