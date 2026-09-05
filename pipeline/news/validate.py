"""
validate.py — 기계 검증 (지시서 §6, 승인된 최소본)
==================================================
프롬프트는 '바라는 것', 이 검증은 '강제하는 것'.
1) 숫자 대조 — 출력의 모든 숫자가 사실 원장에 존재해야 한다
2) 금지어 필터 — 판단·전망 표현이 있으면 실패
실패하면 담백한 고정 템플릿으로 폴백한다 (무검수 발송의 마지막 벽).
"""
import re

FORBIDDEN = [
    "긍정적", "부정적", "호재", "악재", "기대된다", "기대감", "주목된다", "주목할 만",
    "저평가", "고평가", "매수", "매도", "추천", "풀이된다", "전망이다", "전망이에요",
    "으로 보인다", "로 보인다", "예상된다", "예상돼요", "유망", "수혜",
]

# 공시 원문의 법정 용어 — '매수/매도'를 품고 있지만 바꿔 쓸 말이 없다.
# ('주식매수청구권'을 '주식사들이기청구권'이라 쓸 수는 없다)
# 금지어 검사 전에 이 표현들을 지운 뒤 남은 자리에서만 '매수/매도'를 찾는다.
# 이걸 안 하면 자기주식취득·처분, 합병, CB 발행 기사는 사실을 적었다는 이유로 전량 폴백된다
# (실측 폴백률: 합병 89%, 자기주식처분 53%, CB 53% — 그 유형에서만 유독 높았다).
ALLOWED_TERMS = [
    "주식매수선택권", "주식매수청구권", "주식매수청구", "매수청구권", "매수청구",
    "매도청구권", "매도청구", "매도청구권부",
    "공개매수", "장내매수", "장외매수", "시간외매수", "블록딜매수", "자기주식매수",
    "장내매도", "장외매도", "시간외매도", "블록딜매도", "자기주식매도",
    "매수인", "매도인", "매수자", "매도자", "매수처", "매도처",
    "매도가능", "매수도", "매매거래",
    # 자기주식 취득·처분 공시의 '방법' 항목 열거값 그대로
    "시장을 통한 매도", "시장을통한매도", "시장을 통한 매수", "시장을통한매수",
    "시간외대량매매", "장외처분",
    # 자기주식 취득 공시의 '1일 매수 주문수량 한도' 항목
    "매수 주문수량", "매수주문수량", "매수 주문", "매수주문",
    "매도 주문수량", "매도주문수량", "매도 주문", "매도주문",
]
# 긴 것부터 지워야 '주식매수청구권'이 '매수청구'로 쪼개져 남지 않는다
_ALLOWED_RE = re.compile("|".join(sorted((re.escape(t) for t in ALLOWED_TERMS),
                                         key=len, reverse=True)))

# 매수·매도가 공시의 주제 그 자체인 유형 — 여기선 그 단어를 안 쓰고 사실을 적을 수가 없다.
TRADE_SUBJECT_TYPES = {
    "buyback", "share_disposal", "share_retire", "stake_acquire",
    "merger", "split", "share_swap", "biz_transfer",
    "cb_issue", "bw_issue", "rights_issue", "overseas_listing",
}

# 투자 권유 — 유형과 무관하게 언제나 막는다. '매수'라는 단어를 통째로 막던 건
# 이걸 잡으려는 거친 대용품이었다. 진짜 막아야 하는 건 판단을 대신 내리는 문장이다.
RECOMMEND_PATTERNS = [
    "매수 추천", "매수추천", "매수 의견", "매수의견", "매수 타이밍", "매수타이밍",
    "매수 기회", "매수기회", "매수할 만", "매수해야", "매수하세요", "매수 시점",
    "매도 추천", "매도추천", "매도 의견", "매도의견", "매도 타이밍", "매도타이밍",
    "매도해야", "매도하세요", "사야 한다", "사야 할", "팔아야 한다", "팔아야 할",
    "담아야", "비중 확대", "비중 축소", "투자 매력", "투자매력",
]

_NUM_RE = re.compile(r"\d[\d,]*\.?\d*")


def _normalize(text: str) -> str:
    return text.replace(",", "")


