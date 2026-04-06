import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { FileFinder } from "@ff-labs/fff-node";
import { ensureFinder, destroyFinder, getFinder, isScanComplete, getDbDir, rescan } from "./finder.js";
import { grepTool } from "./grep-tool.js";
import { findTool } from "./find-tool.js";
import { multiGrepTool } from "./multi-grep-tool.js";
import { getTelemetry } from "./telemetry.js";
import { resetSessionState } from "./session.js";

export default async function piFff(pi: ExtensionAPI): Promise<void> {
  pi.on("session_start", async (event, ctx) => {
    resetSessionState();

    try {
      await ensureFinder(ctx.cwd);
      if (!isScanComplete() && ctx.hasUI) {
        ctx.ui.notify("FFF: initial scan still running — results may be partial", "warning");
      }
    } catch (err) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `FFF init failed: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
    }
  });

  pi.on("session_shutdown", () => {
    destroyFinder();
  });

  pi.registerTool(grepTool);
  pi.registerTool(findTool);
  pi.registerTool(multiGrepTool);

  pi.registerCommand("fff-health", {
    description: "Show FFF runtime status",
    handler: async (args, ctx) => {
      const finder = getFinder();
      const version = (() => {
        try {
          const health = FileFinder.healthCheckStatic();
          return health.ok ? health.value.version : "unknown";
        } catch { return "unknown"; }
      })();

      const lines = [
        `FFF v${version}`,
        `Git: ${finder ? "yes" : "no"} (${ctx.cwd})`,
        `Picker: ${finder ? "active" : "not initialized"}`,
        `Frecency: ${finder ? `active (LMDB at ${getDbDir()}/frecency.mdb)` : "inactive"}`,
        `Query tracker: ${finder ? `active (LMDB at ${getDbDir()}/history.mdb)` : "inactive"}`,
        `Scanning: ${isScanComplete() ? "no" : "yes (or not started)"}`,
      ];

      if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("fff-rescan", {
    description: "Force a filesystem rescan",
    handler: async (args, ctx) => {
      if (!getFinder()) {
        if (ctx.hasUI) ctx.ui.notify("FFF not initialized", "error");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("FFF: starting rescan...", "info");

      try {
        const complete = await rescan(15_000);
        if (ctx.hasUI) {
          ctx.ui.notify(
            complete ? "FFF: rescan complete" : "FFF: rescan timeout — partial index",
            complete ? "info" : "warning"
          );
        }
      } catch (err) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `FFF rescan failed: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        }
      }
    },
  });

  pi.registerCommand("fff-stats", {
    description: "Show session search telemetry",
    handler: async (args, ctx) => {
      const t = getTelemetry();
      const elapsed = Math.round((Date.now() - t.sessionStartedAt) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const duration = `${minutes}m ${String(seconds).padStart(2, "0")}s`;
      const estimatedTokens = Math.round(t.totalOutputChars / 4);

      const lines = [
        `FFF Session Stats (${duration})`,
        `  Searches: ${t.grepCalls} grep, ${t.findCalls} find, ${t.multiGrepCalls} multi_grep`,
        `  Zero results: ${t.zeroResultCount} (fallback recovered: ${t.fallbackSuccessCount})`,
        `  Auto-enriched: ${t.autoEnrichmentCount} small result sets`,
        `  Query tracking: ${t.queryTrackCalls} associations recorded`,
        `  Output: ~${t.totalOutputChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens estimated)`,
      ];

      if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
