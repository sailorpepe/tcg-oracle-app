/**
 * Oracle Memory — Self-Accumulating Local Price History
 *
 * Records market snapshots from every search the user performs.
 * Over time, this builds a personal price intelligence database
 * that powers historical price charts for ANY product — TCG cards,
 * Rolex watches, sneakers, electronics, anything.
 *
 * Storage: AsyncStorage (localStorage on web, SQLite on native)
 * Budget: ~8.5MB max (200 queries × 365 days × 120 bytes)
 * No external APIs. No rate limits. No keys.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────

export interface PriceSnapshot {
  date: string;           // "2026-05-05" (calendar date, dedup key)
  clValue: number;        // CL Value from comps algorithm
  median: number;         // Median sold/listed price
  low: number;            // Lowest comp
  high: number;           // Highest comp
  compsCount: number;     // How many comps were used
  source: 'ebay_sold' | 'ebay_browse' | 'tcg_api';
}

export interface OracleEntry {
  query: string;          // Normalized search query
  game?: string;          // GameId if TCG, 'ebay' if general
  snapshots: PriceSnapshot[];
  lastUpdated: string;    // ISO timestamp
}

// ─── Constants ───────────────────────────────────────

const KEY_PREFIX = '@oracle_mem:';
const INDEX_KEY = '@oracle_mem_index';
const MAX_DAYS = 365;
const MAX_TRACKED_QUERIES = 500;

// ─── Helpers ─────────────────────────────────────────

/** Normalize a query for consistent dedup: lowercase, trim, collapse spaces */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Get today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** Storage key for a specific query */
function storageKey(normalizedQuery: string): string {
  return `${KEY_PREFIX}${normalizedQuery}`;
}

// ─── Core API ────────────────────────────────────────

/**
 * Record a price snapshot after a comp fetch completes.
 * Automatically deduplicates (max 1 entry per query per day).
 * Automatically prunes entries older than 365 days.
 */
export async function recordSnapshot(
  query: string,
  game: string | undefined,
  data: {
    clValue: number;
    median: number;
    low: number;
    high: number;
    compsCount: number;
    source: PriceSnapshot['source'];
  }
): Promise<void> {
  if (!query || data.clValue <= 0) return; // Don't record empty/zero results

  const normalized = normalizeQuery(query);
  const key = storageKey(normalized);
  const dateStr = today();

  try {
    // Read existing entry
    const raw = await AsyncStorage.getItem(key);
    let entry: OracleEntry;

    if (raw) {
      entry = JSON.parse(raw);
    } else {
      entry = {
        query: normalized,
        game,
        snapshots: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // Dedup: check if we already have an entry for today
    const existingIndex = entry.snapshots.findIndex(s => s.date === dateStr);
    const snapshot: PriceSnapshot = {
      date: dateStr,
      clValue: data.clValue,
      median: data.median,
      low: data.low,
      high: data.high,
      compsCount: data.compsCount,
      source: data.source,
    };

    if (existingIndex >= 0) {
      // Update today's entry (latest search wins)
      entry.snapshots[existingIndex] = snapshot;
    } else {
      // Add new entry
      entry.snapshots.push(snapshot);
    }

    // Prune: remove entries older than MAX_DAYS
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    entry.snapshots = entry.snapshots.filter(s => s.date >= cutoffStr);

    // Sort by date ascending
    entry.snapshots.sort((a, b) => a.date.localeCompare(b.date));

    entry.lastUpdated = new Date().toISOString();

    // Save
    await AsyncStorage.setItem(key, JSON.stringify(entry));

    // Update the index (list of tracked queries)
    await updateIndex(normalized, game);

    console.log(
      `[OracleMemory] Recorded snapshot for "${normalized}" — ` +
      `${entry.snapshots.length} data points, CL $${data.clValue.toFixed(2)}`
    );
  } catch (err) {
    console.warn('[OracleMemory] Failed to record snapshot:', err);
  }
}

/**
 * Get accumulated price history for a query.
 * Returns snapshots sorted by date, filtered to the requested window.
 */
export async function getHistory(
  query: string,
  days: number = MAX_DAYS
): Promise<PriceSnapshot[]> {
  const normalized = normalizeQuery(query);
  const key = storageKey(normalized);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];

    const entry: OracleEntry = JSON.parse(raw);
    if (!entry.snapshots?.length) return [];

    // Filter by requested window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return entry.snapshots
      .filter(s => s.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Get all tracked queries with their latest data.
 * Useful for a future "Watchlist" or "Recently Tracked" view.
 */
export async function getAllTracked(): Promise<{
  query: string;
  game?: string;
  dataPoints: number;
  lastPrice: number;
  lastUpdated: string;
}[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];

    const index: { query: string; game?: string }[] = JSON.parse(raw);
    const results = [];

    for (const item of index) {
      const key = storageKey(item.query);
      const entryRaw = await AsyncStorage.getItem(key);
      if (!entryRaw) continue;

      const entry: OracleEntry = JSON.parse(entryRaw);
      const last = entry.snapshots[entry.snapshots.length - 1];

      results.push({
        query: item.query,
        game: item.game,
        dataPoints: entry.snapshots.length,
        lastPrice: last?.clValue || 0,
        lastUpdated: entry.lastUpdated,
      });
    }

    // Sort by most recently updated
    return results.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  } catch {
    return [];
  }
}

/**
 * Get Oracle Memory statistics.
 */
export async function getStats(): Promise<{
  trackedQueries: number;
  totalDataPoints: number;
  oldestEntry: string | null;
}> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return { trackedQueries: 0, totalDataPoints: 0, oldestEntry: null };

    const index: { query: string }[] = JSON.parse(raw);
    let totalDataPoints = 0;
    let oldestEntry: string | null = null;

    for (const item of index) {
      const key = storageKey(item.query);
      const entryRaw = await AsyncStorage.getItem(key);
      if (!entryRaw) continue;

      const entry: OracleEntry = JSON.parse(entryRaw);
      totalDataPoints += entry.snapshots.length;

      if (entry.snapshots.length > 0) {
        const oldest = entry.snapshots[0].date;
        if (!oldestEntry || oldest < oldestEntry) {
          oldestEntry = oldest;
        }
      }
    }

    return {
      trackedQueries: index.length,
      totalDataPoints,
      oldestEntry,
    };
  } catch {
    return { trackedQueries: 0, totalDataPoints: 0, oldestEntry: null };
  }
}

// ─── Internal ────────────────────────────────────────

/** Maintain an index of all tracked queries for fast enumeration */
async function updateIndex(normalizedQuery: string, game?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    let index: { query: string; game?: string }[] = raw ? JSON.parse(raw) : [];

    // Check if already indexed
    const existing = index.findIndex(i => i.query === normalizedQuery);
    if (existing >= 0) {
      // Update game if needed
      index[existing].game = game;
    } else {
      // Add new entry
      index.push({ query: normalizedQuery, game });
    }

    // Cap at MAX_TRACKED_QUERIES — evict oldest (LRU-style)
    if (index.length > MAX_TRACKED_QUERIES) {
      // Remove the oldest entries by checking their lastUpdated
      // For simplicity, just trim from the front (oldest added)
      index = index.slice(-MAX_TRACKED_QUERIES);
    }

    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.warn('[OracleMemory] Failed to update index:', err);
  }
}
