-- =====================================================================
-- company_news — 뉴스룸 (공시 해설 기사) 테이블
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣기 → Run
--
-- 파이썬 파이프라인(news/run.py)이 DART 공시를 감지해 해설 기사를 생성·저장하고,
-- 웹 개별종목페이지 '뉴스룸' 탭이 읽는다. 쓰기는 service_role만, 읽기는 공개.
-- =====================================================================

-- 1) 테이블
create table if not exists public.company_news (
  id            bigint generated always as identity primary key,
  stock_code    text not null references public.listed_companies (stock_code),
  rcept_no      text not null unique,        -- DART 접수번호 (중복 생성 방지 열쇠)
  report_nm     text not null,               -- 원본 보고서명
  category      text not null,               -- 'earnings'|'contract'|'invest'|'capital'|'shareholder'|'structure'|'risk'|'governance'
  type_key      text not null,               -- 유형별 지침 키 (supply_contract 등)
  title         text not null,               -- 헤드라인 (이메일 제목 겸용)
  body          text not null,               -- 기사 본문 (마크다운)
  dart_url      text not null,               -- 공시 원문 뷰어 링크
  is_fallback   boolean not null default false, -- 검증 실패로 템플릿 폴백된 글인지
  published_at  timestamptz not null,        -- 공시 접수 시각
  notified_at   timestamptz,                 -- 워치리스트 이메일 발송 완료 시각 (백필분은 null 유지)
  created_at    timestamptz not null default now()
);

create index if not exists idx_news_stock
  on public.company_news (stock_code, published_at desc);

-- 같은 사건의 후속·정정 공시 중복 방지 조회용
create index if not exists idx_news_dedupe
  on public.company_news (stock_code, type_key, published_at desc);

-- 2) RLS — 뉴스는 공개 콘텐츠. 읽기 전체 허용, 쓰기는 service_role만
alter table public.company_news enable row level security;
drop policy if exists "company_news_read_all" on public.company_news;
create policy "company_news_read_all"
  on public.company_news for select
  using (true);

-- 확인: select count(*) from company_news;  → 0이면 정상 (파이프라인이 채움)
