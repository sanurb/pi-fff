/**
 * pi-cmux-workflows — extension entrypoint.
 *
 * Registers a focused set of workflow slash commands for Pi + cmux.
 * Workflows: /split, /review, /open, /handoff
 *
 * Guards:
 * 1. PI_CMUX_CHILD=1 → bail (prevents recursive spawning)
 * 2. cmux ping → bail if cmux is not available
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isAvailable } from "./cmux.js";
import { debug } from "./debug.js";

import splitWorkflow from "./workflows/split.js";
import reviewWorkflow from "./workflows/review.js";
import openProjectWorkflow from "./workflows/open-project.js";
import handoffWorkflow from "./workflows/handoff.js";

const MODULE = "init";

export default async function piCmuxWorkflows(pi: ExtensionAPI): Promise<void> {
  // Guard: prevent recursive spawn
  if (process.env.PI_CMUX_CHILD === "1") {
    debug(MODULE, "skipping — running as child process");
    return;
  }

  // Guard: cmux must be available
  const available = await isAvailable(pi);
  if (!available) {
    debug(MODULE, "skipping — cmux not available");
    return;
  }

  debug(MODULE, "registering workflows");

  splitWorkflow(pi);
  reviewWorkflow(pi);
  openProjectWorkflow(pi);
  handoffWorkflow(pi);

  debug(MODULE, "pi-cmux-workflows ready");
}
