import {
  MAX_RESOURCE_FILE_BYTES_FOR_AI,
  summarizeStaffResourceWithGemini,
} from '@/lib/google-ai-studio/geminiSummarize';
import { fetchStaffResourceRowForApi } from '@/lib/staffResourceArchiveCompat';
import { createSupabaseForApiRequest, getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

function isTextLikeMime(mime: string): boolean {
  const x = mime.toLowerCase();
  return x.startsWith('text/') || x === 'application/json' || x === 'application/xml';
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
      { error: 'not_configured', message: 'Scout summaries are not configured on this server.' },
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

  const resourceId =
    typeof (raw as { resourceId?: unknown }).resourceId === 'string'
      ? (raw as { resourceId: string }).resourceId.trim()
      : '';

  if (!resourceId) {
    return NextResponse.json({ error: 'resourceId is required.' }, { status: 400 });
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
      { error: 'archived', message: 'Scout summaries are not available for archived resources.' },
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
      { error: 'Server storage is not configured for Scout summaries.' },
      { status: 503 }
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
      const result = await summarizeStaffResourceWithGemini({
        apiKey,
        model: model || undefined,
        title,
        description,
        mode: 'metadata',
        fileName,
      });
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json({
        summary: result.summary,
        note: 'PDF is too large for full-text summarisation; Scout uses the title and description only.',
      });
    }
    const result = await summarizeStaffResourceWithGemini({
      apiKey,
      model: model || undefined,
      title,
      description,
      mode: 'pdf',
      pdfBase64: buf.toString('base64'),
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ summary: result.summary });
  }

  if (isTextLikeMime(mimeType)) {
    if (buf.byteLength > MAX_RESOURCE_FILE_BYTES_FOR_AI) {
      const result = await summarizeStaffResourceWithGemini({
        apiKey,
        model: model || undefined,
        title,
        description,
        mode: 'metadata',
        fileName,
      });
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json({
        summary: result.summary,
        note: 'File is too large for full-text summarisation; Scout uses the title and description only.',
      });
    }
    const textBody = buf.toString('utf8');
    const result = await summarizeStaffResourceWithGemini({
      apiKey,
      model: model || undefined,
      title,
      description,
      mode: 'text',
      textBody,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ summary: result.summary });
  }

  const result = await summarizeStaffResourceWithGemini({
    apiKey,
    model: model || undefined,
    title,
    description,
    mode: 'metadata',
    fileName,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    summary: result.summary,
    note: 'This file type is summarised by Scout from the title and description only. Open the document for full details.',
  });
}
