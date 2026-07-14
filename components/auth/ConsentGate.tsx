"use client";

// 로그인 후 동의 게이트 — 동의 기록(terms_agreed_at)이 없는 계정에만 뜬다.
// 신규 소셜 로그인 회원의 최초 동의를 여기서 받는다 (기존 회원은 이 창을 보지 않음).
// 닫기 없음: 동의해야 진행, 취소하면 로그아웃.
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function ConsentGate({ onDone, onCancel }: {
  onDone: () => void;
  onCancel: () => Promise<void>;
}) {
  const [terms, setTerms] = useState(false);
  const [age14, setAge14] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const required = terms && age14;
  const allChecked = terms && age14 && marketing;

  const agree = async () => {
    if (!required || busy) return;
    setBusy(true);
    await supabaseBrowser().auth.updateUser({
      data: {
        terms_agreed_at: new Date().toISOString(),
        age14_confirmed: true,
        marketing_opt_in: marketing,
      },
    });
    setBusy(false);
    onDone();
  };

  const Check = ({ checked, onChange, children, requiredMark }: {
    checked: boolean; onChange: () => void; children: React.ReactNode; requiredMark?: boolean;
  }) => (
    <label className="flex items-start gap-2.5 cursor-pointer text-sm text-on-surface">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 w-4 h-4 accent-[#16243f]" />
      <span>
        <span className={`text-xs font-semibold mr-1 ${requiredMark ? "text-stock-up" : "text-outline"}`}>
          {requiredMark ? "[필수]" : "[선택]"}
        </span>
        {children}
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 rs-fade-in" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-7 rs-pop-in">
        <h2 className="font-serif text-xl font-semibold text-primary mb-1">환영해요! 🎉</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          시작하기 전에 약관 동의만 부탁드려요.<br />수집하는 개인정보는 이메일뿐이에요.
        </p>

        <div className="border border-outline-variant rounded-xl p-4 space-y-3 mb-5">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-primary pb-2 border-b border-outline-variant">
            <input type="checkbox" checked={allChecked}
                   onChange={() => { const v = !allChecked; setTerms(v); setAge14(v); setMarketing(v); }}
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
              관심 종목 업데이트 내용을 이메일로 알려드려요. 동의하지 않아도 이용할 수 있어요.
            </span>
          </Check>
        </div>

        <button onClick={agree} disabled={!required || busy}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-primary text-on-primary disabled:opacity-40">
          {busy ? "처리 중…" : "동의하고 시작하기"}
        </button>
        <button onClick={() => onCancel()}
                className="block mx-auto mt-3 text-xs text-outline hover:text-primary underline underline-offset-2">
          취소하고 로그아웃
        </button>
      </div>
    </div>
  );
}
