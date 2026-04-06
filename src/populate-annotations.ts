import type { FileFinder } from "@ff-labs/fff-node";
import type { AnnotationMap, FileAnnotation } from "./types.js";

/**
 * Probes for SDK annotation APIs at runtime — these aren't in fff-node v0.5.x
 * but may appear in future versions. Degrades gracefully to empty annotations.
 */
export function populateAnnotations(
  finder: FileFinder,
  paths: ReadonlySet<string>
): AnnotationMap {
  const map: AnnotationMap = new Map();
  if (paths.size === 0) return map;

  const hasGetFileInfo = typeof (finder as any).getFileInfo === "function";
  const hasGetGitStatus = typeof (finder as any).getGitStatus === "function";
  const hasGetFrecencyScore = typeof (finder as any).getFrecencyScore === "function";

  for (const path of paths) {
    const annotation: FileAnnotation = {};

    if (hasGetFileInfo) {
      try {
        const info = (finder as any).getFileInfo(path);
        if (info?.ok && info.value) {
          annotation.frecencyScore = info.value.frecencyScore ?? info.value.frecency;
          annotation.gitStatus = info.value.gitStatus ?? info.value.status;
          annotation.fileSizeBytes = info.value.sizeBytes ?? info.value.size;
        }
      } catch { /* best effort */ }
    }

    if (annotation.frecencyScore == null && hasGetFrecencyScore) {
      try {
        const result = (finder as any).getFrecencyScore(path);
        if (result?.ok) annotation.frecencyScore = result.value;
      } catch { /* best effort */ }
    }

    if (annotation.gitStatus == null && hasGetGitStatus) {
      try {
        const result = (finder as any).getGitStatus(path);
        if (result?.ok) annotation.gitStatus = result.value;
      } catch { /* best effort */ }
    }

    if (
      annotation.frecencyScore != null ||
      annotation.gitStatus != null ||
      annotation.fileSizeBytes != null
    ) {
      map.set(path, annotation);
    }
  }

  return map;
}

export function uniquePaths(
  items: ReadonlyArray<{ relativePath: string }>
): Set<string> {
  return new Set(items.map((i) => i.relativePath));
}
