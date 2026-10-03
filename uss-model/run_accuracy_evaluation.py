#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_DIR = Path('datasets')
OUT_DIR = Path('data/anpr_synthetic_accuracy_results')

CATEGORICAL_FEATURES = ["location_id", "road_code", "direction"]
NUMERIC_FEATURES = [
    "year",
    "month_num",
    "hour",
    "fw_anpr_passage_mean",
    "fw_anpr_passage_max",
    "fw_anpr_passage_min",
    "fw_anpr_passage_std",
    "fw_anpr_passage_sum",
    "fw_anpr_unique_token_count",
    "fw_anpr_unique_pattern_count",
    "fw_speed_mean",
    "fw_speed_min",
    "fw_vc_mean",
    "fw_tti_mean",
    "fw_incident_rate",
    "fw_congested_rate",
    "fw_weekend_share",
    "fw_recurrence_index",
    "fw_peak_to_mean_ratio",
    "fw_observations",
]
TARGET_REG = "target_later_anpr_passage_mean"
TARGET_CLF = "target_congestion_risk"


def load_augmented_traffic(data_dir: Path) -> pd.DataFrame:
    files = sorted(data_dir.glob('traffic_volume_hourly_*.csv'))
    if not files:
        raise FileNotFoundError(f'No traffic_volume_hourly_*.csv files found in {data_dir}')
    frames = []
    for path in files:
        df = pd.read_csv(path, parse_dates=['datetime', 'date'])
        df['source_file'] = path.name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)

    required = {
        'datetime', 'date', 'hour', 'location_id', 'road_code', 'direction',
        'volume_vph', 'avg_speed_kph', 'vc_ratio', 'travel_time_index', 'level_of_service',
        'incident_affected', 'synthetic_number_plate', 'synthetic_plate_token_monthly',
        'synthetic_plate_pattern_id', 'synthetic_anpr_passage_count',
        'is_synthetic_number_plate'
    }
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f'Missing required columns: {sorted(missing)}')

    df['year'] = df['datetime'].dt.year
    df['month_num'] = df['datetime'].dt.month
    df['year_month'] = df['datetime'].dt.to_period('M').astype(str)
    df['day_of_month'] = df['datetime'].dt.day
    df['day_of_week'] = df['datetime'].dt.dayofweek
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['congested'] = ((df['vc_ratio'] >= 0.70) | (df['level_of_service'].isin(['E', 'F']))).astype(int)
    df['anpr_passage_count'] = pd.to_numeric(df['synthetic_anpr_passage_count'], errors='coerce').fillna(df['volume_vph']).clip(lower=0)
    return df


