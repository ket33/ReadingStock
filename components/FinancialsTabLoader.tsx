"use client";

// 재무제표 탭 지연 로더 — 탭이 처음 열릴 때 /api/statements/[code]에서 받아온다.
// (세부 계정까지 종목당 최대 3,000행이라 페이지 진입 시 미리 받으면 낭비 —
//  대부분의 방문자는 이 탭을 열지 않는다. 응답은 CDN이 1시간 캐시.)
import { useEffect, useState } from "react";
import type { MetricsRow, StatementsData } from "@/lib/types";
import FinancialsTab from "./FinancialsTab";

export default function FinancialsTabLoader({
  stockCode, latest, isFinancial,
}: {
  stockCode: string;
  latest: (MetricsRow & { label: string }) | null;
  isFinancial: boolean;
}) {
  const [data, setData] = useState<StatementsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/statements/${stockCode}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(json => { if (alive) setData(json as StatementsData); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [stockCode]);

  if (failed) {
    return (
      <p className="py-16 text-center text-sm text-on-surface-variant">
        재무제표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-16 text-center text-sm text-on-surface-variant">
        재무제표를 불러오는 중입니다…
      </p>
    );
  }
  return <FinancialsTab data={data} latest={latest} isFinancial={isFinancial} />;
}
