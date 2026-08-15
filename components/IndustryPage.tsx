"use client";

// Industries — 매출 성장 히트맵(Growth) + 산업별 주가 등락(Price).
//  - Growth: 행=산업 그룹 × 열=최근 10개 분기, LTM 매출 YoY (GrowthHeatmap — 지시서 §4)
//  - Price: 각 그룹 시총 상위 5개 온보딩 기업의 시총가중 평균 수익률 (1일/1주/1개월/YTD 탭)
// 의도된 동선: 산업을 먼저 훑고 → /industries/[id] 산업 페이지 → 기업으로.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IndustryCategoryMover, IndustryGroupMover } from "@/lib/industry-data";
import type { IndustryCategory } from "@/lib/screener-data";
import type { GrowthData } from "@/lib/industry-growth-data";
import { formatKrw } from "@/lib/format";
import GrowthHeatmap from "./GrowthHeatmap";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

// ── 산업 바로가기 셀렉터 — Picking 산업 필터와 같은 2단 UI, 고르면 산업 페이지로 이동 ──
function IndustryPicker({ categories }: { categories: IndustryCategory[] }) {
  const router = useRouter();
  const [catPick, setCatPick] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [grpOpen, setGrpOpen] = useState(false);

  return (
    <div className="max-w-[560px] mx-auto mb-10">
      {(catOpen || grpOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setCatOpen(false); setGrpOpen(false); }} />
      )}
      <div className="flex items-center gap-1.5">
        {/* 1차: 대분류 */}
        <div className={`relative flex-1 min-w-0 ${catOpen || grpOpen ? "z-50" : ""}`}>
          <button
            onClick={() => { setCatOpen(o => !o); setGrpOpen(false); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-outline-variant bg-white text-sm text-left hover:border-primary transition-colors"
          >
            <span className={`truncate ${catPick ? "text-on-surface" : "text-outline"}`}>
              {catPick ?? "산업 선택"}
            </span>
            <span className="material-symbols-outlined text-[18px] text-outline shrink-0">
              {catOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          {catOpen && (
            <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-outline-variant bg-white shadow-lg">
              {categories.map(c => (
                <button
                  key={c.name}
                  onClick={() => { setCatPick(c.name); setCatOpen(false); setGrpOpen(true); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-low ${
                    catPick === c.name ? "text-primary font-medium" : "text-on-surface"
                  }`}
                >
                  <span className="truncate">
                    {c.name} <span className="text-outline text-xs font-normal">({c.count}개 기업)</span>
                  </span>
                  {catPick === c.name && <span className="material-symbols-outlined text-[16px] shrink-0">check</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="material-symbols-outlined text-[18px] text-outline shrink-0">chevron_right</span>

        {/* 2차: 세부 산업 — 고르면 그 산업 페이지로 이동 */}
        <div className={`relative flex-1 min-w-0 ${catOpen || grpOpen ? "z-50" : ""}`}>
          <button
            onClick={() => { if (catPick) { setGrpOpen(o => !o); setCatOpen(false); } }}
            disabled={!catPick}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
              !catPick
                ? "border-outline-variant/60 bg-surface-container-low text-outline cursor-not-allowed"
                : "border-outline-variant bg-white hover:border-primary"
            }`}
          >
            <span className="truncate text-outline">세부 산업 선택</span>
            <span className="material-symbols-outlined text-[18px] text-outline shrink-0">
              {grpOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          {grpOpen && catPick && (() => {
            const c = categories.find(x => x.name === catPick);
            if (!c) return null;
            return (
              <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-outline-variant bg-white shadow-lg">
                {c.groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => router.push(`/industries/${g.id}`)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    <span className="truncate">
                      {g.name} <span className="text-outline text-xs">({g.count}개 기업)</span>
                    </span>
                    <span className="material-symbols-outlined text-[15px] text-outline shrink-0">arrow_forward</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Price (Top Gainer / Loser) ───────────────────────────────
const PERIODS = [
  { key: "d1", label: "1일" },
  { key: "w1", label: "1주" },
  { key: "m1", label: "1개월" },
  { key: "ytd", label: "YTD" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function MoverList({ title, rows, period, up }: {
  title: string;
  rows: { g: IndustryGroupMover }[];
  period: PeriodKey;
  up: boolean;
}) {
  // 텍스트를 읽지 않아도 방향·크기가 보이게: 행 뒤에 등락폭 비례 막대 (상승 빨강·하락 파랑)
  const maxAbs = Math.max(...rows.map(({ g }) => Math.abs(g.ret[period] ?? 0)), 0.01);
  const barColor = up ? "rgba(217,48,37,0.12)" : "rgba(26,115,232,0.12)";
  const accent = up ? "#d93025" : "#1a73e8";

  return (
    <div className={`border rounded-xl bg-white p-4 border-t-4 ${up ? "border-t-[#d93025]" : "border-t-[#1a73e8]"} border-outline-variant`}>
      <h3 className="text-lg font-bold text-center mb-3" style={{ color: accent }}>
        {up ? "▲" : "▼"} {title}
      </h3>
      <ul className="divide-y divide-outline-variant/60">
        {rows.map(({ g }, i) => {
          const v = g.ret[period]!;
          return (
            <li key={g.id}>
              <Link href={`/industries/${g.id}`}
                    className="relative flex items-center gap-2.5 py-2 px-1 group overflow-hidden rounded-md">
                {/* 등락폭 비례 배경 막대 */}
                <span aria-hidden className="absolute inset-y-1 left-0 rounded-md"
                      style={{ width: `${(Math.abs(v) / maxAbs) * 100}%`, backgroundColor: barColor }} />
                <span className="relative w-6 text-[13px] font-semibold text-on-surface tabular-nums shrink-0">{i + 1}</span>
                <span className="relative min-w-0">
                  <span className="block text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                    {g.name}
                  </span>
                  <span className="block text-[11px] text-outline truncate">
                    시총 {formatKrw(g.mcap)} · {g.memberCount}개 기업
                  </span>
                </span>
                <span className="relative ml-auto text-sm font-semibold tabular-nums shrink-0" style={{ color: accent }}>
                  {v > 0 ? "▲" : v < 0 ? "▼" : ""} {Math.abs(v)}%
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-6 text-center text-xs text-on-surface-variant">데이터가 없어요.</li>
        )}
      </ul>
    </div>
  );
}

// ── 본체 ─────────────────────────────────────────────────────
export default function IndustryPage({ categories, navCategories, growth }: {
  categories: IndustryCategoryMover[];
  navCategories: IndustryCategory[];
  growth: GrowthData;
}) {
  const [period, setPeriod] = useState<PeriodKey>("d1");

  const flat = useMemo(() =>
    categories.flatMap(c => c.groups.map(g => ({ g }))), [categories]);

  const ranked = useMemo(() => {
    const withRet = flat.filter(x => x.g.ret[period] != null);
    const desc = [...withRet].sort((a, b) => b.g.ret[period]! - a.g.ret[period]!);
    return {
      gainers: desc.filter(x => x.g.ret[period]! > 0).slice(0, 8),
      losers: desc.filter(x => x.g.ret[period]! < 0).reverse().slice(0, 8),
    };
  }, [flat, period]);

  return (
    <>
      <SiteHeader />

      <main className="flex-grow bg-surface-container-lowest">
        <div className="max-w-[1280px] mx-auto px-4 md:px-10 pt-10 pb-16">
          <div className="mb-8 text-center">
            <h1 className="font-sans text-3xl md:text-4xl font-semibold tracking-tight text-primary">
              Industries
            </h1>
          </div>

          {/* 산업 바로가기 — 대분류 → 세부 산업 고르면 산업 페이지로 */}
          <IndustryPicker categories={navCategories} />

          {/* ── Growth: 매출 성장 히트맵 (지시서 §4) ── */}
          <section className="mb-3">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-primary text-center mb-4">Growth</h2>
            <GrowthHeatmap data={growth} />
            <p className="mt-2 text-[11px] text-outline">* 금융업은 매출액 대신 순영업수익을 사용합니다.</p>
          </section>

          {/* ── Price: 산업별 주가 등락 — 가로 폭은 본문의 2/3만 쓴다 ── */}
          <section className="mt-12 max-w-[850px] mx-auto">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-primary text-center mb-4">Price</h2>
            <div className="flex justify-center gap-1.5 mb-4">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    period === p.key
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <MoverList title="TOP 8" rows={ranked.gainers} period={period} up />
              <MoverList title="BOTTOM 8" rows={ranked.losers} period={period} up={false} />
            </div>
          </section>

          {/* 기준 설명 */}
          <div className="mt-6 text-[11px] text-outline leading-relaxed space-y-0.5">
            <p>* 주가 등락은 각 산업 시가총액 상위 5개 기업의 시가총액 가중 평균 수익률입니다.</p>
            <p>* 산업을 누르면 해당 산업 페이지로 이동합니다.</p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
