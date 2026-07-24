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


def check_numbers(output: str, facts: str) -> list[str]:
    """사실 원장에 없는 숫자 목록 (비어 있으면 통과)."""
    src = _expand_units(_normalize(facts))
    bad = []
    for tok in _NUM_RE.findall(output):
        if len(tok.replace(",", "").replace(".", "")) <= 1:
            continue  # 한 자리 숫자('3분기' 등)는 대조 의미 없음
        if not any(v in src for v in _num_variants(tok)):
            bad.append(tok)
    return bad


def check_forbidden(output: str) -> list[str]:
    return [w for w in FORBIDDEN if w in output]


def validate(title: str, body: str, facts: str) -> list[str]:
    """위반 사유 목록. 비어 있으면 발송 가능."""
    text = title + "\n" + body
    issues = []
    bad_nums = check_numbers(text, facts)
    if bad_nums:
        issues.append(f"사실 원장에 없는 숫자: {', '.join(bad_nums[:5])}")
    bad_words = check_forbidden(text)
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
