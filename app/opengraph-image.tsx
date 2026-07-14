import { ImageResponse } from "next/og";

// 카카오톡·슬랙·페이스북 등에 링크를 붙였을 때 뜨는 공통 미리보기 카드(1200×630).
// app 루트에 두면 모든 페이지가 이 이미지를 기본 og:image로 쓴다.
// ※ 한글 폰트 임베드 없이 기본 폰트로 렌더되므로 브랜드 문구는 영문으로 둔다.

export const alt = "Reading Stock";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#041627";
const GREEN = "#00a63a";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          color: "#ffffff",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* 상단: 사이트 주소 */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "18px", height: "18px", borderRadius: "9999px", background: GREEN }} />
          <div style={{ fontSize: "30px", letterSpacing: "6px", color: "#8fa3bf" }}>
            READINGSTOCK.COM
          </div>
        </div>

        {/* 가운데: 브랜드 + 태그라인 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "112px", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1 }}>
            Reading Stock
          </div>
          <div style={{ fontSize: "44px", color: "#c7d4e6", lineHeight: 1.3 }}>
            Read the company. Understand your investment.
          </div>
        </div>

        {/* 하단: 강조선 */}
        <div style={{ display: "flex", width: "160px", height: "8px", background: GREEN, borderRadius: "4px" }} />
      </div>
    ),
    { ...size },
  );
}
