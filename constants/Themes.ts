/**
 * TCG Oracle — Theme System
 * 5 switchable skins: Midnight, Ember, Frost, Undesirables, Light
 */

export type ThemeName = 'midnight' | 'ember' | 'frost' | 'undesirables' | 'light';

export interface ThemeColors {
  // Core
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceGlass: string;

  // Accent
  accent: string;
  accentMuted: string;
  accentDim: string;
  accentGlow: string;

  // Semantic
  positive: string;
  positiveMuted: string;
  negative: string;
  negativeMuted: string;
  warning: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  // Borders
  border: string;
  borderGlow: string;

  // Tab bar
  tabBar: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;

  // Gradients (top → bottom)
  gradientStart: string;
  gradientEnd: string;

  // Cards
  cardGlow: string;
  cardHighlight: string;

  // Status bar
  statusBar: 'light-content' | 'dark-content';
}

// ─────────────────────────────────────────────
// 🌙 MIDNIGHT — Cyberpunk green on black
// ─────────────────────────────────────────────
const midnight: ThemeColors = {
  background: '#07070d',
  surface: '#0f0f1a',
  surfaceElevated: '#161625',
  surfaceGlass: 'rgba(15, 15, 26, 0.85)',

  accent: '#39ff14',
  accentMuted: 'rgba(57, 255, 20, 0.15)',
  accentDim: 'rgba(57, 255, 20, 0.08)',
  accentGlow: 'rgba(57, 255, 20, 0.25)',

  positive: '#39ff14',
  positiveMuted: 'rgba(57, 255, 20, 0.15)',
  negative: '#ef4444',
  negativeMuted: 'rgba(239, 68, 68, 0.15)',
  warning: '#ffd700',

  textPrimary: '#e0e0e8',
  textSecondary: '#999',
  textMuted: '#666',
  textDim: '#444',

  border: 'rgba(255, 255, 255, 0.07)',
  borderGlow: 'rgba(57, 255, 20, 0.2)',

  tabBar: '#0a0a14',
  tabBarBorder: 'rgba(255, 255, 255, 0.06)',
  tabActive: '#39ff14',
  tabInactive: '#555',

  gradientStart: '#0f1a0f',
  gradientEnd: '#07070d',

  cardGlow: 'rgba(57, 255, 20, 0.06)',
  cardHighlight: 'rgba(57, 255, 20, 0.1)',

  statusBar: 'light-content',
};

// ─────────────────────────────────────────────
// 🔥 EMBER — Warm amber and burgundy
// ─────────────────────────────────────────────
const ember: ThemeColors = {
  background: '#120808',
  surface: '#1c0e0e',
  surfaceElevated: '#261414',
  surfaceGlass: 'rgba(28, 14, 14, 0.85)',

  accent: '#f97316',
  accentMuted: 'rgba(249, 115, 22, 0.15)',
  accentDim: 'rgba(249, 115, 22, 0.08)',
  accentGlow: 'rgba(249, 115, 22, 0.25)',

  positive: '#fbbf24',
  positiveMuted: 'rgba(251, 191, 36, 0.15)',
  negative: '#ef4444',
  negativeMuted: 'rgba(239, 68, 68, 0.15)',
  warning: '#fbbf24',

  textPrimary: '#f0e0d0',
  textSecondary: '#a08070',
  textMuted: '#705040',
  textDim: '#503020',

  border: 'rgba(249, 115, 22, 0.1)',
  borderGlow: 'rgba(249, 115, 22, 0.25)',

  tabBar: '#100606',
  tabBarBorder: 'rgba(249, 115, 22, 0.08)',
  tabActive: '#f97316',
  tabInactive: '#604030',

  gradientStart: '#1a0c06',
  gradientEnd: '#120808',

  cardGlow: 'rgba(249, 115, 22, 0.06)',
  cardHighlight: 'rgba(249, 115, 22, 0.12)',

  statusBar: 'light-content',
};

