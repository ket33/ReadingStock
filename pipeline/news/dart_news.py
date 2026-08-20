"""
dart_news.py — DART 공시 감지·사실 원장 확보 (지시서 §1-1, §1-2, §2)
====================================================================
- poll(): 공시검색 목록 API로 대상 기업의 신규 공시를 훑어 화이트리스트 매칭
- build_facts(): 공시 유형에 맞는 '사실 원장' 텍스트를 만든다
    · 정기보고서(사업·반기·분기) → 재무제표 API 숫자 (원문 수백 페이지는 파싱 안 함)
    · 그 외 → 공시서류 원본(XML)에서 태그 걷어낸 본문 텍스트
  해설자 AI는 이 사실 원장 안의 숫자·사실만 쓸 수 있다 (§5 규칙 1, §6 검증의 기준).
"""
import io
import os
import re
import sys
import time
import zipfile

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dart_client import DART_API_KEY, fetch_dart_all  # noqa: E402

LIST_URL = "https://opendart.fss.or.kr/api/list.json"
DOC_URL = "https://opendart.fss.or.kr/api/document.xml"
VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}"

FACT_MAX_CHARS = 12000  # 사실 원장 상한 — 공시 앞부분에 핵심 표가 온다


def poll(corp_code: str, bgn_de: str, end_de: str) -> list[dict]:
    """한 기업의 기간 내 공시 목록. 항목: rcept_no, report_nm, rcept_dt, corp_code 등."""
    return _poll(bgn_de, end_de, corp_code=corp_code)


def poll_all(bgn_de: str, end_de: str, max_pages: int = 200) -> list[dict]:
    """전 상장사(corp_code 미지정) 기간 내 공시 목록 — 대상 종목이 많을 때 사용.
    corp_code별로 N번 호출하는 대신 시장 전체를 한 번에 페이징한다(호출 수가 종목 수와 무관).
    각 항목은 corp_code·stock_code를 담고 있어 호출 측에서 대상 집합으로 필터한다.
    max_pages: 폭주 방지 상한(100건/페이지)."""
    return _poll(bgn_de, end_de, corp_code=None, max_pages=max_pages)


def _poll(bgn_de: str, end_de: str, corp_code: str | None = None,
          max_pages: int = 10_000) -> list[dict]:
    """list.json 페이징 공통 로직. corp_code=None이면 전체 시장."""
    out, page = [], 1
    while page <= max_pages:
        params = {
            "crtfc_key": DART_API_KEY,
            "bgn_de": bgn_de, "end_de": end_de,
            "page_no": page, "page_count": 100,
        }
        if corp_code:
            params["corp_code"] = corp_code
        r = requests.get(LIST_URL, params=params, timeout=30)
        data = r.json()
        if data.get("status") != "000":   # 013 = 조회 결과 없음
            break
        out.extend(data.get("list", []))
        if page >= int(data.get("total_page", 1)):
            break
        page += 1
        time.sleep(0.3)
    return out


def _fetch_original_text(rcept_no: str) -> str:
    """공시서류 원본파일(zip 안의 XML)에서 태그를 걷어낸 본문 텍스트."""
    r = requests.get(DOC_URL, params={"crtfc_key": DART_API_KEY, "rcept_no": rcept_no}, timeout=60)
    if r.status_code != 200 or not r.content[:2] == b"PK":
        return ""
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        # 가장 큰 파일이 본문
        name = max(zf.namelist(), key=lambda n: zf.getinfo(n).file_size)
        raw = zf.read(name)
    text = None
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8", errors="ignore")
    # 스타일·스크립트 블록은 내용째 제거 (태그만 벗기면 CSS 본문이 남는다)
    text = re.sub(r"<(STYLE|SCRIPT)[^>]*>.*?</\1>", " ", text, flags=re.I | re.S)
    # 태그 제거 → 공백 정리
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()[:FACT_MAX_CHARS]


# 정기보고서용 — report_nm의 "(2026.03)"에서 연도·보고서코드를 알아낸다
_PERIOD_RE = re.compile(r"\((\d{4})\.(\d{2})\)")
_REPRT_BY_MONTH = {"03": "11013", "06": "11012", "09": "11014", "12": "11011"}
_KEY_ACCOUNTS = re.compile(r"매출액|수익\(매출액\)|영업수익|영업이익|당기순이익|분기순이익|반기순이익|자산총계|부채총계|자본총계")


