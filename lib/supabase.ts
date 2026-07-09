import { createClient } from "@supabase/supabase-js";

// 읽기 전용 클라이언트 — anon key만 사용한다.
// service_role 키는 절대 프런트엔드/이 앱에 넣지 않는다 (지시서 보안 규칙).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
