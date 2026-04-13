import { userFacingScoutError } from '@campsite/types';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_INPUT_CHARS = 14_000;
/** Inline PDFs cannot exceed Gemini request limits; keep conservative. */
export const MAX_RESOURCE_FILE_BYTES_FOR_AI = 10 * 1024 * 1024;

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
    return { error: userFacingScoutError(e instanceof Error ? e.message : 'Request failed') };
  }

  let json: GenerateResponse;
  try {
    json = (await res.json()) as GenerateResponse;
  } catch {
    return { error: 'Invalid response from AI service' };
  }

  if (!res.ok) {
    const raw = json.error?.message ?? res.statusText ?? 'AI request failed';
    return { error: userFacingScoutError(raw) };
  }

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')?.trim();
  if (!text) {
    return { error: 'No summary returned; try again or shorten the message.' };
  }

  return { summary: text };
}

function resourcePromptPreamble(title: string, description: string): string {
  const t = title.trim() || 'Untitled';
  const d = description.trim();
  return `You help staff understand internal policy and reference documents for camps, schools, and teams.
Summarize in 2–5 short bullet points (max ~150 words) what readers need to know: key rules, deadlines, who to contact, exceptions, and required actions.
If information is missing from the document, say so — do not invent policies or dates.

Title: ${t}
${d ? `Description: ${d}\n` : ''}`;
}

export async function summarizeStaffResourceWithGemini(opts: {
  apiKey: string;
  model?: string;
  title: string;
  description: string;
  mode: 'pdf' | 'text' | 'metadata';
  /** Raw text or UTF-8 decoded document (truncated by caller). */
  textBody?: string;
  pdfBase64?: string;
  fileName?: string;
}): Promise<{ summary: string } | { error: string }> {
  const model = (opts.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const base = resourcePromptPreamble(opts.title, opts.description);

  let parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>;

  if (opts.mode === 'pdf' && opts.pdfBase64) {
    parts = [
      { text: `${base}\n\nUse the attached PDF as the only source.` },
      { inline_data: { mime_type: 'application/pdf', data: opts.pdfBase64 } },
    ];
  } else if (opts.mode === 'text' && opts.textBody != null) {
    let body = opts.textBody;
    if (body.length > MAX_INPUT_CHARS) {
      body = `${body.slice(0, MAX_INPUT_CHARS)}\n\n[truncated]`;
    }
    const plain = stripForPrompt(body);
    parts = [{ text: `${base}\n\nDocument:\n${plain}` }];
  } else {
    const name = (opts.fileName ?? 'file').trim() || 'file';
    parts = [
      {
        text: `${base}
No machine-readable body was provided for this file type (${name}). Summarize only what can be inferred from the title and description above, and add one line: "Open the document for full details."`,
      },
    ];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 640,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return { error: userFacingScoutError(e instanceof Error ? e.message : 'Request failed') };
  }

  let json: GenerateResponse;
  try {
    json = (await res.json()) as GenerateResponse;
  } catch {
    return { error: 'Invalid response from AI service' };
  }

  if (!res.ok) {
    const raw = json.error?.message ?? res.statusText ?? 'AI request failed';
    return { error: userFacingScoutError(raw) };
  }

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')?.trim();
  if (!text) {
    return { error: 'No summary returned; try again.' };
  }

  return { summary: text };
}

export type StaffResourceChatTurn = { role: 'user' | 'assistant'; content: string };

const CHAT_PREAMBLE = (title: string, description: string) => {
  const t = title.trim() || 'Untitled';
  const d = description.trim();
  return `You help staff find information in an internal organisation document (handbooks, policies, reference files).
Answer using only the attached document content when it is provided below. If the answer is not in the document, say you cannot find it in this file and suggest what to look for. Be concise and clear. You may use short bullet points.

Document title: ${t}
${d ? `Description: ${d}\n` : ''}`;
};

/** Stateless chat: caller sends full history; first user turn includes the document (PDF inline or text body). */
export async function chatStaffResourceWithGemini(opts: {
  apiKey: string;
  model?: string;
  title: string;
  description: string;
  mode: 'pdf' | 'text' | 'metadata';
  textBody?: string;
  pdfBase64?: string;
  fileName?: string;
  messages: StaffResourceChatTurn[];
}): Promise<{ reply: string } | { error: string }> {
  const model = (opts.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const preamble = CHAT_PREAMBLE(opts.title, opts.description);
  const msgs = opts.messages;
  if (msgs.length < 1 || msgs[msgs.length - 1]?.role !== 'user') {
    return { error: 'Invalid conversation: last message must be from the user.' };
  }

  type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
  const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
  let firstUserPlaced = false;

  for (const m of msgs) {
    if (m.role === 'user') {
      if (!firstUserPlaced) {
        firstUserPlaced = true;
        const q = m.content.trim();
        if (opts.mode === 'pdf' && opts.pdfBase64) {
          contents.push({
            role: 'user',
            parts: [
              {
                text: `${preamble}

Use the attached PDF as the only source of facts.

Question:
${q}`,
              },
              { inline_data: { mime_type: 'application/pdf', data: opts.pdfBase64 } },
            ],
          });
        } else if (opts.mode === 'text' && opts.textBody != null) {
          let body = opts.textBody;
          if (body.length > MAX_INPUT_CHARS) {
            body = `${body.slice(0, MAX_INPUT_CHARS)}\n\n[truncated]`;
          }
          const plain = stripForPrompt(body);
          contents.push({
            role: 'user',
            parts: [
              {
                text: `${preamble}

--- Document ---
${plain}
--- End ---

Question:
${q}`,
              },
            ],
          });
        } else {
          const name = (opts.fileName ?? 'file').trim() || 'file';
          contents.push({
            role: 'user',
            parts: [
              {
                text: `${preamble}

Only the title and description are available for this file type (${name}). Answer from that context only, and say the full document must be opened for complete details.

Question:
${q}`,
              },
            ],
          });
        }
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: m.content.trim() }],
        });
      }
    } else {
      contents.push({
        role: 'model',
        parts: [{ text: m.content.trim() }],
      });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return { error: userFacingScoutError(e instanceof Error ? e.message : 'Request failed') };
  }

  let json: GenerateResponse;
  try {
    json = (await res.json()) as GenerateResponse;
  } catch {
    return { error: 'Invalid response from AI service' };
  }

  if (!res.ok) {
    const raw = json.error?.message ?? res.statusText ?? 'AI request failed';
    return { error: userFacingScoutError(raw) };
  }

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')?.trim();
  if (!text) {
    return { error: 'No reply returned; try a shorter question.' };
  }

  return { reply: text };
}
