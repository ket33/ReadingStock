"use client";

// 종목 검색창 — 입력하면 드롭다운으로 후보, 선택하면 /stock/{code}로 이동
// 헤더용(small)과 히어로용(large) 두 크기를 지원
// 드롭다운은 ①분석글이 준비된 종목(이동) ②상장됐지만 미준비(작성 요청) 두 구역이며,
// 방향키가 두 구역을 하나의 목록처럼 오가고 Enter로 이동/요청까지 처리한다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKrw } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./auth/AuthProvider";

interface Candidate {
  stockCode: string;
  name: string;
  sector: string | null;
  marketCap: number | null;
}

// 상장은 됐지만 아직 분석글이 준비 안 된 종목 — 작성 요청 대상
interface ListedCandidate {
  stockCode: string;
  name: string;
  market: string;
}

export default function SearchBox({ size = "small", fullWidth = false, autoFocus = false }: {
  size?: "small" | "large";
  fullWidth?: boolean;  // 모바일 헤더 펼침용 — 고정폭(w-72) 대신 부모 폭에 맞춤
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const { user, openSignIn } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [listed, setListed] = useState<ListedCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set()); // 이번 세션에 요청 완료한 종목
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const total = results.length + listed.length; // 방향키가 오가는 전체 항목 수

  // 입력 디바운스 → 서버 검색
  useEffect(() => {
    if (!q.trim()) { setResults([]); setListed([]); setOpen(false); setSearched(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setListed(json.listed ?? []);
        setSearched(true);
        setOpen(true);
        setActive(0);
      } catch {
        setResults([]);
        setListed([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // 바깥 클릭으로 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // 방향키로 움직일 때 활성 항목이 스크롤 영역 밖으로 나가면 따라간다
  // (scrollIntoView는 페이지까지 스크롤시켜 히어로가 움직여 보이므로 드롭다운 내부만 조정)
  useEffect(() => {
    const c = listRef.current;
    const el = c?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    if (!c || !el) return;
    if (el.offsetTop < c.scrollTop) {
      c.scrollTop = el.offsetTop;
    } else if (el.offsetTop + el.offsetHeight > c.scrollTop + c.clientHeight) {
      c.scrollTop = el.offsetTop + el.offsetHeight - c.clientHeight;
    }
  }, [active]);

  const go = (code: string) => {
    setOpen(false);
    setQ("");
    router.push(`/stock/${code}`);
  };

  // 미준비 상장사 작성 요청 — 비로그인 시 로그인 다이얼로그로 유도 (WatchButton과 같은 흐름)
  const requestListed = async (l: ListedCandidate) => {
    if (!user) { openSignIn(); return; }
    if (busyCode || requested.has(l.stockCode)) return;
    setBusyCode(l.stockCode);
    const { error } = await supabaseBrowser().from("article_requests").insert({
      user_id: user.id,
      stock_code: l.stockCode,
    });
    // 23505 = unique 충돌(이미 대기 중 요청 있음) → 요청된 상태로 간주
    if (!error || error.code === "23505") {
      setRequested(prev => new Set(prev).add(l.stockCode));
    }
    setBusyCode(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || total === 0) {
      if (e.key === "Enter" && results.length > 0) go(results[0].stockCode);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, total - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active < results.length) go(results[active].stockCode);
      else requestListed(listed[active - results.length]);
    }
    else if (e.key === "Escape") setOpen(false);
  };

  const isLarge = size === "large";

  return (
    <div ref={boxRef} className={`relative ${isLarge ? "max-w-2xl mx-auto" : fullWidth ? "w-full" : "w-72"}`}>
      <div className={`flex items-center bg-white transition-all rounded-full
                       focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10
                       ${isLarge ? "border border-outline-variant shadow-sm"
                                 : "border-2 border-primary/35 shadow-[0_2px_8px_rgba(4,22,39,0.10)]"}`}>
        <span className={`material-symbols-outlined text-on-surface-variant ${isLarge ? "ml-6" : "ml-3 text-[20px]"}`}>
          search
        </span>
        <input
          type="text"
          value={q}
          autoFocus={autoFocus}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length || searched) setOpen(true); }}
          placeholder={isLarge
            ? "회사 이름이나 종목코드로 검색 (예: 삼성전자, 005930)"
            : "종목 검색"}
          className={`w-full border-none focus:outline-none bg-transparent placeholder:text-on-surface-variant/50
                      ${isLarge ? "py-3 px-4 text-lg" : "py-2 px-3 text-sm"}`}
        />
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto bg-white border border-outline-variant shadow-lg text-left"
        >
          {/* ① 분석글이 준비된 종목 — 클릭하면 이동 */}
          {results.map((r, i) => (
            <button
              key={r.stockCode}
              data-idx={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.stockCode)}
              className={`w-full flex items-baseline justify-between gap-3 px-4 py-3 text-left transition-colors
                          ${i === active ? "bg-surface-container-low" : "bg-white"}`}
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-medium text-primary truncate">{r.name}</span>
                <span className="text-xs text-on-surface-variant shrink-0">{r.stockCode}</span>
                {r.sector && (
                  <span className="text-xs text-outline shrink-0">{r.sector}</span>
                )}
              </span>
              {r.marketCap != null && (
                <span className="text-xs text-on-surface-variant shrink-0">
                  시총 {formatKrw(r.marketCap)}
                </span>
              )}
            </button>
          ))}

          {/* ② 상장은 됐지만 아직 분석글이 없는 종목 — 행 전체가 '작성 요청' 버튼 */}
          {listed.length > 0 && (
            <>
              <div className={`px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-outline
                               ${results.length > 0 ? "border-t border-outline-variant" : ""}`}>
                아직 분석글이 준비되지 않은 종목 — 선택하면 작성 요청
              </div>
              {listed.map((l, i) => {
                const idx = results.length + i;
                const done = requested.has(l.stockCode);
                return (
                  <button
                    key={l.stockCode}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => requestListed(l)}
                    disabled={busyCode === l.stockCode}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors
                                ${idx === active ? "bg-surface-container-low" : "bg-white"}`}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-medium text-on-surface truncate">{l.name}</span>
                      <span className="text-xs text-on-surface-variant shrink-0">{l.stockCode}</span>
                      <span className="text-xs text-outline shrink-0">{l.market}</span>
                    </span>
                    {done ? (
                      <span className="text-xs text-primary font-medium shrink-0">요청 완료 ✓</span>
                    ) : (
                      <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors
                                        ${idx === active
                                          ? "border-primary bg-white text-primary"
                                          : "border-primary bg-primary text-on-primary"}`}>
                        {busyCode === l.stockCode ? "요청 중…" : "작성 요청"}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* ③ 명부에도 없는 검색어 — 요청 대상 아님 */}
          {results.length === 0 && listed.length === 0 && (
            <div className="px-4 py-4 text-sm text-on-surface-variant">
              코스피·코스닥 상장 종목 중에서 찾지 못했어요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
