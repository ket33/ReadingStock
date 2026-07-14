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
import { formatKrw } from "@/lib/format";
import SiteHeader from "./SiteHeader";

// ── 지표 카탈로그 (필터·컬럼·표기의 단일 원천) ─────────────────
// fmt: krw=조/억 표기, pct=%, x=배, won=원, turn=회,
//      growth=부호+% (＋초록/－파랑 — 홈 카드의 성장률 관례),
//      ret=부호+% (＋빨강/－파랑 — 한국 주가 등락 관례)
type Fmt = "krw" | "pct" | "x" | "won" | "turn" | "growth" | "ret";

// 프리셋: 필터 입력 단위 기준의 (min, max). 라벨은 칩에 그대로 표시.
interface Preset { l: string; min?: number; max?: number }

interface MetricDef {
  key: keyof ScreenerRow; // 숫자 컬럼만
  label: string;
  cat: string;
  fmt: Fmt;
  unit: string;   // 필터 입력 칸에 보여줄 단위
  mult: number;   // 필터 입력값 → 원(raw)값 배수 (예: 조원 입력이면 1e12)
  d: string;      // 툴팁 1줄: 쉬운 정의
  u: string;      // 툴팁 2줄: 무엇을 파악할 때 좋은지
  p?: Preset[];   // 가이드 프리셋 (없으면 입력만)
}

const CATS = [
  "밸류에이션", "수익성", "성장률", "규모·실적",
  "배당", "재무건전성", "투자·효율", "수익률",
] as const;

// 공용 프리셋 빌더
const UP = (vals: number[], unit: string): Preset[] =>
  vals.map(v => ({ l: `${v}${unit} 이상`, min: v }));
const GROWTH_P: Preset[] = [
  { l: "플러스 성장", min: 0 }, { l: "10% 이상", min: 10 }, { l: "20% 이상", min: 20 },
];
const RET_P: Preset[] = [
  { l: "상승(+)", min: 0 }, { l: "+10% 이상", min: 10 }, { l: "하락(−)", max: 0 },
];
const PROFIT_P: Preset[] = [{ l: "흑자", min: 0 }, { l: "1조 이상", min: 1 }];

