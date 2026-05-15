/**
 * TCG Oracle — Soul Avatar
 * 
 * Generates a unique geometric identity from OCEAN personality traits.
 * Each trait controls a visual dimension:
 * 
 *   O (Openness)          → Shape variety (circles vs squares vs triangles)
 *   C (Conscientiousness)  → Grid symmetry & regularity
 *   E (Extraversion)       → Fill density & brightness
 *   A (Agreeableness)      → Rounded corners & warm tones
 *   N (Neuroticism)        → Jagged edges, contrast, fragmentation
 *
 * Same soul = same avatar, every time (deterministic via name hash).
 * No external dependencies — pure SVG generation.
 * 
 * When no Soul is mounted, renders a default Oracle glyph.
 */

import React, { useMemo } from 'react';
import { View, Platform } from 'react-native';
import { SoulProfile, TRAIT_COLORS } from '@/lib/soul';

interface SoulAvatarProps {
  soul: SoulProfile | null;
  size?: number;
}

// ─── Deterministic hash from string ─────────────

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

/** Seeded pseudo-random number generator (deterministic) */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Color utilities ────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend two hex colors by ratio (0 = color1, 1 = color2) */
function blendColors(hex1: string, hex2: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    r1 + (r2 - r1) * ratio,
    g1 + (g2 - g1) * ratio,
    b1 + (b2 - b1) * ratio,
  );
}

// ─── SVG Generation ─────────────────────────────

const TRAIT_KEYS = ['openness', 'conscientiousness', 'extraversion', 'neuroticism', 'agreeableness'] as const;

function generateSoulSvg(soul: SoulProfile, size: number): string {
  const hash = hashString(soul.name + soul.archetype);
  const rand = seededRandom(hash);

  const scores = {
    o: soul.openness / 100,
    c: soul.conscientiousness / 100,
    e: soul.extraversion / 100,
    a: soul.agreeableness / 100,
    n: soul.neuroticism / 100,
  };

  // Grid size: conscientiousness drives precision (3-7)
  const gridSize = 3 + Math.round(scores.c * 4);
  const cellSize = size / gridSize;
  const padding = size * 0.08;
  const innerSize = size - padding * 2;
  const innerCellSize = innerSize / gridSize;

  // Find dominant trait for primary color
  const traitScores = [scores.o, scores.c, scores.e, scores.n, scores.a];
  const traitHexes = [
    TRAIT_COLORS.openness,
    TRAIT_COLORS.conscientiousness,
    TRAIT_COLORS.extraversion,
    TRAIT_COLORS.neuroticism,
    TRAIT_COLORS.agreeableness,
  ];

  let maxIdx = 0;
  for (let i = 1; i < 5; i++) {
    if (traitScores[i] > traitScores[maxIdx]) maxIdx = i;
  }
  const primaryColor = traitHexes[maxIdx];

  // Secondary: second highest trait
  let secondIdx = maxIdx === 0 ? 1 : 0;
  for (let i = 0; i < 5; i++) {
    if (i !== maxIdx && traitScores[i] > traitScores[secondIdx]) secondIdx = i;
  }
  const secondaryColor = traitHexes[secondIdx];

  // Background: dark, slightly tinted by dominant trait
  const bgColor = blendColors('#0a0a14', primaryColor, 0.08);

  let shapes = '';

  // ── Generate grid cells ──
  const halfGrid = Math.ceil(gridSize / 2);
  const isSymmetric = scores.c > 0.4; // High conscientiousness = symmetric

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < (isSymmetric ? halfGrid : gridSize); col++) {
      // Fill probability: extraversion drives density
      const fillProb = 0.2 + scores.e * 0.5;
      if (rand() > fillProb) continue;

      // Pick color based on position + traits
      const colorRatio = rand();
      let cellColor: string;
      if (colorRatio < 0.6) {
        cellColor = primaryColor;
      } else if (colorRatio < 0.85) {
        cellColor = secondaryColor;
      } else {
        cellColor = blendColors(primaryColor, secondaryColor, rand());
      }

      // Opacity: neuroticism adds contrast variation
      const alpha = 0.4 + scores.e * 0.4 + (scores.n > 0.5 ? (rand() - 0.5) * 0.3 : 0);

      const x = padding + col * innerCellSize;
      const y = padding + row * innerCellSize;
      const s = innerCellSize * 0.85;
      const offset = innerCellSize * 0.075;

      // Shape selection: openness drives variety
      const shapeRoll = rand();
      let shape: string;

      if (scores.o > 0.6 && shapeRoll < 0.3) {
        // Triangle (high openness = more exotic shapes)
        const cx = x + offset + s / 2;
        const ty = y + offset;
        const bl = x + offset;
        const br = x + offset + s;
        const by = y + offset + s;
        shape = `<polygon points="${cx},${ty} ${bl},${by} ${br},${by}" fill="${cellColor}" opacity="${alpha.toFixed(2)}"/>`;
      } else if (scores.o > 0.4 && shapeRoll < 0.5) {
        // Circle
        const cx = x + offset + s / 2;
        const cy = y + offset + s / 2;
        const r = s / 2;
        shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cellColor}" opacity="${alpha.toFixed(2)}"/>`;
      } else if (scores.a > 0.6) {
        // Rounded rect (high agreeableness = soft shapes)
        const rx = s * 0.25;
        shape = `<rect x="${x + offset}" y="${y + offset}" width="${s}" height="${s}" rx="${rx}" fill="${cellColor}" opacity="${alpha.toFixed(2)}"/>`;
      } else {
        // Sharp rect (default)
        shape = `<rect x="${x + offset}" y="${y + offset}" width="${s}" height="${s}" fill="${cellColor}" opacity="${alpha.toFixed(2)}"/>`;
      }

      shapes += shape;

      // Mirror for symmetric avatars
      if (isSymmetric && col !== gridSize - 1 - col) {
        const mirrorCol = gridSize - 1 - col;
        const mx = padding + mirrorCol * innerCellSize;
        // Replace x coordinates in the shape
        shape = shape.replace(
          new RegExp(`x="${(x + offset).toFixed()}"`, 'g'),
          `x="${(mx + offset).toFixed()}"`
        );
        // For circles
        shape = shape.replace(
          new RegExp(`cx="${(x + offset + s / 2).toFixed()}"`, 'g'),
          `cx="${(mx + offset + s / 2).toFixed()}"`
        );
        // For triangles — rebuild mirrored
        if (shape.includes('polygon')) {
          const mcx = mx + offset + s / 2;
          const mty = y + offset;
          const mbl = mx + offset;
          const mbr = mx + offset + s;
          const mby = y + offset + s;
          shape = `<polygon points="${mcx},${mty} ${mbl},${mby} ${mbr},${mby}" fill="${cellColor}" opacity="${alpha.toFixed(2)}"/>`;
        }
        shapes += shape;
      }
    }
  }

  // ── Neuroticism: add chaotic accent lines ──
  if (scores.n > 0.5) {
    const lineCount = Math.floor(scores.n * 4);
    for (let i = 0; i < lineCount; i++) {
      const x1 = padding + rand() * innerSize;
      const y1 = padding + rand() * innerSize;
      const x2 = padding + rand() * innerSize;
      const y2 = padding + rand() * innerSize;
      shapes += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${TRAIT_COLORS.neuroticism}" stroke-width="0.5" opacity="0.2"/>`;
    }
  }

  // ── Center glyph: dominant trait symbol ──
  const cx = size / 2;
  const cy = size / 2;
  const glyphSize = size * 0.18;

  // Subtle glow behind center
  shapes += `<circle cx="${cx}" cy="${cy}" r="${glyphSize * 1.5}" fill="${primaryColor}" opacity="0.08"/>`;
  shapes += `<circle cx="${cx}" cy="${cy}" r="${glyphSize}" fill="${primaryColor}" opacity="0.15"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${bgColor}"/>
    ${shapes}
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="none" stroke="${primaryColor}" stroke-width="1" opacity="0.3"/>
  </svg>`;
}

