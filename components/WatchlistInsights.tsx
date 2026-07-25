"use client";

// 워치리스트 인사이트 — 1행: 'MY News'(담은 종목 뉴스) | '유사 기업'(담은 종목과 같은
// 산업그룹 기업의 리포트) 를 1:1 그리드로. 업종 비율 도넛(SectorRatio)은 별도 내보내
// 수익률 카드와 같은 행에 배치한다 (WatchlistPage에서 조립).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { stripCompanyPrefix } from "@/lib/news-format";

export interface InsightItem {
  code: string;
  name: string;
  sector: string | null;
  weight: number | null; // 구성비율(%). null = 동일가중
}

interface NewsRow {
  id: number;
  stock_code: string;
  title: string;
  published_at: string;
}

interface PeerReport {
  code: string;       // 유사 기업 종목코드
  name: string;       // 유사 기업명
  viaName: string;    // 워치리스트의 어떤 종목과 유사한지
  title: string;      // 유사 기업 최신 리포트 제목 (기업명 접두어 제거)
}

const SECTOR_COLORS = [
  "#16243f", "#4a8eff", "#006e25", "#e8710a", "#8e24aa",
  "#e5654b", "#00897b", "#c2185b", "#5d4037", "#7cb342",
  "#3949ab", "#f9a825",
];

