import { z } from 'zod';

export const exchangeSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(2500)
});
export const historySchema = z.array(exchangeSchema).max(6);
export const textRequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  history: historySchema.default([])
});
export const modelResponseSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(2500)
});

export const allowedAudioTypes = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'] as const;
export const maxAudioBytes = 4_000_000;
export const maxAudioSeconds = 45;

export function normalizeAudioType(value: string): string | null {
  const basic = value.split(';')[0].trim().toLowerCase();
  if (!allowedAudioTypes.includes(basic as typeof allowedAudioTypes[number])) return null;
  return basic === 'audio/mp4' ? 'audio/m4a' : basic;
}
