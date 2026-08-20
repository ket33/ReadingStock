"""
run.py — 뉴스룸 파이프라인 메인 (지시서 §1 전체 흐름)
=====================================================
감지 → 화이트리스트 → 사실 원장 → (기사 맥락) → 해설 생성 → 검증/폴백
→ Supabase 저장 → 워치리스트 이메일 트리거

사용:
    python -m news.run                       # 최근 3영업일 폴링 (일상 운영)
    python -m news.run --since 20260701      # 백필 (기간 지정)
    python -m news.run --no-notify           # 이메일 발송 없이 (백필용)
    python -m news.run --dry-run             # DB 저장 없이 생성 결과만 출력

대상 종목: companies 테이블(개별종목페이지 있는 기업) 전체 — 종목이 늘면 자동 확장.
훗날 전 상장사로 넓히려면 대상 쿼리만 listed_companies로 바꾸면 된다.
"""
import argparse
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from db import get_client                                    # noqa: E402
from news import dart_news, generate, validate as v, whitelist  # noqa: E402

KST = timezone(timedelta(hours=9))
NOTIFY_URL = "https://readingstock.com/api/notify-news"
DEDUPE_DAYS = 7  # 같은 종목·같은 유형이 이 기간 내 이미 보도됐으면 후속·정정으로 보고 스킵
# 폴링 창 — 오늘부터 이 영업일 수만큼 거슬러 올라간다. 매일 도는 스케줄이라 하루치면
# 충분하지만, GitHub Actions 예약은 밀리거나 통째로 건너뛰는 게 공식 미보장이라
# 며칠 여유를 둔다. 재폴링은 rcept_no·유형 중복 제거로 걸러져 무해하다.
POLL_BUSINESS_DAYS = 3
# 대상이 이 수를 넘으면 종목별 호출(대상 수만큼) 대신 전체 시장 1회 폴링으로 전환한다.
# (호출 수가 종목 수와 무관해져 2000+ 상장사까지 확장 가능)
WHOLE_MARKET_THRESHOLD = 150


def _has_fallback_reason_column(sb) -> bool:
    """company_news.fallback_reason이 있는지. (schema_fallback_reason.sql 실행 여부)

    없으면 그 필드를 빼고 저장한다 — 마이그레이션 전에 배포돼도 파이프라인이 멈추지 않게.
    """
    try:
        sb.table("company_news").select("fallback_reason").limit(1).execute()
        return True
    except Exception:  # noqa: BLE001 — 컬럼 없음(42703) 외 오류도 '없음'으로 취급하면 안전한 쪽
        return False


def business_days_ago(d: datetime, n: int) -> datetime:
    """d에서 영업일(월~금) n일 전 날짜. 주말은 세지 않는다.

    금요일 저녁에 올라온 공시를 월요일 실행이 놓치지 않게 하려는 것 —
    달력 3일이면 월요일 창이 금요일까지밖에 안 닿는다.
    공휴일은 세지 않는다(창이 그만큼 좁아지지만, 어차피 그날은 공시가 없다).
    """
    cur, left = d, n
    while left > 0:
        cur -= timedelta(days=1)
        if cur.weekday() < 5:      # 0=월 … 4=금
            left -= 1
    return cur


def _iter_filings(companies, bgn_de, end_de):
    """(회사, 그 회사의 기간 내 공시목록) 쌍을 순회한다.
    대상이 적으면 종목별 폴링, 많으면 전체 시장을 1회 폴링해 대상 종목으로 필터한다."""
    if len(companies) <= WHOLE_MARKET_THRESHOLD:
        for c in companies:
            yield c, dart_news.poll(c["corp_code"], bgn_de, end_de)
        return
    print(f"전체 시장 폴링 모드 (대상 {len(companies)}개사)")
    by_corp: dict[str, list] = {}
    for f in dart_news.poll_all(bgn_de, end_de):
        by_corp.setdefault(f.get("corp_code"), []).append(f)
    for c in companies:
        fs = by_corp.get(c["corp_code"])
        if fs:
            yield c, fs


def fetch_media_context(company_name: str, report_nm: str) -> str:
    """기사 맥락 보강 (지시서 §4) — 네이버 API 키가 있을 때만 동작. 없으면 빈 문자열.

    v1은 공시만으로 완결(지시서 §8 구축 순서). 키를 넣으면 자동 활성화된다.
    """
    if not os.environ.get("NAVER_CLIENT_ID"):
        return ""
    # TODO: 네이버 뉴스 API + 소스 화이트리스트 필터 (2단계에서 구현)
    return ""


