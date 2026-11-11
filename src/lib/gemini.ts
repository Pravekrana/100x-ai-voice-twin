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
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [
        { text: instruction },
        ...(input.audio ? [{ inlineData: { data: input.audio.base64, mimeType: input.audio.mimeType } }] : [])
      ] }],
      config: {
        systemInstruction: buildSystemPrompt(),
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.6,
        maxOutputTokens: 600
      }
    });
    const raw = response.text;
    if (!raw) throw new AIServiceError('empty_response');
    const parsed = modelResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new AIServiceError('invalid_response');
    return parsed.data;
  } catch (error) {
    if (error instanceof AIServiceError) throw error;
    throw new AIServiceError('provider_error');
  }
}
