import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/supabase-page";
import { SITE_URL } from "@/lib/seo";

// 1시간마다 다시 생성 — DB에 종목이 추가되면 자동으로 사이트맵에 반영된다
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 전 종목 코드 + 최신 글 시각(lastmod용) 조회
  // PostgREST 요청당 1,000행 캡 — limit 없이도 잘리므로 반드시 페이징 (2,500종목 대응)
  const [companies, articles] = await Promise.all([
    fetchAll<{ stock_code: string }>((from, to) =>
      supabase.from("companies").select("stock_code").order("stock_code").range(from, to)),
    fetchAll<{ stock_code: string; created_at: string }>((from, to) =>
      supabase.from("articles").select("stock_code,created_at")
        .order("created_at", { ascending: false }).range(from, to)),
  ]);

  // 종목별 최신 글 시각
  const latest = new Map<string, string>();
  for (const a of articles) {
    if (!latest.has(a.stock_code)) latest.set(a.stock_code, a.created_at);
  }

  const stockUrls: MetadataRoute.Sitemap = companies.map(c => ({
    url: `${SITE_URL}/stock/${c.stock_code}`,
    lastModified: latest.get(c.stock_code) ?? undefined,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // 정적 페이지 (약관·개인정보·골라보기) — 정보/도구 페이지라 낮은 우선순위
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/screener`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...stockUrls,
    ...staticUrls,
  ];
}
