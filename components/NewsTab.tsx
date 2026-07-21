"use client";

// 탭: 뉴스룸 — 공시 해설 기사를 날짜순 타임라인으로 보여준다
// 기사 본문은 파이프라인이 검증까지 마친 순수 텍스트(문단 구분 빈 줄)라 단순 렌더.
import type { CompanyNews } from "@/lib/types";

const CATEGORY_LABEL: Record<string, string> = {
  earnings: "실적",
  contract: "계약",
  invest: "투자",
  capital: "자본",
  shareholder: "주주환원",
  structure: "구조",
  risk: "리스크",
  governance: "지배구조",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

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
      <div className="mb-10">
        <p className="text-base text-on-surface-variant">
          {companyName}의 실적과 사업에 영향을 주는 뉴스만 쉽게 풀어 전해드려요
        </p>
      </div>

      <div className="space-y-10">
        {news.map(n => (
          <article key={n.id} id={`news-${n.id}`} className="border-b border-outline-variant pb-10 last:border-b-0">
            {/* 메타줄: 날짜 + 카테고리 */}
            <div className="flex items-center gap-2 mb-3 text-[13px] text-on-surface-variant">
              <span>{formatDate(n.published_at)}</span>
              <span className="text-outline">·</span>
              <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 text-[11px] font-medium rounded-sm tracking-wide">
                {CATEGORY_LABEL[n.category] ?? n.category}
              </span>
            </div>

            {/* 헤드라인 */}
            <h3 className="font-serif text-xl md:text-[22px] leading-snug font-semibold text-primary mb-4">
              {n.title}
            </h3>

            {/* 본문 — 문단 구분은 빈 줄 */}
            <div className="space-y-4">
              {n.body.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="text-[15px] leading-[1.8] text-on-surface-variant whitespace-pre-line">
                  {para.trim()}
                </p>
              ))}
            </div>

            {/* 링크 + 디스클레이머 */}
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
              <a
                href={n.dart_url}
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
        ))}
      </div>
    </div>
  );
}