// ─── Default Oracle avatar (no Soul) ────────────

function generateDefaultSvg(size: number): string {
  const c = size / 2;
  const r = size * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#0f0f1a"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#4a7dff" stroke-width="1.5" opacity="0.5"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.6}" fill="none" stroke="#4a7dff" stroke-width="1" opacity="0.3"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.2}" fill="#4a7dff" opacity="0.6"/>
    <line x1="${c - r * 0.7}" y1="${c}" x2="${c + r * 0.7}" y2="${c}" stroke="#4a7dff" stroke-width="0.8" opacity="0.2"/>
    <line x1="${c}" y1="${c - r * 0.7}" x2="${c}" y2="${c + r * 0.7}" stroke="#4a7dff" stroke-width="0.8" opacity="0.2"/>
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="none" stroke="#4a7dff" stroke-width="1" opacity="0.15"/>
  </svg>`;
}

// ─── Component ──────────────────────────────────

export default function SoulAvatar({ soul, size = 32 }: SoulAvatarProps) {
  if (Platform.OS !== 'web') return null;

  const svgString = useMemo(() => {
    return soul ? generateSoulSvg(soul, size) : generateDefaultSvg(size);
  }, [soul?.name, soul?.archetype, size]);

  const dataUri = `data:image/svg+xml;base64,${btoa(svgString)}`;

  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.15, overflow: 'hidden' }}>
      {/* @ts-ignore — img is web-only */}
      <img
        src={dataUri}
        width={size}
        height={size}
        alt={soul ? `${soul.name} avatar` : 'Oracle avatar'}
        style={{ display: 'block' }}
      />
    </View>
  );
}
