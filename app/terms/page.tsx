import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "이용약관 — Reading Stock" };

// ⚠ 자리만 만들어둔 페이지입니다. 약관 본문은 별도로 작성해 이 파일에 넣어주세요.
//   (지시서: 문구를 임의로 지어내지 않는다)
export default function TermsPage() {
  return (
    <main className="max-w-[720px] mx-auto px-4 py-16">
      <h1 className="font-serif text-2xl font-semibold text-primary mb-6">이용약관</h1>
      <p className="text-on-surface-variant leading-relaxed">
        이용약관 문서를 준비하고 있어요. 곧 이 자리에서 확인하실 수 있습니다.
      </p>
      <Link href="/" className="inline-block mt-8 text-sm text-primary underline underline-offset-2">
        ← 홈으로
      </Link>
    </main>
  );
}
