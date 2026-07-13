// 재무제표 탭 빌더 — DART 원본 계정(account_raw)을 표준 항목 트리로 매핑
// 회사·연도마다 계정명이 다르므로(실측 인벤토리 기반) 정규화 + 변형 매칭으로 흡수한다.
// 컬럼은 [TTM | 연도들(연간 뷰)] 또는 [TTM | 분기들(분기 뷰)] — 값 해석을 컬럼 종류로 일반화.
import type { FinancialRow, StmtItem, StmtTable, StatementsData, StmtView } from "./types";

/** 계정명 정규화: 목차기호(Ⅰ. 1. 등)·공백·각주표시 제거 */
function norm(raw: string): string {
  return raw
    .replace(/^[^가-힣a-zA-Z]+/, "")
    .replace(/\(\*+\)|\(주\d*\)/g, "")
    .replace(/[\s·]/g, "");
}

type Matcher = (n: string) => boolean;
const eq = (...names: string[]): Matcher => n => names.includes(n);
const has = (...parts: string[]): Matcher => n => parts.every(p => n.includes(p));
const any = (...ms: Matcher[]): Matcher => n => ms.some(m => m(n));

/** 부호 정책: raw=공시값 그대로 / outflow=항상 음수 표기 / inflow=항상 양수 표기 */
type Sign = "raw" | "outflow" | "inflow";

interface ItemDef {
  name: string;
  match?: Matcher;
  std?: string;
  statements: string[];
  sign?: Sign;
  emph?: boolean;
  children?: ItemDef[];
  sumChildren?: boolean;
}

// ── 손익계산서: 일반 기업 ─────────────────────────────────────
const IS_GENERAL: ItemDef[] = [
  { name: "매출액", std: "매출액", statements: ["IS", "CIS"], emph: true },
  { name: "매출원가", std: "매출원가", statements: ["IS", "CIS"] },
  { name: "매출총이익", std: "매출총이익", statements: ["IS", "CIS"], emph: true },
  {
    name: "판매비와관리비", std: "판관비", statements: ["IS", "CIS"],
    match: any(n => n.startsWith("판매비와"), eq("판매비", "일반관리비")),
  },
  { name: "영업이익", std: "영업이익", statements: ["IS", "CIS"], emph: true },
  {
    name: "영업외수익", statements: ["IS", "CIS"], sumChildren: true,
    children: [
      { name: "금융수익", match: eq("금융수익"), statements: ["IS", "CIS"] },
      { name: "기타수익", match: eq("기타수익", "기타영업외수익"), statements: ["IS", "CIS"] },
      { name: "지분법이익", match: eq("지분법이익"), statements: ["IS", "CIS"] },
      { name: "영업외수익(기타)", match: eq("영업외수익"), statements: ["IS", "CIS"] },
    ],
  },
  {
    name: "영업외비용", statements: ["IS", "CIS"], sumChildren: true,
    children: [
      { name: "금융비용", match: eq("금융비용", "금융원가"), statements: ["IS", "CIS"] },
      { name: "기타비용", match: eq("기타비용", "기타영업외비용"), statements: ["IS", "CIS"] },
      { name: "지분법손실", match: eq("지분법손실"), statements: ["IS", "CIS"] },
      { name: "영업외비용(기타)", match: eq("영업외비용"), statements: ["IS", "CIS"] },
    ],
  },
  {
    name: "영업외손익(순액 공시)", statements: ["IS", "CIS"], sumChildren: true,
    children: [
      {
        name: "지분법손익",
        match: any(eq("지분법손익", "지분법이익(손실)", "지분법투자관련손익"),
                   has("지분법", "당기순손익에대한지분"), eq("관계기업에대한지분법손익"),
                   has("관계기업", "투자손익")),
        statements: ["IS", "CIS"],
      },
      { name: "순금융수익(비용)", match: n => n.startsWith("순금융"), statements: ["IS", "CIS"] },
      { name: "순기타수익(비용)", match: n => n.startsWith("순기타"), statements: ["IS", "CIS"] },
      { name: "기타영업외손익", match: eq("기타영업외손익", "영업외손익"), statements: ["IS", "CIS"] },
    ],
  },
  {
    name: "세전 순이익", statements: ["IS", "CIS"], emph: true,
    match: n => n.includes("법인세") && n.includes("차감전"),
  },
  {
    name: "법인세비용", statements: ["IS", "CIS"],
    match: n => (n.startsWith("법인세비용") && !n.includes("차감")) ||
                n === "법인세수익(비용)" || n.startsWith("계속영업법인세"),
  },
  { name: "당기순이익", std: "당기순이익", statements: ["IS", "CIS"], emph: true },
];

