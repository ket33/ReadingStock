"""
update_prices_daily.py — 일별 주가 갱신 (GitHub Actions 크론용)
=====================================================
companies 테이블의 전 종목에 대해 최근 7일 종가를 FinanceDataReader로 받아
prices에 upsert한다(unique stock_code,date). 시가총액 = 종가 × companies.shares.

- 대상을 DB에서 읽으므로 새 종목을 온보딩하면 자동으로 포함된다.
- 7일 창이라 휴일·크론 결손이 있어도 다음 실행에서 메워진다.
- 갱신 범위는 '주가·시가총액 표시'만: 웹은 ISR(5분)이라 DB 갱신이면 자동 반영.
  (PER 등 지표는 분기말 주가 기준 metrics 소관 — 여기서 건드리지 않음)

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_prices_daily.py   (web/.env.local 아님 — 루트 .env 사용)
"""
import datetime as dt
import os
import sys

import FinanceDataReader as fdr
from supabase import create_client

# 하루 만에 이 비율(절대값)을 넘는 변동은 데이터 오류로 보고 제외 (기존 파이프라인과 동일)
PRICE_JUMP_LIMIT = 0.50
WINDOW_DAYS = 7


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def last_db_close(client, stock_code):
    """직전 저장 종가 (급변 오류 필터 기준값). 없으면 None."""
    rows = client.table("prices").select("close").eq("stock_code", stock_code) \
        .order("date", desc=True).limit(1).execute().data
    return float(rows[0]["close"]) if rows and rows[0]["close"] else None


def main():
    client = get_client()
    companies = client.table("companies").select("stock_code,name,shares").execute().data
    start = dt.date.today() - dt.timedelta(days=WINDOW_DAYS)

    total, failed = 0, []
    for c in companies:
        code, name, shares = c["stock_code"], c["name"], c["shares"]
        try:
            df = fdr.DataReader(code, start)
        except Exception as e:
            failed.append(f"{name}({code}): {e}")
            continue
        if df is None or len(df) == 0:
            failed.append(f"{name}({code}): 데이터 없음")
            continue

        prev = last_db_close(client, code)
        records = []
        for idx, row in df.sort_index().iterrows():
            close = row.get("Close")
            if close is None or (isinstance(close, float) and close != close) or close <= 0:
                continue
            close = float(close)
            if prev and abs(close / prev - 1) > PRICE_JUMP_LIMIT:
                print(f"  ! {name} {idx.date()} close={close:,.0f} 급변({prev:,.0f} 대비) → 제외")
                prev = close
                continue
            records.append({
                "stock_code": code,
                "date": idx.date().isoformat(),
                "close": close,
                "market_cap": close * float(shares) if shares else None,
            })
            prev = close

        if records:
            client.table("prices").upsert(records, on_conflict="stock_code,date").execute()
            total += len(records)
            print(f"  ✓ {name}({code}): {len(records)}일 upsert (~{records[-1]['date']}, 종가 {records[-1]['close']:,.0f})")

    print(f"\n완료: {total}행 upsert, 실패 {len(failed)}종목")
    for f in failed:
        print("  ✗", f)
    if failed:
        sys.exit(1)  # Actions에서 실패로 표시 → 이메일 알림


if __name__ == "__main__":
    main()
