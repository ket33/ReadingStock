// 스크리너 데이터 로더 — screener 표(종목당 한 줄 스냅샷).
//
// 2,500종목 대응: 서버는 '기본 표시 컬럼'만 전량 보낸다 (~60컬럼 전체를 보내면
// 페이로드 665KB — 기본 컬럼만이면 ~80KB). 사용자가 컬럼 프리셋·필터·정렬로
// 다른 지표를 쓰는 순간, 브라우저가 그 컬럼만 전 종목분 받아 행에 합친다
// (fetchScreenerCols). 필터·정렬 자체는 여전히 클라이언트 — 조작감 유지.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchAll } from "./supabase-page";

export interface ScreenerRow {
  stock_code: string;
  name: string;
  market: string | null;
  sector: string | null;
  industry_group?: string | null; // 산업 그룹 primary (배치가 채움 — scale_2500.sql)
  groupPrimary?: string | null;   // 산업 그룹 분류 primary 그룹명 (표시용)
  groups?: string[];              // 소속 그룹 전체 = primary+secondary (업종 필터용)
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

/** 서버가 처음부터 보내는 기본 컬럼 — 표의 고정 열(종목명 등) + '기본' 프리셋(시가총액) */
export const SCREENER_BASE_COLS = [
  "stock_code", "name", "market", "sector", "industry_group",
  "price", "price_date", "market_cap",
] as const;

type Rel = { name: string } | { name: string }[] | null;

// ── 산업 필터용: 대분류(sector_categories) → 산업 그룹 목록 ──────────────
export interface IndustryCategory {
  name: string;      // 대분류 표시명
  groups: string[];  // 소속 그룹명 (sort_order 순) — screener 행의 groups와 같은 이름 체계
}

// 특수(16) 대분류는 지주회사(109)·리츠(110)만 필터에 노출 — 스팩·기타·미분류는 제외 (id 기준: 그룹명은 축약될 수 있음)
const SPECIAL_CAT_ID = 16;
const SPECIAL_KEEP_GROUP_IDS = new Set([109, 110]);

export async function getIndustryCategories(): Promise<IndustryCategory[]> {
  const { data } = await supabase
    .from("industry_groups")
    .select("id,name,sort_order,sector_categories(id,name,sort_order)");
  type CatRel = { id: number; name: string; sort_order: number | null };
  type Row = { id: number; name: string; sort_order: number | null; sector_categories: CatRel | CatRel[] | null };

  const cats = new Map<number, { name: string; order: number; groups: { name: string; order: number }[] }>();
  for (const r of (data ?? []) as Row[]) {
    const rel = Array.isArray(r.sector_categories) ? r.sector_categories[0] : r.sector_categories;
    if (!rel) continue;
    if (rel.id === SPECIAL_CAT_ID && !SPECIAL_KEEP_GROUP_IDS.has(r.id)) continue;
    let c = cats.get(rel.id);
    if (!c) {
      // DB 이름은 '특수(지주·리츠·스팩·기타)' — 필터엔 지주·리츠만 남기므로 표시명도 맞춘다
      c = { name: rel.id === SPECIAL_CAT_ID ? "특수(지주·리츠)" : rel.name, order: rel.sort_order ?? rel.id, groups: [] };
      cats.set(rel.id, c);
    }
    c.groups.push({ name: r.name, order: r.sort_order ?? r.id });
  }
  return [...cats.values()]
    .sort((a, b) => a.order - b.order)
    .map(c => ({ name: c.name, groups: c.groups.sort((a, b) => a.order - b.order).map(g => g.name) }));
}

export async function getScreenerData(): Promise<ScreenerRow[]> {
  // 전 종목 기본 컬럼 (1,000행 캡 페이징)
  const rows = await fetchAll<ScreenerRow>((from, to) =>
    supabase.from("screener")
      .select(SCREENER_BASE_COLS.join(","))
      .order("market_cap", { ascending: false, nullsFirst: false })
      .range(from, to)) ;

  // 산업 그룹(primary+secondary) 붙이기 — 업종 필터·표시용.
  // 종목코드 in() 청크 대신 매핑 테이블 전체를 페이징으로 받는 게 요청 수가 적다.
  const gRows = await fetchAll<{ company_id: string; is_primary: boolean; industry_groups: Rel }>(
    (from, to) => supabase.from("company_groups")
      .select("company_id,is_primary,industry_groups(name)")
      .order("company_id")
      .range(from, to));
  const gmap = new Map<string, { primary: string | null; groups: string[] }>();
  for (const g of gRows) {
    const rel = g.industry_groups;
    const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
    if (!name) continue;
    let info = gmap.get(g.company_id);
    if (!info) { info = { primary: null, groups: [] }; gmap.set(g.company_id, info); }
    if (!info.groups.includes(name)) info.groups.push(name);
    if (g.is_primary) info.primary = name;
  }
  for (const r of rows) {
    const g = gmap.get(r.stock_code);
    r.groupPrimary = g?.primary ?? r.industry_group ?? null;
    r.groups = g?.groups ?? [];
  }
  return rows;
}

/**
 * 지정 컬럼만 전 종목분 조회 — 스크리너에서 컬럼 프리셋·필터·정렬이
 * 아직 안 받은 지표를 요구할 때 브라우저가 호출해 행에 합친다.
 * 반환: stock_code → 부분 행.
 */
export async function fetchScreenerCols(
  sb: SupabaseClient,
  cols: string[],
): Promise<Map<string, Partial<ScreenerRow>>> {
  if (cols.length === 0) return new Map();
  const rows = await fetchAll<{ stock_code: string } & Partial<ScreenerRow>>((from, to) =>
    sb.from("screener")
      .select(["stock_code", ...cols].join(","))
      .order("stock_code")
      .range(from, to));
  return new Map(rows.map(r => [r.stock_code, r]));
}

/** 종목 한 개의 스크리너 지표 행 (종목 페이지 지표 줄용) */
export async function getScreenerRow(stockCode: string): Promise<ScreenerRow | null> {
  const { data } = await supabase
    .from("screener")
    .select("*")
    .eq("stock_code", stockCode)
    .maybeSingle();
  return (data ?? null) as ScreenerRow | null;
}
