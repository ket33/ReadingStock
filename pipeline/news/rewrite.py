"""
rewrite.py — 폴백으로 나간 기사 재작성
======================================
run.py는 폴백 기사도 company_news에 넣고 rcept_no를 기록한다. 그래서 일시적 사고로
폴백된 건은 다음 실행이 '이미 처리함'으로 보고 영영 다시 시도하지 않는다
(실측: 2026-08-20 실행에서 뒤 161건이 연속 폴백 — 도중에 구독 한도가 소진돼
claude -p가 전부 실패했고, 그 기사들은 템플릿인 채로 굳었다).

이 스크립트가 그 건들을 다시 만든다. 검증을 통과할 때만 덮어쓰고, 여전히 실패하면
원래 폴백 기사를 그대로 둔다.

한 건당 claude -p 한 번(25~80초)이라 순차로 돌리면 300건에 4시간이 넘는다.
그래서 WORKERS개를 동시에 돌린다 — 대기 시간이 겹쳐 전체 시간이 그만큼 줄어든다.

※ notified_at은 건드리지 않는다 — 이미 다이제스트로 나간 기사를 다시 보내지 않기 위해서.
   본문만 조용히 좋아진다.
※ 멱등하다. 중단됐다 다시 돌려도 이미 고친 건은 대상(is_fallback=true)에서 빠진다.

사용:
    python -m news.rewrite                    # 최근 3영업일 폴백 전부
    python -m news.rewrite --days 7           # 최근 7영업일
    python -m news.rewrite --limit 50         # 앞에서 50건만
    python -m news.rewrite --workers 8        # 동시 실행 수 (기본 5)
    python -m news.rewrite --dry-run          # 저장 없이 결과만
"""
import argparse
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_client                                       # noqa: E402
from news import dart_news, generate, validate as v             # noqa: E402
# ※ news.run이 import 시점에 sys.stdout을 utf-8로 감싼다. 여기서 또 감싸면 같은 버퍼를
#   이중으로 래핑해 먼저 것이 닫히고 print가 죽는다 — 감싸지 말고 그대로 쓴다.
from news.run import business_days_ago, _has_fallback_reason_column  # noqa: E402

KST = timezone(timedelta(hours=9))
# 연속으로 이만큼 생성 실패하면 한도 소진으로 보고 멈춘다.
# 계속 두들겨봐야 전부 실패하고, 통과할 수 있었던 건들의 차례만 잡아먹는다.
GEN_FAIL_STOP = 6
WORKERS = 5          # 동시 claude -p 수. 너무 올리면 구독 한도를 그만큼 빨리 태운다.

_print_lock = threading.Lock()
_state_lock = threading.Lock()
_local = threading.local()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


def _sb():
    """스레드별 Supabase 클라이언트 — 커넥션을 공유하지 않는다."""
    if not hasattr(_local, "sb"):
        _local.sb = get_client()
    return _local.sb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3, help="최근 N영업일 (기본 3)")
    ap.add_argument("--limit", type=int, help="이번 실행에서 처리할 최대 건수")
    ap.add_argument("--workers", type=int, default=WORKERS, help=f"동시 실행 수 (기본 {WORKERS})")
    ap.add_argument("--dry-run", action="store_true", help="저장 없이 결과만 출력")
    args = ap.parse_args()

    sb = get_client()
    has_reason = _has_fallback_reason_column(sb)
    start = business_days_ago(datetime.now(KST), args.days) \
        .replace(hour=0, minute=0, second=0, microsecond=0)

    rows, off = [], 0
    while True:
        page = (sb.table("company_news")
                .select("id,stock_code,rcept_no,report_nm,type_key,created_at")
                .eq("is_fallback", True)
                .gte("created_at", start.astimezone(timezone.utc).isoformat())
                .order("id").range(off, off + 999).execute().data)
        rows.extend(page)
        if len(page) < 1000:
            break
        off += 1000
    if args.limit:
        rows = rows[:args.limit]
    log(f"재작성 대상 {len(rows)}건 · {start:%Y-%m-%d}부터 · 동시 {args.workers}개"
        + (" · dry-run" if args.dry_run else ""))
    if not rows:
        return

    codes = list({r["stock_code"] for r in rows})
    comps = {}
    for i in range(0, len(codes), 200):
        for c in sb.table("companies").select("stock_code,corp_code,name,market,sector") \
                .in_("stock_code", codes[i:i + 200]).execute().data:
            comps[c["stock_code"]] = c

    summaries = {}
    for code in codes:
        art = sb.table("articles").select("summary").eq("stock_code", code) \
            .order("created_at", desc=True).limit(1).execute().data
        if art and art[0].get("summary"):
            summaries[code] = art[0]["summary"]

    stat = {"fixed": 0, "still": 0, "skipped": 0, "done": 0, "streak": 0}
    stop = threading.Event()
    total = len(rows)

    def work(r):
        if stop.is_set():
            return
        c = comps.get(r["stock_code"])
        if not c:
            with _state_lock:
                stat["skipped"] += 1
            return
        try:
            facts = dart_news.build_facts(c["corp_code"], r["rcept_no"],
                                          r["report_nm"], r["type_key"])
        except Exception as e:  # noqa: BLE001 — 한 건 실패가 전체를 멈추면 안 된다
            log(f"  {c['name']}: 사실 원장 조회 오류 ({e})")
            with _state_lock:
                stat["skipped"] += 1
            return
        if not facts:
            with _state_lock:
                stat["skipped"] += 1
            return

        out = generate.write_article(c["name"], c.get("market") or "", c.get("sector"),
                                     r["report_nm"], r["type_key"], facts, "",
                                     summaries.get(r["stock_code"], ""))
        with _state_lock:
            stat["done"] += 1
            n = stat["done"]
        if not out:
            reason = generate.LAST_ERROR.get("reason") or "사유 미상"
            log(f"  [{n}/{total}] {c['name']}: 생성 실패 ({reason[:70]})")
            with _state_lock:
                stat["still"] += 1
                stat["streak"] += 1
                if stat["streak"] >= GEN_FAIL_STOP and not stop.is_set():
                    stop.set()
                    log(f"\n⚠ 연속 {GEN_FAIL_STOP}건 생성 실패 — 한도 소진으로 보고 중단합니다.")
                    log("   회복 후 같은 명령을 다시 실행하세요(고친 건은 대상에서 빠집니다).")
            return
        with _state_lock:
            stat["streak"] = 0

        title, body = out
        issues = v.validate(title, body, facts, r["type_key"])
        if issues:
            log(f"  [{n}/{total}] {c['name']}: 검증 실패 유지 ({'; '.join(issues)[:70]})")
            with _state_lock:
                stat["still"] += 1
            if has_reason and not args.dry_run:
                _sb().table("company_news").update(
                    {"fallback_reason": "; ".join(issues)[:500]}).eq("id", r["id"]).execute()
            return

        if not args.dry_run:
            patch = {"title": title, "body": body, "is_fallback": False}
            if has_reason:
                patch["fallback_reason"] = None
            _sb().table("company_news").update(patch).eq("id", r["id"]).execute()
        log(f"  [{n}/{total}] ✓ {c['name']}: {title[:46]}")
        with _state_lock:
            stat["fixed"] += 1

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, rows))

    log(f"\n완료: 재작성 {stat['fixed']}건 · 여전히 폴백 {stat['still']}건 "
        f"· 건너뜀 {stat['skipped']}건")


if __name__ == "__main__":
    main()
