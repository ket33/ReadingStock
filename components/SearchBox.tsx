"use client";

// 종목 검색창 — 입력하면 드롭다운으로 후보, 선택하면 /stock/{code}로 이동
// 헤더용(small)과 히어로용(large) 두 크기를 지원
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKrw } from "@/lib/format";

interface Candidate {
  stockCode: string;
  name: string;
  sector: string | null;
  marketCap: number | null;
}

export default function SearchBox({ size = "small" }: { size?: "small" | "large" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 입력 디바운스 → 서버 검색
  useEffect(() => {
    if (!q.trim()) { setResults([]); setOpen(false); setSearched(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setSearched(true);
        setOpen(true);
        setActive(0);
      } catch {
        setResults([]);
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

  const go = (code: string) => {
    setOpen(false);
    setQ("");
    router.push(`/stock/${code}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === "Enter" && results.length > 0) go(results[0].stockCode);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active].stockCode); }
    else if (e.key === "Escape") setOpen(false);
  };

  const isLarge = size === "large";

  return (
    <div ref={boxRef} className={`relative ${isLarge ? "max-w-2xl mx-auto" : "w-72"}`}>
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-outline-variant shadow-lg text-left">
          {results.length > 0 ? (
            results.map((r, i) => (
              <button
                key={r.stockCode}
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
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-on-surface-variant">
              검색 결과가 없어요. 아직 준비되지 않은 종목일 수 있어요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
