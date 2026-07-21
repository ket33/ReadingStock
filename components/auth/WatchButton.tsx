"use client";

// 종목 페이지 '관심종목 담기(★)' — 워치리스트가 여러 개일 수 있어 팝오버로 리스트를 고른다.
// 리스트가 없으면 '내 워치리스트'를 만들어 바로 담고, 체크/해제로 리스트별 담기·빼기.
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";

interface WatchList {
  id: number;
  name: string;
}

export default function WatchButton({ stockCode }: { stockCode: string }) {
  const { user, openSignIn } = useAuth();
  const [lists, setLists] = useState<WatchList[] | null>(null);
  const [memberOf, setMemberOf] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 내 리스트 + 이 종목이 담긴 리스트
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { if (alive) { setLists([]); setMemberOf(new Set()); } return; }
      const sb = supabaseBrowser();
      const [{ data: ls }, { data: wl }] = await Promise.all([
        sb.from("watchlists").select("id,name").order("created_at", { ascending: true }),
        sb.from("watchlist").select("list_id").eq("stock_code", stockCode),
      ]);
      if (!alive) return;
      setLists((ls ?? []) as WatchList[]);
      setMemberOf(new Set((wl ?? []).map(r => r.list_id as number).filter(id => id != null)));
    })();
    return () => { alive = false; };
  }, [user, stockCode]);

  // 팝오버 밖 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const saved = memberOf.size > 0;

  const handleClick = async () => {
    if (!user) { openSignIn(); return; }
    if (lists == null || busy) return;
    if (lists.length === 0) {
      // 첫 담기: 기본 리스트를 만들어 바로 담는다
      setBusy(true);
      const sb = supabaseBrowser();
      const { data: l } = await sb.from("watchlists")
        .insert({ user_id: user.id, name: "내 워치리스트" }).select("id,name").single();
      if (l) {
        await sb.from("watchlist")
          .insert({ user_id: user.id, stock_code: stockCode, list_id: (l as WatchList).id });
        setLists([l as WatchList]);
        setMemberOf(new Set([(l as WatchList).id]));
      }
      setBusy(false);
      return;
    }
    setOpen(o => !o);
  };

  const toggleList = async (listId: number) => {
    if (!user || busy) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (memberOf.has(listId)) {
      const { error } = await sb.from("watchlist").delete()
        .eq("list_id", listId).eq("stock_code", stockCode);
      if (!error) setMemberOf(prev => { const n = new Set(prev); n.delete(listId); return n; });
    } else {
      const { error } = await sb.from("watchlist")
        .insert({ user_id: user.id, stock_code: stockCode, list_id: listId });
      // 23505 = unique 충돌(이미 담김) → 담긴 상태로 간주
      if (!error || error.code === "23505") {
        setMemberOf(prev => new Set(prev).add(listId));
      }
    }
    setBusy(false);
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        onClick={handleClick}
        disabled={busy}
        title={saved ? "담긴 리스트 관리" : "Watching에 담기"}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors
          ${saved
            ? "border-primary bg-primary text-on-primary"
            : "border-outline-variant bg-white text-on-surface-variant hover:text-primary hover:border-primary"}`}
      >
        <span className="text-base leading-none">{saved ? "✓" : "+"}</span>
        Watching
      </button>

      {open && lists != null && (
        <div className="absolute right-0 top-full mt-2 z-40 w-56 bg-white border border-outline-variant
                        rounded-xl shadow-lg py-2">
          <p className="px-4 py-1.5 text-xs font-medium text-on-surface-variant">리스트에 담기</p>
          {lists.map(l => {
            const on = memberOf.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleList(l.id)}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left
                           text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[11px]
                  ${on ? "bg-primary border-primary text-on-primary" : "border-outline-variant"}`}>
                  {on ? "✓" : ""}
                </span>
                <span className="truncate">{l.name}</span>
              </button>
            );
          })}
          <button
            onClick={async () => {
              if (!user || busy) return;
              setBusy(true);
              const { data: l } = await supabaseBrowser().from("watchlists")
                .insert({ user_id: user.id, name: `새 리스트 ${lists.length + 1}` })
                .select("id,name").single();
              if (l) setLists([...lists, l as WatchList]);
              setBusy(false);
            }}
            disabled={busy}
            className="w-full px-4 py-2 text-sm text-left text-on-surface-variant
                       hover:bg-surface-container-low hover:text-primary transition-colors"
          >
            + 새 리스트 만들기
          </button>
        </div>
      )}
    </div>
  );
}
