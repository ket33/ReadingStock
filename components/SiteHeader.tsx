"use client";

// 공통 상단 헤더 — 모든 페이지 동일: 로고(좌) | 종목 검색(중앙) | Login(우)
import Link from "next/link";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import AuthButton from "./auth/AuthButton";

export default function SiteHeader() {
  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-50 h-16 flex items-center">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full px-4 md:px-10 max-w-[1280px] mx-auto h-full gap-4">
        <div className="justify-self-start">
          <Logo mark={28} text={19} />
        </div>
        <div className="justify-self-center">
          <SearchBox size="small" />
        </div>
        <div className="justify-self-end mr-2 md:mr-8 flex items-center gap-6">
          <Link href="/screener"
                className="hidden sm:block text-[15px] font-medium text-on-surface-variant hover:text-primary transition-colors">
            Picking
          </Link>
          <Link href="/watchlist"
                className="hidden sm:block text-[15px] font-medium text-on-surface-variant hover:text-primary transition-colors">
            Watching
          </Link>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
