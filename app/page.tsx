import type { Metadata } from "next";
import { getHomeData } from "@/lib/home-data";
import HomePage from "@/components/HomePage";

// 5분마다 재검증 (새 글·주가 반영)
export const revalidate = 300;

// 홈 메타: 검색결과 설명은 브랜드·키워드를 담아 더 서술적으로(구글 스니펫 품질↑).
// 제목·OG는 layout 기본값을 그대로 사용, canonical만 홈으로 지정.
export const metadata: Metadata = {
  description:
    "Reading Stock(리딩스톡)은 삼성전자·SK하이닉스·현대차 등 국내 주요 종목의 " +
    "재무제표와 실적, 밸류에이션(PER·배당수익률·성장률)을 쉽게 풀어 설명하는 기업 분석 서비스예요. " +
    "당신의 투자를, 당신이 이해하도록 도와드려요.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  const stocks = await getHomeData();

  return (
    <>
      {/* Material Symbols (검색·화살표 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      <HomePage stocks={stocks} />
    </>
  );
}
