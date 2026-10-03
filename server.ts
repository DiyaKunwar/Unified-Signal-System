import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

async function callMistralAI(prompt: string, fallbackGenerator: () => any) {
  const apiKey = process.env.MISTRAL_API_KEY;
  
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey !== "MY_MISTRAL_API_KEY" && apiKey.trim() !== "") {
    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          messages: [
            {
              role: "system",
              content: "You are an advanced traffic operations command intelligence system integrated with Dubai's Roads and Transport Authority (RTA). You analyze highway predictions and real-time sensor streams to output structured JSON analyses reflecting a multi-agent framework. Return ONLY a valid JSON object matching the requested schema, with no markdown wrappers or formatting blocks."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const contentText = result.choices[0]?.message?.content;
        if (contentText) {
          // Clean possible markdown wrapper if the model ignored response_format
          const cleanedText = contentText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          const parsed = JSON.parse(cleanedText);
          return {
            success: true,
            isSimulated: false,
            data: parsed
          };
        }
      } else {
        const errText = await response.text();
        console.error("Mistral API error response:", errText);
      }
    } catch (error) {
      console.error("Failed to connect to Mistral API, falling back:", error);
    }
  }

  // Fallback dynamic generator (simulates LLM output with pristine details)
  const simulatedData = fallbackGenerator();
  return {
    success: true,
    isSimulated: true,
    data: simulatedData
  };
}

