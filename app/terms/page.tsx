import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "이용약관 — Reading Stock" };

// 이용약관 — 표준 서비스 약관 구조(everyticker 참고)를 한국 서비스에 맞게 작성.
// 투자정보 서비스 특성상 '투자 판단 면책'을 명시. 시행일·연락처 변경 시 상수만 수정.
const EFFECTIVE = "2026년 7월 14일";
const CONTACT_EMAIL = "rladmlxo9@gmail.com";

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg font-semibold text-primary mb-3">
        제{n}조 <span className="ml-1">{title}</span>
      </h2>
      <div className="text-[14px] leading-[1.85] text-on-surface-variant [&_p]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_strong]:text-on-surface [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-grow max-w-[760px] mx-auto w-full px-4 md:px-10 py-12">
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-primary mb-2">이용약관</h1>
        <p className="text-xs text-outline mb-6">시행일: {EFFECTIVE}</p>

        <Article n={1} title="목적">
          <p>
            이 약관은 Reading Stock(readingstock.com, 이하 &lsquo;서비스&rsquo;)이 제공하는 주식 정보·분석 콘텐츠 및
            관련 제반 서비스의 이용과 관련하여 서비스와 이용자(회원 및 비회원) 간의 권리·의무 및 책임사항, 이용
            조건 및 절차 등 기본적인 사항을 규정함을 목적으로 합니다.
          </p>
        </Article>

        <Article n={2} title="정의">
          <ol>
            <li>&lsquo;이용자&rsquo;란 이 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
            <li>&lsquo;회원&rsquo;이란 서비스에 이메일 또는 소셜 계정으로 가입하여 지속적으로 서비스를 이용할 수 있는 자를 말합니다.</li>
            <li>&lsquo;콘텐츠&rsquo;란 서비스가 제공하는 종목 정보, 재무 데이터, 지표, 분석 글 등 일체의 자료를 말합니다.</li>
          </ol>
        </Article>

        <Article n={3} title="약관의 효력 및 변경">
          <ol>
            <li>이 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.</li>
            <li>서비스는 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 명시하여 서비스 내에 사전 공지합니다.</li>
            <li>이용자가 변경된 약관에 동의하지 않는 경우, 서비스 이용을 중단하고 회원 탈퇴를 할 수 있습니다.</li>
          </ol>
        </Article>

        <Article n={4} title="회원가입 및 계정">
          <ol>
            <li>이용자는 서비스가 정한 절차에 따라 이메일 또는 소셜 계정으로 회원가입을 신청하며, 만 14세 이상이어야 합니다.</li>
            <li>회원은 계정 정보(이메일·비밀번호 등)를 스스로 관리할 책임이 있으며, 이를 제3자가 이용하도록 하여서는 안 됩니다.</li>
            <li>회원은 언제든지 서비스 내 [설정 → 회원 탈퇴]를 통해 이용계약을 해지(탈퇴)할 수 있습니다.</li>
          </ol>
        </Article>

        <Article n={5} title="서비스의 제공 및 변경">
          <ol>
            <li>서비스는 종목 정보 조회, 관심종목(Watching) 저장, 지표 비교, 분석 글 열람 등의 기능을 제공합니다.</li>
            <li>서비스는 운영상·기술상의 필요에 따라 제공하는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이 경우 사전에 공지하도록 노력합니다.</li>
            <li>서비스는 무료로 제공되며, 유료 서비스가 도입되는 경우 별도의 조건을 사전에 고지합니다.</li>
          </ol>
        </Article>

        <Article n={6} title="투자 정보에 관한 유의사항 (면책)">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4 space-y-2">
            <p>
              <strong>서비스가 제공하는 모든 콘텐츠는 공개된 데이터를 바탕으로 자동 생성된 참고 자료이며, 정보
              제공을 목적으로 합니다. 이는 특정 종목의 매수·매도 등 투자 권유나 자문이 아닙니다.</strong>
            </p>
            <p>
              콘텐츠는 오류·지연·누락이 있을 수 있으며, 서비스는 그 정확성·완전성·적시성을 보증하지 않습니다.
              투자에 관한 최종 판단과 그에 따른 결과에 대한 책임은 전적으로 이용자 본인에게 있으며, 서비스는
              이용자의 투자 결정 및 그 결과에 대하여 법령이 허용하는 범위에서 책임을 지지 않습니다.
            </p>
          </div>
        </Article>

        <Article n={7} title="지식재산권">
          <ol>
            <li>서비스가 작성한 콘텐츠에 대한 저작권 및 기타 지식재산권은 서비스에 귀속됩니다.</li>
            <li>이용자는 서비스를 이용함으로써 얻은 콘텐츠를 서비스의 사전 동의 없이 복제·전송·출판·배포·방송 기타 방법으로 영리 목적에 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.</li>
            <li>종목의 재무 데이터·시세 등 원천 정보의 권리는 각 원저작자·정보제공처에 있습니다.</li>
          </ol>
        </Article>

        <Article n={8} title="이용자의 의무">
          <ol>
            <li>이용자는 관련 법령, 이 약관의 규정을 준수하여야 합니다.</li>
            <li>이용자는 다음 행위를 하여서는 안 됩니다: 서비스에 대한 무단 접근·자동화 수집(크롤링·스크래핑) 등 정상적인 운영을 방해하는 행위, 타인의 정보 도용, 서비스의 안정적 운영을 방해하는 행위.</li>
          </ol>
        </Article>

        <Article n={9} title="이용제한 및 계약 해지">
          <ol>
            <li>서비스는 이용자가 이 약관을 위반하거나 서비스의 정상적인 운영을 방해한 경우, 사전 통지 없이 서비스 이용을 제한하거나 이용계약을 해지할 수 있습니다.</li>
            <li>회원은 언제든지 회원 탈퇴를 통해 이용계약을 해지할 수 있으며, 탈퇴 시 개인정보는 개인정보 처리방침에 따라 처리됩니다.</li>
          </ol>
        </Article>

        <Article n={10} title="책임의 한계">
          <ol>
            <li>서비스는 천재지변, 불가항력, 이용자의 귀책사유 또는 제3자(정보제공처·클라우드 사업자 등)의 사유로 인한 서비스 중단·데이터 오류에 대하여 책임을 지지 않습니다.</li>
            <li>서비스는 무료로 제공되므로, 관련 법령이 허용하는 범위에서 콘텐츠 이용으로 발생한 손해에 대하여 책임을 부담하지 않습니다.</li>
          </ol>
        </Article>

        <Article n={11} title="개인정보 보호">
          <p>
            서비스는 이용자의 개인정보를 관계 법령에 따라 보호하며, 개인정보의 처리에 관한 사항은 별도의{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-2">개인정보 처리방침</Link>
            에 따릅니다.
          </p>
        </Article>

        <Article n={12} title="준거법 및 분쟁해결">
          <ol>
            <li>이 약관 및 서비스 이용에 관하여는 대한민국 법령을 준거법으로 합니다.</li>
            <li>서비스와 이용자 간에 발생한 분쟁에 대하여는 관계 법령 및 상관례에 따라 성실히 협의하여 해결하며, 협의가 이루어지지 않는 경우 관할 법원은 민사소송법에 따른 법원으로 합니다.</li>
          </ol>
        </Article>

        <Article n={13} title="문의">
          <p>서비스 이용에 관한 문의는 아래로 연락해 주세요.</p>
          <p><strong>이메일</strong>: {CONTACT_EMAIL}</p>
        </Article>

        <div className="mt-12 pt-6 border-t border-outline-variant flex flex-wrap gap-4 text-sm">
          <Link href="/" className="text-primary underline underline-offset-2">← 홈으로</Link>
          <Link href="/privacy" className="text-on-surface-variant hover:text-primary">개인정보 처리방침</Link>
        </div>
      </main>
    </>
  );
}
