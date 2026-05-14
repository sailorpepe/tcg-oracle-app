/**
 * TCG Oracle — Inference Engine Interface
 * Unified abstraction for on-device and cloud LLM inference.
 * All engines implement the same streaming interface.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export type EngineId = 'local' | 'anthropic' | 'groq' | 'ollama' | 'openai' | 'xai';

export interface EngineConfig {
  id: EngineId;
  name: string;
  description: string;
  requiresKey: boolean;
  keyPlaceholder?: string;
  keyUrl?: string;
  keyHint?: string;
  setupSteps?: string[];
}

export const AVAILABLE_ENGINES: EngineConfig[] = [
  {
    id: 'groq',
    name: 'Groq',
    description: 'Free tier — blazing fast cloud AI (recommended)',
    requiresKey: true,
    keyPlaceholder: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'Free account, no credit card needed',
    setupSteps: [
      'Go to console.groq.com and create a free account',
      'Click "API Keys" in the left sidebar',
      'Click "Create API Key"',
      'Copy the key (starts with gsk_) and paste it below',
    ],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    description: 'Real-time knowledge + voice narration',
    requiresKey: true,
    keyPlaceholder: 'xai-...',
    keyUrl: 'https://console.x.ai',
    keyHint: 'Also powers the Oracle voice — one key for chat + TTS',
    setupSteps: [
      'Go to console.x.ai and sign in with your X account',
      'Navigate to API Keys',
      'Create a new key',
      'Copy the key (starts with xai-) and paste it below',
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o — versatile and reliable',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Requires an OpenAI account with API credits',
    setupSteps: [
      'Go to platform.openai.com and sign in',
      'Click "API Keys" in the left sidebar',
      'Click "Create new secret key"',
      'Copy the key (starts with sk-) and paste it below',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude — advanced reasoning and analysis',
    requiresKey: true,
    keyPlaceholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Requires an Anthropic account with API access',
    setupSteps: [
      'Go to console.anthropic.com and sign in',
      'Navigate to Settings → API Keys',
      'Click "Create Key"',
      'Copy the key (starts with sk-ant-) and paste it below',
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run AI on your own computer — fully offline',
    requiresKey: false,
    keyPlaceholder: 'http://localhost:11434',
    keyHint: 'Free, private, no data leaves your machine',
    setupSteps: [
      'Install Ollama from ollama.com (Mac, Windows, Linux)',
      'Open Terminal and run: ollama pull hermes3:8b',
      'Ollama runs on localhost — the app auto-detects it',
      'Any installed model works (hermes, llama, gemma, qwen)',
    ],
  },
];

export interface InferenceEngine {
  id: EngineId;
  name: string;
  isReady(): Promise<boolean>;
  generateStream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    options?: InferenceOptions
  ): Promise<void>;
  dispose(): Promise<void>;
}