const METRICS: MetricDef[] = [
  // 밸류에이션
  { key: "per",         label: "PER",   cat: "밸류에이션", fmt: "x", unit: "배", mult: 1,
    d: "주가가 1주당 순이익의 몇 배인지",
    u: "이익 대비 주가가 싼지 볼 때 — 낮을수록 저평가 가능성",
    p: [{ l: "10배 이하", max: 10 }, { l: "10~20배", min: 10, max: 20 }, { l: "20배 이상", min: 20 }] },
  { key: "pbr",         label: "PBR",   cat: "밸류에이션", fmt: "x", unit: "배", mult: 1,
    d: "주가가 1주당 순자산(장부가치)의 몇 배인지",
    u: "자산 대비 저평가 여부 — 1배 이하면 장부가보다 싸게 거래",
    p: [{ l: "1배 이하", max: 1 }, { l: "1~2배", min: 1, max: 2 }, { l: "2배 이상", min: 2 }] },
  { key: "price_sales", label: "P/S",   cat: "밸류에이션", fmt: "x", unit: "배", mult: 1,
    d: "시가총액이 연 매출의 몇 배인지",
    u: "아직 이익이 적은 성장주의 몸값을 매출 기준으로 볼 때",
    p: [{ l: "1배 이하", max: 1 }, { l: "1~3배", min: 1, max: 3 }, { l: "3배 이상", min: 3 }] },
  { key: "price_ocf",   label: "P/OCF", cat: "밸류에이션", fmt: "x", unit: "배", mult: 1,
    d: "시가총액이 영업현금흐름의 몇 배인지",
    u: "회계이익보다 왜곡이 적은 '현금' 기준 밸류에이션",
    p: [{ l: "10배 이하", max: 10 }, { l: "10~20배", min: 10, max: 20 }, { l: "20배 이상", min: 20 }] },
  { key: "price_fcf",   label: "P/FCF", cat: "밸류에이션", fmt: "x", unit: "배", mult: 1,
    d: "시가총액이 잉여현금흐름(FCF)의 몇 배인지",
    u: "실제로 손에 남는 현금 대비 주가 수준",
    p: [{ l: "15배 이하", max: 15 }, { l: "15~30배", min: 15, max: 30 }, { l: "30배 이상", min: 30 }] },
  // 수익성
  { key: "roe",          label: "ROE",         cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "주주 돈(자기자본)으로 1년에 몇 %의 순이익을 내는지",
    u: "주주 자본을 굴리는 실력 — 꾸준히 10% 이상이면 우량 신호",
    p: UP([5, 10, 15], "%") },
  { key: "roa",          label: "ROA",         cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "빚 포함 전체 자산으로 몇 %의 순이익을 내는지",
    u: "자산 전체의 수익 효율 — ROE와 차이가 크면 부채 의존이 큰 것",
    p: UP([3, 5, 10], "%") },
  { key: "roce",         label: "ROCE",        cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "투입 자본(자산−유동부채) 대비 영업이익 비율",
    u: "세금·부채구조 영향 없이 본업의 자본 효율을 비교할 때",
    p: UP([5, 10, 15], "%") },
  { key: "gross_margin", label: "매출총이익률", cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "매출에서 원가를 뺀 이익의 비율",
    u: "제품·서비스 자체의 마진 경쟁력",
    p: UP([20, 40, 60], "%") },
  { key: "op_margin",    label: "영업이익률",   cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "매출에서 원가·판관비까지 뺀 본업 이익의 비율",
    u: "본업으로 얼마나 남기는지 — 업종 내 비교에 특히 유용",
    p: UP([5, 10, 20], "%") },
  { key: "net_margin",   label: "순이익률",     cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "매출에서 모든 비용·세금을 뺀 최종 이익의 비율",
    u: "최종적으로 주주 몫이 되는 이익 수준",
    p: UP([5, 10, 20], "%") },
  { key: "fcf_margin",   label: "FCF마진",     cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "매출 대비 잉여현금흐름(FCF)의 비율",
    u: "장사해서 실제 현금이 얼마나 남는지",
    p: UP([5, 10], "%") },
  { key: "ocf_margin",   label: "OCF마진",     cat: "수익성", fmt: "pct", unit: "%", mult: 1,
    d: "매출 대비 영업현금흐름의 비율",
    u: "본업에서 현금을 만들어내는 힘",
    p: UP([10, 20], "%") },
  { key: "eps",          label: "EPS",         cat: "수익성", fmt: "won", unit: "원", mult: 1,
    d: "1주당 순이익(원)",
    u: "PER 계산의 기초 — 해마다 꾸준히 늘면 좋은 신호",
    p: [{ l: "흑자", min: 0 }, { l: "5천원 이상", min: 5000 }, { l: "1만원 이상", min: 10000 }] },
  // 성장률
  { key: "revenue_growth",     label: "매출성장 YoY",  cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "1년 전 같은 기간 대비 매출 증가율",
    u: "회사가 커지고 있는지 가장 직관적으로 보여주는 지표", p: GROWTH_P },
  { key: "earnings_growth",    label: "순이익성장 YoY", cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "1년 전 같은 기간 대비 순이익 증가율",
    u: "덩치만 아니라 이익이 실제로 늘고 있는지", p: GROWTH_P },
  { key: "revenue_growth_3y",  label: "매출성장 3Y",   cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "최근 3년간 매출의 연평균 성장률(CAGR)",
    u: "한 해 반짝이 아닌 꾸준한 성장인지", p: GROWTH_P },
  { key: "revenue_growth_5y",  label: "매출성장 5Y",   cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "최근 5년간 매출의 연평균 성장률(CAGR)",
    u: "장기 성장 추세 — 사이클(호황·불황)을 걸러서 보기 좋음", p: GROWTH_P },
  { key: "earnings_growth_3y", label: "순이익성장 3Y",  cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "최근 3년간 순이익의 연평균 성장률(CAGR)",
    u: "이익 성장이 추세인지 일회성인지", p: GROWTH_P },
  { key: "earnings_growth_5y", label: "순이익성장 5Y",  cat: "성장률", fmt: "growth", unit: "%", mult: 1,
    d: "최근 5년간 순이익의 연평균 성장률(CAGR)",
    u: "장기적으로 이익을 키워온 회사인지", p: GROWTH_P },
  // 규모·실적 (원본값 — 필터는 조원 단위로 입력)
  { key: "market_cap", label: "시가총액",    cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "주가 × 상장주식수 = 시장이 매긴 회사의 가격표",
    u: "회사 크기 — 대형주/중소형주를 나누는 기준",
    p: [{ l: "5천억 이하", max: 0.5 }, { l: "1조 이상", min: 1 }, { l: "10조 이상", min: 10 }] },
  { key: "revenue",    label: "매출액",      cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "최근 1년(TTM)간 벌어들인 총 판매금액",
    u: "사업의 절대 규모",
    p: [{ l: "1조 이상", min: 1 }, { l: "10조 이상", min: 10 }] },
  { key: "op_income",  label: "영업이익",    cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "본업에서 남긴 이익 (매출 − 원가 − 판관비)",
    u: "본업의 실력을 금액으로 보기", p: PROFIT_P },
  { key: "net_income", label: "순이익",      cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "모든 비용·세금을 뺀 최종 이익",
    u: "주주에게 귀속되는 최종 성과", p: PROFIT_P },
  { key: "ocf",        label: "영업현금흐름", cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "본업에서 실제로 들어온 현금",
    u: "장부상 이익이 진짜 현금으로 뒷받침되는지", p: PROFIT_P },
  { key: "fcf",        label: "FCF",        cat: "규모·실적", fmt: "krw", unit: "조원", mult: 1e12,
    d: "영업현금흐름에서 설비투자를 뺀 여윳돈",
    u: "배당·자사주·빚 상환에 쓸 수 있는 진짜 여유 현금",
    p: [{ l: "플러스", min: 0 }, { l: "1조 이상", min: 1 }] },
  // 배당
  { key: "div_yield",      label: "배당수익률", cat: "배당", fmt: "pct", unit: "%",  mult: 1,
    d: "지금 주가에 사면 1년 배당이 몇 %인지",
    u: "예금 이자처럼 배당 수익을 가늠할 때", p: UP([2, 3, 5], "%") },
  { key: "payout",         label: "배당성향",   cat: "배당", fmt: "pct", unit: "%",  mult: 1,
    d: "순이익 중 배당으로 나눠주는 비율",
    u: "배당 여력 — 너무 높으면(80%↑) 지속가능성 의심",
    p: [{ l: "20% 이하", max: 20 }, { l: "20~50%", min: 20, max: 50 }, { l: "50% 이상", min: 50 }] },
  { key: "dividends_paid", label: "배당금총액", cat: "배당", fmt: "krw", unit: "억원", mult: 1e8,
    d: "1년간 지급한 현금배당의 총액",
    u: "배당의 절대 규모",
    p: [{ l: "100억 이상", min: 100 }, { l: "1천억 이상", min: 1000 }] },
  { key: "retention",      label: "유보율",    cat: "배당", fmt: "pct", unit: "%",  mult: 1,
    d: "순이익 중 배당하지 않고 회사에 남기는 비율",
    u: "성장 재투자 여력 — 성장주는 높은 게 자연스러움", p: UP([50, 80], "%") },
  { key: "fcf_yield",      label: "FCF수익률", cat: "배당", fmt: "pct", unit: "%",  mult: 1,
    d: "시가총액 대비 잉여현금흐름의 비율",
    u: "현금 기준 기대수익률 — 높을수록 저평가 신호", p: UP([3, 5], "%") },
  // 재무건전성
  { key: "current_ratio", label: "유동비율",     cat: "재무건전성", fmt: "pct", unit: "%", mult: 1,
    d: "1년 내 갚을 빚 대비 1년 내 현금화 가능한 자산의 비율",
    u: "단기 지급능력 — 100% 이상이면 일단 안정",
    p: [{ l: "100% 이상", min: 100 }, { l: "200% 이상", min: 200 }] },
  { key: "debt_equity",   label: "부채/자본",    cat: "재무건전성", fmt: "pct", unit: "%", mult: 1,
    d: "자기자본 대비 부채가 몇 %인지",
    u: "빚에 얼마나 의존하는지 — 낮을수록 안전",
    p: [{ l: "100% 이하", max: 100 }, { l: "200% 이하", max: 200 }] },
  { key: "debt_assets",   label: "부채/자산",    cat: "재무건전성", fmt: "pct", unit: "%", mult: 1,
    d: "전체 자산 중 부채가 차지하는 비중",
    u: "자산의 몇 %가 빚으로 이뤄졌는지",
    p: [{ l: "50% 이하", max: 50 }, { l: "70% 이하", max: 70 }] },
  { key: "interest_cov",  label: "이자보상배율",  cat: "재무건전성", fmt: "x", unit: "배", mult: 1,
    d: "영업이익이 이자비용의 몇 배인지",
    u: "이자 갚을 능력 — 1배 미만이면 벌어서 이자도 못 내는 것",
    p: [{ l: "1배 이상", min: 1 }, { l: "3배 이상", min: 3 }, { l: "10배 이상", min: 10 }] },
  { key: "ocf_ni",        label: "OCF/순이익",  cat: "재무건전성", fmt: "x", unit: "배", mult: 1,
    d: "장부상 순이익 대비 실제 현금 유입의 배율",
    u: "이익의 질 — 1배 이상이면 이익이 현금으로 뒷받침됨",
    p: [{ l: "1배 이상", min: 1 }] },
  // 투자·효율
  { key: "capex_sales",   label: "Capex/매출",   cat: "투자·효율", fmt: "pct",  unit: "%", mult: 1,
    d: "매출 대비 설비투자(Capex) 비율",
    u: "돈 먹는 장치산업인지, 투자 부담이 큰 시기인지",
    p: [{ l: "5% 이하", max: 5 }, { l: "10% 이하", max: 10 }] },
  { key: "rnd_intensity", label: "R&D집약도",    cat: "투자·효율", fmt: "pct",  unit: "%", mult: 1,
    d: "매출 대비 연구개발비 비율",
    u: "미래 기술에 얼마나 투자하는지", p: UP([3, 5, 10], "%") },
  { key: "sga_sales",     label: "판관비/매출",   cat: "투자·효율", fmt: "pct",  unit: "%", mult: 1,
    d: "매출 대비 판매관리비(인건비·광고 등) 비율",
    u: "비용 구조가 가벼운지 무거운지",
    p: [{ l: "20% 이하", max: 20 }, { l: "30% 이하", max: 30 }] },
  { key: "asset_turn",    label: "자산회전율",    cat: "투자·효율", fmt: "turn", unit: "회", mult: 1,
    d: "자산 1원으로 1년에 매출을 몇 원 만드는지",
    u: "자산을 얼마나 알차게 굴리는지", p: UP([0.5, 1], "회") },
  { key: "ppe_turn",      label: "유형자산회전율", cat: "투자·효율", fmt: "turn", unit: "회", mult: 1,
    d: "공장·설비 대비 매출의 배율",
    u: "설비를 놀리지 않고 쓰는지", p: UP([2, 4], "회") },
  { key: "inv_turn",      label: "재고회전율",    cat: "투자·효율", fmt: "turn", unit: "회", mult: 1,
    d: "재고가 1년에 몇 번 팔려나가는지",
    u: "재고가 잘 도는지, 창고에 쌓이는지", p: UP([4, 8], "회") },
  { key: "recv_turn",     label: "매출채권회전율", cat: "투자·효율", fmt: "turn", unit: "회", mult: 1,
    d: "외상값(매출채권)을 1년에 몇 번 회수하는지",
    u: "판 물건의 돈을 제때 받고 있는지", p: UP([4, 8], "회") },
  { key: "wc_turn",       label: "운전자본회전율", cat: "투자·효율", fmt: "turn", unit: "회", mult: 1,
    d: "운전자본(유동자산−유동부채) 대비 매출의 배율",
    u: "운영자금을 효율적으로 쓰는지", p: UP([2, 4], "회") },
  // 수익률
  { key: "ret_1d",  label: "1일",  cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "전 거래일 종가 대비 등락률", u: "오늘의 급등락 포착", p: RET_P },
  { key: "ret_5d",  label: "5일",  cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "5거래일(약 1주) 전 대비 등락률", u: "최근 1주 단기 흐름", p: RET_P },
  { key: "ret_1m",  label: "1개월", cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "1개월 전 대비 등락률", u: "단기 모멘텀", p: RET_P },
  { key: "ret_3m",  label: "3개월", cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "3개월 전 대비 등락률", u: "분기 단위 추세", p: RET_P },
  { key: "ret_6m",  label: "6개월", cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "6개월 전 대비 등락률", u: "중기 추세", p: RET_P },
  { key: "ret_ytd", label: "YTD",  cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "올해 1월 1일 이후 등락률", u: "올해 성적표", p: RET_P },
  { key: "ret_1y",  label: "1년",  cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "1년 전 대비 등락률", u: "최근 1년 성과", p: RET_P },
  { key: "ret_5y",  label: "5년",  cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "5년 전 대비 등락률 (수정주가 기준)", u: "장기 성과", p: RET_P },
  { key: "ret_10y", label: "10년", cat: "수익률", fmt: "ret", unit: "%", mult: 1,
    d: "10년 전 대비 등락률 (수정주가 기준)", u: "기업의 초장기 주가 여정", p: RET_P },
];

