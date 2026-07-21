// 공유된 워치리스트 — 읽기 전용 공개 페이지. /w/{token} 링크를 아는 사람만 접근.
// 서버에서 service_role로 토큰 조회(RLS 우회)하므로, 비회원도 볼 수 있고
// 소유자 정보(이메일 등)는 노출하지 않는다.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { formatKrw, formatPrice } from "@/lib/format";

export const revalidate = 300;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface SharedRow {
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

async function loadShared(token: string): Promise<{ name: string; rows: SharedRow[] } | null> {
  const sb = admin();
  const { data: list } = await sb.from("watchlists")
    .select("id,name").eq("share_token", token).maybeSingle();
  if (!list) return null;

  const { data: wl } = await sb.from("watchlist")
    .select("stock_code,created_at").eq("list_id", list.id)
    .order("created_at", { ascending: false });
  const codes = (wl ?? []).map(r => r.stock_code as string);
  if (codes.length === 0) return { name: list.name as string, rows: [] };

  const { data: sc } = await sb.from("screener")
    .select("stock_code,name,sector,price,ret_1d,market_cap,per,pbr,div_yield")
    .in("stock_code", codes);
  const byCode = new Map((sc ?? []).map(s => [s.stock_code as string, s]));
  const rows: SharedRow[] = codes.map(code => {
    const s = byCode.get(code) as SharedRow | undefined;
    return s ?? { stock_code: code, name: code, sector: null, price: null, ret_1d: null, market_cap: null, per: null, pbr: null, div_yield: null };
  });
  return { name: list.name as string, rows };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadShared(token);
  const title = data ? `${data.name} — 공유된 워치리스트` : "워치리스트";
  return {
    title,
    robots: { index: false, follow: false }, // 링크로만 접근 — 검색 노출 안 함
    alternates: { canonical: `${SITE_URL}/w/${token}` },
  };
}

function fmtMultiple(v: number | null): string {
  if (v == null) return "—";
  if (v < 0) return "적자";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}배`;
}
function chgClass(v: number | null): string {
  if (v == null) return "text-outline";
  return v > 0 ? "text-stock-up" : v < 0 ? "text-stock-down" : "text-on-surface-variant";
}

export default async function SharedWatchlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadShared(token);
  if (!data) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-lowest">
      {/* 간단 헤더 — 브랜드만 (로그인 UI 없이) */}
      <header className="border-b border-outline-variant bg-white">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 h-14 flex items-center">
          <Link href="/" className="font-sans font-bold text-lg text-primary" style={{ fontFamily: "var(--font-logo)" }}>
            {SITE_NAME}
          </Link>
        </div>
      </header>

      <main className="flex-grow max-w-[1100px] mx-auto w-full px-4 md:px-8 py-10">
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">link</span>
          <span className="text-xs text-on-surface-variant">공유된 워치리스트</span>
        </div>
        <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-6">{data.name}</h1>

        {data.rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-16 text-center border border-outline-variant rounded-xl bg-white">
            담긴 종목이 없어요.
          </p>
        ) : (
          <div className="border border-outline-variant rounded-xl bg-white overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-max">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="sticky left-0 z-10 bg-surface-container-low text-left px-4 py-2.5 text-xs font-medium text-on-surface-variant">종목</th>
                  {["현재가", "등락", "시총", "PER", "PBR", "배당수익률"].map(h => (
                    <th key={h} className="text-right px-3 py-2.5 text-xs font-medium whitespace-nowrap text-on-surface-variant">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.stock_code} className="border-b border-outline-variant last:border-b-0">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3">
                      <Link href={`/stock/${r.stock_code}`} className="font-medium text-primary hover:underline whitespace-nowrap">
                        {r.name}<span className="text-[11px] text-on-surface-variant font-normal ml-1.5">{r.stock_code}</span>
                      </Link>
                      {r.sector && <div className="text-[11px] text-outline">{r.sector}</div>}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap font-medium text-on-surface">{formatPrice(r.price)}</td>
                    <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${chgClass(r.ret_1d)}`}>
                      {r.ret_1d == null ? "—" : `${r.ret_1d > 0 ? "+" : ""}${r.ret_1d.toFixed(2)}%`}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">{formatKrw(r.market_cap)}</td>
                    <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">{fmtMultiple(r.per)}</td>
                    <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">{fmtMultiple(r.pbr)}</td>
                    <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                      {r.div_yield != null ? `${r.div_yield.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-center">
          <Link href="/" className="text-sm text-primary hover:underline">Reading Stock에서 더 많은 종목 살펴보기 →</Link>
        </p>
      </main>
    </div>
  );
}
