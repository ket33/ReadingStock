"use client";

// 푸터의 Contact & Feedback — 버튼과 팝업만 클라이언트로 분리한다.
// SiteFooter는 모든 페이지에 깔리는 서버 컴포넌트라, 거기에 "use client"를 붙이면
// 푸터 전체가 클라이언트 번들로 넘어간다. 상태가 필요한 이 조각만 떼어냈다.
import { useEffect, useState } from "react";

const LINKEDIN = "linkedin.com/in/euitae-kim-17ab15380";
const EMAIL = "rladmlxo9@gmail.com";

export default function ContactDialog() {
  const [open, setOpen] = useState(false);
  // 마운트 직후 한 프레임 뒤에 켜야 transition이 걸릴 구간이 생긴다.
  // (처음부터 목표 상태면 애니메이션 없이 그냥 나타난다 — Price 게이지와 같은 이유)
  const [shown, setShown] = useState(false);

  // 닫기는 여기 한 곳으로 모은다 — shown 초기화를 이펙트 본문에서 하면
  // setState가 이펙트 안에서 동기 호출돼 연쇄 렌더를 부른다(react-hooks/set-state-in-effect).
  function close() {
    setShown(false);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";   // 팝업 뒤 배경이 스크롤되지 않게
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-on-surface-variant hover:text-primary hover:underline underline-offset-4 transition-colors"
      >
        Contact &amp; Feedback
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70
                      transition-opacity duration-500 ease-out ${shown ? "opacity-100" : "opacity-0"}`}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-dialog-title"
        >
          <div
            className={`bg-white rounded-2xl border border-outline-variant shadow-xl
                        w-full max-w-2xl p-7 md:p-9
                        transition-all duration-500 ease-out
                        ${shown ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-[0.98]"}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-end -mt-2 -mr-2 mb-1">
              {/* 아이콘은 인라인 SVG로 — Material Symbols 폰트는 홈·industries에서만 로드되는데
                  푸터는 모든 페이지에 깔려서, 폰트가 없는 페이지에선 'close' 글자가 그대로 보인다 */}
              <button
                onClick={close}
                aria-label="닫기"
                className="p-1 rounded-full text-outline hover:text-primary hover:bg-surface-container-low transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* 왼쪽 로고 / 오른쪽 문구·주소 — 좁은 화면에선 세로로 쌓인다 */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-7 sm:gap-9">
              {/* 로고는 Logo 컴포넌트를 쓰지 않는다 — 그건 홈으로 가는 Link라 팝업에서 누르면 이탈한다 */}
              <div className="shrink-0 flex flex-col items-center gap-3">
                <svg width="104" height="104" viewBox="0 0 48 48" aria-hidden="true">
                  <circle cx="24" cy="24" r="24" fill="#16243f" />
                  <text x="24" y="34" textAnchor="middle" fontWeight={700} fontSize={28} fill="#ffffff"
                        style={{ fontFamily: "var(--font-logo)" }}>
                    R
                  </text>
                  <circle cx="35" cy="14" r="3.2" fill="#e5654b" />
                </svg>
                <span className="font-bold text-[#16243f] leading-none whitespace-nowrap"
                      style={{ fontFamily: "var(--font-logo)", fontSize: 19, letterSpacing: "-0.005em" }}>
                  Reading Stock
                </span>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 id="contact-dialog-title" className="font-serif text-xl font-bold text-primary mb-2">
                  Contact &amp; Feedback
                </h2>
                <p className="text-sm text-on-surface leading-relaxed mb-6">
                  여러분의 피드백을 적극 환영합니다!
                </p>

                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-xs text-outline mb-1">LinkedIn address</dt>
                    <dd>
                      <a
                        href={`https://www.${LINKEDIN}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-on-surface hover:text-primary hover:underline underline-offset-4 transition-colors break-all"
                      >
                        {LINKEDIN}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-outline mb-1">E-mail address</dt>
                    <dd>
                      <a
                        href={`mailto:${EMAIL}`}
                        className="text-on-surface hover:text-primary hover:underline underline-offset-4 transition-colors break-all"
                      >
                        {EMAIL}
                      </a>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
