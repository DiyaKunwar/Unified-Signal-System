/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Compass, Database, Cpu, Activity, Clock, ShieldAlert, FileText } from 'lucide-react';
import MapMonitor from './components/MapMonitor';
import NetworkHeatMap from './components/NetworkHeatMap';
import MetricsStudio from './components/MetricsStudio';
import DataExplorer from './components/DataExplorer';
import MistralCommandCenter from './components/MistralCommandCenter';
import { parseCSV, mapCsvToPredictionRows, riskBand } from './utils/csvParser';
import { PredictionRow } from './types';

// Mean of every numeric field per corridor and hour, e.g. when "ALL 2025" spans 12 months.
function aggregateByCorridor(rows: PredictionRow[]): PredictionRow[] {
  const groups = new Map<string, PredictionRow[]>();
  rows.forEach(r => {
    const key = `${r.location_id}|${r.hour}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  return Array.from(groups.values()).map(group => {
    const out: Record<string, unknown> = { ...group[0] };
    Object.keys(out).forEach(k => {
      if (typeof out[k] === 'number') out[k] = group.reduce((sum, r) => sum + (r[k as keyof PredictionRow] as number), 0) / group.length;
    });
    const row = out as unknown as PredictionRow;
    return { ...row, risk_band: riskBand(row.pred_congestion_probability) };
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'studio' | 'database'>('monitor');
  const [selectedHour, setSelectedHour] = useState<number>(8); // default to morning peak hour
  const [selectedCorridorId, setSelectedCorridorId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // 2025 holdout predictions from the Python pipeline, loaded from /public on startup
  const [hourlyPredictions, setHourlyPredictions] = useState<PredictionRow[]>([]);
  const [activeDatasetName, setActiveDatasetName] = useState("Loading predictions…");
  const [selectedMonth, setSelectedMonth] = useState<string>('LIVE_SYNC');
  const [predictionViewMode, setPredictionViewMode] = useState<'current' | 'next'>('current');

  // Multi-Agent states for dynamic human-approved adjustments
  const [activeAdjustments, setActiveAdjustments] = useState<Record<string, any>>({});
  const [operatorLogs, setOperatorLogs] = useState<{ time: string; msg: string }[]>([]);

  // Extract unique year-months from the predictions
  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(hourlyPredictions.map(p => p.year_month))).filter(Boolean);
    return months.sort();
  }, [hourlyPredictions]);

  // Set default selected month when CSV loads
  useEffect(() => {
    if (availableMonths.length > 0 && selectedMonth !== 'LIVE_SYNC' && !availableMonths.includes(selectedMonth)) {
      if (availableMonths.includes('2025-10')) {
        setSelectedMonth('2025-10');
      } else {
        setSelectedMonth(availableMonths[0]);
      }
    }
  }, [availableMonths]);

  // Load the pipeline's 2025 holdout predictions on startup
  useEffect(() => {
    const loadDefaultCsv = async () => {
      const file = 'top_predicted_high_risk_corridors_2025_rows.csv';
      try {
        const response = await fetch(`/${file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = mapCsvToPredictionRows(parseCSV(await response.text()));
        setHourlyPredictions(rows);
        setActiveDatasetName(`${file} (${rows.length.toLocaleString()} rows)`);
      } catch (err) {
        console.error(`Failed to load ${file}:`, err);
        setActiveDatasetName(`Failed to load ${file}: ${err instanceof Error ? err.message : err}`);
      }
    };
    loadDefaultCsv();
  }, []);

  // Update clock effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);


  // Dynamically resolve today's date and map to corresponding 2025 month in the CSV holdout dataset
  const activeYearMonthFilter = useMemo(() => {
    if (selectedMonth === 'LIVE_SYNC') {
      const now = new Date();
      const currentMonthNum = now.getMonth() + 1; // 1-12
      const targetMonthStr = `2025-${String(currentMonthNum).padStart(2, '0')}`;
      
      if (availableMonths.includes(targetMonthStr)) {
        return targetMonthStr;
      }
      return availableMonths[0] || '2025-10';
    }
    return selectedMonth;
  }, [selectedMonth, availableMonths]);

  // Get active predictions for the currently selected hour & selected month
  // One row per corridor-hour for the selected evaluation period
  const periodPredictions = useMemo(
    () => aggregateByCorridor(hourlyPredictions.filter(p => activeYearMonthFilter === 'ALL' || p.year_month === activeYearMonthFilter)),
    [hourlyPredictions, activeYearMonthFilter]
  );

  const currentHourPreds = useMemo(
    () => periodPredictions.filter(p => p.hour === selectedHour),
    [periodPredictions, selectedHour]
  );

  // Aggregate global stats for the selected hour
  const networkStats = useMemo(() => {
    if (currentHourPreds.length === 0) return { avgSpeed: 0, bottlenecks: 0, avgDelay: 1.0 };
    
    const totalSpeed = currentHourPreds.reduce((sum, p) => sum + p.fw_speed_mean, 0);
    const criticalBottlenecks = currentHourPreds.filter(p => p.risk_band === 'critical' || p.risk_band === 'high').length;
    const totalDelay = currentHourPreds.reduce((sum, p) => sum + p.fw_tti_mean, 0);

    return {
      avgSpeed: Math.round(totalSpeed / currentHourPreds.length),
      bottlenecks: criticalBottlenecks,
      avgDelay: parseFloat((totalDelay / currentHourPreds.length).toFixed(2))
    };
  }, [currentHourPreds]);

  // Map current hour predictions by location_id for instant lookup
  const currentHourPredsMap = useMemo(() => {
    const map = new Map<string, PredictionRow>();
    currentHourPreds.forEach(p => {
      map.set(p.location_id, p);
    });
    return map;
  }, [currentHourPreds]);

  // Get active predictions for the next hour to compare / anticipate bottlenecks
  const nextHourPreds = useMemo(
    () => periodPredictions.filter(p => p.hour === (selectedHour + 1) % 24),
    [periodPredictions, selectedHour]
  );

  // Map next hour predictions by location_id for instant lookup
  const nextHourPredsMap = useMemo(() => {
    const map = new Map<string, PredictionRow>();
    nextHourPreds.forEach(p => {
      map.set(p.location_id, p);
    });
    return map;
  }, [nextHourPreds]);

  // Alerting Corridors for the selected hour/mode
  const alertingCorridors = useMemo(() => {
    const targetPreds = predictionViewMode === 'current' ? currentHourPreds : nextHourPreds;
    return targetPreds
      .filter(p => p.risk_band === 'critical' || p.risk_band === 'high')
      .sort((a, b) => b.pred_congestion_probability - a.pred_congestion_probability);
  }, [currentHourPreds, nextHourPreds, predictionViewMode]);

  // Combined system logs and dynamic operator activity
  const allLogs = operatorLogs.slice(-4);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 font-sans flex flex-col selection:bg-rta-blue selection:text-white">
      
      {/* Top Main Command Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm shrink-0 z-10" id="rta-header">
        
        {/* RTA Logo Brand and Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rta-blue rounded-lg flex items-center justify-center border border-slate-200 shadow-sm relative overflow-hidden">
            {/* Elegant RTA upward pointing red triangle arrow symbol inside the logo mark */}
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L21 19H16L12 11.5L8 19H3L12 4Z" fill="#DA291C" />
            </svg>
          </div>
          <div>
            <h1 className="text-md sm:text-lg font-display font-bold tracking-tight text-rta-blue flex items-center gap-2">
              UNIFIED SIGNAL SYSTEM
              <span className="bg-[#DA291C]/10 text-[#DA291C] text-[10px] font-mono px-2 py-0.5 rounded border border-[#DA291C]/20 font-bold uppercase tracking-wider">
                AI-Powered Congestion Forecasting
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              Predictive corridor risk modeling with human-approved response recommendations
            </p>
          </div>
        </div>

        {/* Global Telemetry Bar */}
        <div className="flex flex-wrap items-center gap-6">
          
          {/* Status Metrics */}
          <div className="hidden sm:flex items-center gap-4 text-xs font-mono border-r border-slate-200 pr-6">
            <div>
              <span className="text-slate-400">DATASET:</span> <span className="text-sky-700 font-bold">{activeDatasetName}</span>
            </div>
          </div>

          {/* Real-time UTC/Clock */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg font-mono text-xs">
            <Clock className="w-4 h-4 text-rta-blue" />
            <span className="text-slate-700 font-bold">
              {currentTime.toISOString().split('T')[0]} | {currentTime.toLocaleTimeString()} Dubai/GST
            </span>
          </div>

        </div>
      </header>

      {/* Primary Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 px-6 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 z-10 shadow-xs">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'monitor'
                ? 'bg-rta-blue text-slate-100 font-bold shadow-md hover:bg-rta-blue-hover'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            id="tab-tactical-monitor"
          >
            <Compass className="w-4 h-4" />
            FORECAST MONITOR
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'studio'
                ? 'bg-rta-blue text-slate-100 font-bold shadow-md hover:bg-rta-blue-hover'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            id="tab-ml-studio"
          >
            <Cpu className="w-4 h-4" />
            ML EVALUATION STUDIO
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono transition-all ${
              activeTab === 'database'
                ? 'bg-rta-blue text-slate-100 font-bold shadow-md hover:bg-rta-blue-hover'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            id="tab-data-explorer"
          >
            <Database className="w-4 h-4" />
            MODEL PREDICTIONS DB
          </button>
        </div>

        {availableMonths.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Evaluation Period:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-rta-blue font-mono text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="LIVE_SYNC" className="bg-white text-slate-800">REPLAY: {new Date().toLocaleString('en-US', { month: 'long' })} 2025 (same month as today)</option>
              <option value="ALL" className="bg-white text-slate-800">ALL 2025 (AGGREGATED)</option>
              {availableMonths.map(m => (
                <option key={m} value={m} className="bg-white text-slate-800">{m}</option>
              ))}
            </select>
          </div>
        )}
      </nav>

      {/* Main Container Dashboard */}
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === 'monitor' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full items-start">
            
            {/* Map Area (8 cols) */}
            <div className="xl:col-span-8 flex flex-col gap-6">
              <MapMonitor
                hourlyPredictions={periodPredictions}
                selectedHour={selectedHour}
                setSelectedHour={setSelectedHour}
                selectedCorridorId={selectedCorridorId}
                setSelectedCorridorId={setSelectedCorridorId}
              />

              {/* Completely separate Network Congestion Heat Map below the existing Map section */}
              <NetworkHeatMap
                predictions={periodPredictions}
                selectedHour={selectedHour}
                setSelectedHour={setSelectedHour}
                selectedCorridorId={selectedCorridorId}
                setSelectedCorridorId={setSelectedCorridorId}
              />
            </div>

            {/* Live Systems Operations Panel (4 cols) */}
            <div className="xl:col-span-4 flex flex-col gap-6" id="operator-side-panel">
              
              {/* Mistral Multi-Agent Command Center */}
              <MistralCommandCenter
                selectedHour={selectedHour}
                hourlyPredictions={periodPredictions}
                activeYearMonthFilter={activeYearMonthFilter}
                selectedCorridorId={selectedCorridorId}
                setSelectedCorridorId={setSelectedCorridorId}
                onApplyAdjustment={(corridorId, adjData) => {
                  setActiveAdjustments(prev => {
                    if (adjData === null) {
                      const copy = { ...prev };
                      delete copy[corridorId];
                      return copy;
                    }
                    return { ...prev, [corridorId]: adjData };
                  });
                }}
                onAddLog={(msg) => {
                  const now = new Date();
                  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                  setOperatorLogs(prev => [...prev, { time: timeStr, msg }]);
                }}
                activeAdjustments={activeAdjustments}
              />

              {/* Aggregated Real-time Stats */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rta-blue" />
                  Network Forecast Summary (Selected Hour)
                </h3>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Avg Network Speed</div>
                    <div className="text-lg font-bold font-mono text-rta-blue mt-1">{networkStats.avgSpeed} <span className="text-[10px] text-slate-400">kph</span></div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Bottlenecks</div>
                    <div className={`text-lg font-bold font-mono mt-1 ${networkStats.bottlenecks > 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>
                      {networkStats.bottlenecks}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Delay index</div>
                    <div className="text-lg font-bold font-mono text-amber-600 mt-1">{networkStats.avgDelay}x</div>
                  </div>
                </div>
              </div>

              {/* Active Risk Corridor Warnings */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex-1">
                <div className="flex flex-col gap-3 mb-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
                      Predictive Congestion Triggers
                    </h3>
                    <span className="bg-slate-100 text-slate-600 text-[10px] font-mono px-1.5 py-0.5 rounded">
                      Hour {String(selectedHour).padStart(2, '0')}:00
                    </span>
                  </div>

                  {/* Segmented switcher for Current vs Next Hour predictions */}
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setPredictionViewMode('current')}
                      className={`flex-1 text-center font-mono text-[10px] font-bold py-1.5 px-2 rounded-md transition-all ${
                        predictionViewMode === 'current'
                          ? 'bg-white text-rta-blue shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      CURRENT (HOUR {String(selectedHour).padStart(2, '0')}:00)
                    </button>
                    <button
                      onClick={() => setPredictionViewMode('next')}
                      className={`flex-1 text-center font-mono text-[10px] font-bold py-1.5 px-2 rounded-md transition-all ${
                        predictionViewMode === 'next'
                          ? 'bg-white text-rta-blue shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      NEXT HOUR (HOUR {String((selectedHour + 1) % 24).padStart(2, '0')}:00)
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 max-h-[220px] overflow-auto pr-1">
                  {alertingCorridors.length > 0 ? (
                    alertingCorridors.map(row => {
                      const isHighlighted = selectedCorridorId === row.location_id;
                      const nextHourRow = nextHourPredsMap.get(row.location_id);
                      const currentHourRow = currentHourPredsMap.get(row.location_id);

                      return (
                        <div
                          key={row.location_id}
                          onClick={() => setSelectedCorridorId(isHighlighted ? null : row.location_id)}
                          className={`bg-slate-50 border cursor-pointer hover:border-rta-blue transition-all p-3 rounded-lg flex flex-col gap-2 ${
                            isHighlighted ? 'border-rta-blue shadow-sm ring-1 ring-rta-blue/20' : 'border-slate-100'
                          }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-200 text-slate-700 font-mono text-[9px] px-1 py-0.2 rounded font-bold">
                                  {row.road_code}
                                </span>
                                <span className="text-xs text-slate-800 font-semibold font-mono">{row.location_id}</span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 mt-1">
                                Predicted volume: <span className="text-slate-700 font-bold">{Math.round(row.pred_later_anpr_passage_mean).toLocaleString()} vph</span>
                              </div>
                            </div>

                            <div className="text-right flex flex-col items-end gap-1">
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded" style={{
                                color: row.risk_band === 'critical' ? '#DA291C' : '#e65100',
                                backgroundColor: row.risk_band === 'critical' ? '#DA291C10' : '#f9731610',
                                border: `1px solid ${row.risk_band === 'critical' ? '#DA291C25' : '#f9731625'}`
                              }}>
                                {row.risk_band}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-slate-500">
                                {Math.round(row.pred_congestion_probability * 100)}% Risk
                              </span>
                            </div>
                          </div>

                          {/* Multi-hour preview comparisons */}
                          <div className="border-t border-slate-200/60 pt-1.5 mt-0.5">
                            {predictionViewMode === 'current' && nextHourRow && (
                              <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between w-full">
                                <span className="text-slate-500 font-medium">Next Hour Forecast:</span>
                                <span className="font-bold uppercase px-1 py-0.2 rounded" style={{
                                  color: nextHourRow.risk_band === 'critical' ? '#DA291C' : '#e65100',
                                  backgroundColor: nextHourRow.risk_band === 'critical' ? '#DA291C10' : '#f9731610',
                                }}>
                                  {nextHourRow.risk_band} ({Math.round(nextHourRow.pred_congestion_probability * 100)}% Risk)
                                </span>
                              </div>
                            )}
                            {predictionViewMode === 'next' && (
                              <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between w-full">
                                <span className="text-slate-500 font-medium">Current Hour Risk:</span>
                                <span className="font-bold uppercase px-1 py-0.2 rounded" style={{
                                  color: currentHourRow?.risk_band === 'critical' ? '#DA291C' : currentHourRow?.risk_band === 'high' ? '#e65100' : '#16a34a',
                                  backgroundColor: currentHourRow?.risk_band === 'critical' ? '#DA291C10' : currentHourRow?.risk_band === 'high' ? '#f9731610' : '#16a34a10',
                                }}>
                                  {currentHourRow?.risk_band || 'low'} ({Math.round((currentHourRow?.pred_congestion_probability || 0) * 100)}% Risk)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center p-8 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 font-mono text-xs">
                      {predictionViewMode === 'current' 
                        ? `No active corridor bottleneck warnings detected for Hour ${String(selectedHour).padStart(2, '0')}:00. Network flowing smoothly.`
                        : `No active corridor bottleneck warnings predicted for Next Hour ${String((selectedHour + 1) % 24).padStart(2, '0')}:00. Network expected to flow smoothly.`
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Live Operator Activity Event log */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Operator Action Log Feed
                </h3>

                <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-lg font-mono text-[10px] leading-relaxed text-slate-600 flex flex-col gap-2.5 max-h-[140px] overflow-auto">
                  {allLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-sky-700 font-bold shrink-0">[{log.time}]</span>
                      <span>{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'studio' && (
          <div className="h-full">
            <MetricsStudio predictions={hourlyPredictions} />
          </div>
        )}

        {activeTab === 'database' && (
          <div className="h-full">
            <DataExplorer predictions={hourlyPredictions} />
          </div>
        )}
      </main>

      {/* Universal Humble Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] font-mono text-slate-500 shrink-0">
        <div>
          RTA HACKATHON PROTOTYPE • EVALUATED ON A SYNTHETIC 2025 HOLDOUT
        </div>
        <div className="text-slate-400">
          This system validates traffic patterns on a simulated dataset. It is not an active citizen surveillance system.
        </div>
      </footer>

    </div>
  );
}
