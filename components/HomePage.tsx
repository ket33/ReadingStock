"use client";

// 홈 — 히어로(검색) + Browse Stocks (디자인: Stitch 홈 HTML의 겉모습 유지, 데이터는 DB)
import { useMemo, useState } from "react";
import Link from "next/link";
import type { StockCard } from "@/lib/home-data";
import { formatKrw, formatMetric } from "@/lib/format";
import SearchBox from "./SearchBox";
import Logo from "./Logo";

type SortKey = "marketCap" | "latest" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "marketCap", label: "시가총액순" },
  { key: "latest", label: "최신순" },
  { key: "name", label: "가나다순" },
];

// 미구현 빠른 이동 칩 — 가짜 링크 금지, 비활성 + 준비 중 표시 (지시서)
const CHIPS = [
  { icon: "filter_list", label: "스크리너" },
  { icon: "star", label: "워치리스트" },
  { icon: "business", label: "산업별" },
];

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col first:pl-0 pl-6 first:border-l-0 border-l border-outline-variant">
      <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${color ?? "text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}

function cagrColor(v: number | null): string | undefined {
  if (v == null) return "text-outline";
  return v >= 0 ? "text-secondary" : "text-stock-down"; // 상승=초록(디자인), 하락=파랑(한국 관례)
}

function fmtCagr(v: number | null): string {
  if (v == null) return "N/A";
  return `${v > 0 ? "+" : ""}${v}%`;
}

export default function HomePage({ stocks }: { stocks: StockCard[] }) {
  const [sort, setSort] = useState<SortKey>("marketCap"); // 기본: 시가총액순

  const sorted = useMemo(() => {
    const s = [...stocks];
    if (sort === "marketCap") s.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    else if (sort === "latest")
      s.sort((a, b) => (b.latestArticleAt ?? "").localeCompare(a.latestArticleAt ?? ""));
    else s.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return s;
  }, [stocks, sort]);

  return (
    <>
      {/* 상단 네비 (Sign In/Subscribe는 미구현이라 숨김 — 지시서) */}
      <nav className="bg-surface border-b border-outline-variant sticky top-0 z-50 h-20 flex items-center">
        <div className="flex justify-between items-center w-full px-4 md:px-10 max-w-[1280px] mx-auto">
          <Logo mark={32} text={21} />
          <div className="hidden lg:block">
            <SearchBox size="small" />
          </div>
        </div>
      </nav>

      <main className="flex-grow">
        {/* 히어로 */}
        <section className="relative py-20 bg-white border-b border-outline-variant overflow-hidden">
          {/* 점 패턴 배경 (디자인) */}
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, #041627 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="max-w-[1280px] mx-auto px-4 md:px-10 text-center relative z-10">
            <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight text-primary mb-4 leading-tight">
              Everything starts <em className="not-italic">after</em><br />
              <span
                className="font-bold text-[#16243f]"
                style={{ fontFamily: "var(--font-logo)", letterSpacing: "-0.005em" }}
              >
                Reading Stocks
              </span>
            </h1>
            <p className="text-lg text-on-surface-variant mb-10">
              당신의 투자를, 당신이 이해하도록 도와드려요
            </p>

            <div className="mb-8">
              <SearchBox size="large" />
            </div>

            {/* 빠른 이동 칩 — 미구현이라 비활성 */}
            <div className="flex flex-wrap justify-center gap-3">
              {CHIPS.map(c => (
                <button
                  key={c.label}
                  disabled
                  title="준비 중인 기능입니다"
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-outline-variant rounded-full text-sm font-medium text-on-surface-variant opacity-50 cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">{c.icon}</span>
                  {c.label}
                  <span className="text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded-full">준비 중</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Browse Stocks */}
        <section className="max-w-[1000px] mx-auto px-4 md:px-10 py-16">
          <div className="flex items-center justify-between mb-8 border-b border-outline-variant pb-4">
            <h2 className="font-serif text-2xl font-medium text-primary">종목 둘러보기</h2>
            <div className="flex gap-2">
              {SORTS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
                    sort === s.key
                      ? "bg-primary-fixed text-on-primary-fixed"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {sorted.map(stock => (
              <Link
                key={stock.stockCode}
                href={`/stock/${stock.stockCode}`}
                className="block bg-white border border-outline-variant p-6 md:p-8 transition-all duration-300 group cursor-pointer hover:shadow-[0px_4px_12px_rgba(26,43,60,0.05)]"
              >
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-serif text-xl md:text-2xl font-medium text-primary">
                      {stock.name}
                      <span className="text-sm text-on-surface-variant font-sans font-normal ml-2">
                        ({stock.stockCode})
                      </span>
                      {stock.sector && (
                        <span className="text-xs bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-sm ml-2 align-middle font-sans">
                          {stock.sector}
                        </span>
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-y-2 mt-4">
                      <Stat label="시가총액" value={stock.marketCap != null ? formatKrw(stock.marketCap) : "N/A"} />
                      <Stat label="PER" value={stock.per != null ? formatMetric(stock.per, "배") : "N/A"} />
                      <Stat label="배당수익률" value={stock.divYield != null ? formatMetric(stock.divYield, "%") : "N/A"} />
                      <Stat label="매출 성장률(연평균)" value={fmtCagr(stock.revCagr3y)} color={cagrColor(stock.revCagr3y)} />
                      <Stat label="순이익 성장률(연평균)" value={fmtCagr(stock.niCagr3y)} color={cagrColor(stock.niCagr3y)} />
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-primary group-hover:translate-x-2 transition-transform shrink-0">
                    arrow_forward_ios
                  </span>
                </div>
                {stock.excerpt && (
                  <p className="text-on-surface-variant max-w-[720px] leading-relaxed line-clamp-3 text-[13.5px]">
                    {stock.excerpt}
                  </p>
                )}
              </Link>
            ))}
          </div>
          {/* 페이지네이션: 종목 수가 한 페이지(20개) 이하라 표시하지 않음 (지시서) */}
        </section>
      </main>

      {/* 푸터 — 실존 링크 없음 → 브랜드 + 면책만 */}
      <footer className="bg-surface-container-low border-t border-outline-variant">
        <div className="max-w-[1280px] mx-auto py-12 px-4 md:px-10">
          <span className="font-serif text-lg font-bold text-primary mb-3 block">Reading Stock</span>
          <p className="text-sm text-on-surface-variant max-w-xl leading-relaxed">
            본 정보는 투자 판단의 참고 자료이며 매수·매도 권유가 아닙니다.
            모든 콘텐츠는 공개 데이터를 바탕으로 자동 생성되며, 투자 결정과 책임은 본인에게 있습니다.
          </p>
        </div>
      </footer>
    </>
  );
}
