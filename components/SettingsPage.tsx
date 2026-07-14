"use client";

// 설정 — 계정 정보 (이메일 표시 + 비밀번호 변경)
// 비밀번호 변경은 Supabase Auth updateUser 사용 (직접 구현 없음).
// 구글 로그인 회원도 비밀번호를 만들면 이메일 로그인이 함께 가능해진다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";
import SiteHeader from "./SiteHeader";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, openSignIn } = useAuth();
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelErr(null);
    const { data: { session } } = await supabaseBrowser().auth.getSession();
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (res.ok) {
      await supabaseBrowser().auth.signOut();
      alert("회원 탈퇴가 완료되었어요. 이용해 주셔서 감사합니다.");
      router.push("/");
    } else {
      setDelBusy(false);
      setDelErr("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };
  const [formOpen, setFormOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isGoogleOnly =
    (user?.identities ?? []).length > 0 &&
    (user?.identities ?? []).every(i => i.provider === "google");

  const changePassword = async () => {
    if (busy) return;
    if (pw.length < 6) { setMsg({ ok: false, text: "비밀번호는 6자 이상이어야 해요." }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: "두 비밀번호가 서로 달라요." }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setMsg({
        ok: false,
        text: error.message.includes("different from the old")
          ? "지금 쓰는 비밀번호와 달라야 해요."
          : error.message,
      });
    } else {
      setMsg({ ok: true, text: "비밀번호를 바꿨어요." });
      setPw(""); setPw2(""); setFormOpen(false);
    }
  };

  return (
    <>
      <SiteHeader />

      <main className="flex-grow max-w-[640px] mx-auto w-full px-4 md:px-10 py-10">
        <h1 className="font-sans text-2xl font-medium tracking-tight text-primary mb-8">Setting</h1>

        {loading ? null : !user ? (
          <div className="text-center py-20 border border-outline-variant rounded-xl bg-white">
            <p className="text-on-surface-variant mb-4">로그인이 필요한 페이지예요.</p>
            <button onClick={openSignIn}
                    className="px-6 py-2.5 rounded-full text-sm font-medium bg-primary-fixed text-on-primary-fixed">
              Login
            </button>
          </div>
        ) : (
          <section className="border border-outline-variant rounded-xl bg-white overflow-hidden">
            <h2 className="px-6 py-4 text-sm font-semibold text-primary border-b border-outline-variant bg-surface-container-low">
              계정 정보
            </h2>

            {/* e-mail 주소 */}
            <div className="px-6 py-5 border-b border-surface-container-high flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="w-28 text-sm text-on-surface-variant shrink-0">e-mail 주소</span>
              <span className="text-sm text-on-surface font-medium">{user.email}</span>
            </div>

            {/* 비밀번호 변경 */}
            <div className="px-6 py-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="w-28 text-sm text-on-surface-variant shrink-0">비밀번호</span>
                <button
                  onClick={() => { setFormOpen(o => !o); setMsg(null); }}
                  className="px-4 py-2 rounded-full text-sm font-medium border border-outline-variant
                             text-on-surface hover:border-primary hover:text-primary transition-colors"
                >
                  비밀번호 변경하기
                </button>
              </div>
              {isGoogleOnly && (
                <p className="mt-2 ml-0 sm:ml-[8.5rem] text-xs text-outline">
                  구글로 가입한 계정이에요. 비밀번호를 만들면 이메일 로그인도 함께 쓸 수 있어요.
                </p>
              )}

              {formOpen && (
                <div className="mt-4 sm:ml-[8.5rem] max-w-xs space-y-2.5">
                  <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                         placeholder="새 비밀번호 (6자 이상)"
                         className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm
                                    focus:outline-none focus:border-primary" />
                  <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                         onKeyDown={e => { if (e.key === "Enter") changePassword(); }}
                         placeholder="새 비밀번호 확인"
                         className="w-full px-4 py-2.5 rounded-xl border border-outline-variant text-sm
                                    focus:outline-none focus:border-primary" />
                  <button onClick={changePassword} disabled={busy || !pw || !pw2}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary disabled:opacity-40">
                    {busy ? "저장 중…" : "저장"}
                  </button>
                </div>
              )}
              {msg && (
                <p className={`mt-3 sm:ml-[8.5rem] text-xs ${msg.ok ? "text-secondary" : "text-error"}`}>
                  {msg.text}
                </p>
              )}
            </div>

            {/* 회원 탈퇴 */}
            <div className="px-6 py-5 border-t border-surface-container-high">
              {!confirmDel ? (
                <button
                  onClick={() => { setConfirmDel(true); setDelErr(null); }}
                  className="text-sm text-error hover:underline underline-offset-2"
                >
                  회원 탈퇴
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-on-surface">
                    정말 탈퇴하시겠어요? <span className="text-error font-medium">계정과 Watching·지표 설정이 모두 삭제되며 되돌릴 수 없어요.</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={deleteAccount} disabled={delBusy}
                            className="px-4 py-2 rounded-full text-sm font-semibold bg-error text-white disabled:opacity-40">
                      {delBusy ? "처리 중…" : "탈퇴하기"}
                    </button>
                    <button onClick={() => setConfirmDel(false)} disabled={delBusy}
                            className="px-4 py-2 rounded-full text-sm font-medium text-on-surface-variant hover:text-primary">
                      취소
                    </button>
                  </div>
                  {delErr && <p className="text-xs text-error">{delErr}</p>}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
