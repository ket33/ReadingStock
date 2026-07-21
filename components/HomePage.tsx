"use client";

// 홈 — 히어로(검색) + Browse Stocks (디자인: Stitch 홈 HTML의 겉모습 유지, 데이터는 DB)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StockCard, HomeNewsItem } from "@/lib/home-data";
import { formatKrw, formatMetric } from "@/lib/format";
import SearchBox from "./SearchBox";
import Logo from "./Logo";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

type SortKey = "random" | "marketCap" | "latest";

// 기본은 랜덤(버튼 없음) — 정렬을 고르면 그 기준으로 전환
const SORTS: { key: SortKey; label: string }[] = [
  { key: "marketCap", label: "시가총액순" },
  { key: "latest", label: "최신순" },
];

// 빠른 이동 칩 — 구현된 것만 링크, 나머지는 비활성 + 준비 중 표시 (지시서)
const CHIPS: { icon: string; label: string; href?: string }[] = [
  { icon: "filter_list", label: "Picking", href: "/screener" },
  { icon: "star", label: "Watching", href: "/watchlist" },
  { icon: "business", label: "산업별" },
];

function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center border border-outline-variant bg-surface-container-low rounded-lg px-2 py-0.5 leading-tight">
      <span className="text-[9px] font-medium text-on-surface-variant tracking-wide">
        {label}
      </span>
      <span className={`text-[9px] font-semibold tabular-nums ${color ?? "text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}

// N/A(값 없음)인 지표는 제외하고 표시할 것만 반환 (지시서)
function getMetrics(stock: StockCard): { label: string; value: string; color?: string }[] {
  const out: { label: string; value: string; color?: string }[] = [];
  if (stock.marketCap != null) out.push({ label: "시가총액", value: formatKrw(stock.marketCap) });
  if (stock.divYield != null) out.push({ label: "배당수익률", value: formatMetric(stock.divYield, "%") });
  if (stock.per != null && stock.per > 0) out.push({ label: "PER", value: formatMetric(stock.per, "배") });
  if (stock.revCagr3y != null)
    out.push({ label: "매출 성장률", value: fmtCagr(stock.revCagr3y), color: cagrColor(stock.revCagr3y) });
  if (stock.niCagr3y != null)
    out.push({ label: "순이익 성장률", value: fmtCagr(stock.niCagr3y), color: cagrColor(stock.niCagr3y) });
  return out;
}

function cagrColor(v: number | null): string | undefined {
  if (v == null) return "text-outline";
  return v >= 0 ? "text-secondary" : "text-stock-down"; // 상승=초록(디자인), 하락=파랑(한국 관례)
}

function fmtCagr(v: number | null): string {
  if (v == null) return "N/A";
  return `${v > 0 ? "+" : ""}${v}%`;
}

const PAGE_SIZE = 8;       // 종목 카드 기본 표시 개수 — '더보기'마다 이만큼 추가
const NEWS_PAGE_SIZE = 10; // 우측 최신 뉴스 표시 개수 — '더보기'마다 이만큼 추가

/** 홈 우측 '최신 뉴스' — 종목명 + 뉴스 제목만, 10개씩 더보기 */
function LatestNews({ news }: { news: HomeNewsItem[] }) {
  const [visible, setVisible] = useState(NEWS_PAGE_SIZE);
  if (news.length === 0) return null;
  return (
    <aside>
      <div className="mb-8 border-b border-outline-variant pb-4">
        <h2 className="font-serif text-base font-medium text-primary">최신 뉴스</h2>
      </div>
      <div className="space-y-2">
        {news.slice(0, visible).map(n => (
          <Link
            key={n.id}
            href={`/stock/${n.stockCode}?tab=news`}
            className="flex items-center gap-2 border border-outline-variant/50 rounded-lg px-3.5 py-2.5 bg-white
                       hover:border-primary hover:bg-surface-container-low transition-colors group"
          >
            <span className="flex-1 min-w-0">
              <span className="text-[12px] font-semibold text-on-surface-variant">{n.companyName}</span>
              <p className="text-[13px] leading-[1.5] text-on-surface line-clamp-2 group-hover:text-primary transition-colors">
                {n.title}
              </p>
            </span>
            <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-primary
                             group-hover:translate-x-0.5 transition-all shrink-0">
              arrow_forward_ios
            </span>
          </Link>
        ))}
      </div>
      {visible < news.length && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setVisible(v => v + NEWS_PAGE_SIZE)}
            className="inline-flex items-center gap-1 px-5 py-1.5 border border-outline-variant rounded-full text-xs font-medium text-on-surface-variant bg-white hover:text-primary hover:border-primary transition-colors"
          >
            더보기
            <span className="material-symbols-outlined text-[14px]">expand_more</span>
          </button>
        </div>
      )}
    </aside>
  );
}

export default function HomePage({ stocks, news }: { stocks: StockCard[]; news: HomeNewsItem[] }) {
  const [sort, setSort] = useState<SortKey>("random"); // 기본: 랜덤
  const [visible, setVisible] = useState(PAGE_SIZE);

  // 랜덤 순서는 마운트 후 생성 (서버 렌더 HTML과의 불일치 방지 —
  // 첫 페인트는 시가총액순, 직후 셔플 적용)
  const [shuffleOrder, setShuffleOrder] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    const codes = stocks.map(s => s.stockCode);
    for (let i = codes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [codes[i], codes[j]] = [codes[j], codes[i]];
    }
    setShuffleOrder(new Map(codes.map((c, i) => [c, i])));
  }, [stocks]);

  const sorted = useMemo(() => {
    const s = [...stocks];
    if (sort === "random" && shuffleOrder)
      s.sort((a, b) => (shuffleOrder.get(a.stockCode) ?? 0) - (shuffleOrder.get(b.stockCode) ?? 0));
    else if (sort === "latest")
      s.sort((a, b) => (b.latestArticleAt ?? "").localeCompare(a.latestArticleAt ?? ""));
    else // marketCap + 랜덤 셔플 생성 전(첫 페인트) 폴백
      s.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return s;
  }, [stocks, sort, shuffleOrder]);

  return (
    <>
      <SiteHeader />

      <main className="flex-grow bg-surface-container-lowest">
        {/* 히어로 */}
        {/* overflow-hidden 금지 — 검색 드롭다운이 히어로 경계 아래로 겹쳐 보여야 한다 */}
        <section className="relative pt-10 pb-10 bg-white">
          {/* 점 패턴 배경 (디자인) */}
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, #041627 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="max-w-[1280px] mx-auto px-4 md:px-10 text-center relative z-10">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-primary mb-5 leading-tight">
              Everything starts <em className="not-italic">after</em>{" "}
              <span
                className="font-bold text-[#16243f]"
                style={{ fontFamily: "var(--font-logo)", letterSpacing: "-0.005em" }}
              >
                Reading Stock
              </span>
            </h1>
            <p className="text-2xl md:text-3xl text-primary font-medium tracking-tight mb-10">
              당신의 <strong className="font-bold">투자</strong>를, 당신이 <strong className="font-bold">이해</strong>하도록 도와드려요
            </p>

            <div className="mb-8">
              <SearchBox size="large" />
            </div>

            {/* 빠른 이동 칩 — href 있으면 링크, 없으면 비활성(준비 중) */}
            <div className="flex flex-wrap justify-center gap-3">
              {CHIPS.map(c =>
                c.href ? (
                  <Link
                    key={c.label}
                    href={c.href}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-outline-variant rounded-full text-xs font-medium text-on-surface-variant hover:text-primary hover:border-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">{c.icon}</span>
                    {c.label}
                  </Link>
                ) : (
                  <button
                    key={c.label}
                    disabled
                    title="준비 중인 기능입니다"
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-outline-variant rounded-full text-xs font-medium text-on-surface-variant opacity-50 cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[15px]">{c.icon}</span>
                    {c.label}
                    <span className="text-[9px] bg-surface-container-high px-1.5 py-0.5 rounded-full">준비 중</span>
                  </button>
                ),
              )}
            </div>
          </div>
        </section>

        {/* Browse Stocks(좌) + 최신 뉴스(우) */}
        <section className="max-w-[1140px] mx-auto px-4 md:px-10 pt-8 pb-16
                            lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12 lg:items-start">
          <div>
          <div className="flex items-center justify-between mb-8 border-b border-outline-variant pb-4">
            <h2 className="font-serif text-base font-medium text-primary">종목 살펴보기</h2>
            <div className="flex gap-2">
              {SORTS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`text-xs font-medium px-2.5 py-1 rounded transition-colors ${
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

          <p className="-mt-6 mb-6 text-right text-[11px] text-outline">
            * 성장률은 최근 3년 연평균 (TTM 기준)
          </p>

          <div>
            {sorted.slice(0, visible).map(stock => {
              const metrics = getMetrics(stock);
              return (
                <Link
                  key={stock.stockCode}
                  href={`/stock/${stock.stockCode}`}
                  className="block border-b border-outline-variant py-6 transition-colors duration-200 group cursor-pointer hover:bg-surface-container-low"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                        <h3 className="font-serif text-lg md:text-xl font-bold text-primary">
                          {stock.name}
                          <span className="text-[13px] text-on-surface-variant font-sans font-normal ml-2">
                            ({stock.stockCode})
                          </span>
                          {stock.sector && (
                            <span className="text-[11px] bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-sm ml-2 align-middle font-sans">
                              {stock.sector}
                            </span>
                          )}
                        </h3>
                        {metrics.length > 0 && (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {metrics.map(m => (
                              <Pill key={m.label} label={m.label} value={m.value} color={m.color} />
                            ))}
                          </div>
                        )}
                      </div>
                      {stock.excerpt && (
                        <p className="mt-4 text-on-surface-variant max-w-[620px] leading-relaxed line-clamp-3 text-[13px]">
                          {stock.excerpt}
                        </p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-primary group-hover:translate-x-2 transition-transform shrink-0">
                      arrow_forward_ios
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 더보기: 남은 종목이 있을 때만 */}
          {visible < sorted.length && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setVisible(v => v + PAGE_SIZE)}
                className="inline-flex items-center gap-1.5 px-8 py-2.5 border border-outline-variant rounded-full text-sm font-medium text-on-surface-variant bg-white hover:text-primary hover:border-primary transition-colors"
              >
                더보기
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
                <span className="text-xs text-outline">
                  ({Math.min(PAGE_SIZE, sorted.length - visible)}개 더)
                </span>
              </button>
            </div>
          )}
          </div>

          {/* 우측: 최신 뉴스 (모바일에선 종목 아래로) */}
          <div className="mt-12 lg:mt-0">
            <LatestNews news={news} />
          </div>
        </section>
      </main>

      {/* 푸터 — 실존 링크 없음 → 브랜드 + 면책만 */}
      <SiteFooter />
    </>
  );
}
