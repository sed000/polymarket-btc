import { ClobClient, OrderType, Side, type TickSize } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { clobBackgroundLimiter, clobCriticalLimiter } from "./rate-limiter";

const CLOB_API = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon

// Polymarket minimum order size in shares
export const MIN_ORDER_SIZE = 5;

// Legacy fee-rate constant kept for compatibility.
// Live orders now resolve fee rates from the market dynamically.
export const ORDER_FEE_RATE_BPS = 1000;

// Signature types for different wallet types
// 0 = EOA (MetaMask direct)
// 1 = Poly Proxy (Magic.link / email sign-up)
// 2 = Gnosis Safe
export type SignatureType = 0 | 1 | 2;

export interface Position {
  tokenId: string;
  side: "UP" | "DOWN";
  shares: number;
  entryPrice: number;
  marketSlug: string;
}

export interface ApiCreds {
  key: string;
  secret: string;
  passphrase: string;
}

export interface MarketConstraints {
  minOrderSize: number;
  tickSize: number;
  feeRateBps: number;
}

export interface MarketSellResult {
  orderIds: string[];
  filledShares: number;
  remainingShares: number;
  avgPrice: number;
}

export class Trader {
  private client: ClobClient | null = null;
  private signer: Wallet;
  private initialized = false;
  private initError: string | null = null;
  private lastMarketSellError: string | null = null;
  private apiCreds: ApiCreds | null = null;
  private signatureType: SignatureType;
  private funderAddress: string | undefined;
  private marketConstraintsCache: Map<string, { constraints: MarketConstraints; cachedAt: number }> = new Map();

  constructor(privateKey: string, signatureType: SignatureType = 1, funderAddress?: string) {
    this.signer = new Wallet(privateKey);
    this.signatureType = signatureType;
    this.funderAddress = funderAddress;
  }

  async init(): Promise<void> {
    try {
      let creds: { key: string; secret: string; passphrase: string };

      // Check if API credentials are provided via environment
      const envKey = process.env.POLY_API_KEY;
      const envSecret = process.env.POLY_API_SECRET;
      const envPassphrase = process.env.POLY_API_PASSPHRASE;

      if (envKey && envSecret && envPassphrase) {
        // Use provided credentials
        creds = { key: envKey, secret: envSecret, passphrase: envPassphrase };
      } else {
        // Auto-generate credentials from wallet
        // For proxy wallets, need to pass funder address
        const tempClient = new ClobClient(
          CLOB_API,
          CHAIN_ID,
          this.signer,
          undefined,
          this.signatureType,
          this.funderAddress
        );
        // Use createOrDeriveApiKey - creates if not exists, derives if exists
        creds = await tempClient.createOrDeriveApiKey();
      }

      // Store credentials for WebSocket auth
      this.apiCreds = {
        key: creds.key,
        secret: creds.secret,
        passphrase: creds.passphrase
      };

      // Create authenticated client with funder address for proxy wallets
      this.client = new ClobClient(
        CLOB_API,
        CHAIN_ID,
        this.signer,
        creds,
        this.signatureType, // 0=EOA, 1=Poly Proxy (Magic.link), 2=Gnosis Safe
        this.funderAddress  // Proxy wallet address (required for signature type 1)
      );
      this.initialized = true;
    } catch (err: any) {
      // Extract clean error message
      if (err?.response?.data?.error) {
        this.initError = err.response.data.error;
      } else if (err?.message) {
        this.initError = err.message;
      } else {
        this.initError = "Could not connect to CLOB API";
      }
      // Don't log verbose error - it's handled in bot.ts
    }
  }

  isReady(): boolean {
    return this.initialized && this.client !== null;
  }

  getInitError(): string | null {
    return this.initError;
  }

  getApiCreds(): ApiCreds | null {
    return this.apiCreds;
  }

  getLastMarketSellError(): string | null {
    return this.lastMarketSellError;
  }

  private ensureClient(): ClobClient {
    if (!this.client) throw new Error("Trader not initialized. Call init() first.");
    return this.client;
  }

