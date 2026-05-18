/**
 * TCG Oracle — Context Builder
 * Builds the system prompt with the user's Vault data injected.
 * Optionally injects Soul personality when an Undesirables SOUL.md is mounted.
 * Injects chat memory summaries and prediction stats for continuity.
 * Injects temporal awareness (clock, session, market timing) — all ephemeral.
 * All data is sanitized before injection.
 */

import { getVault } from '@/lib/vault';
import { Card } from '@/lib/api';
import { SoulProfile, buildSoulPromptFragment } from '@/lib/soul';
import { getSessionSummaries } from '@/lib/chat-memory';
import { getPredictionStats } from '@/lib/prediction-ledger';

const MAX_CONTEXT_CARDS = 20;

/** Optional session metadata — passed from oracle.tsx, lives in memory only */
export interface SessionMeta {
  startedAt: number;      // Date.now() when chat tab opened
  messageCount: number;   // total messages this session
}

// ── Temporal Awareness (Layers 1-3) ─────────────────────────
// All ephemeral — derived from Date.now(), nothing stored to disk.

/** Layer 1: Full clock injection — date, time, timezone */
function getClockContext(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Current date: ${date}. Current time: ${time} (${tz}).`;
}

/** Layer 2: Session duration — how long the user has been chatting */
function getSessionContext(meta?: SessionMeta): string {
  if (!meta) return '';
  const elapsed = Math.round((Date.now() - meta.startedAt) / 60000);
  if (elapsed < 2) return ''; // Don't mention if just started
  return ` Session: ${elapsed} min, ${meta.messageCount} messages.`;
}

/** Layer 3: Market timing — TCGCSV freshness, eBay activity, day patterns */
function getMarketTimingContext(): string {
  const now = new Date();
  const hour = now.getHours();
  const utcHour = now.getUTCHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const parts: string[] = [];

  // TCGCSV refreshes daily at ~20:00 UTC (3 PM CDT)
  if (utcHour >= 20) {
    parts.push('TCG prices refreshed today (current).');
  } else if (utcHour >= 18) {
    const mins = (20 - utcHour) * 60 - now.getUTCMinutes();
    parts.push(`TCG prices refresh in ~${mins}min.`);
  } else {
    parts.push('TCG prices are from yesterday.');
  }

  // eBay activity windows
  if (hour >= 23 || hour < 7) {
    parts.push('eBay activity: LOW (overnight).');
  } else if (hour >= 10 && hour <= 14) {
    parts.push('eBay activity: HIGH (peak selling).');
  } else if (hour >= 18 && hour <= 22) {
    parts.push('eBay activity: MODERATE (evening browsing).');
  }

  // Day-of-week
  if (day === 0 || day === 6) parts.push('Weekend: more casual buyers.');
  else if (day === 1) parts.push('Monday: post-weekend corrections common.');
  else if (day === 5) parts.push('Friday: pre-weekend listing surge.');

  return parts.length > 0 ? ` MARKET: ${parts.join(' ')}` : '';
}

/** Sanitize card data to prevent prompt injection */
function sanitize(text: string): string {
  return text
    .substring(0, 200)                      // hard length cap FIRST (prevents ReDoS)
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')  // strip control characters
    .replace(/<[^>]*>/g, '')                // strip HTML tags
    .replace(/[<>"'`]/g, '');               // strip dangerous chars
}

function formatCard(card: Card): string {
  const parts = [
    `- ${sanitize(card.name)}`,
    card.game ? `(${card.game})` : '',
    card.set ? `[${sanitize(card.set)}]` : '',
    card.rarity ? `${card.rarity}` : '',
    card.price ? `$${card.price.toFixed(2)}` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

export async function buildSystemPrompt(
  soul?: SoulProfile | null,
  sessionMeta?: SessionMeta,
): Promise<string> {
  // Gather all context data in parallel
  const [vault, summaries, predStats] = await Promise.all([
    getVault(),
    getSessionSummaries(),
    getPredictionStats(),
  ]);

  const totalValue = vault.reduce((sum, c) => sum + (c.price || 0), 0);

  let vaultContext = '';
  if (vault.length > 0) {
    const displayCards = vault.slice(0, MAX_CONTEXT_CARDS);
    vaultContext = `
VAULT PORTFOLIO (${vault.length} cards, estimated value $${totalValue.toFixed(2)}):
${displayCards.map(formatCard).join('\n')}
${vault.length > MAX_CONTEXT_CARDS ? `\n... and ${vault.length - MAX_CONTEXT_CARDS} more cards` : ''}`;
  } else {
    vaultContext = '\nVAULT: Empty — no cards saved yet.';
  }

  // When a Soul is mounted, inject personality. Otherwise, default Oracle.
  const basePrompt = soul
    ? `You are a TCG market analyst with a unique personality. ${buildSoulPromptFragment(soul)} Answer naturally and conversationally. Don't mention word limits or formatting instructions — just talk like a real person who knows cards.`
    : `You are Oracle, a sharp TCG market analyst covering Pokémon, Magic, Yu-Gi-Oh!, One Piece, Lorcana, Star Wars, and Digimon. You give direct, punchy answers about card values, market trends, and collecting strategy. Talk naturally — no filler, no disclaimers about being an AI, no mentioning word counts. Just be helpful and knowledgeable.`;

  // Temporal awareness — all ephemeral, nothing stored
  const temporal = `\n${getClockContext()}${getSessionContext(sessionMeta)}${getMarketTimingContext()} Never mention knowledge cutoff dates — if unsure, just say so.`;

  // Chat memory — past session summaries for continuity
  let memoryContext = '';
  if (summaries.length > 0) {
    memoryContext = `\nPAST CONVERSATIONS (you remember these):\n${summaries.slice(-5).map(s => `- ${s}`).join('\n')}`;
  }

  // Prediction ledger — self-awareness of track record
  let predContext = '';
  if (predStats.total > 0) {
    const graded = predStats.correct + predStats.incorrect;
    predContext = `\nYOUR PREDICTION TRACK RECORD: ${predStats.accuracy}% accuracy (${predStats.correct}/${graded} correct, ${predStats.pending} pending).`;
    if (predStats.recentCalls.length > 0) {
      predContext += `\nRecent calls: ${predStats.recentCalls.join(' | ')}`;
    }
  }

  // Token budget — cap system prompt to ~1500 chars for local model compatibility
  const TOKEN_BUDGET = 1500;
  const coreLength = basePrompt.length + temporal.length;
  let budget = TOKEN_BUDGET - coreLength;

  // Priority: pred context > memory > vault (trim from lowest priority first)
  if (predContext.length + memoryContext.length + vaultContext.length > budget) {
    // Trim vault first — reduce card count
    if (vaultContext.length > budget * 0.4) {
      const trimCards = vault.slice(0, 5);
      vaultContext = vault.length > 0
        ? `\nVAULT: ${vault.length} cards, ~$${totalValue.toFixed(0)} total (${trimCards.map(c => sanitize(c.name)).join(', ')}...)`
        : '';
    }
    // Trim memory if still over
    if (predContext.length + memoryContext.length + vaultContext.length > budget) {
      memoryContext = summaries.length > 0
        ? `\nPAST TOPICS: ${summaries.slice(-3).join('; ').slice(0, 200)}`
        : '';
    }
  }

  return `${basePrompt}${temporal}${memoryContext}${predContext}${vaultContext}`;
}

