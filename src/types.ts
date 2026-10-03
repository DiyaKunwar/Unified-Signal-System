/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface MetricSummary {
  evaluation: string;
  train_rows: number;
  test_rows: number;
  volume_mae: number;
  volume_rmse: number;
  volume_r2: number;
  congestion_accuracy: number;
  congestion_roc_auc: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: ConfusionMatrix;
  baseline?: MetricSummary;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  importance_share: number;
}

export interface PredictionRow {
  year_month: string;
  year: number;
  month_num: number;
  location_id: string;
  road_code: string;
  direction: string;
  hour: number;
  fw_anpr_passage_mean: number;
  fw_anpr_passage_max: number;
  fw_anpr_passage_min: number;
  fw_speed_mean: number;
  fw_speed_min: number;
  fw_vc_mean: number;
  fw_tti_mean: number;
  fw_incident_rate: number;
  fw_congested_rate: number;
  fw_weekend_share: number;
  fw_recurrence_index: number;
  fw_peak_to_mean_ratio: number;
  pred_later_anpr_passage_mean: number;
  target_later_anpr_passage_mean: number;
  pred_congestion_probability: number;
  pred_congestion_risk: number;
  actual_congestion_risk: number;
  passage_abs_error: number;
  risk_band: 'low' | 'medium' | 'high' | 'critical';
}

export interface CorridorMetadata {
  id: string;
  name: string;
  road: string;
  direction: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  avgVolume: number;
  avgSpeed: number;
  incidentRate: number;
}
