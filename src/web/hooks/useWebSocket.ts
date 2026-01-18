import { useEffect, useState, useRef, useCallback } from "react";

interface BotStateUpdate {
  running: boolean;
  balance: number;
  savedProfit: number;
  positionCount: number;
  tradingEnabled: boolean;
  wsConnected: boolean;
  paperTrading: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
}

interface WebSocketMessage {
  type: "state_update" | "price_update" | "trade_executed" | "log" | "backtest_progress";
  data: any;
}

interface UseWebSocketReturn {
  connected: boolean;
  lastState: BotStateUpdate | null;
  logs: string[];
  backtestProgress: { progress: number; message: string } | null;
  send: (message: any) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastState, setLastState] = useState<BotStateUpdate | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [backtestProgress, setBacktestProgress] = useState<{ progress: number; message: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case "state_update":
              setLastState(message.data);
              break;
            case "log":
              setLogs((prev) => [...prev.slice(-99), message.data]);
              break;
            case "backtest_progress":
              setBacktestProgress(message.data);
              break;
            case "trade_executed":
              // Could trigger a refetch of trades here
              break;
          }
        } catch (err) {
          console.error("[WS] Failed to parse message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected");
        setConnected(false);
        wsRef.current = null;

        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log("[WS] Reconnecting...");
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
      };
    } catch (err) {
      console.error("[WS] Failed to connect:", err);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { connected, lastState, logs, backtestProgress, send };
}
