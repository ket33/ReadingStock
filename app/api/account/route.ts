import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 회원 탈퇴 — 요청자 '본인' 계정만 삭제. service_role 키는 서버에서만 사용(브라우저 미노출).
// auth.users 삭제 시 watchlist·user_metric_prefs는 on delete cascade로 함께 삭제된다.
export async function DELETE(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 토큰으로 '누가 요청했는지' 검증 → 그 사용자 id만 삭제 (클라이언트가 보낸 id는 신뢰하지 않음)
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
