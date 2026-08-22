// 리포트 탭·펀더멘탈 탭 하단의 공통 고지.
// 두 탭이 같은 문구를 써야 해서 한 곳에 둔다 — 한쪽만 고쳐 어긋나는 걸 막는다.
const LINES = [
  "이 글은 공시 자료와 시장 데이터를 바탕으로 자동 생성된 참고 자료이며, 투자 추천이 아닙니다. " +
  "투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
  "모든 수치는 DART 공시 원문에서 직접 추출하며, 본문 작성 후 공시값과 자동 대조하는 검증 단계를 거칩니다. " +
  "대조에 실패한 수치는 발행되지 않습니다. 기사 등 2차 자료는 배경 설명에만 사용하고, " +
  "숫자가 충돌할 경우 공시값을 따릅니다.",
];

export default function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <ul className={`space-y-2 text-xs leading-relaxed text-outline ${className}`}>
      {LINES.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="shrink-0">-</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