// ── 손익계산서: 은행·보험 지주 (KB금융) ───────────────────────
const IS_BANK: ItemDef[] = [
  {
    name: "순이자손익", match: eq("순이자손익", "순이자이익"), statements: ["IS", "CIS"], emph: true,
    children: [
      { name: "이자수익", match: eq("이자수익"), statements: ["IS", "CIS"] },
      { name: "이자비용", match: eq("이자비용"), statements: ["IS", "CIS"], sign: "outflow" },
    ],
  },
  {
    name: "순수수료손익", match: eq("순수수료손익"), statements: ["IS", "CIS"], emph: true,
    children: [
      { name: "수수료수익", match: eq("수수료수익"), statements: ["IS", "CIS"] },
      { name: "수수료비용", match: eq("수수료비용"), statements: ["IS", "CIS"], sign: "outflow" },
    ],
  },
  {
    name: "보험서비스결과", match: eq("보험서비스결과"), statements: ["IS", "CIS"],
    children: [
      { name: "보험수익", match: eq("보험수익"), statements: ["IS", "CIS"] },
      { name: "보험서비스비용", match: eq("보험서비스비용"), statements: ["IS", "CIS"], sign: "outflow" },
    ],
  },
  { name: "기타영업손익", match: eq("기타영업손익"), statements: ["IS", "CIS"] },
  { name: "일반관리비", match: eq("일반관리비"), statements: ["IS", "CIS"], sign: "outflow" },
  {
    name: "신용손실충당금 전입액",
    match: n => n.startsWith("신용손실충당금") && !n.includes("반영전"),
    statements: ["IS", "CIS"], sign: "outflow",
  },
  { name: "영업이익", std: "영업이익", statements: ["IS", "CIS"], emph: true },
  {
    name: "영업외손익", match: eq("영업외손익"), statements: ["IS", "CIS"],
    children: [
      { name: "기타영업외손익", match: eq("기타영업외손익"), statements: ["IS", "CIS"] },
    ],
  },
  {
    name: "세전 순이익", statements: ["IS", "CIS"], emph: true,
    match: n => n.includes("법인세") && n.includes("차감전"),
  },
  {
    name: "법인세비용", statements: ["IS", "CIS"],
    match: n => (n.startsWith("법인세비용") && !n.includes("차감")) || n === "법인세수익(비용)",
  },
  { name: "당기순이익", std: "당기순이익", statements: ["IS", "CIS"], emph: true },
];

// ── 손익계산서: 투자·벤처캐피탈 (DSC) ─────────────────────────
const IS_INVEST: ItemDef[] = [
  {
    name: "영업수익", match: eq("영업수익"), statements: ["IS", "CIS"], emph: true,
    children: [
      { name: "투자조합수익", match: eq("투자조합수익"), statements: ["IS", "CIS"] },
      { name: "운용투자수익", match: eq("운용투자수익"), statements: ["IS", "CIS"] },
      { name: "기타영업수익", match: eq("기타영업수익", "기타의영업수익"), statements: ["IS", "CIS"] },
    ],
  },
  {
    name: "영업비용", match: eq("영업비용"), statements: ["IS", "CIS"], emph: true,
    children: [
      { name: "투자조합비용", match: eq("투자조합비용"), statements: ["IS", "CIS"] },
      { name: "일반관리비", match: eq("일반관리비"), statements: ["IS", "CIS"] },
      { name: "기타영업비용", match: eq("기타영업비용", "기타의영업비용"), statements: ["IS", "CIS"] },
    ],
  },
  { name: "영업이익", std: "영업이익", statements: ["IS", "CIS"], emph: true },
  { name: "기타수익(영업외)", match: eq("기타수익"), statements: ["IS", "CIS"] },
  { name: "기타비용(영업외)", match: eq("기타비용"), statements: ["IS", "CIS"] },
  {
    name: "세전 순이익", statements: ["IS", "CIS"], emph: true,
    match: n => n.includes("법인세") && n.includes("차감전"),
  },
  {
    name: "법인세비용", statements: ["IS", "CIS"],
    match: n => n.startsWith("법인세비용") && !n.includes("차감"),
  },
  { name: "당기순이익", std: "당기순이익", statements: ["IS", "CIS"], emph: true },
];

