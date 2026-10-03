import React, { useState, useEffect } from 'react';
import { Cpu, AlertTriangle, CheckCircle, Zap, Compass, RefreshCw } from 'lucide-react';
import { PredictionRow } from '../types';

interface MistralCommandCenterProps {
  selectedHour: number;
  hourlyPredictions: PredictionRow[];
  activeYearMonthFilter: string;
  selectedCorridorId: string | null;
  setSelectedCorridorId: (id: string | null) => void;
  onApplyAdjustment: (corridorId: string, adjustmentData: any) => void;
  onAddLog: (msg: string) => void;
  activeAdjustments: Record<string, any>;
}

export default function MistralCommandCenter({
  selectedHour,
  hourlyPredictions,
  activeYearMonthFilter,
  selectedCorridorId,
  setSelectedCorridorId,
  onApplyAdjustment,
  onAddLog,
  activeAdjustments,
}: MistralCommandCenterProps) {
  const [analyzingCorridorId, setAnalyzingCorridorId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [activeAgentTab, setActiveAgentTab] = useState<'strategist' | 'tactician' | 'supervisor'>('supervisor');

  // E11 Corridors
  const e11Corridors = [
    { id: "SZR_N1", name: "Sheikh Zayed Rd NB 1 (to Deira)" },
    { id: "SZR_S1", name: "Sheikh Zayed Rd SB 1 (to Abu Dhabi)" }
  ];

  // Loading steps animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      timer = setInterval(() => {
        setLoadingStep(prev => {
          if (prev >= 2) {
            clearInterval(timer);
            return 2;
          }
          return prev + 1;
        });
      }, 900);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const handleRunAnalysis = async (corridorId: string) => {
    setSelectedCorridorId(corridorId);
    setAnalyzingCorridorId(corridorId);
    setLoading(true);
    setLoadingStep(0);
    setAnalysisResult(null);

    // Find baseline prediction for this hour matching active month filter
    const baselineRow = hourlyPredictions.find(p => 
      p.location_id === corridorId && 
      p.hour === selectedHour &&
      (activeYearMonthFilter === 'ALL' || p.year_month === activeYearMonthFilter)
    );

    if (!baselineRow) {
      setLoading(false);
      alert("No baseline data found for selected hour");
      return;
    }

    try {
      const response = await fetch('/api/analyze-corridor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridorId,
          hour: selectedHour,
          baselineRow
        })
      });

      if (response.ok) {
        const payload = await response.json();
        setAnalysisResult(payload);
      } else {
        throw new Error("Analysis failed");
      }
    } catch (err) {
      console.error("Failed to run agent analysis:", err);
      alert("Error executing Mistral Multi-Agent analysis. Using offline simulation.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIntervention = () => {
    if (!analysisResult || !analyzingCorridorId) return;

    const { agents } = analysisResult;
    const supervisor = agents.agent3;
    const tactician = agents.agent2;

    // Apply adjustment to the app state
    onApplyAdjustment(analyzingCorridorId, {
      liveSpeed: tactician.liveSpeed,
      liveDelayMinutes: tactician.liveDelayMinutes,
      congestionLevel: tactician.congestionLevel,
      riskBand: agents.agent1.riskBand.toLowerCase(),
      recommendedIntervention: supervisor.recommendedIntervention,
      statusMessage: supervisor.statusMessage,
      isApplied: true,
      appliedAtHour: selectedHour
    });

    // Add log entry
    const corridorName = e11Corridors.find(c => c.id === analyzingCorridorId)?.name || analyzingCorridorId;
    onAddLog(`Operator confirmed Supervisor's decision on ${corridorName}: ${supervisor.statusMessage}. Intervention active.`);
  };

  const handleClearIntervention = (corridorId: string) => {
    onApplyAdjustment(corridorId, null);
    const corridorName = e11Corridors.find(c => c.id === corridorId)?.name || corridorId;
    onAddLog(`Operator cleared current Supervisor intervention on ${corridorName}. Speed limits and Salik charges restored to standard baseline.`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm" id="mistral-command-center">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
        <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-rta-blue animate-pulse" />
          Mistral AI Multi-Agent Cockpit
        </h3>
        <span className="bg-rta-blue/10 text-rta-blue text-[9px] font-mono font-bold px-2 py-0.5 rounded border border-rta-blue/20">
          PROTOTYPE (E11 FOCUS)
        </span>
      </div>

      {/* Corridor Road Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        {e11Corridors.map(c => {
          const isSelected = selectedCorridorId === c.id;
          const hasAdjustment = !!activeAdjustments[c.id];
          return (
            <div
              key={c.id}
              className={`border rounded-lg p-3 transition-all flex flex-col justify-between h-24 ${
                isSelected 
                  ? 'border-rta-blue bg-slate-50/50 shadow-xs' 
                  : 'border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 font-bold">E11 HIGHWAY SEGMENT</div>
                  <div className="text-xs font-semibold text-slate-800 tracking-tight mt-0.5">{c.name}</div>
                </div>
                {hasAdjustment && (
                  <span className="bg-emerald-100 text-emerald-800 text-[8px] font-mono font-bold px-1.5 py-0.2 rounded border border-emerald-200 animate-pulse">
                    ACTIVE CONTROL
                  </span>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleRunAnalysis(c.id)}
                  disabled={loading}
                  className="flex-1 bg-rta-blue hover:bg-rta-hover text-white py-1 px-2.5 rounded text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 shadow-xs"
                >
                  <RefreshCw className={`w-3 h-3 ${loading && analyzingCorridorId === c.id ? 'animate-spin' : ''}`} />
                  RUN AI ANALYSIS
                </button>
                {hasAdjustment && (
                  <button
                    onClick={() => handleClearIntervention(c.id)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-1 px-2 rounded text-[10px] font-mono font-bold transition-all"
                    title="Restore Baseline"
                  >
                    RESET
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3-Agent Live Stream Log & UI */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono text-[10px] text-slate-300 shadow-inner flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sky-400 font-bold border-b border-slate-800 pb-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping"></span>
            ACTIVE MULTI-AGENT HANDSHAKE IN PROGRESS...
          </div>
          <div className={`transition-all duration-300 ${loadingStep >= 0 ? 'opacity-100 text-emerald-400' : 'opacity-30'}`}>
            &gt; [AGENT 1: STRATEGIST] Activating. Loading baseline holdout matrices. Predicted probability threshold set... Done.
          </div>
          <div className={`transition-all duration-300 ${loadingStep >= 1 ? 'opacity-100 text-amber-400' : 'opacity-30'}`}>
            &gt; [AGENT 2: TACTICIAN] Generating simulated corridor telemetry... Done.
          </div>
          <div className={`transition-all duration-300 ${loadingStep >= 2 ? 'opacity-100 text-purple-400' : 'opacity-30'}`}>
            &gt; [AGENT 3: SUPERVISOR] Synthesizing strategist/tactician telemetry. Formulating dynamic Salik pricing and smart signaling directives... Done.
          </div>
        </div>
      )}

      {/* Analysis Results Display */}
      {!loading && analysisResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-3 flex flex-col gap-3">
          
          {/* Analysis Header */}
          <div className="flex justify-between items-center bg-white border border-slate-200 px-3 py-2 rounded-md">
            <div>
              <span className="text-[9px] font-mono text-slate-400">ANALYZING TARGET</span>
              <div className="text-xs font-bold text-rta-blue font-mono">
                {analysisResult.corridorId} • Hour {String(analysisResult.hour).padStart(2, '0')}:00
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-mono text-slate-400">ENGINE STATUS</span>
              <div className="text-[10px] font-mono font-bold text-emerald-600 flex items-center gap-1 justify-end">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                {analysisResult.isSimulated ? 'LOCAL EMULATOR' : 'MISTRAL LIVE'}
              </div>
            </div>
          </div>

          {/* Mini Tabs for each of the 3 Agents */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveAgentTab('strategist')}
              className={`flex-1 pb-2 text-[10px] font-mono font-bold border-b-2 text-center transition-all ${
                activeAgentTab === 'strategist' ? 'border-rta-blue text-rta-blue' : 'border-transparent text-slate-400'
              }`}
            >
              AGENT 1: STRATEGIST
            </button>
            <button
              onClick={() => setActiveAgentTab('tactician')}
              className={`flex-1 pb-2 text-[10px] font-mono font-bold border-b-2 text-center transition-all ${
                activeAgentTab === 'tactician' ? 'border-rta-blue text-rta-blue' : 'border-transparent text-slate-400'
              }`}
            >
              AGENT 2: TACTICIAN
            </button>
            <button
              onClick={() => setActiveAgentTab('supervisor')}
              className={`flex-1 pb-2 text-[10px] font-mono font-bold border-b-2 text-center transition-all ${
                activeAgentTab === 'supervisor' ? 'border-rta-blue text-rta-blue' : 'border-transparent text-slate-400'
              }`}
            >
              AGENT 3: SUPERVISOR
            </button>
          </div>

          {/* Agent Content Display */}
          <div className="bg-white border border-slate-100 rounded-md p-3 min-h-[110px] flex flex-col justify-between">
            {activeAgentTab === 'strategist' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Baseline Forecast Evaluation</span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded`} style={{
                    color: analysisResult.agents.agent1.hasWarning ? '#DA291C' : '#475569',
                    backgroundColor: analysisResult.agents.agent1.hasWarning ? '#DA291C10' : '#f1f5f9'
                  }}>
                    {analysisResult.agents.agent1.riskBand} RISK BAND
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-sans italic">
                  "{analysisResult.agents.agent1.reportText}"
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  <div>Model Risk: <span className="font-bold text-slate-700">{Math.round(analysisResult.agents.agent1.probability * 100)}%</span></div>
                  <div>Operational Filter: <span className="font-bold text-slate-700">{analysisResult.agents.agent1.hasWarning ? 'TRIGGER ALERT' : 'PASS'}</span></div>
                </div>
              </div>
            )}

            {activeAgentTab === 'tactician' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Simulated Telemetry</span>
                  <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded uppercase">
                    {analysisResult.agents.agent2.congestionLevel} Congestion
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-sans italic">
                  "{analysisResult.agents.agent2.reportText}"
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  <div>Sim. Speed: <span className="font-bold text-slate-700">{analysisResult.agents.agent2.liveSpeed} kph</span></div>
                  <div>Sim. Delay: <span className="font-bold text-slate-700">+{analysisResult.agents.agent2.liveDelayMinutes} mins</span></div>
                  <div>Source: <span className="font-bold text-slate-700">{analysisResult.mapsData.isSimulated ? 'Telemetry simulator' : 'Live feed'}</span></div>
                </div>
              </div>
            )}

            {activeAgentTab === 'supervisor' && (
              <div className="flex flex-col h-full justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-mono text-slate-400 uppercase">Anomaly Detection Check</span>
                    {analysisResult.agents.agent3.anomalyDetected ? (
                      <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> ANOMALY DETECTED
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded">
                        ALIGNED / NO ANOMALY
                      </span>
                    )}
                  </div>
                  {analysisResult.agents.agent3.anomalyDetected && (
                    <div className="bg-rose-50/50 border border-rose-100 text-[10px] font-mono p-2 rounded text-rose-800 mb-2 leading-relaxed">
                      {analysisResult.agents.agent3.anomalyDetails}
                    </div>
                  )}
                  <p className="text-xs text-slate-600 leading-relaxed font-sans italic">
                    "{analysisResult.agents.agent3.reportText}"
                  </p>
                  
                  {/* Recommended Intervention */}
                  <div className="mt-3 bg-rta-blue/5 border border-rta-blue/10 p-3 rounded-lg">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rta-blue mb-1">
                      <Zap className="w-4 h-4 fill-rta-blue/20" />
                      PROPOSED INTERVENTION PLAN:
                    </div>
                    <p className="text-xs text-slate-700 leading-normal font-sans">
                      {analysisResult.agents.agent3.recommendedIntervention}
                    </p>
                  </div>
                </div>

                {/* Dispatch Button */}
                <div className="mt-2 border-t border-slate-100 pt-3 flex justify-between items-center gap-4">
                  <div className="text-[10px] font-mono text-slate-500">
                    *Requires human-in-the-loop operator confirmation.
                  </div>
                  <button
                    onClick={handleConfirmIntervention}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs font-bold py-1.5 px-4 rounded shadow-md flex items-center gap-1.5 transition-all"
                  >
                    <CheckCircle className="w-4 h-4" />
                    CONFIRM & DISPATCH
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Setup Instructions Help */}
      {!analysisResult && !loading && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 mt-3 text-xs text-slate-500">
          <div className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
            <Compass className="w-4 h-4 text-slate-500" />
            Operator Instructions:
          </div>
          <p className="leading-relaxed">
            Select one of the E11 corridor sections above and click **"Run AI Analysis"**. This will invoke the Mistral Strategist, Tactician, and Supervisor agents to compare the model forecast with simulated telemetry and draft a response for operator approval.
          </p>
        </div>
      )}
    </div>
  );
}
