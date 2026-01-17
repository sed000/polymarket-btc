import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Backtest from "./pages/Backtest";
import Strategies from "./pages/Strategies";
import { useWebSocket } from "./hooks/useWebSocket";

function Layout({ children }: { children: React.ReactNode }) {
  const { connected, lastState } = useWebSocket();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-cyan-400">Polymarket Bot</h1>
              <div className="flex items-center gap-2">
                {lastState?.paperTrading ? (
                  <span className="badge badge-warning">Paper Mode</span>
                ) : (
                  <span className="badge badge-danger">Live Mode</span>
                )}
                {lastState?.running ? (
                  <span className="badge badge-success flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full pulse-ring" />
                    Running
                  </span>
                ) : (
                  <span className="badge bg-gray-700 text-gray-300">Stopped</span>
                )}
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              <NavLink to="/" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
                Dashboard
              </NavLink>
              <NavLink to="/backtest" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
                Backtest
              </NavLink>
              <NavLink to="/strategies" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
                Strategies
              </NavLink>
            </nav>

            {/* Connection status */}
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-gray-400">{connected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/strategies" element={<Strategies />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
