import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AuthProvider from "@/components/auth/AuthProvider";
import ThirdPartyAnalytics from "@/components/ThirdPartyAnalytics";
import { SITE_URL, SITE_NAME, SITE_SLOGAN } from "@/lib/seo";
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
  // 모든 상대경로(OG 이미지 등)를 이 주소 기준 절대주소로 만든다
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,                 // 홈: "Reading Stock"
    template: `%s - ${SITE_NAME}`,       // 하위 페이지: "…제목… - Reading Stock"
  },
  description: SITE_SLOGAN,
  applicationName: SITE_NAME,
  // 구글/네이버 서치 콘솔 소유권 확인 (HTML 태그 방식)
  verification: {
    google: "DD0v283WeLJkJ7-J1q5q_Yymrj8u7zy6eg6B5AA00gU",
    // 네이버 서치어드바이저 (other 키는 그대로 meta name이 된다)
    other: {
      "naver-site-verification": "f0c8f5dda11291f050c04cc6328c598a5eba8168",
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_SLOGAN,
    // og 이미지는 app/opengraph-image.tsx가 자동으로 추가한다(모든 페이지 공통)
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_SLOGAN,
  },
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
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
        <ThirdPartyAnalytics />
      </body>
    </html>
  );
}