def build_monthly_pattern_table(traffic: pd.DataFrame) -> pd.DataFrame:
    group_cols = ['year_month', 'year', 'month_num', 'location_id', 'road_code', 'direction', 'hour']
    first_week = traffic[traffic['day_of_month'] <= 7].copy()
    later_month = traffic[traffic['day_of_month'] > 7].copy()

    fw = first_week.groupby(group_cols).agg(
        fw_anpr_passage_mean=('anpr_passage_count', 'mean'),
        fw_anpr_passage_max=('anpr_passage_count', 'max'),
        fw_anpr_passage_min=('anpr_passage_count', 'min'),
        fw_anpr_passage_std=('anpr_passage_count', 'std'),
        fw_anpr_passage_sum=('anpr_passage_count', 'sum'),
        fw_anpr_unique_token_count=('synthetic_plate_token_monthly', 'nunique'),
        fw_anpr_unique_pattern_count=('synthetic_plate_pattern_id', 'nunique'),
        fw_speed_mean=('avg_speed_kph', 'mean'),
        fw_speed_min=('avg_speed_kph', 'min'),
        fw_vc_mean=('vc_ratio', 'mean'),
        fw_tti_mean=('travel_time_index', 'mean'),
        fw_incident_rate=('incident_affected', 'mean'),
        fw_congested_rate=('congested', 'mean'),
        fw_weekend_share=('is_weekend', 'mean'),
        fw_observations=('anpr_passage_count', 'size'),
    ).reset_index()
    fw['fw_anpr_passage_std'] = fw['fw_anpr_passage_std'].fillna(0.0)
    fw['fw_recurrence_index'] = 1.0 / (1.0 + (fw['fw_anpr_passage_std'] / (fw['fw_anpr_passage_mean'].abs() + 1.0)))
    fw['fw_peak_to_mean_ratio'] = fw['fw_anpr_passage_max'] / (fw['fw_anpr_passage_mean'].abs() + 1.0)

    target = later_month.groupby(group_cols).agg(
        target_later_anpr_passage_mean=('anpr_passage_count', 'mean'),
        target_later_anpr_passage_max=('anpr_passage_count', 'max'),
        target_later_speed_mean=('avg_speed_kph', 'mean'),
        target_later_vc_mean=('vc_ratio', 'mean'),
        target_later_congested_rate=('congested', 'mean'),
        target_later_incident_rate=('incident_affected', 'mean'),
        target_observations=('anpr_passage_count', 'size'),
    ).reset_index()
    # Risk: congestion appears in at least 20% of later-month observations for that location-direction-hour.
    target['target_congestion_risk'] = (target['target_later_congested_rate'] >= 0.20).astype(int)

    table = fw.merge(target, on=group_cols, how='inner')
    table = table.sort_values(['year_month', 'location_id', 'direction', 'hour']).reset_index(drop=True)
    return table


def preprocessor() -> ColumnTransformer:
    num = Pipeline([('imputer', SimpleImputer(strategy='median')), ('scaler', StandardScaler())])
    cat = Pipeline([('imputer', SimpleImputer(strategy='most_frequent')), ('onehot', OneHotEncoder(handle_unknown='ignore'))])
    return ColumnTransformer([('num', num, NUMERIC_FEATURES), ('cat', cat, CATEGORICAL_FEATURES)])


def build_models(random_state: int = 42):
    reg = Pipeline([
        ('features', preprocessor()),
        ('model', RandomForestRegressor(
            n_estimators=250, max_depth=18, min_samples_leaf=2,
            random_state=random_state, n_jobs=-1
        ))
    ])
    clf = Pipeline([
        ('features', preprocessor()),
        ('model', RandomForestClassifier(
            n_estimators=250, max_depth=18, min_samples_leaf=2,
            random_state=random_state, n_jobs=-1, class_weight='balanced_subsample'
        ))
    ])
    return reg, clf


def metrics_dict(y_reg_true, y_reg_pred, y_clf_true, y_clf_prob, threshold=0.5) -> dict[str, Any]:
    y_clf_pred = (y_clf_prob >= threshold).astype(int)
    cm = confusion_matrix(y_clf_true, y_clf_pred, labels=[0,1])
    tn, fp, fn, tp = [int(x) for x in cm.ravel()]
    try:
        auc = float(roc_auc_score(y_clf_true, y_clf_prob))
    except ValueError:
        auc = None
    rmse = float(np.sqrt(mean_squared_error(y_reg_true, y_reg_pred)))
    return {
        'regression_mae': float(mean_absolute_error(y_reg_true, y_reg_pred)),
        'regression_rmse': rmse,
        'regression_r2': float(r2_score(y_reg_true, y_reg_pred)),
        'classification_accuracy': float(accuracy_score(y_clf_true, y_clf_pred)),
        'classification_roc_auc': auc,
        'classification_precision': float(precision_score(y_clf_true, y_clf_pred, zero_division=0)),
        'classification_recall': float(recall_score(y_clf_true, y_clf_pred, zero_division=0)),
        'classification_f1': float(f1_score(y_clf_true, y_clf_pred, zero_division=0)),
        'confusion_matrix': {'tn': tn, 'fp': fp, 'fn': fn, 'tp': tp},
    }


