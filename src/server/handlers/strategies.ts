import {
  insertStrategy,
  updateStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  setActiveStrategy,
  getActiveStrategy,
  initStrategyDatabase,
  type Strategy,
} from "../../db";

// Initialize strategy database on import
initStrategyDatabase();

export async function handleListStrategies(): Promise<Response> {
  try {
    const strategies = listStrategies();

    // Parse config JSON for each strategy
    const parsedStrategies = strategies.map((s) => ({
      ...s,
      config: JSON.parse(s.config_json),
    }));

    return Response.json(parsedStrategies);
  } catch (err) {
    return Response.json({ error: "Failed to list strategies" }, { status: 500 });
  }
}

export async function handleGetStrategy(id: string): Promise<Response> {
  try {
    const strategy = getStrategy(parseInt(id, 10));
    if (!strategy) {
      return Response.json({ error: "Strategy not found" }, { status: 404 });
    }

    return Response.json({
      ...strategy,
      config: JSON.parse(strategy.config_json),
    });
  } catch (err) {
    return Response.json({ error: "Failed to get strategy" }, { status: 500 });
  }
}

export async function handleCreateStrategy(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    if (!body.name || !body.config) {
      return Response.json({ error: "Name and config are required" }, { status: 400 });
    }

    const id = insertStrategy({
      name: body.name,
      description: body.description,
      configJson: JSON.stringify(body.config),
      riskMode: body.config.riskMode || "normal",
    });

    const strategy = getStrategy(id);
    return Response.json({
      ...strategy,
      config: JSON.parse(strategy!.config_json),
    }, { status: 201 });
  } catch (err) {
    return Response.json({ error: "Failed to create strategy" }, { status: 500 });
  }
}

export async function handleUpdateStrategy(id: string, req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const strategyId = parseInt(id, 10);

    const existing = getStrategy(strategyId);
    if (!existing) {
      return Response.json({ error: "Strategy not found" }, { status: 404 });
    }

    updateStrategy(strategyId, {
      name: body.name,
      description: body.description,
      configJson: body.config ? JSON.stringify(body.config) : undefined,
      riskMode: body.config?.riskMode,
      lastBacktestId: body.lastBacktestId,
      lastWinRate: body.lastWinRate,
      lastTotalPnl: body.lastTotalPnl,
    });

    const strategy = getStrategy(strategyId);
    return Response.json({
      ...strategy,
      config: JSON.parse(strategy!.config_json),
    });
  } catch (err) {
    return Response.json({ error: "Failed to update strategy" }, { status: 500 });
  }
}

export async function handleDeleteStrategy(id: string): Promise<Response> {
  try {
    const strategyId = parseInt(id, 10);

    const existing = getStrategy(strategyId);
    if (!existing) {
      return Response.json({ error: "Strategy not found" }, { status: 404 });
    }

    deleteStrategy(strategyId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Failed to delete strategy" }, { status: 500 });
  }
}

export async function handleApplyStrategy(id: string): Promise<Response> {
  try {
    const strategyId = parseInt(id, 10);

    const strategy = getStrategy(strategyId);
    if (!strategy) {
      return Response.json({ error: "Strategy not found" }, { status: 404 });
    }

    // Set as active strategy
    setActiveStrategy(strategyId);

    return Response.json({
      success: true,
      message: `Strategy "${strategy.name}" is now active`,
      config: JSON.parse(strategy.config_json),
    });
  } catch (err) {
    return Response.json({ error: "Failed to apply strategy" }, { status: 500 });
  }
}

export async function handleGetActiveStrategy(): Promise<Response> {
  try {
    const strategy = getActiveStrategy();
    if (!strategy) {
      return Response.json({ active: false });
    }

    return Response.json({
      active: true,
      ...strategy,
      config: JSON.parse(strategy.config_json),
    });
  } catch (err) {
    return Response.json({ error: "Failed to get active strategy" }, { status: 500 });
  }
}
