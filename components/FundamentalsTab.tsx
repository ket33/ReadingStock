"use client";

// 펀더멘탈 탭 — 4개 챕터(성장동력·수익성·재무건전성·주주수익).
// 각 챕터: 서술(fundamentals 테이블) + 근거 차트(metrics/financials 실측, 피어 비교).
// 피어 = 같은 산업 그룹 시총상위 본인+3(최대 4). 색: 본인=초록 강조, 피어=남색/파랑/주황.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { loadFundamentals, type FundamentalsData, type FyPoint, type Peer } from "@/lib/fundamentals-data";

const SELF = "#2f9e63";       // 본인 선(초록, 기존보다 연하게)
const SELF_FILL = "#8fd0aa";  // 본인 막대(더 연한 초록)
const NAVY = "#041627";
const BLUE = "#4a8eff";
const AMBER = "#e8710a";
const MUTE = "#d6d8dd";       // 피어 막대(연회색)
const GRID = "#eceded";
const AXIS = { fontSize: 11, fill: "#74777d" };
const PEER_COLORS = [NAVY, BLUE, AMBER];

function tip() {
  return { contentStyle: { background: "#fff", border: "1px solid #c4c6cd", borderRadius: 8, fontSize: 12 } };
}

function ChartCard({ title, caption, extra, tall, children }: {
  title: string; caption?: string; extra?: React.ReactNode; tall?: boolean; children: React.ReactNode;
}) {
  return (
    <figure className="bg-white border border-outline-variant rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="text-xs font-semibold tracking-wide uppercase text-primary">{title}</h4>
        {extra}
      </div>
      <div className={tall ? "h-64 w-full" : "h-52 w-full"}>{children}</div>
      {caption && <figcaption className="text-[11px] text-on-surface-variant mt-2 text-center">{caption}</figcaption>}
    </figure>
  );
}

// 색상: 본인=연한 초록, 나머지는 순서대로 남색/파랑/주황
function colorMap(peers: Peer[]): Record<string, string> {
  const m: Record<string, string> = {};
  let i = 0;
  for (const p of peers) m[p.code] = p.isSelf ? SELF : PEER_COLORS[i++ % PEER_COLORS.length];
  return m;
}

