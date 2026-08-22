"use client";

// 산업 매출 성장 히트맵 (지시서 §4)
//  - 행 = 산업 그룹, 열 = 최근 11개 분기 (좌→우 시간순), 정렬 = 최신 분기 성장률 내림차순
//  - 색 = 순차형 단일 색상 램프(연한→진한 초록). 발산형을 쓰지 않는 이유:
//    명목 매출은 대부분 플러스라 질문은 "어디가 더 빨리 크나" — 빨강은 마이너스 전용으로 남긴다.
//  - 요약 열(구분선 분리) = 3년 연평균 / 매출성장 기업 N/M
//  - 행 클릭 = 멤버별 성장률 펼침 (개별 종목 페이지 링크) + 산업 페이지 링크
import { useMemo, useState } from "react";
import Link from "next/link";
import type { GrowthData, GrowthRow } from "@/lib/industry-growth-data";
import { formatKrw } from "@/lib/format";

// 순차형 램프 — 성장(플러스)은 빨강 진해짐, 하락(마이너스)은 파랑 진해짐 (사이트 주가 등락 관례).
// 고성장 구간(20/40/70%+)을 세분화해 20%대와 70%가 같은 농도로 뭉개지지 않게 한다.
function cellColor(v: number | null): { bg: string; fg: string } {
  if (v == null) return { bg: "#f3f4f5", fg: "#a5a8ad" };
  if (v < -15) return { bg: "#4d90e6", fg: "#ffffff" };
  if (v < -5) return { bg: "#9dc2f2", fg: "#0c2f5e" };
  if (v < 0) return { bg: "#d9e7f9", fg: "#1d4f8f" };
  if (v < 5) return { bg: "#fdeae8", fg: "#8a2b22" };
  if (v < 10) return { bg: "#f8cdc8", fg: "#7a1f16" };
  if (v < 20) return { bg: "#f0a49c", fg: "#5c130c" };
  if (v < 40) return { bg: "#e5695c", fg: "#ffffff" };
  if (v < 70) return { bg: "#d93025", fg: "#ffffff" };
  return { bg: "#9c1c12", fg: "#ffffff" };
}

