/**
 * TCG Oracle — Card Identification (Scan-to-Search)
 * Lightweight vision prompt that identifies a card from an image.
 * Much faster than full grading — only returns name, set, game.
 */

import { getActiveEngine, getEngineKey, saveEngineKey, saveActiveEngine } from './cloud-engine';

const IDENTIFY_PROMPT = `You are a TCG card identification expert. Look at this trading card image and identify it.

Return ONLY these fields, one per line, with no other text:

CARD: [exact card name as printed]
SET: [set or expansion name]
GAME: [one of: pokemon, magic, yugioh, onepiece, lorcana, starwars, digimon, sports, other]
NUMBER: [card number if visible, or "unknown"]

Rules:
- Read all visible text on the card carefully
- For Pokémon: include "ex", "V", "VMAX", "GX" etc. in the name
- For Magic: include the full card name
- If you can't identify the card with certainty, give your best guess
- Do NOT add explanations, greetings, or extra text — ONLY the 4 lines above`;

export interface CardIdentification {
  name: string;
  set: string;
  game: string;
  number: string;
}

/**
 * Resize image for fast identification (smaller = faster API call)
 */
async function resizeForIdentify(dataUri: string, maxDim: number = 512): Promise<{ dataUri: string; base64: string; mediaType: string }> {
  const fallback = () => {
    const base64 = dataUri.replace(/^data:image\/[^;]+;base64,/, '');
    const mediaType = dataUri.match(/^data:(image\/[^;]+);/)?.[1] || 'image/jpeg';
    return { dataUri, base64, mediaType };
  };

  if (typeof document === 'undefined') return fallback();

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(fallback());
        return;
      }
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const resizedUri = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = resizedUri.replace(/^data:image\/[^;]+;base64,/, '');
      resolve({ dataUri: resizedUri, base64, mediaType: 'image/jpeg' });
    };
    img.onerror = () => resolve(fallback());
    img.src = dataUri;
  });
}

/**
 * Parse the AI response into a structured CardIdentification
 */
function parseIdentification(text: string): CardIdentification | null {
  const getField = (label: string): string => {
    const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, 's');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  const name = getField('CARD');
  if (!name) return null;

  return {
    name,
    set: getField('SET') || '',
    game: getField('GAME') || 'other',
    number: getField('NUMBER') || '',
  };
}

/**
 * Identify a card from an image using the user's configured AI engine.
 * Returns a CardIdentification or null if identification fails.
 */
export async function identifyCard(imageDataUri: string): Promise<CardIdentification | null> {
  let engineId = await getActiveEngine();

  // Auto-detect Ollama when no engine is configured
  if (engineId === 'local') {
    const ollamaEndpoint = 'http://localhost:11434';
    try {
      const resp = await fetch(`${ollamaEndpoint}/api/tags`);
      const data = await resp.json();
      const visionModel = data.models?.find((m: any) =>
        ['llava', 'bakllava', 'moondream', 'gemma3'].some(v => m.name?.toLowerCase().includes(v))
      );
      if (visionModel) {
        await saveEngineKey('ollama', ollamaEndpoint);
        await saveActiveEngine('ollama');
        engineId = 'ollama';
      } else {
        throw new Error('NO_ENGINE');
      }
    } catch {
      throw new Error('NO_ENGINE');
    }
  }

  const key = await getEngineKey(engineId);
  if (!key && engineId !== 'ollama') {
    throw new Error('NO_ENGINE');
  }

  const { dataUri, base64, mediaType } = await resizeForIdentify(imageDataUri);

  let responseText = '';

  if (engineId === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: IDENTIFY_PROMPT },
          ],
        }],
      }),
    });
    const data = await resp.json();
    responseText = data.content?.[0]?.text || '';
  } else if (engineId === 'groq') {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-4-scout-17b-16e-instruct',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: IDENTIFY_PROMPT },
          ],
        }],
      }),
    });
    const data = await resp.json();
    responseText = data.choices?.[0]?.message?.content || '';
  } else if (engineId === 'ollama') {
    const ollamaUrl = await getEngineKey('ollama') || 'http://localhost:11434';
    // Find a vision model
    const tagsResp = await fetch(`${ollamaUrl}/api/tags`);
    const tagsData = await tagsResp.json();
    const visionModel = tagsData.models?.find((m: any) =>
      ['llava', 'bakllava', 'moondream', 'gemma3'].some(v => m.name?.toLowerCase().includes(v))
    )?.name || 'llava';

    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: visionModel,
        prompt: IDENTIFY_PROMPT,
        images: [base64],
        stream: false,
      }),
    });
    const data = await resp.json();
    responseText = data.response || '';
  }

  return parseIdentification(responseText);
}
