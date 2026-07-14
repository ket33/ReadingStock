"use client";

// 종목 골라보기 — 조건(지표 범위)으로 종목을 거르고, 카테고리별 컬럼으로 비교하는 표.
// 구조는 everyticker.com/screener 참고(필터 + 넓은 표), UI는 우리 디자인 토큰으로.
// 데이터는 screener 표 스냅샷 전체를 받아 클라이언트에서 필터·정렬한다.
//
// 필터 UX:
//  - 모든 조건(시장·업종 포함)은 '필터 추가' 패널에서 고른다.
//  - 패널은 카테고리 한 줄 + 세부 지표 5열 그리드.
//  - 숫자 지표는 최소~최대 입력 + 흔히 쓰는 구간 프리셋 칩(가이드).
//  - 시장·업종은 선택하면 서브리스트(칩)가 행으로 나타나 세부를 고른다.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScreenerRow } from "@/lib/screener-data";
import SiteHeader from "./SiteHeader";

import { type Fmt, type Preset, type MetricDef, CATS, METRICS, BY_KEY, fmtCell } from "@/lib/metrics-catalog";

// 컬럼 프리셋 — '기본'은 시가총액만. 필터를 추가하면 그 지표 열이 하나씩 늘어난다.
// 시가총액은 기준점 역할이라 어느 프리셋에서든 첫 컬럼으로 고정.
const COL_PRESETS: { name: string; cols: string[] }[] = [
  { name: "기본", cols: ["market_cap"] },
  ...CATS.map(c => ({
    name: c,
    cols: [
      "market_cap",
      ...METRICS.filter(m => m.cat === c && m.key !== "market_cap").map(m => m.key as string),
    ],
  })),
];


// ── 필터 ──────────────────────────────────────────────────────
interface MetricFilter {
  key: string;  // 지표 key
  min: string;  // 입력 문자열 (빈 값 = 조건 없음)
  max: string;
}

function passes(row: ScreenerRow, f: MetricFilter): boolean {
  const def = BY_KEY.get(f.key);
  if (!def) return true;
  const min = f.min.trim() === "" ? null : parseFloat(f.min) * def.mult;
  const max = f.max.trim() === "" ? null : parseFloat(f.max) * def.mult;
  if (min == null && max == null) return true;  // 값 미입력 → 통과
  const v = row[def.key] as number | null;
  if (v == null) return false;                   // 조건이 있는데 값이 없으면 제외
  // 적자로 음수가 된 밸류에이션 배수는 'PER 15 이하' 같은 조건의 의도(저평가+흑자)와
  // 어긋나므로 값 없음과 동일하게 제외 (표시도 '적자' — fmtCell 참고)
  if (def.cat === "밸류에이션" && v < 0) return false;
  if (min != null && !Number.isNaN(min) && v < min) return false;
  if (max != null && !Number.isNaN(max) && v > max) return false;
  return true;
}

// 프리셋 ↔ 현재 입력값 일치 여부 (칩 활성 표시용)
function presetActive(f: MetricFilter, p: Preset): boolean {
  const eq = (s: string, n?: number) =>
    n == null ? s.trim() === "" : parseFloat(s) === n;
  return eq(f.min, p.min) && eq(f.max, p.max);
}

