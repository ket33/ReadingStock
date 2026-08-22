import { ImageResponse } from "next/og";

// 카카오톡·슬랙·페이스북 등에 링크를 붙였을 때 뜨는 공통 미리보기 카드(1200×630).
// app 루트에 두면 모든 페이지가 이 이미지를 기본 og:image로 쓴다.
// 디자인: 홈페이지 무드(화이트 + 점 패턴) + 로고 락업(심볼+Shantell Sans) + 코랄 포인트.
// 한글 폰트는 임베드가 무거워 문구는 영문 슬로건(히어로와 동일)으로 둔다.

export const alt = "Reading Stock";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#16243f";
const CORAL = "#e5654b";
const GRAY = "#74777d";

/** Google Fonts에서 Shantell Sans 서브셋(ttf)을 받아온다 — Vercel OG 공식 패턴 */
async function loadShantell(weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
    if (!m) return null;
    return await (await fetch(m[1])).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const [bold, regular] = await Promise.all([
    loadShantell(700, "Reading StockR"),
    loadShantell(400, "Investing starts after Reading Stock"),
  ]);
  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700 }[] = [];
  if (bold) fonts.push({ name: "Shantell", data: bold, weight: 700 });
  if (regular) fonts.push({ name: "Shantell", data: regular, weight: 400 });
  const brandFont = fonts.length > 0 ? "Shantell" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          backgroundImage: "radial-gradient(circle at 2px 2px, rgba(4,22,39,0.07) 2px, transparent 0)",
          backgroundSize: "44px 44px",
          padding: "72px 80px",
          fontFamily: brandFont,
        }}
      >
        {/* 상단: 도메인 주소 (작게) + 코랄 점 */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "14px", height: "14px", borderRadius: "9999px", background: CORAL }} />
          <div style={{ fontSize: "26px", letterSpacing: "6px", color: GRAY, fontFamily: "sans-serif" }}>
            READINGSTOCK.COM
          </div>
        </div>

        {/* 가운데: 로고 락업 + 슬로건 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "30px" }}>
            {/* 심볼: 네이비 정원 + 흰 R + 우상단 코랄 점 */}
            <div style={{ position: "relative", display: "flex", width: "128px", height: "128px" }}>
              <div
                style={{
                  width: "128px",
                  height: "128px",
                  borderRadius: "9999px",
                  background: NAVY,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: "78px",
                  fontWeight: 700,
                }}
              >
                R
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "4px",
                  top: "4px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "9999px",
                  background: CORAL,
                }}
              />
            </div>
            <div style={{ fontSize: "100px", fontWeight: 700, color: NAVY, letterSpacing: "-1px", lineHeight: 1 }}>
              Reading Stock
            </div>
          </div>

          {/* 슬로건 — 홈 히어로와 동일 문구 */}
          <div style={{ display: "flex", fontSize: "42px", fontWeight: 400, color: "#44474c", lineHeight: 1.3 }}>
            Investing starts after&nbsp;
            <span style={{ color: NAVY, fontWeight: 700 }}>Reading Stock</span>
          </div>
        </div>

        {/* 하단: 코랄 강조선 */}
        <div style={{ display: "flex", width: "160px", height: "8px", background: CORAL, borderRadius: "4px" }} />
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
