"""
update_prices_daily.py — 일별 주가 갱신 (GitHub Actions 크론용)
=====================================================
companies 테이블의 전 종목에 대해 최근 7일 종가를 FinanceDataReader로 받아
prices에 upsert한다(unique stock_code,date). 시가총액 = 종가 × companies.shares.

주가는 네이버 소스의 '수정주가'(분할·증자 소급 반영)다. 그래서 분할·증자가
일어나면 데이터원이 과거 전체를 다시 쓰는데, 하루치만 추가하는 방식으로는
DB의 과거(옛 스케일)와 신규(새 스케일)가 어긋난 시계열이 된다.

→ 재조정 감지: 최근 CHECK_DAYS 거래일의 저장값과 새로 받은 값을 비교해
  TOLERANCE 이상 어긋나면 '수정주가 재조정 발생'으로 보고 그 종목의
  RESYNC_YEARS년 전체 이력을 다시 받아 upsert한다. 이때 상장주식수도
  KRX 상장목록에서 갱신(분할이면 주식수도 바뀜)해 시가총액을 재계산한다.

- 대상을 DB에서 읽으므로 새 종목을 온보딩하면 자동으로 포함된다.
- 7일 창이라 휴일·크론 결손이 있어도 다음 실행에서 메워진다.
- 웹은 ISR(5분)이라 DB 갱신이면 자동 반영.
  (PER 등 지표는 분기말 주가 기준 metrics 소관 — 여기서 건드리지 않음)

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_prices_daily.py   (web/.env.local 아님 — 루트 .env 사용)
"""
import datetime as dt
import os
import sys

import FinanceDataReader as fdr
from supabase import create_client

# 하루 만에 이 비율(절대값)을 넘는 변동은 데이터 오류로 보고 제외.
# (수정주가라 분할 점프는 없음 — 국내 상하한가 ±30%보다 넉넉한 50%)
PRICE_JUMP_LIMIT = 0.50
WINDOW_DAYS = 7

# ── 수정주가 재조정 감지 ────────────────────────────────────────
CHECK_DAYS = 15        # 저장값과 비교할 최근 거래일 수 (~3주)
TOLERANCE = 0.005      # 이 비율(0.5%) 넘게 다르면 재조정으로 판단
RESYNC_YEARS = 15      # 재조정 감지 시 다시 받을 이력 (루트 config.PRICE_YEARS와 동일)


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def _load_krx_shares():
    """{종목코드: 상장주식수(Stocks)} — 재조정 시 주식수 갱신용. 실패해도 진행."""
    try:
        krx = fdr.StockListing("KRX")
        out = {}
        for _, r in krx.iterrows():
            try:
                stocks = r["Stocks"] if "Stocks" in r else None
                if stocks:
                    out[str(r["Code"])] = float(stocks)
            except (ValueError, TypeError, KeyError):
                pass
        return out
    except Exception as e:
        print(f"  [상장목록 경고] StockListing 실패(주식수 갱신 생략): {e}")
        return {}


def fetch_closes(code, start):
    """FDR 종가 시계열 → [(date_iso, close)] (null·0 제외, 날짜순)."""
    df = fdr.DataReader(code, start)
    if df is None or len(df) == 0:
        return []
    out = []
    for idx, row in df.sort_index().iterrows():
        close = row.get("Close")
        if close is None or (isinstance(close, float) and close != close) or close <= 0:
            continue
        out.append((idx.date().isoformat(), float(close)))
    return out


def stored_recent(client, code, n=CHECK_DAYS):
    """DB의 최근 n일 {date: close}."""
    rows = (client.table("prices").select("date,close").eq("stock_code", code)
            .order("date", desc=True).limit(n).execute().data)
    return {r["date"]: float(r["close"]) for r in rows if r["close"]}


