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
  // Wait for audio to finish playing before returning
  await player.done;
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