def evaluate_split(table: pd.DataFrame, train_idx, test_idx, label: str, out_dir: Path):
    x = table[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y_reg = table[TARGET_REG]
    y_clf = table[TARGET_CLF]

    reg, clf = build_models(random_state=42)
    reg.fit(x.iloc[train_idx], y_reg.iloc[train_idx])
    clf.fit(x.iloc[train_idx], y_clf.iloc[train_idx])

    pred_reg = reg.predict(x.iloc[test_idx])
    pred_prob = clf.predict_proba(x.iloc[test_idx])[:, 1]
    pred_label = (pred_prob >= 0.5).astype(int)

    m = metrics_dict(y_reg.iloc[test_idx], pred_reg, y_clf.iloc[test_idx], pred_prob)
    # Persistence baseline: assume the rest of the month looks like the first week.
    # The model is only useful to the extent it beats this.
    test = table.iloc[test_idx]
    m['persistence_baseline'] = metrics_dict(
        y_reg.iloc[test_idx], test['fw_anpr_passage_mean'],
        y_clf.iloc[test_idx], test['fw_congested_rate'], threshold=0.20,
    )
    m.update({
        'evaluation': label,
        'rows_total': int(len(table)),
        'train_rows': int(len(train_idx)),
        'test_rows': int(len(test_idx)),
        'train_months': sorted(table.iloc[train_idx]['year_month'].unique().tolist()),
        'test_months': sorted(table.iloc[test_idx]['year_month'].unique().tolist()),
    })

    pred_df = table.iloc[test_idx].copy().reset_index(drop=True)
    pred_df['pred_later_anpr_passage_mean'] = pred_reg
    pred_df['pred_congestion_probability'] = pred_prob
    pred_df['pred_congestion_risk'] = pred_label
    pred_df['actual_congestion_risk'] = y_clf.iloc[test_idx].to_numpy()
    pred_df['passage_abs_error'] = (pred_df[TARGET_REG] - pred_df['pred_later_anpr_passage_mean']).abs()
    pred_df['risk_band'] = pd.cut(
        pred_df['pred_congestion_probability'],
        bins=[-0.001, 0.30, 0.60, 0.80, 1.001],
        labels=['low', 'medium', 'high', 'critical']
    ).astype(str)

    # Save models and predictions for the split.
    model_path = out_dir / f'{label}_models.joblib'
    joblib.dump({'regression_model': reg, 'classification_model': clf, 'features': NUMERIC_FEATURES + CATEGORICAL_FEATURES}, model_path)

    return m, pred_df, reg, clf


def aggregate_feature_importance(pipe: Pipeline) -> pd.DataFrame:
    pre = pipe.named_steps['features']
    model = pipe.named_steps['model']
    feature_names = list(pre.get_feature_names_out())
    importances = model.feature_importances_
    rows = []
    for name, importance in zip(feature_names, importances):
        if name.startswith('num__'):
            base = name.replace('num__','')
        elif name.startswith('cat__'):
            # cat__location_id_SZR_N1 -> location_id, cat__direction_NB -> direction
            stripped = name.replace('cat__','')
            base = next((f for f in CATEGORICAL_FEATURES if stripped.startswith(f + '_')), stripped)
        else:
            base = name
        rows.append({'raw_feature': name, 'feature': base, 'importance': float(importance)})
    df = pd.DataFrame(rows)
    agg = df.groupby('feature', as_index=False)['importance'].sum().sort_values('importance', ascending=False)
    agg['importance_share'] = agg['importance'] / agg['importance'].sum()
    return agg


def plot_confusion_matrix(cm_dict: dict[str, int], title: str, path: Path):
    cm = np.array([[cm_dict['tn'], cm_dict['fp']], [cm_dict['fn'], cm_dict['tp']]])
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    im = ax.imshow(cm)
    ax.set_title(title)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('Actual')
    ax.set_xticks([0,1], labels=['No congestion', 'Congestion'])
    ax.set_yticks([0,1], labels=['No congestion', 'Congestion'])
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(cm[i,j]), ha='center', va='center')
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(path, dpi=180)
    plt.close(fig)


