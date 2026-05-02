/**
 * TCG Oracle — Card Grading Analysis
 * Sends a card image to the user's configured AI engine for condition grading.
 * Supports vision-capable models on Anthropic (Claude), Groq (Llava), and Ollama.
 */

import { getActiveEngine, getEngineKey, saveEngineKey, saveActiveEngine } from './cloud-engine';
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

const GRADING_PROMPT = `You are a professional TCG card grader with 15 years of experience at PSA, BGS, and CGC. Analyze the card image provided and give a detailed, ULTRA-CONSERVATIVE condition assessment.

CRITICAL GRADING RULES — READ CAREFULLY:
1. PSA 10 Gem Mint = less than 2% of all submissions. NEVER give PSA 10 unless the card is absolutely perfect in every dimension.
2. PSA 9 Mint = less than 15% of submissions. Requires near-perfection in ALL four categories.
3. Most raw cards "in good condition" grade at PSA 6-7. A PSA 8 is a GOOD result.
4. If the photo is taken at an angle, not flat, or has poor lighting — lower your confidence to Low and subtract 0.5-1.0 from each sub-grade because you CANNOT accurately assess condition from bad angles.
5. Cards sitting on surfaces (tables, counters) almost always show more wear than they appear to have. Assume hidden edge wear.
6. BGS grade MUST be consistent with PSA: BGS should be EQUAL to or LOWER than (PSA grade + 0.5). Never give BGS significantly higher than PSA.
7. If ANY sub-grade is 7.0 or below, the overall PSA grade CANNOT be higher than 7.
8. A score of 8.0 or higher in ANY sub-category should be RARE for cards photographed in casual settings.

STEP 1 — CARD IDENTIFICATION:
First, identify the card. Read any visible text, numbers, logos, or artwork to determine:
- The player/character name
- The card set or product name
- The year of release
- The card number (if visible)
- The card game (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, sports cards, etc.)

STEP 2 — CONDITION GRADING:
Evaluate the following attributes, giving each a NUMERICAL SCORE from 1.0 to 10.0 with one decimal place:

1. **Centering** — Measure the border symmetry (front and back if visible). Use the ratio format.
   - 10.0 = 50/50 perfect centering (almost never give this)
   - 9.0 = 55/45 or better (rare)
   - 8.0 = 58/42 to 60/40
   - 7.0 = 60/40 to 65/35
   - 6.0 = 65/35 to 70/30
   - 5.0 or below = 70/30 or worse

2. **Corners** — Check all four corners for wear, rounding, dings, or peeling. Be VERY strict.
   - 10.0 = NEVER give from a photo (impossible to verify under magnification)
   - 9.0 = Only if corners appear absolutely razor sharp in a high-quality flat photo
   - 8.0 = Corners look clean but can't rule out micro-wear
   - 7.0 = Any visible rounding on even ONE corner
   - 6.0 = Rounding visible on 2+ corners
   - 5.0 or below = Clear dings, bends, or peeling

3. **Edges** — Look for whitening, nicks, chipping, or roughness along all edges.
   - 10.0 = NEVER give from a photo
   - 9.0 = Only if edges are perfectly clean in a flat, well-lit photo
   - 8.0 = Edges look clean overall, minor imperfections possible
   - 7.0 = Any whitening visible, even small
   - 6.0 = Whitening along an edge or minor chipping
   - 5.0 or below = Heavy whitening or multiple chips

4. **Surface** — Check for scratches, print lines, ink dots, fading, creases, or damage.
   - 10.0 = NEVER give from a photo
   - 9.0 = Only if surface is perfectly clean with no visible marks
   - 8.0 = Minor print lines or faint marks only
   - 7.0 = Visible scratching, print lines, or light surface wear
   - 6.0 = Multiple scratches or a light crease
   - 5.0 or below = Obvious damage, creases, or heavy wear

Format your response EXACTLY as follows (no markdown, just labels):

CARD: [Player/Character Name] — [Set Name] — [Year] — #[Card Number]
GAME: [Pokémon/Magic/Yu-Gi-Oh!/Sports/Other]

PREDICTED GRADE: PSA [number] / BGS [number]
CONFIDENCE: [High/Medium/Low]

CENTERING: [score]/10 — [ratio] — [description]
CORNERS: [score]/10 — [description]
EDGES: [score]/10 — [description]
SURFACE: [score]/10 — [description]

SUMMARY: [2-3 sentence overall assessment]`;

/**
 * Resize an image to a max dimension (keeps aspect ratio).
 * Prevents Ollama OOM on large phone photos while keeping grading detail.
 * 1024px is more than enough for centering, corners, edges, surface analysis.
 */
