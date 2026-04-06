/**
 * Type shim for @ff-labs/fff-node v0.5.x.
 * Remove when the real package is installed — its own types will take precedence.
 */
declare module "@ff-labs/fff-node" {
  export type Result<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

  export interface GrepMatch {
    relativePath: string;
    lineNumber: number;
    lineContent: string;
    contextBefore?: string[];
    contextAfter?: string[];
    matchRanges?: Array<{ start: number; end: number }>;
    /** Not yet exposed in v0.5.x — present in FFI but dropped by readGrepMatchFromRaw(). */
    isDefinition?: boolean;
  }

  export interface GrepResult {
    items: GrepMatch[];
    totalMatches?: number;
    regexFallbackError?: string;
  }

  export interface GrepOptions {
    mode?: "plain" | "regex" | "fuzzy";
    ignoreCase?: boolean;
    pageSize?: number;
    offset?: number;
    beforeContext?: number;
    afterContext?: number;
    classifyDefinitions?: boolean;
  }

  export interface FileSearchMatch {
    relativePath: string;
  }

  export interface FileSearchScore {
    total: number;
    exactMatch?: boolean;
  }

  export interface FileSearchResult {
    items: FileSearchMatch[];
    scores: FileSearchScore[];
    totalFiles?: number;
    indexedFiles?: number;
  }

  export interface FileSearchOptions {
    pageSize?: number;
    offset?: number;
  }

  export interface FileFinderOptions {
    basePath: string;
    frecencyDbPath: string;
    historyDbPath: string;
    aiMode?: boolean;
  }

  export interface FileFinder {
    readonly isDestroyed: boolean;
    waitForScan(timeoutMs: number): Promise<Result<boolean>>;
    grep(query: string, options?: GrepOptions): Result<GrepResult>;
    fileSearch(query: string, options?: FileSearchOptions): Result<FileSearchResult>;
    multiGrep(patterns: string[], options?: GrepOptions): Result<GrepResult>;
    /** May not exist in all SDK versions — check at runtime. */
    trackQuery?(query: string, filePath: string): void;
    destroy(): void;
  }

  export const FileFinder: {
    create(options: FileFinderOptions): Result<FileFinder>;
  };

  export function getVersion(): string;
}
