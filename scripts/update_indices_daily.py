"""
update_indices_daily.py — 시장지표 일별 갱신 (GitHub Actions 크론용)
=====================================================
워치리스트 성과 비교선용 4개 지수의 최근 종가를 FinanceDataReader로 받아
market_indices에 upsert한다(pk index_code,date).
  KS11=코스피  KQ11=코스닥  US500=S&P500  IXIC=나스닥

- 지수별 마지막 저장일 7일 전부터 다시 받아 휴일·크론 결손을 메운다.
- 저장 이력이 없으면 2010년부터 전체 적재 (루트 load_indices.py --full과 동일).

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_indices_daily.py
"""
import datetime as dt
import os
import sys

import FinanceDataReader as fdr
from supabase import create_client

# Windows 로컬 실행 시 cp949 콘솔에서도 ✓ 등 출력이 깨지지 않게
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8")

INDICES = [
    ("KS11", "코스피"),
    ("KQ11", "코스닥"),
    ("US500", "S&P500"),
    ("IXIC", "나스닥"),
]
FULL_START = "2010-01-01"
WINDOW_DAYS = 7
_BATCH = 1000


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def main():
    client = get_client()
    failed = 0
    for code, name in INDICES:
        rows = (client.table("market_indices").select("date")
                .eq("index_code", code).order("date", desc=True).limit(1)
                .execute().data)
        start = (
            (dt.date.fromisoformat(rows[0]["date"]) - dt.timedelta(days=WINDOW_DAYS)).isoformat()
            if rows else FULL_START
        )
        try:
            df = fdr.DataReader(code, start)
        except Exception as e:  # noqa: BLE001 — 지수 하나 실패해도 나머지는 진행
            print(f"  ✗ {name}({code}) 수신 실패: {e}")
            failed += 1
            continue
        recs = [
            {"index_code": code, "date": d.strftime("%Y-%m-%d"), "close": float(c)}
            for d, c in df["Close"].items() if c == c  # NaN 제외
        ]
        for i in range(0, len(recs), _BATCH):
            client.table("market_indices").upsert(recs[i:i + _BATCH]).execute()
        print(f"  ✓ {name}({code}): {len(recs)}일 upsert ({start} ~)")
    if failed == len(INDICES):
        sys.exit("모든 지수 갱신 실패")


if __name__ == "__main__":
    main()
