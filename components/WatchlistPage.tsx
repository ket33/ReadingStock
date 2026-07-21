"use client";

// 내 관심종목 — 워치리스트 여러 개를 아코디언 카드로 보여준다.
// 각 카드(WatchlistCard)가 자기 종목표·필터·종목추가·비중·성과를 자체 관리하고,
// 이 컨테이너는 리스트 목록·생성·삭제와 '어떤 카드가 펼쳐졌는지'만 관리한다.
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import WatchlistCard from "./WatchlistCard";
import ConfirmDialog from "./ConfirmDialog";

interface WatchList { id: number; name: string; }

export default function WatchlistPage() {
  const { user, loading, openSignIn } = useAuth();

  const [lists, setLists] = useState<WatchList[] | null>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<WatchList | null>(null);

  // ── 리스트 목록 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { if (alive) setLists(null); return; }
      const { data } = await supabaseBrowser().from("watchlists")
        .select("id,name").order("created_at", { ascending: true });
      if (!alive) return;
      const ls = (data ?? []) as WatchList[];
      setLists(ls);
      // 첫 리스트는 기본으로 펼쳐 보여준다
      setOpenIds(prev => (prev.size === 0 && ls[0] ? new Set([ls[0].id]) : prev));
    })();
    return () => { alive = false; };
  }, [user]);

  const toggleOpen = (id: number) =>
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const createList = async () => {
    if (!user || !lists) return;
    const name = `새 리스트 ${lists.length + 1}`;
    const { data } = await supabaseBrowser().from("watchlists")
      .insert({ user_id: user.id, name }).select("id,name").single();
    if (data) {
      const nl = data as WatchList;
      setLists([...lists, nl]);
      setOpenIds(prev => new Set(prev).add(nl.id)); // 만들면 바로 펼침
    }
  };

  const deleteList = async () => {
    if (!deleteTarget) return;
    await supabaseBrowser().from("watchlists").delete().eq("id", deleteTarget.id);
    setLists(ls => (ls ?? []).filter(l => l.id !== deleteTarget.id));
    setOpenIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
    setDeleteTarget(null);
  };

  const onRenamed = (id: number, name: string) =>
    setLists(ls => (ls ?? []).map(l => (l.id === id ? { ...l, name } : l)));

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[900px] mx-auto w-full px-4 md:px-10 py-10">
        <h1 className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary mb-6">
          Watching <span className="text-lg md:text-xl font-medium text-on-surface-variant">담아둔 종목</span>
        </h1>

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
        ) : lists.length === 0 ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">아직 워치리스트가 없어요. 첫 리스트를 만들어보세요.</p>
            <button onClick={createList}
                    className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">
              리스트 만들기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map(l => (
              <WatchlistCard
                key={l.id}
                list={l}
                userId={user.id}
                open={openIds.has(l.id)}
                onToggle={() => toggleOpen(l.id)}
                onRenamed={onRenamed}
                onRequestDelete={() => setDeleteTarget(l)}
              />
            ))}
            <button
              onClick={createList}
              className="w-full px-4 py-3 rounded-xl text-sm font-medium border border-dashed
                         border-outline-variant text-on-surface-variant hover:text-primary
                         hover:border-primary transition-colors"
            >
              + 새 리스트 만들기
            </button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={deleteTarget != null}
        message={deleteTarget ? `'${deleteTarget.name}' 리스트를 삭제할까요?\n담아둔 종목도 함께 사라져요.` : ""}
        confirmLabel="삭제"
        onConfirm={deleteList}
        onCancel={() => setDeleteTarget(null)}
      />
      <SiteFooter />
    </>
  );
}