def _expand_units(src: str) -> str:
    """소수 표기 숫자의 정당한 단위 환산을 허용 목록에 추가한다.

    공시가 '89.40'(조원 단위)로 적은 것을 기사가 '89조 4,000억 원'으로
    옮기는 건 올바른 환산이다. 소수부를 억 단위로 펼친 값(.40→4000,
    .87→8700)과 정수부를 원장에 덧붙여 오탐을 막는다 (실측 사례: 삼성전자 잠정실적).
    """
    extras = []
    for m in re.finditer(r"(\d+)\.(\d{1,4})\b", src):
        intp, frac = m.group(1), m.group(2)
        extras.append(intp)
        fv = int(frac) * (10 ** (4 - len(frac)))   # .4→4000, .40→4000, .87→8700
        if fv:
            extras.append(str(fv))
    return src + " " + " ".join(extras)


def _num_variants(token: str) -> list[str]:
    """'5,200' → ['5200'], '7.90' → ['7.90','7.9'] 등 관대한 후보들."""
    t = token.replace(",", "")
    out = [t]
    if "." in t:
        out.append(t.rstrip("0").rstrip("."))
    return out


# ── 값 대조 ───────────────────────────────────────────────────
# 부분문자열 대조만으로는 두 방향으로 틀린다.
#   너무 엄격: 원장이 원 단위 정수(36105062000)인데 기사가 '361억 500만 원'으로 옮기면
#             '500'이 없다며 거부한다. 올바른 환산인데도.
#   너무 느슨: 9395970804145 안에는 9395·3959·5970이 다 들어 있어, 아무 뜻 없는
#             조각(=환각 숫자)이 우연히 통과한다.
# 그래서 '9조 3,960억' 같은 표기를 수치로 환산해 값으로 견준다. 반올림·단위환산은
# 통과하고, 우연한 부분문자열은 막힌다.
_UNIT = {"조": 10 ** 12, "억": 10 ** 8, "만": 10 ** 4}
# '9조 3,960억 원', '361억 500만 원', '2,407만 주' 처럼 단위가 붙어 이어지는 덩어리
_KOR_AMOUNT_RE = re.compile(
    r"(?:\d[\d,]*(?:\.\d+)?\s*[조억만]\s*)+(?:\d[\d,]*(?:\.\d+)?\s*)?")
_TOLERANCE = 0.005   # 0.5% — 억 단위 반올림을 흡수하되 다른 계정과는 안 겹치는 폭


def _parse_kor_amount(s: str) -> float | None:
    """'9조 3,960억' → 9396000000000.0. 단위가 하나도 없으면 None."""
    total, seen_unit = 0.0, False
    for num, unit in re.findall(r"(\d[\d,]*(?:\.\d+)?)\s*([조억만]?)", s):
        if not num:
            continue
        v = float(num.replace(",", ""))
        if unit:
            seen_unit = True
        total += v * _UNIT.get(unit, 1)
    return total if seen_unit and total else None


def _fact_values(facts: str) -> list[float]:
    """원장이 말하는 값들 — 맨 숫자와 한국어 복합 금액을 모두 모은다."""
    vals = set()
    for m in _KOR_AMOUNT_RE.finditer(facts):
        v = _parse_kor_amount(m.group())
        if v:
            vals.add(v)
    for tok in _NUM_RE.findall(facts):
        try:
            vals.add(float(tok.replace(",", "")))
        except ValueError:
            continue
    return sorted(vals)


def _close(val: float, vals: list[float]) -> bool:
    if not val:
        return False
    return any(abs(val - v) <= max(abs(v), abs(val)) * _TOLERANCE for v in vals)


