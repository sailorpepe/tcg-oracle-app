/**
 * TCG Oracle — Cloud Inference Engines (BYOK)
 * Supports Anthropic (Claude), Groq, and Ollama-compatible endpoints.
 * API keys stored via secure storage — never logged or transmitted to our servers.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSecureItem, getSecureItem, deleteSecureItem } from '../secure-keys';
import { InferenceEngine, ChatMessage, InferenceOptions, EngineId } from './engine';

const KEY_PREFIX = '@tcg_oracle_engine_';
const ENGINE_SELECTION_KEY = '@tcg_oracle_active_engine';

// ─── Key Storage (SecureStore on native, localStorage on web) ───
// API keys use secure storage. Engine selection is non-sensitive → AsyncStorage.

/** Validate Ollama endpoints to prevent SSRF */
function validateOllamaEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block cloud metadata endpoints
    const blocked = ['169.254.169.254', 'metadata.google', '100.100.100.200', 'metadata.internal'];
    if (blocked.some(b => parsed.hostname.includes(b))) return false;
    // Only allow standard ports
    const port = parseInt(parsed.port || '80');
    if (port < 1 || port > 65535) return false;
    return true;
  } catch { return false; }
}

export async function saveEngineKey(engineId: EngineId, key: string): Promise<void> {
  if (engineId === 'ollama' && !validateOllamaEndpoint(key)) {
    throw new Error('Invalid Ollama endpoint URL');
  }
  await setSecureItem(`${KEY_PREFIX}${engineId}`, key);
}

export async function getEngineKey(engineId: EngineId): Promise<string | null> {
  return getSecureItem(`${KEY_PREFIX}${engineId}`);
}

export async function removeEngineKey(engineId: EngineId): Promise<void> {
  await deleteSecureItem(`${KEY_PREFIX}${engineId}`);
}

export async function saveActiveEngine(engineId: EngineId): Promise<void> {
  await AsyncStorage.setItem(ENGINE_SELECTION_KEY, engineId);
}

export async function getActiveEngine(): Promise<EngineId> {
  const stored = await AsyncStorage.getItem(ENGINE_SELECTION_KEY);
  return (stored as EngineId) || 'local';
}

// ─── Engine Configs ───

interface EngineAPIConfig {
  baseUrl: string;
  defaultModel: string;
  format: 'openai' | 'anthropic';
}

const ENGINE_CONFIGS: Record<string, EngineAPIConfig> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    format: 'openai',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini-fast',
    format: 'openai',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    format: 'openai',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-20241022',
    format: 'anthropic',
  },
};

export function createCloudEngine(engineId: EngineId): InferenceEngine {
  return {
    id: engineId,
    name: engineId === 'anthropic' ? 'Claude' : engineId === 'groq' ? 'Groq' : engineId === 'xai' ? 'xAI Grok' : engineId === 'openai' ? 'OpenAI' : 'Ollama',

    async isReady(): Promise<boolean> {
      if (engineId === 'ollama') {
        const endpoint = await getEngineKey('ollama');
        if (!endpoint) return false;
        try {
          const resp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
          return resp.ok;
        } catch { return false; }
      }
      const key = await getEngineKey(engineId);
      return !!key && key.length > 10;
    },

    async generateStream(
      messages: ChatMessage[],
      onToken: (token: string) => void,
      options?: InferenceOptions
    ): Promise<void> {
      if (engineId === 'ollama') {
        return ollamaStream(messages, onToken, options);
      }

      const config = ENGINE_CONFIGS[engineId];
      if (!config) throw new Error(`Unknown engine: ${engineId}`);

      const key = await getEngineKey(engineId);
      if (!key) throw new Error('API key not configured');

      if (config.format === 'anthropic') {
        return anthropicStream(key, config, messages, onToken, options);
      }

      // OpenAI-compatible format (Groq)
      const resp = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.defaultModel,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        if (resp.status === 401) throw new Error('Invalid API key — check your key and try again');
        if (resp.status === 429) throw new Error('Rate limited — wait a moment and try again');
        throw new Error(`API error ${resp.status}: ${err.substring(0, 100)}`);
      }

      await parseSSEStream(resp, (data) => {
        const token = data.choices?.[0]?.delta?.content;
        if (token) onToken(token);
      });
    },

    async dispose(): Promise<void> {},
  };
}

// ─── Anthropic (Claude) Streaming ───

