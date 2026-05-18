/**
 * xAI Voice Service — Text-to-Speech via Grok's TTS API
 * 
 * BYOK (Bring Your Own Key) — users provide their own xAI API key.
 * Cost: ~$0.05/min of generated audio.
 * 
 * Supported voices: Eve, Ara, Rex, Sal, Leo
 * (mapped to UNDSR archetypes in voice_config)
 */

import { setSecureItem, getSecureItem, deleteSecureItem } from './secure-keys';
import { Platform } from 'react-native';

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';
const STORAGE_KEY = '@tcg_oracle_xai_key';

export type XAIVoice = 'eve' | 'ara' | 'rex' | 'sal' | 'leo';

export const XAI_VOICES: { id: XAIVoice; label: string; description: string }[] = [
  { id: 'eve',  label: 'Eve',  description: 'Expressive, default — The Oracle' },
  { id: 'ara',  label: 'Ara',  description: 'Warm, articulate — The Empath' },
  { id: 'rex',  label: 'Rex',  description: 'Bold, commanding — The Contrarian' },
  { id: 'sal',  label: 'Sal',  description: 'Smooth, balanced — The Stoic' },
  { id: 'leo',  label: 'Leo',  description: 'Energetic, upbeat — The Wildcard' },
];

export const DEFAULT_VOICE: XAIVoice = 'eve';

// ─── Key Management (SecureStore on native, localStorage on web) ───

export async function saveXAIKey(key: string): Promise<void> {
  await setSecureItem(STORAGE_KEY, key.trim());
}

export async function getXAIKey(): Promise<string | null> {
  return getSecureItem(STORAGE_KEY);
}

export async function removeXAIKey(): Promise<void> {
  await deleteSecureItem(STORAGE_KEY);
}

export async function hasXAIKey(): Promise<boolean> {
  const key = await getXAIKey();
  return !!key && key.length > 10;
}

// ─── TTS Synthesis ───

