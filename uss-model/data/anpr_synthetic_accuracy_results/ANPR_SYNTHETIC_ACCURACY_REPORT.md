# Synthetic ANPR / Number Plate Pattern Accuracy Evaluation

## Purpose

This evaluation tests the **ANPR-style monthly pattern-learning pipeline** using the augmented RTA 4IR dataset with synthetic number-plate fields. The model trains on the first week of each month and predicts congestion demand/risk for the remaining weeks.

## Dataset used

Input files:

- `traffic_volume_hourly_2023.csv`
- `traffic_volume_hourly_2024.csv`
- `traffic_volume_hourly_2025.csv`

Synthetic plate fields used as proxy ANPR features:

- `synthetic_number_plate`
- `synthetic_plate_token_monthly`
- `synthetic_plate_pattern_id`
- `synthetic_anpr_passage_count`
- `is_synthetic_number_plate`

Important: the model does **not** use real number plates. These fields are synthetic simulation fields added to the challenge dataset.

## Training design

Each row in the training table represents:

`year_month + location_id + road_code + direction + hour`

Features are calculated only from **days 1–7** of each month. Targets are calculated from **days 8–end of month**.

Prediction targets:

- Future average ANPR-style passage count
- Future congestion risk, where risk = later-month congestion in at least 20% of observations

## Test 1 — First-week-to-rest-of-month grouped split

This test checks whether the pipeline learns from first-week monthly patterns and predicts later-month outcomes on unseen months.

Train rows: 11,664 · Test rows: 3,888

| Metric | Random Forest | Persistence baseline |
|---|---:|---:|
| Volume MAE | 229.17 | 204.34 |
| Volume RMSE | 410.30 | 413.23 |
| Volume R² | 0.9770 | 0.9766 |
| Congestion accuracy | 97.74% | 97.74% |
| Congestion ROC-AUC | 0.9966 | 0.9872 |
| Precision | 93.79% | 96.63% |
| Recall | 95.81% | 92.69% |
| F1-score | 94.79% | 94.62% |

Confusion matrix:

- True negatives: 3,000
- False positives: 53
- False negatives: 35
- True positives: 800

## Test 2 — Train 2023–2024, test 2025

This is the stronger test because the model is trained on earlier years and evaluated on a future year.

Train rows: 10,368 · Test rows: 5,184

| Metric | Random Forest | Persistence baseline |
|---|---:|---:|
| Volume MAE | 259.61 | 261.17 |
| Volume RMSE | 477.19 | 456.58 |
| Volume R² | 0.9706 | 0.9731 |
| Congestion accuracy | 97.28% | 97.11% |
| Congestion ROC-AUC | 0.9964 | 0.9860 |
| Precision | 94.30% | 96.14% |
| Recall | 94.67% | 91.92% |
| F1-score | 94.48% | 93.99% |

Confusion matrix:

- True negatives: 3,836
- False positives: 73
- False negatives: 68
- True positives: 1,207

## Most important features — 2025 holdout model

Top classifier feature groups:

| feature              |   importance |   importance_share |
|:---------------------|-------------:|-------------------:|
| fw_congested_rate    |    0.228484  |          0.228484  |
| fw_vc_mean           |    0.171777  |          0.171777  |
| fw_tti_mean          |    0.157122  |          0.157122  |
| fw_anpr_passage_max  |    0.0689894 |          0.0689894 |
| fw_speed_mean        |    0.0615612 |          0.0615612 |
| fw_speed_min         |    0.0555884 |          0.0555884 |
| fw_anpr_passage_mean |    0.0552635 |          0.0552635 |
| fw_anpr_passage_sum  |    0.0457583 |          0.0457583 |
| hour                 |    0.0313328 |          0.0313328 |
| fw_anpr_passage_std  |    0.0291233 |          0.0291233 |

## Top predicted high-risk corridors — 2025 holdout

