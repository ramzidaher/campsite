import { summarizeBroadcastWithGemini } from '@/lib/google-ai-studio/geminiSummarize';
import { getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';
import { NextResponse } from 'next/server';

const MIN_BODY = 1;
const MAX_BODY = 15_000;

export async function POST(req: Request) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Prefer CampSite name; fall back to GEMINI_API_KEY (Google's docs / GenAI SDK default).
  const apiKey =
    process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'AI summary is not configured on this server.' },
      { status: 503 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const title = typeof (raw as { title?: unknown }).title === 'string' ? (raw as { title: string }).title : '';
  const body = typeof (raw as { body?: unknown }).body === 'string' ? (raw as { body: string }).body : '';

  const len = body.length;
  if (len < MIN_BODY || len > MAX_BODY) {
    return NextResponse.json(
      { error: `Body must be between ${MIN_BODY} and ${MAX_BODY} characters.` },
      { status: 400 }
    );
  }

  const model = process.env.GOOGLE_AI_STUDIO_MODEL?.trim();
  const result = await summarizeBroadcastWithGemini({
    apiKey,
    model: model || undefined,
    title,
    body,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ summary: result.summary });
}