// REST API endpoint for executing the Multi-Agent Corridor Analysis
app.post('/api/analyze-corridor', async (req, res) => {
  const { corridorId, hour, baselineRow } = req.body;

  if (!corridorId || hour === undefined || !baselineRow) {
    return res.status(400).json({ error: "Missing required parameters: corridorId, hour, or baselineRow" });
  }

  // Determine the baseline predictive risk band and values
  const predProb = baselineRow.pred_congestion_probability;
  const predictedVolume = Math.round(baselineRow.pred_later_anpr_passage_mean);
  const firstWeekSpeed = Math.round(baselineRow.fw_speed_mean);
  const direction = baselineRow.direction;

  // Exact formulas for Risk Bins as per user constraints:
  // LOW = [0.00, 0.30)
  // MEDIUM = [0.30, 0.60)
  // HIGH = [0.60, 0.80)
  // CRITICAL = [0.80, 1.00]
  let riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (predProb >= 0.80) riskBand = 'CRITICAL';
  else if (predProb >= 0.60) riskBand = 'HIGH';
  else if (predProb >= 0.30) riskBand = 'MEDIUM';

  // --- Telemetry simulator ---
  // There is no live sensor/RSU feed in this project. This generates plausible telemetry from
  // hand-picked peak factors plus noise so the agent flow can be demonstrated end to end.
  // Morning peak (07:00 - 09:00) heavily affects Northbound (SZR_N1)
  // Evening peak (17:00 - 19:00) heavily affects Southbound (SZR_S1)
  let peakFactor = 1.0;
  if (corridorId === "SZR_N1") {
    if (hour >= 7 && hour <= 9) peakFactor = 2.2;
    else if (hour >= 16 && hour <= 19) peakFactor = 1.5;
    else if (hour >= 23 || hour <= 5) peakFactor = 0.3;
  } else {
    if (hour >= 7 && hour <= 9) peakFactor = 1.3;
    else if (hour >= 16 && hour <= 19) peakFactor = 2.4;
    else if (hour >= 23 || hour <= 5) peakFactor = 0.35;
  }

  // Add slight random variations
  const randomVariance = 0.95 + Math.random() * 0.1;
  const effectiveFactor = peakFactor * randomVariance;

  const distanceKm = 22; // approx Dubai Marina to Downtown
  const baseDurationMinutes = 15; // standard duration at 88 kph (approx 15 mins)
  const liveDurationMinutes = Math.round(baseDurationMinutes * effectiveFactor);
  const delayMinutes = Math.max(0, liveDurationMinutes - baseDurationMinutes);
  const liveSpeed = Math.round(distanceKm / (liveDurationMinutes / 60));

  let congestionLevel: 'low' | 'moderate' | 'heavy' | 'severe' = 'low';
  if (effectiveFactor > 2.0) congestionLevel = 'severe';
  else if (effectiveFactor > 1.4) congestionLevel = 'heavy';
  else if (effectiveFactor > 1.1) congestionLevel = 'moderate';

  const liveTelemetry = {
    success: true,
    isSimulated: true,
    distance: `${distanceKm} km`,
    normalDurationMinutes: baseDurationMinutes,
    liveDurationMinutes,
    delayMinutes,
    liveSpeed,
    congestionLevel
  };

  // Construct Prompt for the 3 Agents
  const prompt = `
    Analyze E11 (Sheikh Zayed Road) Segment: ${corridorId}
    Direction: ${direction}
    Hour of Day: ${hour}:00
    
    SYSTEM DATA SEEDS:
    1. Baseline ML Predictor Output:
       - Predicted Congestion Probability: ${predProb}
       - Evaluated Risk Band: ${riskBand} (Based on boundaries: LOW=[0.0,0.3), MEDIUM=[0.3,0.6), HIGH=[0.6,0.8), CRITICAL=[0.8,1.0])
       - Predicted later-month volume: ${predictedVolume} vehicles per hour
       - First-week observed average speed: ${firstWeekSpeed} kph

    2. Simulated Telemetry (generated by a simulator; no live feed is connected — do not describe it as live):
       - Current Measured Speed: ${liveTelemetry.liveSpeed} kph
       - Live Delay: ${liveTelemetry.delayMinutes} minutes
       - Congestion Level Status: ${liveTelemetry.congestionLevel.toUpperCase()}
       - normalDurationMinutes: ${liveTelemetry.normalDurationMinutes} mins, liveDurationMinutes: ${liveTelemetry.liveDurationMinutes} mins.

    Please run the 3-Agent Orchestration Flow:
    - Agent 1 — Macro-Forecast Agent (The Strategist): Analyzes the monthly baseline ML model predictions. It checks the predicted congestion probability against boundaries: LOW, MEDIUM, HIGH, CRITICAL. Operates under the rule: Filters the timeline and reports ONLY HIGH or CRITICAL warnings to the Supervisor, providing detailed road specifications (road, direction, hour, etc.). If LOW or MEDIUM, reports "No major warning".
    - Agent 2 — Micro-V2X Agent (The Tactician): Analyzes the real-time V2X/sensor telemetry data. Reports the exact real-time traffic speeds, delays, and current building bottlenecks on the road.
    - Agent 3 — Supervisor Agent (The Central Decision Maker): Looks for anomalies between Agent 1's macro forecast and Agent 2's live telemetry signals. Recommends customized, high-impact traffic control interventions (e.g., dynamic Salik toll adjustments, reducing smart speed limits to 80 kph, smart gate lane redirection, or traffic patrol dispatches). Formulates an integrated assistant report for the operator to confirm and dispatch.

    Return your response strictly in the following JSON structure:
    {
      "agent1": {
        "hasWarning": boolean,
        "riskBand": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        "probability": number,
        "reportText": "Macro Strategist's professional summary of the baseline predictions."
      },
      "agent2": {
        "liveSpeed": number,
        "liveDelayMinutes": number,
        "congestionLevel": "low" | "moderate" | "heavy" | "severe",
        "reportText": "Micro Tactician's detailed summary of live traffic speeds and segment delays."
      },
      "agent3": {
        "anomalyDetected": boolean,
        "anomalyDetails": "Detailed assessment of differences between forecast model predictions and current live traffic speeds.",
        "recommendedIntervention": "Detailed concrete recommendation (e.g. Salik Gate toll adjustment, dispatching patrols, activating lanes).",
        "isSalikAdjustmentRequired": boolean,
        "statusMessage": "Short operational status text (e.g. 'Salik Dynamic Toll pricing advised', 'Speeds healthy')",
        "reportText": "Unified Supervisor directive providing the operator with a detailed assistant report to approve and deploy."
      }
    }
  `;

  // Fallback Dynamic Data Generator
  const fallbackGenerator = () => {
    const isHighOrCritical = riskBand === 'HIGH' || riskBand === 'CRITICAL';
    const isSevereOrHeavy = liveTelemetry.congestionLevel === 'severe' || liveTelemetry.congestionLevel === 'heavy';
    const anomalyDetected = (isHighOrCritical && !isSevereOrHeavy) || (!isHighOrCritical && isSevereOrHeavy);

    let anomalyDetails = "No significant anomaly detected. Baseline predictions and live traffic indicators are fully aligned.";
    if (anomalyDetected) {
      anomalyDetails = `Anomaly alert: Baseline model forecasted ${riskBand} risk (${Math.round(predProb * 100)}% probability) but live telemetry indicates ${liveTelemetry.congestionLevel.toUpperCase()} congestion with speeds of ${liveTelemetry.liveSpeed} kph. Ground truth is deviating from historic baseline.`;
    }

    let recommendedIntervention = "No intervention needed. Continue normal passive camera monitoring.";
    let statusMessage = "Segment stable. Standard operations ongoing.";
    let isSalikAdjustmentRequired = false;

    if (riskBand === 'CRITICAL' || liveTelemetry.congestionLevel === 'severe') {
      recommendedIntervention = "Critical bottleneck detected. Initiate immediate multi-point action: 1) Deploy Dynamic Salik surcharge on SZR (+4 AED) to divert non-essential traffic. 2) Lower Smart Speed Signs to 80 kph to enforce traffic calming. 3) Activate peak lane redirection at the nearest upstream interchange.";
      statusMessage = "ACTION REQUISITE: Dynamic Salik surcharge & Lane Redirection suggested";
      isSalikAdjustmentRequired = true;
    } else if (riskBand === 'HIGH' || liveTelemetry.congestionLevel === 'heavy') {
      recommendedIntervention = "High density warning. Recommend dispatching traffic patrol units to the segment to actively clear any potential lane blockages and adjusting smart signage to warn drivers of upcoming slow-downs.";
      statusMessage = "ADVISORY: Sign board warnings & Patrol standby";
    }

    const strategistReportText = isHighOrCritical 
      ? `Strategist warning active for E11 ${direction} at ${hour}:00. Baseline model forecasts ${riskBand} congestion risk (prob: ${predProb}) with expected volumes climbing to ${predictedVolume} vph. Early preparation recommended.`
      : `Strategist reports normal baseline patterns on E11 ${direction} for ${hour}:00. No active macro warning in progress.`;

    const tacticianReportText = `Tactician telemetry update: Simulated telemetry reports speeds of ${liveTelemetry.liveSpeed} kph with an active delay of ${liveTelemetry.delayMinutes} minutes on this E11 segment. Live congestion level evaluated as ${liveTelemetry.congestionLevel.toUpperCase()}.`;

    const supervisorReportText = `As your Unified Central Supervisor, I have evaluated both the Strategist's macro predictions and the Tactician's live V2X telemetry. ${anomalyDetected ? 'An operational anomaly has been flagged.' : 'System indicators are aligned.'} I have structured a responsive operational plan for this E11 segment. Please review and confirm the proposed intervention tasks below.`;

    return {
      agent1: {
        hasWarning: isHighOrCritical,
        riskBand: riskBand,
        probability: predProb,
        reportText: strategistReportText
      },
      agent2: {
        liveSpeed: liveTelemetry.liveSpeed,
        liveDelayMinutes: liveTelemetry.delayMinutes,
        congestionLevel: liveTelemetry.congestionLevel,
        reportText: tacticianReportText
      },
      agent3: {
        anomalyDetected,
        anomalyDetails,
        recommendedIntervention,
        isSalikAdjustmentRequired,
        statusMessage,
        reportText: supervisorReportText
      }
    };
  };

  // Run the multi-agent system
  const agentOutput = await callMistralAI(prompt, fallbackGenerator);
  
  res.json({
    success: true,
    corridorId,
    hour,
    mapsData: liveTelemetry,
    agents: agentOutput.data,
    isSimulated: agentOutput.isSimulated
  });
});

