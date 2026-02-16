import { describe, expect, test } from "bun:test";
import { analyzeMarket, findEligibleMarkets, type Market } from "../scanner";

function createMarket(): Market {
  const now = Date.now();
  return {
    id: "market-1",
    slug: "btc-updown-15m-test",
    question: "Test",
    endDate: new Date(now + 2 * 60 * 1000).toISOString(),
    outcomes: ["Up", "Down"],
    outcomePrices: ["0.96", "0.04"],
    clobTokenIds: ["up-token", "down-token"],
    active: true,
    closed: false,
    acceptingOrders: true,
    orderMinSize: 5,
    orderPriceMinTickSize: 0.01
  };
}

describe("Scanner gamma fallback control", () => {
  test("uses gamma fallback when enabled", () => {
    const market = createMarket();
    const analyzed = analyzeMarket(
      market,
      {
        entryThreshold: 0.9,
        timeWindowMs: 5 * 60 * 1000,
        maxEntryPrice: 0.99,
        maxSpread: 0.05
      },
      undefined,
      true
    );

    expect(analyzed.upAsk).toBeGreaterThan(0);
    expect(analyzed.eligibleSide).toBe("UP");
  });

  test("blocks synthetic gamma entry when fallback disabled", () => {
    const market = createMarket();
    const analyzed = analyzeMarket(
      market,
      {
        entryThreshold: 0.9,
        timeWindowMs: 5 * 60 * 1000,
        maxEntryPrice: 0.99,
        maxSpread: 0.05
      },
      undefined,
      false
    );

    expect(analyzed.upAsk).toBe(0);
    expect(analyzed.eligibleSide).toBeNull();
  });

  test("findEligibleMarkets respects fallback flag", () => {
    const markets = [createMarket()];
    const withFallback = findEligibleMarkets(
      markets,
      {
        entryThreshold: 0.9,
        timeWindowMs: 5 * 60 * 1000,
        maxEntryPrice: 0.99,
        maxSpread: 0.05
      },
      undefined,
      true
    );
    const withoutFallback = findEligibleMarkets(
      markets,
      {
        entryThreshold: 0.9,
        timeWindowMs: 5 * 60 * 1000,
        maxEntryPrice: 0.99,
        maxSpread: 0.05
      },
      undefined,
      false
    );

    expect(withFallback.length).toBe(1);
    expect(withoutFallback.length).toBe(0);
  });
});
