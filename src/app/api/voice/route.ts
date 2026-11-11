import { askGemini } from '@/lib/gemini';
import { errorResponse, parseHistory, readLimitedBytes, requestGuard, serviceError } from '@/lib/http';
import { maxAudioBytes, maxAudioSeconds, normalizeAudioType } from '@/lib/validation';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const guarded = requestGuard(request, maxAudioBytes + 20_000);
  if (guarded) return guarded;
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return errorResponse('Send a recorded audio question.', 415);
  let audio: File;
  let history;
  try {
    const raw = await readLimitedBytes(request, maxAudioBytes + 20_000);
    const form = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') || '' }, body: Buffer.from(raw) }).formData();
    const file = form.get('audio');
    if (!(file instanceof File)) throw new Error('invalid_audio');
    audio = file;
    history = parseHistory(form.get('history'));
    const mimeType = normalizeAudioType(audio.type);
    const seconds = Number(form.get('durationSeconds'));
    if (!mimeType || audio.size < 500 || audio.size > maxAudioBytes || !Number.isFinite(seconds) || seconds <= 0 || seconds > maxAudioSeconds) throw new Error('invalid_audio');
  } catch {
    return errorResponse('Record a question of up to 45 seconds and try again.', 400);
  }
  try {
    const bytes = Buffer.from(await audio.arrayBuffer());
    const result = await askGemini({ audio: { base64: bytes.toString('base64'), mimeType: normalizeAudioType(audio.type)! }, history });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serviceError(error);
  }
}
