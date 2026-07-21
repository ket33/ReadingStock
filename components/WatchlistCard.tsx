"use client";

// 워치리스트 카드 — 아코디언 한 칸. 헤더(이름·개수·편집·삭제·펼침)를 누르면
// 그 리스트의 종목표(스크리너식 필터·정렬·컬럼 + 종목추가 + 비중편집 + 성과·업종)가 펼쳐진다.
// 여러 카드를 동시에 펼칠 수 있도록, 카드 안쪽 상태는 전부 이 컴포넌트가 자체 관리한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { ScreenerRow } from "@/lib/screener-data";
import { type MetricDef, CATS, METRICS, BY_KEY, fmtCell } from "@/lib/metrics-catalog";
import { type MetricFilter, COL_PRESETS, passes, presetActive } from "@/lib/screener-filter";
import { formatPrice } from "@/lib/format";
import WatchlistPerformance from "./WatchlistPerformance";
import ConfirmDialog from "./ConfirmDialog";

interface WatchList { id: number; name: string; }
type Row = ScreenerRow & { weight: number | null };
interface Candidate { stockCode: string; name: string; sector: string | null; }

function fmtChange(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  const cls = v > 0 ? "text-stock-up" : v < 0 ? "text-stock-down" : "text-on-surface-variant";
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, cls };
}

