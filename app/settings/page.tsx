import type { Metadata } from "next";
import SettingsPage from "@/components/SettingsPage";

export const metadata: Metadata = { title: "Setting — Reading Stock" };

export default function Page() {
  return <SettingsPage />;
}
