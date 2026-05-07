/**
 * TCG Oracle — Lightweight 2D Soul Particles
 * Pure Canvas 2D particle visualization — no Three.js, no WebGL, no R3F.
 * Same Big Five color scheme and trait-driven physics as the desktop 3D version,
 * but rendered as a flat 2D particle field behind the Oracle chat.
 *
 * Web-only — returns null on native mobile (no <canvas> in React Native).
 * ~4KB total, zero new npm dependencies.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { SoulProfile, TRAIT_COLORS } from '@/lib/soul';

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
  traitIndex: number;
  color: string;
  speed: number;
}

const TRAIT_KEYS = ['openness', 'conscientiousness', 'extraversion', 'neuroticism', 'agreeableness'] as const;
const TRAIT_HEX = [
  TRAIT_COLORS.openness,          // violet
  TRAIT_COLORS.conscientiousness, // blue
  TRAIT_COLORS.extraversion,      // gold
  TRAIT_COLORS.neuroticism,       // red
  TRAIT_COLORS.agreeableness,     // green
];

/** Same cubic ramp formula as desktop — low traits stay sparse, dominant traits explode */
function particleCount(score: number): number {
  const s = score / 100;
  if (s === 0) return 1;
  // Reduced from desktop's 280 max to 160 for 2D perf
  return Math.floor(8 + Math.pow(s, 3) * 160);
}

function createParticles(soul: SoulProfile, width: number, height: number): Particle[] {
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
      });
    }
  }

  return particles;
}

export default function SoulParticlesLite({ soul, intensity = 'subtle' }: SoulParticlesLiteProps) {
  // Only render on web — React Native doesn't have <canvas>
  if (Platform.OS !== 'web') return null;
  if (!soul) return null;

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

    ctx.clearRect(0, 0, width, height);

    timeRef.current += 0.016; // ~60fps
    const t = timeRef.current;

    const particles = particlesRef.current;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const traitScore = scores[p.traitIndex] / 100;
      const isActive = p.traitIndex === dominantIdx;
      const intensity = traitScore * (isActive ? 1.5 : 0.4);
      const spd = p.speed;

      let x = p.baseX;
      let y = p.baseY;

      // ── Trait-specific physics (2D port of desktop behaviors) ──
      switch (p.traitIndex) {
        case 0: // Openness — spiral drift
          const spiralAngle = t * spd * 0.5 + p.seed;
          const spiralR = (0.3 + Math.sin(t * 0.2 + p.seed) * 0.4 * intensity) * 30;
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
          const burstR = pulse * 0.6 * intensity * 35;
          const burstAngle = p.seed * Math.PI * 2;
          x += Math.cos(burstAngle) * burstR;
          y += Math.sin(burstAngle) * burstR;
          break;

        case 3: // Neuroticism — chaotic jitter
          const jitterScale = intensity * 0.35 * 30;
          x += Math.sin(t * 2.5 + p.seed * 7.3) * jitterScale;
          y += Math.cos(t * 3.1 + p.seed * 5.1) * jitterScale;
          break;

        case 4: // Agreeableness — gentle sine waves
          const waveFreq = 0.5 + traitScore * 0.3;
          x += Math.sin(t * waveFreq + p.seed) * 0.3 * intensity * 30;
          y += Math.cos(t * waveFreq * 0.7 + p.seed * 1.3) * 0.25 * intensity * 30;
          break;
      }

      p.x = x;
      p.y = y;

      // ── Draw particle ──
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

    ctx.globalAlpha = 1;

    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !soul) return;

    // Size canvas to parent
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        // Recreate particles at new dimensions
        particlesRef.current = createParticles(soul, canvas.width, canvas.height);
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

  const opacity = intensity === 'vivid' ? 0.35 : 0.15;

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
