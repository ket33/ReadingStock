"use client";

// 뉴스룸 상단 주가 차트 — 주가 흐름 위에 뉴스 마커를 얹는다.
// 마커에 커서를 올리면 일자·제목 툴팁, 클릭하면 해당 기사 전문으로 이동.
//
// 구현 노트: recharts v3는 차트에 Scatter가 섞이면 축 호버 툴팁이 아이템 모드로
// 바뀌어 주가 툴팁이 안 뜬다(shared로도 복원 안 됨, 실측). 그래서 차트는 순수
// Area만 두고(워칭 수익률 차트와 동일 구성 → 툴팁 정상), 뉴스 마커는 축 도메인과
// 마진을 모두 우리가 지정하므로 같은 공식으로 픽셀 좌표를 계산해 HTML 오버레이로 얹는다.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CompanyNews } from "@/lib/types";
import { stripCompanyPrefix } from "@/lib/news-format";

const NAVY = "#16243f";
const SKY = "#4a8eff";
const CORAL = "#e5654b";   // 같은 날 뉴스가 2건 이상인 마커
const GRID = "#e7e8e9";
const AXIS = { fontSize: 12, fill: "#74777d" };

// 차트 지오메트리 — 오버레이 좌표 계산이 이 값들에 의존하므로 여기 한 곳에서만 관리
const M_TOP = 46;      // margin.top (마커가 위로 쌓일 공간)
const M_RIGHT = 8;     // margin.right
const YAXIS_W = 62;    // YAxis width
const XAXIS_H = 30;    // XAxis height

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
  t: number;       // epoch ms (x값)
  date: string;    // 'YYYY-MM-DD'
  close: number;
}

interface MarkerItem {
  id: number;
  title: string;   // 종목명 접두어 제거본
  date: string;    // 원 발행일 (표시용)
}

/** 거래일 하나당 마커 1개 — 같은 날 뉴스는 items로 묶는다 (최신이 앞) */
interface Marker {
  t: number;       // 마커를 붙인 거래일 epoch ms
  close: number;   // 그 날 종가
  items: MarkerItem[];
}

