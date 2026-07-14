"use client";

// 헤더 Sign In 버튼 — 로그인 전: "시작하기", 후: 이메일 + 관심종목/로그아웃 메뉴
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export default function AuthButton() {
  const { user, loading, openSignIn, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (loading) return <div className="w-20" aria-hidden />;

  if (!user) {
    return (
      <button
        onClick={openSignIn}
        className="px-4 py-1.5 rounded-full text-sm font-medium border border-outline-variant
                   text-on-surface-variant hover:text-primary hover:border-primary transition-colors bg-white"
      >
        Login
      </button>
    );
  }

  const email = user.email ?? "회원";
  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setMenuOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-outline-variant
                   text-on-surface-variant hover:text-primary transition-colors bg-white max-w-[180px]"
      >
        <span className="truncate">{email}</span>
        <span className="text-[10px] text-outline">▾</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white border border-outline-variant rounded-xl shadow-lg
                        overflow-hidden z-[60] text-sm">
          <Link
            href="/watchlist"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-2.5 text-on-surface hover:bg-surface-container-low"
          >
            ★ 내 관심종목
          </Link>
          <button
            onClick={async () => { setMenuOpen(false); await signOut(); }}
            className="block w-full text-left px-4 py-2.5 text-on-surface-variant hover:bg-surface-container-low"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
