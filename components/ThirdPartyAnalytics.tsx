// Google Analytics(GA4) + Microsoft Clarity — 환경변수에 ID가 있을 때만 로드.
// ID가 없으면(로컬·미설정) 아무 스크립트도 넣지 않아 추적이 발생하지 않는다.
//   NEXT_PUBLIC_GA_ID      = "G-XXXXXXXXXX"   (Google Analytics 측정 ID)
//   NEXT_PUBLIC_CLARITY_ID = "xxxxxxxxxx"     (Microsoft Clarity 프로젝트 ID)
import Script from "next/script";

export default function ThirdPartyAnalytics() {
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  const clarity = process.env.NEXT_PUBLIC_CLARITY_ID;

  return (
    <>
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga}');
            `}
          </Script>
        </>
      )}

      {clarity && (
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${clarity}");
          `}
        </Script>
      )}
    </>
  );
}
