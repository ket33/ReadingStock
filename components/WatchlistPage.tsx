"use client";

// 내 관심종목 — 로그인한 회원이 담은 종목 목록 (RLS로 본인 것만 조회됨)
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";
import { formatKrw } from "@/lib/format";

interface Row {
  stock_code: string;
  created_at: string;
  name: string;
  sector: string | null;
  close: number | null;
  market_cap: number | null;
}

export default function WatchlistPage() {
  const { user, loading, openSignIn } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) { setRows(null); return; }
    let alive = true;
    (async () => {
      const sb = supabaseBrowser();
      // watchlist(본인 것만) + companies 조인 (FK: watchlist.stock_code → companies)
      const { data } = await sb.from("watchlist")
        .select("stock_code,created_at,companies(name,sector)")
        .order("created_at", { ascending: false });
      const base = (data ?? []).map(r => {
        const c = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as
          { name: string; sector: string | null } | null;
        return {
          stock_code: r.stock_code as string,
          created_at: r.created_at as string,
          name: c?.name ?? r.stock_code,
          sector: c?.sector ?? null,
          close: null as number | null,
          market_cap: null as number | null,
        };
      });
      // 종목별 최신 종가·시총 (공개 테이블)
      const withPrice = await Promise.all(base.map(async r => {
        const { data: p } = await sb.from("prices")
          .select("close,market_cap").eq("stock_code", r.stock_code)
          .order("date", { ascending: false }).limit(1);
        return { ...r, close: p?.[0]?.close ?? null, market_cap: p?.[0]?.market_cap ?? null };
      }));
      if (alive) setRows(withPrice);
    })();
    return () => { alive = false; };
  }, [user]);

  const remove = async (code: string) => {
    await supabaseBrowser().from("watchlist").delete().eq("stock_code", code);
    setRows(rs => (rs ?? []).filter(r => r.stock_code !== code));
  };

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[820px] mx-auto w-full px-4 md:px-10 py-10">
        <h1 className="font-sans text-2xl font-medium tracking-tight text-primary mb-1">내 관심종목</h1>
        <p className="text-sm text-on-surface-variant mb-8">종목 페이지에서 ☆ 를 누르면 여기에 모여요.</p>

        {loading ? null : !user ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">로그인하면 관심종목을 담고 모아볼 수 있어요.</p>
            <button onClick={openSignIn}
                    className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">
              시작하기
            </button>
          </div>
        ) : rows == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">아직 담은 종목이 없어요.</p>
            <Link href="/" className="text-sm text-primary underline underline-offset-2">
              종목 살펴보러 가기
            </Link>
          </div>
        ) : (
          <div className="border border-outline-variant rounded-xl bg-white overflow-hidden">
            {rows.map((r, i) => (
              <div key={r.stock_code}
                   className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-surface-container-high" : ""}`}>
                <Link href={`/stock/${r.stock_code}`} className="flex-1 min-w-0 group">
                  <span className="font-serif font-bold text-primary group-hover:underline underline-offset-4">
                    {r.name}
                  </span>
                  <span className="text-xs text-on-surface-variant ml-2">{r.stock_code}</span>
                  {r.sector && <span className="text-xs text-outline ml-2">{r.sector}</span>}
                </Link>
                <div className="text-right text-sm tabular-nums text-on-surface-variant shrink-0">
                  {r.close != null && <div className="font-medium text-on-surface">{Math.round(r.close).toLocaleString()}원</div>}
                  {r.market_cap != null && <div className="text-xs">시총 {formatKrw(r.market_cap)}</div>}
                </div>
                <button onClick={() => remove(r.stock_code)} title="관심종목에서 빼기"
                        className="shrink-0 text-[#f2b01e] hover:text-outline text-lg transition-colors">
                  ★
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
