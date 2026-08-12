"use client";

// 종목 골라보기 — 조건(지표 범위)으로 종목을 거르고, 카테고리별 컬럼으로 비교하는 표.
// 구조는 everyticker.com/screener 참고(필터 + 넓은 표), UI는 우리 디자인 토큰으로.
// 데이터는 screener 표 스냅샷 전체를 받아 클라이언트에서 필터·정렬한다.
//
// 필터 UX:
//  - 모든 조건(시장·산업 포함)은 '필터 추가' 패널에서 고른다.
//  - 패널은 카테고리 한 줄 + 세부 지표 5열 그리드.
//  - 숫자 지표는 최소~최대 입력 + 흔히 쓰는 구간 프리셋 칩(가이드).
//  - 산업은 2단 선택: 1차 대분류(16개 칩) → 2차 그 안의 산업 그룹(칩).
//    2차를 안 고르면 그 대분류 전체가 통과한다. 검색 입력 없이 칩을 눌러 고른다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchScreenerCols, SCREENER_BASE_COLS } from "@/lib/screener-data";
import type { ScreenerRow, IndustryCategory } from "@/lib/screener-data";
import { supabaseBrowser } from "@/lib/supabase-browser";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

import { type MetricDef, CATS, METRICS, BY_KEY, fmtCell } from "@/lib/metrics-catalog";
import { type MetricFilter, COL_PRESETS, passes, presetActive } from "@/lib/screener-filter";

const ROW_STEP = 30;    // 표에 한 번에 보여주는 행 수 — '더보기'마다 이만큼 추가 (기본 정렬: 시가총액순)

