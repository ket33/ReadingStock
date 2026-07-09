import { notFound } from "next/navigation";
import { getStockPageData } from "@/lib/data";
import StockPage from "@/components/StockPage";

// 5분마다 재검증 (주가·글이 갱신되면 반영)
export const revalidate = 300;

export default async function Page({ params }: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getStockPageData(code);
  if (!data) notFound();

  return (
    <>
      {/* Material Symbols (사이드바 아이콘) — React가 head로 호이스팅 */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
      />
      <StockPage data={data} />
    </>
  );
}
