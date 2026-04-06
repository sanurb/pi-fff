import type { FileAnnotation } from "./types.js";

const FRECENCY_TIERS: ReadonlyArray<readonly [threshold: number, label: string]> = [
  [100, "hot"],
  [50, "warm"],
  [10, "frequent"],
];

export function frecencyLabel(score: number | undefined): string {
  if (score == null) return "";
  return FRECENCY_TIERS.find(([threshold]) => score >= threshold)?.[1] ?? "";
}

export function gitAnnotation(status: string | undefined): string {
  if (!status || status === "clean") return "";
  return `git:${status}`;
}

/** 20KB threshold — above this, the agent should use offset-based reads. */
export function sizeWarning(bytes: number | undefined): string {
  if (bytes == null || bytes <= 20_480) return "";
  const kb = Math.round(bytes / 1024);
  return `(${kb}KB — use offset to read relevant section)`;
}

export function buildFileAnnotation(annotation: FileAnnotation): string {
  const parts: string[] = [];

  const freq = frecencyLabel(annotation.frecencyScore);
  if (freq) parts.push(freq);

  const git = gitAnnotation(annotation.gitStatus);
  if (git) parts.push(git);

  const size = sizeWarning(annotation.fileSizeBytes);
  if (size) parts.push(size);

  if (parts.length === 0) return "";
  return `  - ${parts.join(" ")}`;
}
