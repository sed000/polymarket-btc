const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Bot endpoints
export const botApi = {
  getState: () => fetchJson<any>("/bot/state"),
  getConfig: () => fetchJson<any>("/bot/config"),
  start: () => fetchJson<any>("/bot/start", { method: "POST" }),
  stop: () => fetchJson<any>("/bot/stop", { method: "POST" }),
  getMarkets: () => fetchJson<any[]>("/bot/markets"),
  getWsStats: () => fetchJson<any>("/bot/ws-stats"),
};

// Trade endpoints
export const tradeApi = {
  getRecent: (limit = 10) => fetchJson<any[]>(`/trades/recent?limit=${limit}`),
  getStats: () => fetchJson<any>("/trades/stats"),
  getOpen: () => fetchJson<any[]>("/trades/open"),
};

// Backtest endpoints
export const backtestApi = {
  run: (config: any) => fetchJson<any>("/backtest/run", {
    method: "POST",
    body: JSON.stringify(config),
  }),
  getHistory: (limit = 20) => fetchJson<any[]>(`/backtest/history?limit=${limit}`),
  getRun: (runId: number) => fetchJson<any>(`/backtest/run/${runId}`),
  optimize: (config: any) => fetchJson<any>("/backtest/optimize", {
    method: "POST",
    body: JSON.stringify(config),
  }),
  getCacheStats: () => fetchJson<any>("/backtest/cache-stats"),
  fetchData: (config: any) => fetchJson<any>("/backtest/fetch", {
    method: "POST",
    body: JSON.stringify(config),
  }),
};

// Strategy endpoints
export const strategyApi = {
  list: () => fetchJson<any[]>("/strategies"),
  get: (id: number) => fetchJson<any>(`/strategies/${id}`),
  create: (data: any) => fetchJson<any>("/strategies", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => fetchJson<any>(`/strategies/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: number) => fetchJson<any>(`/strategies/${id}`, {
    method: "DELETE",
  }),
  apply: (id: number) => fetchJson<any>(`/strategies/${id}/apply`, {
    method: "POST",
  }),
  getActive: () => fetchJson<any>("/strategies/active"),
};
