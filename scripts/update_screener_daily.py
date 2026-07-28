"""
update_screener_daily.py — 스크리너 스냅샷 일일 갱신 (GitHub Actions 크론용)
=====================================================
계산은 전부 DB 안의 refresh_screener()가 한다 (sql/scale_2500.sql).
  - 최신 metrics 행 복사 + 현재가 환산 + 수익률 + 홈 카드 컬럼(산업그룹·발췌문·셔플)
  - 이 스크립트는 rpc 한 번만 호출 — 데이터가 앱을 오가지 않아 종목 수와 무관하게 초 단위.

(이전 버전은 종목마다 전체 주가 이력을 다시 받아왔다: 94종목 = 22만 행.
 2,500종목이면 600만 행 ≈ 900MB·100분이라 Actions 10분 타임아웃에 죽는 구조였다.)

이 스크립트가 직접 하는 일은 하나뿐:
  articles.excerpt 백필 — 분석글 섹션1 첫 문단 발췌 (홈 카드 미리보기용).
  마크다운 처리라 파이썬에 두고, excerpt가 비어 있는 글만 골라 채운다(멱등).
  refresh_screener()가 이 값을 screener.excerpt로 복사하므로 rpc보다 먼저 실행한다.

metrics 자체(TTM 지표)는 분기 공시가 떠야 바뀌므로 여기서 재계산하지 않는다
— 새 분기 반영은 루트 파이프라인(run_all.py) 소관.

필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
로컬 실행:  python scripts/update_screener_daily.py
"""
import os
import re
import sys

from supabase import create_client


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.")
    for suffix in ("/rest/v1", "/rest"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return create_client(url, key)


def extract_section1(body: str):
    """분석글에서 섹션 1의 첫 문단을 순수 텍스트로 발췌 (web/lib 기존 로직 포팅)."""
    if not body:
        return None
    # "## 1. …" 또는 "**1. …**" 헤딩 뒤부터
    m = re.search(r"(?:^|\n)(?:#{1,3}\s*|\*\*)\s*1\.\s[^\n]*\n+", body)
    if not m:
        return None
    rest = body[m.end():]
    para = re.split(r"\n\s*\n", rest)[0] or ""
    text = re.sub(r"[〔\[]\s*차트[^〕\]]*[〕\]]", "", para)   # 차트 마커 제거
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)             # 볼드 기호 제거
    text = re.sub(r"\*([^*]+)\*", r"\1", text)                 # 이탤릭 기호 제거
    text = re.sub(r"^#+\s*", "", text, flags=re.M)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def backfill_excerpts(client) -> int:
    """excerpt가 비어 있는 분석글만 발췌해 채운다. 반환: 채운 글 수."""
    filled = 0
    while True:
        # 채운 행은 is null 조건에서 빠지므로 같은 조건을 반복 조회하면 전량 커버
        # (PostgREST 요청당 1,000행 캡과 무관하게 동작)
        rows = (client.table("articles").select("id,body")
                .is_("excerpt", "null").limit(200).execute().data)
        if not rows:
            break
        for r in rows:
            text = extract_section1(r.get("body") or "")
            # 발췌 실패 글은 빈 문자열로 표시해 매번 재시도하지 않게 한다 (null과 구분)
            client.table("articles").update({"excerpt": text or ""}).eq("id", r["id"]).execute()
            filled += 1
    return filled


def main():
    client = get_client()

    n_excerpt = backfill_excerpts(client)
    if n_excerpt:
        print(f"articles.excerpt 백필: {n_excerpt}건")

    res = client.rpc("refresh_screener").execute()
    print(f"완료: screener {res.data}종목 갱신 (DB 내 일괄 계산)")


if __name__ == "__main__":
    main()
