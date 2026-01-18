import React, { useState, useEffect } from "react";
import { strategyApi } from "../api/client";

interface Strategy {
  id: number;
  name: string;
  description: string | null;
  config: {
    entryThreshold: number;
    maxEntryPrice: number;
    stopLoss: number;
    maxSpread: number;
    timeWindowMs: number;
    profitTarget: number;
    riskMode: string;
  };
  risk_mode: string;
  created_at: string;
  updated_at: string;
  last_win_rate: number | null;
  last_total_pnl: number | null;
  is_active: number;
}

function StrategyCard({
  strategy,
  onApply,
  onDelete,
  onEdit,
}: {
  strategy: Strategy;
  onApply: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { config } = strategy;

  return (
    <div className={`card ${strategy.is_active ? "ring-2 ring-cyan-500" : ""}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {strategy.name}
            {strategy.is_active === 1 && (
              <span className="badge badge-info">Active</span>
            )}
          </h3>
          {strategy.description && (
            <p className="text-sm text-gray-400 mt-1">{strategy.description}</p>
          )}
        </div>
        <span className={`badge ${
          strategy.risk_mode === "super-risk" ? "badge-danger" :
          strategy.risk_mode === "dynamic-risk" ? "badge-warning" :
          "badge-info"
        }`}>
          {strategy.risk_mode}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-400">Entry</span>
          <span>${config.entryThreshold?.toFixed(2)} - ${config.maxEntryPrice?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Stop Loss</span>
          <span className="text-red-400">${config.stopLoss?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Max Spread</span>
          <span>${config.maxSpread?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Profit Target</span>
          <span className="text-green-400">${config.profitTarget?.toFixed(2)}</span>
        </div>
      </div>

      {(strategy.last_win_rate !== null || strategy.last_total_pnl !== null) && (
        <div className="bg-gray-900 rounded-lg p-3 mb-4">
          <div className="text-xs text-gray-400 mb-1">Last Backtest</div>
          <div className="flex gap-4">
            {strategy.last_win_rate !== null && (
              <div>
                <span className="text-sm font-medium">{(strategy.last_win_rate * 100).toFixed(1)}%</span>
                <span className="text-xs text-gray-400 ml-1">Win Rate</span>
              </div>
            )}
            {strategy.last_total_pnl !== null && (
              <div>
                <span className={`text-sm font-medium ${strategy.last_total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {strategy.last_total_pnl >= 0 ? "+" : ""}${strategy.last_total_pnl.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 ml-1">PnL</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onApply} className="btn btn-primary flex-1">
          Apply
        </button>
        <button onClick={onEdit} className="btn btn-secondary">
          Edit
        </button>
        <button onClick={onDelete} className="btn btn-danger">
          Delete
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Updated {new Date(strategy.updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function StrategyForm({
  strategy,
  onSave,
  onCancel,
}: {
  strategy?: Strategy;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(strategy?.name || "");
  const [description, setDescription] = useState(strategy?.description || "");
  const [config, setConfig] = useState({
    entryThreshold: strategy?.config.entryThreshold || 0.70,
    maxEntryPrice: strategy?.config.maxEntryPrice || 0.95,
    stopLoss: strategy?.config.stopLoss || 0.40,
    maxSpread: strategy?.config.maxSpread || 0.05,
    timeWindowMs: strategy?.config.timeWindowMs || 15 * 60 * 1000,
    profitTarget: strategy?.config.profitTarget || 0.98,
    riskMode: strategy?.config.riskMode || "dynamic-risk",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({ name, description, config });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h3 className="text-lg font-semibold mb-4">
        {strategy ? "Edit Strategy" : "New Strategy"}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input w-full"
            placeholder="Strategy name..."
            required
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            rows={2}
            placeholder="Optional description..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Entry Threshold</label>
            <input
              type="number"
              step="0.01"
              value={config.entryThreshold}
              onChange={(e) => setConfig({ ...config, entryThreshold: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Max Entry Price</label>
            <input
              type="number"
              step="0.01"
              value={config.maxEntryPrice}
              onChange={(e) => setConfig({ ...config, maxEntryPrice: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Stop Loss</label>
            <input
              type="number"
              step="0.01"
              value={config.stopLoss}
              onChange={(e) => setConfig({ ...config, stopLoss: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Max Spread</label>
            <input
              type="number"
              step="0.01"
              value={config.maxSpread}
              onChange={(e) => setConfig({ ...config, maxSpread: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Profit Target</label>
            <input
              type="number"
              step="0.01"
              value={config.profitTarget}
              onChange={(e) => setConfig({ ...config, profitTarget: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Risk Mode</label>
            <select
              value={config.riskMode}
              onChange={(e) => setConfig({ ...config, riskMode: e.target.value })}
              className="input w-full"
            >
              <option value="normal">Normal</option>
              <option value="super-risk">Super Risk</option>
              <option value="dynamic-risk">Dynamic Risk</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary">
          {saving ? "Saving..." : "Save Strategy"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const fetchStrategies = async () => {
    try {
      const data = await strategyApi.list();
      setStrategies(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load strategies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const handleCreate = async (data: any) => {
    await strategyApi.create(data);
    setShowForm(false);
    await fetchStrategies();
  };

  const handleUpdate = async (data: any) => {
    if (!editingStrategy) return;
    await strategyApi.update(editingStrategy.id, data);
    setEditingStrategy(null);
    await fetchStrategies();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this strategy?")) return;
    await strategyApi.delete(id);
    await fetchStrategies();
  };

  const handleApply = async (id: number) => {
    try {
      const result = await strategyApi.apply(id);
      alert(result.message);
      await fetchStrategies();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to apply strategy");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading strategies...</div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-xl">
        <StrategyForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  if (editingStrategy) {
    return (
      <div className="max-w-xl">
        <StrategyForm
          strategy={editingStrategy}
          onSave={handleUpdate}
          onCancel={() => setEditingStrategy(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Strategies</h2>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          New Strategy
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {strategies.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No strategies yet</p>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            Create your first strategy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onApply={() => handleApply(strategy.id)}
              onDelete={() => handleDelete(strategy.id)}
              onEdit={() => setEditingStrategy(strategy)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
