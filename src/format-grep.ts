import type { GrepMatchItem, GrepResult, OutputMode, AnnotationMap } from "./types.js";
import { buildFileAnnotation } from "./annotations.js";
import { truncateMatchLine } from "./truncation.js";

export interface FormatGrepOptions {
  outputMode?: OutputMode;
  annotations?: AnnotationMap;
  query?: string;
}

interface FileGroup {
  path: string;
  items: GrepMatchItem[];
  hasDefs: boolean;
}

// Budget scales inversely with file count to keep output token-efficient
const CHAR_BUDGETS: ReadonlyArray<readonly [maxFiles: number, budget: number]> = [
  [3, 5000],
  [8, 3500],
];

const FORMAT_BY_MODE: Record<OutputMode, (r: GrepResult, a: AnnotationMap) => string> = {
  count: formatCountMode,
  files_with_matches: formatFilesMode,
  content: formatContentMode,
};

export function formatGrepOutput(
  result: GrepResult,
  options: FormatGrepOptions = {}
): string {
  const { outputMode = "content", annotations = new Map() } = options;
  if (result.items.length === 0) return "";
  return FORMAT_BY_MODE[outputMode](result, annotations);
}

function formatCountMode(result: GrepResult, annotations: AnnotationMap): string {
  const counts = new Map<string, number>();
  for (const item of result.items) {
    counts.set(item.relativePath, (counts.get(item.relativePath) ?? 0) + 1);
  }

  const lines: string[] = [];
  for (const [path, count] of counts) {
    const ann = annotations.get(path);
    const suffix = ann ? buildFileAnnotation(ann) : "";
    lines.push(`${path}: ${count}${suffix}`);
  }
  return lines.join("\n");
}

function formatFilesMode(result: GrepResult, annotations: AnnotationMap): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const item of result.items) {
    if (seen.has(item.relativePath)) continue;
    seen.add(item.relativePath);
    const ann = annotations.get(item.relativePath);
    const suffix = ann ? buildFileAnnotation(ann) : "";
    lines.push(`${item.relativePath}${suffix}`);
  }
  return lines.join("\n");
}

function formatContentMode(result: GrepResult, annotations: AnnotationMap): string {
  const hasDefSupport = result.items.length > 0 && "isDefinition" in result.items[0];
  const groups = groupByFile(result.items);
  const uniqueFiles = groups.length;
  const anyDefs = hasDefSupport && groups.some((g) => g.hasDefs);

  // Import suppression only makes sense when we have definition context
  const filteredGroups = anyDefs
    ? groups.map((g) => suppressImports(g)).filter((g) => g.items.length > 0)
    : groups;

  if (hasDefSupport) {
    filteredGroups.sort((a, b) => {
      if (a.hasDefs && !b.hasDefs) return -1;
      if (!a.hasDefs && b.hasDefs) return 1;
      return 0;
    });
  }

  const readDirective = buildReadDirective(filteredGroups, hasDefSupport);

  const budget = CHAR_BUDGETS.find(([max]) => uniqueFiles <= max)?.[1] ?? 2500;

  const lines: string[] = [];
  if (readDirective) lines.push(readDirective);

  let charCount = lines.join("\n").length;
  let truncatedMatches = 0;
  let truncatedFiles = 0;

  for (let gi = 0; gi < filteredGroups.length; gi++) {
    const group = filteredGroups[gi];
    const ann = annotations.get(group.path);
    const fileAnnotation = ann ? buildFileAnnotation(ann) : "";

    let fileMatchCount = 0;
    let fileOverflow = 0;
    const isFirstDef = hasDefSupport && group.hasDefs;

    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      const isDef = hasDefSupport && item.isDefinition;

      // Cap at 5 matches per file; definitions bypass the cap
      if (!isDef && fileMatchCount >= 5) {
        fileOverflow++;
        continue;
      }

      const truncatedLine = truncateMatchLine(item.lineContent, item.matchRanges);
      let line: string;

      if (i === 0) {
        const defTag = isFirstDef ? " [def]" : "";
        line = `${item.relativePath}:${item.lineNumber}: ${truncatedLine}${defTag}${fileAnnotation}`;
      } else {
        const defTag = isDef ? " [def]" : "";
        line = ` ${item.lineNumber}: ${truncatedLine}${defTag}`;
      }

      if (charCount + line.length + 1 > budget) {
        for (let ri = gi; ri < filteredGroups.length; ri++) {
          if (ri === gi) {
            truncatedMatches += group.items.length - i;
          } else {
            truncatedMatches += filteredGroups[ri].items.length;
            truncatedFiles++;
          }
        }
        if (truncatedMatches > 0 || truncatedFiles > 0) {
          lines.push(`... +${truncatedMatches} more matches across ${truncatedFiles + 1} files`);
        }
        return lines.join("\n");
      }

      lines.push(line);
      charCount += line.length + 1;
      fileMatchCount++;

      if (isDef && item.contextAfter && item.contextAfter.length > 0) {
        // First def gets more context (8 lines) to show full body; subsequent get 5
        const bodyLimit = i === 0 ? 8 : 5;
        for (const bodyLine of item.contextAfter.slice(0, bodyLimit)) {
          const bl = ` | ${bodyLine}`;
          if (charCount + bl.length + 1 > budget) break;
          lines.push(bl);
          charCount += bl.length + 1;
        }
      }
    }

    if (fileOverflow > 0) {
      const overflowLine = `  +${fileOverflow} more in this file`;
      lines.push(overflowLine);
      charCount += overflowLine.length + 1;
    }
  }

  return lines.join("\n");
}

function groupByFile(items: readonly GrepMatchItem[]): FileGroup[] {
  const map = new Map<string, GrepMatchItem[]>();
  for (const item of items) {
    const arr = map.get(item.relativePath);
    if (arr) arr.push(item);
    else map.set(item.relativePath, [item]);
  }
  return Array.from(map.entries()).map(([path, fileItems]) => ({
    path,
    items: fileItems,
    hasDefs: fileItems.some((i) => i.isDefinition === true),
  }));
}

const IMPORT_PREFIXES = ["import ", "from '", 'from "', "use ", "require(", "#include"];

function suppressImports(group: FileGroup): FileGroup {
  const filtered = group.items.filter((item) => {
    if (item.isDefinition) return true;
    const trimmed = item.lineContent.trim();
    return !IMPORT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  });
  return { ...group, items: filtered, hasDefs: group.hasDefs };
}

function buildReadDirective(groups: FileGroup[], hasDefSupport: boolean): string {
  if (groups.length === 0) return "";
  if (groups.length === 1) return `→ Read ${groups[0].path} (only match)`;

  if (hasDefSupport) {
    const defGroup = groups.find((g) => g.hasDefs);
    if (defGroup) return `→ Read ${defGroup.path} [def]`;
  }

  if (groups.length <= 3) return `→ Read ${groups[0].path} (best match)`;
  return "";
}
