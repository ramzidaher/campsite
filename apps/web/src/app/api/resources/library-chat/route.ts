import {
  chatStaffResourceLibraryWithGemini,
  type StaffResourceChatTurn,
} from '@/lib/google-ai-studio/geminiSummarize';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
import {
  isMissingArchivedAtColumn,
  isMissingFolderHierarchyColumn,
} from '@/lib/staffResourceArchiveCompat';
import { createSupabaseForApiRequest, getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import type { PostgrestError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const MAX_CATALOG_ROWS = 350;
const MAX_SYSTEM_DATA_CHARS = 92_000;
const MAX_TEXT_EXCERPT_FILES = 14;
const MAX_EXCERPT_CHARS_PER_FILE = 5_000;
const MAX_TOTAL_EXCERPT_CHARS = 32_000;
const SMALL_TEXT_FILE_MAX_BYTES = 150 * 1024;

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

type FolderRow = { id: string; name: string; parent_id: string | null };

function buildFolderPath(
  folderId: string | null,
  byId: Map<string, FolderRow>,
): string {
  if (!folderId) return 'Uncategorised';
  const segments: string[] = [];
  let cur: string | null = folderId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    segments.unshift(row.name);
    cur = row.parent_id;
  }
  return segments.length ? segments.join(' / ') : 'Uncategorised';
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

  const messages = parseMessages((raw as { messages?: unknown }).messages);
  if (!messages) {
    return NextResponse.json(
      { error: 'messages must be a non-empty array ending with a user message.' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 503 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr || !profile?.org_id) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 403 });
  }
  if (profile.status !== 'active') {
    return NextResponse.json({ error: 'Account is not active.' }, { status: 403 });
  }

  const orgId = String(profile.org_id);

  let sr: ReturnType<typeof createServiceRoleClient>;
  try {
    sr = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: 'Server storage is not configured for Scout.' },
      { status: 503 },
    );
  }

  let folderById = new Map<string, FolderRow>();
  const folderTry = await supabase
    .from('staff_resource_folders')
    .select('id, name, parent_id')
    .eq('org_id', orgId);
  if (!folderTry.error && folderTry.data) {
    for (const r of folderTry.data as { id: string; name: string; parent_id: string | null }[]) {
      folderById.set(r.id, { id: r.id, name: String(r.name ?? ''), parent_id: r.parent_id ?? null });
    }
  } else if (folderTry.error && isMissingFolderHierarchyColumn(folderTry.error as PostgrestError)) {
    const legacy = await supabase.from('staff_resource_folders').select('id, name').eq('org_id', orgId);
    if (!legacy.error && legacy.data) {
      for (const r of legacy.data as { id: string; name: string }[]) {
        folderById.set(r.id, { id: r.id, name: String(r.name ?? ''), parent_id: null });
      }
    }
  }

  const selectWithArchive =
    'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name), archived_at';

  let rows: Record<string, unknown>[] = [];
  const first = await supabase
    .from('staff_resources')
    .select(selectWithArchive)
    .eq('org_id', orgId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(MAX_CATALOG_ROWS);

  if (first.error && isMissingArchivedAtColumn(first.error as PostgrestError)) {
    const second = await supabase
      .from('staff_resources')
      .select(
        'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name)',
      )
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(MAX_CATALOG_ROWS);
    if (second.error) {
      return NextResponse.json({ error: second.error.message ?? 'Could not load library.' }, { status: 502 });
    }
    rows = (second.data ?? []) as Record<string, unknown>[];
  } else if (first.error) {
    return NextResponse.json({ error: first.error.message ?? 'Could not load library.' }, { status: 502 });
  } else {
    rows = (first.data ?? []) as Record<string, unknown>[];
  }
  const lines: string[] = [];
  lines.push(`# Active resource library (${rows.length} documents, most recently updated first)`);
  lines.push('');

  type RowLite = {
    id: string;
    title: string;
    description: string;
    file_name: string;
    mime_type: string;
    byte_size: number;
    storage_path: string;
    folder_id: string | null;
  };

  const excerptCandidates: RowLite[] = [];

  for (const r of rows) {
    const id = String(r.id ?? '');
    const title = String(r.title ?? '');
    const description = r.description != null ? String(r.description) : '';
    const file_name = String(r.file_name ?? '');
    const mime_type = String(r.mime_type ?? 'application/octet-stream');
    const byte_size = Number(r.byte_size ?? 0);
    const storage_path = String(r.storage_path ?? '');
    const folder_id = r.folder_id != null ? String(r.folder_id) : null;
    const embed = parseStaffResourceFolderEmbed(r.staff_resource_folders);
    const folderLabel =
      folderById.size > 0 && folder_id
        ? buildFolderPath(folder_id, folderById)
        : embed?.name
          ? embed.name
          : folder_id
            ? 'Folder'
            : 'Uncategorised';

    lines.push(`- **${title || 'Untitled'}** (id: ${id})`);
    lines.push(
      `  - File: ${file_name} · Type: ${mime_type} · Size: ${byte_size} bytes · Folder: ${folderLabel}`,
    );
    if (description.trim()) {
      lines.push(`  - Description: ${description.trim().replace(/\s+/g, ' ')}`);
    }
    lines.push('');

    if (
      storage_path &&
      isTextLikeMime(mime_type) &&
      byte_size > 0 &&
      byte_size <= SMALL_TEXT_FILE_MAX_BYTES &&
      excerptCandidates.length < MAX_TEXT_EXCERPT_FILES
    ) {
      excerptCandidates.push({
        id,
        title: title || 'Untitled',
        description,
        file_name,
        mime_type,
        byte_size,
        storage_path,
        folder_id,
      });
    }
  }

  let excerptBudget = MAX_TOTAL_EXCERPT_CHARS;
  const excerptBlocks: string[] = [];

  for (const row of excerptCandidates) {
    if (excerptBudget < 500) break;
    const { data: blob, error: dlErr } = await sr.storage.from('staff-resources').download(row.storage_path);
    if (dlErr || !blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.byteLength > SMALL_TEXT_FILE_MAX_BYTES) continue;
    let text: string;
    try {
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    if (!text.trim()) continue;
    const take = Math.min(MAX_EXCERPT_CHARS_PER_FILE, excerptBudget - 200, text.length);
    const slice = text.length > take ? `${text.slice(0, take)}\n\n[truncated]` : text;
    const block = `### Text excerpt: ${row.title} (${row.file_name}, id ${row.id})\n${slice}`;
    excerptBlocks.push(block);
    excerptBudget -= block.length;
  }

  if (excerptBlocks.length > 0) {
    lines.push('## Plain-text excerpts (small text files only; PDFs and binaries are not fully inlined here)');
    lines.push('');
    lines.push(excerptBlocks.join('\n\n'));
  }

  let resourceLibraryData = lines.join('\n');
  let note: string | undefined;
  if (resourceLibraryData.length > MAX_SYSTEM_DATA_CHARS) {
    resourceLibraryData = `${resourceLibraryData.slice(0, MAX_SYSTEM_DATA_CHARS)}\n\n[Library data truncated for size.]`;
    note =
      'The library listing was very large; Scout received a truncated catalog. Narrow your question or open specific documents for full detail.';
  } else if (excerptBlocks.length === 0 && rows.some((r) => String(r.mime_type ?? '').includes('pdf'))) {
    note =
      'Scout can see your library catalog and small text files. For questions that need full PDF or Word contents, open a document and use Scout there.';
  }

  const model = process.env.GOOGLE_AI_STUDIO_MODEL?.trim();
  const result = await chatStaffResourceLibraryWithGemini({
    apiKey,
    model: model || undefined,
    resourceLibraryData,
    messages,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ reply: result.reply, ...(note ? { note } : {}) });
}
