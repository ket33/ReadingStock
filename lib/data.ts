// 종목 페이지 데이터 로더 — 페이지 진입 시 서버에서 5개 테이블을 한 번에 조회
import { supabase } from "./supabase";
import type {
  Company, FinancialRow, MetricsRow, PriceRow, Article, CompanyNews,
  ChartData, StockPageData,
} from "./types";
import { toEok } from "./format";
import { buildStatements } from "./statements";
import { getScreenerRow } from "./screener-data";
import type { ScreenerRow } from "./screener-data";

const QORDER = ["1Q", "2Q", "3Q", "4Q", "FY"];
const SINGLE_Q = ["1Q", "2Q", "3Q", "4Q"]; // 단일(3개월) 분기 — normalize_quarters가 생성

/** '2024 1Q' → '24.1Q' 형태의 분기 x축 라벨 */
function qLabel(year: number, period: string): string {
  return `${String(year).slice(2)}.${period}`;
}

/** financials(긴 표)에서 (연도, account_std, statement) → 값 인덱스 생성 (FY만) */
function indexFY(rows: FinancialRow[]) {
  const idx = new Map<string, number>();
  for (const r of rows) {
    if (r.period !== "FY" || r.value == null || !r.account_std) continue;
    const key = `${r.fiscal_year}|${r.statement}|${r.account_std}`;
    if (!idx.has(key)) idx.set(key, r.value);
  }
  return idx;
}

function pick(idx: Map<string, number>, year: number, statements: string[], std: string): number | null {
  for (const s of statements) {
    const v = idx.get(`${year}|${s}|${std}`);
    if (v != null) return v;
  }
  return null;
}

/** capex는 account_std 매핑이 불안정해 원본 계정명으로 찾는다 (CF의 '유형자산의 취득') */
function capexByYear(rows: FinancialRow[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.period !== "FY" || r.statement !== "CF" || r.value == null) continue;
    const name = r.account_raw.replace(/\s/g, "");
    if (name.includes("유형자산") && name.includes("취득")) {
      if (!out.has(r.fiscal_year)) out.set(r.fiscal_year, r.value);
    }
  }
  return out;
}

// ── 분기(단일) 시리즈 헬퍼 ─────────────────────────────────────

/** 분기 행 인덱스: (연도, 분기, statement, account_std) → 값 */
function indexQ(rows: FinancialRow[]) {
  const idx = new Map<string, number>();
  for (const r of rows) {
    if (!SINGLE_Q.includes(r.period) || r.value == null || !r.account_std) continue;
    const key = `${r.fiscal_year}|${r.period}|${r.statement}|${r.account_std}`;
    if (!idx.has(key)) idx.set(key, r.value);
  }
  return idx;
}

function pickQ(
  idx: Map<string, number>, year: number, q: string, statements: string[], std: string,
): number | null {
  for (const s of statements) {
    const v = idx.get(`${year}|${q}|${s}|${std}`);
    if (v != null) return v;
  }
  return null;
}

function capexByQuarter(rows: FinancialRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!SINGLE_Q.includes(r.period) || r.statement !== "CF" || r.value == null) continue;
    const name = r.account_raw.replace(/\s/g, "");
    if (name.includes("유형자산") && name.includes("취득")) {
      const key = `${r.fiscal_year}|${r.period}`;
      if (!out.has(key)) out.set(key, r.value);
    }
  }
  return out;
}

