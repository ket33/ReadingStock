-- =====================================================================
-- 워치리스트 다중화 + 구성비율 + 시장지표 테이블
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- (여러 번 실행해도 안전하게 작성됨)
-- =====================================================================

-- ── 1) watchlists — 사용자별 워치리스트(이름 있는 목록 여러 개) ──────
create table if not exists public.watchlists (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.watchlists enable row level security;

drop policy if exists "watchlists_select_own" on public.watchlists;
create policy "watchlists_select_own" on public.watchlists
  for select using (auth.uid() = user_id);

drop policy if exists "watchlists_insert_own" on public.watchlists;
create policy "watchlists_insert_own" on public.watchlists
  for insert with check (auth.uid() = user_id);

drop policy if exists "watchlists_update_own" on public.watchlists;
create policy "watchlists_update_own" on public.watchlists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watchlists_delete_own" on public.watchlists;
create policy "watchlists_delete_own" on public.watchlists
  for delete using (auth.uid() = user_id);

-- ── 2) watchlist(종목 행)에 리스트 소속 + 구성비율 추가 ──────────────
alter table public.watchlist
  add column if not exists list_id bigint references public.watchlists (id) on delete cascade;
alter table public.watchlist
  add column if not exists weight numeric check (weight is null or weight > 0);
comment on column public.watchlist.weight is '구성비율(%). null이면 동일가중';

-- 같은 종목을 리스트마다 담을 수 있도록: (user, 종목) 유니크 → (리스트, 종목) 유니크
alter table public.watchlist drop constraint if exists watchlist_user_id_stock_code_key;
create unique index if not exists watchlist_list_stock_uniq
  on public.watchlist (list_id, stock_code);

-- 비중 수정용 UPDATE 정책 (기존엔 추가/삭제만 있었음)
drop policy if exists "watchlist_update_own" on public.watchlist;
create policy "watchlist_update_own" on public.watchlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3) 기존 데이터 마이그레이션 ──────────────────────────────────────
-- 이미 종목을 담아둔 사용자마다 '내 워치리스트'를 만들어 기존 종목을 소속시킨다
insert into public.watchlists (user_id, name)
select distinct w.user_id, '내 워치리스트'
from public.watchlist w
where w.list_id is null
  and not exists (select 1 from public.watchlists l where l.user_id = w.user_id);

update public.watchlist w
set list_id = l.id
from public.watchlists l
where w.list_id is null and l.user_id = w.user_id;

-- ── 4) market_indices — 시장지표 일별 종가 (성과 비교용, 공개 읽기) ──
create table if not exists public.market_indices (
  index_code  text not null,      -- 'KS11'(코스피) 'KQ11'(코스닥) 'US500'(S&P500) 'IXIC'(나스닥)
  date        date not null,
  close       numeric,
  primary key (index_code, date)
);
-- 새 테이블은 RLS가 자동으로 켜져 있을 수 있음 → 누구나 읽기 정책을 명시 (개인 데이터 아님)
alter table public.market_indices enable row level security;
drop policy if exists "market_indices_public_read" on public.market_indices;
create policy "market_indices_public_read" on public.market_indices
  for select using (true);

-- =====================================================================
-- 확인용: 아래 결과에 watchlists 정책 4개, watchlist에 update 정책이 보여야 정상
-- =====================================================================
select tablename, policyname, cmd from pg_policies
where tablename in ('watchlists', 'watchlist')
order by tablename, cmd;
