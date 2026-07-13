// 스크리너 데이터 로더 — screener 표(종목당 한 줄 스냅샷)를 통째로 가져온다.
// 필터·정렬은 전부 클라이언트에서 수행 (종목 수가 수백 이하인 동안은 이게 가장 단순·빠름)
import { supabase } from "./supabase";

export interface ScreenerRow {
  stock_code: string;
  name: string;
  market: string | null;
  sector: string | null;
  price: number | null;
  price_date: string | null;
  market_cap: number | null;
  based_on: string | null;
  // 밸류에이션
  per: number | null;
  pbr: number | null;
  price_sales: number | null;
  price_ocf: number | null;
  price_fcf: number | null;
  div_yield: number | null;
  // 수익성
  eps: number | null;
  gross_margin: number | null;
  op_margin: number | null;
  net_margin: number | null;
  fcf_margin: number | null;
  ocf_margin: number | null;
  roe: number | null;
  roa: number | null;
  roce: number | null;
  // 원본값 (원)
  revenue: number | null;
  net_income: number | null;
  op_income: number | null;
  ocf: number | null;
  fcf: number | null;
  dividends_paid: number | null;
  // 성장률 (%)
  revenue_growth: number | null;
  earnings_growth: number | null;
  revenue_growth_3y: number | null;
  revenue_growth_5y: number | null;
  earnings_growth_3y: number | null;
  earnings_growth_5y: number | null;
  // 배당·현금흐름
  payout: number | null;
  fcf_yield: number | null;
  ocf_ni: number | null;
  // 재무건전성
  current_ratio: number | null;
  debt_equity: number | null;
  debt_assets: number | null;
  interest_cov: number | null;
  // 자본배분
  retention: number | null;
  capex_sales: number | null;
  rnd_intensity: number | null;
  sga_sales: number | null;
  // 효율성
  asset_turn: number | null;
  ppe_turn: number | null;
  inv_turn: number | null;
  recv_turn: number | null;
  wc_turn: number | null;
  // 수익률 (%)
  ret_1d: number | null;
  ret_5d: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_6m: number | null;
  ret_ytd: number | null;
  ret_1y: number | null;
  ret_5y: number | null;
  ret_10y: number | null;
  updated_at: string | null;
}

export async function getScreenerData(): Promise<ScreenerRow[]> {
  const { data } = await supabase
    .from("screener")
    .select("*")
    .order("market_cap", { ascending: false })
    .limit(1000); // PostgREST 요청당 1,000행 하드캡 — 종목이 늘면 페이징 필요
  return (data ?? []) as ScreenerRow[];
}
