import type { Metadata } from "next";
import { getIndustryMovers } from "@/lib/industry-data";
import IndustryPage from "@/components/IndustryPage";

// 5분마다 재검증 — 주가(하루 3회)·재무(분기)가 갱신되면 따라온다
export const revalidate = 300;

export const metadata: Metadata = {
  title: "산업 한눈에 — Reading Stock",
  description: "산업별 실적 히트맵과 주가 등락을 한 장에서 — 최근 분기 영업이익 YoY 기준",
};

export default async function Page() {
  const categories = await getIndustryMovers();
  return <IndustryPage categories={categories} />;
}
