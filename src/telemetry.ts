import type { SessionTelemetry } from "./types.js";

let telemetry: SessionTelemetry = createFresh();

function createFresh(): SessionTelemetry {
  return {
    grepCalls: 0,
    findCalls: 0,
    multiGrepCalls: 0,
    zeroResultCount: 0,
    fallbackTriggeredCount: 0,
    fallbackSuccessCount: 0,
    autoEnrichmentCount: 0,
    totalOutputChars: 0,
    queryTrackCalls: 0,
    sessionStartedAt: Date.now(),
  };
}

export function resetTelemetry(): void {
  telemetry = createFresh();
}

export function getTelemetry(): Readonly<SessionTelemetry> {
  return telemetry;
}

export function incGrep(): void { telemetry.grepCalls++; }
export function incFind(): void { telemetry.findCalls++; }
export function incMultiGrep(): void { telemetry.multiGrepCalls++; }
export function incZeroResult(): void { telemetry.zeroResultCount++; }
export function incFallbackTriggered(): void { telemetry.fallbackTriggeredCount++; }
export function incFallbackSuccess(): void { telemetry.fallbackSuccessCount++; }
export function incAutoEnrichment(): void { telemetry.autoEnrichmentCount++; }
export function incQueryTrack(): void { telemetry.queryTrackCalls++; }
export function addOutputChars(n: number): void { telemetry.totalOutputChars += n; }