// ── 현금흐름표 (전 업종 공통) ─────────────────────────────────
const CF_TOTAL = (kind: "영업" | "투자" | "재무"): Matcher =>
  n => new RegExp(`^${kind}활동(으로부터의|으로인한)?(순)?현금흐름(합계)?$`).test(n);

const CF_MAIN: ItemDef[] = [
  {
    name: "영업활동현금흐름", std: "영업현금흐름", statements: ["CF"],
    match: CF_TOTAL("영업"), emph: true,
    children: [
      { name: "당기순이익", match: eq("당기순이익", "연결당기순이익"), statements: ["CF"] },
      {
        name: "조정(비현금 항목 등)",
        match: any(eq("조정", "손익조정사항", "당기순이익에대한조정"), has("조정을위한가감")),
        statements: ["CF"],
      },
      {
        name: "영업에서 창출된 현금",
        match: n => n.includes("영업") && n.includes("창출"), statements: ["CF"],
      },
      {
        name: "운전자본 변동",
        match: any(has("자산부채의변동"), has("자산부채의증감")), statements: ["CF"],
      },
      { name: "이자의 수취", match: n => n.startsWith("이자의수취") || n === "이자수취", statements: ["CF"] },
      {
        name: "이자의 지급", sign: "outflow",
        match: n => n.startsWith("이자의지급") || n === "이자지급", statements: ["CF"],
      },
      {
        name: "배당금의 수취",
        match: n => n.startsWith("배당금수입") || n.startsWith("배당금의수취") ||
                    n.startsWith("배당금수취") || n.startsWith("배당금의수령"),
        statements: ["CF"],
      },
      {
        name: "법인세의 납부", sign: "outflow",
        match: n => n.startsWith("법인세납부") || n.startsWith("법인세의납부") || n.startsWith("법인세의지급"),
        statements: ["CF"],
      },
    ],
  },
  {
    name: "투자활동현금흐름", statements: ["CF"], match: CF_TOTAL("투자"), emph: true,
    children: [
      {
        name: "유형자산의 취득(Capex)", sign: "outflow",
        match: n => n.includes("유형자산") && n.includes("취득"), statements: ["CF"],
      },
      { name: "유형자산의 처분", match: eq("유형자산의처분"), statements: ["CF"] },
      {
        name: "무형자산의 취득", sign: "outflow",
        match: n => n.includes("무형자산") && n.includes("취득"), statements: ["CF"],
      },
      {
        name: "인수(사업결합·종속기업 취득)", sign: "outflow",
        match: any(n => n.includes("사업결합") && n.includes("유출"),
                   n => n.includes("종속기업") && n.includes("취득"),
                   n => n.includes("종속회사") && n.includes("취득")),
        statements: ["CF"],
      },
    ],
  },
  {
    name: "재무활동현금흐름", statements: ["CF"], match: CF_TOTAL("재무"), emph: true,
    children: [
      {
        name: "차입금·사채의 조달", sign: "inflow",
        match: any(
          n => (n.includes("차입금") || n.includes("차입부채")) &&
               (n.endsWith("의차입") || n.endsWith("의증가")) && !n.includes("순증"),
          n => n.includes("사채의발행") || n === "사채의증가" || n === "전환사채의발행",
          eq("유상증자"),
        ),
        statements: ["CF"],
      },
      {
        name: "차입금·사채의 상환", sign: "outflow",
        match: any(
          n => n.includes("상환") &&
               (n.includes("차입") || n.includes("사채") || n.includes("리스부채") ||
                n.includes("신종자본증권") || n.includes("장기부채")),
          n => (n.includes("차입금") || n === "사채의감소") && n.endsWith("감소") && !n.includes("순증"),
        ),
        statements: ["CF"],
      },
      { name: "단기차입금 등 순증감", match: n => n.includes("순증"), statements: ["CF"] },
      {
        name: "배당금의 지급", sign: "outflow",
        match: n => n.includes("배당금") && n.includes("지급"), statements: ["CF"],
      },
      {
        name: "자기주식의 취득", sign: "outflow",
        match: n => n.includes("자기주식") && n.includes("취득"), statements: ["CF"],
      },
    ],
  },
];

