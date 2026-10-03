/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Compass, X } from 'lucide-react';
import { PredictionRow } from '../types';
import { CORRIDORS } from '../data/trafficData';

interface MapMonitorProps {
  hourlyPredictions: PredictionRow[];
  selectedHour: number;
  setSelectedHour: (hour: number) => void;
  selectedCorridorId: string | null;
  setSelectedCorridorId: (id: string | null) => void;
}

export default function MapMonitor({
  hourlyPredictions,
  selectedHour,
  setSelectedHour,
  selectedCorridorId,
  setSelectedCorridorId,
}: MapMonitorProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1000); // ms per hour
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter predictions for the current hour
  const currentHourPreds = hourlyPredictions.filter(p => p.hour === selectedHour);

  // Play/Pause simulation effect
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setSelectedHour((selectedHour + 1) % 24);
      }, speedMultiplier);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, selectedHour, speedMultiplier, setSelectedHour]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const resetSimulation = () => {
    setIsPlaying(false);
    setSelectedHour(0);
  };

  // Helper to find prediction for a specific corridor
  const getPredForCorridor = (id: string) => {
    return currentHourPreds.find(p => p.location_id === id);
  };

  // Helper to assign a color based on risk_band
  const getRiskColor = (band?: string) => {
    switch (band) {
      case 'critical': return '#f43f5e'; // rose-500
      case 'high': return '#f97316'; // orange-500
      case 'medium': return '#eab308'; // yellow-500
      case 'low': return '#10b981'; // emerald-500
      default: return '#6b7280'; // gray-500
    }
  };

  // Highlighted/Selected Corridor Details
  const activeCorridor = CORRIDORS.find(c => c.id === selectedCorridorId);
  const activePred = selectedCorridorId ? getPredForCorridor(selectedCorridorId) : null;

  // Mistral dynamic explanation integration
  const [explanationText, setExplanationText] = useState<string>('');
  const [explanationLoading, setExplanationLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedCorridorId || !activePred) {
      setExplanationText('');
      return;
    }

    let recAction = "No action required. Standard passive monitoring.";
    if (activePred.risk_band === 'critical') {
      recAction = "Deploy Dynamic Salik surcharge, reduce smart speed signs to 80 kph, and activate Peak smart gate lane redirection.";
    } else if (activePred.risk_band === 'high') {
      recAction = "Dispatch RTA traffic patrols and adjust warning advisory boards.";
    } else if (activePred.risk_band === 'medium') {
      recAction = "Continue passive camera monitoring and standby patrol dispatch.";
    }

    const fetchExplanation = async () => {
      setExplanationLoading(true);
      setExplanationText('Generating AI explanation with Mistral...');
      try {
        const res = await fetch('/api/explain-corridor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            risk_score: activePred.pred_congestion_probability,
            risk_band: activePred.risk_band,
            recommended_action: recAction
          })
        });
        if (res.ok) {
          const data = await res.json();
          setExplanationText(data.explanation);
        } else {
          throw new Error('Failed to fetch explanation');
        }
      } catch (err) {
        console.error("Error fetching Mistral explanation:", err);
        setExplanationText(`Flagged due to elevated risk of ${activePred.risk_band} congestion (${Math.round(activePred.pred_congestion_probability * 100)}% probability); recommended action is to ${recAction.toLowerCase()}`);
      } finally {
        setExplanationLoading(false);
      }
    };

    fetchExplanation();
  }, [selectedCorridorId, activePred?.location_id, activePred?.risk_band]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col shadow-sm relative overflow-hidden" id="rta-tactical-map">
      {/* Absolute futuristic subtle grids */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none"></div>

      {/* Title Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 z-10">
        <div>
          <h2 className="text-lg font-display font-medium text-slate-800 flex items-center gap-2">
            <Compass className="w-5 h-5 text-rta-blue animate-pulse" />
            Corridor Congestion Forecast Map
          </h2>
          <p className="text-xs font-mono text-slate-500">
            Random Forest congestion forecast per corridor and hour (2025 holdout, synthetic data)
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-mono text-slate-600">MODEL FORECAST</span>
        </div>
      </div>

      {/* Map Container */}
      <div className="mt-2 z-10 relative">
        {/* Map Area */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden relative h-[360px] w-full flex items-center justify-center">
        
        {/* Dynamic map statistics overlay */}
        <div className="absolute top-3 right-3 flex flex-row items-center gap-3 whitespace-nowrap text-[10px] font-mono text-slate-700 bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 pointer-events-none z-10 shadow-xs">
          <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mb-0">Risk Intensity</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]"></span> CRITICAL (&gt;80%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]"></span> HIGH (60-80%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]"></span> MEDIUM (30-60%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span> LOW (&lt;30%)
          </div>
        </div>

        {/* Geographic coordinates & map labels */}
        <div className="absolute top-3 left-3 flex flex-col gap-1 text-[10px] font-mono text-slate-600 bg-white/80 backdrop-blur-md p-2 rounded border border-slate-200 pointer-events-none z-10">
          <div>SCHEMATIC LAYOUT — NOT TO SCALE</div>
        </div>

        <svg
          viewBox="0 95 800 370"
          className="w-full h-full max-h-[320px] select-none"
        >

              {/* Render Highway Corridor paths */}
              {CORRIDORS.map(corridor => {
                const pred = getPredForCorridor(corridor.id);
                const isSelected = selectedCorridorId === corridor.id;
                const color = getRiskColor(pred?.risk_band);
                
                // Adjust flow speed of animated dots based on speed
                const flowSpeed = pred ? Math.max(1, Math.round(15 - (pred.fw_speed_mean / 10))) : 8;
                
                return (
                  <g key={corridor.id} className="cursor-pointer group" onClick={() => setSelectedCorridorId(isSelected ? null : corridor.id)}>
                    {/* Background glow shadow under selected corridor */}
                    {isSelected && (
                      <line
                        x1={corridor.startX}
                        y1={corridor.startY}
                        x2={corridor.endX}
                        y2={corridor.endY}
                        stroke={color}
                        strokeWidth="10"
                        strokeLinecap="round"
                        opacity="0.3"
                        className="blur-sm"
                      />
                    )}

                    {/* Wide hover path triggers */}
                    <line
                      x1={corridor.startX}
                      y1={corridor.startY}
                      x2={corridor.endX}
                      y2={corridor.endY}
                      stroke="transparent"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />

                    {/* Primary road outline */}
                    <line
                      x1={corridor.startX}
                      y1={corridor.startY}
                      x2={corridor.endX}
                      y2={corridor.endY}
                      stroke={isSelected ? '#003C71' : '#cbd5e1'}
                      strokeWidth={isSelected ? '6' : '4'}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />

                    {/* Color-coded speed/risk layer */}
                    <line
                      x1={corridor.startX}
                      y1={corridor.startY}
                      x2={corridor.endX}
                      y2={corridor.endY}
                      stroke={color}
                      strokeWidth={isSelected ? '4' : '2'}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />

                    {/* Flow particles (dash arrays animation) representing ANPR volume flow */}
                    <line
                      x1={corridor.startX}
                      y1={corridor.startY}
                      x2={corridor.endX}
                      y2={corridor.endY}
                      stroke={isSelected ? '#ffffff' : '#003C71'}
                      strokeWidth="1.5"
                      strokeDasharray="6 30"
                      strokeLinecap="round"
                      opacity="0.75"
                    >
                      <animate
                         attributeName="stroke-dashoffset"
                         values={corridor.id.includes('S1') || corridor.id.includes('W1') || corridor.id.includes('W') ? "0;200" : "200;0"}
                         dur={`${flowSpeed}s`}
                         repeatCount="indefinite"
                      />
                    </line>

                    {/* Alert beacon on critical routes */}
                    {pred?.risk_band === 'critical' && (
                      <circle
                        cx={(corridor.startX + corridor.endX) / 2}
                        cy={(corridor.startY + corridor.endY) / 2}
                        r="8"
                        fill="#f43f5e"
                        className="animate-ping"
                        opacity="0.4"
                      />
                    )}

                    {/* Tiny directional indicator arrowheads */}
                    <polygon
                      points={`${corridor.endX},${corridor.endY} ${corridor.endX - 10},${corridor.endY - 4} ${corridor.endX - 10},${corridor.endY + 4}`}
                      fill={color}
                      transform={`rotate(${Math.atan2(corridor.endY - corridor.startY, corridor.endX - corridor.startX) * 180 / Math.PI} ${corridor.endX} ${corridor.endY})`}
                      opacity="0.8"
                    />
                  </g>
                );
              })}

              {/* Corridor id labels */}
              {CORRIDORS.map(c => {
                const vertical = c.startX === c.endX;
                const x = vertical ? c.startX - 5 : (c.startX + c.endX) / 2;
                const y = vertical ? (c.startY + c.endY) / 2 : Math.min(c.startY, c.endY) - 6;
                return (
                  <text
                    key={`label-${c.id}`}
                    x={x}
                    y={y}
                    transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
                    fill="#475569"
                    className="text-[8px] font-mono font-bold pointer-events-none"
                    textAnchor="middle"
                  >
                    {c.id}
                  </text>
                );
              })}
            </svg>
        </div>
      </div>

      {/* Selected Corridor details panel positioned BELOW the map container */}
      <AnimatePresence mode="wait">
        {activeCorridor && activePred && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.25 }}
            className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs relative z-10 overflow-hidden"
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedCorridorId(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200/50 transition-all cursor-pointer z-20"
              title="Close Panel"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Grid Layout to give metrics massive breathing room */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Corridor Identity Area - 4 columns */}
              <div className="lg:col-span-4 flex flex-col gap-1.5 min-w-0 pr-0 lg:pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-rta-blue/10 text-rta-blue border border-rta-blue/20 text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wide uppercase">
                    {activeCorridor.road} • {activeCorridor.direction}
                  </span>
                  <span className="bg-slate-200/80 text-slate-700 border border-slate-300 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                    {activeCorridor.id}
                  </span>
                </div>
                <h4 className="text-base font-display font-bold text-slate-800 leading-tight">
                  {activeCorridor.name}
                </h4>
                <p className={`text-[11px] font-mono transition-all duration-300 ${explanationLoading ? 'text-slate-400 animate-pulse' : 'text-slate-600'} leading-relaxed`}>
                  {explanationText || 'Random Forest forecast from first-week corridor statistics.'}
                </p>
              </div>

              {/* Advanced Performance Telemetry Indicators - 5 columns */}
              <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 text-center shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">W1 VOLUME</div>
                  <div className="text-sm font-mono font-bold text-slate-800">
                    {Number(activePred.fw_anpr_passage_mean).toFixed(0)}
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">vehicles/h</div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 text-center shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">AVG SPEED</div>
                  <div className="text-sm font-mono font-bold text-slate-800">
                    {Number(activePred.fw_speed_mean).toFixed(2)}
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">kph</div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 text-center shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">V/C RATIO</div>
                  <div className="text-sm font-mono font-bold text-slate-800">
                    {Number(activePred.fw_vc_mean).toFixed(2)}
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">volume/cap</div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 text-center shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">TTI INDEX</div>
                  <div className="text-sm font-mono font-bold text-slate-800">
                    {Number(activePred.fw_tti_mean).toFixed(2)}
                  </div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">travel time</div>
                </div>
              </div>

              {/* Congestion Risk & Live Response - 3 columns */}
              <div className="lg:col-span-3 flex flex-col gap-3 w-full pl-0 lg:pl-6 lg:border-l lg:border-slate-200">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <span>CONGESTION RISK</span>
                    <span className="text-slate-700 font-extrabold">{Math.round(activePred.pred_congestion_probability * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${activePred.pred_congestion_probability * 100}%`,
                          backgroundColor: getRiskColor(activePred.risk_band)
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-2 shadow-2xs">
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">RESPONSE</span>
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      color: getRiskColor(activePred.risk_band),
                      backgroundColor: `${getRiskColor(activePred.risk_band)}1a`,
                      border: `1px solid ${getRiskColor(activePred.risk_band)}33`
                    }}
                  >
                    {activePred.risk_band} RISK
                  </span>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control Timeline Bar */}
      <div className="mt-4 bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Play Button */}
            <button
              onClick={togglePlay}
              className={`p-2 rounded-full transition-colors ${
                isPlaying
                  ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                  : 'bg-rta-blue/10 text-rta-blue hover:bg-rta-blue/20'
              } border border-slate-200`}
              title={isPlaying ? "Pause Simulation" : "Start 24h Playback"}
              id="simulation-play-btn"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-amber-600" /> : <Play className="w-4 h-4 fill-rta-blue" />}
            </button>

            {/* Reset Button */}
            <button
              onClick={resetSimulation}
              className="p-2 rounded-full bg-white text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors"
              title="Reset Timeline"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Sim Speed Toggles */}
            <div className="flex bg-white border border-slate-200 rounded p-0.5">
              <button
                onClick={() => setSpeedMultiplier(2000)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded ${speedMultiplier === 2000 ? 'bg-rta-blue text-slate-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                1x
              </button>
              <button
                onClick={() => setSpeedMultiplier(1000)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded ${speedMultiplier === 1000 ? 'bg-rta-blue text-slate-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                2x
              </button>
              <button
                onClick={() => setSpeedMultiplier(300)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded ${speedMultiplier === 300 ? 'bg-rta-blue text-slate-100' : 'text-slate-500 hover:text-slate-800'}`}
              >
                5x
              </button>
            </div>
          </div>

          {/* Large Hour Counter Display */}
          <div className="text-right">
            <div className="text-[10px] font-mono text-slate-400">PREDICTIVE CONGESTION WINDOW</div>
            <div className="text-xl font-display font-bold text-rta-blue font-mono tracking-wider">
              {String(selectedHour).padStart(2, '0')}:00 <span className="text-xs text-slate-400">HUR</span>
            </div>
          </div>
        </div>

        {/* Hour Slider */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-slate-400">00:00</span>
          <div className="flex-1 relative py-2">
            <input
              type="range"
              min="0"
              max="23"
              value={selectedHour}
              onChange={(e) => setSelectedHour(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rta-blue focus:outline-none focus:ring-1 focus:ring-rta-blue"
            />
            {/* Hour labels markers */}
            <div className="absolute top-6 left-0 right-0 flex justify-between px-1 text-[9px] font-mono text-slate-400 pointer-events-none">
              <span>03</span>
              <span>06</span>
              <span>09</span>
              <span>12</span>
              <span>15</span>
              <span>18</span>
              <span>21</span>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">23:00</span>
        </div>
      </div>
    </div>
  );
}
