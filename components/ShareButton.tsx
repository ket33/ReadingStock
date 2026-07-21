"use client";

// 리포트 공유 버튼 — 현재 종목 페이지 URL을 클립보드에 복사한다.
// 링크 아이콘 + '공유하기', 복사되면 잠깐 '링크 복사됨'으로 바뀐다.
import { useState } from "react";

export default function ShareButton({ stockCode, className = "" }: {
  stockCode: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/stock/${stockCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 프롬프트로라도 링크를 보여준다
      window.prompt("아래 링크를 복사하세요", url);
    }
  };

  return (
    <button
      onClick={share}
      title="이 리포트 링크 복사"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        copied
          ? "border-primary text-primary bg-primary-fixed/10"
          : "border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary"
      } ${className}`}
    >
      <span className="material-symbols-outlined text-[16px]">{copied ? "check" : "link"}</span>
      {copied ? "링크 복사됨" : "공유하기"}
    </button>
  );
}