export interface TTSOptions {
  text: string;
  voice?: XAIVoice;
  speed?: number;         // 0.25 to 4.0, default 1.0
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

/**
 * Generate speech audio from text using xAI's Grok TTS API.
 * Returns a blob URL that can be played with <audio> or expo-av.
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<string> {
  const apiKey = await getXAIKey();
  if (!apiKey) {
    throw new Error('XAI_KEY_MISSING');
  }

  const { text, voice = DEFAULT_VOICE, speed = 1.0, responseFormat = 'mp3' } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('Empty text provided');
  }

  // Truncate to prevent excessive API costs (max ~4096 chars)
  const safeText = text.slice(0, 4096);

  const response = await fetch(XAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: safeText,
      voice_id: voice,
      language: 'en',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    if (response.status === 401) {
      throw new Error('XAI_KEY_INVALID');
    }
    if (response.status === 429) {
      throw new Error('XAI_RATE_LIMITED');
    }
    throw new Error(`xAI TTS failed (${response.status}): ${errorText}`);
  }

  const audioBlob = await response.blob();
  
  // On web, create a blob URL
  if (Platform.OS === 'web') {
    return URL.createObjectURL(audioBlob);
  }

  // On native, we'd need to write to a temp file for expo-av
  // For now, return blob URL (works in Tauri WebKit too)
  return URL.createObjectURL(audioBlob);
}

/**
 * Play TTS audio in the browser/Tauri.
 * Returns a cleanup function to stop playback.
 */
export function playAudioBlob(blobUrl: string): { stop: () => void; audio: HTMLAudioElement; done: Promise<void> } {
  const audio = new Audio(blobUrl);
  
  const done = new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Audio playback error: ${e}`));
    };
  });
  
  audio.play().catch(e => {
    console.warn('Audio playback failed:', e);
    URL.revokeObjectURL(blobUrl);
  });
  
  return {
    audio,
    done,
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(blobUrl);
    },
  };
}

/**
 * Convenience: synthesize + play in one call.
 * Returns cleanup function.
 */
export async function speakText(
  text: string,
  voice: XAIVoice = DEFAULT_VOICE,
): Promise<{ stop: () => void } | null> {
  const blobUrl = await synthesizeSpeech({ text, voice });
  const player = playAudioBlob(blobUrl);
  // Return immediately so the stop function is accessible during playback
  return player;
}

/**
 * Build a grading narration script from grade results.
 */
export function buildGradeNarration(gradeData: {
  cardName?: string;
  grade?: string;
  centering?: string;
  corners?: string;
  edges?: string;
  surface?: string;
  summary?: string;
}): string {
  const parts: string[] = [];

  if (gradeData.cardName) {
    parts.push(`Grading analysis for ${gradeData.cardName}.`);
  }

  if (gradeData.grade) {
    parts.push(`Predicted grade: ${gradeData.grade}.`);
  }

  const subs: string[] = [];
  if (gradeData.centering) subs.push(`Centering: ${gradeData.centering}`);
  if (gradeData.corners) subs.push(`Corners: ${gradeData.corners}`);
  if (gradeData.edges) subs.push(`Edges: ${gradeData.edges}`);
  if (gradeData.surface) subs.push(`Surface: ${gradeData.surface}`);
  
  if (subs.length > 0) {
    parts.push(`Sub-grades: ${subs.join('. ')}.`);
  }

  if (gradeData.summary) {
    parts.push(gradeData.summary);
  }

  return parts.join(' ');
}

// ─── Psychometric Verbal Engine (Local TTS) ───────────────────
// Ported from undesirables-ui/ChatInterface.js
// Uses Web Speech API with OCEAN personality → voice mapping.
// Each of the 4,444 souls gets a unique voice via psychometric hash.
// Free, offline, built into WebKit. No API key needed.

export interface OceanScores {
  neuroticism?: number;      // 0-100
  extraversion?: number;     // 0-100
  openness?: number;         // 0-100
  agreeableness?: number;    // 0-100
  conscientiousness?: number; // 0-100
}

// Novelty voices — assigned to low-agreeableness souls (contrarians, edgelords)
const NOVELTY_VOICES = new Set([
  'Zarvox', 'Trinoids', 'Bells', 'Bubbles', 'Cellos', 'Whisper',
  'Organ', 'Bad News', 'Good News', 'Bahh', 'Boing', 'Wobble',
  'Jester', 'Albert', 'Deranged', 'Hysterical',
]);

// Voices that sound too old/robotic — excluded from pool
const EXCLUDED_VOICES = new Set(['Fred', 'Ralph', 'Agnes']);

// Heartbeat ref to prevent WebKit 14-second speech cutoff
let ttsHeartbeat: ReturnType<typeof setInterval> | null = null;

/**
 * Sanitize text for TTS — strip code blocks, markdown, limit length.
 * Prevents AI from reading massive code blocks aloud.
 */
function sanitizeForTTS(text: string): string {
  let s = text;
  // Remove code blocks
  s = s.replace(/```[\s\S]*?(?:```|$)/g, ' [Code block processed.] ');
  // Remove JSON arrays/objects
  s = s.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, ' [Data processed.] ');
  // Cut off at first raw code line
  const codeIdx = s.search(/\n\s*(const |let |var |function |import |require\(|def |class )/);
  if (codeIdx > 0) s = s.substring(0, codeIdx) + ' [Analysis complete.]';
  // Limit length
  if (s.length > 800) s = s.substring(0, 800) + '... [Remaining data attached].';
  // Clean markdown symbols
  s = s.replace(/[#*`_[\]>]/g, '').trim();
  return s;
}

/**
 * Psychometric voice selection — deterministic hash from OCEAN scores
 * creates a unique voice for each of the 4,444 souls.
 *
 * Low agreeableness (<35) → novelty voices (Zarvox, Trinoids, etc.)
 * Everyone else → natural voices (Samantha, Daniel, Karen, etc.)
 */
function selectVoiceFromOCEAN(
  voices: SpeechSynthesisVoice[],
  soul: OceanScores,
): SpeechSynthesisVoice {
  const E = (soul.extraversion ?? 50) / 100;
  const N = (soul.neuroticism ?? 50) / 100;
  const C = (soul.conscientiousness ?? 50) / 100;
  const A = soul.agreeableness ?? 50;

  // Filter to English voices, excluding robotic ones
  const allEnglish = voices.filter(
    v => v.lang?.startsWith('en-') && !EXCLUDED_VOICES.has(v.name.split(' ')[0])
  );

  // Deduplicate by base name (macOS lists variants)
  const unique: SpeechSynthesisVoice[] = [];
  const seen = new Set<string>();
  for (const v of allEnglish) {
    const base = v.name.split(' ')[0];
    if (!seen.has(base)) { seen.add(base); unique.push(v); }
  }

  if (unique.length === 0) return voices[0]; // absolute fallback

  // Psychometric hash — deterministic per soul
  const psychHash = Math.abs(Math.floor((E + N * 2 + C) * 100));

  if (A < 35) {
    // Low agreeableness → novelty/weird voices
    const novelty = unique.filter(v => NOVELTY_VOICES.has(v.name.split(' ')[0]));
    if (novelty.length > 0) return novelty[psychHash % novelty.length];
  }

  // Normal: pick from natural voices
  const natural = unique.filter(v => !NOVELTY_VOICES.has(v.name.split(' ')[0]));
  const pool = natural.length > 0 ? natural : unique;
  return pool[psychHash % pool.length];
}