// ── 재무상태표 ────────────────────────────────────────────────
const BS_ITEMS: ItemDef[] = [
  { name: "자산총계", std: "자산총계", statements: ["BS"], emph: true },
  { name: "유동자산", std: "유동자산", statements: ["BS"] },
  { name: "부채총계", std: "부채총계", statements: ["BS"], emph: true },
  { name: "유동부채", std: "유동부채", statements: ["BS"] },
  { name: "자본총계", std: "자본총계", statements: ["BS"], emph: true },
];

// ── 컬럼 스펙: 연간(FY) / 분기(Q) / TTM ───────────────────────
interface ColSpec {
  label: string;
  kind: "FY" | "Q" | "TTM";
  year?: number;
  q?: string;
}

// ── 인덱스 ────────────────────────────────────────────────────
interface Indexed {
  byStdFY: Map<string, number>;                       // `${y}|${stmt}|${std}`
  rawsFY: { year: number; stmt: string; n: string; value: number }[];
  byStdQ: Map<string, number>;                        // `${y}|${q}|${stmt}|${std}`
  rawsQ: { year: number; q: string; stmt: string; n: string; value: number }[];
  ttmQuarters: { year: number; q: string }[];         // TTM 합산용 최근 4개 단일분기
  latestFY: number | null;                            // TTM 텔레스코핑 폴백용
}

const SINGLE_Q = ["1Q", "2Q", "3Q", "4Q"];
// BS 잔액의 분기 라벨: 시점 잔액이라 1Q/2Q_cum/3Q_cum/FY가 각 분기말 잔액
const BS_PERIOD_TO_Q: Record<string, string> = { "1Q": "1Q", "2Q_cum": "2Q", "3Q_cum": "3Q", FY: "4Q" };

function indexRows(fyRows: FinancialRow[], qRows: FinancialRow[]): Indexed {
  const byStdFY = new Map<string, number>();
  const rawsFY: Indexed["rawsFY"] = [];
  for (const r of fyRows) {
    if (r.period !== "FY" || r.value == null) continue;
    if (r.account_std) {
      const key = `${r.fiscal_year}|${r.statement}|${r.account_std}`;
      if (!byStdFY.has(key)) byStdFY.set(key, r.value);
    }
    rawsFY.push({ year: r.fiscal_year, stmt: r.statement, n: norm(r.account_raw), value: r.value });
  }

  const byStdQ = new Map<string, number>();
  const rawsQ: Indexed["rawsQ"] = [];
  for (const r of qRows) {
    if (r.value == null) continue;
    const q = r.statement === "BS" ? BS_PERIOD_TO_Q[r.period] : (SINGLE_Q.includes(r.period) ? r.period : null);
    if (!q) continue;
    if (r.account_std) {
      const key = `${r.fiscal_year}|${q}|${r.statement}|${r.account_std}`;
      if (!byStdQ.has(key)) byStdQ.set(key, r.value);
    }
    rawsQ.push({ year: r.fiscal_year, q, stmt: r.statement, n: norm(r.account_raw), value: r.value });
  }

  // 흐름(IS/CIS/CF) 기준 최근 4개 단일분기 → TTM 합산 창
  const flowQ = [...new Set(rawsQ.filter(r => r.stmt !== "BS").map(r => `${r.year}|${r.q}`))]
    .map(k => { const [y, q] = k.split("|"); return { year: +y, q }; })
    .sort((a, b) => (a.year - b.year) || (SINGLE_Q.indexOf(a.q) - SINGLE_Q.indexOf(b.q)));
  const ttmQuarters = flowQ.slice(-4);

  const fyYears = fyRows.filter(r => r.period === "FY" && r.value != null).map(r => r.fiscal_year);
  const latestFY = fyYears.length ? Math.max(...fyYears) : null;

  return { byStdFY, rawsFY, byStdQ, rawsQ, ttmQuarters, latestFY };
}

