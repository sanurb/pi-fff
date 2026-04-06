const MAX_LINE_LENGTH = 500;

export interface MatchRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Match ranges are relative to the original (untrimmed) line,
 * so we adjust for leading whitespace before windowing.
 */
export function truncateMatchLine(
  line: string,
  matchRanges?: readonly MatchRange[]
): string {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_LINE_LENGTH) return trimmed;

  if (matchRanges && matchRanges.length > 0) {
    const leadingWhitespace = line.length - line.trimStart().length;
    const adjusted: MatchRange = {
      start: Math.max(0, matchRanges[0].start - leadingWhitespace),
      end: Math.max(0, matchRanges[0].end - leadingWhitespace),
    };
    return truncateAroundMatch(trimmed, adjusted);
  }

  return trimmed.slice(0, MAX_LINE_LENGTH - 1) + "…";
}

/** 1/3 budget before the match, 2/3 after — biased toward showing what follows a symbol. */
function truncateAroundMatch(line: string, range: MatchRange): string {
  const matchLen = range.end - range.start;
  const budget = MAX_LINE_LENGTH - matchLen;

  if (budget <= 0) {
    return "…" + line.slice(range.start, range.start + MAX_LINE_LENGTH - 2) + "…";
  }

  const beforeBudget = Math.floor(budget / 3);
  const afterBudget = budget - beforeBudget;

  const windowStart = Math.max(0, range.start - beforeBudget);
  const windowEnd = Math.min(line.length, range.end + afterBudget);

  let result = line.slice(windowStart, windowEnd);
  if (windowStart > 0) result = "…" + result;
  if (windowEnd < line.length) result = result + "…";

  return result;
}
