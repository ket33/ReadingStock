"""
dart_client.py — DART 호출 담당
==============================
1단계 verify_metrics.py의 재무제표 조회·인덱싱·계정매칭 로직을 그대로 가져오고,
추가로 '배당에 관한 사항'(alotMatter) API를 호출하는 함수를 붙인다.
→ 1단계에서 재무제표 본문에 없어 비었던 배당수익률·배당성향·유보율을 여기서 채운다.
"""

import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

DART_API_KEY = os.environ.get("DART_API_KEY", "")

# 연결(CFS) 우선, 없으면 개별(OFS)로 재시도
FS_PREFERENCE = ["CFS", "OFS"]


# ----------------------------------------------------------------------
# 1. DART 전체 재무제표 조회  (verify_metrics.py에서 그대로 가져옴)
# ----------------------------------------------------------------------
def fetch_dart_all(corp_code, year, reprt, fs_div):
    """단일회사 전체 재무제표 API 호출 → (계정 리스트, status, message)."""
    url = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": year,
        "reprt_code": reprt,
        "fs_div": fs_div,
    }
    r = requests.get(url, params=params, timeout=30)
    data = r.json()
    if data.get("status") != "000":
        return None, data.get("status"), data.get("message")
    return data.get("list", []), "000", "OK"


def get_statements(corp_code, year, reprt):
    """CFS→OFS 순으로 시도해서 (재무제표 리스트, 사용한 fs_div, message)를 반환."""
    msg = None
    for fs in FS_PREFERENCE:
        lst, status, msg = fetch_dart_all(corp_code, year, reprt, fs)
        if lst:
            return lst, fs, msg
        time.sleep(0.4)  # 분당 호출 제한 대비 짧은 sleep
    return None, None, msg


# ----------------------------------------------------------------------
# 2. 계정 값 추출 헬퍼  (verify_metrics.py에서 그대로 가져옴)
# ----------------------------------------------------------------------
def _to_num(s):
    if s in (None, "", "-"):
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def build_index(statements):
    """조회 결과를 다루기 쉽게 가공.
    반환: {'by_id': {account_id: rec}, 'rows': [rec, ...]}"""
    by_id = {}
    rows = []
    for it in statements:
        rec = {
            "sj_div": it.get("sj_div"),        # BS(재무상태표) IS/CIS(손익) CF(현금흐름)
            "account_id": it.get("account_id"),
            "name": (it.get("account_nm") or "").strip(),
            "thstrm": _to_num(it.get("thstrm_amount")),   # 당기
            "frmtrm": _to_num(it.get("frmtrm_amount")),   # 전기
        }
        rows.append(rec)
        aid = rec["account_id"]
        # 같은 account_id가 여러 번 나오면 '첫 등장'만 남긴다.
        # DART는 BS/IS/CIS/CF(본표)를 먼저, 자본변동표(SCE)를 뒤에 준다.
        # SCE는 자본총계·당기순이익을 컬럼별로 쪼갠 소계(또는 0)를 같은 id로 반복 노출하므로,
        # 덮어쓰면 본표의 정확한 총계가 SCE 소계로 오염된다. → 첫 값 보존.
        if aid and aid != "-표준코드없음-" and aid not in by_id:
            by_id[aid] = rec
    return {"by_id": by_id, "rows": rows}


# 표준 IFRS 계정코드 (대부분의 상장사가 공유)
STD = {
    "매출액":      ["ifrs-full_Revenue", "ifrs_Revenue"],
    "매출원가":    ["ifrs-full_CostOfSales"],
    "매출총이익":  ["ifrs-full_GrossProfit"],
    "영업이익":    ["dart_OperatingIncomeLoss", "ifrs-full_ProfitLossFromOperatingActivities"],
    "당기순이익":  ["ifrs-full_ProfitLoss"],
    "자산총계":    ["ifrs-full_Assets"],
    "유동자산":    ["ifrs-full_CurrentAssets"],
    "부채총계":    ["ifrs-full_Liabilities"],
    "유동부채":    ["ifrs-full_CurrentLiabilities"],
    "자본총계":    ["ifrs-full_Equity"],
    "재고자산":    ["ifrs-full_Inventories"],
    "매출채권":    ["ifrs-full_TradeAndOtherCurrentReceivables", "ifrs-full_CurrentTradeReceivables"],
    "유형자산":    ["ifrs-full_PropertyPlantAndEquipment"],
    "영업현금흐름": ["ifrs-full_CashFlowsFromUsedInOperatingActivities"],
}

# 계정명 부분일치 후보 (표준코드로 못 찾을 때)
NAME_HINTS = {
    "매출액":      ["매출액", "수익(매출액)", "영업수익"],
    "매출원가":    ["매출원가"],
    "매출총이익":  ["매출총이익"],
    "영업이익":    ["영업이익"],
    "당기순이익":  ["당기순이익", "당기순이익(손실)", "당기순손익", "연결당기순이익",
                 "분기순이익", "분기순손익", "반기순이익", "반기순손익",
                 "연결분기순이익", "연결반기순이익",
                 # 괄호 병기 변형 (현대차 2016~2017 등)
                 "연결당기(분기)순이익", "연결반기(당기)순이익", "연결분기(당기)순이익"],
    "자산총계":    ["자산총계"],
    "유동자산":    ["유동자산"],
    "부채총계":    ["부채총계"],
    "유동부채":    ["유동부채"],
    "자본총계":    ["자본총계"],
    "재고자산":    ["재고자산"],
    "매출채권":    ["매출채권", "매출채권및기타"],
    "유형자산":    ["유형자산"],
    # '순현금흐름'(working capital·이자·세금 반영 후 순액) 변형까지 포함.
    #   '영업활동에서/으로 창출된 현금'(조정 전 소계)은 의도적으로 제외 → 순액만 잡는다.
    "영업현금흐름": ["영업활동현금흐름", "영업활동으로인한현금흐름", "영업활동으로 인한 현금흐름",
                 "영업활동순현금흐름", "영업활동으로인한순현금흐름", "영업활동으로 인한 순현금흐름"],
    "이자비용":    ["이자비용", "금융원가", "금융비용"],
    "배당금":      ["배당금", "배당금지급", "현금배당"],
    "capex":       ["유형자산의취득", "유형자산의 취득", "설비투자"],
    "감가상각":    ["감가상각비"],
    "연구개발":    ["연구개발비", "경상연구개발비"],
    "판관비":      ["판매비와관리비", "판매비와 관리비"],
}