/**
 * Speak text using the Psychometric Verbal Engine.
 * Each soul gets a unique voice, pitch, rate, and volume based on OCEAN scores.
 * Includes the WebKit 14-second heartbeat fix from the desktop app.
 */
export function speakTextLocal(
  text: string,
  soul?: OceanScores | null,
): Promise<{ stop: () => void } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve(null);
      return;
    }

    const synth = window.speechSynthesis;

    // Stop any existing speech
    synth.cancel();
    if (ttsHeartbeat) { clearInterval(ttsHeartbeat); ttsHeartbeat = null; }

    const sanitized = sanitizeForTTS(text);
    if (!sanitized) { resolve(null); return; }

    const voices = synth.getVoices();
    if (!voices || voices.length === 0) { resolve(null); return; }

    const O = (soul?.openness ?? 50) / 100;
    const E = (soul?.extraversion ?? 50) / 100;

    // Select voice from psychometric hash
    const selectedVoice = soul
      ? selectVoiceFromOCEAN(voices, soul)
      : voices.find(v => v.name === 'Samantha') || voices.find(v => v.lang?.startsWith('en')) || voices[0];

    const utterance = new SpeechSynthesisUtterance(sanitized);
    utterance.voice = selectedVoice;

    // OCEAN → vocal parameters (matches desktop app exactly)
    utterance.pitch = Math.min(1.12, Math.max(0.90, 0.90 + (O * 0.22)));
    utterance.rate  = Math.min(1.10, Math.max(0.88, 0.88 + (E * 0.22)));
    utterance.volume = Math.min(1.0, Math.max(0.55, 0.65 + (O * 0.30)));

    const stopFn = {
      stop: () => {
        synth.cancel();
        if (ttsHeartbeat) { clearInterval(ttsHeartbeat); ttsHeartbeat = null; }
      },
    };

    // WebKit 14-second heartbeat — prevents speech from cutting off
    utterance.onstart = () => {
      if (ttsHeartbeat) clearInterval(ttsHeartbeat);
      ttsHeartbeat = setInterval(() => {
        if (synth.speaking) { synth.pause(); synth.resume(); }
      }, 10000);
    };

    utterance.onend = () => {
      if (ttsHeartbeat) { clearInterval(ttsHeartbeat); ttsHeartbeat = null; }
      resolve(stopFn);
    };
    utterance.onerror = () => {
      if (ttsHeartbeat) { clearInterval(ttsHeartbeat); ttsHeartbeat = null; }
      resolve(stopFn);
    };

    synth.speak(utterance);
  });
}

/**
 * Unified speak function: tries xAI TTS first, falls back to Psychometric Verbal Engine.
 * Always returns a stop function. Works for all users regardless of API key.
 */
export async function speakAny(
  text: string,
  voice: XAIVoice = DEFAULT_VOICE,
  soul?: OceanScores | null,
): Promise<{ stop: () => void } | null> {
  // Try xAI first if key exists
  const hasKey = await hasXAIKey();
  if (hasKey) {
    try {
      return await speakText(text, voice);
    } catch {
      // xAI failed — fall through to local
    }
  }

  // Fallback: Psychometric Verbal Engine with OCEAN personality mapping
  return speakTextLocal(text, soul);
}

// ─── Sentence-Level Streaming TTS ─────────────────────────────
// Accepts tokens one at a time during streaming. Detects sentence
// boundaries (., !, ?, newline) and immediately sends each completed
// sentence to TTS synthesis while the next sentence accumulates.
// A FIFO queue ensures sentences play in correct order.
// This reduces time-to-first-audio from ~8-15s to ~2-3s.