export default function WatchlistCard({
  list, userId, open, onToggle, onRenamed, onRequestDelete,
}: {
  list: WatchList;
  userId: string;
  open: boolean;
  onToggle: () => void;
  onRenamed: (id: number, name: string) => void;
  onRequestDelete: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 이름 편집
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);

  // 필터/정렬/컬럼 (스크리너식) — 카드마다 독립
  const [filters, setFilters] = useState<MetricFilter[]>([]);
  const [marketSel, setMarketSel] = useState<Set<string> | null>(null);
  const [sectorSel, setSectorSel] = useState<Set<string> | null>(null);
  const [colPreset, setColPreset] = useState("기본");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // 종목 추가 검색
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // 비중 편집
  const [weightEdit, setWeightEdit] = useState(false);
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  // 종목 빼기 확인
  const [removeTarget, setRemoveTarget] = useState<{ code: string; name: string } | null>(null);

  // ── 종목 로드 (처음 펼칠 때 lazy, 이후 캐시) ──
  const loadRows = async () => {
    const sb = supabaseBrowser();
    const { data: wl } = await sb.from("watchlist")
      .select("stock_code,weight,created_at")
      .eq("list_id", list.id)
      .order("created_at", { ascending: false });
    const items = (wl ?? []).map(r => ({
      stock_code: r.stock_code as string,
      weight: (r.weight as number | null) ?? null,
    }));
    if (items.length === 0) { setRows([]); setLoaded(true); return; }
    const { data: sc } = await sb.from("screener").select("*")
      .in("stock_code", items.map(i => i.stock_code));
    const byCode = new Map((sc ?? []).map(s => [s.stock_code as string, s as ScreenerRow]));
    const merged: Row[] = items.map(i => {
      const s = byCode.get(i.stock_code);
      return { ...(s ?? ({ stock_code: i.stock_code, name: i.stock_code } as ScreenerRow)), weight: i.weight };
    });
    setRows(merged);
    setLoaded(true);
  };

  useEffect(() => {
    if (open && !loaded) loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  // 검색 디바운스
  useEffect(() => {
    if (!q.trim()) { setCands([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setCands((json.results ?? []) as Candidate[]);
      } catch { setCands([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) { setAddOpen(false); setQ(""); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── 이름 편집 ──
  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === list.name) { setEditingName(false); return; }
    await supabaseBrowser().from("watchlists").update({ name }).eq("id", list.id);
    onRenamed(list.id, name);
    setEditingName(false);
  };

  // ── 종목 추가/빼기 ──
  const addStock = async (code: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("watchlist")
      .insert({ user_id: userId, list_id: list.id, stock_code: code });
    if (!error || error.code === "23505") { setQ(""); setAddOpen(false); await loadRows(); }
    setBusy(false);
  };

  const removeStock = async (code: string) => {
    await supabaseBrowser().from("watchlist").delete()
      .eq("list_id", list.id).eq("stock_code", code);
    setRows(rs => (rs ?? []).filter(r => r.stock_code !== code));
    setRemoveTarget(null);
  };

  // ── 비중 편집 ──
  const startWeightEdit = () => {
    if (!rows || rows.length === 0) return;
    const hasCustom = rows.some(r => r.weight != null);
    const equal = Math.round((100 / rows.length) * 10) / 10;
    const draft: Record<string, string> = {};
    for (const r of rows) draft[r.stock_code] = hasCustom ? String(r.weight ?? 0) : String(equal);
    setWeightDraft(draft);
    setWeightEdit(true);
  };
  const weightSum = useMemo(
    () => Object.values(weightDraft).reduce((a, v) => a + (parseFloat(v) || 0), 0),
    [weightDraft]);
  const saveWeights = async () => {
    if (!rows) return;
    const sb = supabaseBrowser();
    const next = rows.map(r => {
      const v = parseFloat(weightDraft[r.stock_code]);
      return { ...r, weight: Number.isFinite(v) && v > 0 ? v : null };
    });
    await Promise.all(next.map(r =>
      sb.from("watchlist").update({ weight: r.weight })
        .eq("list_id", list.id).eq("stock_code", r.stock_code)));
    setRows(next);
    setWeightEdit(false);
  };
  const resetWeights = async () => {
    if (!rows) return;
    await supabaseBrowser().from("watchlist").update({ weight: null }).eq("list_id", list.id);
    setRows(rows.map(r => ({ ...r, weight: null })));
    setWeightEdit(false);
  };
  const effectiveWeight = (r: Row): string => {
    if (!rows) return "—";
    const hasCustom = rows.some(x => x.weight != null);
    if (!hasCustom) return "동일";
    if (r.weight == null) return "제외";
    const sum = rows.reduce((a, x) => a + (x.weight ?? 0), 0);
    return sum > 0 ? `${Math.round((r.weight / sum) * 1000) / 10}%` : "—";
  };

  // ── 필터·정렬 적용 ──
  const markets = useMemo(
    () => [...new Set((rows ?? []).map(r => r.market).filter((m): m is string => !!m))]
      .sort((a, b) => (a === "KOSPI" ? -1 : b === "KOSPI" ? 1 : a.localeCompare(b))),
    [rows]);
  const sectors = useMemo(
    () => [...new Set((rows ?? []).map(r => r.sector).filter((s): s is string => !!s))].sort(),
    [rows]);

  const cols = useMemo(() => {
    const base = COL_PRESETS.find(p => p.name === colPreset)?.cols ?? ["market_cap"];
    const withF = [...base];
    for (const f of filters) if (!withF.includes(f.key)) withF.push(f.key);
    return withF.map(k => BY_KEY.get(k)!).filter(Boolean);
  }, [colPreset, filters]);

  const view = useMemo(() => {
    let out = rows ?? [];
    if (marketSel && marketSel.size > 0) out = out.filter(r => r.market != null && marketSel.has(r.market));
    if (sectorSel && sectorSel.size > 0) out = out.filter(r => r.sector != null && sectorSel.has(r.sector));
    for (const f of filters) out = out.filter(r => passes(r, f));
    if (sort) {
      const def = BY_KEY.get(sort.key);
      if (def) out = [...out].sort((a, b) => {
        const av = a[def.key] as number | null, bv = b[def.key] as number | null;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sort.dir === "desc" ? bv - av : av - bv;
      });
    }
    return out;
  }, [rows, marketSel, sectorSel, filters, sort]);

  const toggleSort = (key: string) =>
    setSort(s => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleMetric = (key: string) =>
    setFilters(fs => fs.some(f => f.key === key) ? fs.filter(f => f.key !== key) : [...fs, { key, min: "", max: "" }]);
  const updateFilter = (i: number, patch: Partial<MetricFilter>) =>
    setFilters(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const toggleIn = (set: Set<string>, v: string) => {
    const next = new Set(set); next.has(v) ? next.delete(v) : next.add(v); return next;
  };
  const hasAnyFilter = filters.length > 0 || marketSel != null || sectorSel != null;

  const sectorComp = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const count = new Map<string, number>();
    for (const r of rows) { const s = r.sector ?? "기타"; count.set(s, (count.get(s) ?? 0) + 1); }
    return [...count.entries()]
      .map(([sector, n]) => ({ sector, n, pct: Math.round((n / rows.length) * 100) }))
      .sort((a, b) => b.n - a.n);
  }, [rows]);
  const perfItems = useMemo(() => (rows ?? []).map(r => ({ code: r.stock_code, weight: r.weight })), [rows]);

  return (
    <div className="border border-outline-variant rounded-xl bg-white overflow-hidden">
      {/* ── 헤더 ── */}
      <div className="flex items-center gap-2 px-4 py-3">
        {editingName ? (
          <>
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
              onClick={e => e.stopPropagation()}
              autoFocus maxLength={30}
              className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm focus:outline-none focus:border-primary w-48"
            />
            <button onClick={saveName} className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary">저장</button>
            <button onClick={() => { setEditingName(false); setNameDraft(list.name); }}
                    className="px-2.5 py-1.5 rounded-full text-xs text-on-surface-variant hover:bg-surface-container-low">취소</button>
          </>
        ) : (
          <>
            <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <span className={`material-symbols-outlined text-[20px] text-on-surface-variant transition-transform ${open ? "rotate-90" : ""}`}>
                chevron_right
              </span>
              <span className="font-semibold text-primary truncate">{list.name}</span>
              <span className="text-xs text-outline shrink-0">
                {loaded && rows ? `${rows.length}종목` : ""}
              </span>
            </button>
            <button onClick={() => { setNameDraft(list.name); setEditingName(true); }}
                    title="이름 바꾸기"
                    className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[15px] align-middle">edit</span>
            </button>
            <button onClick={onRequestDelete} title="리스트 삭제"
                    className="text-on-surface-variant hover:text-error transition-colors">
              <span className="material-symbols-outlined text-[15px] align-middle">delete</span>
            </button>
          </>
        )}
      </div>

      {/* ── 펼침 본문 ── */}
      {open && (
        <div className="border-t border-outline-variant px-4 py-4">
          {/* 툴바: 종목추가 · 필터 · (필터 시) 초기화 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div ref={addRef} className="relative">
              <button
                onClick={() => setAddOpen(o => !o)}
                className="inline-flex items-center gap-1 pl-2.5 pr-3.5 py-1.5 text-xs font-medium rounded-full
                           bg-primary text-on-primary hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>종목 추가
              </button>
              {addOpen && (
                <div className="absolute z-40 mt-1 w-72 bg-white border border-outline-variant rounded-lg shadow-lg">
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    autoFocus
                    placeholder="회사명·종목코드로 검색"
                    className="w-full px-3 py-2.5 text-sm border-b border-outline-variant rounded-t-lg focus:outline-none"
                  />
                  <div className="max-h-64 overflow-y-auto">
                    {q.trim() && cands.length === 0 && (
                      <p className="px-3 py-3 text-xs text-on-surface-variant">
                        분석된 종목 중에 없어요. (담을 수 있는 건 분석글이 있는 종목이에요)
                      </p>
                    )}
                    {cands.map(c => {
                      const already = (rows ?? []).some(r => r.stock_code === c.stockCode);
                      return (
                        <button
                          key={c.stockCode}
                          disabled={already || busy}
                          onClick={() => addStock(c.stockCode)}
                          className="w-full flex items-baseline justify-between gap-2 px-3 py-2.5 text-left
                                     hover:bg-surface-container-low disabled:opacity-40"
                        >
                          <span className="flex items-baseline gap-1.5 min-w-0">
                            <span className="font-medium text-primary truncate">{c.name}</span>
                            <span className="text-[11px] text-on-surface-variant shrink-0">{c.stockCode}</span>
                          </span>
                          <span className="text-[11px] shrink-0 text-outline">{already ? "담김" : "추가"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setFilterPanelOpen(o => !o)}
              className={`inline-flex items-center gap-1 pl-2.5 pr-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                filterPanelOpen || hasAnyFilter
                  ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed"
                  : "bg-white text-on-surface-variant border-outline-variant hover:text-primary hover:border-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              필터{hasAnyFilter ? ` ${filters.length + (marketSel != null ? 1 : 0) + (sectorSel != null ? 1 : 0)}` : ""}
            </button>
            {hasAnyFilter && (
              <button onClick={() => { setFilters([]); setMarketSel(null); setSectorSel(null); }}
                      className="text-xs text-on-surface-variant hover:text-error inline-flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">restart_alt</span>초기화
              </button>
            )}
          </div>

          {/* 필터 패널 (인라인 접이식) */}
          {filterPanelOpen && (
            <div className="border border-outline-variant rounded-lg bg-surface-container-lowest p-3 mb-3 space-y-3">
              {/* 활성 필터 행 */}
              {marketSel != null && (
                <FilterRow label="시장" onRemove={() => setMarketSel(null)}>
                  {markets.map(mk => (
                    <Chip key={mk} on={marketSel.has(mk)} onClick={() => setMarketSel(s => toggleIn(s!, mk))}>{mk}</Chip>
                  ))}
                </FilterRow>
              )}
              {sectorSel != null && (
                <FilterRow label="업종" onRemove={() => setSectorSel(null)}>
                  {sectors.map(s => (
                    <Chip key={s} on={sectorSel.has(s)} onClick={() => setSectorSel(p => toggleIn(p!, s))}>{s}</Chip>
                  ))}
                </FilterRow>
              )}
              {filters.map((f, i) => {
                const def = BY_KEY.get(f.key)!;
                return (
                  <FilterRow key={f.key}
                    label={def.cat === "수익률" ? `수익률 ${def.label}` : def.label}
                    onRemove={() => setFilters(fs => fs.filter((_, j) => j !== i))}>
                    <input type="number" placeholder="최소" value={f.min}
                           onChange={e => updateFilter(i, { min: e.target.value })}
                           className="w-20 px-2 py-1 text-xs border border-outline-variant rounded-md bg-white focus:outline-none focus:border-primary tabular-nums" />
                    <span className="text-xs text-outline">~</span>
                    <input type="number" placeholder="최대" value={f.max}
                           onChange={e => updateFilter(i, { max: e.target.value })}
                           className="w-20 px-2 py-1 text-xs border border-outline-variant rounded-md bg-white focus:outline-none focus:border-primary tabular-nums" />
                    <span className="text-xs text-on-surface-variant">{def.unit}</span>
                    {def.p && (
                      <span className="flex flex-wrap gap-1 sm:ml-1">
                        {def.p.map(p => (
                          <Chip key={p.l} small on={presetActive(f, p)}
                                onClick={() => updateFilter(i, { min: p.min != null ? String(p.min) : "", max: p.max != null ? String(p.max) : "" })}>
                            {p.l}
                          </Chip>
                        ))}
                      </span>
                    )}
                  </FilterRow>
                );
              })}

              {/* 지표 고르기 */}
              <details className="text-xs">
                <summary className="cursor-pointer text-primary font-medium select-none">+ 조건 추가</summary>
                <div className="mt-2 space-y-2.5">
                  <div>
                    <div className="text-[11px] font-semibold text-primary mb-1">기본</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                      <Check on={marketSel != null} onChange={() => setMarketSel(s => (s == null ? new Set() : null))}>시장</Check>
                      <Check on={sectorSel != null} onChange={() => setSectorSel(s => (s == null ? new Set() : null))}>업종</Check>
                    </div>
                  </div>
                  {CATS.map(cat => (
                    <div key={cat}>
                      <div className="text-[11px] font-semibold text-primary mb-1">{cat}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                        {METRICS.filter(m => m.cat === cat).map(m => (
                          <Check key={m.key as string} on={filters.some(f => f.key === m.key)}
                                 onChange={() => toggleMetric(m.key as string)}>{m.label}</Check>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* 컬럼 프리셋 */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            {COL_PRESETS.map(p => (
              <button key={p.name} onClick={() => setColPreset(p.name)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                        colPreset === p.name ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                      }`}>
                {p.name}
              </button>
            ))}
          </div>

          {/* 표 */}
          {rows == null ? (
            <p className="text-sm text-outline py-8 text-center">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-on-surface-variant">
              담은 종목이 없어요. 위 <span className="text-primary font-medium">종목 추가</span>로 담아보세요.
            </div>
          ) : (
            <>
              <div className="border border-outline-variant rounded-lg overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-max">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-low">
                      <th className="sticky left-0 z-10 bg-surface-container-low text-left px-3 py-2 text-xs font-medium text-on-surface-variant">종목</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-on-surface-variant whitespace-nowrap">비중</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-on-surface-variant whitespace-nowrap">현재가</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-on-surface-variant whitespace-nowrap">등락</th>
                      {cols.map(def => {
                        const sorted = sort?.key === (def.key as string);
                        return (
                          <th key={def.key as string} onClick={() => toggleSort(def.key as string)}
                              className={`text-right px-3 py-2 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:text-primary ${sorted ? "text-primary" : "text-on-surface-variant"}`}>
                            {def.cat === "수익률" ? `수익률 ${def.label}` : def.label}
                            {sorted && <span className="material-symbols-outlined text-[13px] align-[-2px] ml-0.5">{sort!.dir === "desc" ? "arrow_downward" : "arrow_upward"}</span>}
                          </th>
                        );
                      })}
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {view.map(r => {
                      const chg = fmtChange(r.ret_1d);
                      return (
                        <tr key={r.stock_code}
                            onClick={() => { if (!weightEdit) router.push(`/stock/${r.stock_code}`); }}
                            className={`border-b border-outline-variant last:border-b-0 group ${weightEdit ? "" : "cursor-pointer hover:bg-surface-container-low"}`}>
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-surface-container-low px-3 py-2.5 transition-colors">
                            <div className="font-medium text-primary whitespace-nowrap">
                              {r.name}<span className="text-[11px] text-on-surface-variant font-normal ml-1.5">{r.stock_code}</span>
                            </div>
                            {r.sector && <div className="text-[11px] text-outline">{r.sector}</div>}
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums whitespace-nowrap text-on-surface-variant">
                            {weightEdit ? (
                              <span className="inline-flex items-center gap-0.5">
                                <input type="number" min={0} max={100} step={0.5}
                                       value={weightDraft[r.stock_code] ?? ""}
                                       onChange={e => setWeightDraft(d => ({ ...d, [r.stock_code]: e.target.value }))}
                                       onClick={e => e.stopPropagation()}
                                       className="w-14 px-1.5 py-1 rounded border border-outline-variant text-right text-sm focus:outline-none focus:border-primary" />%
                              </span>
                            ) : effectiveWeight(r)}
                          </td>
                          <td className="text-right px-3 py-2.5 tabular-nums whitespace-nowrap font-medium text-on-surface">{formatPrice(r.price)}</td>
                          <td className={`text-right px-3 py-2.5 tabular-nums whitespace-nowrap ${chg.cls}`}>{chg.text}</td>
                          {cols.map(def => {
                            const { text, cls } = fmtCell(def, r[def.key] as number | null);
                            return <td key={def.key as string} className={`text-right px-3 py-2.5 tabular-nums whitespace-nowrap ${cls}`}>{text}</td>;
                          })}
                          <td className="px-2 py-2.5 text-right">
                            <button onClick={e => { e.stopPropagation(); setRemoveTarget({ code: r.stock_code, name: r.name }); }}
                                    title="이 리스트에서 빼기"
                                    className="text-[#f2b01e] hover:text-outline text-base transition-colors">★</button>
                          </td>
                        </tr>
                      );
                    })}
                    {view.length === 0 && (
                      <tr><td colSpan={cols.length + 5} className="px-4 py-8 text-center text-sm text-on-surface-variant">조건에 맞는 종목이 없어요.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 비중 편집 컨트롤 */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {weightEdit ? (
                  <>
                    <span className={`text-xs tabular-nums ${Math.abs(weightSum - 100) < 0.01 ? "text-on-surface-variant" : "text-error"}`}>
                      합계 {Math.round(weightSum * 10) / 10}%{Math.abs(weightSum - 100) >= 0.01 && " (비율대로 환산돼요)"}
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button onClick={resetWeights} className="px-3 py-1.5 rounded-full text-xs text-on-surface-variant hover:bg-surface-container-low">동일가중으로</button>
                      <button onClick={() => setWeightEdit(false)} className="px-3 py-1.5 rounded-full text-xs text-on-surface-variant hover:bg-surface-container-low">취소</button>
                      <button onClick={saveWeights} className="px-4 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary">비중 저장</button>
                    </span>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-outline">* 지표는 스크리너 스냅샷 기준. 등락은 전일 대비.</p>
                    <button onClick={startWeightEdit}
                            className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary">
                      구성비율 설정
                    </button>
                  </>
                )}
              </div>

              <WatchlistPerformance items={perfItems} />

              {sectorComp.length > 0 && (
                <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 mt-4">
                  <h3 className="text-xs font-semibold tracking-widest uppercase text-primary mb-3">업종 구성</h3>
                  <div className="space-y-2">
                    {sectorComp.map(s => (
                      <div key={s.sector} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs text-on-surface-variant truncate">{s.sector}</span>
                        <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-on-surface-variant">{s.n}종목·{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget != null}
        message={removeTarget ? `${removeTarget.name}을(를) 이 리스트에서 뺄까요?` : ""}
        confirmLabel="빼기"
        onConfirm={() => removeTarget && removeStock(removeTarget.code)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

// ── 작은 프레젠테이션 헬퍼 ──
function FilterRow({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-on-surface w-full sm:w-20 shrink-0">{label}</span>
      {children}
      <button onClick={onRemove} aria-label={`${label} 제거`}
              className="material-symbols-outlined text-[15px] text-outline hover:text-error ml-auto sm:ml-0">close</button>
    </div>
  );
}
function Chip({ on, small, onClick, children }: { on: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className={`${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} rounded-full border transition-colors ${
              on ? "bg-primary-fixed text-on-primary-fixed border-primary-fixed font-medium"
                 : "bg-white text-on-surface-variant border-outline-variant hover:text-primary"}`}>
      {children}
    </button>
  );
}
function Check({ on, onChange, children }: { on: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 py-0.5 text-xs text-on-surface cursor-pointer hover:text-primary">
      <input type="checkbox" checked={on} onChange={onChange} className="w-3.5 h-3.5 accent-primary shrink-0" />
      {children}
    </label>
  );
}
