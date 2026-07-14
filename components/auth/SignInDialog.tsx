"use client";

// 로그인 다이얼로그 — 이메일+비밀번호 & Google (인증 로직은 전부 Supabase Auth)
// 동의(필수/선택 분리)는 '가입'과 'Google 시작'에만 요구. 기존 회원의 비밀번호 로그인은 동의 재확인 없음.
// 카카오는 보류 상태 (버튼만 제거 — Supabase에 provider 추가하면 쉽게 복구 가능).
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { CONSENT_KEY } from "./AuthProvider";

type Mode = "signin" | "signup";

export default function SignInDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [terms, setTerms] = useState(false);        // [필수] 약관 + 개인정보
  const [age14, setAge14] = useState(false);        // [필수] 만 14세 이상
  const [marketing, setMarketing] = useState(false); // [선택] 마케팅 수신
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const required = terms && age14;
  const allChecked = terms && age14 && marketing;
  const toggleAll = () => {
    const v = !allChecked;
    setTerms(v); setAge14(v); setMarketing(v);
  };
  const consentData = () => ({
    terms_agreed_at: new Date().toISOString(),
    age14_confirmed: true,
    marketing_opt_in: marketing,
  });

  const friendly = (msg: string) => {
    if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않아요.";
    if (msg.includes("already registered")) return "이미 가입된 이메일이에요. 로그인으로 시도해 보세요.";
    if (msg.includes("Password should be")) return "비밀번호는 6자 이상이어야 해요.";
    if (msg.includes("Email not confirmed")) return "가입 확인 메일의 링크를 먼저 눌러주세요.";
    if (msg.includes("not enabled")) return "아직 준비 중인 로그인 방식이에요.";
    if (msg.toLowerCase().includes("rate limit")) return "요청이 잠시 몰렸어요. 몇 분 뒤 다시 시도해 주세요.";
    return msg;
  };

  const google = async () => {
    if (!required || busy) return;
    setBusy(true); setError(null);
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      at: new Date().toISOString(), marketing,
    }));
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) { setBusy(false); setError(friendly(error.message)); }
  };

  const submitEmail = async () => {
    if (busy || !email || !password) return;
    setBusy(true); setError(null); setNotice(null);
    const sb = supabaseBrowser();
    if (mode === "signup") {
      if (!required) { setBusy(false); return; }
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: {
          data: consentData(),  // 동의를 계정 메타데이터에 기록 (별도 테이블 없음)
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) setError(friendly(error.message));
      else if (data.session) onClose();  // 확인 메일 꺼진 경우 즉시 로그인
      else setNotice("확인 메일을 보냈어요. 메일 속 링크를 누르면 가입이 완료됩니다.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(friendly(error.message));
      else onClose();
    }
    setBusy(false);
  };

  const resetPassword = async () => {
    if (!email) { setError("먼저 이메일을 입력해 주세요."); return; }
    setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset",
    });
    if (error) setError(friendly(error.message));
    else setNotice("비밀번호 재설정 메일을 보냈어요.");
  };

  const Check = ({ checked, onChange, children, requiredMark }: {
    checked: boolean; onChange: () => void; children: React.ReactNode; requiredMark?: boolean;
  }) => (
    <label className="flex items-start gap-2.5 cursor-pointer text-sm text-on-surface">
      <input type="checkbox" checked={checked} onChange={onChange}
             className="mt-0.5 w-4 h-4 accent-[#16243f]" />
      <span>
        <span className={`text-xs font-semibold mr-1 ${requiredMark ? "text-stock-up" : "text-outline"}`}>
          {requiredMark ? "[필수]" : "[선택]"}
        </span>
        {children}
      </span>
    </label>
  );

  const needConsent = mode === "signup";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
         role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 rs-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-7 max-h-[90vh] overflow-y-auto rs-pop-in">
        <button onClick={onClose} aria-label="닫기"
                className="absolute top-4 right-4 text-outline hover:text-primary text-xl leading-none">
          ×
        </button>

        {/* 모드 전환 */}
        <div className="flex gap-1 mb-5 border-b border-outline-variant">
          {([["signin", "로그인"], ["signup", "회원가입"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setMode(k); setError(null); setNotice(null); }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      mode === k ? "border-primary text-primary"
                                 : "border-transparent text-on-surface-variant hover:text-primary"}`}>
              {label}
            </button>
          ))}
        </div>

        <p className="text-sm text-on-surface-variant mb-5">
          {mode === "signup"
            ? <>관심종목을 담고 모아볼 수 있어요.<br />수집하는 개인정보는 이메일뿐이에요.</>
            : "Welcome to Reading Stock!"}
        </p>

        {/* 동의 — 가입(및 Google 시작)에만 (필수/선택 분리) */}
        {needConsent && (
          <div className="border border-outline-variant rounded-xl p-4 space-y-3 mb-5">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-primary pb-2 border-b border-outline-variant">
              <input type="checkbox" checked={allChecked} onChange={toggleAll}
                     className="w-4 h-4 accent-[#16243f]" />
              전체 동의
            </label>
            <Check checked={terms} onChange={() => setTerms(!terms)} requiredMark>
              <Link href="/terms" target="_blank" className="underline underline-offset-2">이용약관</Link>
              {" 및 "}
              <Link href="/privacy" target="_blank" className="underline underline-offset-2">개인정보 수집·이용</Link>
              에 동의합니다
            </Check>
            <Check checked={age14} onChange={() => setAge14(!age14)} requiredMark>
              만 14세 이상입니다
            </Check>
            <Check checked={marketing} onChange={() => setMarketing(!marketing)}>
              마케팅 정보 수신에 동의합니다
              <span className="block text-xs font-medium text-secondary mt-0.5">
                관심 종목 업데이트 내용을 이메일로 알려드려요. 동의하지 않아도 가입할 수 있어요.
              </span>
            </Check>
          </div>
        )}

        {/* 이메일 + 비밀번호 */}
        <div className="space-y-2.5 mb-4">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm
                       focus:outline-none focus:border-primary bg-white"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submitEmail(); }}
            placeholder={mode === "signup" ? "비밀번호 (6자 이상)" : "비밀번호"}
            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm
                       focus:outline-none focus:border-primary bg-white"
          />
          <button
            onClick={submitEmail}
            disabled={busy || !email || !password || (mode === "signup" && !required)}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity
                       bg-[#16243f] text-white disabled:opacity-40"
          >
            {busy ? "처리 중…" : mode === "signup" ? "이메일로 가입하기" : "로그인"}
          </button>
          {mode === "signin" && (
            <button onClick={resetPassword}
                    className="block mx-auto text-xs text-outline hover:text-primary underline underline-offset-2">
              비밀번호를 잊으셨나요?
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 my-4">
          <span className="flex-1 border-t border-outline-variant" />
          <span className="text-xs text-outline">또는</span>
          <span className="flex-1 border-t border-outline-variant" />
        </div>

        {/* Google — 첫 로그인이 곧 가입이므로 회원가입 탭의 동의를 요구 */}
        <button
          onClick={mode === "signup" ? google : () => { setMode("signup"); setNotice("Google 시작은 아래 동의 후 눌러주세요."); }}
          disabled={busy || (mode === "signup" && !required)}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity
                     bg-white border border-outline-variant text-on-surface disabled:opacity-40"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {busy ? "잠시만요…" : "Google로 시작하기"}
          </span>
        </button>

        {mode === "signup" && !required && (
          <p className="mt-3 text-xs text-outline text-center">필수 항목에 동의하면 시작할 수 있어요.</p>
        )}
        {notice && <p className="mt-3 text-xs text-secondary text-center">{notice}</p>}
        {error && <p className="mt-3 text-xs text-error text-center">{error}</p>}
      </div>
    </div>
  );
}
