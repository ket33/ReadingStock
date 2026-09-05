"""
retitle.py — 이미 나간 뉴스 기사의 제목만 다시 짓는다
=====================================================
헤드라인 지침이 바뀌었을 때, 본문은 그대로 두고 제목만 새 지침으로 다시 뽑는다.
기사 전체를 재생성하면 이미 검증을 통과한 본문까지 흔들리고 claude 호출도 두 배로 든다.

새 제목은 기존 본문과 <공시_사실>을 함께 주고 뽑으므로, 본문에 없는 사실이
제목에 들어가지 않는다. 뽑은 제목은 기존 본문과 함께 검증기에 태워서,
통과할 때만 반영한다(숫자·금지어 규칙은 제목에도 그대로 적용된다).

※ notified_at은 건드리지 않는다 — 이미 나간 다이제스트를 다시 보내지 않는다.
※ 폴백 기사는 대상에서 뺀다 — 제목만 고쳐봐야 본문이 템플릿이다.
   그건 rewrite.py가 본문째 다시 만든다.

사용:
    python -m news.retitle --date 2026-08-21          # 그날(KST) 발행분
    python -m news.retitle --date 2026-08-21 --dry-run
    python -m news.retitle --days 3                   # 최근 3영업일
"""
import argparse
import os
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_client                                  # noqa: E402
from news import dart_news, generate, validate as v        # noqa: E402
from news.run import business_days_ago                     # noqa: E402

KST = timezone(timedelta(hours=9))
WORKERS = 5
GEN_FAIL_STOP = 6

_print_lock = threading.Lock()
_state_lock = threading.Lock()
_local = threading.local()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


def _sb():
    if not hasattr(_local, "sb"):
        _local.sb = get_client()
    return _local.sb


def _headline_rules() -> str:
    """시스템 프롬프트에서 '헤드라인 쓰는 법' 절만 떼어 온다.
    규칙을 여기 복사해두면 prompt_system.md를 고칠 때 두 곳이 어긋난다."""
    text = generate._load_system_prompt()
    m = re.search(r"^# 헤드라인 쓰는 법\n(.*?)(?=^# )", text, re.S | re.M)
    return m.group(1).strip() if m else ""


def new_title(company: str, report_nm: str, facts: str, body: str) -> str | None:
    """기존 본문을 바탕으로 제목만 새로 뽑는다."""
    prompt = f"""너는 리딩스톡 뉴스룸의 공시 해설 기자다.
아래 기사에 붙일 헤드라인을 새로 지어라. 본문은 고치지 않는다.

{_headline_rules()}

<회사명>{company}</회사명>
<공시 보고서명>{report_nm}</공시 보고서명>

<공시_사실>
{facts[:6000]}
</공시_사실>

<기사_본문>
{body}
</기사_본문>

헤드라인 한 줄만 출력하라. 따옴표·마침표·설명 없이 제목 문장만."""
    try:
        r = subprocess.run(
            [generate._claude_bin(), "-p", "--output-format", "text",
             "--model", generate.MODEL],
            input=prompt, capture_output=True, text=True,
            encoding="utf-8", timeout=180,
        )
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0:
        return None
    t = (r.stdout or "").strip().splitlines()
    if not t:
        return None
    title = t[0].strip().strip('"“”').rstrip(".")
    return title if 6 <= len(title) <= 90 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="대상 발행일 YYYY-MM-DD (KST)")
    ap.add_argument("--days", type=int, help="최근 N영업일")
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.date and not args.days:
        ap.error("--date 또는 --days 중 하나가 필요합니다")

    sb = get_client()
    if args.date:
        d0 = datetime.fromisoformat(args.date).replace(tzinfo=KST)
        d1 = d0 + timedelta(days=1)
    else:
        d0 = business_days_ago(datetime.now(KST), args.days) \
            .replace(hour=0, minute=0, second=0, microsecond=0)
        d1 = datetime.now(KST) + timedelta(days=1)

    rows, off = [], 0
    while True:
        page = (sb.table("company_news")
                .select("id,stock_code,rcept_no,report_nm,type_key,title,body")
                .eq("is_fallback", False)   # 폴백은 rewrite.py 몫
                .gte("published_at", d0.astimezone(timezone.utc).isoformat())
                .lt("published_at", d1.astimezone(timezone.utc).isoformat())
                .order("id").range(off, off + 999).execute().data)
        rows.extend(page)
        if len(page) < 1000:
            break
        off += 1000

    log(f"제목 재작성 대상 {len(rows)}건 · {d0:%Y-%m-%d}"
        + (f"~{(d1 - timedelta(days=1)):%m-%d}" if args.days else "")
        + f" (KST) · 동시 {args.workers}개" + (" · dry-run" if args.dry_run else ""))
    if not rows:
        return

    codes = list({r["stock_code"] for r in rows})
    comps = {}
    for i in range(0, len(codes), 200):
        for c in sb.table("companies").select("stock_code,corp_code,name") \
                .in_("stock_code", codes[i:i + 200]).execute().data:
            comps[c["stock_code"]] = c

    stat = {"done": 0, "changed": 0, "kept": 0, "failed": 0, "streak": 0}
    stop = threading.Event()
    total = len(rows)

    def work(r):
        if stop.is_set():
            return
        c = comps.get(r["stock_code"])
        if not c:
            with _state_lock:
                stat["failed"] += 1
            return
        try:
            facts = dart_news.build_facts(c["corp_code"], r["rcept_no"],
                                          r["report_nm"], r["type_key"])
        except Exception:  # noqa: BLE001 — 한 건 실패가 전체를 멈추면 안 된다
            facts = ""
        if not facts:
            with _state_lock:
                stat["failed"] += 1
            log(f"  {c['name']}: 사실 원장 없음 — 유지")
            return

        t = new_title(c["name"], r["report_nm"], facts, r["body"])
        with _state_lock:
            stat["done"] += 1
            n = stat["done"]
        if not t:
            with _state_lock:
                stat["failed"] += 1
                stat["streak"] += 1
                if stat["streak"] >= GEN_FAIL_STOP and not stop.is_set():
                    stop.set()
                    log(f"\n⚠ 연속 {GEN_FAIL_STOP}건 실패 — 한도 소진으로 보고 중단합니다.")
            log(f"  [{n}/{total}] {c['name']}: 제목 생성 실패 — 유지")
            return
        with _state_lock:
            stat["streak"] = 0

        # 내용 점검(숫자 대조) 게이트 제거 — run.py·rewrite.py와 같은 방침이다
        # (2026-09-05 결정). 투자권유 표현만 경고로 남기고 제목은 그대로 반영한다.
        warn = v.check_recommend(t)
        if warn:
            log(f"  [{n}/{total}] ⚠ {c['name']}: 투자권유 표현 감지(그대로 저장) "
                f"({', '.join(warn)})")

        log(f"  [{n}/{total}] {c['name']}")
        log(f"        전: {r['title']}")
        log(f"        후: {t}")
        if not args.dry_run:
            _sb().table("company_news").update({"title": t}).eq("id", r["id"]).execute()
        with _state_lock:
            stat["changed"] += 1

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, rows))

    log(f"\n완료: 교체 {stat['changed']}건 · 유지 {stat['kept']}건 · 실패 {stat['failed']}건")


if __name__ == "__main__":
    main()
