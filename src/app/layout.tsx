import type { Metadata } from "next";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { getWorkspaceClock } from "@/server/clock";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Today | F5 Client Success", template: "%s | F5 Client Success" },
  description: "Keep client feedback, placement check-ins and issue follow-ups in one daily workspace.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const clock = getWorkspaceClock();
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: clock.timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(clock.instant));
  return <html lang="en"><body><AppShell dateLabel={dateLabel} operationsDate={clock.operationsDate}>{children}</AppShell></body></html>;
}
