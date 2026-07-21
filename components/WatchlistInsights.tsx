"use client";

// 워치리스트 인사이트 — 왼쪽 'MY News'(담은 종목 뉴스 일자순) + 오른쪽 '업종 비율'(구성비율 반영 도넛)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

const SECTOR_COLORS = [
  "#16243f", "#4a8eff", "#006e25", "#e8710a", "#8e24aa",
  "#e5654b", "#00897b", "#c2185b", "#5d4037", "#7cb342",
  "#3949ab", "#f9a825",
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function WatchlistInsights({ items }: { items: InsightItem[] }) {
  const [news, setNews] = useState<NewsRow[] | null>(null);
  const nameByCode = useMemo(() => new Map(items.map(i => [i.code, i.name])), [items]);

  const codesKey = items.map(i => i.code).sort().join(",");
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

  // 업종 비율 — 구성비율 반영 (지정 비중 있으면 그걸로, 없으면 동일가중)
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
    <div className="grid md:grid-cols-5 gap-4 mt-6">
      {/* MY News — 넓게(3/5) */}
      <section className="md:col-span-3 bg-white border border-outline-variant rounded-xl p-5 flex flex-col">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">MY News</h2>
        {news == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : news.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-10 text-center">담은 종목의 새 소식이 아직 없어요.</p>
        ) : (
          <ul className="divide-y divide-outline-variant max-h-[21rem] overflow-y-auto">
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

      {/* 업종 비율 — 좁게(2/5) */}
      <section className="md:col-span-2 bg-white border border-outline-variant rounded-xl p-5 flex flex-col">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">업종 비율</h2>
        {sectorData.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-10 text-center">표시할 업종이 없어요.</p>
        ) : (
          <div className="flex items-center gap-3">
            {/* 고정 크기 PieChart — ResponsiveContainer가 flex 안에서 0으로 접히는 문제 회피 */}
            <PieChart width={132} height={132} className="shrink-0">
              <Pie data={sectorData} dataKey="pct" nameKey="sector"
                   cx={66} cy={66} innerRadius={38} outerRadius={62}
                   paddingAngle={sectorData.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={1}>
                {sectorData.map((d, i) => (
                  <Cell key={d.sector} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v}%`, String(n)] as [string, string]}
                       contentStyle={{ background: "#fff", border: "1px solid #c4c6cd", borderRadius: 4, fontSize: 12 }} />
            </PieChart>
            {/* 업종명 옆에 비율 — ml-auto로 붙여 간격을 좁힌다, 글자는 sm으로 키움 */}
            <ul className="flex-1 min-w-0 space-y-2">
              {sectorData.map((d, i) => (
                <li key={d.sector} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                  <span className="min-w-0 truncate text-on-surface">{d.sector}</span>
                  <span className="ml-auto tabular-nums text-on-surface font-medium shrink-0">{d.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-outline mt-auto pt-6">* 설정한 구성비율(미설정 시 동일가중) 기준.</p>
      </section>
    </div>
  );
}
