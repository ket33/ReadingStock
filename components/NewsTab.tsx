"use client";

// 탭: 뉴스룸 — 공시 해설 기사를 날짜순 타임라인으로 보여준다
// 기본은 접힌 카드(날짜·카테고리·제목·본문 2줄)로 한눈에 훑고, 펼쳐보기로 전문을 읽는다.
// 기사 본문은 파이프라인이 검증까지 마친 순수 텍스트(문단 구분 빈 줄)라 단순 렌더.
import { useEffect, useState } from "react";
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 딥링크(#news-123)로 진입하면 해당 기사를 펼치고 그 위치로 스크롤
  useEffect(() => {
    const m = window.location.hash.match(/^#news-(\d+)$/);
    if (!m) return;
    const id = Number(m[1]);
    if (!news.some(n => n.id === id)) return;
    const t = window.setTimeout(() => {
      setExpanded(prev => new Set(prev).add(id));
      requestAnimationFrame(() => {
        document.getElementById(`news-${id}`)?.scrollIntoView({ block: "start" });
      });
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  return (
    <div className="article-canvas">
      <div className="mb-8">
        <p className="text-base text-on-surface-variant">
          {companyName}의 실적과 사업에 영향을 주는 뉴스만 쉽게 풀어 전해드려요
        </p>
      </div>

      <div className="space-y-5">
        {news.map(n => {
          const open = expanded.has(n.id);
          return (
            <article key={n.id} id={`news-${n.id}`}
                     className="border-b border-outline-variant pb-5 last:border-b-0 scroll-mt-24">
              {/* 메타줄: 날짜 + 카테고리 */}
              <div className="flex items-center gap-2 mb-1.5 text-[13px] text-on-surface-variant">
                <span>{formatDate(n.published_at)}</span>
                <span className="text-outline">·</span>
                <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 text-[11px] font-medium rounded-sm tracking-wide">
                  {CATEGORY_LABEL[n.category] ?? n.category}
                </span>
              </div>

              {/* 헤드라인 + (접힘) 본문 2줄 미리보기 — 클릭하면 펼침/접힘 */}
              <div onClick={() => toggle(n.id)} className="cursor-pointer group">
                <h3 className="font-serif text-lg md:text-xl leading-snug font-semibold text-primary
                               group-hover:underline underline-offset-4 decoration-1 mb-1.5">
                  {n.title}
                </h3>
                {!open && (
                  <p className="text-[14px] leading-[1.7] text-on-surface-variant line-clamp-2">
                    {n.body.replace(/\n+/g, " ").trim()}
                  </p>
                )}
              </div>

              {open && (
                <>
                  {/* 본문 전문 — 문단 구분은 빈 줄 */}
                  <div className="space-y-4 mt-2">
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
                </>
              )}

              {/* 펼쳐보기 / 접기 */}
              <button
                onClick={() => toggle(n.id)}
                className="mt-2 text-[13px] font-medium text-primary hover:underline underline-offset-2"
              >
                {open ? "접기 ▴" : "펼쳐보기 ▾"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
