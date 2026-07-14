"use client";

// 공통 상단 헤더 — 데스크톱: 로고(좌) | 종목 검색(중앙) | 메뉴·Login(우)
// 모바일(<md): 검색창을 돋보기 아이콘으로 접음 — 탭하면 헤더 아래로 펼쳐짐.
//   (고정폭 검색창(w-72)이 모바일에서 화면을 넘겨 전 페이지 가로 스크롤을 만들던 문제 해결)
import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import AuthButton from "./auth/AuthButton";

export default function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-50">
      <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center
                      w-full px-4 md:px-10 max-w-[1280px] mx-auto h-16 gap-3 md:gap-4">
        <div className="justify-self-start min-w-0">
          {/* 모바일은 우측 아이콘들과 겹치지 않게 로고 한 단계 축소 */}
          <div className="sm:hidden"><Logo mark={24} text={15} /></div>
          <div className="hidden sm:block"><Logo mark={28} text={19} /></div>
        </div>

        {/* 데스크톱: 중앙 상시 검색창 */}
        <div className="justify-self-center hidden md:block">
          <SearchBox size="small" />
        </div>
        <div className="md:hidden" /> {/* 모바일: 중앙 빈 칸 (로고|공간|아이콘들) */}

        <div className="justify-self-end md:mr-8 flex items-center gap-3 md:gap-6">
          {/* 모바일: 검색 토글 아이콘 */}
          <button
            onClick={() => setSearchOpen(o => !o)}
            aria-label={searchOpen ? "검색 닫기" : "종목 검색"}
            className="md:hidden material-symbols-outlined text-[24px] text-on-surface-variant
                       hover:text-primary transition-colors"
          >
            {searchOpen ? "close" : "search"}
          </button>
          <Link href="/screener"
                className="hidden sm:block text-[15px] font-medium text-on-surface-variant hover:text-primary transition-colors">
            Picking
          </Link>
          <Link href="/watchlist"
                className="hidden sm:block text-[15px] font-medium text-on-surface-variant hover:text-primary transition-colors">
            Watching
          </Link>
          {/* 모바일: 텍스트 메뉴 대신 아이콘 */}
          <Link href="/screener" aria-label="Picking — 종목 골라보기"
                className="sm:hidden material-symbols-outlined text-[22px] text-on-surface-variant hover:text-primary transition-colors">
            filter_list
          </Link>
          <Link href="/watchlist" aria-label="Watching — 담아둔 종목"
                className="sm:hidden material-symbols-outlined text-[22px] text-on-surface-variant hover:text-primary transition-colors">
            star
          </Link>
          <AuthButton />
        </div>
      </div>

      {/* 모바일: 펼쳐지는 검색 행 */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3">
          <SearchBox size="small" fullWidth autoFocus />
        </div>
      )}
    </header>
  );
}
