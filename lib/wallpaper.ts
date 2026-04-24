/**
 * TCG Oracle — Wallpaper & Border Effects
 * Lets users set a custom background image (photo, NFT, card)
 * with decorative border effects overlaid.
 * All data stored locally via AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const WALLPAPER_KEY = '@tcg_oracle_wallpaper';
const BORDER_KEY = '@tcg_oracle_border_effect';

export type BorderEffect =
  | 'none'
  | 'glow'
  | 'holographic'
  | 'neon'
  | 'frost'
  | 'ember'
  | 'vaporwave'
  | 'gold'
  | 'glitch'
  | 'shadow';

export interface BorderEffectMeta {
  id: BorderEffect;
  label: string;
  emoji: string;
  colors: string[];        // gradient colors for the border
  description: string;
}

export const BORDER_EFFECTS: BorderEffectMeta[] = [
  { id: 'none',        label: 'None',        emoji: '○',  colors: [],                                    description: 'No border effect' },
  { id: 'glow',        label: 'Glow',        emoji: '◉',  colors: ['#00d4ff', '#0066ff', '#00d4ff'],     description: 'Soft blue aura' },
  { id: 'holographic', label: 'Holo',        emoji: '◆',  colors: ['#ff6ec7', '#7873f5', '#4ccef9'],     description: 'Rainbow shimmer' },
  { id: 'neon',        label: 'Neon',        emoji: '▣',  colors: ['#ff00ff', '#00ffff', '#ff00ff'],     description: 'Electric neon glow' },
  { id: 'frost',       label: 'Frost',       emoji: '❄',  colors: ['#a8edea', '#fed6e3', '#a8edea'],     description: 'Icy crystalline edge' },
  { id: 'ember',       label: 'Ember',       emoji: '🔥', colors: ['#ff4500', '#ff8c00', '#ffd700'],     description: 'Molten fire ring' },
  { id: 'vaporwave',   label: 'Vapor',       emoji: '▲',  colors: ['#ff71ce', '#01cdfe', '#05ffa1'],     description: 'Retro aesthetic' },
  { id: 'gold',        label: 'Gold',        emoji: '★',  colors: ['#bf953f', '#fcf6ba', '#b38728'],     description: 'Premium gold leaf' },
  { id: 'glitch',      label: 'Glitch',      emoji: '⌇',  colors: ['#ff0000', '#00ff00', '#0000ff'],     description: 'Digital corruption' },
  { id: 'shadow',      label: 'Shadow',      emoji: '◐',  colors: ['#1a1a2e', '#16213e', '#0f3460'],     description: 'Deep dark vignette' },
];

export interface WallpaperState {
  uri: string | null;           // base64 data URI or file URI
  borderEffect: BorderEffect;
  opacity: number;              // 0.1 - 0.5 (so UI stays readable)
}

const DEFAULT_STATE: WallpaperState = {
  uri: null,
  borderEffect: 'none',
  opacity: 0.25,
};

export async function getWallpaper(): Promise<WallpaperState> {
  try {
    const raw = await AsyncStorage.getItem(WALLPAPER_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveWallpaper(state: Partial<WallpaperState>): Promise<WallpaperState> {
  const current = await getWallpaper();
  const merged = { ...current, ...state };
  await AsyncStorage.setItem(WALLPAPER_KEY, JSON.stringify(merged));
  return merged;
}

export async function clearWallpaper(): Promise<void> {
  await AsyncStorage.removeItem(WALLPAPER_KEY);
}
