/**
 * check-mobile.cjs — 모바일 뷰포트 가로 넘침 검사
 * ================================================
 * 주요 페이지를 iPhone급 뷰포트(390px)로 열어 가로 스크롤(scrollWidth > clientWidth)이
 * 생기는지 검사한다. "모바일에서 레이아웃이 뒤틀린다"의 원인 대부분이 가로 넘침이라
 * UI 수정 후 이 스크립트 하나로 회귀를 잡을 수 있다.
 *
 * 사용법:
 *   1) 개발 서버 실행:  npm run dev  (또는 next start)
 *   2) node scripts/check-mobile.cjs [베이스URL]     ← 기본 http://localhost:3000
 *
 * 필요: playwright + chromium.
 *   npx playwright install chromium  (최초 1회 — playwright는 npx 캐시에서 자동 탐색)
 * 스크린샷은 OS 임시폴더에 mcheck_*.png로 저장된다.
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

// playwright 모듈 탐색: 로컬 node_modules → npx 캐시
function resolvePlaywright() {
  try { return require("playwright"); } catch {}
  const npx = path.join(os.homedir(), "AppData", "Local", "npm-cache", "_npx");
  if (fs.existsSync(npx)) {
    for (const dir of fs.readdirSync(npx)) {
      const p = path.join(npx, dir, "node_modules", "playwright");
      if (fs.existsSync(p)) return require(p);
    }
  }
  console.error("playwright를 찾지 못했습니다.  npm i -D playwright  또는  npx playwright install chromium");
  process.exit(2);
}

const PAGES = ["/", "/screener", "/watchlist", "/stock/005930"];

(async () => {
  const base = process.argv[2] || "http://localhost:3000";
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  let failures = 0;
  for (const p of PAGES) {
    try {
      await page.goto(base + p, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const name = "mcheck_" + (p === "/" ? "home" : p.replace(/\W+/g, "_").replace(/^_|_$/g, ""));
      await page.screenshot({ path: path.join(os.tmpdir(), `${name}.png`) });
      if (overflow > 0) {
        failures++;
        console.log(`  ✗ ${p}  가로 넘침 ${overflow}px  → ${name}.png 확인`);
      } else {
        console.log(`  ✓ ${p}  넘침 없음`);
      }
    } catch (e) {
      failures++;
      console.log(`  ✗ ${p}  로드 실패: ${String(e.message).split("\n")[0]}`);
    }
  }
  await browser.close();
  console.log(failures ? `\n실패 ${failures}건 — 스크린샷: ${os.tmpdir()}` : "\n모바일 가로 넘침 없음 ✓");
  process.exit(failures ? 1 : 0);
})();
