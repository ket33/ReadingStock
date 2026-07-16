import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 종목 검색: 회사명(한글)·종목코드 부분 일치 — 서버 조회 (종목 확장 대비)
// results = 분석 준비된 종목(이동 가능), listed = 상장은 됐지만 아직 미준비(작성 요청 대상)
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [], listed: [] });

  const [preparedQ, listedQ] = await Promise.all([
    supabase
      .from("companies")
      .select("stock_code,name,sector")
      .or(`name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .limit(8),
    supabase
      .from("listed_companies")
      .select("stock_code,name,market")
      .or(`name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .limit(8),
  ]);
  if (preparedQ.error) return NextResponse.json({ results: [], listed: [] }, { status: 500 });

  // 후보별 최신 시가총액 (표시용)
  const results = await Promise.all(
    (preparedQ.data ?? []).map(async c => {
      const { data: p } = await supabase.from("prices")
        .select("market_cap")
        .eq("stock_code", c.stock_code)
        .order("date", { ascending: false })
        .limit(1);
      return {
        stockCode: c.stock_code,
        name: c.name,
        sector: c.sector,
        marketCap: p?.[0]?.market_cap ?? null,
      };
    })
  );

  // 미준비 상장사 = 명부 일치분 중 이미 준비된 종목 제외
  // (이름 표기가 명부와 달라 위 results에 안 잡혀도, companies에 있으면 준비된 것)
  const listedRaw = (listedQ.data ?? []).filter(
    l => !results.some(r => r.stockCode === l.stock_code));
  let listed: { stockCode: string; name: string; market: string }[] = [];
  if (listedRaw.length) {
    const { data: onboarded } = await supabase
      .from("companies")
      .select("stock_code")
      .in("stock_code", listedRaw.map(l => l.stock_code));
    const onboardedSet = new Set((onboarded ?? []).map(c => c.stock_code));
    listed = listedRaw
      .filter(l => !onboardedSet.has(l.stock_code))
      .slice(0, 5)
      .map(l => ({ stockCode: l.stock_code, name: l.name, market: l.market }));
  }

  return NextResponse.json({ results, listed });
}
