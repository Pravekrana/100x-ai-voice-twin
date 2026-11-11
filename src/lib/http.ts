import { historySchema } from './validation';

const requests = new Map<string, { count: number; reset: number }>();
export function requestGuard(request: Request, maxBytes: number): Response | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return errorResponse('This request is not allowed.', 403);
  const size = Number(request.headers.get('content-length') || 0);
  if (size > maxBytes) return errorResponse('That request is too large.', 413);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const current = requests.get(ip);
  const slot = current && current.reset > now ? current : { count: 0, reset: now + 60_000 };
  slot.count += 1;
  requests.set(ip, slot);
  if (slot.count > 12) return errorResponse('Too many questions. Please wait a minute.', 429);
  if (requests.size > 5000) for (const [key, value] of requests) if (value.reset <= now) requests.delete(key);
  return null;
}

export async function readLimitedBytes(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty_body');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new Error('too_large'); }
    chunks.push(value);
  }
  const output = new Uint8Array(bytes);
  let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
  return output;
}

export async function readLimitedText(request: Request, limit: number): Promise<string> {
  return new TextDecoder().decode(await readLimitedBytes(request, limit));
}

export function parseHistory(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.length > 16_000) throw new Error('invalid_history');
  return historySchema.parse(JSON.parse(value));
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function serviceError(error: unknown): Response {
  if (error instanceof Error && error.message === 'missing_key') return errorResponse('The assistant is not configured yet.', 503);
  return errorResponse('The assistant could not answer right now. Please try again.', 502);
}
