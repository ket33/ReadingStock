"use client";

// 내 관심종목 — 워치리스트 여러 개(이름 편집·삭제) + 종목 표 + 구성비율 설정
// + 성과 차트(시장지표 비교) + 업종 구성. RLS로 본인 것만 조회된다.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import WatchlistPerformance from "./WatchlistPerformance";
import ConfirmDialog from "./ConfirmDialog";
import { formatKrw, formatPrice } from "@/lib/format";

interface WatchList {
  id: number;
  name: string;
}

interface Row {
  stock_code: string;
  name: string;
  sector: string | null;
  weight: number | null;      // 구성비율(%) — null이면 동일가중
  price: number | null;
  ret_1d: number | null;
  market_cap: number | null;
  per: number | null;
  pbr: number | null;
  div_yield: number | null;
}

type Confirm =
  | { kind: "remove"; code: string; name: string }
  | { kind: "deleteList" }
  | null;

/** PER·PBR 표기 — 적자(음수)는 배수로 못 읽으니 '적자'로 */
function fmtMultiple(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  if (v < 0) return { text: "적자", cls: "text-outline" };
  return { text: `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}배`, cls: "text-on-surface-variant" };
}

function fmtChange(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "text-outline" };
  const cls = v > 0 ? "text-stock-up" : v < 0 ? "text-stock-down" : "text-on-surface-variant";
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, cls };
}

