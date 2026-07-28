import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 종목 검색: 회사명(한글)·종목코드 부분 일치 — 서버 조회 (종목 확장 대비)
// results = 분석 준비된 종목(이동 가능), listed = 상장은 됐지만 아직 미준비(작성 요청 대상)
//
// 준비된 종목은 screener(종목당 한 줄, 이름·시총 포함)에서 한 번에 찾는다.
// 이전에는 companies 검색 후 종목마다 prices를 따로 조회(N+1)했는데,
// 검색은 ISR 캐시가 없는 경로라 동시접속이 늘면 여기가 먼저 무너진다.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [], listed: [] });

  const [preparedQ, listedQ] = await Promise.all([
    supabase
      .from("screener")
      .select("stock_code,name,sector,market_cap")
      .or(`name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .order("market_cap", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("listed_companies")
      .select("stock_code,name,market")
      .or(`name.ilike.%${q}%,stock_code.ilike.%${q}%`)
      .limit(8),
  ]);
  if (preparedQ.error) return NextResponse.json({ results: [], listed: [] }, { status: 500 });

  const results = (preparedQ.data ?? []).map(c => ({
    stockCode: c.stock_code,
    name: c.name,
    sector: c.sector,
    marketCap: c.market_cap ?? null,
  }));

  // 미준비 상장사 = 명부 일치분 중 이미 준비된 종목 제외
  // (이름 표기가 명부와 달라 위 results에 안 잡혀도, screener에 있으면 준비된 것)
  const listedRaw = (listedQ.data ?? []).filter(
    l => !results.some(r => r.stockCode === l.stock_code));
  let listed: { stockCode: string; name: string; market: string }[] = [];
  if (listedRaw.length) {
    const { data: onboarded } = await supabase
      .from("screener")
      .select("stock_code")
      .in("stock_code", listedRaw.map(l => l.stock_code));
    const onboardedSet = new Set((onboarded ?? []).map(c => c.stock_code));
    listed = listedRaw
      .filter(l => !onboardedSet.has(l.stock_code))
      .slice(0, 5)
      .map(l => ({ stockCode: l.stock_code, name: l.name, market: l.market }));
  }

  // 같은 검색어는 CDN이 1시간 재사용 (준비 종목 목록은 하루 단위로만 바뀐다)
  return NextResponse.json(
    { results, listed },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
