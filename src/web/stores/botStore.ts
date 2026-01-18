import { create } from "zustand";
import { botApi, tradeApi } from "../api/client";

interface Position {
  tokenId: string;
  tradeId: number;
  shares: number;
  entryPrice: number;
  side: "UP" | "DOWN";
  marketSlug: string;
  marketEndDate: string;
  limitOrderId?: string;
  dynamicStopLoss?: number;
}

interface Trade {
  id: number;
  market_slug: string;
  token_id: string;
  side: "UP" | "DOWN";
  entry_price: number;
  exit_price: number | null;
  shares: number;
  cost_basis: number;
  status: "OPEN" | "STOPPED" | "RESOLVED";
  pnl: number | null;
  created_at: string;
  closed_at: string | null;
}

interface Market {
  slug: string;
  question: string;
  endDate: string;
  timeRemaining: number;
  upTokenId: string;
  downTokenId: string;
  upAsk: number;
  downAsk: number;
  upBid: number;
  downBid: number;
  eligibleSide: "UP" | "DOWN" | null;
}

interface BotConfig {
  entryThreshold: number;
  maxEntryPrice: number;
  stopLoss: number;
  maxSpread: number;
  timeWindowMs: number;
  pollIntervalMs: number;
  paperTrading: boolean;
  paperBalance: number;
  riskMode: "normal" | "super-risk" | "dynamic-risk";
  compoundLimit: number;
  baseBalance: number;
  maxPositions: number;
}

interface BotState {
  running: boolean;
  balance: number;
  savedProfit: number;
  positions: Position[];
  logs: string[];
  tradingEnabled: boolean;
  initError: string | null;
  wsConnected: boolean;
  userWsConnected: boolean;
  paperTrading: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
}

interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;
  totalPnL: number;
}

interface BotStore {
  // State
  config: BotConfig | null;
  state: BotState | null;
  markets: Market[];
  trades: Trade[];
  stats: TradeStats | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchState: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchMarkets: () => Promise<void>;
  fetchTrades: (limit?: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  setError: (error: string | null) => void;
}

export const useBotStore = create<BotStore>((set, get) => ({
  config: null,
  state: null,
  markets: [],
  trades: [],
  stats: null,
  loading: false,
  error: null,

  fetchState: async () => {
    try {
      const state = await botApi.getState();
      set({ state, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch state" });
    }
  },

  fetchConfig: async () => {
    try {
      const config = await botApi.getConfig();
      set({ config, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch config" });
    }
  },

  fetchMarkets: async () => {
    try {
      const markets = await botApi.getMarkets();
      set({ markets, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch markets" });
    }
  },

  fetchTrades: async (limit = 10) => {
    try {
      const trades = await tradeApi.getRecent(limit);
      set({ trades, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch trades" });
    }
  },

  fetchStats: async () => {
    try {
      const stats = await tradeApi.getStats();
      set({ stats, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch stats" });
    }
  },

  startBot: async () => {
    set({ loading: true });
    try {
      await botApi.start();
      await get().fetchState();
      set({ loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to start bot" });
    }
  },

  stopBot: async () => {
    set({ loading: true });
    try {
      await botApi.stop();
      await get().fetchState();
      set({ loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to stop bot" });
    }
  },

  setError: (error) => set({ error }),
}));
