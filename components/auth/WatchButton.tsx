"use client";

// 종목 페이지 '관심종목 담기(★)' 토글 — 비로그인 시 로그인 다이얼로그로 유도
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";

export default function WatchButton({ stockCode }: { stockCode: string }) {
  const { user, openSignIn } = useAuth();
  const [saved, setSaved] = useState<boolean | null>(null); // null = 확인 중
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setSaved(false); return; }
    let alive = true;
    supabaseBrowser()
      .from("watchlist")
      .select("id")
      .eq("stock_code", stockCode)
      .limit(1)
      .then(({ data }) => { if (alive) setSaved((data?.length ?? 0) > 0); });
    return () => { alive = false; };
  }, [user, stockCode]);

  const toggle = async () => {
    if (!user) { openSignIn(); return; }
    if (busy || saved == null) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (saved) {
      const { error } = await sb.from("watchlist").delete().eq("stock_code", stockCode);
      if (!error) setSaved(false);
    } else {
      const { error } = await sb.from("watchlist")
        .insert({ user_id: user.id, stock_code: stockCode });
      // 23505 = unique 충돌(이미 담김) → 담긴 상태로 간주
      if (!error || error.code === "23505") setSaved(true);
    }
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={saved ? "Watching에서 빼기" : "Watching에 담기"}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors
        ${saved
          ? "border-primary bg-primary text-on-primary"
          : "border-outline-variant bg-white text-on-surface-variant hover:text-primary hover:border-primary"}`}
    >
      <span className="text-base leading-none">{saved ? "✓" : "+"}</span>
      Watching
    </button>
  );
}
