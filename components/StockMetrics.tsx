"use client";

// 종목 헤더 지표 줄 — 스크리너 스냅샷 값(fmtCell 공용)을 칩으로 표시.
// 편집 버튼: 로그인 회원만 지표 구성을 바꿀 수 있고(비회원은 로그인 유도),
// 선택 목록은 user_metric_prefs(RLS 본인 것만)에 계정 단위로 저장된다.
import { useEffect, useState } from "react";
import type { ScreenerRow } from "@/lib/screener-data";
import { CATS, METRICS, BY_KEY, fmtCell } from "@/lib/metrics-catalog";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";

// 기본 표시 지표 (시가총액·PER·매출성장 3Y·영업이익률·ROE)
const DEFAULT_KEYS = ["market_cap", "per", "revenue_growth_3y", "op_margin", "roe"];

/** 지표 하나를 표시할지 — 값 없으면(N/A) 숨김, 밸류에이션 배수의 음수(적자)도 숨김.
 *  마진·성장률·수익률의 음수(적자·역성장)는 정상 정보라 표시한다. */
function showable(key: string, screener: ScreenerRow | null): boolean {
  const def = BY_KEY.get(key);
  if (!def || !screener) return false;
  const v = screener[def.key] as number | null;
  if (v == null) return false;
  if (def.cat === "밸류에이션" && v < 0) return false; // 배수가 음수 = 무의미
  return true;
}

function Chip({ metricKey, screener, first }: {
  metricKey: string; screener: ScreenerRow | null; first: boolean;
}) {
  const def = BY_KEY.get(metricKey)!;
  const cell = fmtCell(def, (screener![def.key] as number | null));
  return (
    <div className={`flex flex-col leading-tight pr-4 ${first ? "" : "pl-4 border-l border-outline-variant"}`}>
      <span className="text-[10px] font-medium text-on-surface-variant tracking-wide">{def.label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${cell.cls}`}>{cell.text}</span>
    </div>
  );
}

export default function StockMetrics({ screener }: { screener: ScreenerRow | null }) {
  const { user, openSignIn } = useAuth();
  const [keys, setKeys] = useState<string[]>(DEFAULT_KEYS);
  const [editing, setEditing] = useState(false);

  // 회원이면 저장된 구성 로드, 아니면 기본
  useEffect(() => {
    if (!user) { setKeys(DEFAULT_KEYS); return; }
    let alive = true;
    supabaseBrowser().from("user_metric_prefs").select("metric_keys")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const saved = (data?.metric_keys ?? []).filter((k: string) => BY_KEY.has(k));
        setKeys(saved.length ? saved : DEFAULT_KEYS);
      });
    return () => { alive = false; };
  }, [user]);

  const visible = keys.filter(k => showable(k, screener));

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex flex-wrap items-center">
        {visible.map((k, i) => (
          <Chip key={k} metricKey={k} screener={screener} first={i === 0} />
        ))}
      </div>

      <button
        onClick={() => (user ? setEditing(true) : openSignIn())}
        title={user ? "지표 편집" : "로그인하고 지표 편집"}
        className="inline-flex items-center gap-0.5 pl-2 pr-1 py-1 text-[11px] text-outline
                   hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[13px]">add</span>
        필터 추가
      </button>

      {editing && user && (
        <MetricPicker
          initial={keys}
          onClose={() => setEditing(false)}
          onSave={async next => {
            setKeys(next.length ? next : DEFAULT_KEYS);
            setEditing(false);
            await supabaseBrowser().from("user_metric_prefs").upsert({
              user_id: user.id,
              metric_keys: next,
              updated_at: new Date().toISOString(),
            });
          }}
        />
      )}
    </div>
  );
}

// ── 지표 선택 모달 (스크리너 카탈로그 재사용, 카테고리별 체크박스) ──
function MetricPicker({ initial, onClose, onSave }: {
  initial: string[];
  onClose: () => void;
  onSave: (keys: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const toggle = (k: string) => setSel(s => {
    const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  // 저장 시 카탈로그 순서로 정렬(예측 가능한 나열)
  const save = () => onSave(METRICS.map(m => m.key as string).filter(k => sel.has(k)));

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 overflow-y-auto"
         role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 rs-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col rs-pop-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h2 className="font-serif text-base font-semibold text-primary">표시할 지표 선택</h2>
          <span className="text-xs text-outline">{sel.size}개 선택</span>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {CATS.map(cat => (
            <div key={cat}>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-outline mb-2">{cat}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {METRICS.filter(m => m.cat === cat).map(m => {
                  const k = m.key as string;
                  const on = sel.has(k);
                  return (
                    <label key={k} className="flex items-center gap-2 cursor-pointer text-sm text-on-surface py-0.5">
                      <input type="checkbox" checked={on} onChange={() => toggle(k)}
                             className="w-4 h-4 accent-[#16243f]" />
                      <span className={on ? "text-primary font-medium" : ""}>{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant">
          <button onClick={onClose}
                  className="px-4 py-2 rounded-full text-sm font-medium text-on-surface-variant hover:text-primary">
            취소
          </button>
          <button onClick={save}
                  className="px-5 py-2 rounded-full text-sm font-semibold bg-primary text-on-primary hover:opacity-90">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
