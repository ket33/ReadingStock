-- =====================================================================
-- user_metric_prefs — 회원별 '종목 페이지에 표시할 지표' 설정 + RLS (본인 것만)
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- =====================================================================

-- 1) 테이블 — 회원 1명당 1행. metric_keys는 표시할 지표 키의 '순서 있는' 배열.
create table if not exists public.user_metric_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  metric_keys text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

-- 2) RLS 켜기
alter table public.user_metric_prefs enable row level security;

-- 3) 본인 것만: 조회 / 추가 / 수정 (삭제는 불필요 — 항상 1행 upsert)
drop policy if exists "ump_select_own" on public.user_metric_prefs;
create policy "ump_select_own" on public.user_metric_prefs
  for select using (auth.uid() = user_id);

drop policy if exists "ump_insert_own" on public.user_metric_prefs;
create policy "ump_insert_own" on public.user_metric_prefs
  for insert with check (auth.uid() = user_id);

drop policy if exists "ump_update_own" on public.user_metric_prefs;
create policy "ump_update_own" on public.user_metric_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- 확인용 (정책 3개가 보이면 정상)
-- =====================================================================
select policyname, cmd from pg_policies where tablename = 'user_metric_prefs';
