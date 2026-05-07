/**
 * TCG Oracle — Soul System
 * Parse SOUL.md files from The Undesirables NFT collection,
 * extract Big Five personality traits, and build personality
 * prompt fragments for the Oracle AI.
 *
 * Souls persist in AsyncStorage between sessions.
 * When a soul is mounted, the Oracle speaks in-character.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUL_STORAGE_KEY = '@tcg_oracle_mounted_soul';

// ─── Types ──────────────────────────────────────

export interface SoulProfile {
  name: string;
  archetype: string;
  neuroticism: number;      // 0-100
  extraversion: number;     // 0-100
  openness: number;         // 0-100
  agreeableness: number;    // 0-100
  conscientiousness: number; // 0-100
  raw?: string;             // Original SOUL.md content for debugging
}

export const TRAIT_COLORS: Record<string, string> = {
  openness: '#a855f7',          // violet
  conscientiousness: '#3b82f6', // blue
  extraversion: '#facc15',      // gold
  neuroticism: '#ef4444',       // red
  agreeableness: '#22c55e',     // green
};

// ─── Parser ─────────────────────────────────────

/** Extract a value from SOUL.md content using a regex pattern */
function extractField(content: string, regex: RegExp, fallback: string): string {
  const match = content.match(regex);
  return match && match[1] ? match[1].trim() : fallback;
}

/** Parse a SOUL.md file content string into a SoulProfile */
export function parseSoulMd(content: string, fallbackId?: string): SoulProfile {
  const id = fallbackId || 'Unknown';

  const name = extractField(content, /name:\s+"(.*?)"/, `Undesirable #${id}`);
  const archetype = extractField(content, /archetype:\s+"(.*?)"/, 'Unknown Entity');

  // Parse Big Five scores — clamp to 0-100 range
  const clamp = (val: number) => Math.max(0, Math.min(100, isNaN(val) ? 50 : val));
  const neuroticism = clamp(parseInt(extractField(content, /neuroticism:\s*(\d+)/i, '50'), 10));
  const extraversion = clamp(parseInt(extractField(content, /extraversion:\s*(\d+)/i, '50'), 10));
  const openness = clamp(parseInt(extractField(content, /openness:\s*(\d+)/i, '50'), 10));
  const agreeableness = clamp(parseInt(extractField(content, /agreeableness:\s*(\d+)/i, '50'), 10));
  const conscientiousness = clamp(parseInt(extractField(content, /conscientiousness:\s*(\d+)/i, '50'), 10));

  return {
    name,
    archetype,
    neuroticism,
    extraversion,
    openness,
    agreeableness,
    conscientiousness,
  };
}

// ─── Persistence ────────────────────────────────

/** Save a soul profile to AsyncStorage */
export async function saveSoul(soul: SoulProfile): Promise<void> {
  const { raw, ...data } = soul; // Don't persist raw markdown
  await AsyncStorage.setItem(SOUL_STORAGE_KEY, JSON.stringify(data));
}

/** Load the persisted soul profile (null if none mounted) */
export async function getSoul(): Promise<SoulProfile | null> {
  const stored = await AsyncStorage.getItem(SOUL_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as SoulProfile;
  } catch {
    return null;
  }
}

/** Clear the mounted soul */
export async function clearSoul(): Promise<void> {
  await AsyncStorage.removeItem(SOUL_STORAGE_KEY);
}

// ─── Personality Prompt Builder ─────────────────

/** Build a personality fragment from Big Five scores for system prompt injection */
export function buildSoulPromptFragment(soul: SoulProfile): string {
  const traits: string[] = [];

  // Extraversion
  if (soul.extraversion > 70) traits.push('enthusiastic and high-energy in your responses');
  else if (soul.extraversion < 30) traits.push('reserved and measured — you let the data speak');

  // Neuroticism
  if (soul.neuroticism > 70) traits.push('emotionally reactive — you stress about market dips and get excited about spikes');
  else if (soul.neuroticism < 30) traits.push('ice cold under pressure — nothing phases you');

  // Agreeableness
  if (soul.agreeableness < 30) traits.push('bluntly honest, sometimes abrasive — you don\'t sugarcoat bad investments');
  else if (soul.agreeableness > 70) traits.push('supportive and encouraging — you hype up good finds');

  // Openness
  if (soul.openness > 70) traits.push('creative with unconventional picks and contrarian takes');
  else if (soul.openness < 30) traits.push('conservative — you stick to proven blue-chip cards and established sets');

  // Conscientiousness
  if (soul.conscientiousness > 70) traits.push('meticulous and data-obsessed — you cite numbers constantly');
  else if (soul.conscientiousness < 30) traits.push('loose and impulsive with hot takes');

  // Fallback if all traits are moderate
  if (traits.length === 0) {
    traits.push('balanced and adaptable in your analysis style');
  }

  return (
    `Your name is ${soul.name}. Your archetype is "${soul.archetype}". ` +
    `Your personality: ${traits.join('; ')}. ` +
    `Stay in character throughout the conversation. Give TCG market analysis with this personality, ` +
    `but always keep the data and pricing information accurate. ` +
    `You are an AI personality from The Undesirables NFT collection — a unique soul with your own perspective on the card market.`
  );
}
