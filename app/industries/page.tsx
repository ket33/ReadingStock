import type { Metadata } from "next";
import { getIndustryMovers } from "@/lib/industry-data";
import { getIndustryCategories } from "@/lib/screener-data";
import { getIndustryGrowth } from "@/lib/industry-growth-data";
import IndustryPage from "@/components/IndustryPage";

// 5분마다 재검증 — 주가(하루 3회)·재무(분기)가 갱신되면 따라온다
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Industries — Reading Stock",
  description: "산업별 매출 성장 히트맵과 주가 등락을 한 장에서 — LTM 매출 YoY 기준",
};

export default async function Page() {
  const [categories, navCategories, growth] = await Promise.all([
    getIndustryMovers(), getIndustryCategories(), getIndustryGrowth(),
  ]);
  return (
    <>
      {/* Material Symbols (셀렉터 화살표 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      <IndustryPage categories={categories} navCategories={navCategories} growth={growth} />
    </>
  );
}
