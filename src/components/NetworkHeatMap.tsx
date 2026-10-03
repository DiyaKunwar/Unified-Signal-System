/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Info, ChevronRight } from 'lucide-react';
import { PredictionRow, CorridorMetadata } from '../types';
import { CORRIDORS } from '../data/trafficData';

interface NetworkHeatMapProps {
  predictions: PredictionRow[];
  selectedHour: number;
  setSelectedHour: (hour: number) => void;
  selectedCorridorId: string | null;
  setSelectedCorridorId: (id: string | null) => void;
}

export default function NetworkHeatMap({
  predictions,
  selectedHour,
  setSelectedHour,
  selectedCorridorId,
  setSelectedCorridorId,
}: NetworkHeatMapProps) {
  // Tooltip tracking state
  const [hoveredCell, setHoveredCell] = useState<{
    corridorId: string;
    corridorName: string;
    roadCode: string;
    direction: string;
    hour: number;
    prob: number;
    speed: number;
    volume: number;
    riskBand: string;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Group and average predictions across all dates for the active evaluation period
  const gridMap = useMemo(() => {
    const aggMap = new Map<string, {
      probSum: number;
      speedSum: number;
      volumeSum: number;
      count: number;
    }>();

    predictions.forEach(p => {
      const key = `${p.location_id}_${p.hour}`;
      const existing = aggMap.get(key);
      if (!existing) {
        aggMap.set(key, {
          probSum: p.pred_congestion_probability,
          speedSum: p.fw_speed_mean,
          volumeSum: p.pred_later_anpr_passage_mean,
          count: 1
        });
      } else {
        existing.probSum += p.pred_congestion_probability;
        existing.speedSum += p.fw_speed_mean;
        existing.volumeSum += p.pred_later_anpr_passage_mean;
        existing.count += 1;
      }
    });

    return aggMap;
  }, [predictions]);

  // Generate a beautiful, continuous, color-interpolated CSS color based on risk probability
  const getHeatColor = (prob: number) => {
    if (prob < 0.3) {
      // Low risk: Green (emerald-500) -> Yellow-Green (yellow-400)
      const ratio = prob / 0.3;
      const r = Math.round(16 + (250 - 16) * ratio);
      const g = Math.round(185 + (204 - 185) * ratio);
      const b = Math.round(129 + (21 - 129) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (prob < 0.6) {
      // Medium risk: Yellow-Green (yellow-400) -> Orange (orange-500)
      const ratio = (prob - 0.3) / 0.3;
      const r = Math.round(250 + (249 - 250) * ratio);
      const g = Math.round(204 + (115 - 204) * ratio);
      const b = Math.round(21 + (22 - 21) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // High/Critical risk: Orange (orange-500) -> Rose Red (rose-500)
      const ratio = Math.min(1, (prob - 0.6) / 0.4);
      const r = Math.round(249 + (244 - 249) * ratio);
      const g = Math.round(115 + (63 - 115) * ratio);
      const b = Math.round(22 + (94 - 22) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Get qualitative risk band text
  const getRiskBand = (prob: number) => {
    if (prob > 0.8) return { text: 'Critical', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (prob > 0.6) return { text: 'High', bg: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (prob > 0.3) return { text: 'Medium', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { text: 'Low', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  // Cell hover handler with viewport relative coordinate calculation
  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    corridor: CorridorMetadata,
    hour: number,
    prob: number,
    speed: number,
    volume: number,
    riskBand: string
  ) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const cellRect = e.currentTarget.getBoundingClientRect();
    
    // Position tooltip absolute to the parent card container
    const x = cellRect.left - containerRect.left + cellRect.width / 2;
    const y = cellRect.top - containerRect.top - 8;

    setHoveredCell({
      corridorId: corridor.id,
      corridorName: corridor.name,
      roadCode: corridor.road,
      direction: corridor.direction,
      hour,
      prob,
      speed,
      volume,
      riskBand,
      x,
      y
    });
  };

  const hoursArray = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div 
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-visible mt-6" 
      id="rta-network-heatmap"
      ref={containerRef}
    >
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-md sm:text-lg font-display font-medium text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-rta-blue" />
            Network Congestion Heat Map (24h Trend Matrix)
          </h2>
          <p className="text-xs font-mono text-slate-500">
            Hourly predictive profiling of all corridors. Click any cell to jump the map and summary panels to that hour.
          </p>
        </div>
        
        {/* Dynamic Legend */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">Predictive Risk Gradient</div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono text-slate-400">0%</span>
            <div className="w-40 h-2 rounded-sm bg-gradient-to-r from-emerald-500 via-yellow-400 via-orange-500 to-rose-500 border border-slate-200/50"></div>
            <span className="text-[9px] font-mono text-slate-400">100%</span>
          </div>
          <div className="flex justify-between w-40 text-[8px] font-mono text-slate-400 px-0.5 leading-none">
            <span>Low</span>
            <span>Med</span>
            <span>High</span>
            <span>Crit</span>
          </div>
        </div>
      </div>

      {/* Grid Container with horizontal scroll wrapper to maintain responsive integrity */}
      <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <div className="min-w-[800px] flex flex-col select-none">
          
          {/* Columns Header (Hours 00:00 - 23:00) */}
          <div className="flex items-center mb-1.5">
            <div className="w-[180px] shrink-0 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider pl-1">
              Corridor ID
            </div>
            <div className="flex flex-1 justify-between text-center pl-2">
              {hoursArray.map(hour => {
                const isSelected = selectedHour === hour;
                return (
                  <div 
                    key={hour} 
                    className={`flex-1 text-[10px] font-mono transition-all font-bold ${
                      isSelected 
                        ? 'text-rta-blue bg-slate-100 rounded-sm py-0.5 scale-110 font-bold border border-slate-200' 
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {String(hour).padStart(2, '0')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Matrix Rows (Corridors) */}
          <div className="flex flex-col gap-1.5">
            {CORRIDORS.map(corridor => {
              const isSelectedCorridor = selectedCorridorId === corridor.id;
              
              return (
                <div 
                  key={corridor.id} 
                  className={`flex items-center rounded-lg p-1 transition-all ${
                    isSelectedCorridor 
                      ? 'bg-slate-50 ring-1 ring-rta-blue/10 border-l-4 border-l-rta-blue' 
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  {/* Left Label */}
                  <div 
                    className="w-[176px] shrink-0 flex items-center justify-between pr-2 cursor-pointer"
                    onClick={() => setSelectedCorridorId(isSelectedCorridor ? null : corridor.id)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="bg-slate-200/80 text-slate-700 border border-slate-300 font-mono text-[9px] px-1 py-0.2 rounded font-bold shrink-0">
                        {corridor.road}
                      </span>
                      <span className="text-xs text-slate-700 font-bold font-mono truncate" title={corridor.name}>
                        {corridor.id}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono font-semibold text-slate-400 shrink-0 uppercase tracking-wider pl-1 bg-slate-100 px-1 rounded-xs border border-slate-200/50">
                      {corridor.direction}
                    </span>
                  </div>

                  {/* Heatmap Row Cells */}
                  <div className="flex flex-1 justify-between items-center gap-[3px] pl-2">
                    {hoursArray.map(hour => {
                      const key = `${corridor.id}_${hour}`;
                      const agg = gridMap.get(key);
                      
                      const prob = agg ? agg.probSum / agg.count : 0.05;
                      const speed = agg ? Math.round(agg.speedSum / agg.count) : corridor.avgSpeed;
                      const volume = agg ? Math.round(agg.volumeSum / agg.count) : corridor.avgVolume;
                      
                      const rbInfo = getRiskBand(prob);
                      const isSelectedHour = selectedHour === hour;
                      const isFullyActive = isSelectedCorridor && isSelectedHour;
                      
                      const cellColor = getHeatColor(prob);

                      return (
                        <div
                          key={hour}
                          onMouseEnter={(e) => handleCellMouseEnter(e, corridor, hour, prob, speed, volume, rbInfo.text)}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => {
                            setSelectedHour(hour);
                            setSelectedCorridorId(corridor.id);
                          }}
                          className="flex-1 h-7 rounded-sm cursor-pointer transition-all duration-150 relative"
                          style={{
                            backgroundColor: cellColor,
                            boxShadow: isFullyActive 
                              ? '0 0 0 2px #ffffff, 0 0 0 4px #003C71' 
                              : isSelectedHour 
                                ? 'inset 0 0 0 1px rgba(255,255,255,0.4), 0 0 0 1px rgba(0,0,0,0.1)' 
                                : 'none',
                            transform: isFullyActive ? 'scale(1.15)' : 'none',
                            zIndex: isFullyActive ? 10 : 1,
                            opacity: (selectedCorridorId === null || isSelectedCorridor) ? 1.0 : 0.45
                          }}
                        >
                          {/* Selected hour subtle highlight border inside cell */}
                          {isSelectedHour && !isFullyActive && (
                            <div className="absolute inset-0 border border-slate-900/10 rounded-sm"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Floating Interactive Tooltip using Framer Motion */}
      <AnimatePresence>
        {hoveredCell && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 pointer-events-none bg-slate-900 text-slate-100 rounded-lg p-3 shadow-xl border border-slate-700/50 w-64 text-left leading-relaxed"
            style={{
              left: hoveredCell.x,
              top: hoveredCell.y,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          >
            {/* Tooltip Arrow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-slate-900"></div>

            <div className="flex justify-between items-start gap-1">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-slate-800 text-slate-300 font-mono text-[9px] px-1 py-0.2 rounded font-bold uppercase">
                    {hoveredCell.roadCode}
                  </span>
                  <span className="text-xs text-white font-bold font-mono">
                    {hoveredCell.corridorId}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 font-medium truncate mt-0.5">
                  {hoveredCell.corridorName} ({hoveredCell.direction})
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-slate-400 font-mono font-bold">WINDOW</div>
                <div className="text-xs text-amber-400 font-mono font-bold">
                  {String(hoveredCell.hour).padStart(2, '0')}:00
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 my-2 pt-2 flex flex-col gap-1.5 text-[10px] font-mono text-slate-300">
              <div className="flex justify-between">
                <span>Congestion Risk:</span>
                <span className="font-bold text-white">
                  {Math.round(hoveredCell.prob * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Risk Level:</span>
                <span 
                  className="font-bold uppercase tracking-wide text-[9px] px-1 rounded-xs"
                  style={{
                    color: hoveredCell.prob > 0.8 ? '#f43f5e' : hoveredCell.prob > 0.6 ? '#f97316' : hoveredCell.prob > 0.3 ? '#fbbf24' : '#10b981',
                    backgroundColor: hoveredCell.prob > 0.8 ? 'rgba(244, 63, 94, 0.15)' : hoveredCell.prob > 0.6 ? 'rgba(249, 115, 22, 0.15)' : hoveredCell.prob > 0.3 ? 'rgba(251, 191, 36, 0.15)' : 'rgba(16, 185, 129, 0.15)'
                  }}
                >
                  {hoveredCell.riskBand}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Predicted Volume:</span>
                <span className="text-white font-bold">{hoveredCell.volume} vph</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Speed:</span>
                <span className="text-white font-bold">{hoveredCell.speed} kph</span>
              </div>
            </div>

            <div className="text-[8px] text-slate-400 mt-1 font-mono text-center flex items-center justify-center gap-1">
              <span>Click cell to sync timeline</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytical Interpretation Row */}
      <div className="mt-4 bg-slate-50 border border-slate-200/80 p-3.5 rounded-lg flex gap-3 text-xs leading-relaxed text-slate-600">
        <Info className="w-5 h-5 text-rta-blue shrink-0 mt-0.5" />
        <div className="font-sans">
          <span className="font-bold text-slate-800">How to read this:</span> each cell is the model's predicted congestion probability for that corridor and hour, averaged over the selected evaluation period of the 2025 holdout (synthetic data).
        </div>
      </div>
    </div>
  );
}
