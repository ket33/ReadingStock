"""
whitelist.py — 공시 화이트리스트 (지시서 §3)
============================================
보고서명(report_nm) 매칭으로 '펀더멘털 공시'만 골라낸다.
'결정'과 '발행결과'가 갈리도록 패턴을 구체적으로 잡고,
정정·조회공시·결과공시는 전역 제외한다.
"""
import re

# (정규식, category, type_key) — 위에서부터 먼저 맞는 것 하나로 확정
PATTERNS = [
    # 실적
    (r"사업보고서",                     "earnings",    "annual_report"),
    (r"반기보고서",                     "earnings",    "half_report"),
    (r"분기보고서",                     "earnings",    "quarter_report"),
    (r"영업\(잠정\)실적",               "earnings",    "prelim_earnings"),
    (r"매출액또는손익구조",             "earnings",    "structure_change"),
    # 계약
    (r"단일판매[ㆍ·]공급계약체결",      "contract",    "supply_contract"),
    # 투자
    (r"신규시설투자",                   "invest",      "facility_invest"),
    (r"타법인주식및출자증권취득결정",   "invest",      "stake_acquire"),
    # 자본
    (r"유상증자결정",                   "capital",     "rights_issue"),
    (r"전환사채권발행결정",             "capital",     "cb_issue"),
    (r"신주인수권부사채권발행결정",     "capital",     "bw_issue"),
    # 해외 상장·DR — '결정'과 실제 '상장' 보고, DR 발행결정을 한 사건 키로 묶는다
    (r"해외증권시장주권등상장",         "capital",     "overseas_listing"),
    (r"증권예탁증권\(?DR\)?발행결정",   "capital",     "overseas_listing"),
    # 주주환원
    (r"현금[ㆍ·]현물배당결정|현금배당결정", "shareholder", "dividend"),
    (r"자기주식취득결정|자기주식취득신탁계약체결결정", "shareholder", "buyback"),
    (r"(?:자기)?주식소각결정",          "shareholder", "share_retire"),
    (r"자기주식처분결정",               "shareholder", "share_disposal"),
    # 구조
    (r"회사합병결정",                   "structure",   "merger"),
    (r"회사분할결정",                   "structure",   "split"),
    (r"영업양수결정|영업양도결정",      "structure",   "biz_transfer"),
    (r"주식교환[ㆍ·]?이전",             "structure",   "share_swap"),
    # 리스크
    (r"소송등의제기",                   "risk",        "lawsuit"),
    (r"횡령[ㆍ·]배임혐의발생",          "risk",        "embezzlement"),
    (r"채무보증결정|타인에대한채무보증", "risk",       "debt_guarantee"),
    (r"관리종목지정",                   "risk",        "admin_issue"),
    (r"상장폐지",                       "risk",        "delisting"),
    (r"매매거래정지",                   "risk",        "trading_halt"),
    (r"생산중단|영업정지",              "risk",        "production_halt"),
    (r"부도발생",                       "risk",        "default"),
    (r"회생절차|파산신청",              "risk",        "rehabilitation"),
    # 지배구조 (조건부 보도)
    (r"최대주주변경",                   "governance",  "owner_change"),
    (r"대표이사변경|대표집행임원변경",  "governance",  "ceo_change"),
]

# 전역 제외 — 결과·철회·정정·조회공시는 '결정' 공시와 같은 키워드를 품고 있어 먼저 거른다
EXCLUDE = re.compile(
    r"발행결과|청약결과|철회|기재정정|첨부정정|첨부추가|조회공시|풍문|답변|해명|자회사의\s*주요경영사항\s*$"
)

_COMPILED = [(re.compile(p), cat, key) for p, cat, key in PATTERNS]


def match(report_nm: str):
    """보고서명이 화이트리스트에 맞으면 (category, type_key), 아니면 None."""
    name = report_nm.strip()
    if EXCLUDE.search(name):
        return None
    for rx, cat, key in _COMPILED:
        if rx.search(name):
            return (cat, key)
    return None
