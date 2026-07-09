"use client";

// 탭 2: 요약 — metrics 테이블의 지표 전체(26개)를 6개 그룹으로, ⓘ 용어 풀이 포함
// (1단계 검증 때 정한 그룹: 밸류에이션·수익성·재무건전성·현금흐름·자본배분·효율성)
import type { MetricsRow } from "@/lib/types";
import { formatMetric } from "@/lib/format";

interface CardSpec {
  key: keyof MetricsRow;
  name: string;
  unit: string;
  tooltip: string;
}

const GROUPS: { title: string; cards: CardSpec[] }[] = [
  {
    title: "밸류에이션",
    cards: [
      { key: "per", name: "PER", unit: "배",
        tooltip: "지금 주가로 회사를 통째로 샀을 때, 현재 이익 속도로 원금을 뽑는 데 걸리는 햇수" },
      { key: "pbr", name: "PBR", unit: "배",
        tooltip: "회사가 가진 순자산(자본) 대비 주가가 몇 배인지" },
      { key: "div_yield", name: "배당수익률", unit: "%",
        tooltip: "지금 주가로 사면 1년 배당으로 몇 %를 돌려받는지" },
      { key: "price_fcf", name: "P/FCF", unit: "배",
        tooltip: "시가총액이 1년 잉여현금흐름(FCF)의 몇 배인지. PER의 현금 버전" },
    ],
  },
  {
    title: "수익성",
    cards: [
      { key: "gross_margin", name: "매출총이익률", unit: "%",
        tooltip: "만원어치 팔면 원가 빼고 몇 원 남는지" },
      { key: "op_margin", name: "영업이익률", unit: "%",
        tooltip: "만원어치 팔면 본업에서 최종적으로 몇 원 남기는지" },
      { key: "net_margin", name: "순이익률", unit: "%",
        tooltip: "이자·세금까지 다 내고 남는 비율" },
      { key: "roe", name: "ROE", unit: "%",
        tooltip: "주주 돈 100으로 1년에 몇을 벌었는지. 예금 이자율과 비교해보면 감이 온다" },
      { key: "roa", name: "ROA", unit: "%",
        tooltip: "빚까지 포함한 전체 자산 100으로 몇을 벌었는지" },
    ],
  },
  {
    title: "재무건전성",
    cards: [
      { key: "current_ratio", name: "유동비율", unit: "%",
        tooltip: "1년 안에 갚을 빚 대비, 1년 안에 현금화할 자산이 몇 %인지" },
      { key: "debt_equity", name: "부채/자본", unit: "%",
        tooltip: "내 돈(자본) 대비 빚(부채)이 몇 %인지" },
      { key: "debt_assets", name: "부채/자산", unit: "%",
        tooltip: "전체 자산 중 빚으로 조달한 비중" },
      { key: "interest_cov", name: "이자보상배율", unit: "배",
        tooltip: "영업이익이 이자비용의 몇 배인지. 1배 미만이면 번 돈으로 이자도 못 낸다는 뜻" },
    ],
  },
  {
    title: "현금흐름",
    cards: [
      { key: "fcf_yield", name: "FCF수익률", unit: "%",
        tooltip: "시가총액 대비 1년간 실제로 손에 쥔 현금(FCF)의 비율" },
      { key: "ocf_margin", name: "영업현금흐름마진", unit: "%",
        tooltip: "매출 만원당 실제 통장에 들어온 현금" },
      { key: "ocf_ni", name: "영업현금흐름/순이익", unit: "배",
        tooltip: "장부상 이익이 실제 현금으로 얼마나 뒷받침되는지. 1배 근처면 건강" },
    ],
  },
  {
    title: "자본배분",
    cards: [
      { key: "payout", name: "배당성향", unit: "%",
        tooltip: "번 이익 중 배당으로 주주에게 돌려주는 비율" },
      { key: "retention", name: "유보율", unit: "%",
        tooltip: "번 이익 중 회사에 남겨 재투자하는 비율 (100% − 배당성향)" },
      { key: "capex_sales", name: "Capex/매출", unit: "%",
        tooltip: "매출 대비 설비투자 비중. 높으면 미래를 위해 크게 쓰는 중" },
      { key: "rnd_intensity", name: "R&D집약도", unit: "%",
        tooltip: "매출 대비 연구개발비 비중" },
      { key: "sga_sales", name: "판관비/매출", unit: "%",
        tooltip: "매출 대비 판매·관리비(마케팅·인건비 등) 비중" },
    ],
  },
  {
    title: "효율성",
    cards: [
      { key: "asset_turn", name: "자산회전율", unit: "회",
        tooltip: "자산 100으로 매출을 몇 번 만드는지. 높을수록 자산을 알차게 굴린다는 뜻" },
      { key: "ppe_turn", name: "유형자산회전율", unit: "회",
        tooltip: "공장·설비 100으로 매출을 몇 번 만드는지" },
      { key: "inv_turn", name: "재고회전율", unit: "회",
        tooltip: "재고가 1년에 몇 번 팔려나가는지. 낮아지면 재고가 쌓이는 신호" },
      { key: "recv_turn", name: "매출채권회전율", unit: "회",
        tooltip: "외상값(매출채권)을 1년에 몇 번 회수하는지" },
      { key: "wc_turn", name: "운전자본회전율", unit: "회",
        tooltip: "운전자본(유동자산−유동부채)으로 매출을 몇 번 만드는지" },
    ],
  },
];

export default function SummaryTab({ latest }: {
  latest: MetricsRow & { label: string };
  fyMetrics: MetricsRow[];
}) {
  return (
    <div className="max-w-[880px] mx-auto">
      <h1 className="font-serif text-3xl font-semibold text-primary mb-2">핵심 지표 요약</h1>
      <p className="text-sm text-on-surface-variant mb-10">
        기준: {latest.label} · ⓘ에 마우스를 올리면 용어 설명이 보입니다
      </p>

      {GROUPS.map(group => (
        <section key={group.title} className="mb-10">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-4 border-l-4 border-primary pl-3">
            {group.title}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.cards.map(card => {
              const raw = latest[card.key];
              const v = typeof raw === "number" ? raw : null;
              return (
                <div key={card.name}
                     className="bg-white border border-outline-variant rounded-sm p-5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[13px] font-medium text-on-surface-variant">{card.name}</span>
                    <span className="text-outline cursor-help text-[13px] leading-none"
                          title={card.tooltip}>ⓘ</span>
                  </div>
                  <div className="font-serif text-2xl text-primary">
                    {v != null ? formatMetric(v, card.unit) : (
                      <span className="text-outline text-base">— 해당 없음</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-outline mt-4">
        “해당 없음”은 업종 특성상 계산되지 않는 지표입니다 (예: 금융업의 재고회전율).
      </p>
    </div>
  );
}
