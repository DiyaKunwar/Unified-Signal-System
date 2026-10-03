/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricSummary, FeatureImportance, CorridorMetadata } from '../types';
// Exported by run_accuracy_evaluation.py (data/anpr_synthetic_accuracy_results/dashboard_results.json).
// Re-copy it here after re-running the pipeline; nothing in this file is hand-tuned.
import results from './modelResults.json';

type RawMetrics = (typeof results.metrics)[number];

const toSummary = (m: RawMetrics['persistence_baseline'], evaluation: string, train_rows: number, test_rows: number): MetricSummary => ({
  evaluation,
  train_rows,
  test_rows,
  volume_mae: m.regression_mae,
  volume_rmse: m.regression_rmse,
  volume_r2: m.regression_r2,
  congestion_accuracy: m.classification_accuracy,
  congestion_roc_auc: m.classification_roc_auc ?? 0,
  precision: m.classification_precision,
  recall: m.classification_recall,
  f1: m.classification_f1,
  confusion_matrix: m.confusion_matrix,
});

const LABELS = ['Grouped Month Split (Test 1)', 'Train 2023–2024, Test 2025 (Test 2 Holdout)'];

export const EVALUATION_METRICS: MetricSummary[] = results.metrics.map((m, i) => ({
  ...toSummary(m, LABELS[i], m.train_rows, m.test_rows),
  baseline: toSummary(m.persistence_baseline, 'Persistence baseline', 0, m.test_rows),
}));

export const FEATURE_IMPORTANCE_CLF: FeatureImportance[] = results.feature_importance_classifier;
export const FEATURE_IMPORTANCE_REG: FeatureImportance[] = results.feature_importance_regressor;

// Display names and schematic (not to scale) map positions for the 18 locations in the dataset.
const LAYOUT: Record<string, Pick<CorridorMetadata, 'name' | 'startX' | 'startY' | 'endX' | 'endY'>> = {
  SZR_N1: { name: 'Sheikh Zayed Rd NB 1', startX: 150, startY: 170, endX: 300, endY: 170 },
  SZR_N2: { name: 'Sheikh Zayed Rd NB 2', startX: 310, startY: 170, endX: 460, endY: 170 },
  SZR_N4: { name: 'Sheikh Zayed Rd NB 4', startX: 470, startY: 170, endX: 620, endY: 170 },
  SZR_S1: { name: 'Sheikh Zayed Rd SB 1', startX: 620, startY: 190, endX: 470, endY: 190 },
  SZR_S2: { name: 'Sheikh Zayed Rd SB 2', startX: 460, startY: 190, endX: 310, endY: 190 },
  SZR_S4: { name: 'Sheikh Zayed Rd SB 4', startX: 300, startY: 190, endX: 150, endY: 190 },
  EKR_N1: { name: 'Al Khail Rd NB', startX: 150, startY: 280, endX: 620, endY: 280 },
  EKR_S1: { name: 'Al Khail Rd SB', startX: 620, startY: 300, endX: 150, endY: 300 },
  MBZ_E1: { name: 'Sheikh Mohammed bin Zayed Rd', startX: 150, startY: 380, endX: 620, endY: 380 },
  EMR_E1: { name: 'Emirates Rd', startX: 150, startY: 440, endX: 620, endY: 440 },
  JBR_X1: { name: 'Jumeirah Beach Rd', startX: 120, startY: 450, endX: 120, endY: 150 },
  DWC_X1: { name: 'Expo Rd (DWC)', startX: 60, startY: 450, endX: 60, endY: 150 },
  BBC_S1: { name: 'Business Bay Crossing SB', startX: 650, startY: 150, endX: 650, endY: 450 },
  GAR_N1: { name: 'Al Garhoud Bridge NB', startX: 690, startY: 450, endX: 690, endY: 150 },
  MAK_N1: { name: 'Al Maktoum Bridge NB', startX: 710, startY: 450, endX: 710, endY: 150 },
  ITT_E1: { name: 'Al Ittihad Rd EB', startX: 740, startY: 450, endX: 740, endY: 150 },
  ITT_W1: { name: 'Al Ittihad Rd WB', startX: 760, startY: 150, endX: 760, endY: 450 },
  AIR_W1: { name: 'Airport Rd WB', startX: 780, startY: 150, endX: 780, endY: 450 },
};

// Average first-week statistics per corridor over the 2023–2024 training years.
export const CORRIDORS: CorridorMetadata[] = results.corridors.map(c => ({
  id: c.location_id,
  road: c.road_code,
  direction: c.direction,
  avgVolume: Math.round(c.avgVolume),
  avgSpeed: Math.round(c.avgSpeed),
  incidentRate: c.incidentRate,
  ...(LAYOUT[c.location_id] ?? { name: c.location_id, startX: 0, startY: 0, endX: 0, endY: 0 }),
}));
