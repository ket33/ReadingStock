"""
update_prices_daily.py — 일별 주가 갱신 (GitHub Actions 크론용)
=====================================================
KRX 전 종목 스냅샷(fdr.StockListing('KRX') — 1회 호출에 전 종목의 당일
종가·시가총액·상장주식수)을 받아 prices에 upsert한다.

이전 버전은 종목마다 FinanceDataReader 시계열을 순차 호출했다(종목당 ~1.5초).
94종목이면 2~3분이지만 2,500종목이면 ~50분 → Actions 10분 타임아웃에 죽는 구조.
지금은 전 종목이 호출 1번이라 종목 수와 무관하게 총 1~2분.

시가총액은 KRX 공식 값(Marcap)을 그대로 쓴다 (이전의 종가×상장주식수 계산보다 정확).

구조 (스냅샷은 '오늘'만 주므로 세 단계로 보강):
  ① 오늘 스냅샷 upsert — 오늘이 거래일일 때만 (기준종목 시계열로 휴장 감지)
  ② 결손 치유 — 최근 WINDOW_DAYS 거래일 중 빠진 날이 있는 종목만 FDR로 그 구간을 다시 받음
     (크론 결손·Actions 장애가 있어도 다음 실행에서 자동으로 메워진다)
  ③ 수정주가 재적재 — 하루 등락이 상하한가(±30%)를 넘는 점프는 분할·감자
     신호다(스냅샷은 원주가, DB 과거는 수정주가라 분할 시 점프로 나타남)
     → 그 종목만 FDR 수정주가로 RESYNC_YEARS년 전체 이력을 다시 받는다.
     (거래정지 후 재개 종목도 걸릴 수 있지만 재적재는 멱등이라 무해)

- 대상을 DB에서 읽으므로 새 종목을 온보딩하면 자동으로 포함된다.
- 웹은 ISR이라 DB 갱신이면 자동 반영.

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_prices_daily.py
"""
import datetime as dt
import os
import sys

import FinanceDataReader as fdr
from supabase import create_client

WINDOW_DAYS = 7        # 결손을 점검·치유할 기간
JUMP_RESYNC = 0.40     # 하루 등락이 이 비율(절대값)을 넘으면 분할·감자로 보고 재적재
                       # (국내 상하한가 ±30%라 정상 등락으로는 도달 불가)
RESYNC_YEARS = 15      # 재적재 시 다시 받을 이력 (루트 config.PRICE_YEARS와 동일)
SHARES_DRIFT = 0.005   # 상장주식수가 이 비율 넘게 달라지면 companies.shares 갱신
MAX_BACKFILL = 300     # 한 실행에서 결손 치유할 최대 종목 수 (타임아웃 방지, 나머지는 다음 실행)
REF_CODE = "005930"    # 거래일 달력 기준 종목 (삼성전자 — 거래정지 가능성 사실상 없음)


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def fetch_all(build, page=1000):
    """PostgREST 요청당 1,000행 캡 우회 — range로 끝까지 훑는다.
    build(from_, to_)는 호출마다 새 쿼리 빌더를 만들어 돌려줘야 한다."""
    out, start = [], 0
    while True:
        rows = build(start, start + page - 1).execute().data
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page


def upsert_prices(client, records):
    for i in range(0, len(records), 1000):
        client.table("prices").upsert(
            records[i:i + 1000], on_conflict="stock_code,date").execute()


def market_snapshot():
    """오늘 KRX 전 종목 {코드: (종가, 시가총액, 상장주식수, 거래량)}."""
    df = fdr.StockListing("KRX")
    out = {}
    for _, r in df.iterrows():
        try:
            code = str(r["Code"])
            close = float(r["Close"] or 0)
            if close <= 0:
                continue
            out[code] = (
                close,
                float(r["Marcap"]) if r.get("Marcap") else None,
                float(r["Stocks"]) if r.get("Stocks") else None,
                float(r["Volume"] or 0),
            )
        except (ValueError, TypeError, KeyError):
            continue
    return out


def fetch_closes_fdr(code, start):
    """FDR 수정주가 시계열 → [(date_iso, close)] (결손 치유·재적재용)."""
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


