// 사용자 행동 이벤트 — 붙어 있는 계측 도구 전부로 같은 이벤트를 보낸다.
//
// 왜 한 군데로 안 보내나: 지금 GA4·Microsoft Clarity·Vercel Analytics 세 가지가 함께 붙어 있고
// (ThirdPartyAnalytics.tsx / app/layout.tsx), 각자 잘하는 게 다르다.
//   · GA4     — 속성(tab·source·code)까지 남아 집계·비교에 쓴다. 지금 유일하게 속성을 받는 곳.
//   · Clarity — 이벤트 이름만 받지만, 그 이벤트가 찍힌 세션 녹화를 골라 볼 수 있다.
//   · Vercel  — 속성까지 받지만 커스텀 이벤트 집계는 Pro 플랜부터다(Hobby면 조용히 버려진다).
//
// 주의: GA4는 커스텀 속성을 '맞춤 측정기준'으로 등록해야 보고서에 나온다.
//   GA4 관리 → 맞춤 정의 → 맞춤 측정기준 만들기 → 이벤트 매개변수 tab / source / code 각각 등록.
//   등록 전에도 이벤트 발생 건수는 실시간 보고서에서 바로 보인다.
import { track as vercelTrack } from "@vercel/analytics";

type Props = Record<string, string | number | boolean>;

interface AnalyticsWindow {
  gtag?: (command: string, name: string, props?: Props) => void;
  clarity?: (command: string, name: string) => void;
}

/** 이벤트 하나를 살아 있는 계측 도구 전부로 보낸다. 계측 실패는 화면 동작을 막지 않는다. */
export function trackEvent(name: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as AnalyticsWindow;

  try { w.gtag?.("event", name, props); } catch { /* 무시 */ }
  try { w.clarity?.("event", name); } catch { /* 무시 */ }
  try { vercelTrack(name, props); } catch { /* 무시 */ }
}