  private isBalanceAllowanceError(msg: string): boolean {
    return msg.includes("balance") || msg.includes("allowance");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private normalizeTickSize(value: string | number | undefined): number {
    const parsed = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0.01;
    }
    return parsed;
  }

  private normalizePriceForTick(price: number, tickSize: number): number {
    const minPrice = tickSize;
    const maxPrice = Math.max(minPrice, 1 - tickSize);
    const clamped = Math.min(maxPrice, Math.max(minPrice, price));
    return Math.round(clamped / tickSize) * tickSize;
  }

  private toTickSizeString(tickSize: number): TickSize {
    if (tickSize >= 0.1) return "0.1";
    if (tickSize >= 0.01) return "0.01";
    if (tickSize >= 0.001) return "0.001";
    return "0.0001";
  }

  async getMarketConstraints(tokenId: string, forceRefresh = false): Promise<MarketConstraints | null> {
    const client = this.ensureClient();
    const now = Date.now();
    const cached = this.marketConstraintsCache.get(tokenId);
    const cacheTtlMs = 5 * 60 * 1000;
    if (!forceRefresh && cached && now - cached.cachedAt < cacheTtlMs) {
      return cached.constraints;
    }

    try {
      await clobBackgroundLimiter.acquire();
      const book = await client.getOrderBook(tokenId);

      await clobBackgroundLimiter.acquire();
      const feeRateBps = await client.getFeeRateBps(tokenId);

      const constraints: MarketConstraints = {
        minOrderSize: parseFloat(book.min_order_size || "0") || MIN_ORDER_SIZE,
        tickSize: this.normalizeTickSize(book.tick_size),
        feeRateBps: Number.isFinite(feeRateBps) ? feeRateBps : 0
      };
      this.marketConstraintsCache.set(tokenId, { constraints, cachedAt: now });
      return constraints;
    } catch (err) {
      console.error(`[Trader] Failed to fetch market constraints: ${err instanceof Error ? err.message : err}`);
      if (cached) {
        return cached.constraints;
      }
      return null;
    }
  }

  private async validateAndAdjustShares(
    tokenId: string,
    shares: number,
    logPrefix = "",
    allowBelowMin = false
  ): Promise<number | null> {
    const positionBalance = await this.getPositionBalance(tokenId);
    const prefix = logPrefix ? `${logPrefix} ` : "";

    // Handle API error
    if (positionBalance === null) {
      console.error(`${prefix}API error fetching position balance`);
      return null;
    }

    if (positionBalance < 0.01) {
      console.error(`${prefix}No position to sell (balance: ${positionBalance.toFixed(4)})`);
      return null;
    }

    const sharesToSell = Math.min(shares, positionBalance);

    if (sharesToSell < 0.01) {
      console.error(`${prefix}Shares to sell too small: ${sharesToSell.toFixed(4)}`);
      return null;
    }

    const constraints = await this.getMarketConstraints(tokenId);
    const minOrderSize = constraints?.minOrderSize || MIN_ORDER_SIZE;
    if (!allowBelowMin && sharesToSell < minOrderSize) {
      console.error(`${prefix}Actual balance ${sharesToSell.toFixed(2)} below minimum ${minOrderSize.toFixed(2)} shares`);
      return null;
    }

    if (sharesToSell < shares * 0.99) {
      console.log(`${prefix}Adjusted sell: ${shares.toFixed(2)} → ${sharesToSell.toFixed(2)} (actual balance)`);
    }

    return sharesToSell;
  }

