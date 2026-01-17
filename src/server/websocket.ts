import type { ServerWebSocket } from "bun";

export interface WebSocketData {
  id: string;
}

type BroadcastMessage =
  | { type: "state_update"; data: any }
  | { type: "price_update"; data: any }
  | { type: "trade_executed"; data: any }
  | { type: "log"; data: string }
  | { type: "backtest_progress"; data: { progress: number; message: string } };

class WebSocketManager {
  private clients: Map<string, ServerWebSocket<WebSocketData>> = new Map();
  private clientIdCounter = 0;

  generateId(): string {
    return `client_${++this.clientIdCounter}_${Date.now()}`;
  }

  addClient(ws: ServerWebSocket<WebSocketData>): void {
    this.clients.set(ws.data.id, ws);
    console.log(`[WS] Client connected: ${ws.data.id} (total: ${this.clients.size})`);
  }

  removeClient(ws: ServerWebSocket<WebSocketData>): void {
    this.clients.delete(ws.data.id);
    console.log(`[WS] Client disconnected: ${ws.data.id} (total: ${this.clients.size})`);
  }

  broadcast(message: BroadcastMessage): void {
    const json = JSON.stringify(message);
    for (const client of this.clients.values()) {
      try {
        client.send(json);
      } catch {
        // Client may have disconnected
      }
    }
  }

  broadcastStateUpdate(state: any): void {
    this.broadcast({ type: "state_update", data: state });
  }

  broadcastPriceUpdate(prices: any): void {
    this.broadcast({ type: "price_update", data: prices });
  }

  broadcastTradeExecuted(trade: any): void {
    this.broadcast({ type: "trade_executed", data: trade });
  }

  broadcastLog(message: string): void {
    this.broadcast({ type: "log", data: message });
  }

  broadcastBacktestProgress(progress: number, message: string): void {
    this.broadcast({ type: "backtest_progress", data: { progress, message } });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsManager = new WebSocketManager();
