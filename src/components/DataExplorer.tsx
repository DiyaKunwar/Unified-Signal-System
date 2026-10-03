/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';

import { PredictionRow } from '../types';
import { Search, ArrowUpDown, Download, Eye } from 'lucide-react';

interface DataExplorerProps {
  predictions?: PredictionRow[];
}

export default function DataExplorer({ predictions = [] }: DataExplorerProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRoad, setSelectedRoad] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedHour, setSelectedHour] = useState<string>('all');
  
  // Sort state
  const [sortField, setSortField] = useState<keyof PredictionRow>('pred_congestion_probability');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Collect unique roads, risks, hours for drop-downs
  const roads = useMemo(() => {
    return ['all', ...Array.from(new Set(predictions.map(p => p.road_code)))];
  }, [predictions]);

  const riskBands = ['all', 'low', 'medium', 'high', 'critical'];

  // Handle Sort
  const handleSort = (field: keyof PredictionRow) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filter & Sort Data
  const processedData = useMemo(() => {
    let filtered = predictions.filter(row => {
      // Search text matches corridor ID or road code
      const textMatch = searchQuery === '' || 
        row.location_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.road_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.risk_band.toLowerCase().includes(searchQuery.toLowerCase());

      const roadMatch = selectedRoad === 'all' || row.road_code === selectedRoad;
      const riskMatch = selectedRisk === 'all' || row.risk_band === selectedRisk;
      const hourMatch = selectedHour === 'all' || String(row.hour) === selectedHour;

      return textMatch && roadMatch && riskMatch && hourMatch;
    });

    // Sort
    filtered.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [predictions, searchQuery, selectedRoad, selectedRisk, selectedHour, sortField, sortDirection]);

  // Export mock CSV trigger
  const triggerCsvDownload = () => {
    const headers = 'year_month,location_id,road_code,direction,hour,fw_anpr_passage_mean,fw_speed_mean,pred_later_anpr_passage_mean,pred_congestion_probability,risk_band\n';
    const rows = processedData.map(r => 
      `${r.year_month},${r.location_id},${r.road_code},${r.direction},${r.hour},${r.fw_anpr_passage_mean},${r.fw_speed_mean},${r.pred_later_anpr_passage_mean},${r.pred_congestion_probability},${r.risk_band}`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `Unified_Signal_System_ANPR_Traffic_Predictions_${selectedRoad}.csv`);
    a.click();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col h-full shadow-sm" id="data-explorer">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 mb-5 gap-4">
        <div>
          <h2 className="text-lg font-display font-medium text-slate-800 flex items-center gap-2">
            <Eye className="w-5 h-5 text-rta-blue" />
            2025 Holdout Predictions Explorer
          </h2>
          <p className="text-xs text-slate-500 font-mono">
            2025 holdout predictions from the Random Forest pipeline (first-week features, later-month forecasts)
          </p>
        </div>

        <button
          onClick={triggerCsvDownload}
          className="bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          id="export-csv-btn"
        >
          <Download className="w-4 h-4" />
          Export Query CSV
        </button>
      </div>

      {/* Query Filters Grid */}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search location (e.g. SZR)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 text-xs font-mono text-slate-700 pl-9 pr-3 py-2 rounded focus:outline-none focus:border-rta-blue"
          />
        </div>

        {/* Road Filter */}
        <div>
          <select
            value={selectedRoad}
            onChange={(e) => setSelectedRoad(e.target.value)}
            className="w-full bg-white border border-slate-200 text-xs font-mono text-slate-700 px-3 py-2 rounded focus:outline-none focus:border-rta-blue"
          >
            <option value="all">Filter Road: All</option>
            {roads.filter(r => r !== 'all').map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Risk Filter */}
        <div>
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="w-full bg-white border border-slate-200 text-xs font-mono text-slate-700 px-3 py-2 rounded focus:outline-none focus:border-rta-blue"
          >
            <option value="all">Filter Risk: All</option>
            {riskBands.filter(rb => rb !== 'all').map(rb => (
              <option key={rb} value={rb}>{rb.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Hour Filter */}
        <div>
          <select
            value={selectedHour}
            onChange={(e) => setSelectedHour(e.target.value)}
            className="w-full bg-white border border-slate-200 text-xs font-mono text-slate-700 px-3 py-2 rounded focus:outline-none focus:border-rta-blue"
          >
            <option value="all">Filter Hour: All</option>
            {Array.from({ length: 24 }).map((_, i) => (
              <option key={i} value={String(i)}>{String(i).padStart(2, '0')}:00 HRS</option>
            ))}
          </select>
        </div>

      </div>

      {/* Results Count Summary */}
      <div className="text-[10px] font-mono text-slate-500 mb-3 uppercase">
        SHOWING {processedData.length} OF {predictions.length} CORRIDOR WINDOWS MATCHED
      </div>

      {/* Grid Table Container */}
      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-lg max-h-[380px]">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="p-3 cursor-pointer select-none" onClick={() => handleSort('location_id')}>
                <div className="flex items-center gap-1">CORRIDOR <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-center cursor-pointer select-none" onClick={() => handleSort('hour')}>
                <div className="flex items-center justify-center gap-1">HOUR <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort('fw_anpr_passage_mean')}>
                <div className="flex items-center justify-end gap-1">W1 MEAN <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort('fw_speed_mean')}>
                <div className="flex items-center justify-end gap-1">W1 SPEED <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort('pred_later_anpr_passage_mean')}>
                <div className="flex items-center justify-end gap-1">PRED VOL <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort('pred_congestion_probability')}>
                <div className="flex items-center justify-end gap-1">RISK PROB <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
              <th className="p-3 text-center cursor-pointer select-none" onClick={() => handleSort('risk_band')}>
                <div className="flex items-center justify-center gap-1">RISK BAND <ArrowUpDown className="w-3.5 h-3.5" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {processedData.length > 0 ? (
              processedData.map((row, idx) => (
                <tr key={`${row.location_id}-${row.hour}-${idx}`} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-semibold text-slate-700">
                    <span className="bg-slate-100 text-slate-600 border border-slate-200/60 px-1.5 py-0.5 rounded text-[10px] mr-2 font-bold">{row.road_code}</span>
                    {row.location_id} | {row.direction}
                  </td>
                  <td className="p-3 text-center text-rta-blue font-bold">{String(row.hour).padStart(2, '0')}:00</td>
                  <td className="p-3 text-right text-slate-500">{Math.round(row.fw_anpr_passage_mean).toLocaleString()} vph</td>
                  <td className="p-3 text-right text-slate-500">{row.fw_speed_mean.toFixed(1)} kph</td>
                  <td className="p-3 text-right text-emerald-600 font-bold">{Math.round(row.pred_later_anpr_passage_mean).toLocaleString()} vph</td>
                  <td className="p-3 text-right font-bold text-slate-700">{(row.pred_congestion_probability * 100).toFixed(0)}%</td>
                  <td className="p-3 text-center">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border`}
                      style={{
                        color: getRiskColor(row.risk_band),
                        backgroundColor: `${getRiskColor(row.risk_band)}15`,
                        borderColor: `${getRiskColor(row.risk_band)}44`
                      }}
                    >
                      {row.risk_band}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No records match the active query filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Quick helper to map risk band colors
  function getRiskColor(band: string) {
    switch (band) {
      case 'critical': return '#f43f5e';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  }
}
