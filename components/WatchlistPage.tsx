"use client";

// 내 관심종목 — 로그인한 회원이 담은 종목 목록 (RLS로 본인 것만 조회됨)
// 표(주가·등락·시총·PER·PBR·배당) + 워치리스트 성과 차트 + 업종 구성
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import WatchlistPerformance from "./WatchlistPerformance";
import { formatKrw, formatPrice } from "@/lib/format";

interface Row {
  stock_code: string;
  name: string;
  sector: string | null;
  price: number | null;
  ret_1d: number | null;
  market_cap: number | null;
  per: number | null;
  pbr: number | null;
  div_yield: number | null;
}

/** PER·PBR 표기 — 적자(음수)는 배수로 못 읽으니 '적자'로 */
function fmtMultiple(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  if (v < 0) return { text: "적자", cls: "text-outline" };
  return { text: `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}배`, cls: "text-on-surface-variant" };
}

function fmtChange(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  const cls = v > 0 ? "text-stock-up" : v < 0 ? "text-stock-down" : "text-on-surface-variant";
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, cls };
}

export default function WatchlistPage() {
  const { user, loading, openSignIn } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { if (alive) setRows(null); return; }
      const sb = supabaseBrowser();
      // watchlist(본인 것만) — 담은 순서 유지
      const { data: wl } = await sb.from("watchlist")
        .select("stock_code,created_at,companies(name,sector)")
        .order("created_at", { ascending: false });
      const base = (wl ?? []).map(r => {
        const c = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as
          { name: string; sector: string | null } | null;
        return {
          stock_code: r.stock_code as string,
          name: c?.name ?? r.stock_code,
          sector: c?.sector ?? null,
        };
      });
      if (base.length === 0) { if (alive) setRows([]); return; }

      // 지표는 스크리너 스냅샷(공개 테이블)에서 일괄 조회 — 주가·등락·시총·PER·PBR·배당
      const { data: sc } = await sb.from("screener")
        .select("stock_code,price,ret_1d,market_cap,per,pbr,div_yield")
        .in("stock_code", base.map(b => b.stock_code));
      const byCode = new Map((sc ?? []).map(s => [s.stock_code as string, s]));

      const merged: Row[] = base.map(b => {
        const s = byCode.get(b.stock_code);
        return {
          ...b,
          price: (s?.price as number | null) ?? null,
          ret_1d: (s?.ret_1d as number | null) ?? null,
          market_cap: (s?.market_cap as number | null) ?? null,
          per: (s?.per as number | null) ?? null,
          pbr: (s?.pbr as number | null) ?? null,
          div_yield: (s?.div_yield as number | null) ?? null,
        };
      });
      if (alive) setRows(merged);
    })();
    return () => { alive = false; };
  }, [user]);

  const remove = async (code: string) => {
    await supabaseBrowser().from("watchlist").delete().eq("stock_code", code);
    setRows(rs => (rs ?? []).filter(r => r.stock_code !== code));
  };

  // 업종 구성 — 종목 수 기준 비중
  const sectors = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const count = new Map<string, number>();
    for (const r of rows) {
      const s = r.sector ?? "기타";
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    return [...count.entries()]
      .map(([sector, n]) => ({ sector, n, pct: Math.round((n / rows.length) * 100) }))
      .sort((a, b) => b.n - a.n);
  }, [rows]);

  const codes = useMemo(() => (rows ?? []).map(r => r.stock_code), [rows]);

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[820px] mx-auto w-full px-4 md:px-10 py-10">
        <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-1">
          Watching <span className="text-lg md:text-xl font-medium text-on-surface-variant">담아둔 종목</span>
        </h1>
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
          <>
            {/* ── 종목 표 ── */}
            <div className="border border-outline-variant rounded-xl bg-white overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low">
                    <th className="sticky left-0 z-10 bg-surface-container-low text-left px-4 py-2.5
                                   text-xs font-medium text-on-surface-variant">
                      종목
                    </th>
                    {["현재가", "등락", "시총", "PER", "PBR", "배당수익률", ""].map((h, i) => (
                      <th key={i} className="text-right px-3 py-2.5 text-xs font-medium
                                             whitespace-nowrap text-on-surface-variant">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const chg = fmtChange(r.ret_1d);
                    const per = fmtMultiple(r.per);
                    const pbr = fmtMultiple(r.pbr);
                    return (
                      <tr
                        key={r.stock_code}
                        onClick={() => router.push(`/stock/${r.stock_code}`)}
                        className="border-b border-outline-variant last:border-b-0 cursor-pointer
                                   transition-colors hover:bg-surface-container-low group"
                      >
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-surface-container-low
                                       px-4 py-3 transition-colors">
                          <div className="font-medium text-primary whitespace-nowrap">
                            {r.name}
                            <span className="text-[11px] text-on-surface-variant font-normal ml-1.5">
                              {r.stock_code}
                            </span>
                          </div>
                          {r.sector && <div className="text-[11px] text-outline">{r.sector}</div>}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap font-medium text-on-surface">
                          {formatPrice(r.price)}
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${chg.cls}`}>
                          {chg.text}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                          {formatKrw(r.market_cap)}
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${per.cls}`}>
                          {per.text}
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${pbr.cls}`}>
                          {pbr.text}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                          {r.div_yield != null ? `${r.div_yield.toFixed(2)}%` : "—"}
                        </td>
                        <td className="text-right px-3 py-3">
                          <button
                            onClick={e => { e.stopPropagation(); remove(r.stock_code); }}
                            title="관심종목에서 빼기"
                            className="text-[#f2b01e] hover:text-outline text-lg transition-colors"
                          >
                            ★
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-outline mt-2">
              * 지표는 스크리너 스냅샷 기준 (TTM 재무 + 최근 종가). 등락은 전일 대비.
            </p>

            {/* ── 워치리스트 성과 ── */}
            <WatchlistPerformance codes={codes} />

            {/* ── 업종 구성 ── */}
            {sectors.length > 0 && (
              <section className="bg-white border border-outline-variant rounded-xl p-5 mt-6">
                <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-4">
                  업종 구성
                </h2>
                <div className="space-y-2.5">
                  {sectors.map(s => (
                    <div key={s.sector} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm text-on-surface-variant truncate">{s.sector}</span>
                      <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${s.pct}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-on-surface-variant">
                        {s.n}종목 · {s.pct}%
                      </span>
                    </div>
                  ))}
                </div>
                {sectors[0].pct >= 50 && rows.length >= 3 && (
                  <p className="text-[11px] text-outline mt-3">
                    * {sectors[0].sector} 비중이 절반을 넘어요. 한 업종에 쏠리면 그 업황에 따라 함께 움직일 수 있어요.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
