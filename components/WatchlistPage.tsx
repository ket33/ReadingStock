"use client";

// 내 관심종목 — everyticker식 단일 뷰. 상단에 [공유🔗] [리스트 선택 ▼] [⋮ 메뉴],
// 아래에 종목표. 리스트는 드롭다운으로 전환/생성하고, 링크로 읽기전용 공유할 수 있다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import WatchlistPerformance from "./WatchlistPerformance";
import WatchlistInsights from "./WatchlistInsights";
import ConfirmDialog from "./ConfirmDialog";
import type { ScreenerRow } from "@/lib/screener-data";
import { fetchGroups } from "@/lib/groups";
import { CATS, METRICS, BY_KEY, fmtCell } from "@/lib/metrics-catalog";
import { formatPrice } from "@/lib/format";

interface WatchList { id: number; name: string; share_token: string | null; metric_cols: string[] | null; }
type Row = ScreenerRow & { weight: number | null };

// 기본 지표 세팅 (손대지 않은 리스트가 보여줄 표 컬럼)
const DEFAULT_COLS = ["per", "op_margin", "roe"];
interface Candidate { stockCode: string; name: string; sector: string | null; }
type Confirm = { kind: "remove"; code: string; name: string } | { kind: "deleteList"; list: WatchList } | null;

