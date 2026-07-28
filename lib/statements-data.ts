// 재무제표 탭 데이터 로더 — 종목 페이지 본문과 분리해 '탭을 열 때만' 조회한다.
//
// 왜 분리했나: 재무제표 탭이 쓰는 미매핑 세부 계정은 종목당 최대 3,000행이라
// 페이지 로드마다 미리 받으면 종목 페이지 egress의 ~70%를 차지한다.
// 대부분의 방문자는 이 탭을 열지 않는다 → /api/statements/[code]가 이 로더를 호출하고
// CDN이 1시간 캐시한다 (재무 데이터는 분기 공시 때만 바뀐다).
import { supabase } from "./supabase";
import type { FinancialRow, StatementsData } from "./types";
import { buildStatements } from "./statements";

export async function getStatementsData(stockCode: string): Promise<StatementsData | null> {
  const thisYear = new Date().getFullYear();
  const [companyQ, finQ, finDetailQ, finQuarterQ, finQuarterDetailQ, finQuarterDetail2Q, bsQuarterQ, rndQ] =
    await Promise.all([
      supabase.from("companies").select("sector").eq("stock_code", stockCode).maybeSingle(),
      // 연간 뷰: 매핑된 FY 행
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .eq("period", "FY")
        .not("account_std", "is", null)
        .limit(1000),
      // 세부항목: 미매핑 원본 계정 (IS/CIS/CF만 — BS 세부는 안 씀)
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .eq("period", "FY")
        .is("account_std", null)
        .in("statement", ["IS", "CIS", "CF"])
        .limit(1000),
      // 분기 뷰: 단일(3개월) 분기 매핑 행
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .in("period", ["1Q", "2Q", "3Q", "4Q"])
        .in("statement", ["IS", "CIS", "CF", "FIN"])
        .not("account_std", "is", null)
        .limit(1000),
      // 분기 미매핑 세부 — 요청당 1,000행 하드캡이라 정렬 고정 후 2페이지로 나눠 받는다
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .in("period", ["1Q", "2Q", "3Q", "4Q"])
        .in("statement", ["IS", "CIS", "CF"])
        .is("account_std", null)
        .gte("fiscal_year", thisYear - 6)
        .order("fiscal_year", { ascending: false })
        .order("account_raw")
        .range(0, 999),
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .in("period", ["1Q", "2Q", "3Q", "4Q"])
        .in("statement", ["IS", "CIS", "CF"])
        .is("account_std", null)
        .gte("fiscal_year", thisYear - 6)
        .order("fiscal_year", { ascending: false })
        .order("account_raw")
        .range(1000, 1999),
      // BS 분기말 잔액 (시점 잔액 — 1Q/2Q_cum/3Q_cum/FY)
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .eq("statement", "BS")
        .in("period", ["1Q", "2Q_cum", "3Q_cum", "FY"])
        .not("account_std", "is", null)
        .gte("fiscal_year", thisYear - 6)
        .limit(1000),
      // R&D 금액 (보고서 파싱분 — load_rnd.py가 적재)
      supabase.from("financials")
        .select("fiscal_year,period,statement,account_raw,account_std,value")
        .eq("stock_code", stockCode)
        .eq("statement", "RND")
        .limit(50),
    ]);

  if (!companyQ.data) return null;

  const fin = (finQ.data ?? []) as FinancialRow[];
  const finDetail = (finDetailQ.data ?? []) as FinancialRow[];
  const finQuarter = (finQuarterQ.data ?? []) as FinancialRow[];
  const finQuarterDetail = [
    ...(finQuarterDetailQ.data ?? []),
    ...(finQuarterDetail2Q.data ?? []),
  ] as FinancialRow[];
  const bsQuarter = (bsQuarterQ.data ?? []) as FinancialRow[];
  const rndRows = (rndQ.data ?? []) as FinancialRow[];

  return buildStatements(
    [...fin, ...finDetail],
    [...finQuarter, ...finQuarterDetail, ...bsQuarter],
    rndRows,
    (companyQ.data as { sector: string | null }).sector,
  );
}
