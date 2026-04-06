import { resetTelemetry } from "./telemetry.js";
import { resetTracking } from "./query-tracker.js";
import { resetCursors } from "./cursor-store.js";

/**
 * Single entry point for session-scoped state reset.
 * New session-scoped modules register their reset here — not in index.ts.
 */
export function resetSessionState(): void {
  resetTelemetry();
  resetTracking();
  resetCursors();
}
