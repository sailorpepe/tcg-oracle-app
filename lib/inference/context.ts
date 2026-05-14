/**
 * TCG Oracle — Context Builder
 * Builds the system prompt with the user's Vault data injected.
 * Optionally injects Soul personality when an Undesirables SOUL.md is mounted.
 * All data is sanitized before injection.
 */

import { getVault } from '@/lib/vault';
import { Card } from '@/lib/api';
import { SoulProfile, buildSoulPromptFragment } from '@/lib/soul';

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
  const vault = await getVault();
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

  return `${basePrompt}${vaultContext}`;
}
