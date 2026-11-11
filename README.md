# Ask Pravek — AI Voice Twin

A voice-first, persona-grounded interview assistant for the 100x AI Agent Team Stage 1 assessment. Visitors can speak or type questions and receive dynamic first-person answers based on a verified, editable knowledge base.

## Stack and architecture

- Next.js App Router, React, TypeScript, Tailwind CSS, Lucide icons
- Server-side Google Gemini via the official `@google/genai` SDK
- Browser MediaRecorder for spoken input and SpeechSynthesis for spoken output
- One Gemini request per exchange. For audio, Gemini transcribes and answers in validated JSON.
- Recent exchanges stay in browser memory and are sent with each request for follow-up context. Audio and messages are not saved to a database.

The persona is centralized in `src/data/persona.ts`. Edit only verified facts there. The starter questions guide the model; answers are generated dynamically. The assistant discloses its AI identity when asked.

## Local setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
```

Set `GEMINI_API_KEY` in `.env.local` to your own server-side Gemini API key, then run:

```bash
npm run dev
```

Open `http://localhost:3000`. The key is never requested from visitors or sent to the browser. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`, with `gemini-3.6-flash` as a fallback for temporary provider failures. The model can be changed to an accessible audio-capable model.

## Tests and verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use a real key to verify typed and audio requests. Test microphone capture and speech playback in a browser, because automated HTTP tests cannot establish that a physical microphone and speaker work.

## Deployment

Deploy the repository to Vercel as a Next.js project. Add `GEMINI_API_KEY` as a server-side environment variable for Production. Optionally set `GEMINI_MODEL`. Deploy and verify the public HTTPS URL with typed, spoken, and follow-up questions. Do not add the key as a `NEXT_PUBLIC_` variable.

## Safeguards and limits

Requests have size and content validation, a 45-second and 4 MB audio limit, same-origin browser checks, and a per-instance rate limit. The in-memory rate limit is best effort on serverless hosts; use provider edge rate limiting for a sustained public launch. Model answers are schema-validated. Visitor-supplied conversation history is treated as context, never verified biography. Browser speech synthesis quality and voice availability depend on the visitor's device. Unsupported microphone formats fall back to typed input. No accounts or persistent data store are used.
