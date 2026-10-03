# Unified Signal System: Congestion Forecast

A prototype built for the RTA (Dubai Roads & Transport Authority) hackathon. It is not an official RTA product.

This is the web front end for a congestion-forecasting pipeline. A Random Forest looks at the **first 7 days** of each month for every corridor and hour, then predicts congestion risk and traffic volume for the **rest of that month**. The dashboard shows the model's 2025 holdout predictions and its evaluation metrics. It also has a 3-agent (Mistral) assistant that drafts responses for an operator to approve.

> **Data is synthetic.** The training data is a simulated Dubai traffic dataset with synthetic number-plate fields. No real vehicles, plates, or live feeds are used.

## Features

| View | Data source |
|---|---|
| Forecast map + 24h heat map | `public/top_predicted_high_risk_corridors_2025_rows.csv`: the model's 2025 holdout predictions, 18 corridors × 24 hours × 12 months |
| ML Evaluation Studio | `src/data/modelResults.json`: metrics, confusion matrix, and feature importance exported by the pipeline |
| Predictions DB | The same predictions CSV, as a table |
| Multi-agent assistant | Mistral `mistral-large-latest` if `MISTRAL_API_KEY` is set, otherwise a local rule-based emulator. Telemetry is **simulated**; no live sensor feed is connected. |

## Results (train 2023–2024, test 2025)

| Metric | Random Forest | Persistence baseline* |
|---|---:|---:|
| Congestion accuracy | 97.28% | 97.11% |
| ROC-AUC | 0.9964 | 0.9860 |
| Recall | 94.67% | 91.92% |
| F1 | 94.48% | 93.99% |
| Volume R² | 0.9706 | 0.9731 |

\*Persistence baseline: assume the rest of the month repeats the first week. On this synthetic data, that rule is already strict. The model's main gain is recall, so it misses fewer congested corridor-hours. It does not improve on volume forecasting.

## Run locally

Requires Node 18+.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

## ML pipeline (`uss-model/`)

The model lives in `uss-model/` (Python 3.9+):

```bash
cd uss-model && python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python run_accuracy_evaluation.py   # trains, evaluates, writes data/anpr_synthetic_accuracy_results/
```

After re-running it, copy the outputs into the dashboard:

```bash
cp uss-model/data/anpr_synthetic_accuracy_results/dashboard_results.json src/data/modelResults.json
```

```bash
cp uss-model/data/anpr_synthetic_accuracy_results/top_predicted_high_risk_corridors_2025_rows.csv public/
```

`uss-model/orchestrator.py` runs the 3-agent Mistral flow from the command line (needs `MISTRAL_API_KEY` in `uss-model/.env`).

## Limitations

- Synthetic data only. The "ANPR passage count" equals traffic volume in this dataset, and the plate-token features are constant, so the model does not actually learn from plate patterns.
- The map is a schematic layout, not geographic.
- Agent telemetry comes from a simulator, so its recommendations are illustrations, not operational advice.
