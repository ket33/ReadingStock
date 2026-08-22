"use client";

// 푸터의 Contact & Feedback — 버튼과 팝업만 클라이언트로 분리한다.
// SiteFooter는 모든 페이지에 깔리는 서버 컴포넌트라, 거기에 "use client"를 붙이면
// 푸터 전체가 클라이언트 번들로 넘어간다. 상태가 필요한 이 조각만 떼어냈다.
import { useEffect, useState } from "react";

const LINKEDIN = "linkedin.com/in/euitae-kim-17ab15380";
const EMAIL = "rladmlxo9@gmail.com";

export default function ContactDialog() {
  const [open, setOpen] = useState(false);

  // 팝업이 떠 있는 동안 Esc로 닫고, 뒤 배경이 스크롤되지 않게 막는다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-on-surface-variant hover:text-primary transition-colors"
      >
        Contact &amp; Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-dialog-title"
        >
          <div
            className="bg-white rounded-xl border border-outline-variant shadow-lg p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 id="contact-dialog-title" className="font-serif text-lg font-bold text-primary">
                Contact &amp; Feedback
              </h2>
              {/* 아이콘은 인라인 SVG로 — Material Symbols 폰트는 홈·industries에서만 로드되는데
                  푸터는 모든 페이지에 깔려서, 폰트가 없는 페이지에선 'close' 글자가 그대로 보인다 */}
              <button
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="-mt-1 -mr-1 p-1 rounded-full text-outline hover:text-primary hover:bg-surface-container-low transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-on-surface leading-relaxed mb-5">
              여러분의 피드백을 적극 환영합니다!
            </p>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-outline mb-0.5">LinkedIn address</dt>
                <dd>
                  <a
                    href={`https://www.${LINKEDIN}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface hover:text-primary transition-colors break-all"
                  >
                    {LINKEDIN}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-outline mb-0.5">E-mail address</dt>
                <dd>
                  <a
                    href={`mailto:${EMAIL}`}
                    className="text-on-surface hover:text-primary transition-colors break-all"
                  >
                    {EMAIL}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
