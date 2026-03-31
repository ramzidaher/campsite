const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_INPUT_CHARS = 14_000;

type GeminiPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };

type GenerateResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string; code?: number };
};

function stripForPrompt(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\-]{1,3}\s?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function summarizeBroadcastWithGemini(opts: {
  apiKey: string;
  model?: string;
  title: string;
  body: string;
}): Promise<{ summary: string } | { error: string }> {
  const model = (opts.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const body =
    opts.body.length > MAX_INPUT_CHARS
      ? `${opts.body.slice(0, MAX_INPUT_CHARS)}\n\n[truncated]`
      : opts.body;
  const plain = stripForPrompt(body);
  const title = opts.title.trim() || 'Untitled';

  const prompt = `You help staff read internal organisation broadcasts (camps, schools, teams).
Summarize the message in 2-4 short bullet points or one tight paragraph (max ~120 words).
Keep dates, times, locations, deadlines, and action items accurate. Do not invent details.

Title: ${title}

Message:
${plain}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 512,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return { error: msg };
  }

  let json: GenerateResponse;
  try {
    json = (await res.json()) as GenerateResponse;
  } catch {
    return { error: 'Invalid response from AI service' };
  }

  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText ?? 'AI request failed';
    return { error: msg };
  }

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')?.trim();
  if (!text) {
    return { error: 'No summary returned; try again or shorten the message.' };
  }

  return { summary: text };
}
