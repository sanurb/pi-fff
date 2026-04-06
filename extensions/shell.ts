/**
 * Shell escaping and Pi command construction.
 *
 * All shell command building goes through this module.
 * Prevents injection and ensures predictable quoting.
 */

/** Single-quote escape for POSIX shells. */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Build a shell command that launches Pi in a given directory.
 *
 * Output: cd '<cwd>' && exec pi [--session '<file>'] ['<prompt>']
 */
export function buildPiCommand(
  cwd: string,
  options?: { sessionFile?: string; prompt?: string },
): string {
  const parts = ["cd", shellEscape(cwd), "&&", "exec", "pi"];

  if (options?.sessionFile) {
    parts.push("--session", shellEscape(options.sessionFile));
  }

  const prompt = options?.prompt?.trim();
  if (prompt) {
    parts.push(shellEscape(prompt));
  }

  return parts.join(" ");
}