async function anthropicStream(
  key: string,
  config: EngineAPIConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  options?: InferenceOptions
): Promise<void> {
  // Anthropic separates system prompt from messages
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const resp = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.defaultModel,
      system: systemMsg?.content || '',
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('Invalid API key — check your key and try again');
    if (resp.status === 429) throw new Error('Rate limited — wait a moment and try again');
    throw new Error(`Claude error ${resp.status}: ${err.substring(0, 100)}`);
  }

  await parseSSEStream(resp, (data) => {
    // Anthropic SSE format: content_block_delta events
    if (data.type === 'content_block_delta' && data.delta?.text) {
      onToken(data.delta.text);
    }
  });
}

// ─── Ollama Streaming ───

async function ollamaStream(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  options?: InferenceOptions
): Promise<void> {
  const endpoint = await getEngineKey('ollama');
  if (!endpoint) throw new Error('Ollama endpoint not configured');

  // Check if user has a saved model preference (from model picker UI)
  let model = 'hermes3:8b'; // default recommendation
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const savedModel = await AsyncStorage.getItem('@tcg_oracle_ollama_model');
    if (savedModel) {
      model = savedModel;
    } else {
      // Auto-detect the best installed model
      const tagsResp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (tagsResp.ok) {
        const tagsData = await tagsResp.json();
        const models: string[] = (tagsData.models || []).map((m: any) => m.name);
        // Priority: hermes3 > hermes > llama > gemma > qwen > first available
        const preferred = [
          models.find(m => m.startsWith('hermes3')),
          models.find(m => m.startsWith('hermes')),
          models.find(m => m.includes('llama')),
          models.find(m => m.includes('gemma')),
          models.find(m => m.includes('qwen')),
          models[0],
        ];
        model = preferred.find(Boolean) || model;
      }
    }
  } catch { /* use default */ }

  // Disable qwen3 thinking mode by appending /no_think to the last user message
  const isQwen = model.includes('qwen');
  const processedMessages = messages.map((m, i) => {
    if (isQwen && m.role === 'user' && i === messages.length - 1) {
      return { role: m.role, content: m.content + ' /no_think' };
    }
    return { role: m.role, content: m.content };
  });

  const resp = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: processedMessages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.6,
        num_predict: options?.maxTokens ?? 512,  // shorter = faster
        num_ctx: 2048,                            // smaller context = faster
        top_p: 0.9,
        repeat_penalty: 1.1,
      },
    }),
  });

  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let insideThinkBlock = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 512 * 1024) throw new Error('Stream exceeded 500KB safety limit');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.done) return;
        if (!parsed.message?.content) continue;

        let content = parsed.message.content;

        // Filter out any <think> blocks that leak through
        if (content.includes('<think>')) { insideThinkBlock = true; continue; }
        if (insideThinkBlock) {
          if (content.includes('</think>')) {
            insideThinkBlock = false;
            content = content.split('</think>').pop() || '';
            if (!content.trim()) continue;
          } else {
            continue; // skip thinking content
          }
        }

        if (content) onToken(content);
      } catch {
        // Skip malformed chunks
      }
    }
  }
}

// ─── Shared SSE Parser ───

async function parseSSEStream(resp: Response, onData: (data: any) => void): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 512 * 1024) throw new Error('Stream exceeded 500KB safety limit');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;

      try {
        onData(JSON.parse(data));
      } catch {
        // Skip malformed chunks
      }
    }
  }
}

// ─── Key Verification ───

export async function verifyKey(engineId: EngineId, key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    if (engineId === 'ollama') {
      const resp = await fetch(`${key}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) return { valid: true };
      return { valid: false, error: 'Could not connect to Ollama server' };
    }

    if (engineId === 'anthropic') {
      // Anthropic doesn't have a /models endpoint — verify by sending a tiny request
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok || resp.status === 200) return { valid: true };
      if (resp.status === 401) return { valid: false, error: 'Invalid API key' };
      if (resp.status === 400) return { valid: true }; // Key is valid but request was malformed — still good
      return { valid: false, error: `Claude error: ${resp.status}` };
    }

    // Groq — OpenAI-compatible /models endpoint
    const config = ENGINE_CONFIGS[engineId];
    if (!config) return { valid: false, error: 'Unknown engine' };

    const resp = await fetch(`${config.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) return { valid: true };
    if (resp.status === 401) return { valid: false, error: 'Invalid API key' };
    return { valid: false, error: `Connection error: ${resp.status}` };
  } catch (e: any) {
    return { valid: false, error: e?.message?.includes('timeout') ? 'Connection timed out' : 'Connection failed' };
  }
}
