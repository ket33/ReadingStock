// 산업 무버스 데이터 로더 — /industry (히트맵 + Top Gainer/Loser)
//
// 전 상장사를 온보딩하지 못한 제약 아래, 각 산업 그룹의 표본을
// '시가총액 상위 5개 온보딩 기업(primary 소속, screener 보유)'으로 고정한다.
//  - 히트맵 색: 상위 5개의 최근 분기 영업이익 합 vs 전년 동분기 합 (YoY).
//    회사마다 최신 분기가 다르면 각 사 기준으로 (최신 분기, 전년 동분기) 쌍을 맞춰 합산 —
//    쌍이 없는 회사는 YoY 합산에서 제외한다 (sampled로 몇 개사인지 표시).
//  - 히트맵 크기: |영업이익 합| (적자 그룹도 규모만큼 보이게 절대값).
//  - 등락: 상위 5개의 시총가중 평균 수익률 (1D/1W/1M/YTD — screener 스냅샷 재사용).
import { supabase } from "./supabase";
import { fetchAll } from "./supabase-page";

export type YoyKind = "pct" | "turn_profit" | "turn_loss" | "loss_widen" | "loss_narrow";

export interface IndustryGroupMover {
  id: number;
  name: string;
  opNow: number | null;   // 최근 분기 영업이익 합 (원)
  opPrev: number | null;  // 전년 동분기 합
  yoyPct: number | null;  // opPrev>0일 때의 증감률(%)
  yoyKind: YoyKind | null; // null = 영업이익 데이터 없음 (히트맵 제외, 등락 목록엔 포함 가능)
  sampled: number;        // YoY 합산에 들어간 기업 수 (최대 5)
  basis: string | null;   // 합산 기준 분기 라벨 중 최빈값 — "2026 1Q" 등
  top5: { code: string; name: string }[];
  mcap: number;           // 그룹 시가총액 합 (온보딩 primary 전체, 원)
  memberCount: number;    // 온보딩 primary 기업 수
  ret: { d1: number | null; w1: number | null; m1: number | null; ytd: number | null };
}

export interface IndustryCategoryMover {
  id: number;
  name: string;
  groups: IndustryGroupMover[];
}

// 특수(16) 대분류는 지주회사(109)·리츠(110)만 — 산업 필터와 동일 규칙, 표시명 '기타'
const SPECIAL_CAT_ID = 16;
const SPECIAL_KEEP_GROUP_IDS = new Set([109, 110]);

const QORDER = ["1Q", "2Q", "3Q", "4Q"] as const;
// 여러 재무제표에 같은 계정이 있을 때 선호 순위 (load_metrics_ttm.py와 동일)
const STMT_PRIORITY: Record<string, number> = { IS: 0, CF: 1, BS: 2, CIS: 3 };

interface ScreenerLite {
  stock_code: string;
  name: string;
  market_cap: number | null;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_1m: number | null;
  ret_ytd: number | null;
}

