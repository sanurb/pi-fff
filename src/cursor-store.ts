import type { PaginationCursor } from "./types.js";
import { randomBytes } from "crypto";

const cursors = new Map<string, PaginationCursor>();

export function resetCursors(): void {
  cursors.clear();
}

export function createCursor(
  query: string,
  offset: number,
  mode: string,
  constraints?: string
): string {
  const id = randomBytes(6).toString("hex");
  cursors.set(id, { id, query, offset, mode, constraints, createdAt: Date.now() });
  return id;
}

export function getCursor(id: string): PaginationCursor | null {
  return cursors.get(id) ?? null;
}

