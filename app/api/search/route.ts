import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 종목 검색: 회사명(한글)·종목코드 부분 일치 — 서버 조회 (종목 확장 대비)
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("companies")
    .select("stock_code,name,sector")
    .or(`name.ilike.%${q}%,stock_code.ilike.%${q}%`)
    .limit(8);

  if (error) return NextResponse.json({ results: [] }, { status: 500 });

  // 후보별 최신 시가총액 (표시용)
  const results = await Promise.all(
    (data ?? []).map(async c => {
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

  return NextResponse.json({ results });
}
