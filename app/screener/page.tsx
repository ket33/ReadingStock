import type { Metadata } from "next";
import { getScreenerData } from "@/lib/screener-data";
import ScreenerPage from "@/components/ScreenerPage";

// 5분마다 재검증 (주가·지표 갱신 반영 — 홈과 동일)
export const revalidate = 300;

export const metadata: Metadata = {
  title: "종목 골라보기 — Reading Stock",
  description: "지표 조건으로 종목을 거르고 비교해 보세요",
};

export default async function Page() {
  const rows = await getScreenerData();

  return (
    <>
      {/* Material Symbols (정렬 화살표·필터 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      <ScreenerPage rows={rows} />
    </>
  );
}
