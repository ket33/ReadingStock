-- =====================================================================
-- watchlists 지표 필터 저장 — metric_cols 컬럼
-- 실행 방법: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
--
-- 워치리스트마다 '표에 넣을 지표(필터)'를 각자 기억한다.
--   null      = 아직 손대지 않음 → 기본값(PER·영업이익률·ROE)으로 보여줌
--   text[]    = 사용자가 고른 지표 키 목록 (빈 배열이면 추가 지표 없음)
-- 사용자가 바꾸기 전엔 그대로 유지된다.
-- =====================================================================

alter table public.watchlists
  add column if not exists metric_cols text[];

-- 확인: select id, name, metric_cols from watchlists;
