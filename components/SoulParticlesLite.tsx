/**
 * TCG Oracle — Ambient Particle System
 * Pure Canvas 2D particle visualization — no Three.js, no WebGL, no R3F.
 *
 * TWO MODES:
 * 1. Default (no Soul): Soft, monochrome ambient particles that drift
 *    gently — available to all users for free. Uses theme accent color.
 * 2. Soul-reactive (Soul mounted): Full Big Five color scheme with
 *    trait-driven physics ported from the desktop 3D version. Available
 *    to Undesirables holders who drag-and-drop their SOUL.md workspace.
 *
 * Web-only — returns null on native mobile (no <canvas> in React Native).
 * ~5KB total, zero new npm dependencies.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { SoulProfile, TRAIT_COLORS } from '@/lib/soul';
import { useTheme } from '@/lib/ThemeContext';

interface SoulParticlesLiteProps {
  soul: SoulProfile | null;
  /** Lower opacity during active chat, higher in empty state */
  intensity?: 'subtle' | 'vivid';
}

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  seed: number;
  traitIndex: number;  // 0-4 for soul mode, -1 for ambient mode
  color: string;
  speed: number;
  size: number;
}

const TRAIT_KEYS = ['openness', 'conscientiousness', 'extraversion', 'neuroticism', 'agreeableness'] as const;
const TRAIT_HEX = [
  TRAIT_COLORS.openness,          // violet
  TRAIT_COLORS.conscientiousness, // blue
  TRAIT_COLORS.extraversion,      // gold
  TRAIT_COLORS.neuroticism,       // red
  TRAIT_COLORS.agreeableness,     // green
];

// ─── Default ambient palette (no Soul) ──────────
// Use solid hex colors — alpha is controlled per-particle in the render loop
const AMBIENT_COLORS = [
  '#ffffff',   // white
  '#78c8ff',   // ice blue
  '#b4a0ff',   // pale lavender
  '#64dcc8',   // seafoam
  '#c8c8dc',   // silver
];

const AMBIENT_PARTICLE_COUNT = 90;

/** Same cubic ramp formula as desktop — low traits stay sparse, dominant traits explode */
function particleCount(score: number): number {
  const s = score / 100;
  if (s === 0) return 1;
  // Reduced from desktop's 280 max to 160 for 2D perf
  return Math.floor(8 + Math.pow(s, 3) * 160);
}

// ─── Particle Creation ──────────────────────────

function createAmbientParticles(width: number, height: number): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;

    particles.push({
      x,
      y,
      baseX: x,
      baseY: y,
      seed: Math.random() * 1000,
      traitIndex: -1, // ambient mode
      color: AMBIENT_COLORS[Math.floor(Math.random() * AMBIENT_COLORS.length)],
      speed: 0.08 + Math.random() * 0.12,
      size: 1.5 + Math.random() * 2.5,
    });
  }

  return particles;
}

function createSoulParticles(soul: SoulProfile, width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  const scores = [soul.openness, soul.conscientiousness, soul.extraversion, soul.neuroticism, soul.agreeableness];

  for (let t = 0; t < 5; t++) {
    const count = particleCount(scores[t]);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        seed: Math.random() * 1000,
        traitIndex: t,
        color: TRAIT_HEX[t],
        speed: 0.15 + (scores[t] / 100) * 0.3,
        size: 1.5,
      });
    }
  }

  return particles;
}

// ─── Component ──────────────────────────────────

