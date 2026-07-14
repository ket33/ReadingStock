// 지표 카탈로그 — 스크리너·종목페이지 공용 단일 원천 (ScreenerPage에서 추출)
import { formatKrw } from "./format";
import type { ScreenerRow } from "./screener-data";

// ── 지표 카탈로그 (필터·컬럼·표기의 단일 원천) ─────────────────
// fmt: krw=조/억 표기, pct=%, x=배, won=원, turn=회,
//      growth=부호+% (＋초록/－파랑 — 홈 카드의 성장률 관례),
//      ret=부호+% (＋빨강/－파랑 — 한국 주가 등락 관례)
export type Fmt = "krw" | "pct" | "x" | "won" | "turn" | "growth" | "ret";

// 프리셋: 필터 입력 단위 기준의 (min, max). 라벨은 칩에 그대로 표시.
export interface Preset { l: string; min?: number; max?: number }

export interface MetricDef {
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

export const CATS = [
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

export const METRICS: MetricDef[] = [
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

export const BY_KEY = new Map(METRICS.map(m => [m.key as string, m]));

// ── 표기 ──────────────────────────────────────────────────────
function num(v: number, digits = 2): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtCell(def: MetricDef, v: number | null): { text: string; cls: string } {
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