// ── 본체 ──────────────────────────────────────────────────────
export default function ScreenerPage({ rows: initialRows, categories }: {
  rows: ScreenerRow[];
  categories: IndustryCategory[];
}) {
  const router = useRouter();

  // 서버는 기본 컬럼만 보낸다 — 프리셋·필터·정렬이 다른 지표를 쓰면 그 컬럼만 추가로 받아 합친다
  const [rows, setRows] = useState<ScreenerRow[]>(initialRows);
  const loadedCols = useRef<Set<string>>(new Set(SCREENER_BASE_COLS));
  const [colsLoading, setColsLoading] = useState(false);
  const [rowLimit, setRowLimit] = useState(ROW_STEP);

  const [filters, setFilters] = useState<MetricFilter[]>([]);
  // 시장 필터: null = 추가 안 됨, Set = 추가됨(빈 Set은 전체 통과)
  const [marketSel, setMarketSel] = useState<Set<string> | null>(null);
  // 산업 필터: null = 추가 안 됨. cats = 2차에서 '전체'로 고른 대분류, groups = 개별로 고른 그룹.
  // 1차(대분류)만으로는 필터가 걸리지 않는다 — 2차에서 '전체' 또는 그룹을 골라야 확정되고,
  // 확정된 항목은 아래 칩으로 쌓이며 셀렉트 박스는 다음 선택을 위해 초기화된다.
  const [indSel, setIndSel] = useState<{ cats: Set<string>; groups: Set<string> } | null>(null);
  // 지금 고르는 중인 1차 대분류 (2차에서 항목을 고르면 초기화)
  const [catPick, setCatPick] = useState<string | null>(null);
  // 1차·2차 드롭다운 열림 상태 (셀렉트 박스를 누르면 아래로 목록이 펼쳐진다)
  const [catOpen, setCatOpen] = useState(false);
  const [grpOpen, setGrpOpen] = useState(false);
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

  // 프리셋·필터·정렬이 요구하는 지표 중 아직 안 받은 컬럼을 전 종목분 받아 행에 합친다
  useEffect(() => {
    const need = new Set<string>();
    for (const c of cols) need.add(c.key as string);
    for (const f of filters) need.add(f.key);
    if (sort.key && BY_KEY.has(sort.key)) need.add(sort.key);  // '산업' 등 비지표 열은 제외
    const missing = [...need].filter(k => !loadedCols.current.has(k));
    if (missing.length === 0) return;
    missing.forEach(k => loadedCols.current.add(k));   // 중복 요청 방지 (실패 시 되돌림)
    setColsLoading(true);
    fetchScreenerCols(supabaseBrowser(), missing)
      .then(map => setRows(rs => rs.map(r => ({ ...r, ...map.get(r.stock_code) }))))
      .catch(() => missing.forEach(k => loadedCols.current.delete(k)))
      .finally(() => setColsLoading(false));
  }, [cols, filters, sort]);

  // 필터가 바뀌면 표시 행 수 리셋 (정렬만 바뀔 땐 유지)
  useEffect(() => { setRowLimit(ROW_STEP); }, [filters, marketSel, indSel]);

  const filtered = useMemo(() => {
    let out = rows;
    if (marketSel && marketSel.size > 0)
      out = out.filter(r => r.market != null && marketSel.has(r.market));
    // 산업 필터: '전체'로 고른 대분류는 소속 그룹 전부, 개별 그룹은 그 그룹만 — 합집합(OR).
    // 종목은 소속 그룹(primary+secondary) 중 하나라도 걸리면 통과.
    if (indSel && (indSel.cats.size > 0 || indSel.groups.size > 0)) {
      const allowed = new Set<string>(indSel.groups);
      for (const c of categories) {
        if (!indSel.cats.has(c.name)) continue;
        for (const g of c.groups) allowed.add(g.name);
      }
      out = out.filter(r => (r.groups ?? []).some(g => allowed.has(g)));
    }
    for (const f of filters) out = out.filter(r => passes(r, f));

    if (sort.key === "industry") {
      // 산업 열: primary 그룹명 가나다 정렬 (없는 종목은 아래로)
      out = [...out].sort((a, b) => {
        const av = a.groupPrimary ?? null;
        const bv = b.groupPrimary ?? null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sort.dir === "desc" ? bv.localeCompare(av, "ko") : av.localeCompare(bv, "ko");
      });
    } else {
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
    }
    return out;
  }, [rows, marketSel, indSel, categories, filters, sort]);

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

  // 2차에서 항목 확정 — '전체'면 대분류로, 아니면 그룹으로 칩에 쌓고 셀렉트 박스는 초기화
  const addIndustry = (kind: "cat" | "group", name: string) => {
    setIndSel(prev => {
      const cats = new Set(prev?.cats);
      const groups = new Set(prev?.groups);
      if (kind === "cat") {
        cats.add(name);
        // 대분류 전체를 골랐으면 그 밑에서 따로 골라뒀던 그룹 칩은 중복이라 정리
        for (const g of categories.find(c => c.name === name)?.groups ?? []) groups.delete(g.name);
      } else {
        groups.add(name);
      }
      return { cats, groups };
    });
    setCatPick(null); setCatOpen(false); setGrpOpen(false);
  };

  const removeIndustry = (kind: "cat" | "group", name: string) =>
    setIndSel(prev => {
      if (!prev) return prev;
      const cats = new Set(prev.cats);
      const groups = new Set(prev.groups);
      (kind === "cat" ? cats : groups).delete(name);
      return { cats, groups };
    });

  const clearIndustry = () => {
    setIndSel(null); setCatPick(null); setCatOpen(false); setGrpOpen(false);
  };

  const hasAnyFilter = filters.length > 0 || marketSel != null || indSel != null;

  const resetAll = () => {
    setFilters([]); setMarketSel(null); clearIndustry(); setPickerOpen(false);
  };

  const priceDate = rows[0]?.price_date ?? null;

  // 산업 열은 산업 필터로 실제 선택(칩)이 있을 때만 표에 나타난다
  const showIndustry = indSel != null && (indSel.cats.size > 0 || indSel.groups.size > 0);
  // 열이 사라질 때 산업 정렬이 남아 있으면 기본 정렬로 되돌린다
  useEffect(() => {
    if (!showIndustry && sort.key === "industry") setSort({ key: "market_cap", dir: "desc" });
  }, [showIndustry, sort.key]);

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
        // 구글 아이콘 CSS가 .material-symbols-outlined에 font-size:24px를 걸어 로드 순서에 따라
        // Tailwind text-[..]가 밀린다 — 인라인 style은 항상 이기므로 크기는 여기서 지정
        style={{ fontSize: "11px" }}
        className="material-symbols-outlined text-outline hover:text-error transition-colors ml-auto sm:ml-0"
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
            {(marketSel != null || indSel != null || filters.length > 0) && (
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

                {indSel != null && (
                  <FilterRow label="산업" cat="기본" onRemove={clearIndustry}>
                    {/* everyticker식 2단 셀렉트: [대분류 ▾] → [세부 산업 ▾] 한 줄.
                        2차 목록 맨 위의 '전체'를 고르면 대분류째, 그룹을 고르면 그 그룹만 확정 —
                        확정된 항목은 아래 칩으로 쌓이고 셀렉트 박스는 다음 선택을 위해 비워진다. */}
                    <div className="flex-1 min-w-[260px]">
                      {/* 열린 동안 바깥 클릭을 받는 투명 배경 — 셀렉트 박스들은 z-50으로 그 위에 남긴다 */}
                      {(catOpen || grpOpen) && (
                        <div className="fixed inset-0 z-40" onClick={() => { setCatOpen(false); setGrpOpen(false); }} />
                      )}
                      <div className="flex items-center gap-1.5">
                        {/* 1차: 대분류 (하나 고르면 2차 목록이 열린다) */}
                        <div className={`relative flex-1 min-w-0 ${catOpen || grpOpen ? "z-50" : ""}`}>
                          <button
                            onClick={() => { setCatOpen(o => !o); setGrpOpen(false); }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-outline-variant bg-white text-xs text-left hover:border-primary transition-colors"
                          >
                            <span className={`truncate ${catPick ? "text-on-surface" : "text-outline"}`}>
                              {catPick ?? "산업 선택"}
                            </span>
                            <span className="material-symbols-outlined text-[16px] text-outline shrink-0">
                              {catOpen ? "expand_less" : "expand_more"}
                            </span>
                          </button>
                          {catOpen && (
                            <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-outline-variant bg-white shadow-lg">
                              {categories.map(c => {
                                const on = catPick === c.name;
                                return (
                                  <button
                                    key={c.name}
                                    onClick={() => { setCatPick(c.name); setCatOpen(false); setGrpOpen(true); }}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-container-low ${
                                      on ? "text-primary font-medium" : "text-on-surface"
                                    }`}
                                  >
                                    <span className="truncate">
                                      {c.name} <span className="text-outline font-normal">({c.count}개 기업)</span>
                                    </span>
                                    {on && <span className="material-symbols-outlined text-[15px] shrink-0">check</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <span className="material-symbols-outlined text-[16px] text-outline shrink-0">chevron_right</span>

                        {/* 2차: '전체' + 선택한 대분류의 산업 그룹 — 고르는 순간 칩으로 확정 */}
                        <div className={`relative flex-1 min-w-0 ${catOpen || grpOpen ? "z-50" : ""}`}>
                          <button
                            onClick={() => { if (catPick) { setGrpOpen(o => !o); setCatOpen(false); } }}
                            disabled={!catPick}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border text-xs text-left transition-colors ${
                              !catPick
                                ? "border-outline-variant/60 bg-surface-container-low text-outline cursor-not-allowed"
                                : "border-outline-variant bg-white hover:border-primary"
                            }`}
                          >
                            <span className="truncate text-outline">
                              {catPick ? "전체 또는 세부 산업 선택" : "세부 산업 선택"}
                            </span>
                            <span className="material-symbols-outlined text-[16px] text-outline shrink-0">
                              {grpOpen ? "expand_less" : "expand_more"}
                            </span>
                          </button>
                          {grpOpen && catPick && (() => {
                            const c = categories.find(x => x.name === catPick);
                            if (!c) return null;
                            return (
                              <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-outline-variant bg-white shadow-lg">
                                <button
                                  onClick={() => addIndustry("cat", c.name)}
                                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-surface-container-low border-b border-outline-variant/60"
                                >
                                  <span className="truncate">
                                    전체 <span className="text-outline font-normal">({c.count}개 기업)</span>
                                  </span>
                                </button>
                                {c.groups.map(g => (
                                  <button
                                    key={g.name}
                                    onClick={() => addIndustry("group", g.name)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-on-surface transition-colors hover:bg-surface-container-low"
                                  >
                                    <span className="truncate">
                                      {g.name} <span className="text-outline font-normal">({g.count}개 기업)</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 확정된 선택 칩 — '전체'는 대분류명, 그룹은 그룹명 */}
                      {(indSel.cats.size > 0 || indSel.groups.size > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[11px] text-outline">선택:</span>
                          {[...indSel.cats].map(c => (
                            <span key={`c:${c}`}
                                  className="inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] bg-primary-fixed text-on-primary-fixed font-medium">
                              {c}
                              <button onClick={() => removeIndustry("cat", c)} aria-label={`${c} 제거`}
                                      className="material-symbols-outlined text-[13px] leading-none hover:opacity-70">close</button>
                            </span>
                          ))}
                          {[...indSel.groups].map(g => (
                            <span key={`g:${g}`}
                                  className="inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full text-[11px] bg-primary-fixed text-on-primary-fixed font-medium">
                              {g}
                              <button onClick={() => removeIndustry("group", g)} aria-label={`${g} 제거`}
                                      className="material-symbols-outlined text-[13px] leading-none hover:opacity-70">close</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
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
                    {/* 기본 (시장·산업) */}
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
                            checked={indSel != null}
                            onChange={() => {
                              if (indSel != null) clearIndustry();
                              else setIndSel({ cats: new Set(), groups: new Set() });
                            }}
                            className="w-3.5 h-3.5 accent-primary shrink-0"
                          />
                          산업
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
                      선택 {filters.length + (marketSel != null ? 1 : 0) + (indSel != null ? 1 : 0)}개
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
                  {/* 산업 열 — primary 산업 그룹. 산업 필터가 걸려 있을 때만 표시 */}
                  {showIndustry && (
                    <th
                      onClick={() => toggleSort("industry")}
                      className={`text-right px-3 py-2.5 text-xs font-medium whitespace-nowrap cursor-pointer
                                  select-none transition-colors hover:text-primary ${
                                    sort.key === "industry" ? "text-primary" : "text-on-surface-variant"
                                  }`}
                    >
                      산업
                      {sort.key === "industry" && (
                        <span className="material-symbols-outlined text-[13px] align-[-2px] ml-0.5">
                          {sort.dir === "desc" ? "arrow_downward" : "arrow_upward"}
                        </span>
                      )}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, rowLimit).map(r => (
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
                    {showIndustry && (
                      <td className="text-right px-3 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                        {r.groupPrimary ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + (showIndustry ? 2 : 1)} className="px-4 py-12 text-center text-sm text-on-surface-variant">
                      {colsLoading
                        ? "지표를 불러오는 중입니다…"
                        : "조건에 맞는 종목이 없습니다. 필터를 완화해 보세요."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 표 행 더 그리기 — 데이터는 이미 브라우저에 있고 DOM만 나눠 그린다 */}
          {filtered.length > rowLimit && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setRowLimit(n => n + ROW_STEP)}
                className="inline-flex items-center gap-1.5 px-6 py-2 border border-outline-variant rounded-full
                           text-xs font-medium text-on-surface-variant bg-white hover:text-primary hover:border-primary transition-colors"
              >
                더보기
                <span className="text-outline">
                  ({Math.min(ROW_STEP, filtered.length - rowLimit)}개 더 · 남은 {filtered.length - rowLimit}종목)
                </span>
              </button>
            </div>
          )}

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
      <SiteFooter />
    </>
  );
}
