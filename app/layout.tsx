import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif, Noto_Sans_KR, Noto_Serif_KR, Shantell_Sans } from "next/font/google";
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

// 브랜드 로고 전용 폰트 (design handoff: 심볼 R + 워드마크)
const shantell = Shantell_Sans({
  variable: "--font-shantell",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Reading Stock",
  description: "초보자를 위한 국내주식 리서치",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${plexSerif.variable} ${notoSansKR.variable} ${notoSerifKR.variable} ${shantell.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