def main():
    client = get_client()
    companies = fetch_all(lambda a, b: client.table("companies")
                          .select("stock_code,name,shares").order("stock_code").range(a, b))
    names = {c["stock_code"]: c["name"] for c in companies}
    shares_db = {c["stock_code"]: (float(c["shares"]) if c["shares"] else None) for c in companies}
    codes = set(names)
    print(f"대상 {len(codes)}종목")

    today = dt.date.today()
    today_iso = today.isoformat()
    cutoff = (today - dt.timedelta(days=WINDOW_DAYS)).isoformat()

    # 거래일 달력: 기준종목의 최근 시계열 (오늘 포함 여부 = 오늘이 거래일인가)
    ref = fetch_closes_fdr(REF_CODE, today - dt.timedelta(days=WINDOW_DAYS + 14))
    trading_days = [d for d, _ in ref]
    is_trading_today = today_iso in trading_days

    # 저장된 최근 종가 (점프 감지 + 결손 판정) — 전 종목 페이징 한 번에
    stored_rows = fetch_all(lambda a, b: client.table("prices")
                            .select("stock_code,date,close")
                            .gte("date", (today - dt.timedelta(days=WINDOW_DAYS + 14)).isoformat())
                            .order("stock_code").order("date").range(a, b))
    last_close, stored_dates = {}, {}
    for r in stored_rows:
        if r["close"]:
            last_close[r["stock_code"]] = float(r["close"])   # 날짜순이라 마지막 값이 최신
        stored_dates.setdefault(r["stock_code"], set()).add(r["date"])

    snap = market_snapshot()
    print(f"KRX 스냅샷 {len(snap)}종목, 오늘({today_iso}) 거래일: {is_trading_today}")

    total, jump_codes = 0, set()

    # ── ① 오늘 스냅샷 upsert ──────────────────────────────────
    if is_trading_today:
        records = []
        for code, (close, cap, _sh, vol) in snap.items():
            if code not in codes or vol <= 0:      # 거래정지 종목은 전일값 복제라 제외
                continue
            prev = last_close.get(code)
            if prev and abs(close / prev - 1) > JUMP_RESYNC:
                jump_codes.add(code)               # 분할·감자 의심 → ③에서 재적재
                continue
            records.append({"stock_code": code, "date": today_iso,
                            "close": close, "market_cap": cap})
        upsert_prices(client, records)
        total += len(records)
        print(f"① 오늘 종가 {len(records)}종목 upsert")
    else:
        print("① 오늘은 휴장 — 스냅샷 적재 생략")

    # ── ② 결손 치유 — 최근 거래일 중 빠진 날이 있는 종목만 ──
    expected = {d for d in trading_days if d >= cutoff and d != today_iso}
    gapped = [c for c in codes
              if snap.get(c, (0, 0, 0, 0))[3] > 0                    # 지금 거래되는 종목만
              and expected - stored_dates.get(c, set())]             # 빠진 거래일 존재
    if len(gapped) > MAX_BACKFILL:
        print(f"② 결손 {len(gapped)}종목 중 {MAX_BACKFILL}종목만 이번에 치유 (나머지는 다음 실행)")
        gapped = gapped[:MAX_BACKFILL]
    healed = 0
    for code in gapped:
        try:
            series = [(d, c) for d, c in
                      fetch_closes_fdr(code, today - dt.timedelta(days=WINDOW_DAYS + 7))
                      if d >= cutoff and d != today_iso]
            if not series:
                continue
            sh = shares_db.get(code)
            upsert_prices(client, [{"stock_code": code, "date": d, "close": c,
                                    "market_cap": c * sh if sh else None}
                                   for d, c in series])
            total += len(series)
            healed += 1
        except Exception as e:
            print(f"  ✗ 결손 치유 실패 {names.get(code, code)}({code}): {e}")
    if gapped:
        print(f"② 결손 치유 {healed}/{len(gapped)}종목")

    # ── ③ 분할·감자 감지 종목: 주식수 갱신 + 수정주가 전체 재적재 ──
    resynced = 0
    for code in sorted(jump_codes):
        name = names.get(code, code)
        shares = shares_db.get(code)
        new_shares = snap.get(code, (None, None, None, None))[2]
        if new_shares and (not shares or abs(new_shares / shares - 1) > SHARES_DRIFT):
            # companies.shares는 bigint — float를 보내면 22P02 에러
            client.table("companies").update({"shares": int(new_shares)}).eq("stock_code", code).execute()
            print(f"  ⟳ {name}({code}) 주식수 갱신: {shares} → {new_shares:,.0f}")
            shares = new_shares
        print(f"  ⟳ {name}({code}) 분할·감자 의심 → {RESYNC_YEARS}년 재적재")
        try:
            start = today - dt.timedelta(days=int(RESYNC_YEARS * 365.25))
            series = fetch_closes_fdr(code, start)
            if series:
                upsert_prices(client, [{"stock_code": code, "date": d, "close": c,
                                        "market_cap": c * shares if shares else None}
                                       for d, c in series])
                total += len(series)
                resynced += 1
                print(f"  ✓ {name}({code}): 전체 {len(series)}일 재적재 완료")
        except Exception as e:
            print(f"  ✗ {name}({code}) 재적재 실패: {e}")

    # ── 상장주식수 표류 감지 (분할 외 증자·소각 반영) ────────
    drift = 0
    for code in codes:
        sh_new = snap.get(code, (None, None, None, None))[2]
        sh_old = shares_db.get(code)
        if code in jump_codes or not sh_new:
            continue
        if not sh_old or abs(sh_new / sh_old - 1) > SHARES_DRIFT:
            # companies.shares는 bigint — float를 보내면 22P02 에러
            client.table("companies").update({"shares": int(sh_new)}).eq("stock_code", code).execute()
            drift += 1
    if drift:
        print(f"상장주식수 갱신 {drift}종목")

    # 스냅샷에 없는 보유 종목 보고 (상장폐지·코드 변경 후보)
    missing = sorted(c for c in codes if c not in snap)
    if missing:
        print(f"\n[확인 필요] KRX 스냅샷에 없는 {len(missing)}종목 (상장폐지 후보): "
              f"{', '.join(missing[:20])}" + (" …" if len(missing) > 20 else ""))

    print(f"\n완료: {total}행 upsert, 재적재 {resynced}종목")


if __name__ == "__main__":
    main()
