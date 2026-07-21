"use client";

// 워치리스트 성과 — 담은 종목을 설정 비중(기본 동일가중)으로 묶은 누적 수익률 차트
// + 시장지표(코스피·코스닥·S&P500·나스닥) 비교선 (사용자가 켜고 끔, localStorage 기억)
//
// 지수 산식: 일별 리밸런싱 체인링크. 날짜별로 데이터가 있는 종목만으로
// (비중을 그 종목들 합으로 재정규화해) 가중평균 수익률을 이어 붙인다.
// 신규 상장 종목은 값이 생기는 날부터 자연스럽게 편입된다.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";

const GREEN = "#006e25";
const GRID = "#e7e8e9";
const AXIS = { fontSize: 12, fill: "#74777d" };

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
  { key: "3Y", days: 1096 },
  { key: "5Y", days: 1827 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

// 시장지표 비교선 (market_indices 테이블)
const BENCHMARKS = [
  { code: "KS11", label: "코스피", color: "#041627" },
  { code: "KQ11", label: "코스닥", color: "#4a8eff" },
  { code: "US500", label: "S&P500", color: "#e8710a" },
  { code: "IXIC", label: "나스닥", color: "#8e24aa" },
] as const;
const BENCH_LS_KEY = "watchlist-benchmarks";

export interface PerfItem {
  code: string;
  weight: number | null; // 구성비율(%). null = 동일가중 취급
}

interface ChartRow {
  date: string;
  [series: string]: string | number | null | undefined;
}

/** (date → close) 시계열 — PostgREST 1,000행 하드캡 대비 2페이지까지 */
async function fetchCloses(
  table: "prices" | "market_indices", keyCol: string, keyVal: string, fromDate: string,
): Promise<Map<string, number>> {
  const sb = supabaseBrowser();
  const out = new Map<string, number>();
  for (const page of [0, 1]) {
    const { data } = await sb.from(table)
      .select("date,close")
      .eq(keyCol, keyVal)
      .gte("date", fromDate)
      .order("date", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    for (const r of data ?? []) {
      if (r.close != null) out.set(r.date as string, Number(r.close));
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** 가중(일별 리밸런싱) 포트폴리오 누적 수익률: date → ret(%) */
function buildPortfolio(series: { closes: Map<string, number>; weight: number }[]): Map<string, number> {
  const dates = [...new Set(series.flatMap(s => [...s.closes.keys()]))].sort();
  const out = new Map<string, number>();
  if (dates.length < 2) return out;
  const last = series.map(() => null as number | null);
  let index = 100;
  let first = true;
  for (const d of dates) {
    let wSum = 0;
    let growth = 0;
    series.forEach((s, i) => {
      const p = s.closes.get(d);
      if (p == null) return;
      if (last[i] != null) {
        wSum += s.weight;
        growth += s.weight * (p / (last[i] as number));
      }
      last[i] = p;
    });
    if (first) {
      out.set(d, 0);
      first = false;
      continue;
    }
    if (wSum > 0) index *= growth / wSum;
    out.set(d, Math.round((index - 100) * 100) / 100);
  }
  return out;
}

/** 단일 지수의 누적 수익률: date → ret(%) (기간 첫 값 기준) */
function buildBenchmark(closes: Map<string, number>): Map<string, number> {
  const dates = [...closes.keys()].sort();
  const out = new Map<string, number>();
  if (dates.length < 2) return out;
  const base = closes.get(dates[0])!;
  for (const d of dates) {
    out.set(d, Math.round((closes.get(d)! / base - 1) * 10000) / 100);
  }
  return out;
}

/** 렌더 부담을 줄이기 위해 최대 개수로 솎아낸다 (마지막 행은 항상 유지) */
function thin(rows: ChartRow[], max = 250): ChartRow[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const out = rows.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function WatchlistPerformance({ items, listName }: { items: PerfItem[]; listName: string }) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [benchOpen, setBenchOpen] = useState(false);
  const benchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (benchRef.current && !benchRef.current.contains(e.target as Node)) setBenchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  // 비교선 선택은 localStorage에 기억 (이 컴포넌트는 클라이언트 데이터 로드 후에만 그려짐)
  const [bench, setBench] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(localStorage.getItem(BENCH_LS_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        return saved.filter((c: unknown): c is string => BENCHMARKS.some(b => b.code === c));
      }
    } catch { /* 무시 */ }
    return [];
  });
  const [rows, setRows] = useState<ChartRow[] | null>(null);
  const toggleBench = (code: string) => {
    setBench(prev => {
      const next = prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code];
      try { localStorage.setItem(BENCH_LS_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  };

  const key = items.map(i => `${i.code}:${i.weight ?? ""}`).join(",") + "|" + bench.join(",");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (items.length === 0) { if (alive) setRows([]); return; }
      if (alive) setRows(null); // 로딩 표시
      const days = RANGES.find(r => r.key === range)!.days;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

      // 종목 비중: null(동일가중)은 1로, 지정값은 그대로 (계산 시 합으로 정규화되므로 절대값 무관)
      const hasCustom = items.some(i => i.weight != null && i.weight > 0);
      const stockSeries = await Promise.all(items.map(async i => ({
        closes: await fetchCloses("prices", "stock_code", i.code, from),
        weight: hasCustom ? (i.weight ?? 0) : 1, // 비중 설정 시 미지정 종목은 제외(0)
      })));
      const port = buildPortfolio(stockSeries.filter(s => s.closes.size > 0 && s.weight > 0));

      const benchSeries = await Promise.all(bench.map(async code => ({
        code,
        rets: buildBenchmark(await fetchCloses("market_indices", "index_code", code, from)),
      })));

      // 날짜 합집합으로 차트 행 구성 (없는 날은 null → connectNulls로 이어 그림)
      const allDates = [...new Set([
        ...port.keys(),
        ...benchSeries.flatMap(b => [...b.rets.keys()]),
      ])].sort();
      const merged: ChartRow[] = allDates.map(d => {
        const row: ChartRow = { date: d, port: port.get(d) ?? null };
        for (const b of benchSeries) row[b.code] = b.rets.get(d) ?? null;
        return row;
      });
      if (alive) setRows(merged);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  const data = useMemo(() => thin(rows ?? []), [rows]);
  const total = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i].port;
      if (typeof v === "number") return v;
    }
    return null;
  }, [data]);
  const shortRange = RANGES.find(r => r.key === range)!.days <= 183;
  const tickFmt = (d: string) => (shortRange ? d.slice(5) : `${d.slice(2, 4)}.${d.slice(5, 7)}`);
  const seriesLabel = (k: string) =>
    k === "port" ? "내 워치리스트" : BENCHMARKS.find(b => b.code === k)?.label ?? k;

  if (items.length === 0) return null;

  return (
    <section className="bg-white border border-outline-variant rounded-xl p-5 mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        {/* 제목 + 총수익률 */}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-primary truncate">
            {listName} 수익률
          </h2>
          {total != null && (
            <p className={`text-lg font-semibold tabular-nums mt-1 ${
              total > 0 ? "text-stock-up" : total < 0 ? "text-stock-down" : "text-on-surface"
            }`}>
              {fmtPct(total)}
            </p>
          )}
        </div>

        {/* 오른쪽: 기간 + 그 아래 시장지표 비교 드롭다운 */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-1">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors ${
                  range === r.key
                    ? "bg-primary-fixed text-on-primary-fixed border-transparent"
                    : "text-on-surface-variant border-outline-variant hover:text-primary"
                }`}
              >
                {r.key}
              </button>
            ))}
          </div>

          <div ref={benchRef} className="relative">
            <button
              onClick={() => setBenchOpen(o => !o)}
              className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                benchOpen || bench.length > 0
                  ? "border-primary text-primary"
                  : "border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">show_chart</span>
              시장지표 비교{bench.length > 0 ? ` ${bench.length}` : ""}
              <span className="material-symbols-outlined text-[14px]">expand_more</span>
            </button>
            {benchOpen && (
              <div className="absolute right-0 z-30 mt-1 w-40 bg-white border border-outline-variant rounded-lg shadow-lg py-1">
                {BENCHMARKS.map(b => {
                  const on = bench.includes(b.code);
                  return (
                    <button
                      key={b.code}
                      onClick={() => toggleBench(b.code)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="flex-1 text-left">{b.label}</span>
                      {on && (
                        <span className="material-symbols-outlined text-[16px]" style={{ color: b.color }}>check</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        {rows == null ? (
          <p className="text-sm text-outline pt-24 text-center">불러오는 중…</p>
        ) : data.length < 2 ? (
          <p className="text-sm text-outline pt-24 text-center">이 기간의 주가 데이터가 부족해요.</p>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                     tickFormatter={tickFmt} minTickGap={48} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52}
                     tickFormatter={(v: number) => fmtPct(v)} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff", border: "1px solid #c4c6cd",
                  borderRadius: 2, fontSize: 13,
                }}
                formatter={(v, name) => [fmtPct(Number(v)), seriesLabel(String(name))]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => seriesLabel(v)} />
              <ReferenceLine y={0} stroke="#c4c6cd" />
              <Line dataKey="port" stroke={GREEN} strokeWidth={2.5} dot={false} connectNulls />
              {bench.map(code => {
                const b = BENCHMARKS.find(x => x.code === code)!;
                return (
                  <Line key={code} dataKey={code} stroke={b.color} strokeWidth={1.5}
                        strokeDasharray="4 3" dot={false} connectNulls />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-outline mt-3">
        * 설정한 구성비율(미설정 시 동일가중)로 매일 리밸런싱한 가격 수익률(배당 미반영).
        기간 중 상장한 종목은 상장일부터 반영. 시장지표는 각 지수의 기간 시작일 대비 수익률.
      </p>
    </section>
  );
}
