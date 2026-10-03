/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PredictionRow } from '../types';

/**
 * Parses raw CSV string into a matrix of strings
 */
export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentToken = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentToken += '"';
          i++; // Skip double quote
        } else {
          inQuotes = false;
        }
      } else {
        currentToken += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentToken.trim());
        currentToken = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentToken.trim());
        currentToken = '';
        if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
          result.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip double newline sequence
        }
      } else {
        currentToken += char;
      }
    }
  }

  // Push remaining tokens
  if (currentToken !== '' || row.length > 0) {
    row.push(currentToken.trim());
    result.push(row);
  }

  return result;
}

const NUMERIC_FIELDS = [
  'year', 'month_num', 'hour',
  'fw_anpr_passage_mean', 'fw_anpr_passage_max', 'fw_anpr_passage_min',
  'fw_speed_mean', 'fw_speed_min', 'fw_vc_mean', 'fw_tti_mean', 'fw_incident_rate',
  'fw_congested_rate', 'fw_weekend_share', 'fw_recurrence_index', 'fw_peak_to_mean_ratio',
  'pred_later_anpr_passage_mean', 'target_later_anpr_passage_mean',
  'pred_congestion_probability', 'pred_congestion_risk', 'actual_congestion_risk', 'passage_abs_error',
] as const;
const TEXT_FIELDS = ['year_month', 'location_id', 'road_code', 'direction'] as const;

// Same bins as the Python pipeline's risk_band column.
export function riskBand(probability: number): PredictionRow['risk_band'] {
  if (probability >= 0.80) return 'critical';
  if (probability >= 0.60) return 'high';
  if (probability >= 0.30) return 'medium';
  return 'low';
}

/**
 * Converts the pipeline's predictions CSV (header row + data) into PredictionRows.
 * Values are passed through unchanged; a missing required column is an error, not a default.
 */
export function mapCsvToPredictionRows(csvData: string[][]): PredictionRow[] {
  if (csvData.length <= 1) return [];
  const headers = csvData[0];
  const col = (name: string) => headers.indexOf(name);

  const missing = [...NUMERIC_FIELDS, ...TEXT_FIELDS].filter(f => col(f) === -1);
  if (missing.length) throw new Error(`Predictions CSV is missing columns: ${missing.join(', ')}`);

  return csvData.slice(1).filter(r => r.length === headers.length).map(r => {
    const row: Record<string, string | number> = {};
    TEXT_FIELDS.forEach(f => { row[f] = r[col(f)]; });
    NUMERIC_FIELDS.forEach(f => { row[f] = parseFloat(r[col(f)]); });
    row.risk_band = riskBand(row.pred_congestion_probability as number);
    return row as unknown as PredictionRow;
  });
}
