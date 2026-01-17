import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

export type StrategyRiskMode = "normal" | "super-risk" | "dynamic-risk";

export interface StrategyParams {
  entryThreshold: number;
  maxEntryPrice: number;
  stopLoss: number;
  maxSpread: number;
  timeWindowMs: number;
  riskMode: StrategyRiskMode;
  compoundLimit: number;
  baseBalance: number;
  maxPositions: number;
}

export interface StrategyPreset {
  id: string;
  name: string;
  description?: string;
  params: StrategyParams;
  createdAt: string;
  updatedAt: string;
}

const STRATEGY_PATH = join(process.cwd(), "strategies.json");

function writeAtomic(path: string, content: string): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, path);
}

export function loadStrategies(): StrategyPreset[] {
  if (!existsSync(STRATEGY_PATH)) return [];
  try {
    const raw = readFileSync(STRATEGY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as StrategyPreset[];
    }
  } catch {
    return [];
  }
  return [];
}

export function saveStrategies(strategies: StrategyPreset[]): void {
  writeAtomic(STRATEGY_PATH, JSON.stringify(strategies, null, 2));
}

export function upsertStrategy(input: {
  id?: string;
  name: string;
  description?: string;
  params: StrategyParams;
}): StrategyPreset {
  const strategies = loadStrategies();
  const now = new Date().toISOString();
  const existingIndex = input.id ? strategies.findIndex(s => s.id === input.id) : -1;

  if (existingIndex >= 0) {
    const updated: StrategyPreset = {
      ...strategies[existingIndex],
      name: input.name,
      description: input.description,
      params: input.params,
      updatedAt: now,
    };
    strategies[existingIndex] = updated;
    saveStrategies(strategies);
    return updated;
  }

  const created: StrategyPreset = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    params: input.params,
    createdAt: now,
    updatedAt: now,
  };
  strategies.unshift(created);
  saveStrategies(strategies);
  return created;
}

export function deleteStrategy(id: string): boolean {
  const strategies = loadStrategies();
  const next = strategies.filter(s => s.id !== id);
  if (next.length === strategies.length) return false;
  saveStrategies(next);
  return true;
}
