# ANPR Synthetic Accuracy Evaluation Results

This folder contains the accuracy tests for the synthetic number-plate / ANPR-style monthly pattern-learning model.

Main files:

- `ANPR_SYNTHETIC_ACCURACY_REPORT.md` — report-ready explanation and metrics.
- `metrics_summary.csv` — compact metrics table.
- `confusion_matrix_*.png` — confusion matrix charts.
- `feature_importance_*_2025_holdout.csv/png` — feature importance.
- `top_predicted_high_risk_corridors_2025_summary.csv` — corridor-level risk ranking.
- `predictions_train_2023_2024_test_2025.csv` — row-level 2025 holdout predictions.

Limitation: all number-plate fields are synthetic proxies, not real license plates.
