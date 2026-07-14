"""
update_screener_daily.py — 스크리너 스냅샷 일일 갱신 (GitHub Actions 크론용)
=====================================================
루트 파이프라인의 load_screener.py를 Actions에서 돌 수 있게 자립형으로 포팅한 것.
(다른 점: 대상을 config.TARGETS가 아니라 companies 테이블에서 읽음 — 온보딩 자동 포함)

주가 갱신(update_prices_daily.py) 뒤에 실행해, 종목당 한 줄인 screener 표를 다시 채운다:
  1) 최신 지표  — metrics에서 기간말이 가장 최근인 행(보통 최신 분기 TTM)을 복사.
  2) 현재가 환산 — metrics의 밸류에이션은 '기간말 시점' 주가 기준이므로
     scale = 현재 종가 / 기간말 종가 로 오늘 주가 기준으로 환산.
       × scale : PER, PBR, P/S, P/OCF, Price/FCF   (가격이 분자)
       ÷ scale : 배당수익률, FCF수익률              (가격이 분모)
  3) 수익률    — prices.close(수정주가) 시계열로 1D/5D(거래일),
     1M/3M/6M/1Y/5Y/10Y(달력), YTD. 이력이 짧으면 None.

metrics 자체(TTM 지표)는 분기 공시가 떠야 바뀌므로 여기서 재계산하지 않는다
— 새 분기 반영은 루트 파이프라인(run_all.py) 소관.

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_screener_daily.py
"""
import datetime as dt
import os
import sys
from bisect import bisect_right

from supabase import create_client

# 기간 라벨 → 기간말 (월, 일)
QUARTER_END = {"1Q": (3, 31), "2Q": (6, 30), "3Q": (9, 30), "4Q": (12, 31), "FY": (12, 31)}

# metrics → screener로 복사하지 않는 컬럼
EXCLUDE_COLS = {"id", "stock_code", "fiscal_year", "period", "calculated_at"}

# 현재가 환산 대상
SCALE_MULT = ("per", "pbr", "price_sales", "price_ocf", "price_fcf")  # × scale
SCALE_DIV = ("div_yield", "fcf_yield")                                # ÷ scale

# 달력 기준 수익률: 컬럼 → 며칠 전
CAL_LOOKBACK = {
    "ret_1m": 30, "ret_3m": 91, "ret_6m": 182,
    "ret_1y": 365, "ret_5y": 1826, "ret_10y": 3652,
}


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def _pct_change(base, cur):
    if base is None or cur is None or base <= 0:
        return None
    return round((cur / base - 1) * 100, 2)


def _load_prices(client, stock_code):
    """(정렬된 date 리스트, close 리스트, market_cap 리스트)."""
    rows, start, page = [], 0, 1000
    while True:
        res = (
            client.table("prices")
            .select("date,close,market_cap")
            .eq("stock_code", stock_code)
            .order("date")
            .range(start, start + page - 1)
            .execute()
        )
        rows.extend(res.data)
        if len(res.data) < page:
            break
        start += page
    return ([r["date"] for r in rows],
            [r["close"] for r in rows],
            [r["market_cap"] for r in rows])


def _close_asof(dates, closes, asof_date):
    """asof_date(YYYY-MM-DD) 이하의 가장 최근 종가. 없으면 None."""
    i = bisect_right(dates, asof_date) - 1
    return closes[i] if i >= 0 else None


def _calc_returns(dates, closes):
    """수익률 dict. 1D/5D=거래일 offset, 1M~10Y=달력 lookback, YTD=전년 말 대비."""
    r = {"ret_1d": None, "ret_5d": None, "ret_ytd": None}
    r.update({k: None for k in CAL_LOOKBACK})
    if not dates:
        return r
    last = closes[-1]
    if len(closes) >= 2:
        r["ret_1d"] = _pct_change(closes[-2], last)
    if len(closes) >= 6:
        r["ret_5d"] = _pct_change(closes[-6], last)

    d0 = dt.date.fromisoformat(dates[-1])
    for col, days in CAL_LOOKBACK.items():
        base = _close_asof(dates, closes, (d0 - dt.timedelta(days=days)).isoformat())
        r[col] = _pct_change(base, last)
    base = _close_asof(dates, closes, dt.date(d0.year - 1, 12, 31).isoformat())
    r["ret_ytd"] = _pct_change(base, last)
    return r


def _latest_metrics(client, stock_code):
    """기간말 날짜가 가장 최근인 metrics 행. (동일 기간말이면 FY 우선)"""
    rows = client.table("metrics").select("*").eq("stock_code", stock_code).execute().data
    if not rows:
        return None

    def sort_key(r):
        m, d = QUARTER_END[r["period"]]
        return (r["fiscal_year"], m, d, 1 if r["period"] == "FY" else 0)

    return max(rows, key=sort_key)


def main():
    client = get_client()
    companies = client.table("companies").select("stock_code,name,market,sector").execute().data

    saved, failed = 0, []
    for c in companies:
        code, name = c["stock_code"], c["name"]
        try:
            dates, closes, caps = _load_prices(client, code)
            m = _latest_metrics(client, code)
            if not dates or m is None:
                failed.append(f"{name}({code}): 주가 또는 지표 없음")
                continue

            last_close, last_date, last_cap = closes[-1], dates[-1], caps[-1]
            rec = {
                "stock_code": code, "name": name,
                "market": c["market"], "sector": c["sector"],
                "price": last_close, "price_date": last_date, "market_cap": last_cap,
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            for col, val in m.items():
                if col not in EXCLUDE_COLS:
                    rec[col] = val

            # 밸류에이션 현재가 환산
            y, p = m["fiscal_year"], m["period"]
            end = dt.date(y, *QUARTER_END[p]).isoformat()
            asof_close = _close_asof(dates, closes, end)
            scale = (last_close / asof_close) if (last_close and asof_close) else None
            if scale:
                for col in SCALE_MULT:
                    if rec.get(col) is not None:
                        rec[col] = round(rec[col] * scale, 2)
                for col in SCALE_DIV:
                    if rec.get(col) is not None:
                        rec[col] = round(rec[col] / scale, 2)
            rec["based_on"] = (
                f"{y} {p}{' TTM' if p != 'FY' else ''} × {last_date} 주가"
                + ("" if scale else " (환산 불가: 기간말 종가 없음)")
            )

            rec.update(_calc_returns(dates, closes))
            client.table("screener").upsert(rec, on_conflict="stock_code").execute()
            saved += 1
            print(f"  ✓ {name}({code}): {rec['based_on']}  1D {rec['ret_1d']}%  YTD {rec['ret_ytd']}%")
        except Exception as e:
            failed.append(f"{name}({code}): {e}")

    print(f"\n완료: screener {saved}종목 갱신, 실패 {len(failed)}종목")
    for f in failed:
        print("  ✗", f)
    if failed:
        sys.exit(1)  # Actions 실패 표시 → 알림


if __name__ == "__main__":
    main()
