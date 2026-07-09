import Link from "next/link";

// 브랜드 로고 — design_handoff_reading_stock_logo 스펙 구현
// 심볼: 정원(#16243f) 안 R(Shantell Sans 700, 흰색) + 우상단 코랄 점(#e5654b)
// 워드마크: "Reading Stock", Shantell Sans 700, #16243f, letter-spacing -0.005em
// 가로형 lockup, 클릭 시 홈으로 (헤더용: 심볼 28–30px + 워드마크 18–20px, gap 9–10px)
export default function Logo({ mark = 30, text = 20 }: { mark?: number; text?: number }) {
  return (
    <Link
      href="/"
      className="flex items-center hover:opacity-85 transition-opacity duration-150 shrink-0"
      style={{ gap: Math.round(mark / 3) }}
      aria-label="Reading Stock 홈"
    >
      <svg width={mark} height={mark} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#16243f" />
        <text
          x="24" y="34" textAnchor="middle"
          fontWeight={700} fontSize={28} fill="#ffffff"
          style={{ fontFamily: "var(--font-logo)" }}
        >
          R
        </text>
        <circle cx="35" cy="14" r="3.2" fill="#e5654b" />
      </svg>
      <span
        className="font-bold text-[#16243f] leading-none whitespace-nowrap"
        style={{ fontFamily: "var(--font-logo)", fontSize: text, letterSpacing: "-0.005em" }}
      >
        Reading Stock
      </span>
    </Link>
  );
}
