import type { FileSearchResult, AnnotationMap } from "./types.js";
import { buildFileAnnotation } from "./annotations.js";

export interface FormatFindOptions {
  annotations?: AnnotationMap;
  query?: string;
}

export function formatFindOutput(
  result: FileSearchResult,
  options: FormatFindOptions = {}
): string {
  const { annotations = new Map() } = options;
  if (result.items.length === 0) return "";

  const lines: string[] = [];

  if (result.scores.length > 0 && result.scores[0].exactMatch) {
    lines.push(`→ Read ${result.items[0].relativePath} (exact match!)`);
  }

  for (const item of result.items) {
    const ann = annotations.get(item.relativePath);
    const suffix = ann ? buildFileAnnotation(ann) : "";
    lines.push(`${item.relativePath}${suffix}`);
  }

  const total = result.totalFiles ?? result.items.length;
  const indexed = result.indexedFiles;
  const summary = indexed != null
    ? `[${result.items.length}/${total} matches (${indexed} indexed)]`
    : `[${result.items.length}/${total} matches]`;
  lines.push(summary);

  return lines.join("\n");
}
