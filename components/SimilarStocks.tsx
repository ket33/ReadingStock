"use client";

// 유사종목 — 같은 산업그룹(primary·secondary) 기업 중 리포트가 있는 종목의
// 리포트 제목을 보여준다 (시가총액 큰 순 최대 5개). 클릭 → 그 종목 리포트 탭.
// 사이드바 타임라인 아래 배치. 후보가 없으면 섹션 자체를 렌더하지 않는다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchGroupPeers } from "@/lib/groups";

const MAX = 5;

interface Item {
  code: string;
  name: string;
  title: string;        // 최신 리포트 제목 (본문 첫 H1)
  matchedGroup: string; // 겹친 그룹명
  viaPrimary: boolean;  // 주력(primary) 그룹 겹침 여부 — 배지 색으로 구분
}

/** 리포트 본문 첫 H1 제목 */
function extractTitle(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export default function SimilarStocks({ stockCode }: { stockCode: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) setItems(null);
      const sb = supabaseBrowser();
      const peers = await fetchGroupPeers(sb, stockCode);
      if (peers.length === 0) { if (alive) setItems([]); return; }
      const peerByCode = new Map(peers.map(p => [p.code, p]));

      // 리포트 보유 종목만 — 최신 리포트 제목 추출
      const { data: arts } = await sb.from("articles")
        .select("stock_code,body,created_at")
        .in("stock_code", peers.map(p => p.code))
        .order("created_at", { ascending: false })
        .limit(60);
      const latest = new Map<string, string>(); // code → title
      for (const a of arts ?? []) {
        const code = a.stock_code as string;
        if (latest.has(code)) continue;
        const t = extractTitle(a.body as string);
        if (t) latest.set(code, t);
      }
      if (latest.size === 0) { if (alive) setItems([]); return; }

      // 이름·시총 (스크리너 스냅샷) — 시총 큰 순 MAX개
      const codes = [...latest.keys()];
      const { data: sc } = await sb.from("screener")
        .select("stock_code,name,market_cap").in("stock_code", codes);
      const meta = new Map((sc ?? []).map(s => [s.stock_code as string, {
        name: (s.name as string) ?? s.stock_code,
        cap: (s.market_cap as number | null) ?? 0,
      }]));
      const built: Item[] = codes
        .map(code => ({
          code,
          name: meta.get(code)?.name ?? code,
          title: latest.get(code)!,
          matchedGroup: peerByCode.get(code)?.matchedGroup ?? "",
          viaPrimary: peerByCode.get(code)?.viaPrimary ?? false,
        }))
        .sort((a, b) => {
          // 주력 그룹 겹침 우선, 그 안에서 시총 큰 순
          if (a.viaPrimary !== b.viaPrimary) return a.viaPrimary ? -1 : 1;
          return (meta.get(b.code)?.cap ?? 0) - (meta.get(a.code)?.cap ?? 0);
        })
        .slice(0, MAX);
      if (alive) setItems(built);
    })();
    return () => { alive = false; };
  }, [stockCode]);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-8">
      <span className="text-[11px] text-outline font-bold uppercase tracking-widest">
        유사종목
      </span>
      <ul className="mt-3 space-y-1.5">
        {items.map(it => (
          <li key={it.code}>
            <Link
              href={`/stock/${it.code}`}
              className="block group rounded-md px-2 py-1.5 -ml-2 border border-transparent
                         hover:border-outline-variant hover:bg-surface-container-low/60 transition-colors"
            >
              <span className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-semibold text-on-surface-variant group-hover:text-[#4a8eff] transition-colors">
                  {it.name}
                </span>
                {it.matchedGroup && (
                  <span className={`text-[9px] px-1.5 py-px rounded-sm truncate max-w-[9rem] ${
                    it.viaPrimary
                      ? "bg-[#4a8eff] text-white"                     // 주력 그룹 겹침
                      : "bg-surface-container-high text-on-surface-variant" // 관련 그룹 겹침
                  }`}>
                    {it.matchedGroup}
                  </span>
                )}
              </span>
              <span className="block text-[12px] leading-snug text-on-surface line-clamp-2
                               group-hover:text-primary transition-colors">
                {it.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
