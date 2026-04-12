import {
  MAX_RESOURCE_FILE_BYTES_FOR_AI,
  chatStaffResourceWithGemini,
  type StaffResourceChatTurn,
} from '@/lib/google-ai-studio/geminiSummarize';
import { fetchStaffResourceRowForApi } from '@/lib/staffResourceArchiveCompat';
import { createSupabaseForApiRequest, getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

function isTextLikeMime(mime: string): boolean {
  const x = mime.toLowerCase();
  return x.startsWith('text/') || x === 'application/json' || x === 'application/xml';
}

function parseMessages(raw: unknown): StaffResourceChatTurn[] | null {
  if (!raw || !Array.isArray(raw) || raw.length < 1) return null;
  const out: StaffResourceChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || !content.trim()) return null;
    out.push({ role, content: content.trim() });
  }
  if (out[out.length - 1]?.role !== 'user') return null;
  if (out.length > 24) return null;
  return out;
}

export async function POST(req: Request) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey =
    process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Scout is not configured on this server.' },
      { status: 503 },
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

  const resourceId =
    typeof (raw as { resourceId?: unknown }).resourceId === 'string'
      ? (raw as { resourceId: string }).resourceId.trim()
      : '';
  const messages = parseMessages((raw as { messages?: unknown }).messages);

  if (!resourceId) {
    return NextResponse.json({ error: 'resourceId is required.' }, { status: 400 });
  }
  if (!messages) {
    return NextResponse.json({ error: 'messages must be a non-empty array ending with a user message.' }, { status: 400 });
  }

  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 503 });
  }
  const { data: row, error: rowErr } = await fetchStaffResourceRowForApi(supabase, resourceId);

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Resource not found.' }, { status: 404 });
  }
  if (row.archived_at != null && row.archived_at !== '') {
    return NextResponse.json(
      { error: 'archived', message: 'Scout is not available for archived resources.' },
      { status: 403 },
    );
  }

  const title = String(row.title ?? '');
  const description = String(row.description ?? '');
  const storagePath = String(row.storage_path ?? '');
  const fileName = String(row.file_name ?? '');
  const mimeType = String(row.mime_type ?? 'application/octet-stream');

  let sr: ReturnType<typeof createServiceRoleClient>;
  try {
    sr = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: 'Server storage is not configured for Scout.' },
      { status: 503 },
    );
  }

  const { data: blob, error: dlErr } = await sr.storage.from('staff-resources').download(storagePath);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? 'Could not read file.' }, { status: 502 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const model = process.env.GOOGLE_AI_STUDIO_MODEL?.trim();

  if (mimeType.toLowerCase() === 'application/pdf') {
    if (buf.byteLength > MAX_RESOURCE_FILE_BYTES_FOR_AI) {
      const result = await chatStaffResourceWithGemini({
        apiKey,
        model: model || undefined,
        title,
        description,
        mode: 'metadata',
        fileName,
        messages,
      });
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json({
        reply: result.reply,
        note: 'This PDF is too large to send to Scout; answers use the title and description only.',
      });
    }
    const result = await chatStaffResourceWithGemini({
      apiKey,
      model: model || undefined,
      title,
      description,
      mode: 'pdf',
      pdfBase64: buf.toString('base64'),
      messages,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ reply: result.reply });
  }

  if (isTextLikeMime(mimeType)) {
    if (buf.byteLength > MAX_RESOURCE_FILE_BYTES_FOR_AI) {
      const result = await chatStaffResourceWithGemini({
        apiKey,
        model: model || undefined,
        title,
        description,
        mode: 'metadata',
        fileName,
        messages,
      });
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json({
        reply: result.reply,
        note: 'This file is too large to send to Scout in full; answers use the title and description only.',
      });
    }
    const textBody = buf.toString('utf8');
    const result = await chatStaffResourceWithGemini({
      apiKey,
      model: model || undefined,
      title,
      description,
      mode: 'text',
      textBody,
      messages,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ reply: result.reply });
  }

  const result = await chatStaffResourceWithGemini({
    apiKey,
    model: model || undefined,
    title,
    description,
    mode: 'metadata',
    fileName,
    messages,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    reply: result.reply,
    note: 'This file type is not read as text; Scout uses the title and description only.',
  });
}
