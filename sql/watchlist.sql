-- =====================================================================
-- watchlist — 회원 관심종목 테이블 + RLS (본인 것만 접근)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- =====================================================================

-- 1) 테이블
create table if not exists public.watchlist (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  stock_code  text not null references public.companies (stock_code),
  created_at  timestamptz not null default now(),
  unique (user_id, stock_code)          -- 같은 종목 중복 담기 방지
);

-- 2) RLS 켜기 — 정책 없는 접근은 전부 차단됨
alter table public.watchlist enable row level security;

-- 3) 본인 것만: 조회
drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own"
  on public.watchlist for select
  using (auth.uid() = user_id);

-- 4) 본인 것만: 추가 (남의 user_id로 insert 불가)
drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

-- 5) 본인 것만: 삭제
drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own"
  on public.watchlist for delete
  using (auth.uid() = user_id);

-- UPDATE 정책은 의도적으로 만들지 않음 (추가/삭제만 있는 기능 — 지시서)

-- =====================================================================
-- 확인용 쿼리 (실행 후 아래를 돌려보면 정책 3개가 보여야 정상)
-- =====================================================================
select policyname, cmd
from pg_policies
where tablename = 'watchlist';

-- 기대 결과:
--   watchlist_select_own | SELECT
--   watchlist_insert_own | INSERT
--   watchlist_delete_own | DELETE
