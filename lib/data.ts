// 종목 페이지 데이터 로더 — 페이지 진입 시 서버에서 5개 테이블을 한 번에 조회
import { supabase } from "./supabase";
import type {
  Company, FinancialRow, MetricsRow, PriceRow, Article,
  ChartData, StatementsData, StockPageData,
} from "./types";
import { toJo } from "./format";

const QORDER = ["1Q", "2Q", "3Q", "4Q", "FY"];

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

function buildCharts(fin: FinancialRow[], metrics: MetricsRow[]): ChartData {
  const idx = indexFY(fin);
  const years = [...new Set(fin.filter(r => r.period === "FY").map(r => r.fiscal_year))].sort();
  const capex = capexByYear(fin);

  const revenueOp = years.map(y => ({
    year: y,
    revenue: toJo(pick(idx, y, ["IS", "CIS"], "매출액")),
    op: toJo(pick(idx, y, ["IS", "CIS"], "영업이익")),
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
      ocf: toJo(ocf),
      fcf: ocf != null && cx != null ? toJo(ocf - Math.abs(cx)) : null,
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
    .map(m => ({ label: `${String(m.fiscal_year).slice(2)}.${m.period}`, per: m.per }));

  return { revenueOp, margins, roe, cashflow, per };
}

/** 재무제표 탭용: 주요 계정만, 연도별 컬럼 (최근 10년) */
function buildStatements(fin: FinancialRow[]): StatementsData {
  const idx = indexFY(fin);
  const capex = capexByYear(fin);
  const years = [...new Set(fin.filter(r => r.period === "FY").map(r => r.fiscal_year))]
    .sort()
    .slice(-10);

  const row = (name: string, statements: string[], std: string) => ({
    name,
    values: years.map(y => pick(idx, y, statements, std)),
  });

  const tables = [
    {
      title: "손익계산서",
      rows: [
        row("매출액", ["IS", "CIS"], "매출액"),
        row("매출총이익", ["IS", "CIS"], "매출총이익"),
        row("영업이익", ["IS", "CIS"], "영업이익"),
        row("당기순이익", ["IS", "CIS"], "당기순이익"),
      ],
    },
    {
      title: "재무상태표",
      rows: [
        row("자산총계", ["BS"], "자산총계"),
        row("유동자산", ["BS"], "유동자산"),
        row("부채총계", ["BS"], "부채총계"),
        row("유동부채", ["BS"], "유동부채"),
        row("자본총계", ["BS"], "자본총계"),
      ],
    },
    {
      title: "현금흐름표",
      rows: [
        row("영업활동현금흐름", ["CF"], "영업현금흐름"),
        {
          name: "유형자산 취득(Capex)",
          values: years.map(y => {
            const v = capex.get(y);
            return v == null ? null : -Math.abs(v); // 지출이므로 음수 표기
          }),
        },
        {
          name: "잉여현금흐름(FCF)",
          values: years.map(y => {
            const ocf = pick(idx, y, ["CF"], "영업현금흐름");
            const cx = capex.get(y);
            return ocf != null && cx != null ? ocf - Math.abs(cx) : null;
          }),
        },
      ],
    },
  ];

  // 값이 하나도 없는 행 제거 (금융업 등)
  for (const t of tables) t.rows = t.rows.filter(r => r.values.some(v => v != null));

  return { years, tables };
}

export async function getStockPageData(stockCode: string): Promise<StockPageData | null> {
  const [companyQ, finQ, metricsQ, pricesQ, articleQ] = await Promise.all([
    supabase.from("companies").select("*").eq("stock_code", stockCode).maybeSingle(),
    // 웹에는 연간(FY)·표준계정 매핑된 행만 필요 — 필터 없이 다 가져오면
    // PostgREST 기본 상한(1,000행)에 걸려 시계열이 잘린다(실측)
    supabase.from("financials")
      .select("fiscal_year,period,statement,account_raw,account_std,value")
      .eq("stock_code", stockCode)
      .eq("period", "FY")
      .not("account_std", "is", null)
      .limit(5000),
    supabase.from("metrics").select("*").eq("stock_code", stockCode),
    supabase.from("prices").select("date,close,market_cap")
      .eq("stock_code", stockCode).order("date", { ascending: false }).limit(2),
    supabase.from("articles").select("id,based_on,body,created_at")
      .eq("stock_code", stockCode).order("created_at", { ascending: false }).limit(1),
  ]);

  const company = companyQ.data as Company | null;
  if (!company) return null;

  const fin = (finQ.data ?? []) as FinancialRow[];
  const metrics = (metricsQ.data ?? []) as MetricsRow[];
  const prices = (pricesQ.data ?? []) as PriceRow[];
  const article = ((articleQ.data ?? [])[0] ?? null) as Article | null;

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
    latestMetrics,
    fyMetrics: metrics.filter(m => m.period === "FY"),
    charts: buildCharts(fin, metrics),
    statements: buildStatements(fin),
  };
}
