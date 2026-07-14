"use client";

// 헤더 로그인 영역 — 로그인 전: Login 버튼 / 후: 아바타(사람 아이콘) + Setting·Logout 메뉴
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

/** 회원 아바타 — 원 안의 사람 실루엣 (폰트 의존 없는 인라인 SVG) */
function AvatarIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="19" fill="var(--color-surface-container-high)" />
      <circle cx="20" cy="16" r="6" fill="var(--color-primary)" />
      <path d="M8.5 33.5a11.5 11.5 0 0 1 23 0" fill="var(--color-primary)" />
    </svg>
  );
}

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
        className="px-6 py-1.5 rounded-full text-[15px] font-semibold bg-primary text-on-primary
                   border-2 border-primary hover:bg-white hover:text-primary transition-colors shadow-sm"
      >
        Login
      </button>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setMenuOpen(o => !o)}
        aria-label="내 계정"
        className="block rounded-full hover:opacity-85 transition-opacity"
      >
        <AvatarIcon />
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-outline-variant rounded-xl shadow-lg
                        overflow-hidden z-[60] text-sm rs-pop-in">
          <div className="px-4 py-2.5 text-xs text-outline border-b border-outline-variant truncate">
            {user.email}
          </div>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="block px-4 py-2.5 text-on-surface hover:bg-surface-container-low"
          >
            Setting
          </Link>
          <button
            onClick={async () => { setMenuOpen(false); await signOut(); }}
            className="block w-full text-left px-4 py-2.5 text-on-surface-variant hover:bg-surface-container-low"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
