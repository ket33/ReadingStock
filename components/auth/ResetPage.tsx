"use client";

// 비밀번호 재설정 — 메일의 재설정 링크로 진입하면 세션이 잡히고, 새 비밀번호를 저장한다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";
import Logo from "../Logo";

export default function ResetPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    if (pw.length < 6) { setError("비밀번호는 6자 이상이어야 해요."); return; }
    if (pw !== pw2) { setError("두 비밀번호가 서로 달라요."); return; }
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(error.message);
    else { alert("비밀번호를 바꿨어요. 새 비밀번호로 로그인됩니다."); router.push("/"); }
  };

  return (
    <main className="flex-grow flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm bg-white border border-outline-variant rounded-2xl p-7">
        <div className="mb-6"><Logo mark={26} text={17} /></div>
        <h1 className="font-serif text-xl font-semibold text-primary mb-2">비밀번호 재설정</h1>

        {loading ? null : !user ? (
          <p className="text-sm text-on-surface-variant leading-relaxed">
            재설정 링크가 만료됐거나 잘못된 접근이에요.<br />
            로그인 창에서 &lsquo;비밀번호를 잊으셨나요?&rsquo;를 다시 눌러 메일을 받아주세요.
          </p>
        ) : (
          <>
            <p className="text-sm text-on-surface-variant mb-5">{user.email} 계정의 새 비밀번호를 입력하세요.</p>
            <div className="space-y-2.5">
              <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                     placeholder="새 비밀번호 (6자 이상)"
                     className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm focus:outline-none focus:border-primary" />
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                     onKeyDown={e => { if (e.key === "Enter") save(); }}
                     placeholder="새 비밀번호 확인"
                     className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm focus:outline-none focus:border-primary" />
              <button onClick={save} disabled={busy || !pw || !pw2}
                      className="w-full py-3 rounded-xl text-sm font-semibold bg-[#16243f] text-white disabled:opacity-40">
                {busy ? "저장 중…" : "비밀번호 바꾸기"}
              </button>
            </div>
            {error && <p className="mt-3 text-xs text-error text-center">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
