// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __require = import.meta.require;

// src/rate-limiter.ts
class RateLimiter {
  tokens;
  lastRefill;
  maxTokens;
  refillRate;
  constructor(maxRequestsPerSecond = 5) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond;
    this.lastRefill = Date.now();
  }
  async acquire() {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refillTokens();
    this.tokens -= 1;
  }
  refillTokens() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
  setRate(maxRequestsPerSecond) {
    const rate = Number.isFinite(maxRequestsPerSecond) ? maxRequestsPerSecond : 1;
    const safeRate = Math.max(1, Math.floor(rate));
    this.refillTokens();
    this.maxTokens = safeRate;
    this.refillRate = safeRate;
    this.tokens = Math.min(this.tokens, this.maxTokens);
  }
}
var gammaLimiter = new RateLimiter(5);
var clobCriticalLimiter = new RateLimiter(6);
var clobBackgroundLimiter = new RateLimiter(4);
function configureClobLimiters(criticalRps, backgroundRps) {
  clobCriticalLimiter.setRate(criticalRps);
  clobBackgroundLimiter.setRate(backgroundRps);
}

// src/scanner.ts
var GAMMA_API = "https://gamma-api.polymarket.com";
function parseJsonField(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}
async function fetchBtc15MinMarkets() {
  const markets = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const intervalSec = 15 * 60;
  const currentIntervalStart = Math.floor(nowSec / intervalSec) * intervalSec;
  for (let i = 0;i < 2; i++) {
    const timestamp = currentIntervalStart + i * intervalSec;
    const slug = `btc-updown-15m-${timestamp}`;
    try {
      await gammaLimiter.acquire();
      const res = await fetch(`${GAMMA_API}/events?slug=${slug}`);
      if (!res.ok)
        continue;
      const events = await res.json();
      if (!Array.isArray(events) || events.length === 0)
        continue;
      for (const event of events) {
        if (!event.markets || !Array.isArray(event.markets))
          continue;
        for (const market of event.markets) {
          if (market.closed)
            continue;
          const parsed = parseMarket(event, market);
          if (parsed && !markets.find((m) => m.id === parsed.id)) {
            markets.push(parsed);
          }
        }
      }
    } catch (err) {
      console.warn(`[Scanner] Failed to fetch market ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  markets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  return markets;
}
function parseMarket(event, market) {
  try {
    const outcomes = parseJsonField(market.outcomes);
    const outcomePrices = parseJsonField(market.outcomePrices);
    const clobTokenIds = parseJsonField(market.clobTokenIds);
    if (outcomes.length < 2 || clobTokenIds.length < 2) {
      return null;
    }
    return {
      id: market.id,
      slug: event.slug,
      question: market.question || event.title,
      endDate: market.endDate || event.endDate,
      conditionId: market.conditionId || market.condition_id || undefined,
      outcomes,
      outcomePrices,
      clobTokenIds,
      active: market.active !== false,
      closed: market.closed === true,
      acceptingOrders: market.acceptingOrders !== false,
      orderMinSize: Number.isFinite(parseFloat(market.orderMinSize)) ? parseFloat(market.orderMinSize) : undefined,
      orderPriceMinTickSize: Number.isFinite(parseFloat(market.orderPriceMinTickSize)) ? parseFloat(market.orderPriceMinTickSize) : undefined
    };
  } catch (err) {
    console.warn(`[Scanner] Error parsing market: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
function analyzeMarket(market, config, priceOverrides, allowGammaFallback = true) {
  const endDate = new Date(market.endDate);
  const now = new Date;
  const timeRemaining = endDate.getTime() - now.getTime();
  const upIndex = market.outcomes.findIndex((o) => o.toLowerCase() === "up");
  const downIndex = market.outcomes.findIndex((o) => o.toLowerCase() === "down");
  const upTokenId = upIndex >= 0 ? market.clobTokenIds[upIndex] : "";
  const downTokenId = downIndex >= 0 ? market.clobTokenIds[downIndex] : "";
  let upBid = 0, upAsk = 0;
  let downBid = 0, downAsk = 0;
  if (priceOverrides && upTokenId && priceOverrides[upTokenId]) {
    upBid = priceOverrides[upTokenId].bestBid;
    upAsk = priceOverrides[upTokenId].bestAsk;
  }
  if (priceOverrides && downTokenId && priceOverrides[downTokenId]) {
    downBid = priceOverrides[downTokenId].bestBid;
    downAsk = priceOverrides[downTokenId].bestAsk;
  }
  if (allowGammaFallback && upAsk === 0 && upIndex >= 0 && market.outcomePrices[upIndex]) {
    const gammaPrice = parseFloat(market.outcomePrices[upIndex]);
    if (gammaPrice > 0 && gammaPrice <= 1) {
      upAsk = Math.min(gammaPrice + 0.005, 1);
      upBid = Math.max(gammaPrice - 0.005, 0);
    }
  }
  if (allowGammaFallback && downAsk === 0 && downIndex >= 0 && market.outcomePrices[downIndex]) {
    const gammaPrice = parseFloat(market.outcomePrices[downIndex]);
    if (gammaPrice > 0 && gammaPrice <= 1) {
      downAsk = Math.min(gammaPrice + 0.005, 1);
      downBid = Math.max(gammaPrice - 0.005, 0);
    }
  }
  let eligibleSide = null;
  const maxEntry = config.maxEntryPrice ?? 0.99;
  const maxSpread = config.maxSpread ?? 1;
  if (market.acceptingOrders !== false && timeRemaining > 0 && timeRemaining <= config.timeWindowMs) {
    const upSpread = upAsk - upBid;
    const downSpread = downAsk - downBid;
    if (upAsk >= config.entryThreshold && upAsk <= maxEntry && upSpread <= maxSpread) {
      eligibleSide = "UP";
    } else if (downAsk >= config.entryThreshold && downAsk <= maxEntry && downSpread <= maxSpread) {
      eligibleSide = "DOWN";
    }
  }
  return {
    slug: market.slug,
    question: market.question,
    endDate,
    timeRemaining,
    upTokenId,
    downTokenId,
    upAsk,
    downAsk,
    upBid,
    downBid,
    eligibleSide
  };
}
function findEligibleMarkets(markets, config, priceOverrides, allowGammaFallback = true) {
  const analyzed = markets.map((m) => analyzeMarket(m, config, priceOverrides, allowGammaFallback));
  return analyzed.filter((m) => m.eligibleSide !== null);
}
function formatTimeRemaining(ms) {
  if (ms <= 0)
    return "Expired";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor(ms % 60000 / 1000);
  return `${mins}m ${secs}s`;
}
async function fetchMarketResolution(slug) {
  try {
    await gammaLimiter.acquire();
    const res = await fetch(`${GAMMA_API}/events?slug=${slug}`);
    if (!res.ok)
      return null;
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0)
      return null;
    for (const event of events) {
      if (!event.markets || !Array.isArray(event.markets))
        continue;
      for (const market of event.markets) {
        const outcomes = parseJsonField(market.outcomes);
        const outcomePrices = parseJsonField(market.outcomePrices);
        if (outcomes.length < 2 || outcomePrices.length < 2)
          continue;
        const upIndex = outcomes.findIndex((o) => o.toLowerCase() === "up");
        const downIndex = outcomes.findIndex((o) => o.toLowerCase() === "down");
        if (upIndex < 0 || downIndex < 0)
          continue;
        const upPrice = parseFloat(outcomePrices[upIndex]) || 0;
        const downPrice = parseFloat(outcomePrices[downIndex]) || 0;
        if (upPrice > 0.9)
          return "UP";
        if (downPrice > 0.9)
          return "DOWN";
      }
    }
  } catch (err) {
    console.warn(`[Scanner] Error fetching resolution for ${slug}: ${err instanceof Error ? err.message : err}`);
  }
  return null;
}
export {
  formatTimeRemaining,
  findEligibleMarkets,
  fetchMarketResolution,
  fetchBtc15MinMarkets,
  analyzeMarket
};