def detect_readjust(stored, fetched):
    """같은 날짜의 저장값 vs 새 값이 TOLERANCE 넘게 다르면 (True, 사유)."""
    for date_iso, close in fetched:
        old = stored.get(date_iso)
        if old and abs(close / old - 1) > TOLERANCE:
            return True, f"{date_iso} 저장 {old:,.0f} vs 신규 {close:,.0f}"
    return False, None


def upsert_series(client, code, series, shares):
    """[(date, close)] 전체를 시총과 함께 upsert. 반환: 행수."""
    records = [{
        "stock_code": code,
        "date": d,
        "close": c,
        "market_cap": c * shares if shares else None,
    } for d, c in series]
    for i in range(0, len(records), 1000):
        client.table("prices").upsert(records[i:i + 1000], on_conflict="stock_code,date").execute()
    return len(records)


def main():
    client = get_client()
    companies = client.table("companies").select("stock_code,name,shares").execute().data
    krx_shares = _load_krx_shares()
    start = dt.date.today() - dt.timedelta(days=max(WINDOW_DAYS, CHECK_DAYS * 2))

    total, resynced, failed = 0, 0, []
    for c in companies:
        code, name, shares = c["stock_code"], c["name"], c["shares"]
        shares = float(shares) if shares else None
        try:
            fetched = fetch_closes(code, start)
        except Exception as e:
            failed.append(f"{name}({code}): {e}")
            continue
        if not fetched:
            failed.append(f"{name}({code}): 데이터 없음")
            continue

        # ① 수정주가 재조정 감지 → 전체 이력 재적재
        stored = stored_recent(client, code)
        hit, reason = detect_readjust(stored, fetched)
        if hit:
            print(f"  ⟳ {name}({code}) 수정주가 재조정 감지 ({reason}) → {RESYNC_YEARS}년 재적재")
            # 분할이면 주식수도 바뀌므로 KRX 상장목록 값으로 갱신
            new_shares = krx_shares.get(code)
            if new_shares and new_shares != shares:
                client.table("companies").update({"shares": new_shares}).eq("stock_code", code).execute()
                print(f"      주식수 갱신: {shares:,.0f} → {new_shares:,.0f}" if shares
                      else f"      주식수 설정: {new_shares:,.0f}")
                shares = new_shares
            try:
                full_start = dt.date.today() - dt.timedelta(days=int(RESYNC_YEARS * 365.25))
                full = fetch_closes(code, full_start)
                n = upsert_series(client, code, full, shares)
                total += n
                resynced += 1
                print(f"  ✓ {name}({code}): 전체 {n}일 재적재 완료")
            except Exception as e:
                failed.append(f"{name}({code}) 재적재 실패: {e}")
            continue

        # ② 평시: 최근 WINDOW_DAYS만 upsert (급변 오류 필터 적용)
        prev = stored[max(stored)] if stored else None  # 가장 최근 저장 종가
        records = []
        cutoff = (dt.date.today() - dt.timedelta(days=WINDOW_DAYS)).isoformat()
        for date_iso, close in fetched:
            if date_iso < cutoff:
                prev = close  # 창 밖 과거일은 필터 기준값만 갱신
                continue
            if prev and abs(close / prev - 1) > PRICE_JUMP_LIMIT:
                print(f"  ! {name} {date_iso} close={close:,.0f} 급변({prev:,.0f} 대비) → 제외")
                prev = close
                continue
            records.append({
                "stock_code": code,
                "date": date_iso,
                "close": close,
                "market_cap": close * shares if shares else None,
            })
            prev = close

        if records:
            client.table("prices").upsert(records, on_conflict="stock_code,date").execute()
            total += len(records)
            print(f"  ✓ {name}({code}): {len(records)}일 upsert (~{records[-1]['date']}, 종가 {records[-1]['close']:,.0f})")

    print(f"\n완료: {total}행 upsert, 전체 재적재 {resynced}종목, 실패 {len(failed)}종목")
    for f in failed:
        print("  ✗", f)
    if failed:
        sys.exit(1)  # Actions에서 실패로 표시 → 이메일 알림


if __name__ == "__main__":
    main()
