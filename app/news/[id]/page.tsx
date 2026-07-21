import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORY_LABEL, formatNewsDate } from "@/lib/news-format";
import { SITE_NAME, SITE_URL, OG_IMAGE } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import type { CompanyNews } from "@/lib/types";

// 뉴스 상세 — 뉴스 하나당 한 페이지. 기사는 발행 후 바뀌지 않으므로 1시간 재검증.
export const revalidate = 3600;

type NewsWithCompany = CompanyNews & { companyName: string };

const loadNews = cache(async (id: number): Promise<NewsWithCompany | null> => {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { data } = await supabase.from("company_news")
    .select("*, companies(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const c = (Array.isArray(data.companies) ? data.companies[0] : data.companies) as
    { name: string } | null;
  return { ...(data as CompanyNews), companyName: c?.name ?? data.stock_code };
});

/** 본문 첫 문단에서 검색·미리보기용 설명 문구 (150자 안팎) */
function description(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 150 ? text.slice(0, 150).trimEnd() + "…" : text;
}

export async function generateMetadata({ params }: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const news = await loadNews(Number(id));
  if (!news) return {};
  const title = `${news.title} - ${news.companyName} 뉴스룸`;
  const url = `${SITE_URL}/news/${news.id}`;
  return {
    title,
    description: description(news.body),
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url,
      title: `${title} - ${SITE_NAME}`,
      description: description(news.body),
      images: [OG_IMAGE],
    },
  };
}

export default async function Page({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const news = await loadNews(Number(id));
  if (!news) notFound();

  return (
    <>
      <SiteHeader />
      <main className="flex-grow max-w-[720px] mx-auto w-full px-4 md:px-10 py-10">
        {/* 뒤로: 이 종목의 뉴스룸 */}
        <Link
          href={`/stock/${news.stock_code}?tab=news`}
          className="inline-block mb-6 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          ← {news.companyName} 뉴스룸
        </Link>

        <article className="bg-white border border-outline-variant rounded-xl p-6 md:p-8">
          {/* 메타줄: 날짜 + 카테고리 */}
          <div className="flex items-center gap-2 mb-3 text-[13px] text-on-surface-variant">
            <span>{formatNewsDate(news.published_at)}</span>
            <span className="text-outline">·</span>
            <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 text-[11px] font-medium rounded-sm tracking-wide">
              {CATEGORY_LABEL[news.category] ?? news.category}
            </span>
          </div>

          {/* 헤드라인 */}
          <h1 className="font-serif text-[24px] md:text-[28px] leading-snug font-bold text-primary mb-6">
            {news.title}
          </h1>

          {/* 본문 — 문단 구분은 빈 줄 */}
          <div className="space-y-4">
            {news.body.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="text-[15px] leading-[1.8] text-on-surface-variant whitespace-pre-line">
                {para.trim()}
              </p>
            ))}
          </div>

          {/* 링크 + 디스클레이머 */}
          <div className="mt-6 text-sm">
            <a
              href={news.dart_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              🔗 공시 원문 보기
            </a>
          </div>
          <p className="mt-3 text-xs text-outline">
            공시 내용을 쉽게 풀어 쓴 글로, 투자 권유가 아니에요. 투자 판단의 책임은 투자자 본인에게 있어요.
          </p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
