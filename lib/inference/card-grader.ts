/**
 * TCG Oracle — Card Grading Analysis
 * Sends a card image to the user's configured AI engine for condition grading.
 * Supports vision-capable models on Anthropic (Claude), Groq (Llava), and Ollama.
 */

import { getActiveEngine, getEngineKey } from './cloud-engine';
import { EngineId } from './engine';

export interface GradingResult {
  overallGrade: string;       // e.g. "PSA 8" or "BGS 8.5"
  centering: string;          // e.g. "95/5 — Near Perfect"
  corners: string;            // e.g. "Minor wear, slight rounding"
  edges: string;              // e.g. "Clean, no whitening"
  surface: string;            // e.g. "No scratches, light print lines"
  summary: string;            // Full text analysis
  confidence: string;         // e.g. "High" / "Medium" / "Low"
}

const GRADING_PROMPT = `You are a professional TCG card grader with 15 years of experience at PSA, BGS, and CGC. Analyze the card image provided and give a detailed condition assessment.

Evaluate the following attributes:
1. **Centering** — Measure the border symmetry (front and back if visible). Use the ratio format (e.g. 55/45).
2. **Corners** — Check all four corners for wear, rounding, dings, or peeling.
3. **Edges** — Look for whitening, nicks, chipping, or roughness along all edges.
4. **Surface** — Check for scratches, print lines, ink dots, fading, creases, or damage.

Then provide:
- A predicted PSA grade (1-10 scale)
- A predicted BGS grade (with sub-grades if possible)
- Your confidence level (High/Medium/Low) based on image quality
- A brief summary of the card's condition

Format your response EXACTLY as follows (no markdown headers, just the labels):

PREDICTED GRADE: PSA [number] / BGS [number]
CONFIDENCE: [High/Medium/Low]

CENTERING: [ratio] — [description]
CORNERS: [description]
EDGES: [description]  
SURFACE: [description]

SUMMARY: [2-3 sentence overall assessment]`;

/**
 * Analyze a card image using the user's configured AI engine.
 * @param imageBase64 - Base64 data URI (data:image/jpeg;base64,...)
 * @returns Streaming text via onToken callback
 */
export async function analyzeCardImage(
  imageBase64: string,
  onToken: (token: string) => void,
): Promise<void> {
  const engineId = await getActiveEngine();
  
  if (engineId === 'local') {
    throw new Error('NO_ENGINE');
  }

  const key = await getEngineKey(engineId);
  if (!key && engineId !== 'ollama') {
    throw new Error('NO_ENGINE');
  }

  // Strip the data URI prefix to get raw base64
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  // Detect media type from the data URI
  const mediaType = imageBase64.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';

  if (engineId === 'anthropic') {
    return analyzeWithAnthropic(key!, base64Data, mediaType, onToken);
  } else if (engineId === 'groq') {
    return analyzeWithGroq(key!, imageBase64, onToken);
  } else if (engineId === 'ollama') {
    return analyzeWithOllama(key!, base64Data, onToken);
  }

  throw new Error('NO_ENGINE');
}

// ─── Anthropic Claude Vision ───

async function analyzeWithAnthropic(
  key: string,
  base64Data: string,
  mediaType: string,
  onToken: (token: string) => void,
): Promise<void> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      system: GRADING_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: 'Analyze this trading card and provide a detailed grading assessment.',
          },
        ],
      }],
      max_tokens: 1024,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('Invalid Anthropic API key');
    throw new Error(`Claude error ${resp.status}: ${err.substring(0, 100)}`);
  }

  // Parse Anthropic SSE stream
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onToken(parsed.delta.text);
        }
      } catch { /* skip */ }
    }
  }
}

// ─── Groq Vision (llama-3.2-11b-vision) ───

async function analyzeWithGroq(
  key: string,
  imageDataUri: string,
  onToken: (token: string) => void,
): Promise<void> {
  // Groq vision uses OpenAI-compatible format with image_url
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        { role: 'system', content: GRADING_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageDataUri },
            },
            {
              type: 'text',
              text: 'Analyze this trading card and provide a detailed grading assessment.',
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('Invalid Groq API key');
    throw new Error(`Groq error ${resp.status}: ${err.substring(0, 100)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) onToken(token);
      } catch { /* skip */ }
    }
  }
}

// ─── Ollama Vision (llava / bakllava) ───

async function analyzeWithOllama(
  endpoint: string,
  base64Data: string,
  onToken: (token: string) => void,
): Promise<void> {
  const resp = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llava:7b',
      messages: [
        { role: 'system', content: GRADING_PROMPT },
        {
          role: 'user',
          content: 'Analyze this trading card and provide a detailed grading assessment.',
          images: [base64Data],
        },
      ],
      stream: true,
      options: { temperature: 0.3, num_predict: 1024 },
    }),
  });

  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.done) return;
        if (parsed.message?.content) onToken(parsed.message.content);
      } catch { /* skip */ }
    }
  }
}
