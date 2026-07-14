import type { Metadata } from "next";
import ResetPage from "@/components/auth/ResetPage";

export const metadata: Metadata = { title: "비밀번호 재설정 — Reading Stock" };

export default function Page() {
  return <ResetPage />;
}
