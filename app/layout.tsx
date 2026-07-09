import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

// 원 디자인 폰트(영문·숫자) — Inter / IBM Plex Serif
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// 한글 폴백 — IBM Plex Serif는 한글 미지원이라 제목은 Noto Serif KR이 받는다
const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const notoSerifKR = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["400", "600"],
});

// 브랜드 로고 폰트(Shantell Sans)는 next/font 대신 Google Fonts <link>로 로드한다.
// (Shantell은 가변폰트라 next/font가 라틴 글자 범위를 U+??로 손상시켜 로고가 렌더 안 됨 — 실측)

export const metadata: Metadata = {
  title: "Reading Stock",
  description: "당신의 투자를, 당신이 이해하도록 도와드려요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${plexSerif.variable} ${notoSansKR.variable} ${notoSerifKR.variable} h-full antialiased`}
    >
      {/* Shantell Sans (로고) — Google Fonts에서 로드 */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@500;600;700&display=swap"
      />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
