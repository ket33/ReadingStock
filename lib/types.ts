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
  summary: string | null; // 상단 요약 5줄 — JSON 배열 문자열 '["…", …]'
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

// 분기 시리즈 — x축은 '24.1Q' 형태 라벨
export interface RevenueOpQPoint {
  label: string;
  revenue: number | null; // 조 원 (단일 분기)
  op: number | null;
}

export interface MarginQPoint {
  label: string;
  gross: number | null; // TTM 기준
  op: number | null;
  net: number | null;
}

export interface RoeQPoint {
  label: string;
  roe: number | null; // TTM 기준
  roa: number | null;
}

export interface CashflowQPoint {
  label: string;
  ocf: number | null; // 조 원 (단일 분기)
  fcf: number | null;
}

export interface ChartData {
  revenueOp: RevenueOpPoint[];
  margins: MarginPoint[];
  roe: RoePoint[];
  cashflow: CashflowPoint[];
  per: PerPoint[];
  // 분기 보기 (연간/분기 토글) — 비어 있으면 토글을 숨긴다
  revenueOpQ: RevenueOpQPoint[];
  marginsQ: MarginQPoint[];
  roeQ: RoeQPoint[];
  cashflowQ: CashflowQPoint[];
}

import type { ScreenerRow } from "./screener-data";

export interface StockPageData {
  company: Company;
  price: PriceRow | null;
  prevPrice: PriceRow | null;
  article: Article | null;
  latestMetrics: MetricsRow & { label: string };
  fyMetrics: MetricsRow[];
  charts: ChartData;
  statements: StatementsData;
  screener: ScreenerRow | null;   // 종목 헤더 지표 줄용 (스크리너 스냅샷 1행)
}

// ── 재무제표 탭 ────────────────────────────────────────────────

/** 표 한 행 — children이 있으면 펼침/접기 가능한 부모 행 */
export interface StmtItem {
  name: string;
  values: (number | null)[];
  emph?: boolean;                 // 합계류 강조
  children?: StmtItem[];          // 세부항목
}

export interface StmtTable {
  title: string;                  // 손익계산서 / 재무상태표 / 현금흐름표
  blocks: StmtItem[][];           // 블록 사이에 구분선 (현금흐름표: 본문 | FCF)
}

/** 한 뷰(연간 또는 분기)의 컬럼 라벨 + 3표 */
export interface StmtView {
  cols: string[];                 // ["TTM", "2025", ...] 또는 ["TTM", "26.1Q", ...]
  tables: StmtTable[];
}

export interface StatementsData {
  annual: StmtView;
  quarterly: StmtView;
}
