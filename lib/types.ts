// DB 행 타입 (schema.sql 기준)

export interface Company {
  stock_code: string;
  corp_code: string;
  name: string;
  market: string | null;
  sector: string | null;
  shares: number | null;
}

export interface FinancialRow {
  fiscal_year: number;
  period: string; // 'FY','1Q','2Q','3Q','4Q','2Q_cum','3Q_cum'
  statement: string; // 'IS','BS','CF','CIS','SCE'
  account_raw: string;
  account_std: string | null;
  value: number | null;
}

export interface MetricsRow {
  fiscal_year: number;
  period: string;
  per: number | null;
  pbr: number | null;
  div_yield: number | null;
  price_fcf: number | null;
  gross_margin: number | null;
  op_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roa: number | null;
  current_ratio: number | null;
  debt_equity: number | null;
  debt_assets: number | null;
  interest_cov: number | null;
  fcf_yield: number | null;
  ocf_margin: number | null;
  ocf_ni: number | null;
  payout: number | null;
  retention: number | null;
  capex_sales: number | null;
  rnd_intensity: number | null;
  sga_sales: number | null;
  asset_turn: number | null;
  ppe_turn: number | null;
  inv_turn: number | null;
  recv_turn: number | null;
  wc_turn: number | null;
}

export interface PriceRow {
  date: string;
  close: number | null;
  market_cap: number | null;
}

export interface Article {
  id: number;
  based_on: string | null;
  body: string;
  created_at: string;
}

// ── 차트용 데이터 ──────────────────────────────────────────────

export interface RevenueOpPoint {
  year: number;
  revenue: number | null; // 조 원
  op: number | null;      // 조 원
}

export interface MarginPoint {
  year: number;
  gross: number | null;
  op: number | null;
  net: number | null;
}

export interface RoePoint {
  year: number;
  roe: number | null;
  roa: number | null; // 금융사 통합차트(ROE·ROA)용
}

export interface CashflowPoint {
  year: number;
  ocf: number | null;  // 조 원
  fcf: number | null;  // 조 원
}

export interface PerPoint {
  label: string; // '24.1Q' 형태
  per: number | null;
}

export interface ChartData {
  revenueOp: RevenueOpPoint[];
  margins: MarginPoint[];
  roe: RoePoint[];
  cashflow: CashflowPoint[];
  per: PerPoint[];
}

export interface StockPageData {
  company: Company;
  price: PriceRow | null;
  prevPrice: PriceRow | null;
  article: Article | null;
  latestMetrics: MetricsRow & { label: string };
  fyMetrics: MetricsRow[];
  charts: ChartData;
  statements: StatementsData;
}

// ── 재무제표 탭 ────────────────────────────────────────────────

export interface StatementTable {
  title: string;
  rows: { name: string; values: (number | null)[] }[];
}

export interface StatementsData {
  years: number[];
  tables: StatementTable[]; // 손익계산서 / 재무상태표 / 현금흐름표
}
