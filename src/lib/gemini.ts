import { GoogleGenAI, Type } from '@google/genai';
import { buildSystemPrompt } from '@/data/persona';
import { historySchema, modelResponseSchema, type exchangeSchema } from './validation';
import type { z } from 'zod';

export type Exchange = z.infer<typeof exchangeSchema>;
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING },
    answer: { type: Type.STRING }
  },
  required: ['question', 'answer']
};

export class AIServiceError extends Error {}

export async function askGemini(input: { question?: string; audio?: { base64: string; mimeType: string }; history: Exchange[] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIServiceError('missing_key');
  const history = historySchema.parse(input.history);
  const ai = new GoogleGenAI({ apiKey: key });
  const context = history.length ? `Recent exchanges in this browser session:\n${history.map((x, i) => `${i + 1}. Visitor: ${x.question}\nPravek AI: ${x.answer}`).join('\n')}` : 'No prior exchanges.';
  const instruction = input.audio
    ? `Transcribe the spoken question accurately into the JSON question field, then answer it as Pravek in the JSON answer field. If speech is unclear or absent, put a brief request to repeat in the question field and answer field.\n${context}`
    : `Put the visitor's question in the JSON question field and answer it in the JSON answer field.\n${context}\nVisitor question: ${input.question}`;
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', 'gemini-3.6-flash'])];
  for (const [index, model] of models.entries()) {
    try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [
        { text: instruction },
        ...(input.audio ? [{ inlineData: { data: input.audio.base64, mimeType: input.audio.mimeType } }] : [])
      ] }],
      config: {
        systemInstruction: buildSystemPrompt(),
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.6,
        maxOutputTokens: 1200,
        httpOptions: { timeout: 18_000, retryOptions: { attempts: 1 } }
      }
    });
    const raw = response.text;
    if (!raw) throw new AIServiceError('empty_response');
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { throw new AIServiceError('invalid_response'); }
    const parsed = modelResponseSchema.safeParse(decoded);
    if (!parsed.success) throw new AIServiceError('invalid_response');
    return parsed.data;
    } catch (error) {
    if (error instanceof AIServiceError) {
      console.error('Gemini response error', error.message);
      throw error;
    }
    const provider = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown; name?: unknown } : {};
    const details = {
      model,
      status: typeof provider.status === 'number' ? provider.status : null,
      code: typeof provider.code === 'number' || typeof provider.code === 'string' ? provider.code : null,
      name: typeof provider.name === 'string' ? provider.name : null
    };
    const status = typeof provider.status === 'number' ? provider.status : null;
    if (index < models.length - 1 && (status === 404 || (status !== null && status >= 500) || provider.name === 'AbortError' || provider.name === 'TimeoutError')) {
      console.warn('Gemini model fallback', details);
      continue;
    }
    console.error('Gemini provider error', details);
    throw new AIServiceError('provider_error');
    }
  }
  throw new AIServiceError('provider_error');
}