interface HoverTip {
  x: number;
  y: number;
  items: MarkerItem[];
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
      if (r.close != null) {
        const date = r.date as string;
        out.push({ t: Date.parse(date), date, close: Number(r.close) });
      }
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

export default function NewsPriceChart({ stockCode, companyName, news, onOpenNews }: {
  stockCode: string;
  companyName: string;
  news: CompanyNews[];
  onOpenNews: (id: number) => void;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [prices, setPrices] = useState<PricePoint[] | null>(null);
  const [hover, setHover] = useState<HoverTip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // 오버레이 좌표용 컨테이너 크기 추적
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // 뉴스 → 마커 (기간 내 거래일에 스냅). 같은 날 여러 건은 마커 하나로 묶는다.
  const markers = useMemo<Marker[]>(() => {
    if (!prices || prices.length === 0) return [];
    const dates = prices.map(p => p.date);
    const byIdx = new Map<number, Marker>();
    // 최신 기사가 items 앞에 오도록 내림차순으로 돈다
    for (const n of [...news].sort((a, b) => b.published_at.localeCompare(a.published_at))) {
      const d = n.published_at.slice(0, 10);
      if (d < dates[0]) continue;
      const i = snapIndex(dates, d);
      if (i < 0) continue;
      const item: MarkerItem = { id: n.id, title: stripCompanyPrefix(n.title, companyName), date: d };
      const existing = byIdx.get(i);
      if (existing) existing.items.push(item);
      else byIdx.set(i, { t: prices[i].t, close: prices[i].close, items: [item] });
    }
    return [...byIdx.values()];
  }, [prices, news, companyName]);

  const yDomain = useMemo<[number, number]>(() => {
    if (!prices || prices.length === 0) return [0, 1];
    const vals = prices.map(p => p.close);
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min || max * 0.1) * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }, [prices]);

  const shortRange = RANGES.find(r => r.key === range)!.days <= 183;
  const tickFmt = (t: number) => {
    const d = new Date(t).toISOString().slice(0, 10);
    return shortRange ? d.slice(5) : `${d.slice(2, 4)}.${d.slice(5, 7)}`;
  };

  // 마커 픽셀 좌표 — 차트와 동일한 도메인·마진으로 선형 변환
  const positioned = useMemo(() => {
    if (!prices || prices.length < 2 || !size) return [];
    const tMin = prices[0].t, tMax = prices[prices.length - 1].t;
    const [lo, hi] = yDomain;
    const plotW = size.w - YAXIS_W - M_RIGHT;
    const plotH = size.h - M_TOP - XAXIS_H;
    if (plotW <= 0 || plotH <= 0) return [];
    return markers.map(m => {
      const x = YAXIS_W + ((m.t - tMin) / (tMax - tMin || 1)) * plotW;
      const priceY = M_TOP + (1 - (m.close - lo) / (hi - lo || 1)) * plotH;
      const y = priceY - 13; // 종가점 위로 띄운다 (같은 날 여러 건도 마커 1개)
      return { m, x, y, priceY };
    });
  }, [prices, markers, size, yDomain]);

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary">
          주가 차트
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

      <div ref={wrapRef} className="relative h-72 w-full">
        {prices == null ? (
          <p className="text-sm text-outline pt-28 text-center">불러오는 중…</p>
        ) : prices.length < 2 ? (
          <p className="text-sm text-outline pt-28 text-center">이 기간의 주가 데이터가 부족해요.</p>
        ) : (
          <>
            {/* 순수 Area 차트 — Scatter 없음 → 축 호버 툴팁 정상 동작 */}
            <ResponsiveContainer>
              <AreaChart data={prices} margin={{ top: M_TOP, right: M_RIGHT, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="newsPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKY} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={SKY} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} height={XAXIS_H}
                       tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                       tickFormatter={tickFmt} minTickGap={56} />
                <YAxis domain={yDomain} tick={AXIS} tickLine={false} axisLine={false} width={YAXIS_W}
                       tickFormatter={fmtWon} />
                <Tooltip
                  cursor={{ stroke: "#c4c6cd", strokeDasharray: "3 3" }}
                  contentStyle={{ background: "#fff", border: "1px solid #c4c6cd", borderRadius: 4, fontSize: 13 }}
                  formatter={v => [`${fmtWon(Number(v))}원`, "종가"]}
                  labelFormatter={l => new Date(Number(l)).toISOString().slice(0, 10).replaceAll("-", ".")}
                />
                <Area dataKey="close" stroke={NAVY} strokeWidth={2}
                      fill="url(#newsPriceFill)" dot={false} activeDot={{ r: 3, fill: NAVY }}
                      isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>

            {/* 뉴스 마커 오버레이 — 종가점까지 연결선 + 원형 배지 (2건 이상인 날은 코랄색) */}
            {positioned.map(({ m, x, y, priceY }) => {
              const multi = m.items.length >= 2;
              const hovered = hover?.x === x && hover?.y === y;
              return (
                <div key={m.t}>
                  <span
                    className="absolute w-px bg-outline-variant pointer-events-none"
                    style={{ left: x, top: y + 9, height: Math.max(0, priceY - y - 9) }}
                  />
                  <button
                    onClick={() => onOpenNews(m.items[0].id)}
                    onMouseEnter={() => setHover({ x, y, items: m.items })}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${m.items[0].date} 뉴스 ${m.items.length}건`}
                    className="absolute w-[18px] h-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full
                               border-[1.5px] border-white shadow-sm flex items-center justify-center
                               transition-colors z-20 hover:z-30"
                    style={{ left: x, top: y, backgroundColor: hovered ? NAVY : multi ? CORAL : SKY }}
                  >
                    {/* 작은 신문 아이콘 (흰색) */}
                    <svg width="10" height="10" viewBox="0 0 11 11" className="pointer-events-none">
                      <rect x="1" y="1.5" width="9" height="8" rx="1" fill="none" stroke="#fff" strokeWidth="1.1" />
                      <rect x="2.5" y="3.2" width="2.6" height="2.2" fill="#fff" />
                      <line x1="6.2" y1="3.6" x2="8.6" y2="3.6" stroke="#fff" strokeWidth="1" />
                      <line x1="6.2" y1="5" x2="8.6" y2="5" stroke="#fff" strokeWidth="1" />
                      <line x1="2.5" y1="7" x2="8.6" y2="7" stroke="#fff" strokeWidth="1" />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* 마커 호버 툴팁: 그날 뉴스들을 [일자+제목] 블록으로 세로 나열 */}
            {hover && (
              <div
                className="absolute z-40 pointer-events-none bg-white border border-outline-variant rounded-lg
                           shadow-md px-3.5 py-2 w-max max-w-[26rem] divide-y divide-outline-variant/70"
                style={{
                  left: `clamp(0px, ${hover.x - 200}px, calc(100% - 26rem))`,
                  bottom: size ? size.h - hover.y + 12 : 0,
                }}
              >
                {hover.items.map(it => (
                  <div key={it.id} className="py-1.5 first:pt-0.5 last:pb-0.5">
                    <p className="text-[11px] text-on-surface-variant tabular-nums mb-0.5">
                      {it.date.replaceAll("-", ".")}
                    </p>
                    <p className="text-[12px] leading-snug text-on-surface">{it.title}</p>
                  </div>
                ))}
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
