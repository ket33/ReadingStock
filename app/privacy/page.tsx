import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "개인정보 처리방침 — Reading Stock" };

// 개인정보 처리방침 — 개인정보보호위원회 「개인정보 처리방침 작성지침(2026.4)」의 표준 양식을
// Reading Stock의 실제 처리 현황(docs/개인정보_처리_명세표.md)에 맞춰 작성.
// 시행일·연락처 변경 시 아래 상수만 수정.
const EFFECTIVE = "2026년 7월 14일";
const CONTACT_EMAIL = "rladmlxo9@gmail.com";

function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-lg font-semibold text-primary mt-10 mb-3 flex items-baseline gap-2">
      <span className="text-sm text-secondary tabular-nums">{n}.</span>
      {children}
    </h2>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-grow max-w-[760px] mx-auto w-full px-4 md:px-10 py-12">
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-primary mb-2">
          개인정보 처리방침
        </h1>
        <p className="text-xs text-outline mb-8">시행일: {EFFECTIVE}</p>

        <div className="text-[14px] leading-[1.85] text-on-surface-variant [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:mb-3 [&_strong]:text-on-surface [&_strong]:font-semibold">
          <p>
            Reading Stock(readingstock.com, 이하 &lsquo;서비스&rsquo;)은 정보주체의 자유와 권리 보호를 위해
            「개인정보 보호법」 및 관계 법령이 정한 바를 준수하여, 적법하게 개인정보를 처리하고 안전하게
            관리하고 있습니다. 이에 「개인정보 보호법」 제30조에 따라 정보주체에게 개인정보의 처리와 보호에
            관한 절차 및 기준을 안내하고, 관련 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보
            처리방침을 수립·공개합니다.
          </p>

          <H2 n={1}>개인정보의 처리 목적</H2>
          <p>
            서비스는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 외의
            용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의
            동의를 받는 등 필요한 조치를 이행합니다.
          </p>
          <ul>
            <li>회원 가입 의사 확인, 회원 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지</li>
            <li>관심종목(Watching) 및 종목 페이지 표시지표 설정의 저장·제공</li>
            <li>가입 확인, 비밀번호 재설정 등 서비스 운영에 관한 통지</li>
            <li>마케팅 수신에 동의한 회원에 한하여, 관심 종목 업데이트 등 정보성·광고성 정보의 이메일 발송</li>
            <li>서비스 이용 통계 분석 및 서비스 품질·안정성 개선</li>
          </ul>

          <H2 n={2}>처리하는 개인정보의 항목</H2>
          <p>서비스는 서비스 제공에 필요한 최소한의 개인정보만을 처리합니다.</p>
          <p><strong>가. 회원가입 및 서비스 이용 과정에서 처리하는 항목</strong></p>
          <ul>
            <li><strong>필수</strong>: 이메일 주소, 비밀번호(이메일 가입 시 / 복호화되지 않는 형태로 저장)</li>
            <li><strong>필수</strong>: 소셜 로그인 인증 식별자(Google 계정으로 로그인하는 경우 Google이 제공하는 계정 식별자 및 이메일)</li>
            <li><strong>필수</strong>: 동의 기록(이용약관·개인정보 수집·이용 동의 시각, 만 14세 이상 확인)</li>
            <li><strong>선택</strong>: 마케팅 정보 수신 동의 여부</li>
            <li><strong>선택</strong>: 관심종목 목록(종목코드), 종목 페이지 표시지표 설정</li>
          </ul>
          <p><strong>나. 서비스 이용 과정에서 자동으로 생성·수집되는 항목</strong></p>
          <ul>
            <li>접속 IP 주소, 쿠키, 접속 로그, 기기·브라우저 정보, 서비스 이용 기록(방문 페이지 등)</li>
          </ul>
          <p>
            서비스는 이름, 전화번호, 주소, 생년월일, 결제정보 등 이메일 외의 신원정보를 수집하지 않습니다.
          </p>

          <H2 n={3}>개인정보의 처리 및 보유 기간</H2>
          <p>
            서비스는 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은
            보유·이용 기간 내에서 개인정보를 처리·보유합니다.
          </p>
          <ul>
            <li><strong>회원정보(이메일·인증정보·동의기록·관심종목·설정)</strong>: 회원 탈퇴 시까지. 회원 탈퇴 시 지체 없이 파기합니다.</li>
            <li><strong>접속 로그 등 자동 수집 정보</strong>: 관계 법령 및 처리위탁사(호스팅 제공자)의 정책에 따라 보관 후 파기합니다.</li>
          </ul>

          <H2 n={4}>개인정보의 파기 절차 및 방법</H2>
          <p>
            서비스는 개인정보 보유기간의 경과, 처리 목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이
            해당 개인정보를 파기합니다.
          </p>
          <ul>
            <li><strong>파기 절차</strong>: 회원이 서비스 내 &lsquo;회원 탈퇴&rsquo; 기능을 이용하면 계정 및 연동된 관심종목·설정 정보가 즉시 삭제됩니다.</li>
            <li><strong>파기 방법</strong>: 전자적 파일 형태로 저장된 개인정보는 복구·재생할 수 없는 방법으로 영구 삭제합니다.</li>
          </ul>

          <H2 n={5}>개인정보 처리업무의 위탁 및 국외 이전</H2>
          <p>
            서비스는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리업무를 국외 사업자에게 위탁·보관하고
            있습니다. 서비스의 시스템(인증·데이터베이스·호스팅·이메일 발송)은 해외에 서버를 둔 사업자를 통해
            운영되므로, 회원의 개인정보가 국외로 이전됩니다. 정보주체는 아래 내용을 확인하고 동의한 후 서비스에
            가입할 수 있습니다.
          </p>
          <div className="overflow-x-auto my-4 border border-outline-variant rounded-lg">
            <table className="w-full text-[12.5px] whitespace-nowrap">
              <thead className="bg-surface-container-low text-on-surface-variant">
                <tr className="[&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium">
                  <th>이전받는 자 (국가)</th>
                  <th>위탁·이전 업무</th>
                  <th>이전 항목</th>
                  <th>보유·이용 기간</th>
                </tr>
              </thead>
              <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:border-t [&_td]:border-outline-variant/60 text-on-surface-variant">
                <tr>
                  <td><strong>Supabase, Inc.</strong> (미국)<br /><span className="text-outline">privacy@supabase.io</span></td>
                  <td>회원 인증 및 데이터베이스(관심종목·설정) 저장</td>
                  <td>이메일, 인증 식별자, 비밀번호(해시), 동의기록, 관심종목·설정</td>
                  <td>회원 탈퇴 시까지</td>
                </tr>
                <tr>
                  <td><strong>Vercel Inc.</strong> (미국)<br /><span className="text-outline">privacy@vercel.com</span></td>
                  <td>웹사이트 호스팅 및 접속 처리, 이용통계 분석</td>
                  <td>접속 로그, IP, 기기·브라우저 정보(통계는 익명 집계)</td>
                  <td>각사 정책 및 회원 탈퇴 시까지</td>
                </tr>
                <tr>
                  <td><strong>Google LLC (Google Analytics)</strong> (미국)<br /><span className="text-outline">policies.google.com</span></td>
                  <td>서비스 이용통계 분석</td>
                  <td>방문 페이지, 기기·브라우저 정보, 쿠키 식별자(개인 미식별 집계)</td>
                  <td>각사 정책에 따름</td>
                </tr>
                <tr>
                  <td><strong>Microsoft Corp. (Clarity)</strong> (미국)<br /><span className="text-outline">privacy.microsoft.com</span></td>
                  <td>서비스 사용성 분석(방문 패턴 등)</td>
                  <td>방문 페이지, 기기·브라우저 정보, 쿠키 식별자(개인 미식별 집계)</td>
                  <td>각사 정책에 따름</td>
                </tr>
                <tr>
                  <td><strong>Resend</strong> (미국)<br /><span className="text-outline">privacy@resend.com</span></td>
                  <td>가입 확인·비밀번호 재설정·마케팅 메일 발송</td>
                  <td>이메일 주소</td>
                  <td>발송 목적 달성 시</td>
                </tr>
                <tr>
                  <td><strong>Google LLC</strong> (미국)<br /><span className="text-outline">policies.google.com</span></td>
                  <td>소셜 로그인 인증(Google 로그인 이용 시)</td>
                  <td>이메일, 계정 식별자</td>
                  <td>회원 탈퇴 시까지</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">
            <strong>이전 시기 및 방법</strong>: 서비스 이용 시점에 정보통신망을 통해 암호화하여 전송합니다.
            &nbsp;<strong>국외 이전 거부 방법 및 효과</strong>: 위 국외 이전은 서비스 제공에 필수적이므로, 이를
            거부할 경우 회원가입 및 서비스 이용이 제한됩니다. 국외 이전을 원치 않는 경우 회원 탈퇴(설정 → 회원
            탈퇴)를 통해 개인정보 처리를 중단할 수 있습니다. 각 수탁사의 개인정보 보호 수준은 위 연락처 및 각사
            개인정보 처리방침에서 확인할 수 있습니다.
          </p>
          <p className="text-[13px] text-outline">
            서비스는 위 목적 외의 용도로 회원의 개인정보를 제3자에게 제공하지 않으며, 회원이 입력한 정보를 외부의
            AI 모델 학습용으로 판매하거나 제공하지 않습니다.
          </p>

          <H2 n={6}>개인정보의 안전성 확보조치</H2>
          <p>서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
          <ul>
            <li><strong>관리적 조치</strong>: 개인정보에 대한 접근 권한 최소화 및 관리</li>
            <li><strong>기술적 조치</strong>: 데이터베이스 접근권한 통제(RLS, 본인 데이터만 접근), 비밀번호의 복호화 불가능한 저장, 통신 구간 암호화(HTTPS/TLS), 관리자용 비밀 키의 서버 측 격리(브라우저 미노출)</li>
            <li><strong>물리적 조치</strong>: 개인정보가 저장되는 시스템은 국내외 인증을 보유한 클라우드 사업자의 데이터센터를 통해 관리</li>
          </ul>

          <H2 n={7}>개인정보 자동 수집 장치(쿠키)의 설치·운영 및 거부</H2>
          <p>
            서비스는 로그인 상태 유지 및 서비스 이용 분석을 위해 쿠키(cookie) 및 이와 유사한 기술(브라우저 저장소
            등)을 사용합니다. 쿠키는 웹사이트가 이용자의 브라우저에 보내는 소량의 정보로, 이용자의 기기에
            저장됩니다.
          </p>
          <p>
            이용자는 웹 브라우저의 설정을 통해 쿠키 저장을 거부할 수 있습니다. 다만 쿠키 저장을 거부하는 경우
            로그인 유지 등 일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
          <ul>
            <li>Chrome: 설정 → 개인정보 보호 및 보안 → 쿠키 및 사이트 데이터</li>
            <li>Edge: 설정 → 쿠키 및 사이트 권한 → 쿠키 및 저장된 데이터</li>
            <li>Safari: 설정 → Safari → 고급 → 모든 쿠키 차단</li>
          </ul>
          <p className="text-[13px] text-outline">
            서비스는 이용통계 및 사용성 분석을 위해 Vercel Analytics, Google Analytics, Microsoft Clarity를
            이용합니다. 이들 도구는 개인을 식별하지 않는 집계·분석 목적으로만 사용되며, 서비스는 맞춤형 광고를
            위한 행태정보를 수집하지 않습니다. 이용자는 아래 브라우저 쿠키 차단 설정 또는 Google Analytics
            차단 부가기능(tools.google.com/dlpage/gaoptout)을 통해 통계 수집을 거부할 수 있습니다.
          </p>

          <H2 n={8}>만 14세 미만 아동의 개인정보 처리</H2>
          <p>
            서비스는 만 14세 미만 아동의 개인정보를 처리하지 않습니다. 회원가입 시 만 14세 이상임을 확인하고
            있으며, 만 14세 미만 아동의 가입은 허용되지 않습니다.
          </p>

          <H2 n={9}>정보주체와 법정대리인의 권리·의무 및 행사방법</H2>
          <p>정보주체는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul>
            <li>개인정보 열람·정정 요구: 로그인 후 [설정] 화면에서 이메일 등 계정 정보를 확인할 수 있습니다.</li>
            <li>삭제(회원 탈퇴) 요구: [설정 → 회원 탈퇴]에서 직접 계정과 개인정보를 삭제할 수 있습니다.</li>
            <li>마케팅 수신 동의 철회: 회원가입 시 선택한 마케팅 수신 동의는 언제든지 철회를 요청할 수 있습니다.</li>
            <li>처리정지 요구 및 기타 권리 행사: 아래 개인정보 보호책임자의 연락처로 요청할 수 있습니다.</li>
          </ul>
          <p>
            권리 행사는 아래 연락처를 통해 서면, 전자우편 등으로 하실 수 있으며, 서비스는 이에 대해 지체 없이
            조치합니다. 정보주체가 개인정보의 오류 등에 대한 정정·삭제를 요구한 경우, 서비스는 정정·삭제를 완료할
            때까지 해당 개인정보를 이용하거나 제공하지 않습니다.
          </p>

          <H2 n={10}>개인정보 보호책임자</H2>
          <p>
            서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 문의·불만
            처리 및 피해 구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <ul>
            <li><strong>개인정보 보호책임자</strong>: 운영자</li>
            <li><strong>연락처(이메일)</strong>: {CONTACT_EMAIL}</li>
          </ul>
          <p>
            정보주체는 서비스를 이용하면서 발생한 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등에 관한
            사항을 위 연락처로 문의할 수 있으며, 서비스는 지체 없이 답변 및 처리합니다.
          </p>

          <H2 n={11}>권익침해에 대한 구제방법</H2>
          <p>
            정보주체는 개인정보 침해로 인한 구제를 받기 위하여 아래의 기관에 분쟁 해결이나 상담 등을 신청할 수
            있습니다.
          </p>
          <ul>
            <li>개인정보 분쟁조정위원회: (국번 없이) 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해 신고센터: (국번 없이) 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청 사이버수사과: (국번 없이) 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버수사국: (국번 없이) 182 (ecrm.police.go.kr)</li>
          </ul>

          <H2 n={12}>개인정보 처리방침의 변경</H2>
          <p>
            이 개인정보 처리방침은 {EFFECTIVE}부터 적용됩니다. 법령·정책 또는 서비스의 변경에 따라 내용이
            추가·삭제·수정되는 경우, 변경 사항의 시행 전에 서비스 내 공지 등을 통해 안내합니다.
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-outline-variant flex flex-wrap gap-4 text-sm">
          <Link href="/" className="text-primary underline underline-offset-2">← 홈으로</Link>
          <Link href="/terms" className="text-on-surface-variant hover:text-primary">이용약관</Link>
        </div>
      </main>
    </>
  );
}