// 두 리스트 공통 세로 길이 — 기존 21rem에서 1/3 더 길게
const LIST_MAX_H = "max-h-[28rem]";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 리포트 본문 첫 H1 제목 */
function extractTitle(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export default function WatchlistInsights({ items }: { items: InsightItem[] }) {
  const [news, setNews] = useState<NewsRow[] | null>(null);
  const [peers, setPeers] = useState<PeerReport[] | null>(null);
  const nameByCode = useMemo(() => new Map(items.map(i => [i.code, i.name])), [items]);

  const codesKey = items.map(i => i.code).sort().join(",");

  // ── MY News ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const codes = codesKey ? codesKey.split(",") : [];
      if (codes.length === 0) { if (alive) setNews([]); return; }
      if (alive) setNews(null);
      const { data } = await supabaseBrowser().from("company_news")
        .select("id,stock_code,title,published_at")
        .in("stock_code", codes)
        .order("published_at", { ascending: false })
        .limit(40);
      if (alive) setNews((data ?? []) as NewsRow[]);
    })();
    return () => { alive = false; };
  }, [codesKey]);

  // ── 유사 기업 — 담은 종목들과 산업그룹이 겹치고 리포트가 있는 기업 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const codes = codesKey ? codesKey.split(",") : [];
      if (codes.length === 0) { if (alive) setPeers([]); return; }
      if (alive) setPeers(null);
      const sb = supabaseBrowser();
      const inList = new Set(codes);

      // 담은 종목들의 그룹 (primary 우선 매칭용으로 is_primary도)
      const { data: mine } = await sb.from("company_groups")
        .select("company_id,group_id,is_primary").in("company_id", codes);
      const myRows = (mine ?? []) as { company_id: string; group_id: number; is_primary: boolean }[];
      if (myRows.length === 0) { if (alive) setPeers([]); return; }
      const groupIds = [...new Set(myRows.map(r => r.group_id))];
      // 그룹 → (그 그룹에 속한 담은 종목, primary 여부) — 라벨 '○○와 유사'용
      const ownerByGroup = new Map<number, { code: string; isPrimary: boolean }>();
      for (const r of myRows) {
        const cur = ownerByGroup.get(r.group_id);
        if (!cur || (r.is_primary && !cur.isPrimary)) {
          ownerByGroup.set(r.group_id, { code: r.company_id, isPrimary: r.is_primary });
        }
      }

      // 리포트 있는 종목(소수)을 먼저 구해 후보와 교집합 — 전체 그룹 멤버를 다 안 가져와도 됨
      const { data: arts } = await sb.from("articles")
        .select("stock_code,body,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      const titleByCode = new Map<string, string>();
      for (const a of arts ?? []) {
        const code = a.stock_code as string;
        if (inList.has(code) || titleByCode.has(code)) continue;
        const t = extractTitle(a.body as string);
        if (t) titleByCode.set(code, t);
      }
      if (titleByCode.size === 0) { if (alive) setPeers([]); return; }

      // 리포트 보유 기업들의 그룹 소속 → 담은 종목 그룹과 겹치는 것만
      const { data: cand } = await sb.from("company_groups")
        .select("company_id,group_id,is_primary")
        .in("company_id", [...titleByCode.keys()])
        .in("group_id", groupIds);
      const best = new Map<string, { via: string; viaPrimary: boolean }>();
      for (const r of (cand ?? []) as { company_id: string; group_id: number; is_primary: boolean }[]) {
        const owner = ownerByGroup.get(r.group_id);
        if (!owner) continue;
        const viaPrimary = r.is_primary && owner.isPrimary; // 양쪽 다 주력 그룹일 때 우선
        const cur = best.get(r.company_id);
        if (!cur || (viaPrimary && !cur.viaPrimary)) {
          best.set(r.company_id, { via: owner.code, viaPrimary });
        }
      }
      if (best.size === 0) { if (alive) setPeers([]); return; }

      // 이름·시총 — 시총 큰 순 정렬
      const peerCodes = [...best.keys()];
      const { data: sc } = await sb.from("screener")
        .select("stock_code,name,market_cap").in("stock_code", peerCodes);
      const meta = new Map((sc ?? []).map(s => [s.stock_code as string, {
        name: (s.name as string) ?? s.stock_code, cap: (s.market_cap as number | null) ?? 0,
      }]));
      const built: PeerReport[] = peerCodes
        .map(code => {
          const name = meta.get(code)?.name ?? code;
          return {
            code,
            name,
            viaName: nameByCode.get(best.get(code)!.via) ?? best.get(code)!.via,
            title: stripCompanyPrefix(titleByCode.get(code)!, name),
          };
        })
        .sort((a, b) => (meta.get(b.code)?.cap ?? 0) - (meta.get(a.code)?.cap ?? 0));
      if (alive) setPeers(built);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey]);

  if (items.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4 mt-6">
      {/* MY News */}
      <section className="bg-white border border-outline-variant rounded-xl p-5 flex flex-col">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-widest uppercase text-primary mb-3">
          MY News
          <span className="text-[11px] font-normal tracking-normal normal-case text-outline">
            펀더멘탈 관련 뉴스만 선별해드려요
          </span>
        </h2>
        {news == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : news.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-10 text-center">담은 종목의 새 소식이 아직 없어요.</p>
        ) : (
          <ul className={`divide-y divide-outline-variant ${LIST_MAX_H} overflow-y-auto`}>
            {news.map(n => (
              <li key={n.id}>
                <Link href={`/stock/${n.stock_code}?tab=news&news=${n.id}`}
                      className="flex items-center gap-2 py-2.5 px-2 rounded-lg group hover:bg-surface-container-low transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 mb-0.5 text-[11px] text-on-surface-variant">
                      <span className="tabular-nums">{fmtDate(n.published_at)}</span>
                      <span className="text-outline">·</span>
                      <span className="font-medium text-primary">{nameByCode.get(n.stock_code) ?? n.stock_code}</span>
                    </span>
                    <span className="block text-[12px] leading-snug text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                      {n.title}
                    </span>
                  </span>
                  {/* 커서 대면 슬라이드로 나타나는 화살표 — 눌러볼 신호 */}
                  <span className="material-symbols-outlined text-[18px] text-primary shrink-0 opacity-0 -translate-x-1
                                   group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    chevron_right
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 유사 기업 — 담은 종목과 같은 산업그룹 기업의 리포트 */}
      <section className="bg-white border border-outline-variant rounded-xl p-5 flex flex-col">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-widest uppercase text-primary mb-3">
          유사 기업
          <span className="text-[11px] font-normal tracking-normal normal-case text-outline">
            담은 종목과 같은 산업그룹의 리포트
          </span>
        </h2>
        {peers == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : peers.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-10 text-center">아직 보여드릴 유사 기업 리포트가 없어요.</p>
        ) : (
          <ul className={`divide-y divide-outline-variant ${LIST_MAX_H} overflow-y-auto`}>
            {peers.map(p => (
              <li key={p.code}>
                <Link href={`/stock/${p.code}`}
                      className="block py-2.5 px-2 rounded-lg group hover:bg-surface-container-low transition-colors">
                  <span className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-on-surface-variant group-hover:text-[#4a8eff] transition-colors">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-outline">{p.viaName}와 유사</span>
                  </span>
                  <span className="block text-[12px] leading-snug text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                    {p.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── 업종 비율 도넛 — 수익률 카드와 같은 행에 배치 (WatchlistPage에서 사용) ──
export function SectorRatio({ items }: { items: InsightItem[] }) {
  const sectorData = useMemo(() => {
    if (items.length === 0) return [];
    const hasCustom = items.some(i => i.weight != null);
    const byS = new Map<string, number>();
    for (const i of items) {
      const w = hasCustom ? (i.weight ?? 0) : 1;
      if (w <= 0) continue;
      const s = i.sector ?? "기타";
      byS.set(s, (byS.get(s) ?? 0) + w);
    }
    const total = [...byS.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return [...byS.entries()]
      .map(([sector, w]) => ({ sector, pct: Math.round((w / total) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section className="bg-white border border-outline-variant rounded-xl p-5 flex flex-col">
      <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">업종 비율</h2>
      {sectorData.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-10 text-center">표시할 업종이 없어요.</p>
      ) : (
        <div className="flex items-center gap-4 flex-1">
          {/* 고정 크기 PieChart — ResponsiveContainer가 flex 안에서 0으로 접히는 문제 회피 */}
          <PieChart width={176} height={176} className="shrink-0">
            <Pie data={sectorData} dataKey="pct" nameKey="sector"
                 cx={88} cy={88} innerRadius={50} outerRadius={84}
                 paddingAngle={sectorData.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={1}>
              {sectorData.map((d, i) => (
                <Cell key={d.sector} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v}%`, String(n)] as [string, string]}
                     contentStyle={{ background: "#fff", border: "1px solid #c4c6cd", borderRadius: 4, fontSize: 13 }} />
          </PieChart>
          {/* 업종명 옆에 비율 — ml-auto로 붙여 간격을 좁힌다 */}
          <ul className="flex-1 min-w-0 space-y-2.5">
            {sectorData.map((d, i) => (
              <li key={d.sector} className="flex items-center gap-2.5 text-[15px]">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                <span className="min-w-0 truncate text-on-surface">{d.sector}</span>
                <span className="ml-auto tabular-nums text-on-surface font-semibold shrink-0">{d.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-outline pt-3">* 설정한 구성비율(미설정 시 동일가중) 기준.</p>
    </section>
  );
}
