"use client";

// 브라우저 전용 Supabase 클라이언트 — 로그인 세션을 localStorage에 유지한다.
// 서버(ISR) 쪽 lib/supabase.ts(읽기 전용)와 분리: 인증은 전부 브라우저에서만.
// service_role 키는 절대 여기 들어오지 않는다 (anon 키 + Auth 세션만 — 지시서 보안 규칙).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",          // OAuth 리다이렉트 후 ?code= 자동 교환
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }
  return client;
}