function fmtCell(v: number | null): string {
  if (v == null) return "—";
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${s}`;
}

/** '2026Q1' → '26Q1' */
function shortQ(q: string): string {
  return q.slice(2);
}

export default function GrowthHeatmap({ data }: { data: GrowthData }) {
  const { quarters, rows } = data;
  const latest = quarters[quarters.length - 1];
  const [open, setOpen] = useState<Set<number>>(new Set());

  // 정렬: 최신 분기 성장률 내림차순, null은 아래
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a.cells[latest], bv = b.cells[latest];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  }), [rows, latest]);

  const toggle = (id: number) => setOpen(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div>
      <div className="text-right text-[11px] text-outline mb-1 leading-relaxed">
        <div>최근 4개 분기 합산 매출의 전년 동기 대비</div>
        <div>단위: %</div>
      </div>
      {/* 헤더는 '페이지 스크롤' 기준으로 고정한다(top-16 = 사이트 헤더 h-16 바로 아래).
          sticky는 가장 가까운 스크롤 조상을 기준으로 잡으므로, 래퍼에 overflow가 걸려 있으면
          뷰포트가 아니라 그 래퍼가 기준이 돼서 페이지 스크롤엔 반응하지 않는다.
          그래서 표를 감싼 스크롤 컨테이너를 두지 않는다 — 표 안에서 따로 스크롤되지 않게.
          단 좁은 화면에선 표가 화면보다 넓어 가로 스크롤이 필요하므로 lg 미만에서만 살려둔다
          (이때는 래퍼가 스크롤 조상이 되어 헤더 고정은 동작하지 않는다).
          border-collapse에서는 sticky 셀의 테두리가 사라질 수 있어 구분선은 box-shadow로 그린다. */}
      <div className="overflow-x-auto lg:overflow-x-visible rounded-xl border border-outline-variant bg-white">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="sticky left-0 lg:top-16 z-30 bg-surface-container-low text-left px-4 py-2.5
                             text-xs font-medium text-on-surface-variant min-w-[150px]
                             shadow-[inset_0_-1px_0_#c4c6cd]">
                산업
              </th>
              {quarters.map(q => (
                <th key={q} className={`lg:sticky lg:top-16 z-20 bg-surface-container-low shadow-[inset_0_-1px_0_#c4c6cd]
                                        px-1.5 py-2.5 text-center text-[11px] font-medium whitespace-nowrap ${
                  q === latest ? "text-primary font-semibold" : "text-on-surface-variant"
                }`}>
                  {shortQ(q)}
                </th>
              ))}
              <th className="lg:sticky lg:top-16 z-20 bg-surface-container-low px-3 py-2.5 text-right text-[11px]
                             font-medium text-on-surface-variant whitespace-nowrap
                             shadow-[inset_2px_-1px_0_#c4c6cd]">
                3년 연평균
              </th>
              <th className="lg:sticky lg:top-16 z-20 bg-surface-container-low px-3 py-2.5 text-right text-[11px]
                             font-medium text-on-surface-variant whitespace-nowrap
                             shadow-[inset_0_-1px_0_#c4c6cd]">
                매출성장 기업
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <RowBlock key={r.groupId} r={r} quarters={quarters}
                        open={open.has(r.groupId)} onToggle={() => toggle(r.groupId)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowBlock({ r, quarters, open, onToggle }: {
  r: GrowthRow;
  quarters: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const unstable = r.memberCount < 4; // §5: 교집합 4개 미만 — 비율·중앙값 불안정 → 회색 처리
  return (
    <>
      <tr onClick={onToggle}
          className="border-b border-outline-variant/60 cursor-pointer transition-colors hover:bg-surface-container-low group">
        <td className="sticky left-0 z-10 bg-white group-hover:bg-surface-container-low px-4 py-2 transition-colors">
          <span className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-on-surface whitespace-nowrap">{r.name}</span>
            <span className="text-[10px] text-outline">{open ? "▾" : "▸"}</span>
          </span>
        </td>
        {quarters.map(q => {
          const v = r.cells[q];
          const { bg, fg } = cellColor(v);
          return (
            <td key={q} className="p-0.5">
              <div className="rounded-[4px] px-1 py-1.5 text-center text-[11px] font-medium tabular-nums"
                   style={{ backgroundColor: bg, color: fg }}>
                {fmtCell(v)}
              </div>
            </td>
          );
        })}
        <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-on-surface border-l-2 border-outline-variant">
          {r.cagr3y != null ? `${r.cagr3y.toFixed(1)}%` : "—"}
        </td>
        <td className={`px-3 py-2 text-right text-[13px] font-semibold tabular-nums ${unstable ? "text-outline" : "text-on-surface"}`}>
          {r.growersCount != null && r.memberCount > 0 ? `${r.growersCount}/${r.memberCount}` : "—"}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-outline-variant/60 bg-surface-container-lowest">
          {/* 표는 min-w-max로 내용만큼 넓어지므로, 셀에 그냥 넣으면 flex-wrap이 줄바꿈할
              기준 폭이 없어 기업 목록이 한 줄로 뻗고 표 전체가 화면 밖으로 밀린다.
              → sticky left-0 + 뷰포트 최대폭으로 '보이는 영역'에 고정해 그 안에서 줄바꿈.
              (온보딩 확대로 그룹당 기업이 수십 개가 돼도 세로로만 늘어난다) */}
          <td colSpan={quarters.length + 3} className="p-0">
            <div className="sticky left-0 max-w-[calc(100vw-2rem)] md:max-w-[min(calc(100vw-5rem),1200px)] px-4 py-3">
            {/* 동선 의도: 산업을 먼저 훑고 기업으로 — 기업명은 링크가 아니라 참고 표기,
                눈에 띄는 버튼은 산업 페이지 하나만 둔다 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2.5 text-[11px] text-on-surface-variant">
              <Link href={`/industries/${r.groupId}`}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold
                               bg-primary text-on-primary hover:opacity-90 transition-opacity">
                {r.name} 산업 페이지 보기 →
              </Link>
              <span className="text-[13px] font-semibold text-on-surface">
                최근 4분기 매출 합 {formatKrw(r.revenueLtm)}
              </span>
              {r.opmChangePp != null && (
                <span className="text-[13px] font-semibold text-on-surface">
                  영업이익률 {r.opmChangePp > 0 ? "+" : ""}{r.opmChangePp.toFixed(1)}%p
                </span>
              )}
              {unstable && <span className="text-outline">표본 {r.memberCount}개 — 해석 주의</span>}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {/* 매출 큰 순 상위 20개만 — 나머지는 산업 페이지로 (온보딩 확대 대비 상한) */}
              {r.members.slice(0, 20).map(m => (
                <span key={m.code} className="text-[13px] text-on-surface-variant">
                  {m.name}
                  <span className={`ml-1 tabular-nums font-medium ${
                    m.growth > 0 ? "text-[#d93025]" : m.growth < 0 ? "text-[#1a73e8]" : "text-outline"
                  }`}>
                    {m.growth > 0 ? "+" : ""}{m.growth}%
                  </span>
                </span>
              ))}
              {r.members.length > 20 && (
                <span className="text-xs text-outline">
                  외 {r.members.length - 20}개 기업 — 산업 페이지에서 전체 확인
                </span>
              )}
              {r.members.length === 0 && (
                <span className="text-xs text-outline">최신 분기 기업별 데이터 없음</span>
              )}
            </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
