/**
 * TCG Oracle — Vault Storage
 * Shared utility for saving/loading cards to the local Vault (watchlist).
 * Uses AsyncStorage — all data stays on-device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '@/lib/api';

const VAULT_KEY = '@tcg_oracle_vault';
const VAULT_HISTORY_KEY = '@tcg_oracle_vault_history';

export interface VaultSnapshot {
  date: string;       // ISO date (YYYY-MM-DD)
  totalValue: number;
  cardCount: number;
}

export async function getVault(): Promise<Card[]> {
  try {
    const stored = await AsyncStorage.getItem(VAULT_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export async function addToVault(card: Card): Promise<{ added: boolean; alreadyExists: boolean }> {
  let vault = await getVault();
  const exists = vault.some(c => c.id === card.id && c.game === card.game);
  if (exists) return { added: false, alreadyExists: true };

  vault.unshift(card); // newest first
  if (vault.length > 500) vault = vault.slice(0, 500); // cap to prevent startup crash
  await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  return { added: true, alreadyExists: false };
}

export async function removeFromVault(cardId: string): Promise<Card[]> {
  const vault = await getVault();
  const updated = vault.filter(c => c.id !== cardId);
  await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearVault(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_KEY);
}

export async function isInVault(cardId: string, game: string): Promise<boolean> {
  const vault = await getVault();
  return vault.some(c => c.id === cardId && c.game === game);
}

// ─── Portfolio Value History ────────────────────────

/** Save a daily snapshot of portfolio value. Only one entry per day. */
export async function recordVaultSnapshot(cards: Card[]): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalValue = cards.reduce((sum, c) => sum + (c.price || 0), 0);
    
    const history = await getVaultHistory();
    
    // Update today's entry or append
    const existingIdx = history.findIndex(s => s.date === today);
    const snapshot: VaultSnapshot = { date: today, totalValue, cardCount: cards.length };
    
    if (existingIdx >= 0) {
      history[existingIdx] = snapshot;
    } else {
      history.push(snapshot);
    }
    
    // Keep last 365 days
    const trimmed = history.slice(-365);
    await AsyncStorage.setItem(VAULT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Silent — don't break the app for analytics
  }
}

/** Get all historical value snapshots. */
export async function getVaultHistory(): Promise<VaultSnapshot[]> {
  try {
    const stored = await AsyncStorage.getItem(VAULT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

