export type MarketTimeframe = "5m" | "15m";

export interface MarketTimeframeProfile {
  timeframe: MarketTimeframe;
  slugPrefix: string;
  intervalSec: number;
  intervalMs: number;
  displayLabel: string;
}

const TIMEFRAME_PROFILES: Record<MarketTimeframe, MarketTimeframeProfile> = {
  "5m": {
    timeframe: "5m",
    slugPrefix: "btc-updown-5m",
    intervalSec: 5 * 60,
    intervalMs: 5 * 60 * 1000,
    displayLabel: "5-MIN",
  },
  "15m": {
    timeframe: "15m",
    slugPrefix: "btc-updown-15m",
    intervalSec: 15 * 60,
    intervalMs: 15 * 60 * 1000,
    displayLabel: "15-MIN",
  },
};

const SLUG_PATTERN = /^btc-updown-(5m|15m)-(\d+)$/;

export function isMarketTimeframe(value: unknown): value is MarketTimeframe {
  return value === "5m" || value === "15m";
}

export function getMarketTimeframeProfile(timeframe: MarketTimeframe): MarketTimeframeProfile {
  return TIMEFRAME_PROFILES[timeframe];
}

export function buildMarketSlug(timeframe: MarketTimeframe, startTimestampSec: number): string {
  return `${getMarketTimeframeProfile(timeframe).slugPrefix}-${startTimestampSec}`;
}

export function parseMarketSlug(slug: string): { timeframe: MarketTimeframe; startTimestampSec: number } | null {
  const match = slug.match(SLUG_PATTERN);
  if (!match) return null;

  const timeframe = match[1] as MarketTimeframe;
  const startTimestampSec = Number.parseInt(match[2], 10);
  if (!Number.isFinite(startTimestampSec)) return null;

  return { timeframe, startTimestampSec };
}

export function getMarketEndDateFromSlug(slug: string): Date | null {
  const parsed = parseMarketSlug(slug);
  if (!parsed) return null;

  const profile = getMarketTimeframeProfile(parsed.timeframe);
  const startTimestampMs = parsed.startTimestampSec * 1000;
  return new Date(startTimestampMs + profile.intervalMs);
}