  async getBalance(): Promise<number | null> {
    const client = this.ensureClient();
    // Get USDC balance from the exchange
    try {
      await clobBackgroundLimiter.acquire();
      const balances = await client.getBalanceAllowance({
        asset_type: "COLLATERAL"
      });
      const rawBalance = parseFloat(balances.balance || "0");
      // USDC has 6 decimals on Polygon - API returns raw micro-units
      // 22828636 micro-USDC = $22.83
      return rawBalance / 1_000_000;
    } catch (err) {
      console.error(`[Trader] getBalance API error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * Get the position balance for a specific token (outcome shares owned)
   * Returns null on API error (distinguish from actual 0 balance)
   */
  async getPositionBalance(tokenId: string): Promise<number | null> {
    const client = this.ensureClient();
    try {
      await clobBackgroundLimiter.acquire();
      const balances = await client.getBalanceAllowance({
        asset_type: "CONDITIONAL",
        token_id: tokenId
      });
      // Conditional token balances are returned in micro-units (6 decimals)
      // Convert to shares by dividing by 1e6
      const rawBalance = parseFloat(balances.balance || "0");
      return rawBalance / 1e6;
    } catch (err) {
      console.error(`[Trader] getPositionBalance API error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * Wait for position balance to be available (settlement)
   * Returns true if position settled, false if timeout or API errors persist
   */
  async waitForPositionBalance(tokenId: string, minShares: number, timeoutMs: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every 1 second
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    while (Date.now() - startTime < timeoutMs) {
      const balance = await this.getPositionBalance(tokenId);

      if (balance === null) {
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`[Trader] waitForPositionBalance: ${maxConsecutiveErrors} consecutive API errors`);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      consecutiveErrors = 0;
      if (balance >= minShares * 0.99) { // Allow 1% tolerance for rounding
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    return false;
  }

  async getPrice(tokenId: string): Promise<{ bid: number; ask: number; mid: number }> {
    const client = this.ensureClient();
    try {
      await clobCriticalLimiter.acquire();
      const book = await client.getOrderBook(tokenId);
      const bestBid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : 0;
      const bestAsk = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 1;
      return {
        bid: bestBid,
        ask: bestAsk,
        mid: (bestBid + bestAsk) / 2
      };
    } catch {
      return { bid: 0, ask: 1, mid: 0.5 };
    }
  }

  async buy(tokenId: string, price: number, usdcAmount: number): Promise<{ orderId: string; shares: number } | null> {
    const client = this.ensureClient();
    const constraints = await this.getMarketConstraints(tokenId);
    if (!constraints) {
      console.error("Failed to load market constraints");
      return null;
    }
    const tickSize = constraints.tickSize;
    const minOrderSize = constraints.minOrderSize;
    const safePrice = this.normalizePriceForTick(price, tickSize);

    // Validate price against the market's tick range.
    if (safePrice <= 0 || safePrice >= 1) {
      console.error(`Invalid buy price: $${safePrice.toFixed(4)}`);
      return null;
    }

    // Calculate shares: shares = usdc / price
    const shares = Math.floor((usdcAmount / safePrice) * 100) / 100; // Round down to 2 decimals

    if (shares <= 0) {
      console.error("Insufficient funds for purchase");
      return null;
    }

    if (shares < minOrderSize) {
      console.error(
        `Order size ${shares.toFixed(2)} below minimum ${minOrderSize.toFixed(2)} shares ` +
        `(need $${(minOrderSize * safePrice).toFixed(2)} USDC)`
      );
      return null;
    }

    try {
      await clobBackgroundLimiter.acquire();
      const response = await client.createAndPostOrder({
        tokenID: tokenId,
        price: safePrice,
        size: shares,
        side: Side.BUY
      }, {
        tickSize: this.toTickSizeString(tickSize)
      });

      if (response.success) {
        return {
          orderId: response.orderID || "",
          shares
        };
      }
      console.error("Order failed:", response.errorMsg);
      return null;
    } catch (err) {
      console.error("Buy error:", err);
      return null;
    }
  }

  async limitSell(tokenId: string, shares: number, price: number, maxRetries: number = 3): Promise<{ orderId: string; price: number } | null> {
    const client = this.ensureClient();
    const constraints = await this.getMarketConstraints(tokenId);
    if (!constraints) {
      console.error("Failed to load market constraints for limit sell");
      return null;
    }
    const tickSize = constraints.tickSize;
    const minOrderSize = constraints.minOrderSize;

    // Validate input shares
    if (!shares || shares < 0.01) {
      console.error(`Invalid shares to sell: ${shares}`);
      return null;
    }

    if (shares < minOrderSize) {
      console.error(`Limit sell size ${shares.toFixed(2)} below minimum ${minOrderSize.toFixed(2)} shares - position too small to sell`);
      return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const sharesToSell = await this.validateAndAdjustShares(tokenId, shares, "");
        if (sharesToSell === null) return null;

        const safePrice = this.normalizePriceForTick(price, tickSize);
        if (safePrice <= 0 || safePrice >= 1) {
          console.error(`Invalid limit price: $${safePrice.toFixed(4)}`);
          return null;
        }

        await clobBackgroundLimiter.acquire();
        const response = await client.createAndPostOrder({
          tokenID: tokenId,
          price: safePrice,
          size: sharesToSell,
          side: Side.SELL
        }, {
          tickSize: this.toTickSizeString(tickSize)
        });

        if (response.success) {
          return {
            orderId: response.orderID || "",
            price: safePrice
          };
        }

        if (this.isBalanceAllowanceError(response.errorMsg || "")) {
          console.log(`Sell failed due to balance/allowance (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        console.error("Limit sell failed:", response.errorMsg);
        return null;
      } catch (err: any) {
        if (this.isBalanceAllowanceError(err?.toString() || "")) {
          console.log(`Sell error due to balance/allowance (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        console.error("Limit sell error:", err);
        return null;
      }
    }

    console.error("Limit sell failed after all retries");
    return null;
  }

  async marketSell(
    tokenId: string,
    shares: number,
    bidOverride?: number,
    maxRetries: number = 3
  ): Promise<MarketSellResult | null> {
    const client = this.ensureClient();
    this.lastMarketSellError = null;
    const retryBackoffMs = [250, 500, 1000];

    // Validate input shares
    if (!shares || shares < 0.01) {
      const errMsg = `[STOP-LOSS] Invalid shares to sell: ${shares}`;
      this.lastMarketSellError = errMsg;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const constraints = await this.getMarketConstraints(tokenId);
    if (!constraints) {
      const errMsg = "[STOP-LOSS] Failed to load market constraints";
      this.lastMarketSellError = errMsg;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    const tickSize = constraints.tickSize;
    const minOrderSize = constraints.minOrderSize;
    const tickSizeOption = this.toTickSizeString(tickSize);

    let remainingShares = shares;
    let totalFilledShares = 0;
    let totalNotional = 0;
    const orderIds: string[] = [];

    for (let attempt = 1; attempt <= maxRetries && remainingShares >= 0.01; attempt++) {
      try {
        const sharesToSell = await this.validateAndAdjustShares(tokenId, remainingShares, "[STOP-LOSS]", true);
        if (sharesToSell === null || sharesToSell < 0.01) {
          break;
        }

        if (sharesToSell < minOrderSize) {
          if (totalFilledShares > 0) {
            break;
          }
          const errMsg = `[STOP-LOSS] Sell size ${sharesToSell.toFixed(2)} below market minimum ${minOrderSize.toFixed(2)} shares`;
          this.lastMarketSellError = errMsg;
          console.error(errMsg);
          throw new Error(errMsg);
        }

        let referenceBid: number;
        if (Number.isFinite(bidOverride ?? NaN) && (bidOverride as number) > 0) {
          referenceBid = bidOverride as number;
        } else {
          const { bid } = await this.getPrice(tokenId);
          referenceBid = bid;
          if (referenceBid <= 0) {
            const errMsg = "[STOP-LOSS] Order book empty (bid=0) - no immediate liquidity";
            this.lastMarketSellError = errMsg;
            console.error(errMsg);
            if (totalFilledShares > 0) break;
            throw new Error(errMsg);
          }
        }
        const safePrice = this.normalizePriceForTick(referenceBid, tickSize);

        await clobCriticalLimiter.acquire();
        const response = await client.createAndPostMarketOrder({
          tokenID: tokenId,
          amount: sharesToSell,
          side: Side.SELL,
          price: safePrice
        }, {
          tickSize: tickSizeOption
        }, OrderType.FAK);

        if (!response.success) {
          if (this.isBalanceAllowanceError(response.errorMsg || "")) {
            const backoffMs = retryBackoffMs[Math.min(attempt - 1, retryBackoffMs.length - 1)];
            console.log(`[STOP-LOSS] Sell failed due to balance/allowance (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs}ms...`);
            await this.sleep(backoffMs);
            continue;
          }
          const errMsg = `[STOP-LOSS] Sell failed: ${response.errorMsg || "unknown error"}`;
          this.lastMarketSellError = errMsg;
          console.error(errMsg);
          if (totalFilledShares > 0) break;
          throw new Error(errMsg);
        }

        const orderId = response.orderID || "";
        orderIds.push(orderId);
        const fillInfo = await this.waitForFill(orderId, 3000, 250);
        const filledShares = fillInfo?.filledShares || 0;
        const fillPrice = fillInfo?.avgPrice || safePrice;
        if (filledShares > 0) {
          totalFilledShares += filledShares;
          totalNotional += filledShares * fillPrice;
          remainingShares = Math.max(0, remainingShares - filledShares);
        } else {
          this.lastMarketSellError = "[STOP-LOSS] No shares filled on market sell attempt";
        }

        if (remainingShares < 0.01 || remainingShares < minOrderSize) {
          break;
        }

        if (attempt < maxRetries) {
          const backoffMs = retryBackoffMs[Math.min(attempt - 1, retryBackoffMs.length - 1)];
          await this.sleep(backoffMs);
        }
      } catch (err: any) {
        if (this.isBalanceAllowanceError(err?.toString() || "")) {
          const backoffMs = retryBackoffMs[Math.min(attempt - 1, retryBackoffMs.length - 1)];
          console.log(`[STOP-LOSS] Sell error due to balance/allowance (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
          continue;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        this.lastMarketSellError = errMsg;
        console.error("[STOP-LOSS] Sell error:", err);
        if (totalFilledShares > 0) {
          break;
        }
        return null;
      }
    }

    if (totalFilledShares <= 0) {
      const errMsg = "[STOP-LOSS] Market sell failed to fill any shares";
      this.lastMarketSellError = errMsg;
      console.error(errMsg);
      return null;
    }

    const actualBalance = await this.getPositionBalance(tokenId);
    if (actualBalance !== null) {
      remainingShares = Math.max(0, Math.min(actualBalance, remainingShares));
    }

    return {
      orderIds,
      filledShares: totalFilledShares,
      remainingShares,
      avgPrice: totalNotional / totalFilledShares
    };
  }

  async getOpenOrders(params?: { asset_id?: string; market?: string }): Promise<any[]> {
    const client = this.ensureClient();
    try {
      await clobBackgroundLimiter.acquire();
      const orders = await client.getOpenOrders(params);
      return orders || [];
    } catch {
      return [];
    }
  }

  async cancelOpenOrdersForToken(tokenId: string): Promise<number> {
    const openOrders = await this.getOpenOrders({ asset_id: tokenId });
    let cancelledCount = 0;
    for (const order of openOrders) {
      const orderId = order?.id;
      if (!orderId) continue;
      const cancelled = await this.cancelOrder(orderId);
      if (cancelled) {
        cancelledCount++;
      }
    }
    return cancelledCount;
  }

  async getOrder(orderId: string): Promise<any | null> {
    const client = this.ensureClient();
    try {
      await clobCriticalLimiter.acquire();
      const order = await client.getOrder(orderId);
      return order;
    } catch {
      return null;
    }
  }

  async isOrderFilled(orderId: string): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return false;

    // Order is filled if status is 'MATCHED' or if size_matched equals original_size
    return order.status === "MATCHED" ||
           (order.size_matched && order.original_size &&
            parseFloat(order.size_matched) >= parseFloat(order.original_size));
  }

  /**
   * Get detailed fill information for an order
   * Returns actual filled shares and average fill price
   */
  async getOrderFillInfo(orderId: string): Promise<{ filled: boolean; filledShares: number; avgPrice: number; status: string } | null> {
    const order = await this.getOrder(orderId);
    if (!order) return null;

    const filledShares = parseFloat(order.size_matched || "0");
    const originalSize = parseFloat(order.original_size || "0");
    const filled = order.status === "MATCHED" || (filledShares >= originalSize && originalSize > 0);

    // Calculate average fill price from the order
    const avgPrice = parseFloat(order.price || "0");
    const status = (order.status || "").toUpperCase();

    return { filled, filledShares, avgPrice, status };
  }

  private isTerminalOrderStatus(status: string): boolean {
    const normalized = status.toUpperCase();
    return normalized === "MATCHED" ||
      normalized === "FILLED" ||
      normalized === "CANCELLED" ||
      normalized === "CANCELED" ||
      normalized === "REJECTED" ||
      normalized === "FAILED";
  }

  /**
   * Wait for an order to fill with timeout
   * Returns fill info or null if timeout/cancelled
   */
  async waitForFill(orderId: string, timeoutMs: number = 10000, pollIntervalMs: number = 500): Promise<{ filledShares: number; avgPrice: number } | null> {
    const startTime = Date.now();
    let consecutiveApiErrors = 0;
    const maxConsecutiveApiErrors = 5; // Allow temporary API failures

    while (Date.now() - startTime < timeoutMs) {
      const fillInfo = await this.getOrderFillInfo(orderId);

      if (!fillInfo) {
        // API error or order not found yet - wait and retry (don't give up immediately)
        consecutiveApiErrors++;
        if (consecutiveApiErrors >= maxConsecutiveApiErrors) {
          console.log(`[waitForFill] ${maxConsecutiveApiErrors} consecutive API errors - giving up`);
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      // Reset error counter on successful API call
      consecutiveApiErrors = 0;

      if (fillInfo.filledShares > 0 && (fillInfo.filled || this.isTerminalOrderStatus(fillInfo.status))) {
        return { filledShares: fillInfo.filledShares, avgPrice: fillInfo.avgPrice };
      }

      // Check if order was explicitly cancelled or rejected
      if (this.isTerminalOrderStatus(fillInfo.status)) {
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - check final state and return partial fill if any
    const finalInfo = await this.getOrderFillInfo(orderId);
    if (finalInfo && finalInfo.filledShares > 0) {
      return { filledShares: finalInfo.filledShares, avgPrice: finalInfo.avgPrice };
    }

    return null;
  }

  async cancelOrder(orderId: string, maxRetries: number = 3): Promise<boolean> {
    const client = this.ensureClient();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await clobCriticalLimiter.acquire();
        await client.cancelOrder({ orderID: orderId });
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Check if order is already cancelled/filled (not an error)
        if (errMsg.includes("not found") || errMsg.includes("already") || errMsg.includes("cancelled")) {
          console.log(`[Trader] Order ${orderId.slice(0, 8)}... already cancelled/filled`);
          return true;
        }

        console.error(`[Trader] cancelOrder attempt ${attempt}/${maxRetries} failed: ${errMsg}`);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff
        }
      }
    }

    console.error(`[Trader] cancelOrder FAILED after ${maxRetries} attempts: ${orderId.slice(0, 8)}...`);
    return false;
  }

  /**
   * Verify an order was cancelled by checking its status
   */
  async verifyOrderCancelled(orderId: string): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return true; // Not found = cancelled

    const status = (order.status || "").toUpperCase();
    return status === "CANCELLED" || status === "MATCHED" || status === "REJECTED";
  }

  /**
   * Check if bid price is valid for selling (not an empty book or resolved market)
   */
  async checkBidValid(tokenId: string): Promise<{ valid: boolean; bid: number; reason?: string }> {
    const { bid } = await this.getPrice(tokenId);

    // Empty order book (bid = 0) - could be resolved market or no liquidity
    if (bid === 0) {
      return { valid: false, bid, reason: "empty_book" };
    }

    return { valid: true, bid };
  }

  getAddress(): string {
    return this.signer.address;
  }
}