async function resizeImageForVision(dataUri: string, maxDim: number = 1024): Promise<{ dataUri: string; base64: string; mediaType: string }> {
  const fallback = () => {
    const base64 = dataUri.replace(/^data:image\/[^;]+;base64,/, '');
    const mediaType = dataUri.match(/^data:(image\/[^;]+);/)?.[1] || 'image/jpeg';
    return { dataUri, base64, mediaType };
  };

  // Non-web or unsupported format — return as-is
  if (typeof document === 'undefined') return fallback();

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Only resize if larger than maxDim
      if (width <= maxDim && height <= maxDim) {
        resolve(fallback());
        return;
      }
      // Scale down preserving aspect ratio
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const resizedUri = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = resizedUri.replace(/^data:image\/[^;]+;base64,/, '');
      resolve({ dataUri: resizedUri, base64, mediaType: 'image/jpeg' });
    };
    // HEIC and other browser-unsupported formats — skip resize, pass through as-is
    img.onerror = () => resolve(fallback());
    img.src = dataUri;
  });
}

/**
 * Analyze a card image using the user's configured AI engine.
 * @param imageBase64 - Base64 data URI (data:image/jpeg;base64,...)
 * @returns Streaming text via onToken callback
 */
export async function analyzeCardImage(
  imageBase64: string,
  onToken: (token: string) => void,
): Promise<void> {
  let engineId = await getActiveEngine();
  
  // Auto-detect Ollama when no engine is configured (zero-config desktop experience)
  if (engineId === 'local') {
    const ollamaEndpoint = 'http://localhost:11434';
    const visionModel = await findOllamaVisionModel(ollamaEndpoint);
    if (visionModel) {
      // Ollama is running with a vision model — auto-configure it
      await saveEngineKey('ollama', ollamaEndpoint);
      await saveActiveEngine('ollama');
      engineId = 'ollama';
    } else {
      throw new Error('NO_ENGINE');
    }
  }

  const key = await getEngineKey(engineId);
  if (!key && engineId !== 'ollama') {
    // One more try: check Ollama as fallback
    const ollamaEndpoint = 'http://localhost:11434';
    const visionModel = await findOllamaVisionModel(ollamaEndpoint);
    if (visionModel) {
      await saveEngineKey('ollama', ollamaEndpoint);
      await saveActiveEngine('ollama');
      engineId = 'ollama';
    } else {
      throw new Error('NO_ENGINE');
    }
  }

  // Resize large images to 1024px max — prevents OOM on Ollama, faster on all engines
  const { dataUri, base64, mediaType } = await resizeImageForVision(imageBase64);

  if (engineId === 'anthropic') {
    return analyzeWithAnthropic(key!, base64, mediaType, onToken);
  } else if (engineId === 'groq') {
    return analyzeWithGroq(key!, dataUri, onToken);
  } else if (engineId === 'ollama') {
    const ollamaKey = await getEngineKey('ollama');
    return analyzeWithOllama(ollamaKey || 'http://localhost:11434', base64, onToken);
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

// ─── Ollama Vision (auto-detect model) ───

// Vision-capable model families, in preference order
const OLLAMA_VISION_MODELS = ['qwen2.5vl', 'llava', 'bakllava', 'llama3.2-vision', 'moondream', 'minicpm-v'];

async function findOllamaVisionModel(endpoint: string): Promise<string | null> {
  try {
    const resp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const models: string[] = (data.models || []).map((m: any) => m.name?.toLowerCase() || '');
    // Find the first installed vision-capable model
    for (const vision of OLLAMA_VISION_MODELS) {
      const match = models.find(m => m.startsWith(vision));
      if (match) return match;
    }
    return null;
  } catch { return null; }
}

async function analyzeWithOllama(
  endpoint: string,
  base64Data: string,
  onToken: (token: string) => void,
): Promise<void> {
  // Auto-detect which vision model is available
  const visionModel = await findOllamaVisionModel(endpoint);
  if (!visionModel) {
    throw new Error(
      'No vision model found on your Ollama server. Run: ollama pull llava:7b\n' +
      'Then retry the scan. Other supported models: bakllava, moondream, minicpm-v'
    );
  }

  const resp = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: visionModel,
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

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(`Vision model "${visionModel}" not found. Run: ollama pull ${visionModel}`);
    }
    throw new Error(`Ollama error: ${resp.status}`);
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
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.done) return;
        if (parsed.message?.content) onToken(parsed.message.content);
      } catch { /* skip */ }
    }
  }
}
