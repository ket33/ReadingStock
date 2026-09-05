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
# 연속으로 이만큼 '생성 실패'(claude 호출 자체가 실패)하면 한도 소진으로 보고 멈춘다.
# 한도 소진은 개별 사고가 아니라 그 뒤 모든 호출이 실패하는 상태다. 그걸 모르고 루프를
# 끝까지 돌면 남은 공시가 전부 템플릿으로 저장되고, rcept_no까지 찍혀 다음 실행이
# '이미 처리함'으로 영영 건너뛴다 — 일시적 사고가 영구적 품질 저하로 굳는다.
# (실측 2026-08-20: 앞 130건 정상 → 뒤 161건 연속 폴백. 정상 구간의 최장 연속 실패는
#  2건이라 5로 두면 오판하지 않는다.)
GEN_FAIL_STOP = 5
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
    # ── 대상 종목: '리포트(articles)가 있는 기업'만 ──
    # 온보딩만 되고 리포트가 없는 기업까지 돌리면 claude 호출을 그만큼 더 태우는데,
    # 정작 그 종목 페이지엔 읽을 리포트가 없다(2026-09-05 사용자 결정으로 범위 축소:
    # 온보딩 기업 전체 1,643개사 → 리포트 보유 865개사).
    #
    # 리포트 요약(summary)은 공시 해설을 리포트 흐름과 연결할 때 쓴다. 예전엔 종목마다
    # 한 번씩 질의해서 대상 수만큼 왕복이 생겼는데(실측 865~1,643회, 이 단계에서만 수 분),
    # 한 번에 받아 최신 것만 남기면 두어 번의 질의로 끝난다.
    #
    # ※ 두 조회 모두 페이징 필수 — PostgREST는 요청당 1,000행에서 조용히 자른다.
    #   페이징 없이 받으면 뒤쪽이 통째로 빠진다(2026-09-05 발견: 온보딩 1,643개사인데
    #   "대상 1000개사"로 찍히고 나머지가 대상에서 누락되고 있었다).
    article_codes: set[str] = set()
    report_summaries: dict[str, str] = {}
    _start = 0
    while True:
        page = sb.table("articles").select("stock_code,summary,created_at") \
            .order("created_at").range(_start, _start + 999).execute().data
        for a in page:                      # created_at 오름차순 → 나중에 온 것이 최신
            article_codes.add(a["stock_code"])
            if a.get("summary"):
                report_summaries[a["stock_code"]] = a["summary"]
        if len(page) < 1000:
            break
        _start += 1000

    companies, _start = [], 0
    while True:
        page = sb.table("companies").select("stock_code,corp_code,name,market,sector") \
            .order("stock_code").range(_start, _start + 999).execute().data
        companies.extend(c for c in page if c["stock_code"] in article_codes)
        if len(page) < 1000:
            break
        _start += 1000
    print(f"대상 {len(companies)}개사(리포트 보유) · 기간 {bgn_de}~{end_de}"
          + (" · dry-run" if args.dry_run else "") + (" · 발송 없음" if args.no_notify else ""))

    # 이미 처리한 접수번호 (중복 생성 방지)
    # ※ 반드시 페이징으로 — PostgREST는 요청당 1,000행에서 조용히 자른다. 페이징 없이 받으면
    #   3,300건 중 1,000건만 들어와 나머지는 '처음 보는 공시'가 되고, 재폴링 때 claude 호출을
    #   낭비하며 회원에게 같은 기사를 또 보낸다. (지금은 아래 유형별 중복 제거가 우연히
    #   받아내고 있을 뿐 — 폴링 창과 DEDUPE_DAYS가 어긋나는 순간 뚫린다)
    # ※ 생성 실패로 폴백된 건은 '처리함'에서 뺀다 — 다시 시도해서 되살리기 위해서.
    #   claude 호출 자체가 실패한 건(한도 소진·타임아웃)은 재시도하면 제대로 된 기사가
    #   나온다. 재시도된 건은 아래에서 insert가 아니라 update로 덮어쓴다.
    # ※ 폴링 창 안의 공시만 대조하면 충분하다 — 이번에 만나는 공시는 전부 rcept_dt가
    #   bgn_de 이후라, 그 이전에 저장된 행과는 애초에 부딪힐 일이 없다. 예전엔 company_news
    #   전체(4,000행, 계속 증가)를 매 실행마다 통째로 읽었다. 하루 경계·타임존을 감안해
    #   이틀 여유를 둔다.
    existing, retryable = set(), {}
    if not args.dry_run:
        start = 0
        since = (datetime.strptime(bgn_de, "%Y%m%d").replace(tzinfo=KST)
                 - timedelta(days=2)).isoformat()
        sel = "id,rcept_no,is_fallback,fallback_reason" if has_reason_col else "id,rcept_no"
        while True:
            page = sb.table("company_news").select(sel).gte("published_at", since) \
                .order("id").range(start, start + 999).execute().data
            for r in page:
                if (has_reason_col and r.get("is_fallback")
                        and (r.get("fallback_reason") or "").startswith("생성 실패")):
                    retryable[r["rcept_no"]] = r["id"]
                else:
                    existing.add(r["rcept_no"])
            if len(page) < 1000:
                break
            start += 1000
    if retryable:
        print(f"생성 실패로 폴백됐던 {len(retryable)}건은 다시 시도합니다")

    made = 0
    gen_fail_streak = 0   # 연속 생성 실패 수 — 한도 소진 감지용 (성공하면 0으로)
    aborted = False
    for c, filings in _iter_filings(companies, bgn_de, end_de):
        if aborted:
            break
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
            # 재시도 건은 건너뛴다 — 자기 자신이 걸려서 영영 스킵되기 때문이다.
            if not args.dry_run and rcept_no not in retryable:
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
                # 내용 점검(숫자 대조) 게이트는 제거했다 — 오탐으로 멀쩡한 기사가 통째로
                # 템플릿이 되는 손해가 더 컸다(2026-09-05 사용자 결정). 이제 생성만 되면
                # 그대로 싣는다. 남은 건 투자권유 표현 경고뿐이고, 이건 폴백시키지 않고
                # 로그로만 남긴다(사실 서술과 판단을 가르는 규제 이슈라 신호는 남겨둔다).
                warn = v.check_recommend(title + "\n" + body)
                if warn:
                    print(f"  ⚠ 투자권유 표현 감지(그대로 저장): {', '.join(warn)}")
                gen_fail_streak = 0
            else:
                fallback_reason = ("생성 실패: "
                                   + (generate.LAST_ERROR.get("reason") or "사유 미상"))[:500]
                gen_fail_streak += 1
                print(f"  생성 실패 → 템플릿 폴백 (연속 {gen_fail_streak}건)")
                # 한도 소진으로 판단되면 '저장하지 않고' 중단한다. 저장을 건너뛰어야
                # rcept_no가 안 남고, 그래야 다음 실행이 이 공시를 다시 집는다.
                if gen_fail_streak >= GEN_FAIL_STOP:
                    print(f"\n⚠ 연속 {GEN_FAIL_STOP}건 생성 실패 — 한도 소진으로 보고 중단합니다.")
                    print("   저장하지 않았으므로 남은 공시는 다음 실행이 다시 시도합니다.")
                    aborted = True
                    break
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

            old_id = retryable.pop(rcept_no, None)
            if old_id is not None:
                # 재시도 건 — 새로 넣지 않고 기존 행의 본문만 갈아끼운다.
                # notified_at은 건드리지 않는다: 이미 다이제스트로 나간 기사를 다시 보내지 않는다.
                patch = {"title": title, "body": body, "is_fallback": is_fallback}
                if has_reason_col:
                    patch["fallback_reason"] = fallback_reason
                sb.table("company_news").update(patch).eq("id", old_id).execute()
                row_id = old_id
                label = "재작성"
            else:
                row_id = sb.table("company_news").insert(payload).execute().data[0]["id"]
                label = "저장"
            existing.add(rcept_no)
            made += 1
            print(f"  {label} 완료 (id {row_id}){' [폴백]' if is_fallback else ''}")

    print(f"\n완료: 뉴스 {made}건 생성")

    # 건별 발송 대신 하루 한 통 — 이번에 만든 기사들을 회원별로 묶어 다이제스트 발송
    if made > 0 and not args.no_notify and not args.dry_run:
        trigger_digest()

    # 한도 소진(연속 생성 실패)으로 중단된 경우 종료 코드를 실패로 만든다.
    # 그동안은 이 상태로도 "성공"이 떠서, claude -p 인증(토큰 만료 등)이 깨져도
    # 3일 넘게 아무도 못 알아챈 사고가 있었다(2026-09-02~09-04, 매일 0건 생성했는데도
    # 워크플로가 계속 success로 표시됨). GitHub Actions가 빨간 X로 보여주고,
    # 옵션에 따라 알림(이메일 등)도 뜨게 하려면 실패로 끝나야 한다.
    if aborted:
        print("::error::뉴스룸 생성이 한도 소진(또는 인증 실패)으로 중단됐습니다. "
              "claude -p 인증(CLAUDE_CODE_OAUTH_TOKEN)이 유효한지, 사용량 한도를 넘지 않았는지 확인하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
