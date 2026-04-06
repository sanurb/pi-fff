import type { GrepMatch, GrepResult as SdkGrepResult, FileSearchMatch, FileSearchScore, FileSearchResult as SdkFileSearchResult } from "@ff-labs/fff-node";

/**
 * Re-export SDK types as the canonical shapes. `import type` is zero-cost —
 * formatters stay pure (no runtime FFF dependency) while eliminating the
 * parallel type + cast ceremony.
 */
export type GrepMatchItem = GrepMatch;
export type { SdkGrepResult as GrepResult };
export type FileSearchItem = FileSearchMatch;
export type { FileSearchScore };
export type { SdkFileSearchResult as FileSearchResult };

export interface FileAnnotation {
  frecencyScore?: number;
  gitStatus?: string;
  fileSizeBytes?: number;
}

export type AnnotationMap = Map<string, FileAnnotation>;

export type OutputMode = "content" | "files_with_matches" | "count";

export interface PaginationCursor {
  readonly id: string;
  readonly query: string;
  readonly offset: number;
  readonly mode: string;
  readonly constraints?: string;
  readonly createdAt: number;
}

export interface SessionTelemetry {
  grepCalls: number;
  findCalls: number;
  multiGrepCalls: number;
  zeroResultCount: number;
  fallbackTriggeredCount: number;
  fallbackSuccessCount: number;
  autoEnrichmentCount: number;
  totalOutputChars: number;
  queryTrackCalls: number;
  sessionStartedAt: number;
}

export interface FallbackResult {
  readonly items: GrepMatchItem[];
  readonly stage: "broaden" | "fuzzy" | "filepath" | "error";
  readonly prefix: string;
  readonly fileSearchPath?: string;
}
