/**
 * Conditional stderr debug logging.
 *
 * Enable with PI_CMUX_WORKFLOWS_DEBUG=1
 */

const ENABLED = process.env.PI_CMUX_WORKFLOWS_DEBUG === "1";

export function debug(module: string, message: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  process.stderr.write(`[pi-cmux-workflows:${module}] ${message}${payload}\n`);
}
