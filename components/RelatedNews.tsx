"use client";

// 비슷한 뉴스 — 기사 전문 하단에, 같은 산업그룹 기업들의 같은 카테고리 뉴스를 카드로.
// '기업명, 제목' + 본문 발췌 2줄. 5개씩 보여주고 '더보기'로 5개씩 추가.
// 클릭하면 그 기업 뉴스룸에서 해당 기사가 펼쳐진 채로 이동한다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchGroupPeers } from "@/lib/groups";
import { CATEGORY_LABEL, stripCompanyPrefix, formatNewsDateShort } from "@/lib/news-format";

const PAGE = 5;

interface Item {
  id: number;
  code: string;
  name: string;
  title: string;    // 접두어 제거본
  excerpt: string;
  date: string;     // 'YYYY.MM.DD'
}

export default function RelatedNews({ stockCode, category }: {
  stockCode: string;
  category: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) { setItems(null); setVisible(PAGE); }
      const sb = supabaseBrowser();
      const peers = await fetchGroupPeers(sb, stockCode);
      if (peers.length === 0) { if (alive) setItems([]); return; }

      const { data: news } = await sb.from("company_news")
        .select("id,stock_code,title,body,published_at")
        .in("stock_code", peers.map(p => p.code))
        .eq("category", category)
        .order("published_at", { ascending: false })
        .limit(60);
      if (!news || news.length === 0) { if (alive) setItems([]); return; }

      const codes = [...new Set(news.map(n => n.stock_code as string))];
      const { data: comps } = await sb.from("companies")
        .select("stock_code,name").in("stock_code", codes);
      const names = new Map((comps ?? []).map(c => [c.stock_code as string, c.name as string]));

      const built: Item[] = news.map(n => {
        const code = n.stock_code as string;
        const name = names.get(code) ?? code;
        return {
          id: n.id as number,
          code,
          name,
          title: stripCompanyPrefix(n.title as string, name),
          excerpt: (n.body as string).replace(/\s+/g, " ").trim(),
          date: formatNewsDateShort(n.published_at as string),
        };
      });
      if (alive) setItems(built);
    })();
    return () => { alive = false; };
  }, [stockCode, category]);

  if (!items || items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-widest uppercase text-primary mb-3">
        같은 업종의 비슷한 뉴스
        <span className="text-[11px] font-normal tracking-normal normal-case text-outline">
          {CATEGORY_LABEL[category] ?? category} 소식
        </span>
      </h2>
      <div className="space-y-3">
        {items.slice(0, visible).map(it => (
          <Link
            key={it.id}
            href={`/stock/${it.code}?tab=news&news=${it.id}`}
            className="block bg-white border border-outline-variant rounded-xl p-4
                       hover:border-primary transition-colors group"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-primary group-hover:underline
                               underline-offset-4 decoration-1 min-w-0 truncate">
                {it.name}, {it.title}
              </span>
              <span className="shrink-0 text-[11px] text-outline tabular-nums">{it.date}</span>
            </div>
            <p className="text-[13px] leading-[1.6] text-on-surface-variant line-clamp-2 mt-1">
              {it.excerpt}
            </p>
          </Link>
        ))}
      </div>
      {visible < items.length && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setVisible(v => v + PAGE)}
            className="inline-flex items-center gap-1 px-5 py-1.5 border border-outline-variant rounded-full
                       text-xs font-medium text-on-surface-variant bg-white hover:text-primary
                       hover:border-primary transition-colors"
          >
            더보기 ({Math.min(PAGE, items.length - visible)}개 더)
          </button>
        </div>
      )}
    </section>
  );
}
