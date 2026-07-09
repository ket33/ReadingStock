"use client";

// 분석글 본문의 〔차트 N〕 자리에 들어가는 실제 차트 5종 (Recharts)
// 색: 재무 추세는 디자인 브랜드색(초록 #006e25) 기본 — 등락 관례(빨강/파랑)는 주가에만 적용
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { ChartData } from "@/lib/types";

const GREEN = "#006e25";
const NAVY = "#041627";
const BLUE = "#4a8eff";
const GRID = "#e7e8e9";

const AXIS = { fontSize: 12, fill: "#74777d" };

function Card({ title, caption, children }: {
  title: string; caption?: string; children: React.ReactNode;
}) {
  return (
    <figure className="bg-white border border-outline-variant rounded-sm p-5 my-8 not-prose">
      <h4 className="text-sm font-semibold tracking-widest uppercase text-primary mb-4">{title}</h4>
      <div className="h-64 w-full">{children}</div>
      {caption && (
        <figcaption className="text-xs text-on-surface-variant mt-3 italic text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const joFmt = (v: number) => `${v}조`;
const pctFmt = (v: number) => `${v}%`;

function tooltipStyle() {
  return {
    contentStyle: {
      background: "#ffffff", border: "1px solid #c4c6cd",
      borderRadius: 2, fontSize: 13,
    },
  };
}

export function ChartRevenueOp({ data }: { data: ChartData["revenueOp"] }) {
  return (
    <Card title="매출 · 영업이익"
          caption="연간 연결 기준, 단위: 조 원 — 매출은 왼쪽 축, 영업이익은 오른쪽 축 (출처: DART)">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          {/* 매출(막대)과 영업이익(선)은 규모 차이가 커서 축을 분리 — 선이 평탄해 보이는 문제 방지 */}
          <YAxis yAxisId="rev" tick={AXIS} tickFormatter={joFmt} tickLine={false} axisLine={false} width={48} />
          <YAxis yAxisId="op" orientation="right" tick={{ ...AXIS, fill: NAVY }}
                 tickFormatter={joFmt} tickLine={false} axisLine={false} width={48} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}조 원`]} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar yAxisId="rev" name="매출액 (좌)" dataKey="revenue" fill={GREEN} fillOpacity={0.22} />
          <Line yAxisId="op" name="영업이익 (우)" dataKey="op" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChartMargins({ data }: { data: ChartData["margins"] }) {
  return (
    <Card title="매출총이익률 · 영업이익률 · 순이익률" caption="단위: %">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          <YAxis tick={AXIS} tickFormatter={pctFmt} tickLine={false} axisLine={false} width={44} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}%`]} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line name="매출총이익률" dataKey="gross" stroke={NAVY} strokeWidth={2} dot={{ r: 2.5 }} />
          <Line name="영업이익률" dataKey="op" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
          <Line name="순이익률" dataKey="net" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChartRoe({ data }: { data: ChartData["roe"] }) {
  return (
    <Card title="ROE (자기자본이익률)" caption="주주 돈 100으로 1년에 몇을 벌었는지, 단위: %">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          <YAxis tick={AXIS} tickFormatter={pctFmt} tickLine={false} axisLine={false} width={44} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}%`, "ROE"]} />
          <Line dataKey="roe" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChartCashflow({ data }: { data: ChartData["cashflow"] }) {
  return (
    <Card title="영업현금흐름 · FCF" caption="FCF = 영업현금흐름 − 설비투자, 단위: 조 원">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          <YAxis tick={AXIS} tickFormatter={joFmt} tickLine={false} axisLine={false} width={48} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}조 원`]} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar name="영업현금흐름" dataKey="ocf" fill={GREEN} fillOpacity={0.22} />
          <Line name="FCF" dataKey="fcf" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChartPer({ data }: { data: ChartData["per"] }) {
  return (
    <Card title="PER 추이 (최근 3년)" caption="분기 시점은 TTM(최근 4개 분기 합) 기준, 단위: 배">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          <YAxis tick={AXIS} tickFormatter={(v: number) => `${v}배`} tickLine={false} axisLine={false} width={48} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}배`, "PER"]} />
          <Line dataKey="per" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChartRoeRoa({ data }: { data: ChartData["roe"] }) {
  // 금융사용: 마진 개념이 없어 ROE·ROA를 함께 본다.
  // 은행은 자산(예금 포함)이 거대해 ROA가 ROE의 1/10 수준 → 축 분리.
  return (
    <Card title="ROE · ROA"
          caption="ROE(주주 돈 기준 수익률)는 왼쪽 축, ROA(전체 자산 기준)는 오른쪽 축, 단위: % — 은행은 예금이 자산에 잡혀 ROA가 낮은 게 정상">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c4c6cd" }} />
          <YAxis yAxisId="roe" tick={{ ...AXIS, fill: GREEN }} tickFormatter={pctFmt}
                 tickLine={false} axisLine={false} width={44} />
          <YAxis yAxisId="roa" orientation="right" tick={{ ...AXIS, fill: NAVY }}
                 tickFormatter={pctFmt} tickLine={false} axisLine={false} width={44} />
          <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}%`]} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line yAxisId="roe" name="ROE (좌)" dataKey="roe" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
          <Line yAxisId="roa" name="ROA (우)" dataKey="roa" stroke={NAVY} strokeWidth={2} dot={{ r: 2.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** 〔차트 N〕 번호 → 차트 컴포넌트.
 *  금융사(isFinancial)는 마진 개념이 없어 ②를 ROE·ROA 통합차트로 대체하고 ③은 두지 않는다. */
export function ChartByNumber({ n, charts, isFinancial = false }: {
  n: number; charts: ChartData; isFinancial?: boolean;
}) {
  if (isFinancial) {
    switch (n) {
      case 1: return <ChartRevenueOp data={charts.revenueOp} />;
      case 2: return <ChartRoeRoa data={charts.roe} />;
      case 3: return null; // ②에 통합됨 (옛 글의 ③ 마커는 조용히 무시)
      case 5: return <ChartPer data={charts.per} />;
      default: return null; // ④(현금흐름)는 금융사에 해당 없음
    }
  }
  switch (n) {
    case 1: return <ChartRevenueOp data={charts.revenueOp} />;
    case 2: return <ChartMargins data={charts.margins} />;
    case 3: return <ChartRoe data={charts.roe} />;
    case 4: return <ChartCashflow data={charts.cashflow} />;
    case 5: return <ChartPer data={charts.per} />;
    default: return null;
  }
}
