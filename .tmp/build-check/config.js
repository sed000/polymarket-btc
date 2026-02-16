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

// src/config.ts
import { watch, existsSync, readFileSync, writeFileSync } from "fs";
import { EventEmitter } from "events";
var DEFAULT_CONFIG = {
  trading: {
    paperTrading: true,
    paperBalance: 100,
    maxPositions: 1,
    pollIntervalMs: 1e4
  },
  wallet: {
    signatureType: 0,
    funderAddress: null
  },
  profitTaking: {
    compoundLimit: 0,
    baseBalance: 10
  },
  activeMode: "normal",
  modes: {
    normal: {
      entryThreshold: 0.95,
      maxEntryPrice: 0.98,
      stopLoss: 0.8,
      maxSpread: 0.03,
      timeWindowMs: 300000,
      profitTarget: 0.99
    }
  },
  backtest: {
    mode: "normal",
    startingBalance: 100,
    days: 7,
    slippage: 0.001
  },
  advanced: {
    wsPriceMaxAgeMs: 5000,
    marketRefreshInterval: 30000,
    paperFeeRate: 0.01,
    wsEntryPolicy: "pause",
    criticalClobRps: 6,
    backgroundClobRps: 4,
    exitRetryBackoffMs: [250, 500, 1000]
  }
};
var validateRange = (val, min, max) => !isNaN(val) && val >= min && val <= max;
function validateModeConfig(modeName, mode) {
  const errors = [];
  const prefix = `modes.${modeName}`;
  if (!validateRange(mode.entryThreshold, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.entryThreshold`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.maxEntryPrice, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.maxEntryPrice`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.stopLoss, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.stopLoss`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.profitTarget, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.profitTarget`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.maxSpread, 0, 0.5)) {
    errors.push({ path: `${prefix}.maxSpread`, message: "must be between 0 and 0.5" });
  }
  if (mode.timeWindowMs <= 0) {
    errors.push({ path: `${prefix}.timeWindowMs`, message: "must be positive" });
  }
  if (mode.stopLoss >= mode.entryThreshold) {
    errors.push({ path: `${prefix}.stopLoss`, message: "must be less than entryThreshold" });
  }
  if (mode.entryThreshold > mode.maxEntryPrice) {
    errors.push({ path: `${prefix}.entryThreshold`, message: "must be <= maxEntryPrice" });
  }
  if (mode.maxEntryPrice >= mode.profitTarget) {
    errors.push({ path: `${prefix}.maxEntryPrice`, message: "must be less than profitTarget" });
  }
  return errors;
}
function validateLadderModeConfig(modeName, mode) {
  const errors = [];
  const prefix = `modes.${modeName}`;
  if (!validateRange(mode.entryThreshold, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.entryThreshold`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.maxEntryPrice, 0.01, 0.99)) {
    errors.push({ path: `${prefix}.maxEntryPrice`, message: "must be between 0.01 and 0.99" });
  }
  if (!validateRange(mode.maxSpread, 0, 0.5)) {
    errors.push({ path: `${prefix}.maxSpread`, message: "must be between 0 and 0.5" });
  }
  if (mode.timeWindowMs <= 0) {
    errors.push({ path: `${prefix}.timeWindowMs`, message: "must be positive" });
  }
  if (mode.entryThreshold > mode.maxEntryPrice) {
    errors.push({ path: `${prefix}.entryThreshold`, message: "must be <= maxEntryPrice" });
  }
  if (!Array.isArray(mode.steps) || mode.steps.length === 0) {
    errors.push({ path: `${prefix}.steps`, message: "must have at least one step" });
  } else {
    const firstEnabledIndex = mode.steps.findIndex((step) => step.enabled);
    if (firstEnabledIndex === -1) {
      errors.push({ path: `${prefix}.steps`, message: "must have at least one enabled step" });
    }
    const stepIds = new Set;
    for (let i = 0;i < mode.steps.length; i++) {
      const step = mode.steps[i];
      const stepPrefix = `${prefix}.steps[${i}]`;
      if (!step.id || typeof step.id !== "string" || step.id.trim() === "") {
        errors.push({ path: `${stepPrefix}.id`, message: "must be a non-empty string" });
      } else if (stepIds.has(step.id)) {
        errors.push({ path: `${stepPrefix}.id`, message: `duplicate step ID "${step.id}"` });
      } else {
        stepIds.add(step.id);
      }
      if (!validateRange(step.stopLoss, 0.01, 0.99)) {
        errors.push({ path: `${stepPrefix}.stopLoss`, message: "must be between 0.01 and 0.99" });
      } else if (step.buy && step.stopLoss >= step.buy.triggerPrice) {
        errors.push({ path: `${stepPrefix}.stopLoss`, message: "must be less than buy.triggerPrice" });
      }
      if (!step.buy || typeof step.buy !== "object") {
        errors.push({ path: `${stepPrefix}.buy`, message: "buy config is required" });
      } else {
        if (!validateRange(step.buy.triggerPrice, 0.01, 0.99)) {
          errors.push({ path: `${stepPrefix}.buy.triggerPrice`, message: "must be between 0.01 and 0.99" });
        }
        if (step.buy.sizeType !== "percent" && step.buy.sizeType !== "fixed") {
          errors.push({ path: `${stepPrefix}.buy.sizeType`, message: 'must be "percent" or "fixed"' });
        }
        if (step.buy.sizeValue <= 0) {
          errors.push({ path: `${stepPrefix}.buy.sizeValue`, message: "must be positive" });
        }
        if (step.buy.sizeType === "percent" && step.buy.sizeValue > 100) {
          errors.push({ path: `${stepPrefix}.buy.sizeValue`, message: "percent value must be <= 100" });
        }
      }
      if (!step.sell || typeof step.sell !== "object") {
        errors.push({ path: `${stepPrefix}.sell`, message: "sell config is required" });
      } else {
        if (!validateRange(step.sell.triggerPrice, 0.01, 0.99)) {
          errors.push({ path: `${stepPrefix}.sell.triggerPrice`, message: "must be between 0.01 and 0.99" });
        }
        if (step.sell.sizeType !== "percent" && step.sell.sizeType !== "fixed") {
          errors.push({ path: `${stepPrefix}.sell.sizeType`, message: 'must be "percent" or "fixed"' });
        }
        if (step.sell.sizeValue <= 0) {
          errors.push({ path: `${stepPrefix}.sell.sizeValue`, message: "must be positive" });
        }
        if (step.sell.sizeType === "percent" && step.sell.sizeValue > 100) {
          errors.push({ path: `${stepPrefix}.sell.sizeValue`, message: "percent value must be <= 100" });
        }
      }
      if (typeof step.enabled !== "boolean") {
        errors.push({ path: `${stepPrefix}.enabled`, message: "must be a boolean" });
      }
    }
  }
  return errors;
}
function isLadderModeConfig(mode) {
  return "steps" in mode && Array.isArray(mode.steps);
}
function validateConfig(config) {
  const errors = [];
  if (config.trading.paperBalance <= 0) {
    errors.push({ path: "trading.paperBalance", message: "must be positive" });
  }
  if (config.trading.maxPositions < 1) {
    errors.push({ path: "trading.maxPositions", message: "must be at least 1" });
  }
  if (config.trading.pollIntervalMs < 1000) {
    errors.push({ path: "trading.pollIntervalMs", message: "must be at least 1000ms" });
  }
  const validSigTypes = [0, 1, 2];
  if (!validSigTypes.includes(config.wallet.signatureType)) {
    errors.push({ path: "wallet.signatureType", message: "must be 0, 1, or 2" });
  }
  if (config.wallet.signatureType === 1 && !config.wallet.funderAddress && !config.trading.paperTrading) {
    errors.push({ path: "wallet.funderAddress", message: "required when signatureType is 1 (Magic.link proxy)" });
  }
  if (config.profitTaking.compoundLimit < 0) {
    errors.push({ path: "profitTaking.compoundLimit", message: "must be >= 0 (0 disables)" });
  }
  if (config.profitTaking.baseBalance <= 0) {
    errors.push({ path: "profitTaking.baseBalance", message: "must be positive" });
  }
  if (!config.modes[config.activeMode]) {
    errors.push({ path: "activeMode", message: `mode "${config.activeMode}" not found in modes` });
  }
  for (const [modeName, modeConfig] of Object.entries(config.modes)) {
    if (isLadderModeConfig(modeConfig)) {
      errors.push(...validateLadderModeConfig(modeName, modeConfig));
    } else {
      errors.push(...validateModeConfig(modeName, modeConfig));
    }
  }
  if (!config.modes[config.backtest.mode]) {
    errors.push({ path: "backtest.mode", message: `mode "${config.backtest.mode}" not found in modes` });
  }
  if (config.backtest.startingBalance <= 0) {
    errors.push({ path: "backtest.startingBalance", message: "must be positive" });
  }
  if (config.backtest.days <= 0) {
    errors.push({ path: "backtest.days", message: "must be positive" });
  }
  if (!validateRange(config.backtest.slippage, 0, 0.1)) {
    errors.push({ path: "backtest.slippage", message: "must be between 0 and 0.1" });
  }
  if (config.advanced.wsPriceMaxAgeMs < 1000) {
    errors.push({ path: "advanced.wsPriceMaxAgeMs", message: "must be at least 1000ms" });
  }
  if (config.advanced.marketRefreshInterval < 5000) {
    errors.push({ path: "advanced.marketRefreshInterval", message: "must be at least 5000ms" });
  }
  if (!validateRange(config.advanced.paperFeeRate, 0, 0.1)) {
    errors.push({ path: "advanced.paperFeeRate", message: "must be between 0 and 0.1" });
  }
  const validWsEntryPolicies = ["pause", "rest_fallback", "gamma_fallback"];
  if (!validWsEntryPolicies.includes(config.advanced.wsEntryPolicy)) {
    errors.push({ path: "advanced.wsEntryPolicy", message: 'must be "pause", "rest_fallback", or "gamma_fallback"' });
  }
  if (!Number.isFinite(config.advanced.criticalClobRps) || config.advanced.criticalClobRps < 1 || config.advanced.criticalClobRps > 50) {
    errors.push({ path: "advanced.criticalClobRps", message: "must be between 1 and 50" });
  }
  if (!Number.isFinite(config.advanced.backgroundClobRps) || config.advanced.backgroundClobRps < 1 || config.advanced.backgroundClobRps > 50) {
    errors.push({ path: "advanced.backgroundClobRps", message: "must be between 1 and 50" });
  }
  if (!Array.isArray(config.advanced.exitRetryBackoffMs) || config.advanced.exitRetryBackoffMs.length === 0) {
    errors.push({ path: "advanced.exitRetryBackoffMs", message: "must be a non-empty array" });
  } else {
    for (let i = 0;i < config.advanced.exitRetryBackoffMs.length; i++) {
      const value = config.advanced.exitRetryBackoffMs[i];
      if (!Number.isFinite(value) || value < 10 || value > 60000) {
        errors.push({ path: `advanced.exitRetryBackoffMs[${i}]`, message: "must be between 10 and 60000 ms" });
      }
    }
  }
  return errors;
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal !== undefined) {
      if (typeof sourceVal === "object" && sourceVal !== null && !Array.isArray(sourceVal) && typeof result[key] === "object" && result[key] !== null) {
        result[key] = deepMerge(result[key], sourceVal);
      } else {
        result[key] = sourceVal;
      }
    }
  }
  return result;
}

class ConfigManager extends EventEmitter {
  config;
  configPath;
  watcher = null;
  debounceTimer = null;
  constructor(configPath = "trading.config.json") {
    super();
    this.configPath = configPath;
    this.config = this.loadConfig();
  }
  loadConfig() {
    if (!existsSync(this.configPath)) {
      console.log(`Creating default config file: ${this.configPath}`);
      writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return structuredClone(DEFAULT_CONFIG);
    }
    try {
      const content = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(content);
      const merged = deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
      const errors = validateConfig(merged);
      if (errors.length > 0) {
        console.error("Configuration errors:");
        for (const err of errors) {
          console.error(`  - ${err.path}: ${err.message}`);
        }
        throw new Error("Invalid configuration");
      }
      return merged;
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error(`Invalid JSON in ${this.configPath}: ${err.message}`);
        throw err;
      }
      throw err;
    }
  }
  startWatching() {
    if (this.watcher)
      return;
    this.watcher = watch(this.configPath, (eventType) => {
      if (eventType === "change") {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.reloadConfig();
        }, 100);
      }
    });
  }
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
  reloadConfig() {
    try {
      const previous = this.config;
      const newConfig = this.loadConfig();
      const changedPaths = this.findChangedPaths(previous, newConfig);
      if (changedPaths.length === 0) {
        return false;
      }
      this.config = newConfig;
      const event = {
        previous,
        current: newConfig,
        changedPaths
      };
      this.emit("change", event);
      console.log(`[CONFIG] Reloaded: ${changedPaths.join(", ")}`);
      return true;
    } catch (err) {
      console.error(`[CONFIG] Failed to reload: ${err instanceof Error ? err.message : err}`);
      this.emit("error", err);
      return false;
    }
  }
  findChangedPaths(prev, next, prefix = "") {
    const changes = [];
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const prevVal = prev[key];
      const nextVal = next[key];
      if (typeof prevVal === "object" && typeof nextVal === "object" && prevVal !== null && nextVal !== null) {
        changes.push(...this.findChangedPaths(prevVal, nextVal, path));
      } else if (prevVal !== nextVal) {
        changes.push(path);
      }
    }
    return changes;
  }
  getConfig() {
    return this.config;
  }
  getActiveModeName() {
    return this.config.activeMode;
  }
  getActiveMode() {
    const mode = this.config.modes[this.config.activeMode];
    if (isLadderModeConfig(mode)) {
      const firstEnabledStep = mode.steps.find((step) => step.enabled);
      const stepStopLoss = firstEnabledStep ? firstEnabledStep.stopLoss : 0.01;
      return {
        entryThreshold: mode.entryThreshold,
        maxEntryPrice: mode.maxEntryPrice,
        stopLoss: stepStopLoss,
        maxSpread: mode.maxSpread,
        timeWindowMs: mode.timeWindowMs,
        profitTarget: 0.99
      };
    }
    return mode;
  }
  getMode(modeName) {
    return this.config.modes[modeName];
  }
  isLadderMode() {
    const mode = this.config.modes[this.config.activeMode];
    return isLadderModeConfig(mode);
  }
  getLadderMode() {
    const mode = this.config.modes[this.config.activeMode];
    if (isLadderModeConfig(mode)) {
      return mode;
    }
    return null;
  }
  toBotConfig() {
    const rawMode = this.config.modes[this.config.activeMode];
    const isLadder = isLadderModeConfig(rawMode);
    const mode = this.getActiveMode();
    const firstEnabledStep = isLadder ? rawMode.steps.find((step) => step.enabled) : null;
    const ladderStopLoss = firstEnabledStep ? firstEnabledStep.stopLoss : mode.stopLoss;
    return {
      entryThreshold: mode.entryThreshold,
      maxEntryPrice: mode.maxEntryPrice,
      stopLoss: isLadder ? ladderStopLoss : mode.stopLoss,
      maxSpread: mode.maxSpread,
      timeWindowMs: mode.timeWindowMs,
      pollIntervalMs: this.config.trading.pollIntervalMs,
      paperTrading: this.config.trading.paperTrading,
      paperBalance: this.config.trading.paperBalance,
      riskMode: this.config.activeMode,
      compoundLimit: this.config.profitTaking.compoundLimit,
      baseBalance: this.config.profitTaking.baseBalance,
      signatureType: this.config.wallet.signatureType,
      funderAddress: this.config.wallet.funderAddress || undefined,
      maxPositions: this.config.trading.maxPositions
    };
  }
  getConfigPath() {
    return this.configPath;
  }
  getProfitTarget() {
    const mode = this.config.modes[this.config.activeMode];
    if (isLadderModeConfig(mode)) {
      return 0.99;
    }
    return mode.profitTarget;
  }
  getAdvanced() {
    return this.config.advanced;
  }
  getBacktestConfig() {
    return this.config.backtest;
  }
  onConfigChange(callback) {
    this.on("change", callback);
  }
  onConfigError(callback) {
    this.on("error", callback);
  }
}
var globalConfigManager = null;
function getConfigManager(configPath) {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(configPath);
  }
  return globalConfigManager;
}
function resetConfigManager() {
  if (globalConfigManager) {
    globalConfigManager.stopWatching();
    globalConfigManager = null;
  }
}
export {
  resetConfigManager,
  getConfigManager,
  ConfigManager
};
