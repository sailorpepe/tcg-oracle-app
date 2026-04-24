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

export type EngineId = 'local' | 'anthropic' | 'groq' | 'ollama';

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
    id: 'local',
    name: 'On-Device',
    description: 'Pre-loaded AI model — zero data leaves your phone',
    requiresKey: false,
    setupSteps: [
      'A small AI model downloads automatically on first use (~1.1 GB)',
      'All processing happens on your device',
      'No internet needed after download',
      'Works best on iPhone 12+ or modern Android',
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Free tier — blazing fast cloud AI',
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
    name: 'Ollama',
    description: 'Connect to your own AI server over WiFi',
    requiresKey: false,
    keyPlaceholder: 'http://192.168.1.x:11434',
    keyHint: 'Run any model on your Mac/PC, chat from your phone',
    setupSteps: [
      'Install Ollama on your computer (ollama.com)',
      'Open Terminal and run: ollama pull llama3.2:3b',
      'Make sure your phone is on the same WiFi network',
      'Enter your computer\'s IP address below (find it in System Settings → Network)',
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
