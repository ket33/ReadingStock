"use client";

// 뉴스룸 상단 주가 차트 — 주가 흐름 위에 뉴스 마커를 얹는다.
// 마커에 커서를 올리면 일자·제목 툴팁, 클릭하면 해당 기사 전문으로 이동.
// 색은 사이트 무드(네이비 선 + 하늘색 면). 등락 색(빨강/파랑)은 기간 수익률 숫자에만 적용.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CompanyNews } from "@/lib/types";
import { stripCompanyPrefix } from "@/lib/news-format";

const NAVY = "#16243f";
const SKY = "#4a8eff";
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

interface PricePoint {
  date: string;
  close: number;
}

interface Marker {
  id: number;
  title: string;   // 종목명 접두어 제거본
  date: string;    // 원 발행일 (표시용)
  snapDate: string; // 마커를 붙인 거래일 (차트 x값)
  close: number;   // 그 날 종가 (차트 y값)
  stack: number;   // 같은 날 여러 건일 때 위로 쌓는 순번
}

interface HoverTip {
  x: number;
  y: number;
  date: string;
  title: string;
}

/** 일별 종가 — PostgREST 1,000행 하드캡 대비 2페이지까지 */
async function fetchPrices(stockCode: string, fromDate: string): Promise<PricePoint[]> {
  const sb = supabaseBrowser();
  const out: PricePoint[] = [];
  for (const page of [0, 1]) {
    const { data } = await sb.from("prices")
      .select("date,close")
      .eq("stock_code", stockCode)
      .gte("date", fromDate)
      .order("date", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    for (const r of data ?? []) {
      if (r.close != null) out.push({ date: r.date as string, close: Number(r.close) });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** 뉴스 일자를 '그 날 또는 직전 거래일' 인덱스로 스냅 (이진 탐색) */
function snapIndex(dates: string[], newsDate: string): number {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= newsDate) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

const fmtWon = (v: number) => `${Math.round(v).toLocaleString()}`;

// Scatter 커스텀 셰이프에 recharts가 넘겨주는 값 중 쓰는 것만
interface ShapeProps {
  cx?: number;
  cy?: number;
  payload?: { marker: Marker };
}

export default function NewsPriceChart({ stockCode, companyName, news, onOpenNews }: {
  stockCode: string;
  companyName: string;
  news: CompanyNews[];
  onOpenNews: (id: number) => void;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [prices, setPrices] = useState<PricePoint[] | null>(null);
  const [hover, setHover] = useState<HoverTip | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) { setPrices(null); setHover(null); }
      const days = RANGES.find(r => r.key === range)!.days;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const rows = await fetchPrices(stockCode, from);
      if (alive) setPrices(rows);
    })();
    return () => { alive = false; };
  }, [stockCode, range]);

  // 기간 수익률 (헤더 숫자에만 등락 색)
  const ret = useMemo(() => {
    if (!prices || prices.length < 2) return null;
    return (prices[prices.length - 1].close / prices[0].close - 1) * 100;
  }, [prices]);

  // 뉴스 → 마커 (기간 내 거래일에 스냅, 같은 날은 위로 쌓기)
  const markers = useMemo<Marker[]>(() => {
    if (!prices || prices.length === 0) return [];
    const dates = prices.map(p => p.date);
    const byIdx = new Map<number, number>();
    const out: Marker[] = [];
    for (const n of [...news].sort((a, b) => a.published_at.localeCompare(b.published_at))) {
      const d = n.published_at.slice(0, 10);
      if (d < dates[0]) continue;
      const i = snapIndex(dates, d);
      if (i < 0) continue;
      const stack = byIdx.get(i) ?? 0;
      byIdx.set(i, stack + 1);
      out.push({
        id: n.id,
        title: stripCompanyPrefix(n.title, companyName),
        date: d, snapDate: dates[i], close: prices[i].close, stack,
      });
    }
    return out;
  }, [prices, news, companyName]);

  const scatterData = useMemo(
    () => markers.map(m => ({ date: m.snapDate, close: m.close, marker: m })),
    [markers],
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (!prices || prices.length === 0) return [0, 1];
    const vals = prices.map(p => p.close);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min || max * 0.1) * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }, [prices]);

  const shortRange = RANGES.find(r => r.key === range)!.days <= 183;
  const tickFmt = (d: string) => (shortRange ? d.slice(5) : `${d.slice(2, 4)}.${d.slice(5, 7)}`);

  // 뉴스 마커 — 정확한 차트 좌표(cx, cy)에 그리는 커스텀 셰이프
  const renderMarker = (props: unknown) => {
    const { cx, cy, payload } = (props ?? {}) as ShapeProps;
    const m = payload?.marker;
    if (cx == null || cy == null || !m) return <g />;
    const y = cy - 16 - m.stack * 25; // 종가점 위로 띄우고, 같은 날은 위로 쌓기
    return (
      <g
        transform={`translate(${cx},${y})`}
        style={{ cursor: "pointer" }}
        onClick={() => onOpenNews(m.id)}
        onMouseEnter={() => setHover({ x: cx, y, date: m.date, title: m.title })}
        onMouseLeave={() => setHover(null)}
      >
        {/* 종가점까지 얇은 연결선 */}
        <line x1={0} y1={11} x2={0} y2={cy - y} stroke="#c4c6cd" strokeWidth={1} />
        <circle r={11} fill="#ffffff" stroke={hover?.x === cx && hover?.y === y ? SKY : "#9aa0a6"} strokeWidth={1.6} />
        {/* 작은 신문 아이콘 */}
        <g transform="translate(-5.5,-5.5)">
          <rect x="1" y="1.5" width="9" height="8" rx="1" fill="none" stroke="#44474c" strokeWidth="1" />
          <rect x="2.5" y="3.2" width="2.6" height="2.2" fill="#44474c" />
          <line x1="6.2" y1="3.6" x2="8.6" y2="3.6" stroke="#44474c" strokeWidth="0.9" />
          <line x1="6.2" y1="5" x2="8.6" y2="5" stroke="#44474c" strokeWidth="0.9" />
          <line x1="2.5" y1="7" x2="8.6" y2="7" stroke="#44474c" strokeWidth="0.9" />
        </g>
      </g>
    );
  };

  return (
    <section className="bg-white border border-outline-variant rounded-xl p-5 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary">
          주가와 뉴스
          {ret != null && (
            <span className={`ml-2 tabular-nums normal-case tracking-normal ${
              ret > 0 ? "text-stock-up" : ret < 0 ? "text-stock-down" : "text-on-surface-variant"
            }`}>
              {ret > 0 ? "+" : ""}{ret.toFixed(2)}%
            </span>
          )}
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

      <div className="relative h-72 w-full">
        {prices == null ? (
          <p className="text-sm text-outline pt-28 text-center">불러오는 중…</p>
        ) : prices.length < 2 ? (
          <p className="text-sm text-outline pt-28 text-center">이 기간의 주가 데이터가 부족해요.</p>
        ) : (
          <>
            <ResponsiveContainer>
              <ComposedChart data={prices} margin={{ top: 46, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="newsPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKY} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={SKY} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                       tickFormatter={tickFmt} minTickGap={56} />
                <YAxis domain={yDomain} tick={AXIS} tickLine={false} axisLine={false} width={62}
                       tickFormatter={fmtWon} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #c4c6cd", borderRadius: 4, fontSize: 13 }}
                  formatter={v => [`${fmtWon(Number(v))}원`, "종가"]}
                  labelFormatter={l => String(l ?? "").replaceAll("-", ".")}
                />
                <Area dataKey="close" stroke={NAVY} strokeWidth={2}
                      fill="url(#newsPriceFill)" dot={false} activeDot={{ r: 3, fill: NAVY }}
                      isAnimationActive={false} />
                {/* 뉴스 마커 — Tooltip 대상에서 제외되도록 tooltipType none */}
                <Scatter data={scatterData} dataKey="close" shape={renderMarker}
                         isAnimationActive={false} tooltipType="none" />
              </ComposedChart>
            </ResponsiveContainer>

            {/* 마커 호버 툴팁: 일자 + 제목 */}
            {hover && (
              <div
                className="absolute z-40 pointer-events-none bg-white border border-outline-variant rounded-lg
                           shadow-md px-3 py-2 w-60"
                style={{
                  left: `clamp(0px, ${hover.x - 120}px, calc(100% - 15rem))`,
                  top: Math.max(0, hover.y - 72),
                }}
              >
                <p className="text-[11px] text-on-surface-variant tabular-nums mb-0.5">
                  {hover.date.replaceAll("-", ".")}
                </p>
                <p className="text-[12px] leading-snug text-on-surface line-clamp-2">{hover.title}</p>
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-[11px] text-outline mt-2">
        * 마커는 뉴스가 나온 날의 종가 위치에 표시돼요. 눌러서 기사를 읽어보세요.
      </p>
    </section>
  );
}
