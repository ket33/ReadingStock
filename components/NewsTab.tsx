"use client";

// 탭: 뉴스룸 — 공시 해설 기사. 목록은 카드(날짜·카테고리·제목·2줄 미리보기)로 훑고,
// '뉴스 보러가기'를 누르면 같은 탭 안(히어로·사이드탭 유지)에서 기사 전문으로 전환된다.
import { useState } from "react";
import type { CompanyNews } from "@/lib/types";
import { CATEGORY_LABEL, formatNewsDate, stripCompanyPrefix } from "@/lib/news-format";
import ShareButton from "./ShareButton";

function MetaLine({ n }: { n: CompanyNews }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-on-surface-variant whitespace-nowrap">
      <span>{formatNewsDate(n.published_at)}</span>
      <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 text-[11px] font-medium rounded-sm tracking-wide">
        {CATEGORY_LABEL[n.category] ?? n.category}
      </span>
    </span>
  );
}

export default function NewsTab({ news, companyName, stockCode }: {
  news: CompanyNews[];
  companyName: string;
  stockCode: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = news.find(n => n.id === openId) ?? null;

  const show = (id: number | null) => {
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };

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

  // ── 기사 전문 보기 (탭 콘텐츠만 교체 — 히어로·사이드탭은 그대로) ──
  if (open) {
    return (
      <div className="article-canvas">
        <button
          onClick={() => show(null)}
          className="mb-6 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          ← 뉴스룸 목록
        </button>

        <div className="mb-3"><MetaLine n={open} /></div>

        <h1 className="font-serif text-[24px] md:text-[28px] leading-snug font-bold text-primary mb-6">
          {stripCompanyPrefix(open.title, companyName)}
        </h1>

        {/* 본문 — 문단 구분은 빈 줄 */}
        <div className="space-y-4">
          {open.body.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="text-[15px] leading-[1.8] text-on-surface-variant whitespace-pre-line">
              {para.trim()}
            </p>
          ))}
        </div>

        <div className="mt-6 text-sm">
          <a
            href={open.dart_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline"
          >
            🔗 공시 원문 보기
          </a>
        </div>

        {/* 맨 하단: 리포트와 동일한 공유하기 버튼 */}
        <div className="mt-12 flex justify-center">
          <ShareButton stockCode={stockCode} />
        </div>

        <p className="mt-8 text-xs text-outline">
          공시 내용을 쉽게 풀어 쓴 글로, 투자 권유가 아니에요. 투자 판단의 책임은 투자자 본인에게 있어요.
        </p>
      </div>
    );
  }

  // ── 목록 보기 ──
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
            {/* 헤드라인(좌) + 날짜·카테고리(우) 한 줄 — 카드 클릭 시 전문 보기 */}
            <div onClick={() => show(n.id)} className="cursor-pointer group">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-lg md:text-xl leading-snug font-bold text-primary
                               group-hover:underline underline-offset-4 decoration-1">
                  {stripCompanyPrefix(n.title, companyName)}
                </h3>
                <span className="shrink-0 pt-1"><MetaLine n={n} /></span>
              </div>
              <p className="text-[13px] leading-[1.6] text-on-surface-variant line-clamp-2 mt-1.5">
                {n.body.replace(/\n+/g, " ").trim()}
              </p>
            </div>
            <button
              onClick={() => show(n.id)}
              className="inline-block mt-2 text-[13px] font-medium text-primary hover:underline underline-offset-2"
            >
              뉴스 보러가기 →
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