function buildCharts(fin: FinancialRow[], metrics: MetricsRow[], finQ: FinancialRow[]): ChartData {
  const idx = indexFY(fin);
  const years = [...new Set(fin.filter(r => r.period === "FY").map(r => r.fiscal_year))].sort();
  const capex = capexByYear(fin);

  const revenueOp = years.map(y => ({
    year: y,
    revenue: toEok(pick(idx, y, ["IS", "CIS"], "매출액")),
    op: toEok(pick(idx, y, ["IS", "CIS"], "영업이익")),
  }));

  const fyMetrics = metrics
    .filter(m => m.period === "FY")
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  const margins = fyMetrics.map(m => ({
    year: m.fiscal_year, gross: m.gross_margin, op: m.op_margin, net: m.net_margin,
  }));
  const roe = fyMetrics.map(m => ({ year: m.fiscal_year, roe: m.roe, roa: m.roa }));

  const cashflow = years.map(y => {
    const ocf = pick(idx, y, ["CF"], "영업현금흐름");
    const cx = capex.get(y) ?? null;
    return {
      year: y,
      ocf: toEok(ocf),
      fcf: ocf != null && cx != null ? toEok(ocf - Math.abs(cx)) : null,
    };
  });

  // PER: 최근 3년, 분기(TTM)+연간 시점 순서대로
  const perAll = metrics
    .filter(m => m.per != null && m.period !== "FY")
    .sort((a, b) =>
      a.fiscal_year !== b.fiscal_year
        ? a.fiscal_year - b.fiscal_year
        : QORDER.indexOf(a.period) - QORDER.indexOf(b.period));
  const maxYear = Math.max(...perAll.map(m => m.fiscal_year), 0);
  const per = perAll
    .filter(m => m.fiscal_year >= maxYear - 3)
    .map(m => ({ label: qLabel(m.fiscal_year, m.period), per: m.per }));

  // ── 분기 시리즈 (최근 20개 분기 = 5년) ──────────────────────
  const idxQ = indexQ(finQ);
  const capexQ = capexByQuarter(finQ);

  // 존재하는 (연도, 분기) 목록 — 손익 또는 현금흐름에 값이 있는 분기만
  const quarters = [...new Set(
    finQ.filter(r => SINGLE_Q.includes(r.period)).map(r => `${r.fiscal_year}|${r.period}`),
  )]
    .map(k => {
      const [y, q] = k.split("|");
      return { year: Number(y), q };
    })
    .sort((a, b) =>
      a.year !== b.year ? a.year - b.year : QORDER.indexOf(a.q) - QORDER.indexOf(b.q))
    .slice(-20);

  const revenueOpQ = quarters.map(({ year, q }) => ({
    label: qLabel(year, q),
    revenue: toEok(pickQ(idxQ, year, q, ["IS", "CIS"], "매출액")),
    op: toEok(pickQ(idxQ, year, q, ["IS", "CIS"], "영업이익")),
  }));

  const cashflowQ = quarters.map(({ year, q }) => {
    const ocf = pickQ(idxQ, year, q, ["CF"], "영업현금흐름");
    const cx = capexQ.get(`${year}|${q}`) ?? null;
    return {
      label: qLabel(year, q),
      ocf: toEok(ocf),
      fcf: ocf != null && cx != null ? toEok(ocf - Math.abs(cx)) : null,
    };
  });

  // 마진·ROE 분기 시리즈 — metrics의 분기 행(TTM 기준) 사용
  const qMetrics = metrics
    .filter(m => m.period !== "FY")
    .sort((a, b) =>
      a.fiscal_year !== b.fiscal_year
        ? a.fiscal_year - b.fiscal_year
        : QORDER.indexOf(a.period) - QORDER.indexOf(b.period))
    .slice(-20);

  const marginsQ = qMetrics.map(m => ({
    label: qLabel(m.fiscal_year, m.period),
    gross: m.gross_margin, op: m.op_margin, net: m.net_margin,
  }));
  const roeQ = qMetrics.map(m => ({
    label: qLabel(m.fiscal_year, m.period), roe: m.roe, roa: m.roa,
  }));

  // 값이 전혀 없는 시리즈는 비워서 토글을 숨긴다
  const empty = <T,>(arr: T[], has: (t: T) => boolean) => (arr.some(has) ? arr : []);

  return {
    revenueOp, margins, roe, cashflow, per,
    revenueOpQ: empty(revenueOpQ, p => p.revenue != null || p.op != null),
    marginsQ: empty(marginsQ, p => p.gross != null || p.op != null || p.net != null),
    roeQ: empty(roeQ, p => p.roe != null || p.roa != null),
    cashflowQ: empty(cashflowQ, p => p.ocf != null || p.fcf != null),
  };
}

// 재무제표 탭 빌더는 lib/statements.ts로 분리 (계정 매핑 정의 포함)

