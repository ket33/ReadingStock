import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "이용약관 — Reading Stock" };

// 이용약관 — 공정거래위원회 「전자상거래(인터넷사이버몰) 표준약관 제10023호」의
// 서비스 공통 조항을 무료 정보 서비스에 맞게 채택하고, 쇼핑몰 전용 조항
// (구매신청·계약성립·지급·공급·환급·청약철회)은 판매 행위가 없어 제외.
// 투자정보 서비스 특성상 '투자 판단 면책'(제9조)을 명시.
// 유료 서비스 도입 시 결제·청약철회 관련 조항을 추가해야 함.
const EFFECTIVE = "2026년 7월 14일";
const CONTACT_EMAIL = "rladmlxo9@gmail.com";

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg font-semibold text-primary mb-3">
        제{n}조 <span className="ml-1">({title})</span>
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
            관련 제반 서비스의 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임사항, 이용 조건 및 절차 등
            기본적인 사항을 규정함을 목적으로 합니다.
          </p>
        </Article>

        <Article n={2} title="정의">
          <ol>
            <li>&lsquo;이용자&rsquo;란 이 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
            <li>&lsquo;회원&rsquo;이란 서비스에 이메일 또는 소셜 계정으로 가입하여 지속적으로 서비스를 이용할 수 있는 자를 말합니다.</li>
            <li>&lsquo;비회원&rsquo;이란 회원에 가입하지 않고 서비스를 이용하는 자를 말합니다.</li>
            <li>&lsquo;콘텐츠&rsquo;란 서비스가 제공하는 종목 정보, 재무 데이터, 지표, 분석 글 등 일체의 자료를 말합니다.</li>
          </ol>
        </Article>

        <Article n={3} title="약관의 명시와 설명 및 개정">
          <ol>
            <li>서비스는 이 약관의 내용과 상호, 개인정보 보호책임자의 연락처 등을 이용자가 쉽게 알 수 있도록 서비스 화면 또는 연결화면에 게시합니다.</li>
            <li>서비스는 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</li>
            <li>서비스가 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 현행약관과 함께 적용일자 7일 이전부터 서비스 내에 공지합니다. 다만, 이용자에게 불리하게 약관을 변경하는 경우에는 최소 30일 이상의 사전 유예기간을 두고 공지합니다.</li>
            <li>이용자가 개정약관에 동의하지 않는 경우 서비스 이용을 중단하고 회원 탈퇴를 할 수 있습니다.</li>
          </ol>
        </Article>

        <Article n={4} title="서비스의 제공 및 변경">
          <ol>
            <li>서비스는 종목 정보 조회, 관심종목(Watching) 저장, 지표 비교, 분석 글 열람 등의 기능을 제공합니다.</li>
            <li>서비스는 운영상·기술상의 필요에 따라 제공하는 서비스의 전부 또는 일부를 변경할 수 있으며, 이 경우 변경 내용 및 사유를 사전에 공지합니다.</li>
            <li>서비스는 무료로 제공되며, 유료 서비스가 도입되는 경우 그 조건 및 결제·청약철회 등에 관한 사항을 별도로 정하여 사전에 고지합니다.</li>
          </ol>
        </Article>

        <Article n={5} title="서비스의 중단">
          <ol>
            <li>서비스는 정보통신설비의 보수점검·교체 및 고장, 통신두절 등의 사유가 발생한 경우에는 서비스의 제공을 일시적으로 중단할 수 있습니다.</li>
            <li>서비스는 제1항의 사유로 서비스 제공이 일시적으로 중단됨으로 인하여 이용자가 입은 손해에 대하여 배상하지 않습니다. 다만, 서비스에 고의 또는 중대한 과실이 있는 경우에는 그러하지 아니합니다.</li>
            <li>사업종목의 전환, 사업의 포기 등의 이유로 서비스를 제공할 수 없게 되는 경우에는 사전에 이용자에게 공지합니다.</li>
          </ol>
        </Article>

        <Article n={6} title="회원가입">
          <ol>
            <li>이용자는 서비스가 정한 절차에 따라 이메일 또는 소셜 계정으로 회원가입을 신청하며, 이 약관에 동의함으로써 회원가입을 신청합니다.</li>
            <li>회원가입은 만 14세 이상인 자에 한하여 가능합니다.</li>
            <li>서비스는 다음 각 호에 해당하는 경우 회원가입을 승낙하지 않거나 사후에 이용계약을 해지할 수 있습니다: 1. 가입 신청 시 허위 내용을 등록한 경우, 2. 타인의 정보를 도용한 경우, 3. 그 밖에 서비스의 기술상 현저히 지장이 있다고 판단되는 경우.</li>
          </ol>
        </Article>

        <Article n={7} title="회원 탈퇴 및 자격 상실 등">
          <ol>
            <li>회원은 서비스에 언제든지 탈퇴를 요청할 수 있으며, 서비스는 [설정 → 회원 탈퇴]를 통해 즉시 이를 처리합니다.</li>
            <li>회원이 다음 각 호에 해당하는 경우 서비스는 회원자격을 제한·정지 또는 상실시킬 수 있습니다: 1. 가입 신청 시 허위 내용을 등록한 경우, 2. 다른 사람의 서비스 이용을 방해하거나 그 정보를 도용하는 등 질서를 위협하는 경우, 3. 서비스를 이용하여 법령 또는 이 약관이 금지하거나 공서양속에 반하는 행위를 하는 경우.</li>
            <li>서비스가 회원자격을 상실시키는 경우 회원등록을 말소하며, 이를 회원에게 통지하고 소명할 기회를 부여합니다.</li>
          </ol>
        </Article>

        <Article n={8} title="회원에 대한 통지">
          <ol>
            <li>서비스가 회원에 대한 통지를 하는 경우, 회원이 등록한 전자우편 주소 등으로 할 수 있습니다.</li>
            <li>서비스는 불특정다수 회원에 대한 통지의 경우 서비스 내 공지로써 개별 통지에 갈음할 수 있습니다.</li>
          </ol>
        </Article>

        <Article n={9} title="투자 정보에 관한 유의사항">
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

        <Article n={10} title="서비스의 의무">
          <ol>
            <li>서비스는 법령과 이 약관이 금지하거나 공서양속에 반하는 행위를 하지 않으며, 지속적이고 안정적으로 서비스를 제공하기 위하여 최선을 다합니다.</li>
            <li>서비스는 이용자가 안전하게 서비스를 이용할 수 있도록 이용자의 개인정보를 관계 법령에 따라 보호합니다.</li>
            <li>서비스는 이용자가 원하지 않는 영리목적의 광고성 전자우편을 발송하지 않습니다.</li>
          </ol>
        </Article>

        <Article n={11} title="회원의 ID 및 비밀번호에 대한 의무">
          <ol>
            <li>회원의 계정(이메일·비밀번호 등)에 대한 관리책임은 회원에게 있습니다.</li>
            <li>회원은 자신의 계정 정보를 제3자가 이용하도록 하여서는 안 됩니다.</li>
            <li>회원이 자신의 계정이 도용되거나 제3자가 사용하고 있음을 인지한 경우에는 즉시 서비스에 통지하고 서비스의 안내에 따라야 합니다.</li>
          </ol>
        </Article>

        <Article n={12} title="이용자의 의무">
          <ol>
            <li>이용자는 관련 법령 및 이 약관의 규정을 준수하여야 합니다.</li>
            <li>이용자는 다음 행위를 하여서는 안 됩니다: 1. 신청 또는 변경 시 허위 내용의 등록, 2. 타인의 정보 도용, 3. 서비스에 대한 무단 접근이나 자동화된 수집(크롤링·스크래핑) 등 정상적인 운영을 방해하는 행위, 4. 서비스가 게시한 정보의 무단 변경, 5. 서비스 및 제3자의 저작권 등 지식재산권에 대한 침해, 6. 서비스 및 제3자의 명예를 손상시키거나 업무를 방해하는 행위.</li>
          </ol>
        </Article>

        <Article n={13} title="연결 서비스와 피연결 서비스 간의 관계">
          <p>
            서비스가 하이퍼링크 등의 방식으로 제3자가 운영하는 외부 사이트(피연결 서비스)를 제공하는 경우,
            서비스는 해당 외부 사이트가 독자적으로 제공하는 재화·서비스 및 정보의 내용과 그로 인한 거래에 대하여
            보증 책임을 지지 않습니다.
          </p>
        </Article>

        <Article n={14} title="저작권의 귀속 및 이용제한">
          <ol>
            <li>서비스가 작성한 콘텐츠에 대한 저작권 및 기타 지식재산권은 서비스에 귀속됩니다.</li>
            <li>이용자는 서비스를 이용함으로써 얻은 콘텐츠를 서비스의 사전 동의 없이 복제·전송·출판·배포·방송 기타 방법으로 영리 목적에 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.</li>
            <li>종목의 재무 데이터·시세 등 원천 정보에 관한 권리는 각 원저작자 및 정보제공처에 있습니다.</li>
          </ol>
        </Article>

        <Article n={15} title="개인정보보호">
          <p>
            서비스는 이용자의 개인정보를 관계 법령에 따라 보호하며, 개인정보의 처리에 관한 사항은 별도의{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-2">개인정보 처리방침</Link>
            에 따릅니다.
          </p>
        </Article>

        <Article n={16} title="분쟁해결">
          <ol>
            <li>서비스는 이용자가 제기하는 정당한 의견이나 불만을 반영하고 그 피해를 처리하기 위하여 노력합니다.</li>
            <li>서비스와 이용자 간에 발생한 분쟁은 관계 법령 및 상관례에 따라 성실히 협의하여 해결하며, 협의가 이루어지지 않는 경우 관계 법령에 따른 분쟁조정기관의 조정에 따를 수 있습니다.</li>
          </ol>
        </Article>

        <Article n={17} title="재판관할 및 준거법">
          <ol>
            <li>서비스와 이용자 간에 발생한 분쟁에 관한 소송은 제소 당시의 이용자의 주소에 의하고, 주소가 없는 경우 거소를 관할하는 지방법원의 전속관할로 합니다. 다만, 제소 당시 이용자의 주소 또는 거소가 분명하지 않거나 외국 거주자의 경우에는 민사소송법상의 관할법원에 제기합니다.</li>
            <li>서비스와 이용자 간에 제기된 소송에는 대한민국 법령을 적용합니다.</li>
          </ol>
        </Article>

        <section className="mt-10 pt-4 border-t border-outline-variant">
          <p className="text-sm text-on-surface-variant">
            <strong className="text-on-surface font-semibold">문의</strong> · 서비스 이용에 관한 문의는{" "}
            {CONTACT_EMAIL}로 연락해 주세요.
          </p>
          <p className="mt-2 text-xs text-outline">
            부칙: 이 약관은 {EFFECTIVE}부터 시행합니다. 본 약관은 공정거래위원회 「전자상거래(인터넷사이버몰)
            표준약관」의 서비스 공통 조항을 참고하여 무료 정보 서비스에 맞게 작성되었습니다.
          </p>
        </section>

        <div className="mt-12 pt-6 border-t border-outline-variant flex flex-wrap gap-4 text-sm">
          <Link href="/" className="text-primary underline underline-offset-2">← 홈으로</Link>
          <Link href="/privacy" className="text-on-surface-variant hover:text-primary">개인정보 처리방침</Link>
        </div>
      </main>
    </>
  );
}
