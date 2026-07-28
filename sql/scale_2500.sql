-- ============================================================
-- 2,500종목 · 동시접속 1만명 대응 마이그레이션
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전 (IF NOT EXISTS / OR REPLACE)
--
-- 무엇을 바꾸나:
--   1) screener 표에 홈 카드용 컬럼 4개 추가 → 홈이 표 하나만 읽으면 되게
--   2) 홈·스크리너 정렬용 인덱스 → 서버 페이징이 인덱스를 타게
--   3) financials 필터용 인덱스 → 현재 3초 타임아웃 나는 스캔 제거
--   4) screener_returns() 함수 → 수익률 계산을 DB 안에서 (배치가 600만행 받던 걸 대체)
-- ============================================================


-- ── 1. screener 확장 ────────────────────────────────────────
-- 홈 종목 카드가 필요로 하는 값을 전부 screener 한 줄에 모은다.
-- 지금은 홈이 companies + screener + financials + articles + prices(종목당 1회)를
-- 따로 읽어 조립하는데, 2,500종목이면 이 조립 자체가 불가능해진다.
alter table screener add column if not exists industry_group    text;
alter table screener add column if not exists excerpt           text;
alter table screener add column if not exists latest_article_at timestamptz;
alter table screener add column if not exists shuffle           int;

comment on column screener.industry_group is
    '산업 그룹 분류 primary 그룹명 — 홈 카드 배지용 (company_groups 조인 대체)';
comment on column screener.excerpt is
    '최신 분석글 섹션1 첫 문단 발췌 — 홈 카드 3줄 미리보기용 (articles.body 전량 조회 대체)';
comment on column screener.latest_article_at is
    '최신 분석글 발간 시각 — 홈 "최신순" 정렬용';
comment on column screener.shuffle is
    '홈 "랜덤" 정렬용 난수. 일일 배치가 매번 새로 뿌린다 (SQL에서 페이징 가능한 랜덤 정렬)';


-- ── 2. 홈·스크리너 정렬 인덱스 ──────────────────────────────
-- 서버 페이징은 order + range로 도는데, 인덱스가 없으면 2,500행을 매번 정렬한다.
-- NULLS LAST를 인덱스 정의에 맞춰야 실제로 인덱스를 탄다 (쿼리도 동일하게 맞출 것).
create index if not exists idx_screener_mcap
    on screener (market_cap desc nulls last);
create index if not exists idx_screener_latest_article
    on screener (latest_article_at desc nulls last);
create index if not exists idx_screener_shuffle
    on screener (shuffle);