/**
 * Sentence boundary detector — splits streaming text into speakable chunks.
 * Handles abbreviations (Mr., Dr., U.S.) and decimal numbers ($12.50) to
 * avoid false splits.
 */
function detectSentenceBoundary(text: string): { sentence: string; remainder: string } | null {
  // Skip if too short to be a sentence
  if (text.length < 10) return null;

  // Look for sentence-ending punctuation followed by whitespace or end
  // Avoid splitting on: decimal numbers, common abbreviations, ellipses
  const match = text.match(
    /(?<![0-9])(?<!\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|Ave|Blvd|vs|etc|approx|est|i\.e|e\.g))([.!?])\s+(?=[A-Z\u2022\u25CF\-*])/
  );

  if (match && match.index !== undefined) {
    const splitAt = match.index + 1; // include the punctuation
    return {
      sentence: text.slice(0, splitAt).trim(),
      remainder: text.slice(splitAt).trim(),
    };
  }

  // Also split on newlines (markdown list items, paragraphs)
  const nlIdx = text.indexOf('\n');
  if (nlIdx > 15) {
    return {
      sentence: text.slice(0, nlIdx).trim(),
      remainder: text.slice(nlIdx + 1).trim(),
    };
  }

  return null;
}

export class SentenceStreamTTS {
  private buffer = '';
  private queue: string[] = [];
  private playing = false;
  private stopped = false;
  private voice: XAIVoice;
  private soul: OceanScores | null;
  private useXAI: boolean;
  private currentPlayer: { stop: () => void } | null = null;

  constructor(voice: XAIVoice = DEFAULT_VOICE, soul?: OceanScores | null, useXAI = false) {
    this.voice = voice;
    this.soul = soul || null;
    this.useXAI = useXAI;
  }

  /**
   * Feed a token from the streaming response.
   * Automatically detects sentence boundaries and queues for playback.
   */
  feed(token: string): void {
    if (this.stopped) return;
    this.buffer += token;

    // Check for sentence boundary
    let boundary = detectSentenceBoundary(this.buffer);
    while (boundary) {
      const cleaned = sanitizeForTTS(boundary.sentence);
      if (cleaned.length > 5) {
        this.queue.push(cleaned);
        this.processQueue(); // Start playing if not already
      }
      this.buffer = boundary.remainder;
      boundary = detectSentenceBoundary(this.buffer);
    }
  }

  /**
   * Signal that streaming is complete. Flushes any remaining buffered text.
   */
  flush(): void {
    if (this.stopped) return;
    const remaining = sanitizeForTTS(this.buffer.trim());
    if (remaining.length > 5) {
      this.queue.push(remaining);
      this.processQueue();
    }
    this.buffer = '';
  }

  /**
   * Stop all playback and clear the queue.
   */
  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.buffer = '';
    if (this.currentPlayer) {
      this.currentPlayer.stop();
      this.currentPlayer = null;
    }
    // Stop any web speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Process the sentence queue — plays sentences sequentially.
   */
  private async processQueue(): Promise<void> {
    if (this.playing || this.stopped || this.queue.length === 0) return;
    this.playing = true;

    while (this.queue.length > 0 && !this.stopped) {
      const sentence = this.queue.shift()!;
      try {
        if (this.useXAI) {
          // xAI TTS — high quality, costs money
          const blobUrl = await synthesizeSpeech({ text: sentence, voice: this.voice });
          if (this.stopped) { URL.revokeObjectURL(blobUrl); break; }
          const player = playAudioBlob(blobUrl);
          this.currentPlayer = player;
          await player.done;
          this.currentPlayer = null;
        } else {
          // Local Web Speech API — free, immediate
          const player = await speakTextLocal(sentence, this.soul);
          if (this.stopped) { player?.stop(); break; }
          this.currentPlayer = player;
          // Wait for utterance to complete before next sentence
          await new Promise<void>(resolve => {
            if (!player) { resolve(); return; }
            // speakTextLocal resolves its promise when speech ends
            // So we just need a small polling check
            const check = setInterval(() => {
              if (this.stopped || !window.speechSynthesis.speaking) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
          this.currentPlayer = null;
        }
      } catch (e) {
        console.warn('[SentenceStreamTTS] Sentence failed:', e);
        // Continue to next sentence on error
      }
    }

    this.playing = false;
  }
}
