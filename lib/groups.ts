// 산업 그룹 조회 공용 헬퍼 — company_groups(회사↔그룹) + industry_groups(그룹명)를 조인해
// 종목별 primary 그룹명과 소속 그룹 전체(primary+secondary)를 돌려준다.
// 홈·스크리너(서버)와 워치리스트(브라우저)가 각자 클라이언트를 넘겨 함께 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GroupInfo {
  primary: string | null;   // primary 그룹명 (표시용)
  groups: string[];         // 소속 그룹 전체 = primary + secondary (필터용)
}

type Rel = { name: string } | { name: string }[] | null;
interface GroupRow { company_id: string; is_primary: boolean; industry_groups: Rel }

/** 주어진 종목코드들의 그룹 정보 맵. codes가 비면 빈 맵.
 *  PostgREST 요청당 1,000행 캡이 있어 코드를 청크로 나눠 조회한다. */
export async function fetchGroups(
  sb: SupabaseClient,
  codes: string[],
): Promise<Map<string, GroupInfo>> {
  const out = new Map<string, GroupInfo>();
  const uniq = [...new Set(codes)];
  const CHUNK = 300;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const { data } = await sb
      .from("company_groups")
      .select("company_id,is_primary,industry_groups(name)")
      .in("company_id", slice);
    for (const r of (data ?? []) as GroupRow[]) {
      const rel = r.industry_groups;
      const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      if (!name) continue;
      let info = out.get(r.company_id);
      if (!info) { info = { primary: null, groups: [] }; out.set(r.company_id, info); }
      if (!info.groups.includes(name)) info.groups.push(name);
      if (r.is_primary) info.primary = name;
    }
  }
  return out;
}
