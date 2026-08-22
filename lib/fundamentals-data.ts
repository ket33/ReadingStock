// 펀더멘탈 탭 데이터 로더 (클라이언트) — 서술 + 차트용 실측을 한 번에 조립.
// 피어 = 같은 산업 그룹(company_groups) 멤버 중 screener(시총) 보유분을 시총순 본인+상위3(최대 4).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FyPoint {
  year: number;
  label: string;                 // X축 표기 — 연도 또는 'TTM'(최근 4개 분기 기준)
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
export interface ShareholderYear {
  year: number; div: number; buyback: number;   // 억원
  partial?: boolean;             // 사업보고서 전(반기까지)이면 true — 빗금으로 구분해 그린다
}

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

  type MetricRow = Omit<FyPoint, "year" | "label"> & {
    stock_code: string; fiscal_year: number; period: string;
  };
  // FY와 분기 행을 함께 받는다 — 분기 행은 이미 TTM 기준이라 연간 축 끝에 그대로 붙는다.
  // (연간 축이 사업보고서가 나온 해까지만 그려져서 반기까지 나온 올해가 통째로 빠지던 문제)
  const { data: metricsRaw } = await sb.from("metrics")
    .select(FY_COLS + ",stock_code,period").in("stock_code", peerCodes);
  const rows = (metricsRaw ?? []) as unknown as MetricRow[];

  const fy: Record<string, FyPoint[]> = {};
  for (const c of peerCodes) fy[c] = [];
  for (const m of rows) {
    if (m.period !== "FY") continue;
    (fy[m.stock_code] ??= []).push({ ...m, year: m.fiscal_year, label: String(m.fiscal_year) });
  }
  for (const c of peerCodes) fy[c].sort((a, b) => a.year - b.year);

  // 피어마다 자기 최신 분기 행을 골라 TTM 칸으로 덧붙인다 (결산월이 달라 종목마다 다르다)
  const QORDER = ["1Q", "2Q", "3Q", "4Q"];
  for (const c of peerCodes) {
    const qs = rows.filter(m => m.stock_code === c && m.period !== "FY")
      .sort((a, b) => a.fiscal_year !== b.fiscal_year
        ? a.fiscal_year - b.fiscal_year
        : QORDER.indexOf(a.period) - QORDER.indexOf(b.period));
    const last = qs[qs.length - 1];
    if (!last) continue;
    // 연간 마지막 해보다 오래된 분기면 덧붙일 이유가 없다
    const lastFy = fy[c][fy[c].length - 1]?.year ?? -Infinity;
    if (last.fiscal_year < lastFy) continue;
    fy[c].push({ ...last, year: last.fiscal_year + 0.5, label: "TTM" });
  }

  const { data: scrRaw } = await sb.from("screener")
    .select("stock_code,gross_margin,op_margin,net_margin,fcf_margin,capex_sales,roe,roce")
    .in("stock_code", peerCodes);
  const scr = (scrRaw ?? []) as unknown as (TtmPoint & { stock_code: string })[];
  const ttm: Record<string, TtmPoint> = {};
  for (const s of scr) ttm[s.stock_code] = s;

  // 4) 주주환원(본인, CF 실측): 배당금지급 + 자기주식취득, 연도별 억원
  // FY(연간)와 2Q_cum(반기 누적)을 함께 받는다. 사업보고서가 아직 없는 올해도
  // 반기까지 집행한 금액이 현금흐름표에 이미 찍혀 있어서, 그 해를 통째로 비우지 않는다.
  // 연간 막대 옆에 반기 막대를 그냥 세우면 급감한 것처럼 보이므로 partial로 표시해 빗금 처리한다.
  const { data: cf } = await sb.from("financials")
    .select("fiscal_year,period,account_raw,value").eq("stock_code", code)
    .eq("statement", "CF").in("period", ["FY", "2Q_cum"])
    .or("account_raw.ilike.%배당금%,account_raw.ilike.%자기주식%");
  // 기간별로 따로 모은 뒤 합친다 — 같은 해에 FY가 있으면 FY가 이기고, 없을 때만 반기를 쓴다.
  const acc = { FY: new Map<number, { div: number; buyback: number }>(),
                H1: new Map<number, { div: number; buyback: number }>() };
  for (const r of cf ?? []) {
    const nm = ((r.account_raw as string) || "").replace(/\s/g, "");
    const v = Math.abs((r.value as number) ?? 0);
    const y = r.fiscal_year as number;
    const bucket = (r.period as string) === "FY" ? acc.FY : acc.H1;
    const d = bucket.get(y) ?? { div: 0, buyback: 0 };
    if (nm.includes("배당금") && nm.includes("지급") && !nm.includes("수취")) d.div += v;
    else if (nm.includes("자기주식") && nm.includes("취득")) d.buyback += v;
    bucket.set(y, d);
  }
  const years = [...new Set([...acc.FY.keys(), ...acc.H1.keys()])].sort((a, b) => a - b);
  const shareholder: ShareholderYear[] = years.slice(-10).map(year => {
    const full = acc.FY.get(year);
    const v = full ?? acc.H1.get(year)!;
    return {
      year, div: v.div / 1e8, buyback: v.buyback / 1e8,
      ...(full ? {} : { partial: true }),
    };
  });

  return { narratives, basedOn, createdAt, peers, fy, ttm, shareholder };
}
