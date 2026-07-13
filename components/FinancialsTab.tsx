"use client";

// 탭 3: 재무제표 — 표 선택(손익/재무상태/현금흐름) + 연간/분기 토글
// 컬럼: [TTM | 연도들] 또는 [TTM | 분기들] (최신 좌측), 항목 ▶ 펼침/접기
import React, { useState } from "react";
import type { StatementsData, StmtItem, StmtTable } from "@/lib/types";
import { formatKrw } from "@/lib/format";

function Row({ item, cols, depth, expanded, onToggle }: {
  item: StmtItem;
  cols: string[];
  depth: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = (item.children?.length ?? 0) > 0;
  return (
    <>
      <tr className={`border-b border-surface-container-high ${depth > 0 ? "bg-surface-container-low/60" : ""}`}>
        <td
          className={`px-4 py-2 sticky left-0 ${depth > 0 ? "bg-surface-container-low" : "bg-white"} ${
            item.emph ? "font-semibold text-on-surface" : "text-on-surface-variant"
          }`}
          style={{ paddingLeft: `${16 + depth * 22}px` }}
        >
          {hasChildren ? (
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors text-left"
            >
              <span className="text-[10px] w-3 inline-block text-outline">
                {expanded ? "▼" : "▶"}
              </span>
              {item.name}
            </button>
          ) : (
            <span className={depth > 0 ? "" : "ml-[18px] inline-block"}>{item.name}</span>
          )}
        </td>
        {item.values.map((v, i) => (
          <td
            key={cols[i]}
            className={`text-right px-4 py-2 tabular-nums ${
              v != null && v < 0 ? "text-stock-down" : "text-on-surface-variant"
            } ${item.emph ? "font-semibold" : ""}`}
          >
            {formatKrw(v)}
          </td>
        ))}
      </tr>
      {hasChildren && expanded &&
        item.children!.map(c => (
          <Row key={c.name} item={c} cols={cols} depth={depth + 1} expanded={false} onToggle={() => {}} />
        ))}
    </>
  );
}

function Table({ table, cols }: { table: StmtTable; cols: string[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }));

  return (
    <div className="overflow-x-auto bg-white border border-outline-variant rounded-sm">
      <table className="w-full text-[13px] whitespace-nowrap">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            <th className="text-left px-4 py-3 font-medium text-on-surface-variant sticky left-0 bg-surface-container-low min-w-[220px]">
              계정
            </th>
            {cols.map(c => (
              <th key={c} className="text-right px-4 py-3 font-medium text-on-surface-variant min-w-[92px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.blocks.map((block, bi) => (
            <React.Fragment key={bi}>
              {bi > 0 && (
                <tr aria-hidden>
                  <td colSpan={cols.length + 1} className="border-t-4 border-double border-outline-variant p-0" />
                </tr>
              )}
              {block.map(item => (
                <Row
                  key={`${bi}|${item.name}`}
                  item={item}
                  cols={cols}
                  depth={0}
                  expanded={!!open[`${bi}|${item.name}`]}
                  onToggle={() => toggle(`${bi}|${item.name}`)}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STMT_TITLES = ["손익계산서", "재무상태표", "현금흐름표"];

export default function FinancialsTab({ data }: { data: StatementsData }) {
  const [stmt, setStmt] = useState(0);          // 0 손익 / 1 재무상태 / 2 현금흐름
  const [freq, setFreq] = useState<"annual" | "quarterly">("annual");

  const view = data[freq];
  const table = view.tables[stmt];

  return (
    <div className="max-w-[880px] mx-auto">
      <h1 className="font-serif text-3xl font-semibold text-primary mb-2">재무제표</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        연결 기준 · ▶ 를 누르면 세부항목이 펼쳐져요 · TTM = 최근 4개 분기(재무상태표는 최근 분기말) · 출처: DART
      </p>

      {/* 컨트롤: 표 선택 + 연간/분기 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 border-b border-outline-variant">
          {STMT_TITLES.map((t, i) => (
            <button
              key={t}
              onClick={() => setStmt(i)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                stmt === i
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-outline-variant overflow-hidden text-sm">
          {([["annual", "연간"], ["quarterly", "분기"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFreq(k)}
              className={`px-4 py-1.5 font-medium transition-colors ${
                freq === k
                  ? "bg-primary-fixed text-on-primary-fixed"
                  : "bg-white text-on-surface-variant hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {table ? (
        <Table key={`${freq}|${stmt}`} table={table} cols={view.cols} />
      ) : (
        <p className="text-sm text-on-surface-variant py-10 text-center">데이터가 없습니다.</p>
      )}
    </div>
  );
}
