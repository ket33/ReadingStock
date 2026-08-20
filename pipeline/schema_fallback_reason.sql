-- =====================================================================
-- schema_fallback_reason.sql — 폴백 사유 기록 컬럼
-- Supabase → SQL Editor → New query → 붙여넣기 → Run (1회)
--
-- 왜 필요한가: company_news에는 is_fallback(폴백이었다)만 남고 '왜'는 안 남는다.
-- 그래서 원인을 알려면 공시를 골라 build_facts→generate→validate를 통째로 다시
-- 돌려봐야 했다(실측: 표본 20건 재현에 claude 호출 20회). 사유를 남겨두면
-- 쿼리 한 번으로 분포가 나오고, 검증기를 손볼 때 효과를 바로 잴 수 있다.
--
-- ※ 이 SQL을 안 돌려도 파이프라인은 그대로 동작한다.
--    run.py가 컬럼 존재 여부를 먼저 확인하고 없으면 이 필드 없이 저장한다.
-- =====================================================================

alter table company_news
  add column if not exists fallback_reason text;

comment on column company_news.fallback_reason is
  '폴백 사유. 검증 실패면 위반 내역("사실 원장에 없는 숫자: 3,960" 등), '
  '생성 실패면 그 사유. 정상 생성된 기사는 null.';

-- 사유 분포 확인용 (참고)
--   select fallback_reason, count(*)
--   from company_news where is_fallback
--   group by 1 order by 2 desc;
