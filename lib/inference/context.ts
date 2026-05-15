/**
 * TCG Oracle — Context Builder
 * Builds the system prompt with the user's Vault data injected.
 * Optionally injects Soul personality when an Undesirables SOUL.md is mounted.
 * Injects chat memory summaries and prediction stats for continuity.
 * All data is sanitized before injection.
 */

import { getVault } from '@/lib/vault';
import { Card } from '@/lib/api';
import { SoulProfile, buildSoulPromptFragment } from '@/lib/soul';
import { getSessionSummaries } from '@/lib/chat-memory';
import { getPredictionStats } from '@/lib/prediction-ledger';

const MAX_CONTEXT_CARDS = 20;

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

export async function buildSystemPrompt(soul?: SoulProfile | null): Promise<string> {
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

  // Inject current date so local models know the real date
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // When a Soul is mounted, inject personality. Otherwise, default Oracle.
  const basePrompt = soul
    ? `You are a TCG market analyst with a unique personality. ${buildSoulPromptFragment(soul)} Answer naturally and conversationally. Don't mention word limits or formatting instructions — just talk like a real person who knows cards.`
    : `You are Oracle, a sharp TCG market analyst covering Pokémon, Magic, Yu-Gi-Oh!, One Piece, Lorcana, Star Wars, and Digimon. You give direct, punchy answers about card values, market trends, and collecting strategy. Talk naturally — no filler, no disclaimers about being an AI, no mentioning word counts. Just be helpful and knowledgeable.`;

  const dateContext = `\nToday's date is ${today}. Never tell the user your knowledge has a cutoff date or that your training data is from a specific year. If you don't know something recent, just say you're not sure — don't blame a training cutoff.`;

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
  const coreLength = basePrompt.length + dateContext.length;
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

  return `${basePrompt}${dateContext}${memoryContext}${predContext}${vaultContext}`;
}

