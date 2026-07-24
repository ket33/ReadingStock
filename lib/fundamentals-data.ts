// 펀더멘탈 탭 데이터 로더 (클라이언트) — 서술 + 차트용 실측을 한 번에 조립.
// 피어 = 같은 산업 그룹(company_groups) 멤버 중 screener(시총) 보유분을 시총순 본인+상위3(최대 4).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FyPoint {
  year: number;
  revenue: number | null;        // 원
  revenue_growth: number | null; // %
  roe: number | null;
  roce: number | null;
  debt_equity: number | null;    // 부채비율 %
  interest_cov: number | null;   // 배
  current_ratio: number | null;  // %
  fcf_yield: number | null;      // %
}
export interface TtmPoint {
  gross_margin: number | null; op_margin: number | null; net_margin: number | null;
  fcf_margin: number | null; capex_sales: number | null; roe: number | null; roce: number | null;
}
export interface Peer { code: string; name: string; isSelf: boolean; }
export interface ShareholderYear { year: number; div: number; buyback: number; } // 억원

export interface FundamentalsData {
  narratives: Record<string, string>;   // growth/profitability/health/shareholder
  basedOn: string | null;
  createdAt: string | null;             // 서술 생성일 (ISO)
  peers: Peer[];
  fy: Record<string, FyPoint[]>;         // code → FY 시계열(오래된→최신)
  ttm: Record<string, TtmPoint>;         // code → 최신 TTM 스냅샷
  shareholder: ShareholderYear[];        // 본인, 최근 10년
}

const FY_COLS = "fiscal_year,revenue,revenue_growth,roe,roce,debt_equity,interest_cov,current_ratio,fcf_yield";

export async function loadFundamentals(sb: SupabaseClient, code: string): Promise<FundamentalsData> {
  // 1) 서술
  const { data: fRows } = await sb.from("fundamentals")
    .select("section,body,based_on,created_at").eq("stock_code", code);
  const narratives: Record<string, string> = {};
  let basedOn: string | null = null;
  let createdAt: string | null = null;
  for (const r of fRows ?? []) {
    narratives[r.section as string] = r.body as string;
    basedOn = basedOn ?? (r.based_on as string | null);
    createdAt = createdAt ?? (r.created_at as string | null);
  }

  // 2) 피어 선정 (같은 그룹 → 시총순 본인+상위3)
  let peerCodes = [code];
  const { data: gg } = await sb.from("company_groups")
    .select("group_id").eq("company_id", code).eq("is_primary", true).limit(1);
  const gid = (gg ?? [])[0]?.group_id;
  if (gid != null) {
    const { data: members } = await sb.from("company_groups")
      .select("company_id").eq("group_id", gid).eq("is_primary", true);
    const codes = (members ?? []).map(m => m.company_id as string);
    const { data: capsRaw } = await sb.from("screener")
      .select("stock_code,market_cap").in("stock_code", codes);
    const caps = (capsRaw ?? []) as unknown as { stock_code: string; market_cap: number | null }[];
    const ranked = caps.filter(c => c.market_cap != null)
      .sort((a, b) => (b.market_cap as number) - (a.market_cap as number))
      .map(c => c.stock_code);
    peerCodes = [code, ...ranked.filter(c => c !== code).slice(0, 3)];
  }

  // 3) 이름 + FY 시계열 + TTM (피어 전체)
  const { data: namesRaw } = await sb.from("companies").select("stock_code,name").in("stock_code", peerCodes);
  const names = (namesRaw ?? []) as unknown as { stock_code: string; name: string }[];
  const nameMap = new Map(names.map(n => [n.stock_code, n.name]));
  const peers: Peer[] = peerCodes.map(c => ({ code: c, name: nameMap.get(c) ?? c, isSelf: c === code }));

  const { data: metricsRaw } = await sb.from("metrics")
    .select(FY_COLS + ",stock_code").in("stock_code", peerCodes).eq("period", "FY");
  // DB 컬럼은 fiscal_year → 차트에서 쓰는 year로 별칭
  const metrics = (metricsRaw ?? []) as unknown as (Omit<FyPoint, "year"> & { stock_code: string; fiscal_year: number })[];
  const fy: Record<string, FyPoint[]> = {};
  for (const c of peerCodes) fy[c] = [];
  for (const m of metrics) (fy[m.stock_code] ??= []).push({ ...m, year: m.fiscal_year });
  for (const c of peerCodes) fy[c].sort((a, b) => a.year - b.year);

  const { data: scrRaw } = await sb.from("screener")
    .select("stock_code,gross_margin,op_margin,net_margin,fcf_margin,capex_sales,roe,roce")
    .in("stock_code", peerCodes);
  const scr = (scrRaw ?? []) as unknown as (TtmPoint & { stock_code: string })[];
  const ttm: Record<string, TtmPoint> = {};
  for (const s of scr) ttm[s.stock_code] = s;

  // 4) 주주환원(본인, CF 실측): 배당금지급 + 자기주식취득, 연도별 억원
  const { data: cf } = await sb.from("financials")
    .select("fiscal_year,account_raw,value").eq("stock_code", code)
    .eq("statement", "CF").eq("period", "FY")
    .or("account_raw.ilike.%배당금%,account_raw.ilike.%자기주식%");
  const byYear = new Map<number, { div: number; buyback: number }>();
  for (const r of cf ?? []) {
    const nm = ((r.account_raw as string) || "").replace(/\s/g, "");
    const v = Math.abs((r.value as number) ?? 0);
    const y = r.fiscal_year as number;
    const d = byYear.get(y) ?? { div: 0, buyback: 0 };
    if (nm.includes("배당금") && nm.includes("지급") && !nm.includes("수취")) d.div += v;
    else if (nm.includes("자기주식") && nm.includes("취득")) d.buyback += v;
    byYear.set(y, d);
  }
  const shareholder: ShareholderYear[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0]).slice(-10)
    .map(([year, v]) => ({ year, div: v.div / 1e8, buyback: v.buyback / 1e8 }));

  return { narratives, basedOn, createdAt, peers, fy, ttm, shareholder };
}
