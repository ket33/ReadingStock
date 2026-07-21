import type { Metadata } from "next";
import WatchlistPage from "@/components/WatchlistPage";

export const metadata: Metadata = { title: "내 관심종목 — Reading Stock" };

export default function Page() {
  return (
    <>
      {/* Material Symbols (이름 편집·삭제 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      <WatchlistPage />
    </>
  );
}
