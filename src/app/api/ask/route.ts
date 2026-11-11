import { askGemini } from '@/lib/gemini';
import { errorResponse, readLimitedText, requestGuard, serviceError } from '@/lib/http';
import { textRequestSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const guarded = requestGuard(request, 20_000);
  if (guarded) return guarded;
  if (!request.headers.get('content-type')?.startsWith('application/json')) return errorResponse('Send a JSON question.', 415);
  let input;
  try {
    input = textRequestSchema.parse(JSON.parse(await readLimitedText(request, 20_000)));
  } catch {
    return errorResponse('Enter a question of up to 1,000 characters.', 400);
  }
  try {
    const result = await askGemini(input);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serviceError(error);
  }
}
