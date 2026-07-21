-- =====================================================================
-- watchlists 링크 공유 — share_token 컬럼
-- 실행 방법: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
--
-- 소유자가 '공유' 누르면 임의 토큰이 생기고, /w/{token} 링크를 아는 사람은
-- 읽기 전용으로 볼 수 있다. 공개 페이지는 서버가 service_role로 토큰 조회하므로
-- (RLS 우회) 별도 공개 정책이 필요 없다 — 토큰을 모르면 접근 불가.
-- =====================================================================

alter table public.watchlists
  add column if not exists share_token text unique;

-- 확인: select id, name, share_token from watchlists;
