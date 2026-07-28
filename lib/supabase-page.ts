// PostgREST 요청당 행 캡(기본 1,000행) 우회용 페이징 헬퍼.
//
// 왜 필요한가: `.select()`에 limit을 안 걸거나 limit(10000)을 걸어도 PostgREST는
// 서버 설정값(db.max_rows, 기본 1,000)에서 잘라서 돌려준다. 에러가 아니라 '조용히 잘림'이라
// 종목이 1,000개를 넘는 순간 홈·사이트맵·스크리너가 말없이 일부만 보여주게 된다.
// (실측: listed_companies 2,652행을 limit 없이 select → 1,000행만 반환)
//
// 쓰는 곳은 '정말 전량이 필요한' 경로로 한정한다 — 사이트맵, 배치성 집계 등.
// 사용자 화면은 전량을 받는 대신 서버 페이징/슬림 컬럼으로 가는 게 원칙이다.

/** 한 번에 가져올 행 수. PostgREST 캡(1,000)과 같거나 작아야 한다. */
const PAGE = 1000;

/**
 * `.range()`로 끝까지 훑어 전체 행을 모은다.
 *
 * @param build  offset/limit을 받아 쿼리를 만들어 주는 함수.
 *               호출할 때마다 새 빌더를 만들어야 한다(빌더는 재사용 불가).
 * @param maxRows 안전장치 — 이 수를 넘으면 그만 가져온다(무한 루프·폭주 방지).
 *
 * @example
 * const rows = await fetchAll<{ stock_code: string }>((from, to) =>
 *   supabase.from("companies").select("stock_code").order("stock_code").range(from, to));
 */
export async function fetchAll<T>(
  // 동적 select 문자열은 supabase-js 타입 추론이 무너지므로(GenericStringError)
  // 빌더는 then-able이면 무엇이든 받고, 행 타입은 호출부의 제네릭 T를 믿는다.
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  maxRows = 50_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    const data = res.data as T[] | null;
    if (res.error || !data) break;
    out.push(...data);
    // 마지막 페이지 — 요청한 만큼 안 왔으면 더 없다.
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * `.in()` 필터에 넘길 코드가 많을 때 청크로 쪼개 조회하고 합친다.
 *
 * 행 캡과 별개로 URL 길이 문제가 있다: PostgREST는 필터를 쿼리스트링에 싣기 때문에
 * 종목코드 2,500개를 한 번에 `.in()`으로 넘기면 URL이 17KB를 넘어 414로 죽는다.
 *
 * @param codes  조회할 키 목록 (중복은 알아서 제거)
 * @param build  키 묶음을 받아 쿼리를 만들어 주는 함수
 * @param chunk  한 번에 넘길 키 개수
 */
export async function fetchByCodes<T>(
  codes: string[],
  build: (slice: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  chunk = 300,
): Promise<T[]> {
  const uniq = [...new Set(codes)];
  if (uniq.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < uniq.length; i += chunk) {
    const { data } = await build(uniq.slice(i, i + chunk));
    if (data) out.push(...(data as T[]));
  }
  return out;
}

/** PostgREST가 한 번에 돌려주는 최대 행 수. 호출부에서 캡 인지용으로 참조. */
export const POSTGREST_PAGE = PAGE;