// REST API endpoint for fetching dynamic Mistral explanations for a selected corridor
app.post('/api/explain-corridor', async (req, res) => {
  const { risk_score, risk_band, recommended_action } = req.body;

  if (risk_score === undefined || !risk_band || !recommended_action) {
    return res.status(400).json({ error: "Missing parameters: risk_score, risk_band, or recommended_action" });
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  const prompt = `Corridor telemetry analysis:
- Congestion Risk: ${Math.round(risk_score * 100)}%
- Risk Level Band: ${risk_band.toUpperCase()}
- Prescribed Intervention: ${recommended_action}

Please write a single, short, professional, plain-English sentence explaining why this corridor was flagged and what action is recommended. Make it extremely concise, clear, and direct so an RTA traffic operator can digest it in 2 seconds. Do not include any quotes, markdown formatting, or prefix headers like 'Explanation:' in your response.`;

  if (apiKey && apiKey !== "MY_MISTRAL_API_KEY" && apiKey.trim() !== "") {
    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          messages: [
            {
              role: "system",
              content: "You are an RTA Highway Command Center AI. You translate technical traffic metrics into a single, ultra-concise, 2-second plain-English sentence for traffic operators explaining why a corridor is flagged and what to do."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 60,
          temperature: 0.3
        })
      });

      if (response.ok) {
        const result = await response.json();
        const contentText = result.choices[0]?.message?.content;
        if (contentText) {
          const cleanExplanation = contentText.replace(/^["'\s]+|["'\s]+$/g, '').trim();
          return res.json({
            success: true,
            isSimulated: false,
            explanation: cleanExplanation
          });
        }
      } else {
        const errText = await response.text();
        console.error("Mistral API error in explain-corridor:", errText);
      }
    } catch (error) {
      console.error("Failed to connect to Mistral API in explain-corridor:", error);
    }
  }

  // High-fidelity fallback generator if API key is missing or call fails
  let fallbackExplanation = "";
  const pct = Math.round(risk_score * 100);
  if (risk_band.toLowerCase() === 'critical') {
    fallbackExplanation = `Flagged for Critical congestion risk (${pct}% probability); operator must deploy dynamic Salik surcharges and reduce smart speed signs immediately.`;
  } else if (risk_band.toLowerCase() === 'high') {
    fallbackExplanation = `Elevated demand detected (${pct}% probability of severe backup); dispatching RTA traffic patrols and adjusting warning advisory boards.`;
  } else if (risk_band.toLowerCase() === 'medium') {
    fallbackExplanation = `Moderate congestion risk (${pct}% probability); continue standard passive camera monitoring and standby patrol dispatch.`;
  } else {
    fallbackExplanation = `Low-risk corridor (${pct}% probability); traffic patterns are stable under standard baseline flows.`;
  }

  res.json({
    success: true,
    isSimulated: true,
    explanation: fallbackExplanation
  });
});

// Serve static assets in production, and handle Vite dev server in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Unified Signal System server running on http://localhost:${PORT}`);
  });
}

startServer();
