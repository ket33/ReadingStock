"use client";

// 종목 페이지 본체 — 상단 종목 헤더(공통) + 좌측 사이드바 3탭 + 콘텐츠
import { useState, useEffect } from "react";
import type { StockPageData } from "@/lib/types";
import { formatKrw } from "@/lib/format";
import ArticleTab from "./ArticleTab";
import SummaryTab from "./SummaryTab";
import FinancialsTab from "./FinancialsTab";
import SearchBox from "./SearchBox";
import Logo from "./Logo";

type TabKey = "article" | "summary" | "financials";

const TABS: { key: TabKey; label: string }[] = [
  { key: "article", label: "리포트" },
  { key: "summary", label: "요약" },
  { key: "financials", label: "재무제표" },
];

export default function StockPage({ data }: { data: StockPageData }) {
  const [tab, setTab] = useState<TabKey>("article");
  const { company, price } = data;

  // 홈→종목 등으로 넘어올 때, Next가 sticky 헤더를 '이미 최상단에 보임'으로 인식해
  // 스크롤을 리셋하지 않는 경우가 있다. 종목이 바뀔 때 명시적으로 최상단으로 이동시킨다.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [company.stock_code]);

  return (
    <>
      {/* 상단 네비게이션 (디자인의 TopNavBar) — 로고=홈 링크, 가운데 종목 검색 */}
      <header className="bg-surface border-b border-outline-variant sticky top-0 z-50 h-16 flex items-center">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full px-4 md:px-10 max-w-[1280px] mx-auto h-full gap-4">
          <div className="justify-self-start">
            <Logo mark={28} text={19} />
          </div>
          <div className="justify-self-center">
            <SearchBox size="small" />
          </div>
          <span className="text-xs text-on-surface-variant hidden md:block justify-self-end">
            당신의 투자를, 당신이 이해하도록
          </span>
        </div>
      </header>

      {/* 종목 헤더 (모든 탭 공통) */}
      <div className="bg-white border-b border-outline-variant">
        <div className="max-w-[1280px] mx-auto px-4 md:px-10 py-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="flex items-baseline gap-3">
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
            </div>
          </div>
          {price?.market_cap != null && (
            <span className="text-sm text-on-surface-variant">
              시가총액 {formatKrw(price.market_cap)} 원
              {price.date && <span className="text-xs text-outline ml-2">({price.date} 기준)</span>}
            </span>
          )}
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
            <ArticleTab article={data.article} charts={data.charts} sector={company.sector} />
          )}
          {tab === "summary" && (
            <SummaryTab latest={data.latestMetrics} fyMetrics={data.fyMetrics} />
          )}
          {tab === "financials" && <FinancialsTab data={data.statements} />}
        </article>
      </main>

      {/* 푸터 (디자인 축약) */}
      <footer className="bg-primary text-on-primary py-10 px-10">
        <div className="max-w-[1280px] mx-auto text-center space-y-3">
          <div className="font-serif text-lg">Reading Stock</div>
          <p className="text-xs text-on-primary-container max-w-xl mx-auto leading-relaxed">
            본 사이트의 모든 콘텐츠는 공개 데이터를 바탕으로 자동 생성된 참고 자료이며,
            투자 권유가 아닙니다.
            <br />
            투자 판단과 책임은 본인에게 있습니다.
          </p>
        </div>
      </footer>
    </>
  );
}
