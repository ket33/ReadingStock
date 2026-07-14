import type { Metadata } from "next";
import WatchlistPage from "@/components/WatchlistPage";

export const metadata: Metadata = { title: "내 관심종목 — Reading Stock" };

export default function Page() {
  return <WatchlistPage />;
}