// ── 값 해석 ───────────────────────────────────────────────────
function valueFY(def: ItemDef, idx: Indexed, year: number): number | null {
  if (def.std) {
    for (const s of def.statements) {
      const v = idx.byStdFY.get(`${year}|${s}|${def.std}`);
      if (v != null) return v;
    }
  }
  if (def.match) {
    const seen = new Set<string>();
    let sum = 0, found = false;
    for (const r of idx.rawsFY) {
      if (r.year !== year || !def.statements.includes(r.stmt) || !def.match(r.n)) continue;
      const key = `${r.stmt}|${r.n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sum += r.value;
      found = true;
    }
    if (found) return sum;
  }
  return null;
}

function valueQ(def: ItemDef, idx: Indexed, year: number, q: string): number | null {
  if (def.std) {
    for (const s of def.statements) {
      const v = idx.byStdQ.get(`${year}|${q}|${s}|${def.std}`);
      if (v != null) return v;
    }
  }
  if (def.match) {
    const seen = new Set<string>();
    let sum = 0, found = false;
    for (const r of idx.rawsQ) {
      if (r.year !== year || r.q !== q || !def.statements.includes(r.stmt) || !def.match(r.n)) continue;
      const key = `${r.stmt}|${r.n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sum += r.value;
      found = true;
    }
    if (found) return sum;
  }
  return null;
}

function valueForCol(def: ItemDef, idx: Indexed, col: ColSpec): number | null {
  const isBalance = def.statements.includes("BS");
  if (col.kind === "FY") return valueFY(def, idx, col.year!);
  if (col.kind === "Q") return valueQ(def, idx, col.year!, col.q!);
  // TTM — 흐름: 최근 4개 단일분기 합 / 잔액(BS): 최신 분기말 값
  if (isBalance) {
    for (let i = idx.ttmQuarters.length - 1; i >= 0; i--) {
      const { year, q } = idx.ttmQuarters[i];
      const v = valueQ(def, idx, year, q);
      if (v != null) return v;
    }
    return null;
  }
  // (a) 최근 4개 단일분기 합
  if (idx.ttmQuarters.length === 4) {
    let sum = 0, ok = true;
    for (const { year, q } of idx.ttmQuarters) {
      const v = valueQ(def, idx, year, q);
      if (v == null) { ok = false; break; }
      sum += v;
    }
    if (ok) return sum;
  }
  // (b) 텔레스코핑 폴백: FY + (FY 이후 분기) − (전년 동일 분기)
  //     — 4Q 단일분기가 라벨 변형으로 결손인 경우(실측: 삼성 법인세)에도 견고
  if (idx.latestFY != null) {
    const fy = valueFY(def, idx, idx.latestFY);
    if (fy != null) {
      const extras = idx.ttmQuarters.filter(t => t.year > idx.latestFY!);
      if (extras.length) {
        let cur = 0, prev = 0;
        for (const { year, q } of extras) {
          const c = valueQ(def, idx, year, q);
          const p = valueQ(def, idx, idx.latestFY, q);
          if (c == null || p == null) return null;
          cur += c;
          prev += p;
        }
        return fy + cur - prev;
      }
      return fy;   // FY 이후 분기가 아직 없으면 TTM = 최근 FY
    }
  }
  return null;
}

function applySign(v: number | null, sign?: Sign): number | null {
  if (v == null) return null;
  if (sign === "outflow") return -Math.abs(v);
  if (sign === "inflow") return Math.abs(v);
  return v;
}

function buildItem(def: ItemDef, idx: Indexed, cols: ColSpec[]): StmtItem {
  const children = (def.children ?? [])
    .map(c => buildItem(c, idx, cols))
    .filter(c => c.values.some(v => v != null));
  let values = cols.map(c => applySign(valueForCol(def, idx, c), def.sign));
  if (def.sumChildren && values.every(v => v == null) && children.length) {
    values = cols.map((_, i) => {
      const vs = children.map(c => c.values[i]).filter((v): v is number => v != null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
    });
  }
  return { name: def.name, values, emph: def.emph, children: children.length ? children : undefined };
}

// ── 뷰(연간/분기) 하나 빌드 ───────────────────────────────────
function buildView(
  idx: Indexed, cols: ColSpec[], isDefs: ItemDef[], rndRows: FinancialRow[],
): StmtView {
  const isItems = isDefs.map(d => buildItem(d, idx, cols));

  // 세전 순이익이 라벨로 안 잡힌 컬럼은 '순이익 + 법인세'로 유도
  const pretax = isItems.find(i => i.name === "세전 순이익");
  const tax = isItems.find(i => i.name === "법인세비용");
  const ni = isItems.find(i => i.name === "당기순이익");
  if (pretax && tax && ni) {
    pretax.values = pretax.values.map((v, i) =>
      v != null ? v : (ni.values[i] != null && tax.values[i] != null
        ? ni.values[i]! + tax.values[i]! : null));
  }

  // 부가항목: 연구개발비 (보고서 파싱분 — 최근 데이터만 존재)
  const rndValues = cols.map(c => {
    if (c.kind === "TTM")
      return rndRows.find(r => r.period === "TTM")?.value ?? null;
    if (c.kind === "FY")
      return rndRows.find(r => r.period === "FY" && r.fiscal_year === c.year)?.value ?? null;
    return rndRows.find(r => r.period === c.q && r.fiscal_year === c.year)?.value ?? null;
  });
  if (rndValues.some(v => v != null)) {
    isItems.push({
      name: "부가항목", values: cols.map(() => null),
      children: [{ name: "연구개발비", values: rndValues }],
    });
  }

  const cfItems = CF_MAIN.map(d => buildItem(d, idx, cols));

  // 잉여현금흐름 블록: FCF = 영업활동현금흐름 − |Capex|
  const ocf = cfItems.find(i => i.name === "영업활동현금흐름");
  const capexDef = CF_MAIN[1].children!.find(c => c.name === "유형자산의 취득(Capex)")!;
  const capexVals = cols.map(c => applySign(valueForCol(capexDef, idx, c), "outflow"));
  const fcfBlock: StmtItem[] = [
    { name: "영업활동현금흐름", values: ocf?.values ?? cols.map(() => null) },
    { name: "유형자산의 취득(Capex)", values: capexVals },
    {
      name: "잉여현금흐름(FCF)", emph: true,
      values: cols.map((_, i) => {
        const o = ocf?.values[i], c = capexVals[i];
        return o != null && c != null ? o + c : null;   // capex는 이미 음수
      }),
    },
  ];

  const tables: StmtTable[] = [
    { title: "손익계산서", blocks: [isItems] },
    { title: "재무상태표", blocks: [BS_ITEMS.map(d => buildItem(d, idx, cols))] },
    { title: "현금흐름표", blocks: [cfItems, fcfBlock] },
  ];
  for (const t of tables) {
    t.blocks = t.blocks.map(b =>
      b.filter(i => i.values.some(v => v != null) || (i.children?.length ?? 0) > 0));
  }
  return { cols: cols.map(c => c.label), tables };
}

// ── 엔트리 ────────────────────────────────────────────────────
export function buildStatements(
  fyRows: FinancialRow[], qRows: FinancialRow[], rndRows: FinancialRow[], sector: string | null,
): StatementsData {
  const idx = indexRows(fyRows, qRows);

  const isFinancial = (sector ?? "").includes("금융");
  const isInvest = sector === "투자";
  const isDefs = isFinancial ? IS_BANK : isInvest ? IS_INVEST : IS_GENERAL;

  // 연간 컬럼: TTM + 최근 10개 연도(최신 좌측)
  const years = [...new Set(fyRows.filter(r => r.period === "FY" && r.value != null).map(r => r.fiscal_year))]
    .sort((a, b) => b - a)
    .slice(0, 10);
  const annualCols: ColSpec[] = [
    { label: "TTM", kind: "TTM" },
    ...years.map(y => ({ label: String(y), kind: "FY" as const, year: y })),
  ];

  // 분기 컬럼: TTM + 최근 20개 단일분기 = 5년 (최신 좌측)
  const flowQ = [...new Set(
    qRows.filter(r => r.value != null && r.statement !== "BS" && SINGLE_Q.includes(r.period))
      .map(r => `${r.fiscal_year}|${r.period}`),
  )]
    .map(k => { const [y, q] = k.split("|"); return { year: +y, q }; })
    .sort((a, b) => (b.year - a.year) || (SINGLE_Q.indexOf(b.q) - SINGLE_Q.indexOf(a.q)))
    .slice(0, 20);
  const quarterCols: ColSpec[] = [
    { label: "TTM", kind: "TTM" },
    ...flowQ.map(({ year, q }) => ({
      label: `${String(year).slice(2)}.${q}`, kind: "Q" as const, year, q,
    })),
  ];

  return {
    annual: buildView(idx, annualCols, isDefs, rndRows),
    quarterly: buildView(idx, quarterCols, isDefs, rndRows),
  };
}