// ── 본체 ──────────────────────────────────────────────────────
export default function ScreenerPage({ rows }: { rows: ScreenerRow[] }) {
  const router = useRouter();

  const [filters, setFilters] = useState<MetricFilter[]>([]);
  // 시장·업종 필터: null = 추가 안 됨, Set = 추가됨(빈 Set은 전체 통과)
  const [marketSel, setMarketSel] = useState<Set<string> | null>(null);
  const [sectorSel, setSectorSel] = useState<Set<string> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 지표 설명 툴팁 — 헤더·모달·필터행 어디서든 hover하면 fixed로 띄운다
  // (테이블이 overflow 컨테이너 안이라 absolute면 잘리므로 fixed + 좌표 계산)
  const [tip, setTip] = useState<{ label: string; d: string; u: string; x: number; y: number } | null>(null);
  const showTip = (e: React.MouseEvent, def: MetricDef) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140);
    setTip({ label: def.label, d: def.d, u: def.u, x, y: r.bottom + 8 });
  };
  const hideTip = () => setTip(null);
  // 터치 기기엔 hover가 없음 → 탭하면 잠깐 보여주고 자동으로 닫는다
  const tapTip = (e: React.MouseEvent, def: MetricDef) => {
    showTip(e, def);
    window.setTimeout(hideTip, 2500);
  };
  const [colPreset, setColPreset] = useState<string>("기본");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "market_cap", dir: "desc",
  });

  const sectors = useMemo(
    () => [...new Set(rows.map(r => r.sector).filter((s): s is string => !!s))].sort(),
    [rows],
  );
  const markets = useMemo(
    // KOSPI를 앞에 (알파벳순이면 KOSDAQ이 먼저 와서 어색함)
    () => [...new Set(rows.map(r => r.market).filter((m): m is string => !!m))]
      .sort((a, b) => (a === "KOSPI" ? -1 : b === "KOSPI" ? 1 : a.localeCompare(b))),
    [rows],
  );

  // 보이는 컬럼 = 프리셋 + 필터 중인 지표 (조건 건 지표는 항상 눈에 보이게)
  const cols = useMemo(() => {
    const base = COL_PRESETS.find(p => p.name === colPreset)?.cols ?? [];
    const withFilters = [...base];
    for (const f of filters) if (!withFilters.includes(f.key)) withFilters.push(f.key);
    return withFilters.map(k => BY_KEY.get(k)!).filter(Boolean);
  }, [colPreset, filters]);

  const filtered = useMemo(() => {
    let out = rows;
    if (marketSel && marketSel.size > 0)
      out = out.filter(r => r.market != null && marketSel.has(r.market));
    if (sectorSel && sectorSel.size > 0)
      out = out.filter(r => r.sector != null && sectorSel.has(r.sector));
    for (const f of filters) out = out.filter(r => passes(r, f));

    const def = BY_KEY.get(sort.key);
    if (def) {
      out = [...out].sort((a, b) => {
        const av = a[def.key] as number | null;
        const bv = b[def.key] as number | null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;   // null은 항상 아래로
        if (bv == null) return -1;
        return sort.dir === "desc" ? bv - av : av - bv;
      });
    }
    return out;
  }, [rows, marketSel, sectorSel, filters, sort]);

  const toggleSort = (key: string) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  // 체크 토글: 체크 = 필터 행 추가(열도 생김), 해제 = 제거
  const toggleMetricFilter = (key: string) =>
    setFilters(fs =>
      fs.some(f => f.key === key)
        ? fs.filter(f => f.key !== key)
        : [...fs, { key, min: "", max: "" }],
    );

  const updateFilter = (i: number, patch: Partial<MetricFilter>) =>
    setFilters(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const toggleIn = (set: Set<string>, v: string): Set<string> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const hasAnyFilter = filters.length > 0 || marketSel != null || sectorSel != null;

  const resetAll = () => {
    setFilters([]); setMarketSel(null); setSectorSel(null); setPickerOpen(false);
  };

  const priceDate = rows[0]?.price_date ?? null;

  // 필터 행 공통 래퍼 (def가 있으면 라벨 hover 시 설명 툴팁)
  const FilterRow = ({ label, cat, def, onRemove, children }: {
    label: string; cat: string; def?: MetricDef; onRemove: () => void; children: React.ReactNode;
  }) => (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-outline-variant/60 last:border-b-0">
      {/* 모바일: 라벨이 한 줄 전체 차지(입력칸은 다음 줄), 데스크톱: 고정폭 좌측 */}
      <span
        className="text-xs font-medium text-on-surface w-full sm:w-36 shrink-0"
        onMouseEnter={def ? e => showTip(e, def) : undefined}
        onMouseLeave={def ? hideTip : undefined}
        onClick={def ? e => tapTip(e, def) : undefined}
      >
        {label}
        <span className="text-outline font-normal ml-1">({cat})</span>
      </span>
      {children}
      <button
        onClick={onRemove}
        aria-label={`${label} 필터 제거`}
        className="material-symbols-outlined text-[16px] text-outline hover:text-error transition-colors ml-auto sm:ml-0"
      >
        close
      </button>
    </div>
  );

  return (
    <>
      {/* 상단 네비 (홈과 동일 패턴) */}
      <SiteHeader />

      <main className="flex-grow bg-surface-container-lowest">
        <div className="max-w-[1280px] mx-auto px-4 md:px-10 pt-10 pb-16">
          {/* 제목 — 홈 히어로 한글 문구와 같은 톤(sans·medium·tracking-tight), 가운데 정렬 */}
          <div className="mb-8 text-center">
            <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-2">
              Picking <span className="text-lg md:text-xl font-medium text-on-surface-variant">종목 골라보기</span>
            </h1>
            <p className="text-sm text-on-surface-variant">
              내가 원하는 조건에 맞는 종목을 골라보세요.
            </p>
          </div>

          {/* ── 필터 패널 ── */}
          <div className="border border-outline-variant rounded-xl bg-surface p-4 md:p-5 mb-6">
            {/* 활성 필터 행 목록 */}
            {(marketSel != null || sectorSel != null || filters.length > 0) && (
              <div className="mb-4">
                {marketSel != null && (
                  <FilterRow label="시장" cat="기본" onRemove={() => setMarketSel(null)}>
                    {markets.map(mk => {
                      const on = marketSel.has(mk);
                      return (
                        <button
                          key={mk}
                          onClick={() => setMarketSel(s => toggleIn(s!, mk))}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            on
                              ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed font-medium"
                              : "bg-white text-on-surface-variant border-outline-variant hover:text-primary"
                          }`}
                        >
                          {mk}
                        </button>
                      );
                    })}
                    {marketSel.size === 0 && (
                      <span className="text-[11px] text-outline">선택 없음 = 전체</span>
                    )}
                  </FilterRow>
                )}

                {sectorSel != null && (
                  <FilterRow label="업종" cat="기본" onRemove={() => setSectorSel(null)}>
                    {sectors.map(s => {
                      const on = sectorSel.has(s);
                      return (
                        <button
                          key={s}
                          onClick={() => setSectorSel(prev => toggleIn(prev!, s))}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            on
                              ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed font-medium"
                              : "bg-white text-on-surface-variant border-outline-variant hover:text-primary"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                    {sectorSel.size === 0 && (
                      <span className="text-[11px] text-outline">선택 없음 = 전체</span>
                    )}
                  </FilterRow>
                )}

                {filters.map((f, i) => {
                  const def = BY_KEY.get(f.key)!;
                  return (
                    <FilterRow
                      key={f.key}
                      label={def.cat === "수익률" ? `수익률 ${def.label}` : def.label}
                      cat={def.cat}
                      def={def}
                      onRemove={() => setFilters(fs => fs.filter((_, j) => j !== i))}
                    >
                      <input
                        type="number"
                        placeholder="최소"
                        value={f.min}
                        onChange={e => updateFilter(i, { min: e.target.value })}
                        className="w-24 px-2 py-1 text-xs border border-outline-variant rounded-md bg-white
                                   focus:outline-none focus:border-primary tabular-nums"
                      />
                      <span className="text-xs text-outline">~</span>
                      <input
                        type="number"
                        placeholder="최대"
                        value={f.max}
                        onChange={e => updateFilter(i, { max: e.target.value })}
                        className="w-24 px-2 py-1 text-xs border border-outline-variant rounded-md bg-white
                                   focus:outline-none focus:border-primary tabular-nums"
                      />
                      <span className="text-xs text-on-surface-variant">{def.unit}</span>
                      {/* 가이드 프리셋 칩 */}
                      {def.p && (
                        <span className="flex flex-wrap gap-1.5 sm:ml-2">
                          {def.p.map(p => {
                            const on = presetActive(f, p);
                            return (
                              <button
                                key={p.l}
                                onClick={() =>
                                  updateFilter(i, {
                                    min: p.min != null ? String(p.min) : "",
                                    max: p.max != null ? String(p.max) : "",
                                  })
                                }
                                className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                                  on
                                    ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed font-medium"
                                    : "bg-white text-on-surface-variant border-outline-variant hover:text-primary hover:border-primary"
                                }`}
                              >
                                {p.l}
                              </button>
                            );
                          })}
                        </span>
                      )}
                    </FilterRow>
                  );
                })}
              </div>
            )}

            {/* 필터 추가 + 초기화 + 카운트 */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setPickerOpen(o => !o)}
                className={`inline-flex items-center gap-1 pl-3 pr-4 py-1.5 text-xs font-medium border rounded-full
                            transition-colors ${
                              pickerOpen
                                ? "bg-primary text-on-primary border-primary"
                                : "bg-white text-on-surface-variant border-outline-variant hover:text-primary hover:border-primary"
                            }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {pickerOpen ? "close" : "add"}
                </span>
                필터 추가
              </button>

              {hasAnyFilter && (
                <button
                  onClick={resetAll}
                  className="text-xs text-on-surface-variant hover:text-error transition-colors inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                  초기화
                </button>
              )}

              <span className="ml-auto text-xs text-on-surface-variant tabular-nums">
                <strong className="text-primary font-semibold">{filtered.length}</strong>
                <span className="text-outline"> / {rows.length}종목</span>
              </span>
            </div>

          </div>

          {/* ── 필터 선택 모달 (everyticker 방식: 오버레이 + 체크박스) ── */}
          {pickerOpen && (
            <div
              className="fixed inset-0 z-[100] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-label="필터 추가"
            >
              {/* 배경 딤 — 클릭하면 닫기 */}
              <div
                className="fixed inset-0 bg-primary/40 rs-fade-in"
                onClick={() => setPickerOpen(false)}
              />
              <div className="relative min-h-full flex items-start md:items-center justify-center p-4 md:p-8">
                <div className="relative bg-white rounded-xl border border-outline-variant shadow-xl
                                w-full max-w-3xl max-h-[85vh] flex flex-col rs-pop-in">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-outline-variant">
                    <h2 className="font-serif text-base font-semibold text-primary">필터 추가</h2>
                    <button
                      onClick={() => setPickerOpen(false)}
                      aria-label="닫기"
                      className="material-symbols-outlined text-[20px] text-outline hover:text-primary transition-colors"
                    >
                      close
                    </button>
                  </div>

                  {/* 본문 — 카테고리 한 줄 + 세부 체크박스 5열 */}
                  <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 flex flex-col gap-5">
                    {/* 기본 (시장·업종) */}
                    <div>
                      <div className="text-xs font-semibold text-primary mb-2">기본</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-1.5">
                        <label className="flex items-center gap-2 py-1 text-xs text-on-surface cursor-pointer hover:text-primary">
                          <input
                            type="checkbox"
                            checked={marketSel != null}
                            onChange={() => setMarketSel(s => (s == null ? new Set() : null))}
                            className="w-3.5 h-3.5 accent-primary shrink-0"
                          />
                          시장
                        </label>
                        <label className="flex items-center gap-2 py-1 text-xs text-on-surface cursor-pointer hover:text-primary">
                          <input
                            type="checkbox"
                            checked={sectorSel != null}
                            onChange={() => setSectorSel(s => (s == null ? new Set() : null))}
                            className="w-3.5 h-3.5 accent-primary shrink-0"
                          />
                          업종
                        </label>
                      </div>
                    </div>

                    {/* 지표 카테고리들 */}
                    {CATS.map(cat => (
                      <div key={cat}>
                        <div className="text-xs font-semibold text-primary mb-2">{cat}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-1.5">
                          {METRICS.filter(m => m.cat === cat).map(m => (
                            <label
                              key={m.key as string}
                              className="flex items-center gap-2 py-1 text-xs text-on-surface cursor-pointer hover:text-primary"
                              onMouseEnter={e => showTip(e, m)}
                              onMouseLeave={hideTip}
                            >
                              <input
                                type="checkbox"
                                checked={filters.some(f => f.key === m.key)}
                                onChange={() => toggleMetricFilter(m.key as string)}
                                className="w-3.5 h-3.5 accent-primary shrink-0"
                              />
                              {m.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 푸터 */}
                  <div className="flex items-center justify-between px-5 md:px-6 py-3 border-t border-outline-variant">
                    <span className="text-xs text-on-surface-variant tabular-nums">
                      선택 {filters.length + (marketSel != null ? 1 : 0) + (sectorSel != null ? 1 : 0)}개
                    </span>
                    <button
                      onClick={() => setPickerOpen(false)}
                      className="px-5 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary
                                 hover:opacity-90 transition-opacity"
                    >
                      완료
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 컬럼 프리셋 ── */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            {COL_PRESETS.map(p => (
              <button
                key={p.name}
                onClick={() => setColPreset(p.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  colPreset === p.name
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* ── 결과 테이블 ── */}
          <div className="border border-outline-variant rounded-xl bg-white overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-max">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="sticky left-0 z-10 bg-surface-container-low text-left px-4 py-2.5
                                 text-xs font-medium text-on-surface-variant">
                    종목
                  </th>
                  {cols.map(def => {
                    const sorted = sort.key === (def.key as string);
                    return (
                      <th
                        key={def.key as string}
                        onClick={() => toggleSort(def.key as string)}
                        onMouseEnter={e => showTip(e, def)}
                        onMouseLeave={hideTip}
                        className={`text-right px-3 py-2.5 text-xs font-medium whitespace-nowrap cursor-pointer
                                    select-none transition-colors hover:text-primary ${
                                      sorted ? "text-primary" : "text-on-surface-variant"
                                    }`}
                      >
                        {def.cat === "수익률" ? `수익률 ${def.label}` : def.label}
                        {sorted && (
                          <span className="material-symbols-outlined text-[13px] align-[-2px] ml-0.5">
                            {sort.dir === "desc" ? "arrow_downward" : "arrow_upward"}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
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
                    </td>
                    {cols.map(def => {
                      const { text, cls } = fmtCell(def, r[def.key] as number | null);
                      return (
                        <td
                          key={def.key as string}
                          className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${cls}`}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + 1} className="px-4 py-12 text-center text-sm text-on-surface-variant">
                      조건에 맞는 종목이 없습니다. 필터를 완화해 보세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 기준 설명 — 문장마다 한 줄 */}
          <div className="mt-3 text-[11px] text-outline leading-relaxed space-y-0.5">
            <p>* 재무 지표는 최신 분기 TTM(최근 4개 분기 합) 기준, 밸류에이션은 {priceDate ?? "최근"} 종가로 환산.</p>
            <p>* PER 등 밸류에이션 배수는 적자면 &lsquo;적자&rsquo;로 표시하고 필터에서 제외.</p>
            <p>* 성장률 YoY·CAGR은 비교 시점이 적자면 표시하지 않음.</p>
            <p>* 수익률은 수정주가 기준 가격수익률(분할·증자 반영, 배당 미반영).</p>
            <p>* 금융사는 매출액·유동비율 등 일부 지표가 없을 수 있음.</p>
            <p>* 구간 프리셋은 참고용 가이드일 뿐 투자 기준이 아닙니다.</p>
          </div>
        </div>
      </main>

      {/* 지표 설명 툴팁 (fixed — 모달 z-100보다 위) */}
      {tip && (
        <div
          className="fixed z-[300] w-max max-w-[280px] -translate-x-1/2 rounded-lg bg-primary text-white
                     px-3.5 py-2.5 text-[11px] leading-relaxed shadow-lg pointer-events-none"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-semibold mb-1">{tip.label}</div>
          <div>{tip.d}</div>
          <div className="text-white/65 mt-1">{tip.u}</div>
        </div>
      )}

      {/* 푸터 (홈과 동일) */}
      <footer className="bg-surface-container-low border-t border-outline-variant">
        <div className="max-w-[1280px] mx-auto py-12 px-4 md:px-10">
          <span className="font-serif text-lg font-bold text-primary mb-3 block">Reading Stock</span>
          <p className="text-sm text-on-surface-variant max-w-xl leading-relaxed">
            본 정보는 투자 판단의 참고 자료이며 매수·매도 권유가 아닙니다.
            <br />
            모든 콘텐츠는 공개 데이터를 바탕으로 자동 생성되며, 투자 결정과 책임은 본인에게 있습니다.
          </p>
        </div>
      </footer>
    </>
  );
}
