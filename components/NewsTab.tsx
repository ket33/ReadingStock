"use client";

// 탭: 뉴스룸 — 공시 해설 기사 목록. 카드(날짜·카테고리·제목·2줄 미리보기)로 한눈에 훑고,
// '뉴스 보러가기'를 누르면 기사 전용 페이지(/news/[id])로 이동한다.
import Link from "next/link";
import type { CompanyNews } from "@/lib/types";
import { CATEGORY_LABEL, formatNewsDate } from "@/lib/news-format";

export default function NewsTab({ news, companyName }: {
  news: CompanyNews[];
  companyName: string;
}) {
  if (news.length === 0) {
    return (
      <div className="article-canvas py-24 text-center text-on-surface-variant">
        <p>아직 {companyName}의 뉴스가 없어요.</p>
        <p className="mt-2 text-sm text-outline">
          펀더멘털에 관련된 공시가 올라오면 뉴스룸이 쉽게 풀어서 전해드려요.
        </p>
      </div>
    );
  }

  return (
    <div className="article-canvas">
      <div className="mb-8">
        <p className="text-base text-on-surface-variant">
          {companyName}의 실적과 사업에 영향을 주는 뉴스만 쉽게 풀어 전해드려요
        </p>
      </div>

      <div className="space-y-4">
        {news.map(n => (
          <article key={n.id}
                   className="bg-white border border-outline-variant rounded-xl p-5">
            {/* 헤드라인(좌) + 날짜·카테고리(우) 한 줄 — 카드 전체가 기사 페이지로 가는 링크 */}
            <Link href={`/news/${n.id}`} className="block group">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-lg md:text-xl leading-snug font-bold text-primary
                               group-hover:underline underline-offset-4 decoration-1">
                  {n.title}
                </h3>
                <span className="shrink-0 flex items-center gap-2 pt-1 text-[13px] text-on-surface-variant whitespace-nowrap">
                  <span>{formatNewsDate(n.published_at)}</span>
                  <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 text-[11px] font-medium rounded-sm tracking-wide">
                    {CATEGORY_LABEL[n.category] ?? n.category}
                  </span>
                </span>
              </div>
              <p className="text-[13px] leading-[1.6] text-on-surface-variant line-clamp-2 mt-1.5">
                {n.body.replace(/\n+/g, " ").trim()}
              </p>
            </Link>
            <Link
              href={`/news/${n.id}`}
              className="inline-block mt-2 text-[13px] font-medium text-primary hover:underline underline-offset-2"
            >
              뉴스 보러가기 →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
