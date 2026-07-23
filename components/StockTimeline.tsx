"use client";

// 종목 타임라인 — 뉴스룸 기사 + 리포트 발간을 최신순 세로 타임라인으로.
// 데스크톱: 좌측 사이드바 탭 아래(업종 자리). 모바일: 콘텐츠 하단.
// 항목: [날짜 · 유형](작게) 윗줄 + 제목 아랫줄(최대 2줄) — 전체 3줄 이내.
// 한 번에 8개씩 보여주고, 그 이상은 '더보기'로 펼친다.
import { useState } from "react";
import type { CompanyNews, ReportEvent } from "@/lib/types";

const PAGE = 8;

interface TimelineEntry {
  kind: "news" | "report";
  id: number;
  title: string;
  date: string; // ISO
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function StockTimeline({ news, reports, onOpenNews, onOpenReport }: {
  news: CompanyNews[];
  reports: ReportEvent[];
  onOpenNews: (id: number) => void;
  onOpenReport: () => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  const entries: TimelineEntry[] = [
    ...news.map(n => ({ kind: "news" as const, id: n.id, title: n.title, date: n.published_at })),
    ...reports.map(r => ({ kind: "report" as const, id: r.id, title: r.title ?? "분석 리포트 발간", date: r.created_at })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length === 0) return null;
  const shown = entries.slice(0, visible);

  return (
    <div>
      <span className="text-[11px] text-outline font-bold uppercase tracking-widest">
        타임라인
      </span>
      <ul className="relative mt-3 space-y-4 before:absolute before:left-[3px] before:top-1.5
                     before:bottom-1.5 before:w-px before:bg-outline-variant">
        {shown.map(e => (
          <li key={`${e.kind}-${e.id}`} className="relative pl-4">
            <span
              className="absolute left-0 top-[5px] w-[7px] h-[7px] rounded-full"
              style={{ backgroundColor: e.kind === "report" ? "#e5654b" : "#16243f" }}
            />
            <button
              onClick={() => (e.kind === "news" ? onOpenNews(e.id) : onOpenReport())}
              className="text-left group w-full rounded-md px-2 py-1.5 -ml-2 border border-transparent
                         hover:border-outline-variant hover:bg-surface-container-low/60 transition-colors"
            >
              <span className="block text-[10px] leading-tight text-on-surface-variant">
                {fmtDate(e.date)} · {e.kind === "report" ? "리포트" : "뉴스"}
              </span>
              <span className="block text-[12px] leading-snug text-on-surface line-clamp-2
                               group-hover:text-primary transition-colors mt-0.5">
                {e.title}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {visible < entries.length && (
        <button
          onClick={() => setVisible(v => v + PAGE)}
          className="mt-3 ml-4 inline-flex items-center gap-0.5 text-[11px] font-medium text-on-surface-variant
                     hover:text-primary transition-colors"
        >
          더보기
          <span className="material-symbols-outlined text-[13px]">expand_more</span>
        </button>
      )}
    </div>
  );
}
