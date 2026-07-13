"use client";

// 탭 1: 분석글 — DB의 마크다운 글을 렌더하고 〔차트 N〕 자리에 실제 차트를 끼운다
import ReactMarkdown from "react-markdown";
import { ChartByNumber } from "./charts";
import type { Article, ChartData } from "@/lib/types";

// 〔차트 ①: …〕 / [차트 1: …] — 원문자·숫자 표기 모두 인식
const CHART_RE = /[〔\[]\s*차트\s*([①②③④⑤12345])[^〕\]]*[〕\]]/g;
const CIRCLED: Record<string, number> = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };

function chartNumber(token: string): number {
  return CIRCLED[token] ?? parseInt(token, 10);
}

/** 본문을 (마크다운 조각 | 차트 번호) 시퀀스로 분해 */
function splitBody(body: string): (string | number)[] {
  const parts: (string | number)[] = [];
  let last = 0;
  for (const m of body.matchAll(CHART_RE)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    parts.push(chartNumber(m[1]));
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

/** 첫 H1(제목)과 첫 이탤릭 줄(글 자체 메타)을 분리 — 메타는 표시하지 않고 걷어내기만 한다 */
function extractHead(body: string): { title: string | null; rest: string } {
  const lines = body.split("\n");
  let title: string | null = null;
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].startsWith("# ")) {
    title = lines[i].slice(2).trim();
    i++;
  }
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim() === "---")) i++;
  const t = lines[i]?.trim() ?? "";
  if (t.startsWith("*") && t.endsWith("*") && !t.startsWith("**")) {
    i++; // 글이 스스로 쓴 메타줄은 걷어낸다 (기준 표기는 based_on에서 일관되게 생성)
  }
  // 본문 첫머리의 '---'는 메타줄 박스 테두리와 겹쳐 이중선으로 보이므로 걷어낸다
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim() === "---")) i++;
  return { title, rest: lines.slice(i).join("\n") };
}

/** 본문 끝의 이탤릭 디스클레이머 줄을 분리 — 하단에서 작게 렌더하기 위해 걷어낸다 */
function extractTail(body: string): { body: string; disclaimer: string | null } {
  const lines = body.split("\n");
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  const t = lines[end]?.trim() ?? "";
  if (end >= 0 && t.startsWith("*") && t.endsWith("*") && !t.startsWith("**") && t.length > 2) {
    const disclaimer = t.slice(1, -1).trim();
    let i = end - 1;
    // 디스클레이머 위의 '---'(hr)도 함께 걷어낸다 (하단 구분선 제거)
    while (i >= 0 && (lines[i].trim() === "" || lines[i].trim() === "---")) i--;
    return { body: lines.slice(0, i + 1).join("\n"), disclaimer };
  }
  return { body, disclaimer: null };
}

/** based_on("2025 FY + 2026 1Q TTM + 2026-07-03 주가 + …")에서 재무 기준만 남긴다 */
function basedOnCore(basedOn: string | null): string | null {
  if (!basedOn) return null;
  const parts = basedOn.split(" + ").filter(
    p => !p.includes("주가") && !p.includes("워치") &&
         !p.includes("writer") && !p.includes("prompt"));
  return parts.length ? parts.join(" + ") : null;
}

/** "2025 FY + 2026 1Q TTM" → "2025년 연간 실적 및 2026년 1분기 TTM 기준" */
function basedOnLabel(core: string | null): string | null {
  if (!core) return null;
  const label = core.split(" + ").map(p => {
    const m = p.trim().match(/^(\d{4})\s+(FY|([1-4])Q)(\s+TTM)?$/);
    if (!m) return p.trim();
    if (m[2] === "FY") return `${m[1]}년 연간 실적`;
    return `${m[1]}년 ${m[3]}분기${m[4] ? " TTM" : ""}`;
  });
  return label.join(" 및 ") + " 기준";
}

const mdComponents = {
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      className="font-serif text-[26px] leading-snug font-medium text-primary pt-8 mb-4"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="font-serif text-xl font-medium text-primary pt-4 mb-3" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="text-[16px] leading-[1.8] text-on-surface-variant mb-5" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-on-surface" {...props} />
  ),
  em: (props: React.ComponentProps<"em">) => (
    <em className="text-on-surface-variant" {...props} />
  ),
  hr: () => <hr className="border-outline-variant my-10" />,
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="list-disc pl-5 space-y-2 text-on-surface-variant mb-5" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="list-decimal pl-5 space-y-2 text-on-surface-variant mb-5" {...props} />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote className="border-l-4 border-outline-variant pl-6 py-1 my-8 font-serif text-lg text-primary italic" {...props} />
  ),
};

export default function ArticleTab({ article, charts, sector }: {
  article: Article | null;
  charts: ChartData;
  sector: string | null;
}) {
  const isFinancial = sector === "금융";
  if (!article) {
    return (
      <div className="article-canvas py-24 text-center text-on-surface-variant">
        아직 이 종목의 분석글이 없습니다.
      </div>
    );
  }

  const { title, rest } = extractHead(article.body);
  const { body: mainBody, disclaimer } = extractTail(rest);
  const parts = splitBody(mainBody);
  const created = new Date(article.created_at).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const core = basedOnCore(article.based_on);
  const coreLabel = basedOnLabel(core);

  return (
    <div className="article-canvas">
      {/* 카테고리 태그 (디자인의 Category Tag) */}
      {sector && (
        <div className="mb-6">
          <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 text-xs font-medium rounded-sm tracking-widest uppercase">
            {sector}
          </span>
        </div>
      )}

      {/* 헤드라인 (세리프) — "기업명," 뒤에서 줄바꿈 */}
      {title && (() => {
        const ci = title.indexOf(",");
        const head = ci >= 0 ? title.slice(0, ci + 1) : title;
        const tail = ci >= 0 ? title.slice(ci + 1).trim() : "";
        return (
          <h1 className="font-serif text-[26px] md:text-[34px] leading-[1.3] font-semibold text-primary mb-6 tracking-tight">
            {head}
            {tail && (
              <><br /><span className="text-[19px] md:text-[24px]">{tail}</span></>
            )}
          </h1>
        );
      })()}

      {/* 메타줄: 생성일 + 재무 기준만 */}
      <div className="border-y border-outline-variant py-3 mb-10 text-[13px] text-on-surface-variant space-y-0.5">
        <div>{created} 생성</div>
        {coreLabel && <div>{coreLabel}</div>}
      </div>

      {/* 본문 + 차트 */}
      <div className="max-w-none">
        {parts.map((part, i) =>
          typeof part === "number" ? (
            <ChartByNumber key={i} n={part} charts={charts} isFinancial={isFinancial} />
          ) : (
            <ReactMarkdown key={i} components={mdComponents}>
              {part}
            </ReactMarkdown>
          )
        )}
      </div>

      {/* 하단: 디스클레이머(작게) + 데이터 기준 + AI 안내 — 구분선 없이 */}
      <div className="mt-12 space-y-1.5">
        {disclaimer && (
          <p className="text-[12px] leading-relaxed text-outline italic">{disclaimer}</p>
        )}
        {core && <p className="text-xs text-outline">데이터 기준: {core}</p>}
        <p className="text-xs text-outline">이 글은 AI가 자동으로 작성했습니다.</p>
      </div>
    </div>
  );
}
