import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// 뉴스룸 기사 발송 — 뉴스 1건을 해당 종목 워치리스트 회원 전원에게 이메일로 보낸다.
// 호출: 파이썬 파이프라인(news/run.py)이 기사 저장 직후 POST (Bearer CRON_SECRET).
// service_role 키는 서버에서만 사용 — notify-requests와 같은 규칙.

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

  let newsId: number;
  try {
    const body = await request.json();
    newsId = Number(body.news_id);
    if (!newsId) throw new Error("news_id required");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: news, error: newsErr } = await admin
    .from("company_news")
    .select("id,stock_code,title,body,published_at,notified_at")
    .eq("id", newsId)
    .single();
  if (newsErr || !news) return NextResponse.json({ error: "news not found" }, { status: 404 });
  if (news.notified_at) {
    return NextResponse.json({ watchers: 0, sent: 0, skipped: "already notified" });
  }

  const { data: company } = await admin
    .from("companies").select("name").eq("stock_code", news.stock_code).single();
  const companyName = company?.name ?? news.stock_code;

  // 이 종목을 워치리스트에 담은 회원들
  const { data: watchers } = await admin
    .from("watchlist").select("user_id").eq("stock_code", news.stock_code);
  const userIds = [...new Set((watchers ?? []).map(w => w.user_id))];

  const newsUrl = `${SITE_URL}/stock/${news.stock_code}?tab=news`;
  const lead = (news.body as string).split(/\n\s*\n/)[0]?.trim() ?? "";

  let sent = 0;
  const errors: string[] = [];
  for (const uid of userIds) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (!email) continue;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? `${SITE_NAME} <no-reply@readingstock.com>`,
          to: [email],
          subject: news.title,
          html: emailHtml(companyName, news.title, lead, newsUrl),
        }),
      });
      if (res.ok) sent++;
      else errors.push(`${uid.slice(0, 8)}: ${res.status}`);
    } catch (e) {
      errors.push(`${uid.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await admin.from("company_news")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", newsId);

  return NextResponse.json({ watchers: userIds.length, sent, errors });
}

function emailHtml(companyName: string, title: string, lead: string, newsUrl: string): string {
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1c2532;">
  <p style="font-size:14px;font-weight:700;color:#16243f;margin:0 0 6px;">Reading Stock 뉴스룸</p>
  <p style="font-size:12px;color:#8a94a3;margin:0 0 24px;">워치리스트에 담아두신 ${companyName}의 새 소식이에요.</p>
  <h1 style="font-size:20px;line-height:1.45;font-weight:700;color:#16243f;margin:0 0 16px;">${title}</h1>
  <p style="font-size:15px;line-height:1.75;margin:0 0 24px;">${lead}</p>
  <a href="${newsUrl}"
     style="display:inline-block;background:#16243f;color:#ffffff;text-decoration:none;
            font-size:15px;font-weight:600;padding:12px 28px;border-radius:999px;">
    뉴스룸에서 전체 읽기
  </a>
  <p style="font-size:12px;color:#8a94a3;line-height:1.6;margin:32px 0 0;">
    공시 내용을 쉽게 풀어 쓴 글로, 투자 권유가 아니에요. 투자 판단의 책임은 투자자 본인에게 있어요.<br/>
    이 메일은 ${companyName}을(를) 워치리스트에 담은 회원에게 발송돼요.
  </p>
</div>`;
}