| year_month   | location_id   | road_code   | direction         |   hour |   pred_congestion_probability | risk_band   |   pred_later_anpr_passage_mean |   target_later_anpr_passage_mean |   target_later_congested_rate |
|:-------------|:--------------|:------------|:------------------|-------:|------------------------------:|:------------|-------------------------------:|---------------------------------:|------------------------------:|
| 2025-12      | SZR_S1        | E11         | SB (to Abu Dhabi) |     18 |                             1 | critical    |                       11322.6  |                         11714.1  |                      1        |
| 2025-10      | SZR_S1        | E11         | SB (to Abu Dhabi) |     17 |                             1 | critical    |                       11232.2  |                         11263    |                      0.916667 |
| 2025-01      | SZR_S1        | E11         | SB (to Abu Dhabi) |     17 |                             1 | critical    |                       11229.1  |                         11474.5  |                      0.958333 |
| 2025-05      | SZR_N4        | E11         | NB (to Deira)     |      8 |                             1 | critical    |                       10745.6  |                         10557    |                      0.708333 |
| 2025-09      | SZR_S1        | E11         | SB (to Abu Dhabi) |     18 |                             1 | critical    |                       10665.4  |                         11135.2  |                      0.913043 |
| 2025-08      | SZR_S1        | E11         | SB (to Abu Dhabi) |     18 |                             1 | critical    |                       10465    |                          9989.17 |                      0.666667 |
| 2025-11      | SZR_N4        | E11         | NB (to Deira)     |      7 |                             1 | critical    |                       10378.1  |                          9314.83 |                      0.652174 |
| 2025-07      | SZR_N4        | E11         | NB (to Deira)     |      8 |                             1 | critical    |                        9944.47 |                         10507    |                      0.75     |
| 2025-11      | SZR_N4        | E11         | NB (to Deira)     |      9 |                             1 | critical    |                        9921.28 |                          9619.52 |                      0.652174 |
| 2025-05      | SZR_N4        | E11         | NB (to Deira)     |      7 |                             1 | critical    |                        9862.51 |                          9252.25 |                      0.708333 |
| 2025-08      | SZR_N4        | E11         | NB (to Deira)     |      8 |                             1 | critical    |                        9824.17 |                          9203.08 |                      0.666667 |
| 2025-10      | SZR_N4        | E11         | NB (to Deira)     |      7 |                             1 | critical    |                        9809.56 |                         10346.8  |                      0.75     |
| 2025-10      | SZR_N4        | E11         | NB (to Deira)     |      9 |                             1 | critical    |                        9616.95 |                          9818.96 |                      0.75     |
| 2025-09      | SZR_S1        | E11         | SB (to Abu Dhabi) |     17 |                             1 | critical    |                        9565.05 |                         10498.7  |                      0.73913  |
| 2025-09      | SZR_N4        | E11         | NB (to Deira)     |      8 |                             1 | critical    |                        9563.23 |                         10816.1  |                      0.73913  |

## Interpretation

The persistence baseline assumes the rest of the month behaves like the first week: predicted volume = first-week mean volume, predicted risk = first-week congested rate ≥ 20%. On this synthetic dataset that naive rule is already very strong. On the 2025 holdout the Random Forest improves classification only marginally (recall +2.8 pts, ROC-AUC 0.996 vs 0.986, F1 +0.5 pts) and does not beat it on volume (R² 0.971 vs 0.973). Most of the headline accuracy therefore comes from the data being highly stable month to month, not from the model learning something the baseline misses.

Notes on the "ANPR" features:

- `synthetic_anpr_passage_count` equals `volume_vph` in every row, so the passage features are traffic volume under another name.
- `fw_anpr_unique_token_count` and `fw_anpr_unique_pattern_count` are constant (one token per corridor-hour-month), so they carry no signal.
- The top classifier features are first-week congestion rate, v/c ratio and travel-time index — i.e. the model mostly extrapolates the first week's congestion.

The honest claim is: on simulated data, first-week corridor statistics forecast later-month congestion with ~97% accuracy, and a Random Forest adds a small recall gain over a persistence baseline. A real ANPR feed with genuine re-identification patterns would be needed to test whether plate-level features add value.

## Clear limitation

This evaluation validates the **training workflow**, not real-world number-plate surveillance. The number-plate fields are synthetic and were generated as privacy-safe simulation proxies. Therefore, the correct claim is:

> The model demonstrates that first-week ANPR-style passage patterns can be used to forecast later-month traffic demand and congestion risk in a simulated dataset.

Do **not** claim that real license-plate identity tracking has been proven to predict Dubai congestion at this accuracy. A real deployment would require lawful data access, privacy impact assessment, edge processing, retention limits, operator approval, and independent validation on real ANPR-derived aggregate passage data.
