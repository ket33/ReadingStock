import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// 뉴스룸 다이제스트 발송 — 아직 발송 안 된 새 기사들을 모아,
// 회원별로 '자기 워치리스트 종목의 기사만' 묶어 하루 한 통으로 보낸다.
// 호출: 파이썬 파이프라인(news/run.py)이 그날 생성 루프를 마친 뒤 1회 POST.
// 발송 여부와 무관하게 이번 다이제스트에 포함된 기사는 notified_at을 찍어
// 다음 다이제스트에 다시 들어가지 않게 한다.

interface NewsRow {
  id: number;
  stock_code: string;
  title: string;
  published_at: string;
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey || !resendKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 미발송 새 기사 (48시간 창 — 오래된 백필이 섞여 들어오지 않게)
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: articlesQ, error: aErr } = await admin
    .from("company_news")
    .select("id,stock_code,title,published_at")
    .is("notified_at", null)
    .gte("created_at", since)
    .order("published_at", { ascending: false });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  const articles = (articlesQ ?? []) as NewsRow[];
  if (articles.length === 0) {
    return NextResponse.json({ articles: 0, users: 0, sent: 0, errors: [] });
  }

  const codes = [...new Set(articles.map(a => a.stock_code))];
  const { data: comps } = await admin
    .from("companies").select("stock_code,name").in("stock_code", codes);
  const nameBy = new Map((comps ?? []).map(c => [c.stock_code as string, c.name as string]));

  // 종목별 워처 → 회원별 해당 기사 묶음
  const { data: watchers } = await admin
    .from("watchlist").select("user_id,stock_code").in("stock_code", codes);
  const codesByUser = new Map<string, Set<string>>();
  for (const w of watchers ?? []) {
    const uid = w.user_id as string;
    if (!codesByUser.has(uid)) codesByUser.set(uid, new Set());
    codesByUser.get(uid)!.add(w.stock_code as string);
  }

  let sent = 0;
  const errors: string[] = [];
  for (const [uid, userCodes] of codesByUser) {
    const items = articles.filter(a => userCodes.has(a.stock_code));
    if (items.length === 0) continue;
    try {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (!email) continue;

      // 제목: "오늘의 뉴스 N건 — 현대자동차 외 2종목"
      const stockNames = [...new Set(items.map(i => nameBy.get(i.stock_code) ?? i.stock_code))];
      const subject = `오늘의 뉴스 ${items.length}건 — ${stockNames[0]}${
        stockNames.length > 1 ? ` 외 ${stockNames.length - 1}종목` : ""}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? `${SITE_NAME} <no-reply@readingstock.com>`,
          to: [email],
          subject,
          html: digestHtml(items, nameBy),
        }),
      });
      if (res.ok) sent++;
      else errors.push(`${uid.slice(0, 8)}: ${res.status}`);
    } catch (e) {
      errors.push(`${uid.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 이번 다이제스트에 포함된 기사는 전부 처리 완료로 표시 (워처가 없던 기사 포함)
  await admin.from("company_news")
    .update({ notified_at: new Date().toISOString() })
    .in("id", articles.map(a => a.id));

  return NextResponse.json({ articles: articles.length, users: codesByUser.size, sent, errors });
}

/** 종목별로 묶은 다이제스트 본문 */
function digestHtml(items: NewsRow[], nameBy: Map<string, string>): string {
  // 종목별 그룹 (기사 최신순 유지)
  const byStock = new Map<string, NewsRow[]>();
  for (const it of items) {
    if (!byStock.has(it.stock_code)) byStock.set(it.stock_code, []);
    byStock.get(it.stock_code)!.push(it);
  }

  const sections = [...byStock.entries()].map(([code, arts]) => {
    const name = nameBy.get(code) ?? code;
    const links = arts.map(a => `
      <li style="margin:0 0 10px;">
        <a href="${SITE_URL}/stock/${code}?tab=news&news=${a.id}"
           style="color:#16243f;text-decoration:none;font-size:15px;line-height:1.6;">
          ${a.title}
        </a>
      </li>`).join("");
    return `
    <div style="margin:0 0 22px;">
      <p style="font-size:13px;font-weight:700;color:#8a94a3;margin:0 0 8px;letter-spacing:0.04em;">
        ${name}
      </p>
      <ul style="margin:0;padding:0 0 0 18px;">${links}</ul>
    </div>`;
  }).join("");

  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1c2532;">
  <p style="font-size:14px;font-weight:700;color:#16243f;margin:0 0 6px;">Reading Stock 뉴스룸</p>
  <p style="font-size:12px;color:#8a94a3;margin:0 0 24px;">워치리스트에 담아두신 종목들의 새 소식을 하루 한 번 모아 전해드려요.</p>
  ${sections}
  <a href="${SITE_URL}/watchlist"
     style="display:inline-block;background:#16243f;color:#ffffff;text-decoration:none;
            font-size:14px;font-weight:600;padding:11px 26px;border-radius:999px;margin-top:4px;">
    내 워치리스트 보기
  </a>
  <p style="font-size:12px;color:#8a94a3;line-height:1.6;margin:28px 0 0;">
    공시 내용을 쉽게 풀어 쓴 글로, 투자 권유가 아니에요. 투자 판단의 책임은 투자자 본인에게 있어요.<br/>
    이 메일은 해당 종목을 워치리스트에 담은 회원에게 발송돼요.
  </p>
</div>`;
}
