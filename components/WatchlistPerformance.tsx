"use client";

// 워치리스트 성과 — 담은 종목을 동일가중으로 묶은 누적 수익률 차트 (기간 선택)
// 지수 산식: 일별 리밸런싱 동일가중 체인링크 (신규 상장 등으로 데이터가 없는 종목은
// 값이 생기는 날부터 자연스럽게 편입되고, 그 전 구간은 나머지 종목만으로 계산)
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
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

interface Point {
  date: string; // 'YYYY-MM-DD'
  ret: number;  // 시작일 대비 누적 수익률(%)
}

/** 한 종목의 (date, close) 시계열 — PostgREST 1,000행 하드캡 대비 2페이지까지 */
async function fetchSeries(code: string, fromDate: string): Promise<Map<string, number>> {
  const sb = supabaseBrowser();
  const out = new Map<string, number>();
  for (const page of [0, 1]) {
    const { data } = await sb.from("prices")
      .select("date,close")
      .eq("stock_code", code)
      .gte("date", fromDate)
      .order("date", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    for (const r of data ?? []) {
      if (r.close != null) out.set(r.date as string, r.close as number);
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** 동일가중(일별 리밸런싱) 지수: index_t = index_{t-1} × mean(p_t / p_{t-1}) */
function buildIndex(seriesList: Map<string, number>[]): Point[] {
  const dates = [...new Set(seriesList.flatMap(s => [...s.keys()]))].sort();
  if (dates.length < 2) return [];
  const last = seriesList.map(() => null as number | null); // 종목별 직전 종가 (전일 휴장분 보간)
  const points: Point[] = [];
  let index = 100;
  for (const d of dates) {
    const ratios: number[] = [];
    seriesList.forEach((s, i) => {
      const p = s.get(d);
      if (p == null) return;
      if (last[i] != null) ratios.push(p / (last[i] as number));
      last[i] = p;
    });
    if (points.length === 0) {
      points.push({ date: d, ret: 0 });
      continue;
    }
    if (ratios.length > 0) {
      index *= ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
    points.push({ date: d, ret: Math.round((index - 100) * 100) / 100 });
  }
  return points;
}

/** 렌더 부담을 줄이기 위해 최대 개수로 솎아낸다 (마지막 점은 항상 유지) */
function thin(points: Point[], max = 250): Point[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function WatchlistPerformance({ codes }: { codes: string[] }) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [points, setPoints] = useState<Point[] | null>(null);

  const key = codes.join(","); // 배열 identity 대신 내용으로 변경 감지
  useEffect(() => {
    let alive = true;
    (async () => {
      if (codes.length === 0) { if (alive) setPoints([]); return; }
      if (alive) setPoints(null); // 로딩 표시
      const days = RANGES.find(r => r.key === range)!.days;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const seriesList = await Promise.all(codes.map(c => fetchSeries(c, from)));
      if (alive) setPoints(buildIndex(seriesList.filter(s => s.size > 0)));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  const data = useMemo(() => thin(points ?? []), [points]);
  const total = data.length > 0 ? data[data.length - 1].ret : null;
  const shortRange = RANGES.find(r => r.key === range)!.days <= 183;
  const tickFmt = (d: string) => (shortRange ? d.slice(5) : `${d.slice(2, 4)}.${d.slice(5, 7)}`);

  if (codes.length === 0) return null;

  return (
    <section className="bg-white border border-outline-variant rounded-xl p-5 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary">
          워치리스트 성과
        </h2>
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
      </div>

      {total != null && (
        <p className={`text-lg font-semibold tabular-nums mb-3 ${
          total > 0 ? "text-stock-up" : total < 0 ? "text-stock-down" : "text-on-surface"
        }`}>
          {fmtPct(total)}
        </p>
      )}

      <div className="h-56 w-full">
        {points == null ? (
          <p className="text-sm text-outline pt-20 text-center">불러오는 중…</p>
        ) : data.length < 2 ? (
          <p className="text-sm text-outline pt-20 text-center">이 기간의 주가 데이터가 부족해요.</p>
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
                formatter={v => [fmtPct(Number(v)), "누적 수익률"]}
              />
              <ReferenceLine y={0} stroke="#c4c6cd" />
              <Line dataKey="ret" stroke={GREEN} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-outline mt-3">
        * 담은 종목을 같은 비중으로 묶었을 때의 가격 수익률(배당 미반영). 기간 중 상장한 종목은 상장일부터 반영.
      </p>
    </section>
  );
}
