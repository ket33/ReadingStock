// 공통 하단 푸터 — 브랜드 + 면책 + 개인정보 처리방침·이용약관·문의 링크
import Link from "next/link";
import ContactDialog from "./ContactDialog";

export default function SiteFooter() {
  return (
    <footer className="bg-surface-container-low border-t border-outline-variant mt-auto">
      <div className="max-w-[1280px] mx-auto py-10 px-4 md:px-10">
        {/* 브랜드·면책은 왼쪽 절반, 문의는 그 옆(가운데)에서 면책 첫 줄 높이에 맞춘다.
            좁은 화면에선 아래로 내려온다. */}
        {/* 정책 링크를 왼쪽 칸 안에 둔다 — 모바일에서 세로로 쌓일 때
            브랜드 → 면책 → 정책 링크 → 문의 순이 되게 하려는 것.
            데스크톱에선 문의가 오른쪽 칸에서 면책 첫 줄 높이에 그대로 걸린다. */}
        <div className="flex flex-col md:flex-row md:items-start md:gap-8">
          <div className="md:flex-1 md:max-w-xl">
            <span className="font-serif text-lg font-bold text-primary mb-3 block">Reading Stock</span>
            <p className="text-xs md:text-sm text-on-surface-variant leading-relaxed">
              본 정보는 투자 판단의 참고 자료이며 매수·매도 권유가 아닙니다.
              <br />
              모든 콘텐츠는 공개 데이터를 바탕으로 자동 생성되며, 투자 결정과 책임은 본인에게 있습니다.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <Link href="/privacy"
                    className="text-on-surface-variant hover:text-primary hover:underline underline-offset-4 transition-colors">
                개인정보 처리방침
              </Link>
              <span className="text-outline-variant">·</span>
              <Link href="/terms"
                    className="text-on-surface-variant hover:text-primary hover:underline underline-offset-4 transition-colors">
                이용약관
              </Link>
            </div>
          </div>
          <div className="md:flex-1 text-sm mt-5 md:mt-0 md:pt-[42px]">
            <ContactDialog />
          </div>
        </div>
        <p className="mt-6 text-xs text-outline">© 2026 Reading Stock. All rights reserved.</p>
      </div>
    </footer>
  );
}
