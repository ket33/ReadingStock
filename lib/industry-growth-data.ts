// 산업 매출 성장 히트맵 데이터 로더 (지시서 §3·§4)
// 1순위: industry_growth 테이블 (load_industry_growth.py가 적재)
// 폴백: 배치가 함께 떨구는 JSON 스냅샷 — 테이블이 아직 없어도 화면이 뜬다.
import { supabase } from "./supabase";
import { fetchAll } from "./supabase-page";
import fallback from "./industry-growth.json";

export interface GrowthMember { code: string; name: string; growth: number }

export interface GrowthRow {
  groupId: number;
  name: string;
  cells: Record<string, number | null>; // quarter('2026Q1') → LTM 매출 YoY %
  memberCount: number;                  // 최신 분기 same-set 기업 수
  growersCount: number | null;          // 그중 LTM 매출 증가 기업 수
  cagr3y: number | null;                // 3년 연평균 매출 성장률
  opmChangePp: number | null;           // 영업이익률 변화폭 %p (보조)
  revenueLtm: number | null;            // 최신 LTM 매출 합 (원)
  members: GrowthMember[];              // 최신 분기 멤버별 성장률 (행 펼침용)
}

export interface GrowthData {
  quarters: string[]; // 좌→우 시간순
  rows: GrowthRow[];
}

interface FlatRow {
  group_id: number;
  group_name?: string;
  industry_groups?: { name: string } | { name: string }[] | null;
  quarter: string;
  revenue_growth_ltm: number | null;
  member_count: number;
  growers_count: number | null;
  median_growth: number | null;
  revenue_cagr_3y: number | null;
  opm_change_pp: number | null;
  revenue_ltm: number | null;
  members: GrowthMember[] | null;
}

function assemble(flat: FlatRow[], quarters: string[]): GrowthData {
  const latest = quarters[quarters.length - 1];
  const byGroup = new Map<number, { name: string; rows: FlatRow[] }>();
  for (const r of flat) {
    const rel = r.industry_groups;
    const name = r.group_name ?? (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? String(r.group_id);
    let g = byGroup.get(r.group_id);
    if (!g) { g = { name, rows: [] }; byGroup.set(r.group_id, g); }
    g.rows.push(r);
  }

  const rows: GrowthRow[] = [];
  for (const [groupId, g] of byGroup) {
    const cells: Record<string, number | null> = {};
    for (const q of quarters) cells[q] = null;
    let latestRow: FlatRow | null = null;
    for (const r of g.rows) {
      if (r.quarter in cells) cells[r.quarter] = r.revenue_growth_ltm;
      if (r.quarter === latest) latestRow = r;
    }
    // 전 분기 데이터가 하나도 없는 그룹(매출 계정 자체가 없는 금융 일부 등)은 행에서 제외
    if (quarters.every(q => cells[q] == null)) continue;
    rows.push({
      groupId,
      name: g.name,
      cells,
      memberCount: latestRow?.member_count ?? 0,
      growersCount: latestRow?.growers_count ?? null,
      cagr3y: latestRow?.revenue_cagr_3y ?? null,
      opmChangePp: latestRow?.opm_change_pp ?? null,
      revenueLtm: latestRow?.revenue_ltm ?? null,
      members: latestRow?.members ?? [],
    });
  }
  return { quarters, rows };
}

export async function getIndustryGrowth(): Promise<GrowthData> {
  // ※ 반드시 페이징으로 — PostgREST는 limit을 크게 걸어도 요청당 1,000행에서 조용히 자른다.
  //   115그룹 × 10분기 = 1,150행이라 단발 조회는 최신 분기(정렬 마지막)가 통째로 잘렸었다.
  const flat = await fetchAll<FlatRow>((from, to) =>
    supabase.from("industry_growth")
      .select("group_id,quarter,revenue_growth_ltm,member_count,growers_count,median_growth,revenue_cagr_3y,opm_change_pp,revenue_ltm,members,industry_groups(name)")
      .order("quarter_end").order("group_id")
      .range(from, to));
  if (flat.length > 0) {
    const quarters = [...new Set(flat.map(r => r.quarter))].sort();
    return assemble(flat, quarters.slice(-10));
  }
  // 폴백: 배치 JSON 스냅샷 (테이블이 아직 없거나 비어 있을 때)
  const fb = fallback as { quarters: string[]; rows: FlatRow[] };
  return assemble(fb.rows, fb.quarters);
}
