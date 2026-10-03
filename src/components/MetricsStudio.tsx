/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { EVALUATION_METRICS, FEATURE_IMPORTANCE_CLF, FEATURE_IMPORTANCE_REG, CORRIDORS } from '../data/trafficData';
import { AlertCircle, Target, TrendingUp, Cpu, Info, BarChart4 } from 'lucide-react';
import { PredictionRow } from '../types';

export default function MetricsStudio({ predictions = [] }: { predictions?: PredictionRow[] }) {
  const [activeTest, setActiveTest] = useState<number>(1); // index of EVALUATION_METRICS (0 or 1)
  const [importanceType, setImportanceType] = useState<'classification' | 'regression'>('classification');
  const [selectedCorridor, setSelectedCorridor] = useState<string>('ALL');

  const metric = EVALUATION_METRICS[activeTest];
  const base = metric.baseline!;
  const featureData = importanceType === 'classification' ? FEATURE_IMPORTANCE_CLF : FEATURE_IMPORTANCE_REG;

  // Custom tooltips for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0f172a] border border-slate-700 p-3 rounded shadow-xl text-xs font-mono">
          <p className="text-slate-300 font-bold mb-1">{label}</p>
          <p className="text-indigo-400">
            Share: {(payload[0].value * 100).toFixed(2)}%
          </p>
          <p className="text-slate-500 text-[10px] mt-1 max-w-[200px]">
            {getFeatureExplanation(label)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Explanation mapper for ML features
  function getFeatureExplanation(feature: string): string {
    switch (feature) {
      case 'fw_congested_rate': return 'Rate of congested observations (V/C >= 0.7) during the first week of the month.';
      case 'fw_tti_mean': return 'Mean Travel Time Index during the first week. TTI of 1.5 means travel takes 50% longer than free-flow.';
      case 'fw_vc_mean': return 'Mean Volume-to-Capacity ratio in week 1. Approaching 1.0 means capacity threshold.';
      case 'fw_anpr_passage_mean': return 'Mean hourly synthetic passage count in week 1 (equal to traffic volume in this dataset).';
      case 'fw_anpr_passage_max': return 'Peak passage count captured in week 1, representing maximum flow surges.';
      case 'fw_speed_mean': return 'Mean speed in kph registered on the corridor in week 1.';
      case 'fw_recurrence_index': return 'Recurrence index of traffic flow variance. High values signify highly predictable traffic.';
      case 'fw_peak_to_mean_ratio': return 'Peak-to-mean flow ratio. High values signal volatile, sudden surge risks.';
      case 'fw_anpr_unique_token_count': return 'Number of unique synthetic license plates tracked monthly.';
      case 'fw_anpr_unique_pattern_count': return 'Distinct license plate syntactic patterns registered.';
      case 'fw_incident_rate': return 'Average rate of incident flags affecting traffic during first week.';
      case 'fw_observations': return 'Sample size (number of hourly readings) in first week.';
      default: return 'Synthesized ANPR-derived operational feature.';
    }
  }

  // Sample static comparison dataset representing actual vs predicted volumes across 24h for a peak corridor

  // Dynamic unique corridors list extracted from parsed predictions
  const uniqueCorridors = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];
    const ids = Array.from(new Set(predictions.map(p => p.location_id)));
    return ids.map(id => {
      const meta = CORRIDORS.find(c => c.id === id);
      return {
        id,
        name: meta ? `${meta.name} (${id})` : id
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }, [predictions]);

  // Aggregated dynamic actual vs predicted volume chart data
  const chartData = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];

    const hoursData = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      actualSum: 0,
      predictedSum: 0,
      count: 0,
    }));

    const filtered = selectedCorridor === 'ALL'
      ? predictions
      : predictions.filter(p => p.location_id === selectedCorridor);

    filtered.forEach(p => {
      const h = p.hour;
      if (h >= 0 && h < 24) {
        hoursData[h].actualSum += p.target_later_anpr_passage_mean;
        hoursData[h].predictedSum += p.pred_later_anpr_passage_mean;
        hoursData[h].count++;
      }
    });

    return hoursData.map(d => ({
      hour: d.hour,
      actual: d.count === 0 ? 0 : Math.round(d.actualSum / d.count),
      predicted: d.count === 0 ? 0 : Math.round(d.predictedSum / d.count),
    }));
  }, [predictions, selectedCorridor]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col h-full shadow-sm z-10" id="rta-ml-studio">
      
      {/* Tab Switchers */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-lg font-display font-medium text-slate-800 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-rta-blue" />
            ML Model Evaluation Studio
          </h2>
          <p className="text-xs text-slate-500 font-mono">
            Random month split vs. train 2023–2024 / test 2025 holdout, each against a persistence baseline
          </p>
        </div>

        <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-lg">
          <button
            onClick={() => setActiveTest(0)}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
              activeTest === 0
                ? 'bg-rta-blue text-slate-100 shadow-md font-bold hover:bg-rta-blue-hover'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Test 1: Month Split
          </button>
          <button
            onClick={() => setActiveTest(1)}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
              activeTest === 1
                ? 'bg-rta-blue text-slate-100 shadow-md font-bold hover:bg-rta-blue-hover'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
            id="test-2-holdout-tab"
          >
            Test 2: 2025 Holdout
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <div className="text-[10px] font-mono text-slate-400">TRAINING DATA RANGE</div>
          <div className="text-sm font-semibold text-slate-700 mt-1 font-mono">
            {activeTest === 0 ? "Random 75% Months" : "Full Years 2023-2024"}
          </div>
          <div className="text-[10px] font-mono text-rta-blue mt-0.5 font-bold">
            {metric.train_rows.toLocaleString()} Training Rows
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <div className="text-[10px] font-mono text-slate-400">REGRESSION R² (VOLUME)</div>
          <div className="text-lg font-bold text-slate-700 mt-1 font-mono flex items-baseline gap-1">
            {metric.volume_r2.toFixed(4)}
            <TrendingUp className="w-4.5 h-4.5 text-emerald-500 self-center" />
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
            MAE: {metric.volume_mae.toFixed(2)} vph · baseline R² {base.volume_r2.toFixed(4)}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <div className="text-[10px] font-mono text-slate-400">CONGESTION RISK ACCURACY</div>
          <div className="text-lg font-bold text-slate-700 mt-1 font-mono">
            {(metric.congestion_accuracy * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5 font-semibold">
            F1: {(metric.f1 * 100).toFixed(2)}% · baseline acc {(base.congestion_accuracy * 100).toFixed(2)}%
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
          <div className="text-[10px] font-mono text-slate-400">CLASSIFIER ROC-AUC</div>
          <div className="text-lg font-bold text-slate-700 mt-1 font-mono">
            {metric.congestion_roc_auc.toFixed(4)}
          </div>
          <div className="text-[10px] font-mono text-rta-blue mt-0.5 font-bold">
            Recall: {(metric.recall * 100).toFixed(1)}% · baseline AUC {base.congestion_roc_auc.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Main Charts & Matrix Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1">
        
        {/* Left: Volume Forecast vs Actual Trend */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex flex-col min-h-[300px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-600" />
                Regression Performance: Actual vs Predicted Volume
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                {selectedCorridor === 'ALL' 
                  ? "Showing network-wide aggregated hourly volume actuals vs. model forecasts" 
                  : `Showing 24-hour predictive variance for corridor ${selectedCorridor}`}
              </p>
            </div>

            {uniqueCorridors.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-mono text-slate-500">FILTER:</span>
                <select
                  value={selectedCorridor}
                  onChange={(e) => setSelectedCorridor(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 text-[10px] font-mono rounded px-2 py-1 focus:outline-none focus:border-rta-blue"
                >
                  <option value="ALL">ALL CORRIDORS</option>
                  {uniqueCorridors.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#003C71" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#003C71" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="hour" stroke="#475569" fontSize={10} fontFamily="JetBrains Mono" />
                <YAxis stroke="#475569" fontSize={10} fontFamily="JetBrains Mono" unit=" vph" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '6px' }}
                  labelStyle={{ color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                  itemStyle={{ fontSize: 11 }}
                />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Area type="monotone" dataKey="actual" name="Actual Volume" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" />
                <Area type="monotone" dataKey="predicted" name="ML Predicted Volume" stroke="#0284c7" strokeWidth={2} strokeDasharray="3 3" fillOpacity={1} fill="url(#colorPredicted)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Feature Importances */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex flex-col min-h-[300px]" id="feature-importance-card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart4 className="w-4 h-4 text-rta-blue" />
                Random Forest Feature Importance
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Calculated contribution share for predicting {importanceType}
              </p>
            </div>

            <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded text-[10px] font-mono">
              <button
                onClick={() => setImportanceType('classification')}
                className={`px-2 py-0.5 rounded ${importanceType === 'classification' ? 'bg-rta-blue text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Risk Classifier
              </button>
              <button
                onClick={() => setImportanceType('regression')}
                className={`px-2 py-0.5 rounded ${importanceType === 'regression' ? 'bg-rta-blue text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Volume Regressor
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={featureData.slice(0, 7)}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                <XAxis type="number" stroke="#475569" fontSize={9} fontFamily="JetBrains Mono" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <YAxis dataKey="feature" type="category" stroke="#475569" fontSize={9} fontFamily="JetBrains Mono" width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="importance_share" fill="#003C71" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Confusion Matrix Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mt-6">
        <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-4">
          <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
          Confusion Matrix & Operator Response Plan
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Matrix Grid */}
          <div className="grid grid-cols-3 gap-2 max-w-[340px] mx-auto md:mx-0 font-mono text-center">
            {/* Empty corner */}
            <div></div>
            <div className="text-[10px] text-slate-500 font-bold py-1">PRED: NO RISK</div>
            <div className="text-[10px] text-slate-500 font-bold py-1">PRED: HIGH RISK</div>

            {/* Actual NO */}
            <div className="text-[10px] text-slate-500 font-bold flex items-center justify-center">ACTUAL: NO</div>
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-emerald-800">
              <div className="text-[9px] text-emerald-700 font-bold">TRUE NEGATIVE (TN)</div>
              <div className="text-lg font-bold mt-1 text-emerald-950">{metric.confusion_matrix.tn.toLocaleString()}</div>
              <div className="text-[9px] text-slate-500 mt-1">{(metric.confusion_matrix.tn / metric.test_rows * 100).toFixed(1)}% accuracy</div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded p-3 text-rose-800">
              <div className="text-[9px] text-rose-600 font-bold">FALSE POSITIVE (FP)</div>
              <div className="text-lg font-bold mt-1 text-rose-950">{metric.confusion_matrix.fp.toLocaleString()}</div>
              <div className="text-[9px] text-slate-500 mt-1">{(metric.confusion_matrix.fp / metric.test_rows * 100).toFixed(1)}% false alarms</div>
            </div>

            {/* Actual YES */}
            <div className="text-[10px] text-slate-500 font-bold flex items-center justify-center">ACTUAL: YES</div>
            <div className="bg-rose-50 border border-rose-200 rounded p-3 text-rose-800">
              <div className="text-[9px] text-rose-600 font-bold">FALSE NEGATIVE (FN)</div>
              <div className="text-lg font-bold mt-1 text-rose-950">{metric.confusion_matrix.fn.toLocaleString()}</div>
              <div className="text-[9px] text-slate-500 mt-1">{(metric.confusion_matrix.fn / metric.test_rows * 100).toFixed(1)}% missed runs</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-emerald-800">
              <div className="text-[9px] text-emerald-700 font-bold">TRUE POSITIVE (TP)</div>
              <div className="text-lg font-bold mt-1 text-emerald-950">{metric.confusion_matrix.tp.toLocaleString()}</div>
              <div className="text-[9px] text-slate-500 mt-1">{(metric.confusion_matrix.tp / metric.test_rows * 100).toFixed(1)}% predicted risk</div>
            </div>
          </div>

          {/* Matrix Explanations for RTA */}
          <div className="flex flex-col justify-center gap-3 text-xs text-slate-600">
            <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <div className="w-5 h-5 bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center rounded-full shrink-0 font-bold">FP</div>
              <div>
                <span className="font-bold text-slate-800">False Positive Operational Cost:</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Over-budgeting patrols or pre-positioning tow trucks on pathways that remain free-flowing. Incurs unnecessary operational expenditure.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <div className="w-5 h-5 bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center rounded-full shrink-0 font-bold">FN</div>
              <div>
                <span className="font-bold text-slate-800">False Negative Traffic Cost (Missed Congestion):</span>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Unanticipated bottlenecks. Operators miss deploying peak smart gates or adjusting variable speed limits, causing critical commuter delays.
                </p>
              </div>
            </div>

            <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-1">
              <Info className="w-4 h-4 text-rta-blue shrink-0" />
              Baseline = assume the rest of the month repeats the first week. On this synthetic data it is already strong; the model mainly adds recall. Data is simulated, not real RTA feeds.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
