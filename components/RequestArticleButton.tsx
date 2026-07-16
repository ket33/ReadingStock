"use client";

// 분석글 작성 요청 버튼 — 비로그인 시 로그인 다이얼로그로 유도 (WatchButton과 같은 흐름)
// 종목 페이지(글 없음 상태)에서 쓴다. 검색 드롭다운은 SearchBox가 행 단위로 자체 처리.
// 완성되면 가입 이메일로 알림이 가므로 요청 완료 문구에 그 사실을 밝힌다.
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";

export default function RequestArticleButton({ stockCode, companyQuery, label }: {
  stockCode?: string;
  companyQuery?: string;
  label?: string;
}) {
  const { user, openSignIn } = useAuth();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const request = async () => {
    if (!user) { openSignIn(); return; }
    if (state !== "idle") return;
    setState("busy");
    const { error } = await supabaseBrowser().from("article_requests").insert({
      user_id: user.id,
      stock_code: stockCode ?? null,
      company_query: stockCode ? null : (companyQuery ?? null),
    });
    // 23505 = unique 충돌(이미 대기 중 요청 있음) → 요청된 상태로 간주
    if (!error || error.code === "23505") setState("done");
    else setState("idle");
  };

  if (state === "done") {
    return (
      <p className="text-sm text-primary">
        요청 완료! 분석글이 완성되면 <span className="font-medium">{user?.email}</span>로 알려드릴게요.
      </p>
    );
  }

  return (
    <button
      onClick={request}
      disabled={state === "busy"}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                 border border-primary bg-primary text-on-primary transition-opacity
                 hover:opacity-90 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[18px] leading-none">edit_note</span>
      {label ?? "분석글 작성 요청하기"}
    </button>
  );
}
