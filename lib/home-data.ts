// 홈 화면 데이터 로더 — 종목 카드에 필요한 값을 서버에서 조립
import { supabase } from "./supabase";

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

const QORDER = ["1Q", "2Q", "3Q", "4Q", "FY"];

/** 3년 CAGR(%): 최신 FY값과 3년 전 값으로 계산. 이력 부족·음수 기반이면 null */
function cagr3y(byYear: Map<number, number>): number | null {
  if (byYear.size === 0) return null;
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const latest = years[0];
  const base = byYear.get(latest - 3);
  const last = byYear.get(latest);
  if (base == null || last == null) return null;
  if (base <= 0 || last <= 0) return null; // 음수·0 기반 CAGR은 의미 없음 → N/A
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

export async function getHomeData(): Promise<StockCard[]> {
  // 종목 수가 늘어도 동작하도록 전부 서버 조회 (5~수십 종목 규모 가정)
  const [companiesQ, metricsQ, finQ, articlesQ] = await Promise.all([
    supabase.from("companies").select("stock_code,name,sector"),
    supabase.from("metrics").select("stock_code,fiscal_year,period,per,div_yield"),
    supabase.from("financials")
      .select("stock_code,fiscal_year,statement,account_std,value")
      .eq("period", "FY")
      .in("account_std", ["매출액", "당기순이익"])
      .in("statement", ["IS", "CIS"])
      .limit(5000),
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

  // 최신 metrics (분기 TTM 우선)
  const latestMetrics = new Map<string, { per: number | null; div_yield: number | null }>();
  for (const m of metricsQ.data ?? []) {
    const cur = latestMetrics.get(m.stock_code) as
      | { fy: number; pi: number; per: number | null; div_yield: number | null }
      | undefined;
    const pi = QORDER.indexOf(m.period);
    if (!cur || m.fiscal_year > cur.fy || (m.fiscal_year === cur.fy && pi > cur.pi)) {
      latestMetrics.set(m.stock_code, {
        fy: m.fiscal_year, pi, per: m.per, div_yield: m.div_yield,
      } as never);
    }
  }

  // CAGR용 연도별 매출·순이익 (통일된 IS 우선, 같은 해 중복이면 첫 값 유지)
  const revMap = new Map<string, Map<number, number>>();
  const niMap = new Map<string, Map<number, number>>();
  for (const r of finQ.data ?? []) {
    if (r.value == null) continue;
    const target = r.account_std === "매출액" ? revMap : niMap;
    let m = target.get(r.stock_code);
    if (!m) { m = new Map(); target.set(r.stock_code, m); }
    if (!m.has(r.fiscal_year)) m.set(r.fiscal_year, r.value);
  }

  // 종목별 최신 분석글
  const latestArticle = new Map<string, { body: string; created_at: string }>();
  for (const a of articlesQ.data ?? []) {
    if (!latestArticle.has(a.stock_code)) latestArticle.set(a.stock_code, a);
  }

  return companies.map(c => {
    const lm = latestMetrics.get(c.stock_code);
    const art = latestArticle.get(c.stock_code);
    return {
      stockCode: c.stock_code,
      name: c.name,
      sector: c.sector,
      marketCap: capMap.get(c.stock_code) ?? null,
      per: lm?.per ?? null,
      divYield: lm?.div_yield ?? null,
      revCagr3y: cagr3y(revMap.get(c.stock_code) ?? new Map()),
      niCagr3y: cagr3y(niMap.get(c.stock_code) ?? new Map()),
      excerpt: art ? extractSection1(art.body) : null,
      latestArticleAt: art?.created_at ?? null,
    };
  });
}
