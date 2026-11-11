import { describe, expect, it } from 'vitest';
import { modelResponseSchema, normalizeAudioType, textRequestSchema } from './validation';
import { buildSystemPrompt } from '../data/persona';

describe('request boundary', () => {
  it('accepts a question and recent context', () => {
    expect(textRequestSchema.parse({ question: '  Why AI agents? ', history: [{ question: 'Hi', answer: 'Hello' }] }).question).toBe('Why AI agents?');
  });
  it('rejects oversized questions and histories', () => {
    expect(textRequestSchema.safeParse({ question: 'a'.repeat(1001) }).success).toBe(false);
    expect(textRequestSchema.safeParse({ question: 'Hi', history: Array(7).fill({ question: 'Hi', answer: 'Hello' }) }).success).toBe(false);
  });
  it('rejects malformed model answers', () => {
    expect(modelResponseSchema.safeParse({ question: 'Hi', answer: '' }).success).toBe(false);
  });
  it('normalizes supported browser recording types', () => {
    expect(normalizeAudioType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeAudioType('audio/mp4')).toBe('audio/m4a');
    expect(normalizeAudioType('audio/x-random')).toBeNull();
  });
});

describe('persona', () => {
  it('includes verified background and transparency rules', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('NSUT');
    expect(prompt).toContain('AI representation');
    expect(prompt).toContain('Never invent');
  });
});