def check_numbers(output: str, facts: str) -> list[str]:
    """사실 원장에 없는 숫자 목록 (비어 있으면 통과)."""
    src = _expand_units(_normalize(facts))
    fvals = _fact_values(facts)

    # 1) 단위가 붙은 복합 금액은 통째로 값 대조한다. 토큰으로 쪼개면 '9조 3,960억'이
    #    '9'와 '3,960'이 되어 원래 뜻을 잃는다. 통과한 구간은 지워 2)에서 다시 안 본다.
    def _verify(m):
        v = _parse_kor_amount(m.group())
        return " " * len(m.group()) if (v and _close(v, fvals)) else m.group()

    rest = _KOR_AMOUNT_RE.sub(_verify, output)

    # 2) 남은 숫자는 낱개로 — 문자열로 있거나(기존 경로) 값이 맞으면 통과
    bad = []
    for m in _NUM_RE.finditer(rest):
        tok = m.group()
        if len(tok.replace(",", "").replace(".", "")) <= 1:
            continue  # 한 자리 숫자('3분기' 등)는 대조 의미 없음
        if tok == "100" and rest[m.end():m.end() + 1] == "%":
            # '지분을 100% 갖고 있지 않은 자회사'처럼 개념을 풀어주는 말이다.
            # 이 회사에 대한 사실 주장이 아니라 일반 설명이라 대조 대상이 아니다
            # (실측: 남은 폴백 5건 중 3건이 이 '100%' 하나로 걸렸다).
            continue
        if any(v in src for v in _num_variants(tok)):
            continue
        try:
            if _close(float(tok.replace(",", "")), fvals):
                continue
        except ValueError:
            pass
        bad.append(tok)
    return bad


def check_forbidden(output: str, type_key: str | None = None) -> list[str]:
    """금지 표현 목록. 법정 용어(ALLOWED_TERMS)는 지운 뒤에 찾는다 —
    '공개매수'라고 적은 사실 서술과 '매수 추천'이라는 판단을 가르기 위한 것.

    type_key가 TRADE_SUBJECT_TYPES면 맨 '매수/매도' 금지를 푼다. 자기주식취득 기사에서
    매수는 회사가 실제로 하는 행위라 사실 서술이다(실측: SK하이닉스 자사주 취득 기사가
    '실제 매수 과정에서 주가가 움직이면'이라는 문장 하나로 폴백됐다). 예외 목록을 늘리는
    방식은 '매수 과정·매수 단가·매수 물량'을 끝없이 뒤쫓게 되므로 유형으로 가른다.
    권유 표현(RECOMMEND_PATTERNS)은 유형과 무관하게 항상 막는다."""
    masked = _ALLOWED_RE.sub(" ", output)
    words = [w for w in FORBIDDEN if w in masked]
    if type_key in TRADE_SUBJECT_TYPES:
        words = [w for w in words if w not in ("매수", "매도")]
    words += [p for p in RECOMMEND_PATTERNS if p in output]
    return words


def check_recommend(output: str) -> list[str]:
    """투자권유 표현만 골라낸다 — 폴백 판정용이 아니라 경고용.

    2026-09-05에 내용 점검(숫자 대조) 게이트를 걷어내면서, 기사를 템플릿으로 바꾸는
    판정은 전부 없앴다. 다만 '매수 추천·비중 확대' 같은 문장은 사실 서술이 아니라
    판단을 대신 내리는 말이라, 나갔다는 사실 자체는 로그에 남겨둔다.
    (실측: 2026-08-31 이후 폴백 11건 중 금지어로 걸린 건은 0건 — 신호는 드물다.)"""
    return [p for p in RECOMMEND_PATTERNS if p in output]


def validate(title: str, body: str, facts: str, type_key: str | None = None) -> list[str]:
    """위반 사유 목록. 비어 있으면 발송 가능.

    type_key는 금지어 판정에만 쓴다 — 매수·매도가 공시의 주제 자체인 유형에서
    그 단어를 사실 서술로 인정하기 위해서다(check_forbidden 참고)."""
    text = title + "\n" + body
    issues = []
    bad_nums = check_numbers(text, facts)
    if bad_nums:
        issues.append(f"사실 원장에 없는 숫자: {', '.join(bad_nums[:5])}")
    bad_words = check_forbidden(text, type_key)
    if bad_words:
        issues.append(f"금지 표현: {', '.join(bad_words)}")
    return issues


def fallback_article(company_name: str, report_nm: str, rcept_dt: str) -> tuple[str, str]:
    """검증 실패 시 고정 템플릿 — 최악의 경우가 '담백한 사실 알림'이 되게."""
    clean_nm = re.sub(r"\s+", " ", report_nm).strip()
    title = f"{company_name}, {clean_nm} 공시 제출"
    date_label = f"{rcept_dt[:4]}년 {int(rcept_dt[4:6])}월 {int(rcept_dt[6:8])}일"
    body = (
        f"{company_name}이(가) {date_label} '{clean_nm}' 공시를 제출했어요.\n\n"
        f"자세한 내용은 아래 공시 원문에서 확인할 수 있어요."
    )
    return title, body
