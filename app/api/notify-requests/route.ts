import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// 분석글 작성 요청 알림 배치 — '대기 중' 요청 중 글이 완성된 것을 찾아 이메일 발송
// 호출 경로 2가지 (둘 다 Authorization: Bearer <CRON_SECRET>):
//   - GET  : Vercel 크론이 매일 호출 (안전망)
//   - POST : 파이썬 publish.py가 글 저장 직후 호출 (즉시 알림)
// service_role 키는 서버에서만 사용(브라우저 미노출) — account/route.ts와 같은 규칙.

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

interface PendingRequest {
  id: number;
  user_id: string;
  stock_code: string | null;
  company_query: string | null;
}

async function run(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pending, error: pendErr } = await admin
    .from("article_requests")
    .select("id,user_id,stock_code,company_query")
    .eq("status", "pending");
  if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 });

  let sent = 0;
  const errors: string[] = [];

  for (const req of (pending ?? []) as PendingRequest[]) {
    try {
      // 요청 대상 종목코드 확정 — company_query 요청은 회사명 부분일치로 찾는다
      let stockCode = req.stock_code;
      if (!stockCode && req.company_query) {
        const { data: match } = await admin
          .from("companies")
          .select("stock_code")
          .ilike("name", `%${req.company_query}%`)
          .limit(1);
        stockCode = match?.[0]?.stock_code ?? null;
      }
      if (!stockCode) continue; // 아직 종목 자체가 없음 — 대기 유지

      // 분석글이 완성됐는지 확인
      const { data: articles } = await admin
        .from("articles")
        .select("body")
        .eq("stock_code", stockCode)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!articles?.length) continue; // 아직 글 없음 — 대기 유지

      const { data: company } = await admin
        .from("companies")
        .select("name")
        .eq("stock_code", stockCode)
        .single();
      const companyName = company?.name ?? stockCode;

      // 수신자 이메일 (auth 계정에서 — 탈퇴 시 요청도 cascade 삭제되므로 항상 유효)
      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(req.user_id);
      const email = userData?.user?.email;
      if (userErr || !email) { errors.push(`req ${req.id}: 사용자 이메일 없음`); continue; }

      // 글 제목(첫 H1) — 이메일 본문에 표시
      const titleMatch = articles[0].body?.match(/^#\s+(.+)$/m);
      const articleTitle = titleMatch?.[1]?.trim() ?? `${companyName} 분석글`;
      const articleUrl = `${SITE_URL}/stock/${stockCode}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? `${SITE_NAME} <no-reply@readingstock.com>`,
          to: [email],
          subject: `요청하신 ${companyName} 분석글이 완성되었어요`,
          html: emailHtml(companyName, articleTitle, articleUrl),
        }),
      });
      if (!res.ok) {
        errors.push(`req ${req.id}: 발송 실패 ${res.status} ${await res.text()}`);
        continue;
      }

      // 발송 완료 처리 (+ query 요청이면 매칭된 종목코드 기록)
      await admin
        .from("article_requests")
        .update({ status: "sent", notified_at: new Date().toISOString(), stock_code: stockCode })
        .eq("id", req.id);
      sent++;
    } catch (e) {
      errors.push(`req ${req.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ checked: pending?.length ?? 0, sent, errors });
}

function emailHtml(companyName: string, articleTitle: string, articleUrl: string): string {
  return `
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1c2532;">
  <p style="font-size:22px;font-weight:700;color:#16243f;margin:0 0 24px;">Reading Stock</p>
  <h1 style="font-size:20px;font-weight:600;color:#16243f;margin:0 0 12px;">
    요청하신 ${companyName} 분석글이 완성되었어요
  </h1>
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">
    기다려 주셔서 감사합니다. 새 분석글이 준비되었습니다.
  </p>
  <div style="border:1px solid #e2e6ec;border-radius:12px;padding:20px;margin:0 0 24px;">
    <p style="font-size:16px;font-weight:600;color:#16243f;margin:0;">${articleTitle}</p>
  </div>
  <a href="${articleUrl}"
     style="display:inline-block;background:#16243f;color:#ffffff;text-decoration:none;
            font-size:15px;font-weight:600;padding:12px 28px;border-radius:999px;">
    분석글 읽으러 가기
  </a>
  <p style="font-size:12px;color:#8a94a3;line-height:1.6;margin:32px 0 0;">
    이 메일은 Reading Stock에서 분석글 작성을 요청하신 분께 한 번만 발송됩니다.<br/>
    본 콘텐츠는 투자 참고용이며, 투자 판단의 책임은 투자자 본인에게 있습니다.
  </p>
</div>`;
}
