/**
 * Oracle Chat Memory — Session Persistence
 *
 * Saves and loads chat history between sessions.
 * Also maintains rolling session summaries for context injection.
 *
 * Storage: AsyncStorage (localStorage on web, SQLite on native)
 * Budget: ~500KB max (5 sessions × 50 messages × ~2KB each)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface SessionSummary {
  date: string;        // ISO date
  messageCount: number;
  summary: string;     // 1-line summary of the session
  topics: string[];    // Key topics discussed
}

// ─── Constants ───────────────────────────────────────

const SESSION_KEY = '@oracle_chat_session';
const SUMMARIES_KEY = '@oracle_session_summaries';
const MAX_MESSAGES = 50;     // Max messages per session
const MAX_SUMMARIES = 10;    // Keep last 10 session summaries
const MAX_MSG_LENGTH = 3000; // Truncate long messages for storage

// ─── Session Persistence ─────────────────────────────

/**
 * Save current chat messages to AsyncStorage.
 * Keeps only the last MAX_MESSAGES messages.
 */
export async function saveSession(messages: PersistedMessage[]): Promise<void> {
  try {
    // Only save meaningful messages (skip system messages)
    const toSave = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-MAX_MESSAGES)
      .map(m => ({
        ...m,
        content: m.content.substring(0, MAX_MSG_LENGTH), // Truncate long responses
      }));

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('[ChatMemory] Failed to save session:', err);
  }
}

/**
 * Load the last saved chat session.
 * Returns empty array if no previous session exists.
 */
export async function loadSession(): Promise<PersistedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return [];

    const messages: PersistedMessage[] = JSON.parse(raw);
    return messages.filter(m => m.id && m.content && m.role);
  } catch {
    return [];
  }
}

/**
 * Clear all chat history.
 */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ─── Session Summaries ───────────────────────────────

/**
 * Extract topics and generate a summary from a set of messages.
 * This is a local heuristic — no LLM call needed.
 */
function extractSessionMeta(messages: PersistedMessage[]): SessionSummary {
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  // Extract topics from user questions
  const topics: string[] = [];
  for (const msg of userMessages) {
    const lower = msg.content.toLowerCase();
    // Card/game mentions
    const cardMatches = msg.content.match(/\b(?:charizard|pikachu|mewtwo|base set|black lotus|dark magician|luffy|zoro|nami)\b/gi);
    if (cardMatches) topics.push(...cardMatches.map(m => m.toLowerCase()));
    // Game mentions
    if (lower.includes('pokémon') || lower.includes('pokemon')) topics.push('pokémon');
    if (lower.includes('magic') || lower.includes('mtg')) topics.push('magic');
    if (lower.includes('yu-gi-oh') || lower.includes('yugioh')) topics.push('yu-gi-oh');
    if (lower.includes('one piece')) topics.push('one piece');
    if (lower.includes('lorcana')) topics.push('lorcana');
    if (lower.includes('digimon')) topics.push('digimon');
    // Analysis topics
    if (lower.includes('grade') || lower.includes('grading') || lower.includes('psa')) topics.push('grading');
    if (lower.includes('invest') || lower.includes('roi') || lower.includes('portfolio')) topics.push('investing');
    if (lower.includes('price') || lower.includes('value') || lower.includes('worth')) topics.push('pricing');
    if (lower.includes('trend') || lower.includes('market')) topics.push('market trends');
  }

  // Deduplicate topics
  const uniqueTopics = [...new Set(topics)].slice(0, 5);

  // Build summary from first user question + topic list
  const firstQuestion = userMessages[0]?.content?.substring(0, 80) || 'General chat';
  const topicStr = uniqueTopics.length > 0 ? ` (${uniqueTopics.join(', ')})` : '';
  const summary = `${userMessages.length} questions, ${assistantMessages.length} answers${topicStr} — started with "${firstQuestion}"`;

  return {
    date: new Date().toISOString(),
    messageCount: messages.length,
    summary,
    topics: uniqueTopics,
  };
}

/**
 * Archive the current session as a summary.
 * Called when the user's session has meaningful content (4+ messages).
 */
export async function archiveSession(messages: PersistedMessage[]): Promise<void> {
  const meaningful = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  if (meaningful.length < 4) return; // Not enough to summarize

  try {
    const raw = await AsyncStorage.getItem(SUMMARIES_KEY);
    let summaries: SessionSummary[] = raw ? JSON.parse(raw) : [];

    const newSummary = extractSessionMeta(meaningful);
    summaries.push(newSummary);

    // Keep only the last MAX_SUMMARIES
    if (summaries.length > MAX_SUMMARIES) {
      summaries = summaries.slice(-MAX_SUMMARIES);
    }

    await AsyncStorage.setItem(SUMMARIES_KEY, JSON.stringify(summaries));
  } catch (err) {
    console.warn('[ChatMemory] Failed to archive session:', err);
  }
}

/**
 * Get past session summaries for context injection.
 * Returns formatted strings ready for system prompt injection.
 */
export async function getSessionSummaries(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SUMMARIES_KEY);
    if (!raw) return [];

    const summaries: SessionSummary[] = JSON.parse(raw);
    return summaries.map(s => {
      const date = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${date}: ${s.summary}`;
    });
  } catch {
    return [];
  }
}

/**
 * Get memory stats for UI display.
 */
export async function getMemoryStats(): Promise<{
  sessionCount: number;
  totalMessages: number;
  topics: string[];
}> {
  try {
    const raw = await AsyncStorage.getItem(SUMMARIES_KEY);
    if (!raw) return { sessionCount: 0, totalMessages: 0, topics: [] };

    const summaries: SessionSummary[] = JSON.parse(raw);
    const allTopics = summaries.flatMap(s => s.topics);
    const uniqueTopics = [...new Set(allTopics)].slice(0, 10);

    return {
      sessionCount: summaries.length,
      totalMessages: summaries.reduce((sum, s) => sum + s.messageCount, 0),
      topics: uniqueTopics,
    };
  } catch {
    return { sessionCount: 0, totalMessages: 0, topics: [] };
  }
}
