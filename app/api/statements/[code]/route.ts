import { NextResponse } from "next/server";
import { getStatementsData } from "@/lib/statements-data";

// 재무제표 탭 데이터 — 탭을 열 때만 브라우저가 호출한다 (종목 페이지 egress 절감).
// 재무 데이터는 분기 공시 때만 바뀌므로 CDN이 1시간 재사용해도 안전하다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return NextResponse.json({ error: "bad code" }, { status: 400 });
  }

  const data = await getStatementsData(code);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
