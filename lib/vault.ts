/**
 * TCG Oracle — Vault Storage
 * Shared utility for saving/loading cards to the local Vault (watchlist).
 * Uses AsyncStorage — all data stays on-device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '@/lib/api';

const VAULT_KEY = '@tcg_oracle_vault';

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