-- 검색: 종목명 부분일치(ilike '%x%')를 인덱스로 태우려면 pg_trgm이 필요하다.
-- 환경에 따라 확장 설치가 막혀 있을 수 있는데, SQL Editor는 스크립트 전체를 한 트랜잭션으로
-- 돌려서 여기서 실패하면 위의 중요한 변경까지 통째로 롤백된다. 그래서 실패를 삼킨다.
-- (없어도 동작한다 — 2,500행 순차 스캔은 수 ms라 당장은 인덱스 없이도 충분하다)
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists idx_screener_name_trgm
      on screener using gin (name gin_trgm_ops);
  create index if not exists idx_listed_name_trgm
      on listed_companies using gin (name gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm 검색 인덱스 건너뜀 (%). 검색은 인덱스 없이도 동작합니다.', sqlerrm;
end $$;


-- ── 3. financials 필터 인덱스 ───────────────────────────────
-- 현재 account_std/statement/period로 거르는 쿼리에 인덱스가 없어 500K행을 순차 스캔한다.
-- (실측: 익명 롤 3초 statement timeout에 걸려 500 반환. 2,500종목이면 10.6M행 → 20배)
-- CONCURRENTLY는 트랜잭션 블록에서 못 써서 일반 create로 둔다. 지금 크기(50만행)면 수 초.
create index if not exists idx_fin_account
    on financials (account_std, statement, period)
    where account_std is not null;

-- 재무제표 탭이 쓰는 '미매핑 원본 계정' 경로 — account_std IS NULL 쪽.
create index if not exists idx_fin_unmapped
    on financials (stock_code, fiscal_year, statement)
    where account_std is null;


-- ── 4. 수익률 계산을 DB 안으로 ──────────────────────────────
-- 지금 update_screener_daily.py는 종목마다 전체 주가 이력을 페이징해서 받아온다.
--   94종목  = 22만행 다운로드
--   2,500종목 = 600만행 ≈ 900MB, 순차 실행 100분 → Actions 10분 타임아웃에 죽음
-- 이 함수는 같은 계산을 DB 안에서 하고 종목당 한 줄만 돌려준다 (호출 1회).
--
-- 전부 (stock_code, date desc) 인덱스를 타는 lateral 조회라
-- 2,500종목 × 11회 = 약 27,500번 인덱스 룩업으로 끝난다.

-- 등락률 헬퍼: 기준가가 없거나 0 이하면 NULL (감자·데이터 결손 방어)
create or replace function public.pct_change(base numeric, cur numeric)
returns numeric
language sql
immutable
as $$
  select case
    when base is null or cur is null or base <= 0 then null
    else round((cur / base - 1) * 100, 2)
  end;
$$;

create or replace function public.screener_returns()
returns table (
  stock_code  text,
  price       numeric,
  price_date  date,
  market_cap  numeric,
  ret_1d      numeric,
  ret_5d      numeric,
  ret_1m      numeric,
  ret_3m      numeric,
  ret_6m      numeric,
  ret_ytd     numeric,
  ret_1y      numeric,
  ret_5y      numeric,
  ret_10y     numeric
)
language sql
stable
as $$
  select
    c.stock_code,
    l.close                              as price,
    l.date                               as price_date,
    l.market_cap,
    public.pct_change(d1.close,  l.close) as ret_1d,
    public.pct_change(d5.close,  l.close) as ret_5d,
    public.pct_change(m1.close,  l.close) as ret_1m,
    public.pct_change(m3.close,  l.close) as ret_3m,
    public.pct_change(m6.close,  l.close) as ret_6m,
    public.pct_change(ytd.close, l.close) as ret_ytd,
    public.pct_change(y1.close,  l.close) as ret_1y,
    public.pct_change(y5.close,  l.close) as ret_5y,
    public.pct_change(y10.close, l.close) as ret_10y
  from companies c
  -- 최신 거래일 (거래정지로 오래 비어 있어도 그대로 잡힌다)
  left join lateral (
    select p.date, p.close, p.market_cap from prices p
    where p.stock_code = c.stock_code and p.close is not null
    order by p.date desc limit 1
  ) l on true
  -- 거래일 offset: 1일 전 / 5일 전 (달력이 아니라 '직전 거래일' 기준)
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
    order by p.date desc offset 1 limit 1
  ) d1 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
    order by p.date desc offset 5 limit 1
  ) d5 on true
  -- 달력 기준: 기준일 이하의 가장 최근 종가 (휴장일이면 그 앞 거래일)
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '30 day'
    order by p.date desc limit 1
  ) m1 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '91 day'
    order by p.date desc limit 1
  ) m3 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '182 day'
    order by p.date desc limit 1
  ) m6 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= make_date(extract(year from l.date)::int - 1, 12, 31)
    order by p.date desc limit 1
  ) ytd on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '365 day'
    order by p.date desc limit 1
  ) y1 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '1826 day'
    order by p.date desc limit 1
  ) y5 on true
  left join lateral (
    select p.close from prices p
    where p.stock_code = c.stock_code and p.close is not null
      and p.date <= l.date - interval '3652 day'
    order by p.date desc limit 1
  ) y10 on true
  where l.date is not null;
$$;

-- 배치(service_role)만 쓰면 되지만, 익명 읽기도 열어두면 웹에서 직접 검증할 수 있다.
grant execute on function public.screener_returns() to anon, authenticated, service_role;
grant execute on function public.pct_change(numeric, numeric) to anon, authenticated, service_role;


-- ── 5. 스크리너 갱신 전체를 DB 안에서 ───────────────────────
-- update_screener_daily.py가 하던 일(최신 metrics 복사 + 현재가 환산 + 수익률)을
-- 한 번의 함수 호출로 끝낸다. 데이터가 앱을 오가지 않으니 종목 수가 늘어도 초 단위.
-- 파이썬 배치는 rpc('refresh_screener') 한 줄만 호출한다.

-- 분석글에 발췌문 저장 (홈 카드 미리보기용 — 배치가 body에서 추출해 채운다)
alter table articles add column if not exists excerpt text;
comment on column articles.excerpt is
    '섹션1 첫 문단 발췌 — 홈 카드 미리보기용. update_screener_daily.py가 null인 행만 채움';

-- 현재가 환산 헬퍼: scale이 없으면(기간말 종가 결손) 원값 유지 — 기존 파이썬과 동일
create or replace function public._scale_mult(v numeric, s numeric)
returns numeric language sql immutable
as $$ select case when v is null or s is null then v else round(v * s, 2) end $$;

create or replace function public._scale_div(v numeric, s numeric)
returns numeric language sql immutable
as $$ select case when v is null or s is null or s = 0 then v else round(v / s, 2) end $$;