export default function WatchlistPage() {
  const { user, loading, openSignIn } = useAuth();
  const router = useRouter();

  const [lists, setLists] = useState<WatchList[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null); // 드롭다운 내 이름 편집 중인 리스트
  const [nameDraft, setNameDraft] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  // 컬럼(지표) 선택 — 워치리스트마다 따로 저장·유지 (watchlists.metric_cols)
  const [extraCols, setExtraCols] = useState<string[]>(DEFAULT_COLS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const listsRef = useRef<WatchList[]>([]);   // 필터 로드 시 최신 리스트 참조(활성 전환 때만 반영)

  // 종목 추가 검색
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // 비중 편집
  const [weightEdit, setWeightEdit] = useState(false);
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  const activeList = lists?.find(l => l.id === activeId) ?? null;

  // ── 리스트 목록 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { if (alive) { setLists(null); setActiveId(null); } return; }
      const { data } = await supabaseBrowser().from("watchlists")
        .select("id,name,share_token,metric_cols").order("created_at", { ascending: true });
      if (!alive) return;
      const ls = (data ?? []) as WatchList[];
      listsRef.current = ls;
      setLists(ls);
      setActiveId(prev => (prev != null && ls.some(l => l.id === prev) ? prev : ls[0]?.id ?? null));
    })();
    return () => { alive = false; };
  }, [user]);

  // ── 선택 리스트의 종목 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user || activeId == null) { if (alive) setRows(null); return; }
      if (alive) { setRows(null); setWeightEdit(false); }
      const sb = supabaseBrowser();
      const { data: wl } = await sb.from("watchlist")
        .select("stock_code,weight,created_at")
        .eq("list_id", activeId).order("created_at", { ascending: false });
      const items = (wl ?? []).map(r => ({ stock_code: r.stock_code as string, weight: (r.weight as number | null) ?? null }));
      if (items.length === 0) { if (alive) setRows([]); return; }
      const { data: sc } = await sb.from("screener").select("*").in("stock_code", items.map(i => i.stock_code));
      const byCode = new Map((sc ?? []).map(s => [s.stock_code as string, s as ScreenerRow]));
      const gmap = await fetchGroups(sb, items.map(i => i.stock_code));
      const merged: Row[] = items.map(i => {
        const s = byCode.get(i.stock_code);
        const g = gmap.get(i.stock_code);
        return { ...(s ?? ({ stock_code: i.stock_code, name: i.stock_code } as ScreenerRow)),
                 groupPrimary: g?.primary ?? null, groups: g?.groups ?? [], weight: i.weight };
      });
      if (alive) setRows(merged);
    })();
    return () => { alive = false; };
  }, [user, activeId]);

  // 리스트 목록이 바뀔 때마다 ref 동기화 (필터 로드가 최신 값을 읽도록)
  useEffect(() => { if (lists) listsRef.current = lists; }, [lists]);

  // 활성 리스트가 바뀔 때만 그 리스트의 저장된 지표 세팅을 불러온다
  // (지표를 토글하면 lists는 바뀌지만 activeId는 그대로라 리셋되지 않는다)
  useEffect(() => {
    if (activeId == null) return;
    const l = listsRef.current.find(x => x.id === activeId);
    setExtraCols(l?.metric_cols ?? DEFAULT_COLS);
    setSort(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

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

  // 바깥 클릭 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (addRef.current && !addRef.current.contains(t)) { setAddOpen(false); setQ(""); }
      if (dropdownRef.current && !dropdownRef.current.contains(t)) { setDropdownOpen(false); setEditingId(null); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── 리스트 CRUD ──
  const createList = async () => {
    if (!user || !lists) return;
    const name = `새 리스트 ${lists.length + 1}`;
    const { data } = await supabaseBrowser().from("watchlists")
      .insert({ user_id: user.id, name }).select("id,name,share_token,metric_cols").single();
    if (data) {
      const nl = data as WatchList;
      setLists([...lists, nl]);
      setActiveId(nl.id);
      setDropdownOpen(false);
    }
  };
  const saveName = async (id: number) => {
    const name = nameDraft.trim();
    const target = lists?.find(l => l.id === id);
    if (!target || !name || name === target.name) { setEditingId(null); return; }
    await supabaseBrowser().from("watchlists").update({ name }).eq("id", id);
    setLists(ls => (ls ?? []).map(l => (l.id === id ? { ...l, name } : l)));
    setEditingId(null);
  };
  const deleteList = async (list: WatchList) => {
    await supabaseBrowser().from("watchlists").delete().eq("id", list.id);
    const rest = (lists ?? []).filter(l => l.id !== list.id);
    setLists(rest);
    setActiveId(prev => (prev === list.id ? rest[0]?.id ?? null : prev));
    setConfirm(null);
  };

  // ── 공유 ──
  const shareLink = async () => {
    if (!activeList) return;
    let token = activeList.share_token;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await supabaseBrowser().from("watchlists").update({ share_token: token }).eq("id", activeList.id);
      setLists(ls => (ls ?? []).map(l => (l.id === activeList.id ? { ...l, share_token: token } : l)));
    }
    const url = `${window.location.origin}/w/${token}`;
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt("아래 링크를 복사하세요", url); return; }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  };

  // ── 종목 추가/빼기 ──
  const addStock = async (code: string) => {
    if (busy || activeId == null || !user) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("watchlist")
      .insert({ user_id: user.id, list_id: activeId, stock_code: code });
    if (!error || error.code === "23505") {
      setQ(""); setAddOpen(false);
      const sb = supabaseBrowser();
      const { data: sc } = await sb.from("screener").select("*").eq("stock_code", code).maybeSingle();
      const g = (await fetchGroups(sb, [code])).get(code);
      setRows(rs => {
        if (rs?.some(r => r.stock_code === code)) return rs;
        const row = { ...((sc as ScreenerRow) ?? ({ stock_code: code, name: code } as ScreenerRow)),
                      groupPrimary: g?.primary ?? null, groups: g?.groups ?? [], weight: null };
        return [row, ...(rs ?? [])];
      });
    }
    setBusy(false);
  };
  const removeItem = async (code: string) => {
    if (activeId == null) return;
    await supabaseBrowser().from("watchlist").delete().eq("list_id", activeId).eq("stock_code", code);
    setRows(rs => (rs ?? []).filter(r => r.stock_code !== code));
    setConfirm(null);
  };

  // ── 비중 편집 ──
  const startWeightEdit = () => {
    if (!rows || rows.length === 0) return;
    const hasCustom = rows.some(r => r.weight != null);
    const equal = Math.round((100 / rows.length) * 10) / 10;
    const draft: Record<string, string> = {};
    for (const r of rows) draft[r.stock_code] = hasCustom ? String(r.weight ?? 0) : String(equal);
    setWeightDraft(draft); setWeightEdit(true);
  };
  const weightSum = useMemo(() => Object.values(weightDraft).reduce((a, v) => a + (parseFloat(v) || 0), 0), [weightDraft]);
  const saveWeights = async () => {
    if (!rows || activeId == null) return;
    const sb = supabaseBrowser();
    const next = rows.map(r => {
      const v = parseFloat(weightDraft[r.stock_code]);
      return { ...r, weight: Number.isFinite(v) && v > 0 ? v : null };
    });
    await Promise.all(next.map(r => sb.from("watchlist").update({ weight: r.weight }).eq("list_id", activeId).eq("stock_code", r.stock_code)));
    setRows(next); setWeightEdit(false);
  };
  const resetWeights = async () => {
    if (!rows || activeId == null) return;
    await supabaseBrowser().from("watchlist").update({ weight: null }).eq("list_id", activeId);
    setRows(rows.map(r => ({ ...r, weight: null }))); setWeightEdit(false);
  };
  const effectiveWeight = (r: Row): string => {
    if (!rows) return "—";
    const hasCustom = rows.some(x => x.weight != null);
    if (!hasCustom) return "동일";
    if (r.weight == null) return "제외";
    const sum = rows.reduce((a, x) => a + (x.weight ?? 0), 0);
    return sum > 0 ? `${Math.round((r.weight / sum) * 1000) / 10}%` : "—";
  };

  // ── 컬럼·정렬 ── (지표 세팅은 활성 리스트에 저장 → 다음에 열어도 그대로)
  const cols = useMemo(() => extraCols.map(k => BY_KEY.get(k)!).filter(Boolean), [extraCols]);
  const persistCols = async (next: string[]) => {
    setExtraCols(next);
    if (activeId == null) return;
    setLists(ls => (ls ?? []).map(l => (l.id === activeId ? { ...l, metric_cols: next } : l)));
    await supabaseBrowser().from("watchlists").update({ metric_cols: next }).eq("id", activeId);
  };
  const toggleCol = (key: string) =>
    persistCols(extraCols.includes(key) ? extraCols.filter(k => k !== key) : [...extraCols, key]);
  const toggleSort = (key: string) =>
    setSort(s => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const view = useMemo(() => {
    let out = rows ?? [];
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
  }, [rows, sort]);

  const perfItems = useMemo(() => (rows ?? []).map(r => ({ code: r.stock_code, weight: r.weight })), [rows]);

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[1200px] mx-auto w-full px-4 md:px-8 py-10">
        {/* ── 상단 바 ── */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary">
            Watching <span className="text-lg md:text-xl font-medium text-on-surface-variant">담아둔 종목</span>
          </h1>

          {user && activeList && (
            <div className="flex items-center gap-2 ml-auto">
              {/* 공유 링크 — 누르면 복사되고 잠깐 체크 표시 */}
              <button onClick={shareLink} title="공유 링크 복사"
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                        shareCopied
                          ? "border-primary text-primary bg-primary-fixed/10"
                          : "border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary"}`}>
                <span className="material-symbols-outlined text-[18px]">{shareCopied ? "check" : "link"}</span>
              </button>

              {/* 리스트 선택 드롭다운 — 이름 바꾸기·삭제를 각 행에서 */}
              <div ref={dropdownRef} className="relative">
                <button onClick={() => { setDropdownOpen(o => !o); setEditingId(null); }}
                        className="inline-flex items-center gap-2 pl-3.5 pr-2.5 h-9 rounded-lg border border-outline-variant
                                   text-sm font-medium text-on-surface hover:border-primary transition-colors bg-white">
                  <span className="max-w-[140px] truncate">{activeList.name}</span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 z-40 mt-1 w-72 bg-white border border-outline-variant rounded-lg shadow-lg py-1">
                    {(lists ?? []).map(l => (
                      editingId === l.id ? (
                        <div key={l.id} className="flex items-center gap-1.5 px-2.5 py-2">
                          <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                                 onKeyDown={e => { if (e.key === "Enter") saveName(l.id); if (e.key === "Escape") setEditingId(null); }}
                                 autoFocus maxLength={30}
                                 className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md border border-outline-variant text-sm focus:outline-none focus:border-primary" />
                          <button onClick={() => saveName(l.id)}
                                  className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary shrink-0">저장</button>
                          <button onClick={() => setEditingId(null)} aria-label="취소"
                                  className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface shrink-0">close</button>
                        </div>
                      ) : (
                        <div key={l.id}
                             className={`group flex items-center gap-1 pl-3.5 pr-2 py-2.5 text-sm transition-colors ${
                               l.id === activeId ? "bg-surface-container-low" : "hover:bg-surface-container-low"}`}>
                          <button onClick={() => { setActiveId(l.id); setDropdownOpen(false); }}
                                  className={`flex items-center gap-1.5 flex-1 min-w-0 text-left ${
                                    l.id === activeId ? "text-primary font-medium" : "text-on-surface"}`}>
                            <span className="truncate">{l.name}</span>
                            {l.share_token && <span className="material-symbols-outlined text-[14px] text-outline shrink-0">link</span>}
                          </button>
                          <button onClick={() => { setNameDraft(l.name); setEditingId(l.id); }} title="이름 바꾸기"
                                  className="p-1 text-on-surface-variant hover:text-primary shrink-0">
                            <span className="material-symbols-outlined text-[15px] align-middle">edit</span>
                          </button>
                          <button onClick={() => { setConfirm({ kind: "deleteList", list: l }); setDropdownOpen(false); }} title="삭제"
                                  className="p-1 text-on-surface-variant hover:text-error shrink-0">
                            <span className="material-symbols-outlined text-[15px] align-middle">delete</span>
                          </button>
                        </div>
                      )
                    ))}
                    <div className="border-t border-outline-variant mt-1 pt-1">
                      <button onClick={createList}
                              className="w-full flex items-center gap-1.5 px-3.5 py-2.5 text-left text-sm text-primary hover:bg-surface-container-low">
                        <span className="material-symbols-outlined text-[18px]">add</span>새 워치리스트
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {loading ? null : !user ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">로그인하면 관심종목을 담고 모아볼 수 있어요.</p>
            <button onClick={openSignIn} className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">시작하기</button>
          </div>
        ) : lists == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : lists.length === 0 ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">아직 워치리스트가 없어요. 첫 리스트를 만들어보세요.</p>
            <button onClick={createList} className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">리스트 만들기</button>
          </div>
        ) : (
          <>
            {/* 툴바: 종목추가(작게) + 지표 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div ref={addRef} className="relative">
                <button onClick={() => setAddOpen(o => !o)}
                        className="inline-flex items-center gap-0.5 pl-2 pr-2.5 py-1 text-xs font-medium rounded-full bg-primary text-on-primary hover:opacity-90 transition-opacity">
                  <span className="material-symbols-outlined text-[14px]">add</span>종목 추가
                </button>
                {addOpen && (
                  <div className="absolute z-40 mt-1 w-72 bg-white border border-outline-variant rounded-lg shadow-lg">
                    <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="회사명·종목코드로 검색"
                           className="w-full px-3 py-2.5 text-sm border-b border-outline-variant rounded-t-lg focus:outline-none" />
                    <div className="max-h-64 overflow-y-auto">
                      {q.trim() && cands.length === 0 && (
                        <p className="px-3 py-3 text-xs text-on-surface-variant">분석된 종목 중에 없어요.</p>
                      )}
                      {cands.map(c => {
                        const already = (rows ?? []).some(r => r.stock_code === c.stockCode);
                        return (
                          <button key={c.stockCode} disabled={already || busy} onClick={() => addStock(c.stockCode)}
                                  className="w-full flex items-baseline justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-container-low disabled:opacity-40">
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

              {/* 필터 — 아웃라인 알약 + 깔때기 아이콘 (picking 버튼과 같은 모양) */}
              <button onClick={() => setPickerOpen(true)}
                      className="inline-flex items-center gap-1.5 pl-3 pr-4 py-1.5 text-xs font-medium rounded-full border
                                 border-outline-variant bg-white text-on-surface hover:text-primary hover:border-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">filter_list</span>
                필터
              </button>
            </div>

            {rows == null ? (
              <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 border border-outline-variant rounded-xl bg-white">
                <p className="text-on-surface-variant">담은 종목이 없어요. 위 <span className="text-primary font-medium">종목 추가</span>로 담아보세요.</p>
              </div>
            ) : (
              <>
                <div className="bg-white overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low">
                        <th className="sticky left-0 z-10 bg-surface-container-low text-left px-4 py-2.5 text-xs font-medium text-on-surface-variant">종목</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-on-surface-variant whitespace-nowrap">비중</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-on-surface-variant whitespace-nowrap">현재가</th>
                        {cols.map(def => {
                          const sorted = sort?.key === (def.key as string);
                          return (
                            <th key={def.key as string} onClick={() => toggleSort(def.key as string)}
                                className={`text-right px-3 py-2.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:text-primary ${sorted ? "text-primary" : "text-on-surface-variant"}`}>
                              {def.cat === "수익률" ? `수익률 ${def.label}` : def.label}
                              {sorted && <span className="material-symbols-outlined text-[13px] align-[-2px] ml-0.5">{sort!.dir === "desc" ? "arrow_downward" : "arrow_upward"}</span>}
                            </th>
                          );
                        })}
                        <th className="px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {view.map(r => {
                        return (
                          <tr key={r.stock_code}
                              onClick={() => { if (!weightEdit) router.push(`/stock/${r.stock_code}`); }}
                              className={`border-b border-outline-variant last:border-b-0 group ${weightEdit ? "" : "cursor-pointer hover:bg-surface-container-low"}`}>
                            <td className="sticky left-0 z-10 bg-white group-hover:bg-surface-container-low px-4 py-1.5 transition-colors">
                              <div className="font-medium text-[#4a8eff] whitespace-nowrap">
                                {r.name}<span className="text-[11px] text-on-surface-variant font-normal ml-1.5">{r.stock_code}</span>
                              </div>
                              {(r.groupPrimary ?? r.sector) && <div className="text-[11px] text-outline">{r.groupPrimary ?? r.sector}</div>}
                            </td>
                            <td className="text-right px-3 py-1.5 tabular-nums whitespace-nowrap text-on-surface-variant">
                              {weightEdit ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <input type="number" min={0} max={100} step={0.5} value={weightDraft[r.stock_code] ?? ""}
                                         onChange={e => setWeightDraft(d => ({ ...d, [r.stock_code]: e.target.value }))}
                                         onClick={e => e.stopPropagation()}
                                         className="w-14 px-1.5 py-1 rounded border border-outline-variant text-right text-sm focus:outline-none focus:border-primary" />%
                                </span>
                              ) : effectiveWeight(r)}
                            </td>
                            <td className="text-right px-3 py-1.5 tabular-nums whitespace-nowrap font-medium text-on-surface">{formatPrice(r.price)}</td>
                            {cols.map(def => {
                              const { text, cls } = fmtCell(def, r[def.key] as number | null);
                              return <td key={def.key as string} className={`text-right px-3 py-1.5 tabular-nums whitespace-nowrap ${cls}`}>{text}</td>;
                            })}
                            <td className="px-2 py-1.5 text-right">
                              <button onClick={e => { e.stopPropagation(); setConfirm({ kind: "remove", code: r.stock_code, name: r.name }); }}
                                      title="이 리스트에서 빼기" className="text-[#f2b01e] hover:text-outline text-lg transition-colors">★</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 비중 편집 */}
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
                    <button onClick={startWeightEdit}
                            className="ml-auto px-3.5 py-1.5 rounded-full text-xs font-medium border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary">
                      구성비율 설정
                    </button>
                  )}
                </div>

                {/* MY News + 업종 비율 (워치리스트 표와 수익률 사이) */}
                <WatchlistInsights items={rows.map(r => ({ code: r.stock_code, name: r.name, sector: r.groupPrimary ?? r.sector, weight: r.weight }))} />

                <WatchlistPerformance items={perfItems} listName={activeList?.name ?? ""} />
              </>
            )}
          </>
        )}
      </main>

      {/* 지표(컬럼) 선택 팝업 — 스크리너 방식 */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true" aria-label="지표 선택">
          <div className="fixed inset-0 bg-primary/40 rs-fade-in" onClick={() => setPickerOpen(false)} />
          <div className="relative min-h-full flex items-start md:items-center justify-center p-4 md:p-8">
            <div className="relative bg-white rounded-xl border border-outline-variant shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col rs-pop-in">
              <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-outline-variant">
                <h2 className="font-serif text-base font-semibold text-primary">표에 넣을 지표 고르기</h2>
                <button onClick={() => setPickerOpen(false)} aria-label="닫기"
                        className="material-symbols-outlined text-[20px] text-outline hover:text-primary transition-colors">close</button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 flex flex-col gap-5">
                {CATS.map(cat => (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-primary mb-2">{cat}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-1.5">
                      {METRICS.filter(m => m.cat === cat && m.key !== "market_cap").map(m => (
                        <label key={m.key as string} className="flex items-center gap-2 py-1 text-xs text-on-surface cursor-pointer hover:text-primary">
                          <input type="checkbox" checked={extraCols.includes(m.key as string)} onChange={() => toggleCol(m.key as string)}
                                 className="w-3.5 h-3.5 accent-primary shrink-0" />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 md:px-6 py-3 border-t border-outline-variant">
                <button onClick={() => persistCols([])} className="text-xs text-on-surface-variant hover:text-error">모두 지우기</button>
                <button onClick={() => setPickerOpen(false)} className="px-5 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary hover:opacity-90">완료</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm != null}
        message={
          confirm?.kind === "remove" ? `${confirm.name}을(를) 이 리스트에서 뺄까요?`
          : confirm?.kind === "deleteList" ? `'${confirm.list.name}' 리스트를 삭제할까요?\n담아둔 종목도 함께 사라져요.`
          : ""
        }
        confirmLabel={confirm?.kind === "deleteList" ? "삭제" : "빼기"}
        onConfirm={() => { if (confirm?.kind === "remove") removeItem(confirm.code); else if (confirm?.kind === "deleteList") deleteList(confirm.list); }}
        onCancel={() => setConfirm(null)}
      />
      <SiteFooter />
    </>
  );
}