export async function getIndustryMovers(): Promise<IndustryCategoryMover[]> {
  const thisYear = new Date().getFullYear();

  const [scRows, cgRows, groupsQ, catsQ] = await Promise.all([
    fetchAll<ScreenerLite>((from, to) =>
      supabase.from("screener")
        .select("stock_code,name,market_cap,ret_1d,ret_5d,ret_1m,ret_ytd")
        .order("stock_code").range(from, to)),
    fetchAll<{ company_id: string; group_id: number }>((from, to) =>
      supabase.from("company_groups")
        .select("company_id,group_id")
        .eq("is_primary", true)
        .order("company_id").range(from, to)),
    supabase.from("industry_groups").select("id,name,sort_order,category_id"),
    supabase.from("sector_categories").select("id,name,sort_order"),
  ]);

  const byCode = new Map(scRows.map(r => [r.stock_code, r]));

  // 그룹별 온보딩 멤버 → 시총 상위 5
  const membersByGroup = new Map<number, ScreenerLite[]>();
  for (const r of cgRows) {
    const sc = byCode.get(r.company_id);
    if (!sc) continue; // screener에 없으면 온보딩 전 — 표본 제외
    let arr = membersByGroup.get(r.group_id);
    if (!arr) { arr = []; membersByGroup.set(r.group_id, arr); }
    arr.push(sc);
  }
  for (const arr of membersByGroup.values())
    arr.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));

  const groups = (groupsQ.data ?? []) as { id: number; name: string; sort_order: number | null; category_id: number | null }[];
  const activeGroups = groups.filter(g =>
    g.category_id != null &&
    !(g.category_id === SPECIAL_CAT_ID && !SPECIAL_KEEP_GROUP_IDS.has(g.id)) &&
    (membersByGroup.get(g.id)?.length ?? 0) > 0);

  // ── 상위 5 전체의 분기 영업이익 로드 (최근 3개 연도면 최신 분기 + 전년 동분기가 다 잡힌다) ──
  const top5ByGroup = new Map<number, ScreenerLite[]>();
  const allCodes = new Set<string>();
  for (const g of activeGroups) {
    const top5 = (membersByGroup.get(g.id) ?? []).slice(0, 5);
    top5ByGroup.set(g.id, top5);
    for (const m of top5) allCodes.add(m.stock_code);
  }

  // (code, year, quarter) → 영업이익. 같은 분기가 IS/CIS에 다 있으면 우선순위 낮은 쪽은 무시.
  const op = new Map<string, number>();
  const opPr = new Map<string, number>();
  const codes = [...allCodes];
  const CHUNK = 150;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const rows = await fetchAll<{ stock_code: string; fiscal_year: number; period: string; statement: string; value: number | null }>(
      (from, to) => supabase.from("financials")
        .select("stock_code,fiscal_year,period,statement,value")
        .eq("account_std", "영업이익")
        .in("period", [...QORDER])
        .gte("fiscal_year", thisYear - 2)
        .in("stock_code", slice)
        .order("id").range(from, to));
    for (const r of rows) {
      if (r.value == null) continue;
      const key = `${r.stock_code}|${r.fiscal_year}|${r.period}`;
      const pr = STMT_PRIORITY[r.statement] ?? 9;
      const cur = opPr.get(key);
      if (cur == null || pr < cur) { opPr.set(key, pr); op.set(key, r.value); }
    }
  }

  // 회사별: 최신 분기부터 내려가며 (그 분기, 전년 동분기) 쌍이 처음 성립하는 지점을 채택
  const pairByCode = new Map<string, { now: number; prev: number; label: string }>();
  const quartersOf = (code: string): { y: number; qi: number }[] => {
    const out: { y: number; qi: number }[] = [];
    for (let y = thisYear; y >= thisYear - 1; y--)
      for (let qi = 3; qi >= 0; qi--)
        if (op.has(`${code}|${y}|${QORDER[qi]}`)) out.push({ y, qi });
    return out; // 최신 → 과거 순
  };
  for (const code of codes) {
    for (const { y, qi } of quartersOf(code)) {
      const now = op.get(`${code}|${y}|${QORDER[qi]}`);
      const prev = op.get(`${code}|${y - 1}|${QORDER[qi]}`);
      if (now != null && prev != null) {
        pairByCode.set(code, { now, prev, label: `${y} ${QORDER[qi]}` });
        break;
      }
    }
  }

  // ── 그룹 집계 ──
  const wavg = (arr: ScreenerLite[], pick: (r: ScreenerLite) => number | null): number | null => {
    let num = 0, den = 0;
    for (const r of arr) {
      const v = pick(r);
      const w = r.market_cap ?? 0;
      if (v == null || w <= 0) continue;
      num += v * w; den += w;
    }
    return den > 0 ? Math.round((num / den) * 100) / 100 : null;
  };

  const moverByGroup = new Map<number, IndustryGroupMover>();
  for (const g of activeGroups) {
    const top5 = top5ByGroup.get(g.id) ?? [];
    let opNow = 0, opPrev = 0, sampled = 0;
    const labels = new Map<string, number>();
    for (const m of top5) {
      const p = pairByCode.get(m.stock_code);
      if (!p) continue;
      opNow += p.now; opPrev += p.prev; sampled++;
      labels.set(p.label, (labels.get(p.label) ?? 0) + 1);
    }
    let yoyPct: number | null = null;
    let yoyKind: YoyKind | null = null;
    if (sampled > 0) {
      if (opPrev > 0) {
        yoyPct = Math.round(((opNow - opPrev) / opPrev) * 1000) / 10;
        yoyKind = opNow <= 0 ? "turn_loss" : "pct";
      } else if (opNow > 0) {
        yoyKind = "turn_profit";
      } else {
        yoyKind = opNow >= opPrev ? "loss_narrow" : "loss_widen";
      }
    }
    const basis = [...labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const allMembers = membersByGroup.get(g.id) ?? [];
    moverByGroup.set(g.id, {
      id: g.id,
      name: g.name,
      opNow: sampled > 0 ? opNow : null,
      opPrev: sampled > 0 ? opPrev : null,
      yoyPct,
      yoyKind,
      sampled,
      basis,
      top5: top5.map(m => ({ code: m.stock_code, name: m.name })),
      mcap: allMembers.reduce((s, m) => s + (m.market_cap ?? 0), 0),
      memberCount: allMembers.length,
      ret: {
        d1: wavg(top5, r => r.ret_1d),
        w1: wavg(top5, r => r.ret_5d),
        m1: wavg(top5, r => r.ret_1m),
        ytd: wavg(top5, r => r.ret_ytd),
      },
    });
  }

  // ── 대분류로 묶기 ──
  const cats = ((catsQ.data ?? []) as { id: number; name: string; sort_order: number | null }[])
    .sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id));
  const out: IndustryCategoryMover[] = [];
  for (const c of cats) {
    const gs = activeGroups
      .filter(g => g.category_id === c.id)
      .map(g => moverByGroup.get(g.id)!)
      .sort((a, b) => Math.abs(b.opNow ?? 0) - Math.abs(a.opNow ?? 0));
    if (gs.length === 0) continue;
    out.push({ id: c.id, name: c.id === SPECIAL_CAT_ID ? "기타" : c.name, groups: gs });
  }
  return out;
}
