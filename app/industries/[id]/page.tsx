// 개별 산업 페이지 — 임시 스텁.
// /industry(히트맵·등락)의 셀·행이 여기로 연결된다. 산업 리포트 본문은 추후 채운다 —
// 지금은 그룹 소개 + 소속 상장사 목록(온보딩 종목은 개별 페이지로 링크)만 보여준다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const revalidate = 3600;

interface MemberRow {
  company_id: string;
  is_primary: boolean;
  listed_companies: { name: string } | { name: string }[] | null;
}

async function loadGroup(id: number) {
  const [groupQ, membersQ] = await Promise.all([
    supabase.from("industry_groups").select("id,name,description").eq("id", id).maybeSingle(),
    supabase.from("company_groups")
      .select("company_id,is_primary,listed_companies(name)")
      .eq("group_id", id)
      .limit(300),
  ]);
  if (!groupQ.data) return null;

  const members = ((membersQ.data ?? []) as MemberRow[]).map(m => {
    const rel = m.listed_companies;
    return {
      code: m.company_id,
      name: (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? m.company_id,
      isPrimary: m.is_primary,
    };
  });

  // 온보딩(개별종목페이지 있음) 여부 + 시총 — screener 스냅샷에서
  const codes = members.map(m => m.code);
  const onboarded = new Map<string, number | null>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await supabase.from("screener")
      .select("stock_code,market_cap").in("stock_code", codes.slice(i, i + 200));
    for (const r of (data ?? []) as { stock_code: string; market_cap: number | null }[])
      onboarded.set(r.stock_code, r.market_cap);
  }
  members.sort((a, b) => {
    const am = onboarded.has(a.code) ? (onboarded.get(a.code) ?? 0) : -1;
    const bm = onboarded.has(b.code) ? (onboarded.get(b.code) ?? 0) : -1;
    return bm - am; // 온보딩 + 시총 큰 순 → 비온보딩은 뒤로
  });

  return {
    group: groupQ.data as { id: number; name: string; description: string | null },
    members,
    onboarded,
  };
}

export async function generateMetadata({ params }: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadGroup(Number(id));
  if (!data) return {};
  return {
    title: `${data.group.name} 산업 — Reading Stock`,
    description: data.group.description ?? `${data.group.name} 산업의 상장사와 리포트`,
  };
}

export default async function Page({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) notFound();
  const data = await loadGroup(num);
  if (!data) notFound();
  const { group, members, onboarded } = data;
  const primaries = members.filter(m => m.isPrimary);
  const secondaries = members.filter(m => !m.isPrimary);

  return (
    <>
      <SiteHeader />
      <main className="flex-grow bg-surface-container-lowest">
        <div className="max-w-[880px] mx-auto px-4 md:px-10 pt-10 pb-16">
          <p className="text-xs text-outline mb-2">
            <Link href="/industries" className="hover:text-primary transition-colors">Industries</Link>
            {" / "}{group.name}
          </p>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-primary mb-2">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-on-surface-variant mb-6">{group.description}</p>
          )}

          <div className="border border-outline-variant rounded-xl bg-surface-container-low px-5 py-4 mb-8 text-sm text-on-surface-variant">
            이 산업의 심층 리포트(밸류체인·수익구조·투자 신호)는 준비 중입니다.
            아래 소속 기업에서 개별 분석을 먼저 볼 수 있어요.
          </div>

          <h2 className="font-serif text-lg font-semibold text-primary mb-3">
            소속 상장사 <span className="text-sm font-normal text-on-surface-variant">({primaries.length}개)</span>
          </h2>
          <ul className="grid sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-outline-variant/50 mb-8">
            {primaries.map(m => {
              const has = onboarded.has(m.code);
              return (
                <li key={m.code} className="py-1.5 text-sm">
                  {has ? (
                    <Link href={`/stock/${m.code}`}
                          className="text-primary font-medium hover:underline">
                      {m.name} <span className="text-[11px] text-on-surface-variant font-normal">{m.code}</span>
                    </Link>
                  ) : (
                    <span className="text-on-surface-variant">
                      {m.name} <span className="text-[11px] text-outline">{m.code} · 페이지 준비 중</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {secondaries.length > 0 && (
            <>
              <h2 className="font-serif text-base font-semibold text-primary mb-2">
                이 산업을 겸업으로 하는 기업 <span className="text-sm font-normal text-on-surface-variant">({secondaries.length}개)</span>
              </h2>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {secondaries.map(m => onboarded.has(m.code) ? (
                  <Link key={m.code} href={`/stock/${m.code}`} className="text-primary hover:underline">{m.name}</Link>
                ) : (
                  <span key={m.code} className="text-on-surface-variant">{m.name}</span>
                ))}
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
