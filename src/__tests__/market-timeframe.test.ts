import { describe, expect, test } from "bun:test";
import { generateMarketSlugs } from "../backtest/data-fetcher";
import {
  buildMarketSlug,
  getMarketEndDateFromSlug,
  getMarketTimeframeProfile,
  isMarketTimeframe,
  parseMarketSlug,
} from "../market-timeframe";

describe("Market timeframe helpers", () => {
  test("validates timeframe values", () => {
    expect(isMarketTimeframe("5m")).toBe(true);
    expect(isMarketTimeframe("15m")).toBe(true);
    expect(isMarketTimeframe("1m")).toBe(false);
  });

  test("builds and parses market slugs", () => {
    const slug = buildMarketSlug("5m", 1700000000);
    expect(slug).toBe("btc-updown-5m-1700000000");

    const parsed = parseMarketSlug(slug);
    expect(parsed).not.toBeNull();
    expect(parsed?.timeframe).toBe("5m");
    expect(parsed?.startTimestampSec).toBe(1700000000);
  });

  test("computes end date from slug", () => {
    const fiveMinute = getMarketEndDateFromSlug("btc-updown-5m-1700000000");
    const fifteenMinute = getMarketEndDateFromSlug("btc-updown-15m-1700000000");
    expect(fiveMinute?.getTime()).toBe((1700000000 + 5 * 60) * 1000);
    expect(fifteenMinute?.getTime()).toBe((1700000000 + 15 * 60) * 1000);
  });
});

describe("Backtest slug generation by timeframe", () => {
  test("generates 5m slugs on 300s boundaries", () => {
    const start = new Date("2024-01-01T00:01:00.000Z");
    const end = new Date("2024-01-01T00:12:00.000Z");
    const slugs = generateMarketSlugs(start, end, "5m");

    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs.every(slug => slug.startsWith("btc-updown-5m-"))).toBe(true);

    const timestamps = slugs.map(slug => parseMarketSlug(slug)?.startTimestampSec || 0);
    const firstInterval = Math.ceil(Math.floor(start.getTime() / 1000) / getMarketTimeframeProfile("5m").intervalSec) * getMarketTimeframeProfile("5m").intervalSec;
    expect(timestamps[0]).toBe(firstInterval);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBe(300);
    }
  });

  test("generates 15m slugs on 900s boundaries", () => {
    const start = new Date("2024-01-01T00:01:00.000Z");
    const end = new Date("2024-01-01T00:40:00.000Z");
    const slugs = generateMarketSlugs(start, end, "15m");

    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs.every(slug => slug.startsWith("btc-updown-15m-"))).toBe(true);

    const timestamps = slugs.map(slug => parseMarketSlug(slug)?.startTimestampSec || 0);
    const firstInterval = Math.ceil(Math.floor(start.getTime() / 1000) / getMarketTimeframeProfile("15m").intervalSec) * getMarketTimeframeProfile("15m").intervalSec;
    expect(timestamps[0]).toBe(firstInterval);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBe(900);
    }
  });
});
