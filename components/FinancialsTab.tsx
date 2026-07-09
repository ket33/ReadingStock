"use client";

// 탭 3: 재무제표 — 손익·재무상태·현금흐름 3표, 연도별 컬럼, 주요 계정만
import type { StatementsData } from "@/lib/types";
import { formatKrw } from "@/lib/format";

export default function FinancialsTab({ data }: { data: StatementsData }) {
  return (
    <div className="max-w-[880px] mx-auto">
      <h1 className="font-serif text-3xl font-semibold text-primary mb-2">재무제표</h1>
      <p className="text-sm text-on-surface-variant mb-10">
        연간(사업보고서) 연결 기준 · 주요 계정만 표시 · 출처: DART
      </p>

      {data.tables.map(table => (
        <section key={table.title} className="mb-12">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-4 border-l-4 border-primary pl-3">
            {table.title}
          </h2>
          <div className="overflow-x-auto bg-white border border-outline-variant rounded-sm">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="text-left px-4 py-3 font-medium text-on-surface-variant sticky left-0 bg-surface-container-low">
                    계정
                  </th>
                  {data.years.map(y => (
                    <th key={y} className="text-right px-4 py-3 font-medium text-on-surface-variant">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={row.name}
                      className={i < table.rows.length - 1 ? "border-b border-surface-container-high" : ""}>
                    <td className="px-4 py-3 text-on-surface font-medium sticky left-0 bg-white">
                      {row.name}
                    </td>
                    {row.values.map((v, j) => (
                      <td key={j}
                          className={`text-right px-4 py-3 tabular-nums ${
                            v != null && v < 0 ? "text-stock-down" : "text-on-surface-variant"
                          }`}>
                        {formatKrw(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
