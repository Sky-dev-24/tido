import { json } from '@sveltejs/kit';
import { createTaskAttachment } from '$lib/db.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import crypto from 'crypto';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit for now
const UPLOAD_DIR = join(process.cwd(), 'uploads');

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

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

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const todoIdRaw = formData.get('todoId');
  const file = formData.get('file');

  const todoId = Number.parseInt(todoIdRaw, 10);
  if (!Number.isInteger(todoId)) {
    return json({ error: 'A valid todoId is required' }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (file.size === 0) {
    return json({ error: 'Uploaded file is empty' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return json({ error: 'File exceeds maximum size of 10 MB' }, { status: 413 });
  }

  ensureUploadDir();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const storedName = `${crypto.randomUUID()}${extension}`;
  const filePath = join(UPLOAD_DIR, storedName);

  try {
    await writeFile(filePath, buffer);

    const attachment = createTaskAttachment(todoId, locals.user.id, {
      original_name: file.name,
      stored_name: storedName,
      mime_type: file.type || null,
      size: buffer.length
    });

    return json({ attachment: buildSanitizedAttachment(attachment) }, { status: 201 });
  } catch (error) {
    await unlink(filePath).catch(() => {});

    if (error.message === 'Todo not found') {
      return json({ error: 'Todo not found or access denied' }, { status: 404 });
    }

    console.error('Attachment upload failed:', error);
    return json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
