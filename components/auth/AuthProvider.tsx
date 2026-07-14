"use client";

// 인증 컨텍스트 — Supabase Auth 세션을 구독하고, 로그인 다이얼로그를 전역 제공.
// 개인정보는 이메일(+인증 ID)만 다룬다. 동의 여부는 auth.users의 user_metadata에
// 플래그로만 기록(별도 프로필 테이블 없음 — 지시서 최소 수집 원칙).
import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import SignInDialog from "./SignInDialog";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  openSignIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true, openSignIn: () => {}, signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

// 로그인 전에 받은 동의를 리다이렉트 동안 보관하는 localStorage 키
export const CONSENT_KEY = "rs_pending_consent";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      // 첫 로그인: 다이얼로그에서 받아둔 동의를 계정 메타데이터에 기록
      if (event === "SIGNED_IN" && session?.user) {
        const pending = localStorage.getItem(CONSENT_KEY);
        const meta = session.user.user_metadata ?? {};
        if (pending && !meta.terms_agreed_at) {
          try {
            const c = JSON.parse(pending);
            await sb.auth.updateUser({
              data: {
                terms_agreed_at: c.at,          // 이용약관·개인정보 동의 시각
                age14_confirmed: true,           // 만 14세 이상 확인
                marketing_opt_in: !!c.marketing, // (선택) 마케팅 수신 동의
              },
            });
          } catch { /* 메타 기록 실패는 로그인 자체를 막지 않음 */ }
        }
        localStorage.removeItem(CONSENT_KEY);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, loading, openSignIn: () => setDialogOpen(true), signOut }}>
      {children}
      {dialogOpen && <SignInDialog onClose={() => setDialogOpen(false)} />}
    </Ctx.Provider>
  );
}