export default function SoulParticlesLite({ soul, intensity = 'subtle' }: SoulParticlesLiteProps) {
  // Only render on web — React Native doesn't have <canvas>
  if (Platform.OS !== 'web') return null;

  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const soulRef = useRef(soul);

  // Keep soul ref updated without re-creating particles
  useEffect(() => {
    soulRef.current = soul;
  }, [soul]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const s = soulRef.current;

    ctx.clearRect(0, 0, width, height);

    timeRef.current += 0.016; // ~60fps
    const t = timeRef.current;

    const particles = particlesRef.current;

    if (s) {
      // ─── SOUL MODE: trait-driven physics ───
      const scores = [s.openness, s.conscientiousness, s.extraversion, s.neuroticism, s.agreeableness];

      // Find dominant trait
      let maxScore = 0;
      let dominantIdx = 0;
      for (let i = 0; i < 5; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i];
          dominantIdx = i;
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.traitIndex < 0) continue; // skip any ambient stragglers

        const traitScore = scores[p.traitIndex] / 100;
        const isActive = p.traitIndex === dominantIdx;
        const intensityMul = traitScore * (isActive ? 1.5 : 0.4);
        const spd = p.speed;

        let x = p.baseX;
        let y = p.baseY;

        // ── Trait-specific physics (2D port of desktop behaviors) ──
        switch (p.traitIndex) {
          case 0: // Openness — spiral drift
            const spiralAngle = t * spd * 0.5 + p.seed;
            const spiralR = (0.3 + Math.sin(t * 0.2 + p.seed) * 0.4 * intensityMul) * 30;
            x += Math.cos(spiralAngle) * spiralR;
            y += Math.sin(spiralAngle) * spiralR;
            break;

          case 1: // Conscientiousness — tight orbital rings
            const orbitAngle = t * spd * 0.4 + p.seed;
            const orbitR = (0.2 + traitScore * 0.3) * 25;
            x += Math.cos(orbitAngle) * orbitR;
            y += Math.sin(orbitAngle) * orbitR;
            break;

          case 2: // Extraversion — radial pulse bursts
            const pulse = Math.abs(Math.sin(t * spd * 1.2 + p.seed));
            const burstR = pulse * 0.6 * intensityMul * 35;
            const burstAngle = p.seed * Math.PI * 2;
            x += Math.cos(burstAngle) * burstR;
            y += Math.sin(burstAngle) * burstR;
            break;

          case 3: // Neuroticism — chaotic jitter
            const jitterScale = intensityMul * 0.35 * 30;
            x += Math.sin(t * 2.5 + p.seed * 7.3) * jitterScale;
            y += Math.cos(t * 3.1 + p.seed * 5.1) * jitterScale;
            break;

          case 4: // Agreeableness — gentle sine waves
            const waveFreq = 0.5 + traitScore * 0.3;
            x += Math.sin(t * waveFreq + p.seed) * 0.3 * intensityMul * 30;
            y += Math.cos(t * waveFreq * 0.7 + p.seed * 1.3) * 0.25 * intensityMul * 30;
            break;
        }

        p.x = x;
        p.y = y;

        // ── Draw soul particle ──
        const brightness = isActive
          ? 0.7 + Math.sin(t * 3 + p.seed) * 0.2
          : 0.35 + Math.sin(t * 0.5 + p.seed) * 0.1;

        ctx.globalAlpha = brightness;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 2.0 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle core glow at center
      const cx = width / 2;
      const cy = height / 2;
      const glowRadius = Math.min(width, height) * 0.15;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glow.addColorStop(0, TRAIT_HEX[dominantIdx] + '15'); // very faint center
      glow.addColorStop(1, TRAIT_HEX[dominantIdx] + '00'); // transparent edge
      ctx.globalAlpha = 0.6 + Math.sin(t * 0.5) * 0.1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ─── AMBIENT MODE: soft, universal particles ───
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const spd = p.speed;

        // Gentle, organic drift — combination of slow sine waves at different frequencies
        p.x = p.baseX + Math.sin(t * spd * 0.3 + p.seed) * 40
                       + Math.sin(t * spd * 0.13 + p.seed * 3.7) * 20;
        p.y = p.baseY + Math.cos(t * spd * 0.25 + p.seed * 1.3) * 30
                       + Math.cos(t * spd * 0.11 + p.seed * 2.1) * 15;

        // Wrap around edges
        if (p.x < -10) p.baseX += width + 20;
        if (p.x > width + 10) p.baseX -= width + 20;
        if (p.y < -10) p.baseY += height + 20;
        if (p.y > height + 10) p.baseY -= height + 20;

        // Breathing alpha — visible range
        const alpha = 0.3 + Math.sin(t * 0.4 + p.seed * 2) * 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Soft glow halo around each particle
        ctx.globalAlpha = alpha * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft ambient glow at center
      const cx = width / 2;
      const cy = height / 2;
      const glowRadius = Math.min(width, height) * 0.25;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glow.addColorStop(0, 'rgba(120, 200, 255, 0.08)');
      glow.addColorStop(0.5, 'rgba(180, 160, 255, 0.03)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0.00)');
      ctx.globalAlpha = 0.6 + Math.sin(t * 0.3) * 0.1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to parent
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        // Create appropriate particles
        particlesRef.current = soul
          ? createSoulParticles(soul, canvas.width, canvas.height)
          : createAmbientParticles(canvas.width, canvas.height);
      }
    };

    resize();

    // Start animation
    animRef.current = requestAnimationFrame(animate);

    // Observe parent size changes
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, [soul, animate]);

  // Container opacity — particles control their own alpha in the render loop
  // so container just needs to be high enough to not squash everything
  const opacity = intensity === 'vivid' ? 0.9 : 0.7;

  return (
    <View style={[styles.container, { opacity }]} pointerEvents="none">
      {/* @ts-ignore — canvas is web-only, RN types don't know about it */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
