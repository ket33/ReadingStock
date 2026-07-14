import type { Metadata } from "next";
import { getHomeData } from "@/lib/home-data";
import HomePage from "@/components/HomePage";

// 5분마다 재검증 (새 글·주가 반영)
export const revalidate = 300;

// 홈 정식 주소(canonical) — 제목·설명·OG는 layout 기본값을 그대로 사용
export const metadata: Metadata = {
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
