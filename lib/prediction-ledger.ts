/**
 * Oracle Prediction Ledger — Self-Grading Market Calls
 *
 * Logs market predictions made by the Oracle and auto-grades them
 * against actual prices from Oracle Memory over time.
 *
 * Storage: AsyncStorage
 * Budget: ~200KB max (100 predictions × ~2KB each)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHistory } from './oracle-memory';

// ─── Types ───────────────────────────────────────────

export type Direction = 'up' | 'down' | 'stable';
export type Grade = 'correct' | 'incorrect' | 'pending' | 'expired';

export interface Prediction {
  id: string;
  cardName: string;
  direction: Direction;
  priceAtPrediction: number;
  targetPrice?: number;       // Optional target
  timeframeDays: number;      // How many days to evaluate
  createdAt: string;          // ISO date
  evaluateAfter: string;      // ISO date (createdAt + timeframeDays)
  grade: Grade;
  priceAtEvaluation?: number;
  evaluatedAt?: string;
  reasoning?: string;         // Why the Oracle made this call
}

// ─── Constants ───────────────────────────────────────

const LEDGER_KEY = '@oracle_predictions';
const MAX_PREDICTIONS = 100;

// ─── Core API ────────────────────────────────────────

/**
 * Log a new prediction.
 */
export async function logPrediction(data: {
  cardName: string;
  direction: Direction;
  priceAtPrediction: number;
  targetPrice?: number;
  timeframeDays?: number;
  reasoning?: string;
}): Promise<Prediction> {
  const now = new Date();
  const days = data.timeframeDays || 30;
  const evaluateDate = new Date(now);
  evaluateDate.setDate(evaluateDate.getDate() + days);

  const prediction: Prediction = {
    id: `pred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cardName: data.cardName,
    direction: data.direction,
    priceAtPrediction: data.priceAtPrediction,
    targetPrice: data.targetPrice,
    timeframeDays: days,
    createdAt: now.toISOString(),
    evaluateAfter: evaluateDate.toISOString(),
    grade: 'pending',
    reasoning: data.reasoning,
  };

  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    let ledger: Prediction[] = raw ? JSON.parse(raw) : [];

    ledger.push(prediction);

    // Cap at MAX_PREDICTIONS — remove oldest graded ones first
    if (ledger.length > MAX_PREDICTIONS) {
      const graded = ledger.filter(p => p.grade !== 'pending');
      const pending = ledger.filter(p => p.grade === 'pending');
      const toKeep = [...pending, ...graded.slice(-MAX_PREDICTIONS + pending.length)];
      ledger = toKeep.slice(-MAX_PREDICTIONS);
    }

    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    console.log(`[PredictionLedger] Logged: ${data.cardName} → ${data.direction} in ${days}d`);
    return prediction;
  } catch (err) {
    console.warn('[PredictionLedger] Failed to log prediction:', err);
    return prediction;
  }
}

/**
 * Grade all pending predictions that have passed their evaluation date.
 * Checks against Oracle Memory price history.
 */
export async function gradePredictions(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return 0;

    const ledger: Prediction[] = JSON.parse(raw);
    const now = new Date().toISOString();
    let graded = 0;

    for (const pred of ledger) {
      if (pred.grade !== 'pending') continue;
      if (pred.evaluateAfter > now) continue; // Not ready yet

      // Get current price from Oracle Memory
      const history = await getHistory(pred.cardName, pred.timeframeDays + 7);
      if (history.length === 0) {
        pred.grade = 'expired'; // No data to grade against
        pred.evaluatedAt = now;
        graded++;
        continue;
      }

      // Get the most recent price
      const latestSnapshot = history[history.length - 1];
      const currentPrice = latestSnapshot.clValue || latestSnapshot.median;
      pred.priceAtEvaluation = currentPrice;
      pred.evaluatedAt = now;

      // Grade the prediction
      const priceDiff = currentPrice - pred.priceAtPrediction;
      const percentChange = (priceDiff / pred.priceAtPrediction) * 100;

      if (pred.direction === 'up') {
        pred.grade = percentChange > 2 ? 'correct' : 'incorrect'; // 2% threshold
      } else if (pred.direction === 'down') {
        pred.grade = percentChange < -2 ? 'correct' : 'incorrect';
      } else {
        // 'stable' — within ±5%
        pred.grade = Math.abs(percentChange) <= 5 ? 'correct' : 'incorrect';
      }

      graded++;
    }

    if (graded > 0) {
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      console.log(`[PredictionLedger] Graded ${graded} predictions`);
    }

    return graded;
  } catch (err) {
    console.warn('[PredictionLedger] Failed to grade predictions:', err);
    return 0;
  }
}

/**
 * Get prediction statistics for context injection and UI display.
 */
export async function getPredictionStats(): Promise<{
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
  expired: number;
  accuracy: number;  // 0-100, only counts graded predictions
  recentCalls: string[]; // Last 3 predictions as formatted strings
}> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return { total: 0, correct: 0, incorrect: 0, pending: 0, expired: 0, accuracy: 0, recentCalls: [] };

    const ledger: Prediction[] = JSON.parse(raw);
    const correct = ledger.filter(p => p.grade === 'correct').length;
    const incorrect = ledger.filter(p => p.grade === 'incorrect').length;
    const pending = ledger.filter(p => p.grade === 'pending').length;
    const expired = ledger.filter(p => p.grade === 'expired').length;
    const graded = correct + incorrect;
    const accuracy = graded > 0 ? Math.round((correct / graded) * 100) : 0;

    // Format last 3 predictions
    const recent = ledger.slice(-3).map(p => {
      const icon = p.grade === 'correct' ? '✅' : p.grade === 'incorrect' ? '❌' : p.grade === 'expired' ? '⏱' : '⏳';
      const dir = p.direction === 'up' ? '↑' : p.direction === 'down' ? '↓' : '→';
      return `${icon} ${p.cardName} ${dir} $${p.priceAtPrediction.toFixed(0)} (${p.grade})`;
    });

    return { total: ledger.length, correct, incorrect, pending, expired, accuracy, recentCalls: recent };
  } catch {
    return { total: 0, correct: 0, incorrect: 0, pending: 0, expired: 0, accuracy: 0, recentCalls: [] };
  }
}

/**
 * Get all predictions for display.
 */
export async function getAllPredictions(): Promise<Prediction[]> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