def pick(idx, key):
    """표준코드 우선, 없으면 계정명 부분일치로 (당기값, 전기값, 계정명) 반환."""
    # (a) 표준코드
    for aid in STD.get(key, []):
        if aid in idx["by_id"]:
            r = idx["by_id"][aid]
            return r["thstrm"], r["frmtrm"], r["name"]
    # (b) 계정명 부분일치
    for hint in NAME_HINTS.get(key, []):
        for r in idx["rows"]:
            if hint.replace(" ", "") in r["name"].replace(" ", ""):
                return r["thstrm"], r["frmtrm"], r["name"]
    return None, None, None


# ----------------------------------------------------------------------
# 3. 표준 계정명 매핑  (financials 적재용 — account_std 채우기)
# ----------------------------------------------------------------------
# STD의 (표준코드 → 표준명) 역인덱스
_ID_TO_STD = {aid: std for std, ids in STD.items() for aid in ids}


def std_name_for(account_id, account_nm):
    """한 계정의 account_id/account_nm을 보고 우리 표준명(account_std)을 돌려준다.
    매핑되는 게 없으면 None (financials.account_std는 null 허용)."""
    if account_id and account_id in _ID_TO_STD:
        return _ID_TO_STD[account_id]
    name = (account_nm or "").replace(" ", "")
    # '포함'이 아니라 '접두 일치'로 좁히고(비유동자산→유동자산 오탐 방지),
    # 긴 힌트부터 검사한다('유형자산의취득'이 '유형자산'보다 먼저 → capex로 정확히 매핑).
    for std, h in _HINTS_BY_LEN:
        if name.startswith(h):
            return std
    return None


# (표준명, 공백제거 힌트)를 힌트 길이 내림차순으로 정렬해 둔 캐시
_HINTS_BY_LEN = sorted(
    ((std, hint.replace(" ", "")) for std, hints in NAME_HINTS.items() for hint in hints),
    key=lambda x: -len(x[1]),
)


# ----------------------------------------------------------------------
# 4. 배당에 관한 사항 (alotMatter)  ← 이번 단계 신규
# ----------------------------------------------------------------------
def fetch_dividend(corp_code, year, reprt):
    """'배당에 관한 사항' API 호출 → 원본 항목 리스트 반환(없으면 []).

    응답의 각 행은 se(항목), stock_knd(주식종류), thstrm(당기) 등을 가진다.
    예: se='주당 현금배당금(원)' stock_knd='보통주' thstrm='361'
    """
    url = "https://opendart.fss.or.kr/api/alotMatter.json"
    params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": year,
        "reprt_code": reprt,
    }
    try:
        r = requests.get(url, params=params, timeout=30)
        data = r.json()
    except Exception as e:
        print(f"    [배당조회 경고] {corp_code}: {e}")
        return []
    if data.get("status") != "000":
        return []
    return data.get("list", [])


def parse_dividend(rows):
    """alotMatter 원본 행들에서 배당 지표를 뽑아 dict로 반환.

    반환 키:
        dps          : 주당 현금배당금(원, 보통주)
        payout       : 현금배당성향(%) — DART가 이미 계산해 준 값
        yield_report : 현금배당수익률(%) — 보고서 기준(참고용)
    없는 값은 None.
    """
    out = {"dps": None, "payout": None, "yield_report": None, "cash_total": None}
    for row in rows:
        se = (row.get("se") or "").replace(" ", "")
        knd = (row.get("stock_knd") or "").strip()
        val = _to_num(row.get("thstrm"))
        if val is None:
            continue

        # 우선주 값은 건너뛰고 보통주만 사용 (종류 표기가 없으면 그대로 사용)
        is_common = (knd == "") or ("보통" in knd)

        if "주당현금배당금" in se and is_common and out["dps"] is None:
            out["dps"] = val
        elif "현금배당성향" in se and out["payout"] is None:
            out["payout"] = val
        elif "현금배당수익률" in se and is_common and out["yield_report"] is None:
            out["yield_report"] = val
        elif "현금배당금총액" in se and out["cash_total"] is None:
            # 백만원 단위 → 원. 총액은 액면분할과 무관(주식수×주당이 상쇄)이라
            # 시가총액과 함께 쓰면 분할 시점 왜곡 없이 배당수익률을 구할 수 있다.
            out["cash_total"] = val * 1_000_000
    return out


def get_dividend_info(corp_code, year, reprt):
    """배당 조회 + 파싱을 한 번에. calc.py에 넘길 dict를 반환."""
    rows = fetch_dividend(corp_code, year, reprt)
    return parse_dividend(rows)
