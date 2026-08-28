import React, { useState, useEffect, useRef, useMemo } from "react";

export default function TradesDashboard() {
  const [trades, setTrades] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("ALL");
  const [syncStatus, setSyncStatus] = useState("IDLE");
  const [totalSynced, setTotalSynced] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [bannerMsg, setBannerMsg] = useState(null);
  const [syncProgress, setSyncProgress] = useState(0);

  const wsRef = useRef(null);

  // 1. Instant Load from DB
  const loadTrades = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/trades?limit=5000");
      const json = await res.json();
      if (json.status === "SUCCESS") {
        setTrades(json.data || []);
        setSyncStatus(json.sync_status);
        setTotalSynced(json.total_synced || (json.data ? json.data.length : 0));
        if (json.last_synced_at) {
          setLastSyncedAt(new Date(json.last_synced_at).toLocaleTimeString());
        }
      }
    } catch (err) {
      console.error("Failed to load initial trades:", err);
    }
  };

  // 2. WebSocket Push Connection
  useEffect(() => {
    loadTrades();

    const connectWebSocket = () => {
      const socket = new WebSocket("ws://127.0.0.1:8000/ws/trades");
      wsRef.current = socket;

      socket.onopen = () => setWsConnected(true);

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.event === "SYNC_STARTED") {
          setSyncStatus("IN_PROGRESS");
          setIsPulling(true);
          setSyncProgress(5);
          setBannerMsg("Ingestion worker active: Pulling BSE batches across 30s timeout windows...");
        } else if (payload.event === "CHUNK_PROCESSED") {
          setTotalSynced(payload.total_so_far);
          // Assuming 5000 total seeded records for smooth progress calculation
          const calculatedPct = Math.min(Math.round((payload.total_so_far / 5000) * 100), 95);
          setSyncProgress(calculatedPct);
          setBannerMsg(`Ingested Batch #${payload.page} (${payload.trades_in_chunk} trades committed)`);
          loadTrades();
        } else if (payload.event === "SYNC_COMPLETED") {
          setSyncStatus("COMPLETED");
          setIsPulling(false);
          setSyncProgress(100);
          setTotalSynced(payload.total_trades);
          setLastSyncedAt(new Date().toLocaleTimeString());
          setBannerMsg(`All ${payload.total_trades.toLocaleString()} BSE trades synchronized successfully!`);
          loadTrades();
          setTimeout(() => {
            setBannerMsg(null);
            setSyncProgress(0);
          }, 6000);
        } else if (payload.event === "SYNC_FAILED") {
          setSyncStatus("FAILED");
          setIsPulling(false);
          setSyncProgress(0);
          setBannerMsg(`Sync failed: ${payload.error}`);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const triggerPull = async () => {
    try {
      setIsPulling(true);
      await fetch("http://127.0.0.1:8000/trigger-pull", { method: "POST" });
    } catch (err) {
      console.error(err);
      setIsPulling(false);
    }
  };

  // 3. Computed Analytics
  const { filteredTrades, totalTurnover, totalVolume, symbolStats, symbolsList } = useMemo(() => {
    const list = trades.filter((t) => {
      const matchSearch =
        t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.trade_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSymbol = selectedSymbol === "ALL" || t.symbol === selectedSymbol;
      return matchSearch && matchSymbol;
    });

    let turnover = 0;
    let volume = 0;
    const stats = {};
    const symSet = new Set();

    trades.forEach((t) => {
      turnover += t.quantity * t.price;
      volume += t.quantity;
      symSet.add(t.symbol);
      stats[t.symbol] = (stats[t.symbol] || 0) + (t.quantity * t.price);
    });

    return {
      filteredTrades: list,
      totalTurnover: turnover,
      totalVolume: volume,
      symbolStats: Object.entries(stats).sort((a, b) => b[1] - a[1]),
      symbolsList: Array.from(symSet).sort(),
    };
  }, [trades, searchTerm, selectedSymbol]);

  // 4. CSV Exporter
  const exportToCSV = () => {
    if (!filteredTrades.length) return;
    const headers = ["Trade ID,Timestamp (UTC),Client,Symbol,Quantity,Price (INR),Gross Value (INR)\n"];
    const rows = filteredTrades.map(
      (t) => `${t.trade_id},${t.trade_timestamp},${t.client},${t.symbol},${t.quantity},${t.price},${(t.quantity * t.price).toFixed(2)}`
    );
    const blob = new Blob([headers.concat(rows.join("\n"))], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BSE_Trades_${Date.now()}.csv`;
    a.click();
  };

  const formatINR = (val) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Navbar */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                BSE <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">ProTerminal</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Resilient Asynchronous Ingestion Engine • Zero-Polling WebSockets
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium border flex items-center gap-2 ${
                wsConnected
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-950/60 text-rose-400 border-rose-500/30 animate-pulse"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-400" : "bg-rose-400"}`} />
              {wsConnected ? "WS: CONNECTED" : "WS: CONNECTING..."}
            </span>

            <button
              onClick={exportToCSV}
              disabled={filteredTrades.length === 0}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold rounded-lg border border-slate-700 transition-all"
            >
              Export CSV
            </button>

            <button
              onClick={triggerPull}
              disabled={isPulling}
              className={`px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-500/20 flex items-center gap-2 ${
                isPulling ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isPulling && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>{isPulling ? "PULLING IN BACKGROUND..." : "TRIGGER BSE PULL"}</span>
            </button>
          </div>
        </header>

        {/* Live Progress Bar during active sync */}
        {isPulling && (
          <div className="space-y-1.5 bg-slate-900/80 border border-blue-500/30 p-3 rounded-xl">
            <div className="flex justify-between text-xs font-mono text-blue-300">
              <span>{bannerMsg || "Pulling batches..."}</span>
              <span>{syncProgress}%</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">INGESTION STATUS</span>
            <div
              className={`text-xl font-black mt-1 font-mono ${
                syncStatus === "IN_PROGRESS"
                  ? "text-amber-400 animate-pulse"
                  : syncStatus === "COMPLETED"
                  ? "text-emerald-400"
                  : "text-slate-200"
              }`}
            >
              {syncStatus}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Last: {lastSyncedAt || "Never"}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">INGESTED TRADES</span>
            <div className="text-xl font-black text-blue-400 mt-1 font-mono">
              {totalSynced.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Across 10 symbol books</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">GROSS TURNOVER</span>
            <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
              {formatINR(totalTurnover)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Total traded consideration</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TOTAL SHARES VOLUME</span>
            <div className="text-xl font-black text-purple-400 mt-1 font-mono">
              {totalVolume.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Units exchanged</span>
          </div>
        </div>

        {/* Turnover Distribution Mini-Visualizer */}
        {symbolStats.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Turnover Distribution by Stock</span>
              <span className="text-xs text-slate-500 font-mono">Top traded equity volume</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
              {symbolStats.slice(0, 5).map(([sym, val]) => {
                const maxVal = symbolStats[0][1] || 1;
                const pct = Math.round((val / maxVal) * 100);
                return (
                  <div key={sym} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="font-bold text-white">{sym}</span>
                      <span className="text-emerald-400 font-semibold">{formatINR(val)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Quick Symbol Pills */}
          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setSelectedSymbol("ALL")}
              className={`px-3 py-1 rounded-md text-xs font-bold font-mono transition-colors ${
                selectedSymbol === "ALL"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              ALL
            </button>
            {symbolsList.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                  selectedSymbol === sym
                    ? "bg-blue-600 text-white font-bold"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Trade ID, Client..."
              className="w-full bg-slate-900 border border-slate-800 text-xs px-3 py-2 rounded-lg text-white focus:outline-none focus:border-blue-500 placeholder-slate-500 font-mono uppercase"
            />
          </div>
        </div>

        {/* Live Trades Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/95 sticky top-0 uppercase tracking-wider text-slate-400 border-b border-slate-800 font-mono z-10 backdrop-blur-sm">
                <tr>
                  <th className="py-3 px-4">Trade ID</th>
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Client ID</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-right">Consideration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono">
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No trades match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTrades.slice(0, 300).map((t) => (
                    <tr key={t.trade_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-4 text-blue-400 font-semibold">{t.trade_id}</td>
                      <td className="py-2.5 px-4 text-slate-400 text-[11px]">{t.trade_timestamp}</td>
                      <td className="py-2.5 px-4 text-slate-300">{t.client}</td>
                      <td className="py-2.5 px-4 text-emerald-400 font-bold">{t.symbol}</td>
                      <td className="py-2.5 px-4 text-right text-slate-200">{t.quantity.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right text-slate-200">₹{t.price.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-300 font-semibold">
                        ₹{(t.quantity * t.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-500 font-mono">
            <span>Showing top {Math.min(filteredTrades.length, 300)} of {filteredTrades.length} matched trades</span>
            <span>Total records stored in SQLite: {totalSynced.toLocaleString()}</span>
          </div>
        </div>

      </div>
    </div>
  );
}