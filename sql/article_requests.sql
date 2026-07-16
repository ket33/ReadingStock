-- =====================================================================
-- article_requests — 분석글 작성 요청 테이블 + RLS (본인 것만 접근)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣기 → Run
--
-- 두 가지 요청 형태:
--   ① stock_code 요청  — 종목은 있는데 분석글이 아직 없는 경우 (종목 페이지에서)
--   ② company_query 요청 — 검색해도 종목 자체가 없는 경우 (검색창에서, 입력어 그대로 저장)
-- 알림 발송은 서버(service_role)가 처리하므로 UPDATE 정책은 만들지 않는다.
-- =====================================================================

-- 1) 테이블
create table if not exists public.article_requests (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  stock_code     text references public.companies (stock_code),  -- ①일 때만
  company_query  text,                                           -- ②일 때만 (사용자 입력어)
  status         text not null default 'pending',                -- 'pending' | 'sent'
  created_at     timestamptz not null default now(),
  notified_at    timestamptz,
  -- 둘 중 하나는 반드시 있어야 한다
  check (stock_code is not null or company_query is not null)
);

-- 같은 사용자가 같은 대상을 '대기 중' 상태로 중복 요청하는 것만 막는다
-- (알림을 받은 뒤 새 글을 다시 요청하는 것은 허용)
create unique index if not exists uq_req_pending_stock
  on public.article_requests (user_id, stock_code)
  where stock_code is not null and status = 'pending';
create unique index if not exists uq_req_pending_query
  on public.article_requests (user_id, lower(company_query))
  where company_query is not null and status = 'pending';

-- 알림 배치가 '대기 중' 요청을 빨리 찾도록
create index if not exists idx_req_pending
  on public.article_requests (status, created_at)
  where status = 'pending';

-- 2) RLS 켜기 — 정책 없는 접근은 전부 차단됨
alter table public.article_requests enable row level security;

-- 3) 본인 것만: 조회
drop policy if exists "article_requests_select_own" on public.article_requests;
create policy "article_requests_select_own"
  on public.article_requests for select
  using (auth.uid() = user_id);

-- 4) 본인 것만: 추가 (남의 user_id로 insert 불가)
drop policy if exists "article_requests_insert_own" on public.article_requests;
create policy "article_requests_insert_own"
  on public.article_requests for insert
  with check (auth.uid() = user_id);

-- 5) 본인 것만: 삭제 (요청 취소)
drop policy if exists "article_requests_delete_own" on public.article_requests;
create policy "article_requests_delete_own"
  on public.article_requests for delete
  using (auth.uid() = user_id);

-- UPDATE 정책은 의도적으로 없음 — status 변경은 서버(service_role)만 한다

-- =====================================================================
-- 확인용 쿼리 (실행 후 아래를 돌려보면 정책 3개가 보여야 정상)
-- =====================================================================
select policyname, cmd
from pg_policies
where tablename = 'article_requests';

-- 기대 결과:
--   article_requests_select_own | SELECT
--   article_requests_insert_own | INSERT
--   article_requests_delete_own | DELETE