export default function WatchlistPage() {
  const { user, loading, openSignIn } = useAuth();
  const router = useRouter();

  const [lists, setLists] = useState<WatchList[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // 리스트 이름 편집
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // 구성비율 편집
  const [weightEdit, setWeightEdit] = useState(false);
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  // ── 리스트 목록 ──────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { if (alive) { setLists(null); setActiveId(null); } return; }
      const { data } = await supabaseBrowser().from("watchlists")
        .select("id,name").order("created_at", { ascending: true });
      if (!alive) return;
      const ls = (data ?? []) as WatchList[];
      setLists(ls);
      setActiveId(prev => (prev != null && ls.some(l => l.id === prev) ? prev : ls[0]?.id ?? null));
    })();
    return () => { alive = false; };
  }, [user]);

  // ── 선택된 리스트의 종목 + 지표 ──────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user || activeId == null) { if (alive) setRows(null); return; }
      if (alive) setRows(null); // 로딩 표시
      const sb = supabaseBrowser();
      const { data: wl } = await sb.from("watchlist")
        .select("stock_code,weight,created_at,companies(name,sector)")
        .eq("list_id", activeId)
        .order("created_at", { ascending: false });
      const base = (wl ?? []).map(r => {
        const c = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as
          { name: string; sector: string | null } | null;
        return {
          stock_code: r.stock_code as string,
          name: c?.name ?? r.stock_code,
          sector: c?.sector ?? null,
          weight: (r.weight as number | null) ?? null,
        };
      });
      if (base.length === 0) { if (alive) setRows([]); return; }

      // 지표는 스크리너 스냅샷(공개 테이블)에서 일괄 조회
      const { data: sc } = await sb.from("screener")
        .select("stock_code,price,ret_1d,market_cap,per,pbr,div_yield")
        .in("stock_code", base.map(b => b.stock_code));
      const byCode = new Map((sc ?? []).map(s => [s.stock_code as string, s]));
      const merged: Row[] = base.map(b => {
        const s = byCode.get(b.stock_code);
        return {
          ...b,
          price: (s?.price as number | null) ?? null,
          ret_1d: (s?.ret_1d as number | null) ?? null,
          market_cap: (s?.market_cap as number | null) ?? null,
          per: (s?.per as number | null) ?? null,
          pbr: (s?.pbr as number | null) ?? null,
          div_yield: (s?.div_yield as number | null) ?? null,
        };
      });
      if (alive) setRows(merged);
    })();
    return () => { alive = false; };
  }, [user, activeId]);

  /** 리스트 전환 — 편집 중이던 상태는 접는다 */
  const selectList = (id: number | null) => {
    setActiveId(id);
    setWeightEdit(false);
    setEditingName(false);
  };

  const activeList = lists?.find(l => l.id === activeId) ?? null;

  // ── 리스트 CRUD ──────────────────────────────────────────────
  const createList = async () => {
    if (!user || !lists) return;
    const name = `새 리스트 ${lists.length + 1}`;
    const { data } = await supabaseBrowser().from("watchlists")
      .insert({ user_id: user.id, name }).select("id,name").single();
    if (data) {
      setLists([...lists, data as WatchList]);
      setActiveId((data as WatchList).id);
      setNameDraft((data as WatchList).name);
      setEditingName(true); // 만들자마자 이름부터 편집
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!activeList || !name || name === activeList.name) { setEditingName(false); return; }
    await supabaseBrowser().from("watchlists").update({ name }).eq("id", activeList.id);
    setLists(ls => (ls ?? []).map(l => (l.id === activeList.id ? { ...l, name } : l)));
    setEditingName(false);
  };

  const deleteList = async () => {
    if (!activeList) return;
    await supabaseBrowser().from("watchlists").delete().eq("id", activeList.id);
    const rest = (lists ?? []).filter(l => l.id !== activeList.id);
    setLists(rest);
    selectList(rest[0]?.id ?? null);
    setConfirm(null);
  };

  const removeItem = async (code: string) => {
    if (activeId == null) return;
    await supabaseBrowser().from("watchlist").delete()
      .eq("list_id", activeId).eq("stock_code", code);
    setRows(rs => (rs ?? []).filter(r => r.stock_code !== code));
    setConfirm(null);
  };

  // ── 구성비율 편집 ────────────────────────────────────────────
  const startWeightEdit = () => {
    if (!rows || rows.length === 0) return;
    const hasCustom = rows.some(r => r.weight != null);
    const equal = Math.round((100 / rows.length) * 10) / 10;
    const draft: Record<string, string> = {};
    for (const r of rows) {
      draft[r.stock_code] = hasCustom ? String(r.weight ?? 0) : String(equal);
    }
    setWeightDraft(draft);
    setWeightEdit(true);
  };

  const weightSum = useMemo(() =>
    Object.values(weightDraft).reduce((a, v) => a + (parseFloat(v) || 0), 0),
  [weightDraft]);

  const saveWeights = async () => {
    if (!rows || activeId == null) return;
    const sb = supabaseBrowser();
    const next = rows.map(r => {
      const v = parseFloat(weightDraft[r.stock_code]);
      return { ...r, weight: Number.isFinite(v) && v > 0 ? v : null };
    });
    await Promise.all(next.map(r =>
      sb.from("watchlist").update({ weight: r.weight })
        .eq("list_id", activeId).eq("stock_code", r.stock_code)));
    setRows(next);
    setWeightEdit(false);
  };

  const resetWeights = async () => {
    if (!rows || activeId == null) return;
    await supabaseBrowser().from("watchlist").update({ weight: null }).eq("list_id", activeId);
    setRows(rows.map(r => ({ ...r, weight: null })));
    setWeightEdit(false);
  };

  // ── 파생 값 ──────────────────────────────────────────────────
  const sectors = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const count = new Map<string, number>();
    for (const r of rows) {
      const s = r.sector ?? "기타";
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    return [...count.entries()]
      .map(([sector, n]) => ({ sector, n, pct: Math.round((n / rows.length) * 100) }))
      .sort((a, b) => b.n - a.n);
  }, [rows]);

  const perfItems = useMemo(
    () => (rows ?? []).map(r => ({ code: r.stock_code, weight: r.weight })),
    [rows],
  );

  const effectiveWeight = (r: Row): string => {
    if (!rows) return "—";
    const hasCustom = rows.some(x => x.weight != null);
    if (!hasCustom) return "동일";
    if (r.weight == null) return "제외";
    const sum = rows.reduce((a, x) => a + (x.weight ?? 0), 0);
    return sum > 0 ? `${Math.round((r.weight / sum) * 1000) / 10}%` : "—";
  };

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[820px] mx-auto w-full px-4 md:px-10 py-10">
        <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-1">
          Watching <span className="text-lg md:text-xl font-medium text-on-surface-variant">담아둔 종목</span>
        </h1>
        <p className="text-sm text-on-surface-variant mb-6">종목 페이지에서 ☆ 를 누르면 여기에 모여요.</p>

        {loading ? null : !user ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">로그인하면 관심종목을 담고 모아볼 수 있어요.</p>
            <button onClick={openSignIn}
                    className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">
              시작하기
            </button>
          </div>
        ) : lists == null ? (
          <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
        ) : (
          <>
            {/* ── 리스트 탭 + 새 리스트 ── */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {lists.map(l => (
                <button
                  key={l.id}
                  onClick={() => selectList(l.id)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    l.id === activeId
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {l.name}
                </button>
              ))}
              <button
                onClick={createList}
                className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-dashed
                           border-outline-variant text-on-surface-variant hover:text-primary
                           hover:border-primary transition-colors"
              >
                + 새 리스트
              </button>
            </div>

            {lists.length === 0 ? (
              <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
                <p className="text-on-surface-variant mb-4">
                  아직 워치리스트가 없어요. 첫 리스트를 만들어보세요.
                </p>
                <button onClick={createList}
                        className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">
                  리스트 만들기
                </button>
              </div>
            ) : activeList && (
              <>
                {/* ── 리스트 이름 + 편집·삭제 ── */}
                <div className="flex items-center gap-2 mb-3">
                  {editingName ? (
                    <>
                      <input
                        value={nameDraft}
                        onChange={e => setNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                        autoFocus
                        maxLength={30}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant text-sm
                                   focus:outline-none focus:border-primary w-52"
                      />
                      <button onClick={saveName}
                              className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary">
                        저장
                      </button>
                      <button onClick={() => setEditingName(false)}
                              className="px-3 py-1.5 rounded-full text-xs text-on-surface-variant hover:bg-surface-container-low">
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-primary">{activeList.name}</h2>
                      <button
                        onClick={() => { setNameDraft(activeList.name); setEditingName(true); }}
                        title="이름 바꾸기"
                        className="text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px] align-middle">edit</span>
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: "deleteList" })}
                        title="리스트 삭제"
                        className="text-on-surface-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px] align-middle">delete</span>
                      </button>
                      <span className="text-xs text-outline ml-auto">
                        {rows ? `${rows.length}종목` : ""}
                      </span>
                    </>
                  )}
                </div>

                {rows == null ? (
                  <p className="text-sm text-outline py-10 text-center">불러오는 중…</p>
                ) : rows.length === 0 ? (
                  <div className="text-center py-16 border border-outline-variant rounded-xl bg-white">
                    <p className="text-on-surface-variant mb-4">이 리스트엔 아직 담은 종목이 없어요.</p>
                    <Link href="/" className="text-sm text-primary underline underline-offset-2">
                      종목 살펴보러 가기
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* ── 종목 표 ── */}
                    <div className="border border-outline-variant rounded-xl bg-white overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-max">
                        <thead>
                          <tr className="border-b border-outline-variant bg-surface-container-low">
                            <th className="sticky left-0 z-10 bg-surface-container-low text-left px-4 py-2.5
                                           text-xs font-medium text-on-surface-variant">
                              종목
                            </th>
                            {["비중", "현재가", "등락", "시총", "PER", "PBR", "배당수익률", ""].map((h, i) => (
                              <th key={i} className="text-right px-3 py-2.5 text-xs font-medium
                                                     whitespace-nowrap text-on-surface-variant">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => {
                            const chg = fmtChange(r.ret_1d);
                            const per = fmtMultiple(r.per);
                            const pbr = fmtMultiple(r.pbr);
                            return (
                              <tr
                                key={r.stock_code}
                                onClick={() => { if (!weightEdit) router.push(`/stock/${r.stock_code}`); }}
                                className={`border-b border-outline-variant last:border-b-0 transition-colors
                                            group ${weightEdit ? "" : "cursor-pointer hover:bg-surface-container-low"}`}
                              >
                                <td className="sticky left-0 z-10 bg-white group-hover:bg-surface-container-low
                                               px-4 py-3 transition-colors">
                                  <div className="font-medium text-primary whitespace-nowrap">
                                    {r.name}
                                    <span className="text-[11px] text-on-surface-variant font-normal ml-1.5">
                                      {r.stock_code}
                                    </span>
                                  </div>
                                  {r.sector && <div className="text-[11px] text-outline">{r.sector}</div>}
                                </td>
                                <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                                  {weightEdit ? (
                                    <span className="inline-flex items-center gap-1">
                                      <input
                                        type="number" min={0} max={100} step={0.5}
                                        value={weightDraft[r.stock_code] ?? ""}
                                        onChange={e => setWeightDraft(d => ({ ...d, [r.stock_code]: e.target.value }))}
                                        onClick={e => e.stopPropagation()}
                                        className="w-16 px-2 py-1 rounded border border-outline-variant text-right text-sm
                                                   focus:outline-none focus:border-primary"
                                      />%
                                    </span>
                                  ) : effectiveWeight(r)}
                                </td>
                                <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap font-medium text-on-surface">
                                  {formatPrice(r.price)}
                                </td>
                                <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${chg.cls}`}>
                                  {chg.text}
                                </td>
                                <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                                  {formatKrw(r.market_cap)}
                                </td>
                                <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${per.cls}`}>
                                  {per.text}
                                </td>
                                <td className={`text-right px-3 py-3 tabular-nums whitespace-nowrap ${pbr.cls}`}>
                                  {pbr.text}
                                </td>
                                <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap text-on-surface-variant">
                                  {r.div_yield != null ? `${r.div_yield.toFixed(2)}%` : "—"}
                                </td>
                                <td className="text-right px-3 py-3">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      setConfirm({ kind: "remove", code: r.stock_code, name: r.name });
                                    }}
                                    title="관심종목에서 빼기"
                                    className="text-[#f2b01e] hover:text-outline text-lg transition-colors"
                                  >
                                    ★
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* ── 비중 편집 컨트롤 ── */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {weightEdit ? (
                        <>
                          <span className={`text-xs tabular-nums ${
                            Math.abs(weightSum - 100) < 0.01 ? "text-on-surface-variant" : "text-error"
                          }`}>
                            합계 {Math.round(weightSum * 10) / 10}%
                            {Math.abs(weightSum - 100) >= 0.01 && " (100%가 아니어도 비율대로 환산돼요)"}
                          </span>
                          <span className="ml-auto flex gap-2">
                            <button onClick={resetWeights}
                                    className="px-3 py-1.5 rounded-full text-xs text-on-surface-variant
                                               hover:bg-surface-container-low transition-colors">
                              동일가중으로
                            </button>
                            <button onClick={() => setWeightEdit(false)}
                                    className="px-3 py-1.5 rounded-full text-xs text-on-surface-variant
                                               hover:bg-surface-container-low transition-colors">
                              취소
                            </button>
                            <button onClick={saveWeights}
                                    className="px-4 py-1.5 rounded-full text-xs font-medium bg-primary text-on-primary">
                              비중 저장
                            </button>
                          </span>
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] text-outline">
                            * 지표는 스크리너 스냅샷 기준 (TTM 재무 + 최근 종가). 등락은 전일 대비.
                          </p>
                          <button onClick={startWeightEdit}
                                  className="ml-auto px-3.5 py-1.5 rounded-full text-xs font-medium border
                                             border-outline-variant text-on-surface-variant hover:text-primary
                                             hover:border-primary transition-colors">
                            구성비율 설정
                          </button>
                        </>
                      )}
                    </div>

                    {/* ── 워치리스트 성과 (비중 반영 + 시장지표 비교) ── */}
                    <WatchlistPerformance items={perfItems} />

                    {/* ── 업종 구성 ── */}
                    {sectors.length > 0 && (
                      <section className="bg-white border border-outline-variant rounded-xl p-5 mt-6">
                        <h2 className="text-sm font-semibold tracking-widest uppercase text-primary mb-4">
                          업종 구성
                        </h2>
                        <div className="space-y-2.5">
                          {sectors.map(s => (
                            <div key={s.sector} className="flex items-center gap-3">
                              <span className="w-24 shrink-0 text-sm text-on-surface-variant truncate">{s.sector}</span>
                              <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${s.pct}%` }} />
                              </div>
                              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-on-surface-variant">
                                {s.n}종목 · {s.pct}%
                              </span>
                            </div>
                          ))}
                        </div>
                        {sectors[0].pct >= 50 && rows.length >= 3 && (
                          <p className="text-[11px] text-outline mt-3">
                            * {sectors[0].sector} 비중이 절반을 넘어요. 한 업종에 쏠리면 그 업황에 따라 함께 움직일 수 있어요.
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── 확인 다이얼로그 (종목 빼기 / 리스트 삭제) ── */}
      <ConfirmDialog
        open={confirm != null}
        message={
          confirm?.kind === "remove"
            ? `${confirm.name}을(를) 이 리스트에서 뺄까요?`
            : confirm?.kind === "deleteList"
              ? `'${activeList?.name}' 리스트를 삭제할까요?\n담아둔 종목도 함께 사라져요.`
              : ""
        }
        confirmLabel={confirm?.kind === "deleteList" ? "삭제" : "빼기"}
        onConfirm={() => {
          if (confirm?.kind === "remove") removeItem(confirm.code);
          else if (confirm?.kind === "deleteList") deleteList();
        }}
        onCancel={() => setConfirm(null)}
      />
      <SiteFooter />
    </>
  );
}
