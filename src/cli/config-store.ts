/**
 * Config Store
 * Persists runtime configuration changes to a JSON file
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import type { BotConfig } from "../bot";

const CONFIG_FILE_PATH = "bot-config.json";

export interface StoredConfig {
  lastModified: string;
  values: Partial<BotConfig>;
}

/**
 * Load persisted config from JSON file
 */
export function loadStoredConfig(): StoredConfig | null {
  try {
    if (!existsSync(CONFIG_FILE_PATH)) {
      return null;
    }

    const content = readFileSync(CONFIG_FILE_PATH, "utf-8");
    const parsed = JSON.parse(content) as StoredConfig;

    // Validate structure
    if (!parsed.lastModified || !parsed.values) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Failed to load config from ${CONFIG_FILE_PATH}:`, error);
    return null;
  }
}

/**
 * Save config to JSON file
 */
export function saveStoredConfig(values: Partial<BotConfig>): boolean {
  try {
    // Merge with existing values if any
    const existing = loadStoredConfig();
    const merged = existing ? { ...existing.values, ...values } : values;

    const config: StoredConfig = {
      lastModified: new Date().toISOString(),
      values: merged,
    };

    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(`Failed to save config to ${CONFIG_FILE_PATH}:`, error);
    return false;
  }
}

/**
 * Merge stored config with environment-based config
 * Stored config takes precedence over env values
 */
export function mergeWithStoredConfig(envConfig: BotConfig): BotConfig {
  const stored = loadStoredConfig();

  if (!stored) {
    return envConfig;
  }

  // Merge stored values (they take precedence)
  return {
    ...envConfig,
    ...stored.values,
  } as BotConfig;
}

/**
 * Update a single config value and persist
 */
export function updateAndPersist(key: keyof BotConfig, value: any): boolean {
  const stored = loadStoredConfig();
  const values = stored ? { ...stored.values } : {};

  values[key] = value;

  return saveStoredConfig(values);
}

/**
 * Clear a specific config value from persistence
 */
export function clearStoredValue(key: keyof BotConfig): boolean {
  const stored = loadStoredConfig();

  if (!stored) {
    return true;
  }

  const { [key]: _, ...rest } = stored.values;
  return saveStoredConfig(rest);
}

/**
 * Clear all stored config
 */
export function clearStoredConfig(): boolean {
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      writeFileSync(CONFIG_FILE_PATH, JSON.stringify({ lastModified: new Date().toISOString(), values: {} }, null, 2));
    }
    return true;
  } catch (error) {
    console.error(`Failed to clear config:`, error);
    return false;
  }
}

/**
 * Get the config file path
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE_PATH;
}
