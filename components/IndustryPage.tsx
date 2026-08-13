"use client";

// 산업 무버스 — 히트맵(영업이익 YoY) + 산업별 Top Gainer/Loser.
// everyticker.com/industry-movers 참고. 데이터 기준은 각 그룹 '시총 상위 5개 온보딩 기업':
//  - 히트맵 크기 = |최근 분기 영업이익 합|, 색 = 전년 동분기 대비 증감 (상승 빨강·하락 파랑)
//  - 등락 = 상위 5개 시총가중 평균 수익률 (1일/1주/1개월/YTD 탭)
// 셀·행을 누르면 /industry/[id] 산업 페이지로 이동한다.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { IndustryCategoryMover, IndustryGroupMover } from "@/lib/industry-data";
import { squarify, type Rect } from "@/lib/treemap";
import { formatKrw } from "@/lib/format";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

// 레이아웃 좌표계 — 렌더 크기(약 1200×620px)와 비슷한 비율이라 셀이 정사각형에 가깝게 나온다
const W = 200;
const H = 100;
const CAT_HEADER_UNITS = 3.2; // 대분류 이름 바 높이 (H 단위)

// ── 색: 상승 빨강 · 하락 파랑 (사이트 등락 관례 --color-stock-up/down 기준) ──
function cellStyle(g: IndustryGroupMover): { bg: string; fg: string } {
  const deepRed = { bg: "#b3261e", fg: "#ffffff" };
  const red = { bg: "#d93025", fg: "#ffffff" };
  const lightRed = { bg: "#f0a49c", fg: "#3a0f0b" };
  const flat = { bg: "#d5d8dc", fg: "#44474c" };
  const lightBlue = { bg: "#9dc2f2", fg: "#0c2f5e" };
  const blue = { bg: "#4d90e6", fg: "#ffffff" };
  const deepBlue = { bg: "#1a5fc4", fg: "#ffffff" };
  switch (g.yoyKind) {
    case "turn_profit": return deepRed;
    case "turn_loss": return deepBlue;
    case "loss_widen": return deepBlue;
    case "loss_narrow": return lightRed;
    case "pct": {
      const p = g.yoyPct ?? 0;
      if (p >= 30) return deepRed;
      if (p >= 10) return red;
      if (p >= 2) return lightRed;
      if (p > -2) return flat;
      if (p > -10) return lightBlue;
      if (p > -30) return blue;
      return deepBlue;
    }
    default: return flat;
  }
}

function yoyLabel(g: IndustryGroupMover): string {
  switch (g.yoyKind) {
    case "turn_profit": return "흑자전환";
    case "turn_loss": return "적자전환";
    case "loss_widen": return "적자확대";
    case "loss_narrow": return "적자축소";
    case "pct": return `${(g.yoyPct ?? 0) > 0 ? "+" : ""}${g.yoyPct}%`;
    default: return "—";
  }
}

function cellTitle(g: IndustryGroupMover): string {
  const names = g.top5.map(t => t.name).join("·");
  return `${g.name} — 영업이익 ${formatKrw(g.opNow)} (전년 동기 ${formatKrw(g.opPrev)}) · YoY ${yoyLabel(g)}`
    + `\n기준 ${g.basis ?? "—"} · 표본 ${g.sampled}개사\n상위: ${names}`;
}

