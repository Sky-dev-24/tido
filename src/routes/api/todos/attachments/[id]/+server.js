import { json } from '@sveltejs/kit';
import { getAttachmentForUser, deleteTaskAttachment } from '$lib/db.js';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

function buildSanitizedAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    todo_id: row.todo_id,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size,
    created_at: row.created_at
  };
}

function buildContentDisposition(filename) {
  const safeFilename = filename.replace(/["\r\n]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encoded}`;
}

export async function GET({ params, locals }) {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = Number.parseInt(params.id, 10);
  if (!Number.isInteger(id)) {
    return new Response('Invalid attachment id', { status: 400 });
  }

  const attachment = getAttachmentForUser(id, locals.user.id);
  if (!attachment) {
    return new Response('Attachment not found', { status: 404 });
  }

  const filePath = join(UPLOAD_DIR, attachment.stored_name);

  try {
    const fileBuffer = await readFile(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': attachment.mime_type || 'application/octet-stream',
        'Content-Disposition': buildContentDisposition(attachment.original_name),
        ...(attachment.size ? { 'Content-Length': String(attachment.size) } : {})
      }
    });
  } catch (error) {
    console.error('Failed to read attachment:', error);
    return new Response('Attachment unavailable', { status: 410 });
  }
}

export async function DELETE({ params, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number.parseInt(params.id, 10);
  if (!Number.isInteger(id)) {
    return json({ error: 'Invalid attachment id' }, { status: 400 });
  }

  const attachment = deleteTaskAttachment(id, locals.user.id);
  if (!attachment) {
    return json({ error: 'Attachment not found' }, { status: 404 });
  }

  const filePath = join(UPLOAD_DIR, attachment.stored_name);
  await unlink(filePath).catch(() => {});

  return json({ success: true, attachment: buildSanitizedAttachment(attachment) });
}