// ── 피어 비교 선그래프 (연도별, 최대 4사) ──
function PeerLine({ peers, fy, field, unit, scale = 1, dec = 0, colors }: {
  peers: Peer[]; fy: Record<string, FyPoint[]>; field: keyof FyPoint;
  unit: string; scale?: number; dec?: number; colors: Record<string, string>;
}) {
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const p of peers) for (const r of fy[p.code] ?? []) ys.add(r.year);
    return [...ys].sort((a, b) => a - b).slice(-5);
  }, [peers, fy]);
  const data = years.map(y => {
    const row: Record<string, number | null> = { year: y };
    for (const p of peers) {
      const v = (fy[p.code] ?? []).find(r => r.year === y)?.[field] as number | null | undefined;
      row[p.code] = v == null ? null : Number((v / scale).toFixed(dec));
    }
    return row;
  });
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: MUTE }} />
        <YAxis tick={AXIS} tickFormatter={(v: number) => `${v}${unit}`} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...tip()} formatter={(v, n) => [`${v}${unit}`, peers.find(p => p.code === n)?.name ?? n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => peers.find(p => p.code === v)?.name ?? v} />
        {peers.map(p => (
          <Line key={p.code} type="monotone" dataKey={p.code} name={p.code} stroke={colors[p.code]}
                strokeWidth={p.isSelf ? 3 : 1.6} dot={{ r: p.isSelf ? 3 : 2 }}
                activeDot={{ r: p.isSelf ? 5 : 4 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── 수익성 moat 막대 (지표 하나, 기업을 값 순위로, 본인 강조) ──
function MoatBar({ peers, ttm, field, title }: {
  peers: Peer[]; ttm: FundamentalsData["ttm"]; field: string; title: string;
}) {
  const items = peers
    .map(p => ({ name: p.name, isSelf: p.isSelf, value: (ttm[p.code] as unknown as Record<string, number | null>)?.[field] ?? null }))
    .filter(x => x.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number));
  return (
    <ChartCard title={title} caption="최근 TTM 기준, 단위: %">
      <ResponsiveContainer>
        <BarChart data={items} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: MUTE }} interval={0} />
          <YAxis tick={AXIS} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={40} />
          <Tooltip {...tip()} formatter={(v) => [`${v}%`, title]} cursor={{ fill: "#f3f4f6" }} />
          <Bar dataKey="value" radius={[8, 8, 8, 8]} maxBarSize={54}>
            {items.map((x, i) => <Cell key={i} fill={x.isSelf ? SELF_FILL : MUTE} />)}
            <LabelList dataKey="value" position="top" formatter={(v) => `${v}%`}
                       style={{ fontSize: 10, fill: "#74777d" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── ROE·ROCE 토글 선그래프 ──
function RoeRoce({ peers, fy, colors }: {
  peers: Peer[]; fy: Record<string, FyPoint[]>; colors: Record<string, string>;
}) {
  const [metric, setMetric] = useState<"roe" | "roce">("roe");
  return (
    <ChartCard title={metric === "roe" ? "ROE (자기자본이익률)" : "ROCE (사용자본이익률)"}
               caption={metric === "roe" ? "주주 돈 100으로 1년에 몇을 버는지, 단위: %" : "빌린 돈 포함 총자본 100으로 몇을 버는지, 단위: %"}
               extra={
                 <div className="flex gap-1">
                   {(["roe", "roce"] as const).map(m => (
                     <button key={m} onClick={() => setMetric(m)}
                             className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                               metric === m ? "bg-primary-fixed text-on-primary-fixed border-transparent"
                                            : "text-on-surface-variant border-outline-variant hover:text-primary"}`}>
                       {m.toUpperCase()}
                     </button>
                   ))}
                 </div>
               }>
      <PeerLine peers={peers} fy={fy} field={metric} unit="%" colors={colors} />
    </ChartCard>
  );
}

// ── 주주환원 막대 (배당+자사주매입, 10년, 본인) ──
function ShareholderBar({ data }: { data: FundamentalsData["shareholder"] }) {
  return (
    <ChartCard title="주주환원액 (배당 + 자사주매입)" caption="현금흐름표 실측, 최근 10년, 단위: 억 원" tall>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: MUTE }} />
          <YAxis tick={AXIS} tickFormatter={(v: number) => `${Math.round(v / 1000)}천`} tickLine={false} axisLine={false} width={40} />
          <Tooltip {...tip()} formatter={(v, n) => [`${Math.round(Number(v)).toLocaleString()}억`, n === "div" ? "배당" : "자사주매입"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "div" ? "배당" : "자사주매입")} />
          <Bar dataKey="div" name="div" stackId="a" fill={SELF_FILL} maxBarSize={40} />
          <Bar dataKey="buyback" name="buyback" stackId="a" fill={NAVY} fillOpacity={0.78} radius={[8, 8, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function Paras({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="text-[14px] leading-[1.8] text-on-surface-variant">{p.trim()}</p>
      ))}
    </div>
  );
}

const SECTIONS = [
  { id: "growth", label: "성장 동력" },
  { id: "profitability", label: "수익성" },
  { id: "health", label: "재무 건전성" },
  { id: "shareholder", label: "주주환원" },
] as const;

function Section({ id, title, body, children }: {
  id: string; title: string; body?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-20">
      <h3 className="font-sans text-[22px] font-extrabold tracking-tight text-primary mb-5">{title}</h3>
      {body ? <Paras text={body} /> : <p className="text-sm text-outline">서술 준비 중이에요.</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

// 챕터 하위탭 — 클릭 시 해당 섹션으로 부드럽게 이동 (스크롤 위치 따라 활성 표시)
function ChapterNav({ active, onJump }: { active: string; onJump: (id: string) => void }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2 border-b border-outline-variant pb-4">
      {SECTIONS.map(s => (
        <button key={s.id} onClick={() => onJump(s.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active === s.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-low text-on-surface-variant hover:text-primary"}`}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

export default function FundamentalsTab({ stockCode }: { stockCode: string }) {
  const [d, setD] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("growth");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadFundamentals(supabaseBrowser(), stockCode)
      .then(res => { if (alive) setD(res); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [stockCode]);

  // 스크롤 위치에 따라 활성 챕터 추적 (하위탭 하이라이트)
  useEffect(() => {
    if (!d) return;
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [d]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (loading) return <div className="py-24 text-center text-sm text-outline">불러오는 중…</div>;
  if (!d || Object.keys(d.narratives).length === 0)
    return <div className="py-24 text-center text-on-surface-variant">아직 이 종목의 펀더멘탈 분석이 없어요.</div>;

  const { peers, fy, ttm, narratives, shareholder } = d;
  const colors = colorMap(peers);
  const writtenAt = d.createdAt
    ? new Date(d.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="article-canvas">
      {writtenAt && <p className="text-xs text-outline mb-3">{writtenAt}에 작성되었습니다.</p>}

      <ChapterNav active={active} onJump={jump} />

      {/* 1. 성장동력 */}
      <Section id="growth" title="성장 동력" body={narratives.growth}>
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="매출액" caption="연간, 단위: 조 원">
            <PeerLine peers={peers} fy={fy} field="revenue" unit="조" scale={1e12} dec={1} colors={colors} />
          </ChartCard>
          <ChartCard title="매출 성장률 (YoY)" caption="전년 대비, 단위: %">
            <PeerLine peers={peers} fy={fy} field="revenue_growth" unit="%" colors={colors} />
          </ChartCard>
        </div>
      </Section>

      {/* 2. 수익성 */}
      <Section id="profitability" title="수익성" body={narratives.profitability}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MoatBar peers={peers} ttm={ttm} field="gross_margin" title="매출총이익률" />
          <MoatBar peers={peers} ttm={ttm} field="op_margin" title="영업이익률" />
          <MoatBar peers={peers} ttm={ttm} field="net_margin" title="순이익률" />
          <MoatBar peers={peers} ttm={ttm} field="fcf_margin" title="FCF 마진" />
          <MoatBar peers={peers} ttm={ttm} field="capex_sales" title="Capex / 매출" />
          <RoeRoce peers={peers} fy={fy} colors={colors} />
        </div>
      </Section>

      {/* 3. 재무건전성 */}
      <Section id="health" title="재무 건전성" body={narratives.health}>
        <div className="grid gap-4 md:grid-cols-3">
          <ChartCard title="부채비율" caption="부채 / 자기자본, 단위: %">
            <PeerLine peers={peers} fy={fy} field="debt_equity" unit="%" colors={colors} />
          </ChartCard>
          <ChartCard title="이자보상배율" caption="영업이익 / 이자비용, 단위: 배">
            <PeerLine peers={peers} fy={fy} field="interest_cov" unit="배" dec={1} colors={colors} />
          </ChartCard>
          <ChartCard title="유동비율" caption="유동자산 / 유동부채, 단위: %">
            <PeerLine peers={peers} fy={fy} field="current_ratio" unit="%" colors={colors} />
          </ChartCard>
        </div>
      </Section>

      {/* 4. 주주환원 */}
      <Section id="shareholder" title="주주환원" body={narratives.shareholder}>
        <div className="grid gap-4 md:grid-cols-2">
          <ChartCard title="FCF 수익률" caption={`${peers[0]?.name ?? ""} 단독, 시총 대비 FCF, 단위: %`}>
            <PeerLine peers={peers.slice(0, 1)} fy={fy} field="fcf_yield" unit="%" dec={1} colors={colors} />
          </ChartCard>
          <ShareholderBar data={shareholder} />
        </div>
      </Section>
    </div>
  );
}