create or replace function public.refresh_screener()
returns int
language plpgsql
as $$
declare n int;
begin
  -- 명부에서 빠진 회사의 스냅샷 제거 (상장폐지 등)
  delete from screener s
  where not exists (select 1 from companies c where c.stock_code = s.stock_code);

  with m2 as (
    -- 각 metrics 행의 '기간말' 날짜 (1Q=3/31, 2Q=6/30, 3Q=9/30, 4Q·FY=12/31)
    select m.*,
      make_date(m.fiscal_year,
        case m.period when '1Q' then 3 when '2Q' then 6 when '3Q' then 9 else 12 end,
        case m.period when '1Q' then 31 when '2Q' then 30 when '3Q' then 30 else 31 end
      ) as period_end
    from metrics m
  ),
  latest as (
    -- 종목별 기간말이 가장 최근인 행 (동일 기간말이면 FY 우선 — 기존 파이썬과 동일)
    select distinct on (stock_code) *
    from m2
    order by stock_code, period_end desc, (period = 'FY') desc
  ),
  rets as (
    select * from public.screener_returns()
  ),
  asof as (
    -- 지표 기간말 시점의 종가 (밸류에이션 현재가 환산 기준)
    select l.stock_code, p.close as asof_close
    from latest l
    left join lateral (
      select close from prices p
      where p.stock_code = l.stock_code and p.close is not null
        and p.date <= l.period_end
      order by p.date desc limit 1
    ) p on true
  ),
  grp as (
    -- 산업 그룹 분류 primary 그룹명 (홈 카드 배지용)
    select distinct on (cg.company_id) cg.company_id, ig.name
    from company_groups cg
    join industry_groups ig on ig.id = cg.group_id
    where cg.is_primary
    order by cg.company_id
  ),
  art as (
    -- 종목별 최신 분석글 (발간시각·발췌문)
    select distinct on (stock_code) stock_code, created_at, excerpt
    from articles
    order by stock_code, created_at desc
  ),
  sc as (
    select l.stock_code,
      case when r.price is not null and a.asof_close is not null and a.asof_close > 0
           then r.price / a.asof_close end as scale
    from latest l
    join rets r on r.stock_code = l.stock_code
    left join asof a on a.stock_code = l.stock_code
  )
  insert into screener (
    stock_code, name, market, sector,
    price, price_date, market_cap, based_on,
    per, pbr, price_sales, price_ocf, price_fcf, div_yield,
    eps, gross_margin, op_margin, net_margin, fcf_margin, ocf_margin,
    roe, roa, roce,
    revenue, net_income, op_income, ocf, fcf, dividends_paid,
    revenue_growth, earnings_growth,
    revenue_growth_3y, revenue_growth_5y, earnings_growth_3y, earnings_growth_5y,
    payout, fcf_yield, ocf_ni,
    current_ratio, debt_equity, debt_assets, interest_cov,
    retention, capex_sales, rnd_intensity, sga_sales,
    asset_turn, ppe_turn, inv_turn, recv_turn, wc_turn,
    ret_1d, ret_5d, ret_1m, ret_3m, ret_6m, ret_ytd, ret_1y, ret_5y, ret_10y,
    industry_group, excerpt, latest_article_at, shuffle, updated_at
  )
  select
    c.stock_code, c.name, c.market, c.sector,
    r.price, r.price_date, r.market_cap,
    format('%s %s%s × %s 주가',
           l.fiscal_year, l.period,
           case when l.period = 'FY' then '' else ' TTM' end, r.price_date)
      || case when s.scale is null then ' (환산 불가: 기간말 종가 없음)' else '' end,
    -- 가격이 분자인 지표는 × scale, 분모인 지표는 ÷ scale (기존 파이썬과 동일)
    public._scale_mult(l.per, s.scale), public._scale_mult(l.pbr, s.scale),
    public._scale_mult(l.price_sales, s.scale), public._scale_mult(l.price_ocf, s.scale),
    public._scale_mult(l.price_fcf, s.scale),
    public._scale_div(l.div_yield, s.scale),
    l.eps, l.gross_margin, l.op_margin, l.net_margin, l.fcf_margin, l.ocf_margin,
    l.roe, l.roa, l.roce,
    l.revenue, l.net_income, l.op_income, l.ocf, l.fcf, l.dividends_paid,
    l.revenue_growth, l.earnings_growth,
    l.revenue_growth_3y, l.revenue_growth_5y, l.earnings_growth_3y, l.earnings_growth_5y,
    l.payout, public._scale_div(l.fcf_yield, s.scale), l.ocf_ni,
    l.current_ratio, l.debt_equity, l.debt_assets, l.interest_cov,
    l.retention, l.capex_sales, l.rnd_intensity, l.sga_sales,
    l.asset_turn, l.ppe_turn, l.inv_turn, l.recv_turn, l.wc_turn,
    r.ret_1d, r.ret_5d, r.ret_1m, r.ret_3m, r.ret_6m, r.ret_ytd,
    r.ret_1y, r.ret_5y, r.ret_10y,
    g.name, ar.excerpt, ar.created_at,
    floor(random() * 1000000)::int,   -- 홈 '랜덤' 정렬용 — 갱신마다 새 순서
    now()
  from companies c
  join latest l on l.stock_code = c.stock_code   -- 지표 없는 신규 종목은 건너뜀(기존과 동일)
  join rets r  on r.stock_code = c.stock_code    -- 주가 없는 종목도 건너뜀
  join sc s    on s.stock_code = c.stock_code
  left join grp g  on g.company_id = c.stock_code
  left join art ar on ar.stock_code = c.stock_code
  on conflict (stock_code) do update set
    name = excluded.name, market = excluded.market, sector = excluded.sector,
    price = excluded.price, price_date = excluded.price_date,
    market_cap = excluded.market_cap, based_on = excluded.based_on,
    per = excluded.per, pbr = excluded.pbr, price_sales = excluded.price_sales,
    price_ocf = excluded.price_ocf, price_fcf = excluded.price_fcf,
    div_yield = excluded.div_yield, eps = excluded.eps,
    gross_margin = excluded.gross_margin, op_margin = excluded.op_margin,
    net_margin = excluded.net_margin, fcf_margin = excluded.fcf_margin,
    ocf_margin = excluded.ocf_margin, roe = excluded.roe, roa = excluded.roa,
    roce = excluded.roce, revenue = excluded.revenue, net_income = excluded.net_income,
    op_income = excluded.op_income, ocf = excluded.ocf, fcf = excluded.fcf,
    dividends_paid = excluded.dividends_paid,
    revenue_growth = excluded.revenue_growth, earnings_growth = excluded.earnings_growth,
    revenue_growth_3y = excluded.revenue_growth_3y,
    revenue_growth_5y = excluded.revenue_growth_5y,
    earnings_growth_3y = excluded.earnings_growth_3y,
    earnings_growth_5y = excluded.earnings_growth_5y,
    payout = excluded.payout, fcf_yield = excluded.fcf_yield, ocf_ni = excluded.ocf_ni,
    current_ratio = excluded.current_ratio, debt_equity = excluded.debt_equity,
    debt_assets = excluded.debt_assets, interest_cov = excluded.interest_cov,
    retention = excluded.retention, capex_sales = excluded.capex_sales,
    rnd_intensity = excluded.rnd_intensity, sga_sales = excluded.sga_sales,
    asset_turn = excluded.asset_turn, ppe_turn = excluded.ppe_turn,
    inv_turn = excluded.inv_turn, recv_turn = excluded.recv_turn,
    wc_turn = excluded.wc_turn,
    ret_1d = excluded.ret_1d, ret_5d = excluded.ret_5d, ret_1m = excluded.ret_1m,
    ret_3m = excluded.ret_3m, ret_6m = excluded.ret_6m, ret_ytd = excluded.ret_ytd,
    ret_1y = excluded.ret_1y, ret_5y = excluded.ret_5y, ret_10y = excluded.ret_10y,
    industry_group = excluded.industry_group, excerpt = excluded.excerpt,
    latest_article_at = excluded.latest_article_at, shuffle = excluded.shuffle,
    updated_at = excluded.updated_at;

  get diagnostics n = row_count;
  return n;
end $$;

-- 쓰기 함수 — 배치(service_role) 전용. 익명에는 열지 않는다.
revoke execute on function public.refresh_screener() from public, anon, authenticated;
grant execute on function public.refresh_screener() to service_role;

-- Supabase는 롤별 statement timeout이 있다 (실측: 익명 3초).
-- 2,500종목 규모의 refresh_screener()는 수십 초가 걸릴 수 있어 배치 롤만 상향한다.
-- (권한 구성에 따라 실패할 수 있어 격리 — 실패해도 나머지 마이그레이션은 유지)
do $$
begin
  alter role service_role set statement_timeout = '10min';
exception when others then
  raise notice 'service_role timeout 상향 건너뜀 (%). refresh가 타임아웃 나면 Dashboard에서 상향하세요.', sqlerrm;
end $$;


-- ============================================================
-- 실행 후 확인:
--   select count(*) from screener_returns();          -- 종목 수만큼 나오면 정상
--   select * from screener_returns() limit 5;
--   \di+ screener*                                    -- 인덱스 생성 확인
-- ============================================================
