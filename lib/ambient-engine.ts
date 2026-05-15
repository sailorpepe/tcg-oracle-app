/**
 * TCG Oracle — Ambient Beat Engine
 * 
 * Zero-dependency procedural beat generator using vanilla Web Audio API.
 * Synthesizes kick, snare, hi-hat, bass, and chord stabs — never loops,
 * never repeats. All sounds are created from oscillators and noise buffers.
 * 
 * Soul-reactive: When an Undesirables SOUL.md is mounted, the beat shifts
 * based on Big Five personality traits:
 *   - High neuroticism   → faster BPM, minor key, harder kick
 *   - High extraversion   → brighter filter, louder, more fills
 *   - High openness       → unusual scales, syncopation, melody runs
 *   - High agreeableness  → softer attack, warmer filter, swing
 *   - High conscientiousness → tight timing, structured patterns
 * 
 * All synthesis happens on-device via AudioContext. No samples,
 * no network requests, no file I/O. ~0 bytes added to bundle.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoulProfile } from '@/lib/soul';

const STORAGE_KEY = '@tcg_oracle_ambient_enabled';

// ─── Musical Constants ───────────────────────────────

const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const PENTATONIC_MINOR = [0, 3, 5, 7, 10];
const DORIAN_MODE      = [0, 2, 3, 5, 7, 9, 10];

// Root note frequencies (octave 2 for bass, octave 3 for chords)
const ROOTS: Record<string, number> = {
  C: 65.41, D: 73.42, E: 82.41, F: 87.31,
  G: 98.00, A: 110.00, Bb: 116.54,
};

// ─── Engine State ────────────────────────────────────

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let filterNode: BiquadFilterNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let isPlaying = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let currentSoul: SoulProfile | null = null;
let currentStep = 0;
let nextStepTime = 0;

// ─── Beat Parameters ─────────────────────────────────

interface BeatParams {
  bpm: number;
  swing: number;            // 0-0.3 (shuffle amount)
  scale: number[];
  rootHz: number;
  volume: number;
  filterFreq: number;
  kickDecay: number;        // seconds
  kickPunch: number;        // frequency sweep amount
  snareFreq: number;        // noise filter center
  hatDecay: number;         // seconds
  bassOctave: number;       // 1 or 2
  chordChance: number;      // 0-1 probability per bar
  melodyChance: number;     // 0-1 probability per step
  fillChance: number;       // 0-1 probability of drum fills
  stepsPerBar: number;      // 16 = 16th notes
}

function soulToParams(soul: SoulProfile | null): BeatParams {
  const defaults: BeatParams = {
    bpm: 85,
    swing: 0.05,
    scale: PENTATONIC_MAJOR,
    rootHz: ROOTS.C,
    volume: 0.12,
    filterFreq: 3000,
    kickDecay: 0.3,
    kickPunch: 120,
    snareFreq: 4000,
    hatDecay: 0.05,
    bassOctave: 1,
    chordChance: 0.25,
    melodyChance: 0.15,
    fillChance: 0.08,
    stepsPerBar: 16,
  };

  if (!soul) return defaults;

  const p = { ...defaults };

  // ── Neuroticism: intensity ──
  const n = soul.neuroticism / 100;
  if (n > 0.6) {
    p.bpm = 95 + Math.round(n * 20);
    p.scale = PENTATONIC_MINOR;
    p.kickPunch = 180;
    p.kickDecay = 0.25;
    p.filterFreq = 2200;
    p.fillChance = 0.15;
  }

  // ── Extraversion: brightness ──
  const e = soul.extraversion / 100;
  if (e > 0.6) {
    p.filterFreq = Math.min(p.filterFreq + 1500, 5000);
    p.volume = 0.15;
    p.melodyChance = 0.25;
    p.chordChance = 0.35;
    p.bpm = Math.max(p.bpm, 90);
  } else if (e < 0.3) {
    p.filterFreq = Math.max(p.filterFreq - 800, 1500);
    p.volume = 0.08;
    p.melodyChance = 0.08;
  }

  // ── Openness: harmonic adventure ──
  const o = soul.openness / 100;
  if (o > 0.6) {
    p.scale = DORIAN_MODE;
    p.rootHz = ROOTS.D;
    p.melodyChance = 0.3;
    p.swing = 0.12;
  }

  // ── Agreeableness: warmth ──
  const a = soul.agreeableness / 100;
  if (a > 0.6) {
    p.swing = Math.min(p.swing + 0.1, 0.25);
    p.filterFreq = Math.max(p.filterFreq - 500, 1800);
    p.hatDecay = 0.08;
    p.kickDecay = 0.35;
  }

  // ── Conscientiousness: tightness ──
  const c = soul.conscientiousness / 100;
  if (c > 0.6) {
    p.swing = 0;
    p.fillChance = 0.03;
  } else if (c < 0.3) {
    p.swing = Math.min(p.swing + 0.08, 0.3);
    p.fillChance = 0.2;
  }

  return p;
}

// ─── Audio Infrastructure ────────────────────────────

function createNoiseBuffer(audioCtx: AudioContext): AudioBuffer {
  const length = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function initAudio(params: BeatParams): void {
  if (ctx) return;

  ctx = new AudioContext();

  // Compressor → tighter mix
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);

  // Master volume
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(compressor);

  // Low-pass filter (warmth)
  filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = params.filterFreq;
  filterNode.Q.value = 0.8;
  filterNode.connect(masterGain);

  // Pre-generate noise buffer
  noiseBuffer = createNoiseBuffer(ctx);
}

function semitoneToFreq(rootHz: number, semitone: number): number {
  return rootHz * Math.pow(2, semitone / 12);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Drum Synthesis ──────────────────────────────────

function playKick(time: number, params: BeatParams): void {
  if (!ctx || !filterNode) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  // Frequency sweep: start high, drop to sub bass
  osc.frequency.setValueAtTime(params.kickPunch + 50, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + params.kickDecay);

  // Volume envelope
  gain.gain.setValueAtTime(0.7, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + params.kickDecay + 0.1);

  osc.connect(gain);
  gain.connect(filterNode);

  osc.start(time);
  osc.stop(time + params.kickDecay + 0.15);
}

function playSnare(time: number, params: BeatParams): void {
  if (!ctx || !filterNode || !noiseBuffer) return;

  // Noise component (snare rattle)
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = params.snareFreq;
  noiseFilter.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(filterNode);

  // Tonal component (body)
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 180;
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.25, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

  osc.connect(oscGain);
  oscGain.connect(filterNode);

  noise.start(time);
  noise.stop(time + 0.2);
  osc.start(time);
  osc.stop(time + 0.12);
}

function playHat(time: number, params: BeatParams, open: boolean = false): void {
  if (!ctx || !filterNode || !noiseBuffer) return;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const hpFilter = ctx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 7000;

  const gain = ctx.createGain();
  const decay = open ? params.hatDecay * 4 : params.hatDecay;
  gain.gain.setValueAtTime(open ? 0.15 : 0.12, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

  noise.connect(hpFilter);
  hpFilter.connect(gain);
  gain.connect(filterNode);

  noise.start(time);
  noise.stop(time + decay + 0.05);
}

// ─── Melodic Synthesis ───────────────────────────────

function playBass(time: number, noteHz: number, duration: number): void {
  if (!ctx || !filterNode) return;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = noteHz;

  // Sub osc (one octave below for thickness)
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = noteHz / 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
  gain.gain.setValueAtTime(0.3, time + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  const subGain = ctx.createGain();
  subGain.gain.value = 0.15;

  osc.connect(gain);
  sub.connect(subGain);
  subGain.connect(gain);
  gain.connect(filterNode);

  osc.start(time);
  osc.stop(time + duration + 0.05);
  sub.start(time);
  sub.stop(time + duration + 0.05);
}

function playChordStab(time: number, rootHz: number, scale: number[], duration: number): void {
  if (!ctx || !filterNode) return;

  // Pick 3-4 notes from the scale in a higher octave
  const notes = [0, ...scale.slice(1)].sort(() => Math.random() - 0.5).slice(0, 3);

  notes.forEach((interval, i) => {
    const osc = ctx!.createOscillator();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = semitoneToFreq(rootHz * 4, interval); // Octave 4
    osc.detune.value = (Math.random() - 0.5) * 8; // Slight detuning

    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.06, time + 0.01);
    gain.gain.setValueAtTime(0.06, time + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(filterNode!);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  });
}

function playMelody(time: number, rootHz: number, scale: number[]): void {
  if (!ctx || !filterNode) return;

  const noteInterval = pick(scale);
  const octave = Math.random() > 0.5 ? 8 : 4; // Octave 4 or 5
  const freq = semitoneToFreq(rootHz * octave, noteInterval);
  const duration = 0.1 + Math.random() * 0.2;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.04, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  // Bandpass to soften the square wave
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 2;
  bp.Q.value = 2;

  osc.connect(bp);
  bp.connect(gain);
  gain.connect(filterNode);

  osc.start(time);
  osc.stop(time + duration + 0.05);
}

// ─── Sequencer ───────────────────────────────────────

function getStepTime(step: number, params: BeatParams): number {
  const secondsPerBeat = 60 / params.bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16th notes

  // Apply swing to off-beat 16ths (odd steps)
  const swingOffset = (step % 2 === 1) ? secondsPerStep * params.swing : 0;

  return secondsPerStep + swingOffset;
}

// Pattern: which steps trigger which drums
// Classic boom-bap pattern with variation
function scheduleStep(step: number, time: number, params: BeatParams): void {
  const bar = step % params.stepsPerBar;
  const isFillBar = Math.random() < params.fillChance;

  // ── Kick pattern ──
  // Standard: beats 1, 7, 10 (classic hip-hop)
  const kickPattern = [0, 6, 10];
  // Variation patterns
  const kickAlt = [0, 4, 10, 13];

  const activeKick = (step % 64 > 48) ? kickAlt : kickPattern;
  if (activeKick.includes(bar) || (isFillBar && bar % 4 === 0)) {
    playKick(time, params);
  }

  // ── Snare pattern ──
  // Standard: beats 4, 12 (backbeat)
  if (bar === 4 || bar === 12) {
    playSnare(time, params);
  }
  // Ghost snares (quiet, off-beat)
  if ((bar === 7 || bar === 15) && Math.random() < 0.3) {
    playSnare(time, { ...params, snareFreq: params.snareFreq + 1000 });
  }

  // ── Hi-hat pattern ──
  // Every other step (8th notes) with occasional 16th fills
  if (bar % 2 === 0) {
    playHat(time, params);
  } else if (Math.random() < 0.35) {
    // 16th note ghost hats
    playHat(time, params);
  }
  // Open hat on specific beats
  if ((bar === 2 || bar === 14) && Math.random() < 0.4) {
    playHat(time, params, true);
  }

  // ── Bass ──
  // Play on kick hits, hold for a few steps
  if (bar === 0 || bar === 10) {
    const noteInterval = pick(params.scale.slice(0, 3)); // Root-heavy
    const freq = semitoneToFreq(params.rootHz * params.bassOctave, noteInterval);
    const duration = getStepTime(0, params) * 4; // Hold 4 steps
    playBass(time, freq, duration);
  }

  // ── Chord stabs ──
  // Probabilistic, usually on off-beats
  if ((bar === 2 || bar === 8 || bar === 14) && Math.random() < params.chordChance) {
    const duration = getStepTime(0, params) * 3;
    playChordStab(time, params.rootHz, params.scale, duration);
  }

  // ── Melody ──
  if (Math.random() < params.melodyChance && bar % 4 !== 0) {
    playMelody(time, params.rootHz, params.scale);
  }
}

// Look-ahead scheduler (ensures sample-accurate timing)
const SCHEDULE_AHEAD = 0.1;  // seconds to look ahead
const SCHEDULER_INTERVAL = 25; // ms between scheduler calls

function runScheduler(): void {
  if (!ctx || !isPlaying) return;

  const params = soulToParams(currentSoul);

  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(currentStep, nextStepTime, params);
    nextStepTime += getStepTime(currentStep, params);
    currentStep++;
  }
}

// ─── Public API (same interface as before) ───────────

export async function startAmbient(soul?: SoulProfile | null): Promise<void> {
  if (isPlaying) return;
  if (typeof window === 'undefined') return;

  currentSoul = soul || null;
  const params = soulToParams(currentSoul);

  initAudio(params);

  if (ctx?.state === 'suspended') {
    await ctx.resume();
  }

  isPlaying = true;
  currentStep = 0;
  nextStepTime = ctx!.currentTime + 0.1; // Small initial delay

  // Fade in master gain
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(params.volume, ctx.currentTime + 1.5);
  }

  // Start the look-ahead scheduler
  schedulerInterval = setInterval(runScheduler, SCHEDULER_INTERVAL);

  await AsyncStorage.setItem(STORAGE_KEY, 'true');
}

export async function stopAmbient(): Promise<void> {
  isPlaying = false;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  // Fade out over 1.5 seconds
  if (masterGain && ctx) {
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  }

  // Close context after fade
  setTimeout(() => {
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      masterGain = null;
      filterNode = null;
      compressor = null;
      noiseBuffer = null;
    }
  }, 2000);

  await AsyncStorage.setItem(STORAGE_KEY, 'false');
}

export function updateSoul(soul: SoulProfile | null): void {
  currentSoul = soul;

  if (!isPlaying || !ctx || !filterNode || !masterGain) return;

  const params = soulToParams(soul);

  // Smoothly transition audio params
  const now = ctx.currentTime;
  filterNode.frequency.linearRampToValueAtTime(params.filterFreq, now + 2);
  masterGain.gain.linearRampToValueAtTime(params.volume, now + 2);

  // BPM change takes effect on next scheduled step automatically
  // since the scheduler re-derives params each call
}

export function isAmbientPlaying(): boolean {
  return isPlaying;
}

export async function wasAmbientEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored === 'true';
}

export async function toggleAmbient(soul?: SoulProfile | null): Promise<boolean> {
  if (isPlaying) {
    await stopAmbient();
    return false;
  } else {
    await startAmbient(soul);
    return true;
  }
}