export async function getStockPageData(stockCode: string): Promise<StockPageData | null> {
  const [companyQ, finQ, finDetailQ, finQuarterQ, finQuarterDetailQ, finQuarterDetail2Q, bsQuarterQ, rndQ, metricsQ, pricesQ, articleQ, newsQ, groupQ] = await Promise.all([
    supabase.from("companies").select("*").eq("stock_code", stockCode).maybeSingle(),
    // PostgREST가 요청당 1,000행으로 하드캡(실측: limit(5000)도 1,000에서 잘림)이라
    // '매핑된 행'과 '미매핑 세부 행'을 나눠 각각 1,000행 아래로 가져온다.
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .eq("period", "FY")
      .not("account_std", "is", null)
      .limit(1000),
    // 재무제표 탭 세부항목용: 미매핑 원본 계정 (IS/CIS/CF만 — BS 세부는 안 씀)
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .eq("period", "FY")
      .is("account_std", null)
      .in("statement", ["IS", "CIS", "CF"])
      .limit(1000),
    // 분기 차트용: 단일(3개월) 분기 행 — 흐름(IS/CIS/CF)만
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .in("period", ["1Q", "2Q", "3Q", "4Q"])
      .in("statement", ["IS", "CIS", "CF"])
      .not("account_std", "is", null)
      .limit(1000),
    // 재무제표 탭 분기 뷰·TTM용: 미매핑 흐름 세부 — 분기 20개(5년) 커버.
    // 요청당 1,000행 하드캡이라 정렬 고정 후 2페이지로 나눠 받는다 (아래 2번째 쿼리와 합침)
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .in("period", ["1Q", "2Q", "3Q", "4Q"])
      .in("statement", ["IS", "CIS", "CF"])
      .is("account_std", null)
      .gte("fiscal_year", new Date().getFullYear() - 6)
      .order("fiscal_year", { ascending: false })
      .order("account_raw")
      .range(0, 999),
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .in("period", ["1Q", "2Q", "3Q", "4Q"])
      .in("statement", ["IS", "CIS", "CF"])
      .is("account_std", null)
      .gte("fiscal_year", new Date().getFullYear() - 6)
      .order("fiscal_year", { ascending: false })
      .order("account_raw")
      .range(1000, 1999),
    // 재무제표 탭 분기 뷰용: BS 분기말 잔액 (시점 잔액 — 1Q/2Q_cum/3Q_cum/FY)
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .eq("statement", "BS")
      .in("period", ["1Q", "2Q_cum", "3Q_cum", "FY"])
      .not("account_std", "is", null)
      .gte("fiscal_year", new Date().getFullYear() - 6)
      .limit(1000),
    // R&D 금액 (보고서 파싱분 — load_rnd.py가 적재)
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .eq("statement", "RND")
      .limit(50),
    supabase.from("metrics").select("*").eq("stock_code", stockCode),
    supabase.from("prices").select("date,close,market_cap")
      .eq("stock_code", stockCode).order("date", { ascending: false }).limit(2),
    // 전체 발간 이력(타임라인용) — 최신 1건은 리포트 탭 본문으로도 쓴다
    supabase.from("articles").select("id,based_on,body,summary,created_at")
      .eq("stock_code", stockCode).order("created_at", { ascending: false }),
    // 뉴스룸 — 공시 해설 기사 (최신순)
    supabase.from("company_news")
      .select("id,stock_code,rcept_no,report_nm,category,title,body,dart_url,is_fallback,published_at")
      .eq("stock_code", stockCode).order("published_at", { ascending: false }).limit(50),
    // 산업 그룹 분류: primary 그룹명 (리포트 탭 카테고리 태그용). 미분류면 null.
    supabase.from("company_groups")
      .select("industry_groups(name)")
      .eq("company_id", stockCode).eq("is_primary", true).maybeSingle(),
  ]);

  const company = companyQ.data as Company | null;
  if (!company) return null;

  // 종목 지표 줄용 스크리너 행 (공개 데이터). 실패해도 페이지는 뜬다.
  const screenerRow: ScreenerRow | null = await getScreenerRow(stockCode).catch(() => null);

  const fin = (finQ.data ?? []) as FinancialRow[];
  const finDetail = (finDetailQ.data ?? []) as FinancialRow[];
  const rndRows = (rndQ.data ?? []) as FinancialRow[];
  const finQuarter = (finQuarterQ.data ?? []) as FinancialRow[];
  const finQuarterDetail = [
    ...(finQuarterDetailQ.data ?? []),
    ...(finQuarterDetail2Q.data ?? []),
  ] as FinancialRow[];
  const bsQuarter = (bsQuarterQ.data ?? []) as FinancialRow[];
  const metrics = (metricsQ.data ?? []) as MetricsRow[];
  const prices = (pricesQ.data ?? []) as PriceRow[];
  const articleRows = (articleQ.data ?? []) as Article[];
  const article = articleRows[0] ?? null;
  // 타임라인용 리포트 발간 이력 — 제목은 본문 첫 H1에서 추출
  const reports = articleRows.map(a => {
    const m = a.body?.match(/^#\s+(.+)$/m);
    return { id: a.id, title: m ? m[1].trim() : null, created_at: a.created_at };
  });

  // 산업 그룹 분류 primary 그룹명 (임베드 결과: { industry_groups: { name } })
  const groupRel = (groupQ.data as { industry_groups?: { name?: string } | null } | null)?.industry_groups;
  const primaryGroup = (Array.isArray(groupRel) ? groupRel[0]?.name : groupRel?.name) ?? null;

  // 최신 지표 행 (분기 TTM 우선)
  const sorted = [...metrics].sort((a, b) =>
    a.fiscal_year !== b.fiscal_year
      ? b.fiscal_year - a.fiscal_year
      : QORDER.indexOf(b.period) - QORDER.indexOf(a.period));
  const latestRaw = sorted[0];
  const latestMetrics = latestRaw
    ? { ...latestRaw, label: `${latestRaw.fiscal_year} ${latestRaw.period}${latestRaw.period === "FY" ? "" : " (TTM)"}` }
    : null;
  if (!latestMetrics) return null;

  return {
    company,
    price: prices[0] ?? null,
    prevPrice: prices[1] ?? null,
    article,
    reports,
    news: (newsQ.data ?? []) as CompanyNews[],
    latestMetrics,
    fyMetrics: metrics.filter(m => m.period === "FY"),
    screener: screenerRow,
    primaryGroup,
    charts: buildCharts(fin, metrics, finQuarter),
    statements: buildStatements(
      [...fin, ...finDetail],
      [...finQuarter, ...finQuarterDetail, ...bsQuarter],
      rndRows,
      company.sector,
    ),
  };
}