// ─────────────────────────────────────────────
// 🧊 FROST — Cool blue and ice
// ─────────────────────────────────────────────
const frost: ThemeColors = {
  background: '#080c14',
  surface: '#0c1220',
  surfaceElevated: '#121a2e',
  surfaceGlass: 'rgba(12, 18, 32, 0.85)',

  accent: '#00e5ff',
  accentMuted: 'rgba(0, 229, 255, 0.15)',
  accentDim: 'rgba(0, 229, 255, 0.08)',
  accentGlow: 'rgba(0, 229, 255, 0.25)',

  positive: '#38bdf8',
  positiveMuted: 'rgba(56, 189, 248, 0.15)',
  negative: '#f87171',
  negativeMuted: 'rgba(248, 113, 113, 0.15)',
  warning: '#fbbf24',

  textPrimary: '#e0eaf0',
  textSecondary: '#7090a8',
  textMuted: '#405060',
  textDim: '#2a3540',

  border: 'rgba(0, 229, 255, 0.08)',
  borderGlow: 'rgba(0, 229, 255, 0.2)',

  tabBar: '#060a12',
  tabBarBorder: 'rgba(0, 229, 255, 0.06)',
  tabActive: '#00e5ff',
  tabInactive: '#405060',

  gradientStart: '#0a1020',
  gradientEnd: '#080c14',

  cardGlow: 'rgba(0, 229, 255, 0.06)',
  cardHighlight: 'rgba(0, 229, 255, 0.1)',

  statusBar: 'light-content',
};

// ─────────────────────────────────────────────
// 🍄 UNDESIRABLES — Brand theme (neon green + purple)
// ─────────────────────────────────────────────
const undesirables: ThemeColors = {
  background: '#0a0a0f',
  surface: '#12121e',
  surfaceElevated: '#1a1a2e',
  surfaceGlass: 'rgba(18, 18, 30, 0.85)',

  accent: '#39ff14',
  accentMuted: 'rgba(57, 255, 20, 0.15)',
  accentDim: 'rgba(57, 255, 20, 0.08)',
  accentGlow: 'rgba(168, 85, 247, 0.25)',

  positive: '#39ff14',
  positiveMuted: 'rgba(57, 255, 20, 0.15)',
  negative: '#ef4444',
  negativeMuted: 'rgba(239, 68, 68, 0.15)',
  warning: '#a855f7',

  textPrimary: '#e0e0f0',
  textSecondary: '#8888aa',
  textMuted: '#555577',
  textDim: '#333355',

  border: 'rgba(168, 85, 247, 0.12)',
  borderGlow: 'rgba(168, 85, 247, 0.25)',

  tabBar: '#08080e',
  tabBarBorder: 'rgba(168, 85, 247, 0.1)',
  tabActive: '#a855f7',
  tabInactive: '#444466',

  gradientStart: '#0f0a1a',
  gradientEnd: '#0a0a0f',

  cardGlow: 'rgba(168, 85, 247, 0.08)',
  cardHighlight: 'rgba(168, 85, 247, 0.12)',

  statusBar: 'light-content',
};

// ─────────────────────────────────────────────
// ☀️ LIGHT — Clean white for daytime
// ─────────────────────────────────────────────
const light: ThemeColors = {
  background: '#f5f5f7',
  surface: '#ffffff',
  surfaceElevated: '#f0f0f2',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',

  accent: '#1a73e8',
  accentMuted: 'rgba(26, 115, 232, 0.1)',
  accentDim: 'rgba(26, 115, 232, 0.05)',
  accentGlow: 'rgba(26, 115, 232, 0.15)',

  positive: '#16a34a',
  positiveMuted: 'rgba(22, 163, 74, 0.1)',
  negative: '#dc2626',
  negativeMuted: 'rgba(220, 38, 38, 0.1)',
  warning: '#d97706',

  textPrimary: '#1a1a1a',
  textSecondary: '#555',
  textMuted: '#999',
  textDim: '#ccc',

  border: 'rgba(0, 0, 0, 0.08)',
  borderGlow: 'rgba(26, 115, 232, 0.15)',

  tabBar: '#ffffff',
  tabBarBorder: 'rgba(0, 0, 0, 0.06)',
  tabActive: '#1a73e8',
  tabInactive: '#999',

  gradientStart: '#eef2ff',
  gradientEnd: '#f5f5f7',

  cardGlow: 'rgba(26, 115, 232, 0.04)',
  cardHighlight: 'rgba(26, 115, 232, 0.08)',

  statusBar: 'dark-content',
};

// ─────────────────────────────────────────────
// Theme registry
// ─────────────────────────────────────────────
export const themes: Record<ThemeName, ThemeColors> = {
  midnight,
  ember,
  frost,
  undesirables,
  light,
};

export const themeMetadata: Record<ThemeName, { label: string; emoji: string; description: string }> = {
  midnight: { label: 'Midnight', emoji: '🌙', description: 'Cyberpunk green on black' },
  ember: { label: 'Ember', emoji: '🔥', description: 'Warm amber and burgundy' },
  frost: { label: 'Frost', emoji: '🧊', description: 'Cool blue and ice' },
  undesirables: { label: 'Undesirables', emoji: '🍄', description: 'Neon green + purple' },
  light: { label: 'Light', emoji: '☀️', description: 'Clean white for daytime' },
};

export const defaultTheme: ThemeName = 'midnight';