def fmt_won(raw) -> str | None:
    """원 단위 숫자 문자열 → '9조 3,960억 원' 같은 읽기 좋은 표기.

    사실 원장을 이 표기로 적는 이유: 재무제표 API는 원 단위 정수(9395970804145)로만
    주는데, 기사는 당연히 '9조 3,960억 원'으로 쓴다(실측: 통과한 정기보고서 기사 60건에서
    조·억 표기 546회, 원 단위 생짜 0회). 그런데 검증기는 출력의 숫자가 원장에 문자열로
    있는지만 보므로, 이 올바른 환산이 '원장에 없는 숫자 3,960'으로 거부돼 폴백됐다.
    통과 여부가 우연한 부분문자열 일치에 달려 있었다(788949832477 안에 7889가 있으면 통과).
    원장을 처음부터 기사가 쓸 표기로 적어 그 운을 없앤다.
    """
    try:
        v = int(str(raw).replace(",", "").strip())
    except (ValueError, AttributeError, TypeError):
        return None
    sign = "-" if v < 0 else ""
    n = abs(v)
    if n < 10 ** 8:                       # 1억 미만
        if n < 10 ** 4:
            return f"{sign}{n:,}원"
        return f"{sign}{round(n / 10 ** 4):,}만 원"
    eok = round(n / 10 ** 8)              # 억 단위로 반올림
    jo, eok = divmod(eok, 10 ** 4)        # 10,000억 = 1조 (반올림 자리올림까지 흡수)
    if jo and eok:
        return f"{sign}{jo:,}조 {eok:,}억 원"
    if jo:
        return f"{sign}{jo:,}조 원"
    return f"{sign}{eok:,}억 원"


def _fetch_financial_facts(corp_code: str, report_nm: str) -> str:
    """정기보고서의 사실 원장 — 재무제표 API 핵심 계정(당기/전기)."""
    m = _PERIOD_RE.search(report_nm)
    if not m:
        return ""
    year, month = m.group(1), m.group(2)
    reprt = _REPRT_BY_MONTH.get(month)
    if not reprt:
        return ""
    for fs in ("CFS", "OFS"):
        rows, status, _ = fetch_dart_all(corp_code, year, reprt, fs)
        if rows:
            break
        time.sleep(0.4)
    else:
        return ""
    # 전기 연도를 헤더에 밝힌다. 기사는 비교 대상을 자연히 '2025년 같은 기간'이라 부르는데
    # 헤더에 당기 연도만 있으면 그 2025가 '원장에 없는 숫자'로 걸려 폴백됐다(실측: 재작성
    # 표본 5건 중 5건이 연도 때문에 실패). 전기 = 당기−1년은 원장이 이미 아는 사실이다.
    lines = [
        f"[{year}년 {month}월 결산 기준 재무제표 ({'연결' if fs == 'CFS' else '별도'})]",
        f"(당기 = {year}년 {int(month)}월 기준 / 전기 = 전년도인 {int(year) - 1}년 같은 기간)",
    ]
    seen = set()
    for row in rows:
        nm = (row.get("account_nm") or "").strip()
        if not _KEY_ACCOUNTS.search(nm) or nm in seen:
            continue
        seen.add(nm)
        cur = fmt_won(row.get("thstrm_amount")) or "-"
        prev = fmt_won(row.get("frmtrm_amount")) or "-"
        lines.append(f"{nm}: 당기 {cur} / 전기 {prev}")
        if len(seen) >= 14:
            break
    return "\n".join(lines) if len(lines) > 1 else ""


def build_facts(corp_code: str, rcept_no: str, report_nm: str, type_key: str) -> str:
    """공시 유형에 맞는 사실 원장 텍스트. 실패하면 빈 문자열."""
    if type_key in ("annual_report", "half_report", "quarter_report"):
        facts = _fetch_financial_facts(corp_code, report_nm)
        if facts:
            return facts
        # 재무 API가 아직 안 열렸으면 원문으로 폴백
    return _fetch_original_text(rcept_no)


def viewer_url(rcept_no: str) -> str:
    return VIEWER_URL.format(rcept_no=rcept_no)