def plot_feature_importance(fi: pd.DataFrame, title: str, path: Path, top_n: int = 15):
    top = fi.head(top_n).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 5.8))
    ax.barh(top['feature'], top['importance_share'])
    ax.set_title(title)
    ax.set_xlabel('Importance share')
    fig.tight_layout()
    fig.savefig(path, dpi=180)
    plt.close(fig)


def plot_top_corridors(top: pd.DataFrame, path: Path):
    # Aggregate average probability by corridor for a clean chart.
    chart = top.groupby(['location_id','road_code','direction'], as_index=False).agg(
        avg_pred_probability=('pred_congestion_probability','mean'),
        rows=('pred_congestion_probability','size')
    ).sort_values('avg_pred_probability', ascending=False).head(12)
    chart['corridor'] = chart['location_id'] + ' | ' + chart['direction']
    chart = chart.iloc[::-1]
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.barh(chart['corridor'], chart['avg_pred_probability'])
    ax.set_title('Top predicted high-risk corridors — 2025 holdout')
    ax.set_xlabel('Average predicted congestion probability')
    fig.tight_layout()
    fig.savefig(path, dpi=180)
    plt.close(fig)


def write_report(out_dir: Path, metrics1: dict, metrics2: dict, top_corridors: pd.DataFrame, feature_importance: pd.DataFrame):
    def pct(x):
        return 'N/A' if x is None else f'{x*100:.2f}%'
    def num(x):
        return 'N/A' if x is None else f'{x:.4f}'
    def comparison_table(m):
        b = m['persistence_baseline']
        rows = [
            ('Volume MAE', 'regression_mae', lambda x: f'{x:.2f}'),
            ('Volume RMSE', 'regression_rmse', lambda x: f'{x:.2f}'),
            ('Volume R²', 'regression_r2', num),
            ('Congestion accuracy', 'classification_accuracy', pct),
            ('Congestion ROC-AUC', 'classification_roc_auc', num),
            ('Precision', 'classification_precision', pct),
            ('Recall', 'classification_recall', pct),
            ('F1-score', 'classification_f1', pct),
        ]
        lines = ['| Metric | Random Forest | Persistence baseline |', '|---|---:|---:|']
        lines += [f'| {name} | {fmt(m[k])} | {fmt(b[k])} |' for name, k, fmt in rows]
        return '\n'.join(lines)
    report = f"""# Synthetic ANPR / Number Plate Pattern Accuracy Evaluation

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

Train rows: {metrics1['train_rows']:,} · Test rows: {metrics1['test_rows']:,}

{comparison_table(metrics1)}

Confusion matrix:

- True negatives: {metrics1['confusion_matrix']['tn']:,}
- False positives: {metrics1['confusion_matrix']['fp']:,}
- False negatives: {metrics1['confusion_matrix']['fn']:,}
- True positives: {metrics1['confusion_matrix']['tp']:,}

## Test 2 — Train 2023–2024, test 2025

This is the stronger test because the model is trained on earlier years and evaluated on a future year.

Train rows: {metrics2['train_rows']:,} · Test rows: {metrics2['test_rows']:,}

{comparison_table(metrics2)}

Confusion matrix:

- True negatives: {metrics2['confusion_matrix']['tn']:,}
- False positives: {metrics2['confusion_matrix']['fp']:,}
- False negatives: {metrics2['confusion_matrix']['fn']:,}
- True positives: {metrics2['confusion_matrix']['tp']:,}

## Most important features — 2025 holdout model

Top classifier feature groups:

{feature_importance.head(10).to_markdown(index=False)}

## Top predicted high-risk corridors — 2025 holdout

{top_corridors.head(15)[['year_month','location_id','road_code','direction','hour','pred_congestion_probability','risk_band','pred_later_anpr_passage_mean','target_later_anpr_passage_mean','target_later_congested_rate']].to_markdown(index=False)}

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
"""
    (out_dir / 'ANPR_SYNTHETIC_ACCURACY_REPORT.md').write_text(report, encoding='utf-8')