const BY_KEY = new Map(METRICS.map(m => [m.key as string, m]));

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

// ── 표기 ──────────────────────────────────────────────────────
function num(v: number, digits = 2): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtCell(def: MetricDef, v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  // 밸류에이션 배수가 음수 = 분모(이익·현금흐름)가 적자 → 배수로서 무의미.
  // 스크리너 관례(Finviz 등)대로 값 대신 '적자'로 표시한다 (필터에서도 제외 — passes 참고)
  if (def.cat === "밸류에이션" && v < 0) return { text: "적자", cls: "text-outline" };
  switch (def.fmt) {
    case "krw":  return { text: formatKrw(v), cls: "text-on-surface" };
    case "pct":  return { text: `${num(v)}%`, cls: "text-on-surface" };
    case "x":    return { text: `${num(v)}배`, cls: "text-on-surface" };
    case "won":  return { text: `${Math.round(v).toLocaleString()}원`, cls: "text-on-surface" };
    case "turn": return { text: `${num(v)}회`, cls: "text-on-surface" };
    case "growth": // 홈 카드 관례: ＋초록 / －파랑
      return {
        text: `${v > 0 ? "+" : ""}${num(v, 1)}%`,
        cls: v >= 0 ? "text-secondary" : "text-stock-down",
      };
    case "ret": // 주가 등락 관례: ＋빨강 / －파랑
      return {
        text: `${v > 0 ? "+" : ""}${num(v, 1)}%`,
        cls: v > 0 ? "text-stock-up" : v < 0 ? "text-stock-down" : "text-on-surface",
      };
  }
}

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
      <span
        className="text-xs font-medium text-on-surface w-36 shrink-0"
        onMouseEnter={def ? e => showTip(e, def) : undefined}
        onMouseLeave={def ? hideTip : undefined}
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