def trigger_digest():
    """그날 새로 생성된 기사들을 회원별 다이제스트(하루 한 통)로 발송 — 루프 끝에 1회 호출."""
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("⚠ CRON_SECRET 없음 — 이메일 다이제스트 생략")
        return
    try:
        req = urllib.request.Request(
            NOTIFY_URL, method="POST",
            data=b"{}",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as res:
            out = json.loads(res.read().decode())
        print(f"다이제스트: 새 기사 {out.get('articles', 0)}건 → 회원 {out.get('users', 0)}명 중 {out.get('sent', 0)}명 발송")
        for err in out.get("errors", []):
            print("  ⚠", err)
    except Exception as e:  # noqa: BLE001 — 발송 실패가 파이프라인을 막으면 안 됨
        print(f"⚠ 다이제스트 트리거 실패: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="폴링 시작일 YYYYMMDD (기본: 7일 전)")
    ap.add_argument("--no-notify", action="store_true", help="이메일 발송 안 함 (백필용)")
    ap.add_argument("--dry-run", action="store_true", help="DB 저장 없이 결과만 출력")
    args = ap.parse_args()

    today = datetime.now(KST)
    bgn_de = args.since or business_days_ago(today, POLL_BUSINESS_DAYS).strftime("%Y%m%d")
    end_de = today.strftime("%Y%m%d")

    sb = get_client()
    has_reason_col = _has_fallback_reason_column(sb)
    if not has_reason_col:
        print("ℹ company_news.fallback_reason 없음 — 폴백 사유는 기록하지 않는다 "
              "(pipeline/schema_fallback_reason.sql 실행 시 활성화)")
    companies = sb.table("companies").select("stock_code,corp_code,name,market,sector").execute().data
    print(f"대상 {len(companies)}개사 · 기간 {bgn_de}~{end_de}"
          + (" · dry-run" if args.dry_run else "") + (" · 발송 없음" if args.no_notify else ""))

    # 회사별 리포트 핵심 요약 — 공시가 리포트에서 짚은 흐름과 닿으면 해설에 연결한다
    report_summaries: dict[str, str] = {}
    for c in companies:
        art = sb.table("articles").select("summary").eq("stock_code", c["stock_code"]) \
            .order("created_at", desc=True).limit(1).execute().data
        if art and art[0].get("summary"):
            report_summaries[c["stock_code"]] = art[0]["summary"]

    # 이미 처리한 접수번호 (중복 생성 방지)
    # ※ 반드시 페이징으로 — PostgREST는 요청당 1,000행에서 조용히 자른다. 페이징 없이 받으면
    #   3,300건 중 1,000건만 들어와 나머지는 '처음 보는 공시'가 되고, 재폴링 때 claude 호출을
    #   낭비하며 회원에게 같은 기사를 또 보낸다. (지금은 아래 유형별 중복 제거가 우연히
    #   받아내고 있을 뿐 — 폴링 창과 DEDUPE_DAYS가 어긋나는 순간 뚫린다)
    existing = set()
    if not args.dry_run:
        start = 0
        while True:
            page = sb.table("company_news").select("rcept_no") \
                .order("id").range(start, start + 999).execute().data
            existing.update(r["rcept_no"] for r in page)
            if len(page) < 1000:
                break
            start += 1000

    made = 0
    for c, filings in _iter_filings(companies, bgn_de, end_de):
        for f in filings:
            report_nm = f.get("report_nm", "")
            rcept_no = f.get("rcept_no", "")
            matched = whitelist.match(report_nm)
            if not matched or rcept_no in existing:
                continue
            category, type_key = matched
            rcept_dt = f.get("rcept_dt", end_de)
            published_at = datetime.strptime(rcept_dt, "%Y%m%d").replace(tzinfo=KST)

            # 후속·정정 중복 제거 — 같은 종목·유형이 최근에 이미 보도됐으면 스킵 (지시서 §7)
            if not args.dry_run:
                cutoff = (published_at - timedelta(days=DEDUPE_DAYS)).isoformat()
                dup = sb.table("company_news").select("id") \
                    .eq("stock_code", c["stock_code"]).eq("type_key", type_key) \
                    .gte("published_at", cutoff).limit(1).execute().data
                if dup:
                    print(f"[{c['name']}] {report_nm} → 최근 동일 유형 보도 있음, 스킵")
                    continue

            print(f"[{c['name']}] {report_nm} ({rcept_no})")

            facts = dart_news.build_facts(c["corp_code"], rcept_no, report_nm, type_key)
            if not facts:
                print("  ⚠ 사실 원장 확보 실패 — 스킵")
                continue

            media = fetch_media_context(c["name"], report_nm)
            result = generate.write_article(
                c["name"], c.get("market") or "", c.get("sector"),
                report_nm, type_key, facts, media,
                report_summary=report_summaries.get(c["stock_code"], ""))

            is_fallback = False
            fallback_reason = None
            if result:
                title, body = result
                issues = v.validate(title, body, facts)
                if issues:
                    fallback_reason = "; ".join(issues)[:500]
                    print(f"  검증 실패({fallback_reason}) → 템플릿 폴백")
                    title, body = v.fallback_article(c["name"], report_nm, rcept_dt)
                    is_fallback = True
            else:
                fallback_reason = ("생성 실패: "
                                   + (generate.LAST_ERROR.get("reason") or "사유 미상"))[:500]
                print("  생성 실패 → 템플릿 폴백")
                title, body = v.fallback_article(c["name"], report_nm, rcept_dt)
                is_fallback = True

            if args.dry_run:
                print("-" * 50)
                print(title)
                print()
                print(body)
                print("-" * 50)
                made += 1
                continue

            payload = {
                "stock_code": c["stock_code"],
                "rcept_no": rcept_no,
                "report_nm": report_nm,
                "category": category,
                "type_key": type_key,
                "title": title,
                "body": body,
                "dart_url": dart_news.viewer_url(rcept_no),
                "is_fallback": is_fallback,
                "published_at": published_at.isoformat(),
            }
            if has_reason_col:
                payload["fallback_reason"] = fallback_reason
            row = sb.table("company_news").insert(payload).execute().data[0]
            existing.add(rcept_no)
            made += 1
            print(f"  저장 완료 (id {row['id']}){' [폴백]' if is_fallback else ''}")

    print(f"\n완료: 뉴스 {made}건 생성")

    # 건별 발송 대신 하루 한 통 — 이번에 만든 기사들을 회원별로 묶어 다이제스트 발송
    if made > 0 and not args.no_notify and not args.dry_run:
        trigger_digest()


if __name__ == "__main__":
    main()
