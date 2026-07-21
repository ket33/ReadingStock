"use client";

// 종목 페이지 본체 — 상단 종목 헤더(공통) + 좌측 사이드바 3탭 + 콘텐츠
import { useState, useEffect } from "react";
import type { StockPageData } from "@/lib/types";
import ArticleTab from "./ArticleTab";
import SummaryTab from "./SummaryTab";
import FinancialsTab from "./FinancialsTab";
import NewsTab from "./NewsTab";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import StockMetrics from "./StockMetrics";
import WatchButton from "./auth/WatchButton";

type TabKey = "article" | "news" | "summary" | "financials";

const TABS: { key: TabKey; label: string }[] = [
  { key: "article", label: "리포트" },
  { key: "summary", label: "요약" },
  { key: "news", label: "뉴스룸" },
  { key: "financials", label: "재무제표" },
];

const TAB_KEYS = TABS.map(t => t.key);

export default function StockPage({ data }: { data: StockPageData }) {
  const [tab, setTab] = useState<TabKey>("article");
  const { company, price, prevPrice } = data;

  // 이메일·MY News 링크(?tab=news)로 진입하면 뉴스룸 탭을 연다
  // (특정 기사는 NewsTab이 ?news={id}를 읽어 펼친다)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (t && TAB_KEYS.includes(t)) setTab(t);
  }, []);

  // 전일 종가 대비 변화 (한국 관례: 상승=빨강, 하락=파랑)
  const change = (() => {
    if (price?.close == null || prevPrice?.close == null) return null;
    const diff = price.close - prevPrice.close;
    const pct = (diff / prevPrice.close) * 100;
    return {
      diff,
      pct,
      color: diff > 0 ? "text-stock-up" : diff < 0 ? "text-stock-down" : "text-on-surface-variant",
      arrow: diff > 0 ? "▲" : diff < 0 ? "▼" : "—",
    };
  })();

  // 홈→종목 등으로 넘어올 때, Next가 sticky 헤더를 '이미 최상단에 보임'으로 인식해
  // 스크롤을 리셋하지 않는 경우가 있다. 종목이 바뀔 때 명시적으로 최상단으로 이동시킨다.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [company.stock_code]);

  return (
    <>
      <SiteHeader />

      {/* 종목 헤더 (모든 탭 공통) */}
      <div className="bg-white border-b border-outline-variant">
        <div className="max-w-[1280px] mx-auto px-4 md:px-10 py-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            {/* 모바일에서 주가가 화면 밖으로 밀리지 않게 줄바꿈 허용 */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-3xl font-semibold text-primary">{company.name}</h1>
              <span className="text-sm text-on-surface-variant">{company.stock_code}</span>
              {company.market && (
                <span className="text-xs bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-sm">
                  {company.market}
                </span>
              )}
              {company.sector && (
                <span className="text-xs bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-sm">
                  {company.sector}
                </span>
              )}
              {price?.close != null && (
                <span className="flex items-baseline gap-2 ml-1">
                  <span className="text-xl font-semibold text-on-surface tabular-nums">
                    {Math.round(price.close).toLocaleString()}원
                  </span>
                  {change && (
                    <span className={`text-sm font-medium tabular-nums ${change.color}`}>
                      {change.arrow} {Math.abs(Math.round(change.diff)).toLocaleString()}
                      {" "}({change.pct > 0 ? "+" : ""}{change.pct.toFixed(2)}%)
                    </span>
                  )}
                  <span className="text-xs text-outline">종가</span>
                </span>
              )}
            </div>
          </div>
          <span className="ml-auto">
            <WatchButton stockCode={company.stock_code} />
          </span>

          {/* 지표 줄 (종목명·주가 아래 한 줄) — 회원은 편집 가능 */}
          <div className="w-full mt-1">
            <StockMetrics screener={data.screener} />
            {price?.date && (
              <span className="block mt-1.5 text-xs text-outline">{price.date} 기준</span>
            )}
          </div>
        </div>
      </div>

      <main className="flex w-full max-w-[1280px] mx-auto relative flex-grow">
        {/* 좌측 사이드바 (디자인의 SideNavBar) */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-64px)] border-r border-outline-variant bg-surface overflow-y-auto">
          <nav className="p-6 space-y-2">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full px-4 py-3 rounded-sm text-sm font-medium transition-colors text-left ${
                  tab === t.key
                    ? "bg-surface-container-high text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {t.label}
              </button>
            ))}
            <div className="pt-10 pb-2">
              <span className="px-4 text-[11px] text-outline font-bold uppercase tracking-widest">
                업종
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2 text-sm text-on-surface-variant">
              <span>{company.sector ?? "—"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            </div>
          </nav>
        </aside>

        {/* 모바일 탭 바 */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-outline-variant flex">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-medium ${
                tab === t.key ? "text-primary border-t-2 border-primary" : "text-on-surface-variant"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 캔버스 */}
        <article className="flex-grow bg-white min-h-screen px-4 md:px-10 py-12 pb-24 lg:pb-12 overflow-hidden">
          {tab === "article" && (
            <ArticleTab article={data.article} charts={data.charts} sector={company.sector} stockCode={company.stock_code} />
          )}
          {tab === "news" && (
            <NewsTab news={data.news} companyName={company.name} stockCode={company.stock_code} />
          )}
          {tab === "summary" && (
            <SummaryTab latest={data.latestMetrics} fyMetrics={data.fyMetrics} />
          )}
          {tab === "financials" && <FinancialsTab data={data.statements} />}
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
