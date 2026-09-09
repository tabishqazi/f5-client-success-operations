import "server-only";
import { resolveClock } from "@/domain/clock";

// The operating workspace always uses trusted server time. Fixed clocks belong in tests.
export function getWorkspaceClock() {
  return resolveClock({ mode: "live" }, { now: () => new Date().toISOString() });
}