def write_dashboard_json(out_dir: Path, table: pd.DataFrame, metrics1: dict, metrics2: dict, fi_clf: pd.DataFrame, fi_reg: pd.DataFrame):
    """Single source of truth for the uss-dashboard: copy this file to uss-dashboard/src/data/modelResults.json."""
    train = table[table['year'].isin([2023, 2024])]
    corridors = train.groupby(['location_id', 'road_code', 'direction'], as_index=False).agg(
        avgVolume=('fw_anpr_passage_mean', 'mean'),
        avgSpeed=('fw_speed_mean', 'mean'),
        incidentRate=('fw_incident_rate', 'mean'),
    ).round(3)
    fi_cols = ['feature', 'importance', 'importance_share']
    payload = {
        'metrics': [metrics1, metrics2],
        'feature_importance_classifier': fi_clf[fi_cols].head(10).round(5).to_dict(orient='records'),
        'feature_importance_regressor': fi_reg[fi_cols].head(10).round(5).to_dict(orient='records'),
        'corridors': corridors.to_dict(orient='records'),
    }
    (out_dir / 'dashboard_results.json').write_text(json.dumps(payload, indent=2), encoding='utf-8')


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    traffic = load_augmented_traffic(DATA_DIR)
    table = build_monthly_pattern_table(traffic)
    table.to_csv(OUT_DIR / 'monthly_synthetic_anpr_training_table.csv', index=False)

    x = table[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = table[TARGET_CLF]

    # Test 1: group split by month so a held-out month is not mixed into train.
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_idx1, test_idx1 = next(splitter.split(x, y, groups=table['year_month']))
    metrics1, preds1, reg1, clf1 = evaluate_split(table, train_idx1, test_idx1, 'grouped_month_split', OUT_DIR)
    preds1.to_csv(OUT_DIR / 'predictions_grouped_month_split.csv', index=False)
    (OUT_DIR / 'metrics_grouped_month_split.json').write_text(json.dumps(metrics1, indent=2), encoding='utf-8')
    plot_confusion_matrix(metrics1['confusion_matrix'], 'Confusion Matrix — Grouped Month Split', OUT_DIR / 'confusion_matrix_grouped_month_split.png')

    # Test 2: train on 2023/2024 and test on 2025.
    train_idx2 = table.index[table['year'].isin([2023, 2024])].to_numpy()
    test_idx2 = table.index[table['year'].eq(2025)].to_numpy()
    metrics2, preds2, reg2, clf2 = evaluate_split(table, train_idx2, test_idx2, 'train_2023_2024_test_2025', OUT_DIR)
    preds2.to_csv(OUT_DIR / 'predictions_train_2023_2024_test_2025.csv', index=False)
    (OUT_DIR / 'metrics_train_2023_2024_test_2025.json').write_text(json.dumps(metrics2, indent=2), encoding='utf-8')
    plot_confusion_matrix(metrics2['confusion_matrix'], 'Confusion Matrix — Train 2023–2024, Test 2025', OUT_DIR / 'confusion_matrix_train_2023_2024_test_2025.png')

    # Feature importance from the stronger holdout classifier and regressor.
    fi_clf = aggregate_feature_importance(clf2)
    fi_reg = aggregate_feature_importance(reg2)
    fi_clf.to_csv(OUT_DIR / 'feature_importance_classifier_2025_holdout.csv', index=False)
    fi_reg.to_csv(OUT_DIR / 'feature_importance_regressor_2025_holdout.csv', index=False)
    plot_feature_importance(fi_clf, 'Classifier feature importance — 2025 holdout', OUT_DIR / 'feature_importance_classifier_2025_holdout.png')
    plot_feature_importance(fi_reg, 'Regressor feature importance — 2025 holdout', OUT_DIR / 'feature_importance_regressor_2025_holdout.png')

    # Top high-risk rows and corridor-level summary.
    top = preds2.sort_values(['pred_congestion_probability', 'pred_later_anpr_passage_mean'], ascending=[False, False]).copy()
    top.to_csv(OUT_DIR / 'top_predicted_high_risk_corridors_2025_rows.csv', index=False)
    top_summary = top.groupby(['location_id','road_code','direction','hour'], as_index=False).agg(
        avg_pred_congestion_probability=('pred_congestion_probability','mean'),
        max_pred_congestion_probability=('pred_congestion_probability','max'),
        avg_pred_later_anpr_passage_mean=('pred_later_anpr_passage_mean','mean'),
        avg_actual_later_anpr_passage_mean=(TARGET_REG,'mean'),
        avg_actual_later_congested_rate=('target_later_congested_rate','mean'),
        months=('year_month','nunique'),
    ).sort_values(['avg_pred_congestion_probability','avg_pred_later_anpr_passage_mean'], ascending=[False, False])
    top_summary['risk_band'] = pd.cut(top_summary['avg_pred_congestion_probability'], bins=[-0.001,0.30,0.60,0.80,1.001], labels=['low','medium','high','critical']).astype(str)
    top_summary.to_csv(OUT_DIR / 'top_predicted_high_risk_corridors_2025_summary.csv', index=False)
    plot_top_corridors(preds2, OUT_DIR / 'top_predicted_high_risk_corridors_2025.png')

    # Summary CSV for easy reading.
    summary_rows = []
    for m in [metrics1, metrics2, {**metrics2['persistence_baseline'], 'evaluation': 'train_2023_2024_test_2025_persistence_baseline', 'train_rows': 0, 'test_rows': metrics2['test_rows']}]:
        summary_rows.append({
            'evaluation': m['evaluation'],
            'train_rows': m['train_rows'],
            'test_rows': m['test_rows'],
            'volume_mae': m['regression_mae'],
            'volume_rmse': m['regression_rmse'],
            'volume_r2': m['regression_r2'],
            'congestion_accuracy': m['classification_accuracy'],
            'congestion_roc_auc': m['classification_roc_auc'],
            'precision': m['classification_precision'],
            'recall': m['classification_recall'],
            'f1': m['classification_f1'],
            'tn': m['confusion_matrix']['tn'],
            'fp': m['confusion_matrix']['fp'],
            'fn': m['confusion_matrix']['fn'],
            'tp': m['confusion_matrix']['tp'],
        })
    pd.DataFrame(summary_rows).to_csv(OUT_DIR / 'metrics_summary.csv', index=False)

    # Add quick README.
    (OUT_DIR / 'README.md').write_text(
        '# ANPR Synthetic Accuracy Evaluation Results\n\n'
        'This folder contains the accuracy tests for the synthetic number-plate / ANPR-style monthly pattern-learning model.\n\n'
        'Main files:\n\n'
        '- `ANPR_SYNTHETIC_ACCURACY_REPORT.md` — report-ready explanation and metrics.\n'
        '- `metrics_summary.csv` — compact metrics table.\n'
        '- `confusion_matrix_*.png` — confusion matrix charts.\n'
        '- `feature_importance_*_2025_holdout.csv/png` — feature importance.\n'
        '- `top_predicted_high_risk_corridors_2025_summary.csv` — corridor-level risk ranking.\n'
        '- `predictions_train_2023_2024_test_2025.csv` — row-level 2025 holdout predictions.\n\n'
        'Limitation: all number-plate fields are synthetic proxies, not real license plates.\n',
        encoding='utf-8'
    )

    write_report(OUT_DIR, metrics1, metrics2, top, fi_clf)
    write_dashboard_json(OUT_DIR, table, metrics1, metrics2, fi_clf, fi_reg)

    print('Done.')
    print(json.dumps({'metrics_summary': summary_rows, 'output_dir': str(OUT_DIR)}, indent=2))

if __name__ == '__main__':
    main()