// ── 히트맵 ──────────────────────────────────────────────────
function Heatmap({ categories }: { categories: IndustryCategoryMover[] }) {
  const layout = useMemo(() => {
    const cats = categories
      .map(c => ({
        cat: c,
        groups: c.groups.filter(g => g.opNow != null && g.yoyKind != null),
      }))
      .map(c => ({ ...c, size: c.groups.reduce((s, g) => s + Math.abs(g.opNow!), 0) }))
      .filter(c => c.groups.length > 0 && c.size > 0);

    const placedCats = squarify(cats.map(c => ({ value: c.size, data: c })), { x: 0, y: 0, w: W, h: H });
    return placedCats.map(pc => {
      const inner: Rect = {
        x: pc.rect.x,
        y: pc.rect.y + CAT_HEADER_UNITS,
        w: pc.rect.w,
        h: Math.max(pc.rect.h - CAT_HEADER_UNITS, 0.1),
      };
      const cells = squarify(
        pc.data.groups.map(g => ({ value: Math.abs(g.opNow!), data: g })),
        inner,
      );
      return { rect: pc.rect, cat: pc.data.cat, cells };
    });
  }, [categories]);

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant bg-white">
      <div className="relative min-w-[900px]" style={{ height: 620 }}>
        {layout.map(({ rect, cat, cells }) => (
          <div key={cat.id}>
            {/* 대분류 박스 + 이름 바 */}
            <div
              className="absolute border border-white bg-surface-container-low"
              style={{
                left: `${(rect.x / W) * 100}%`, top: `${(rect.y / H) * 100}%`,
                width: `${(rect.w / W) * 100}%`, height: `${(rect.h / H) * 100}%`,
              }}
            >
              <div className="px-1.5 pt-0.5 text-[10px] font-bold text-on-surface-variant truncate leading-4">
                {cat.name}
              </div>
            </div>
            {/* 그룹 셀 */}
            {cells.map(({ rect: r, data: g }) => {
              const { bg, fg } = cellStyle(g);
              const wPct = (r.w / W) * 100;
              const showText = r.w >= 11 && r.h >= 6;
              const showSub = r.w >= 14 && r.h >= 9;
              return (
                <Link
                  key={g.id}
                  href={`/industry/${g.id}`}
                  title={cellTitle(g)}
                  className="absolute overflow-hidden border border-white/70 hover:brightness-110 hover:z-10 transition-[filter]"
                  style={{
                    left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`,
                    width: `${wPct}%`, height: `${(r.h / H) * 100}%`,
                    backgroundColor: bg, color: fg,
                  }}
                >
                  {showText && (
                    <div className="p-1 leading-tight">
                      <div className="text-[10px] font-semibold truncate">{g.name}</div>
                      {showSub && <div className="text-[10px] opacity-90">{yoyLabel(g)}</div>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const LEGEND: { label: string; bg: string }[] = [
  { label: "-30% 이하·적자", bg: "#1a5fc4" },
  { label: "-30~-10%", bg: "#4d90e6" },
  { label: "-10~-2%", bg: "#9dc2f2" },
  { label: "±2%", bg: "#d5d8dc" },
  { label: "+2~10%", bg: "#f0a49c" },
  { label: "+10~30%", bg: "#d93025" },
  { label: "+30% 이상·흑전", bg: "#b3261e" },
];

// ── Top Gainer / Loser ───────────────────────────────────────
const PERIODS = [
  { key: "d1", label: "1일" },
  { key: "w1", label: "1주" },
  { key: "m1", label: "1개월" },
  { key: "ytd", label: "YTD" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function MoverList({ title, rows, period, up }: {
  title: string;
  rows: { g: IndustryGroupMover; cat: string }[];
  period: PeriodKey;
  up: boolean;
}) {
  return (
    <div className="border border-outline-variant rounded-xl bg-white p-4">
      <h3 className="text-sm font-bold text-on-surface mb-2">{title}</h3>
      <ul className="divide-y divide-outline-variant/60">
        {rows.map(({ g, cat }, i) => {
          const v = g.ret[period]!;
          return (
            <li key={g.id}>
              <Link href={`/industry/${g.id}`}
                    className="flex items-center gap-2.5 py-2 group">
                <span className="w-5 text-[11px] text-outline tabular-nums shrink-0">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                    {g.name}
                  </span>
                  <span className="block text-[11px] text-outline truncate">{cat}</span>
                </span>
                <span className={`ml-auto text-sm font-semibold tabular-nums shrink-0 ${
                  up ? "text-[#d93025]" : "text-[#1a73e8]"
                }`}>
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
export default function IndustryPage({ categories }: { categories: IndustryCategoryMover[] }) {
  const [period, setPeriod] = useState<PeriodKey>("d1");

  const flat = useMemo(() =>
    categories.flatMap(c => c.groups.map(g => ({ g, cat: c.name }))), [categories]);

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
            <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-2">
              Industry <span className="text-lg md:text-xl font-medium text-on-surface-variant">산업 한눈에</span>
            </h1>
            <p className="text-sm text-on-surface-variant">
              산업별 실적과 주가 흐름을 한 장에서 살펴보세요.
            </p>
          </div>

          {/* ── 히트맵 ── */}
          <section className="mb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="font-serif text-xl font-semibold text-primary">실적 히트맵</h2>
              <span className="text-xs text-on-surface-variant">
                크기 = 최근 분기 영업이익 규모 · 색 = 전년 동분기 대비 증감
              </span>
            </div>
            <Heatmap categories={categories} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 justify-center">
              {LEGEND.map(l => (
                <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant">
                  <span className="w-3 h-3 rounded-[3px] inline-block" style={{ backgroundColor: l.bg }} />
                  {l.label}
                </span>
              ))}
            </div>
          </section>

          {/* ── Top Gainer / Loser ── */}
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-serif text-xl font-semibold text-primary">산업별 주가 등락</h2>
              <div className="flex gap-1.5">
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
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <MoverList title="상승 상위" rows={ranked.gainers} period={period} up />
              <MoverList title="하락 상위" rows={ranked.losers} period={period} up={false} />
            </div>
          </section>

          {/* 기준 설명 */}
          <div className="mt-6 text-[11px] text-outline leading-relaxed space-y-0.5">
            <p>* 각 산업은 시가총액 상위 5개 온보딩 기업을 표본으로 집계합니다 (산업 전체가 아닙니다).</p>
            <p>* 영업이익 YoY는 각 기업의 최근 공시 분기 vs 전년 동분기 합산 — 기업마다 최신 분기가 다를 수 있습니다.</p>
            <p>* 주가 등락은 상위 5개 기업의 시가총액 가중 평균 수익률입니다.</p>
            <p>* 산업을 누르면 해당 산업 페이지로 이동합니다.</p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
