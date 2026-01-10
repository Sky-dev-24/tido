import { json } from '@sveltejs/kit';
import { reorderTodos } from '$lib/db.js';
import { requireCsrfToken } from '$lib/csrf.js';

export async function POST({ request, locals, cookies }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate CSRF token
  const csrfError = requireCsrfToken({ request, cookies });
  if (csrfError) {
    return json(csrfError, { status: 403 });
  }

  const payload = await request.json();
  const listId = payload?.listId;
  const updates = Array.isArray(payload?.updates) ? payload.updates : [];

  if (!listId || updates.length === 0) {
    return json({ error: 'List ID and updates are required' }, { status: 400 });
  }

  const normalizedUpdates = updates
    .map((update) => ({
      id: Number(update?.id),
      sortOrder: Number(update?.sortOrder),
      parentId:
        update?.parentId === null || update?.parentId === undefined
          ? null
          : Number(update.parentId)
    }))
    .filter((update) => Number.isInteger(update.id) && Number.isInteger(update.sortOrder));

  if (normalizedUpdates.length === 0) {
    return json({ error: 'No valid updates provided' }, { status: 400 });
  }

  try {
    reorderTodos(Number(listId), locals.user.id, normalizedUpdates);
    return json({ success: true });
  } catch (error) {
    if (error.message === 'Access denied to this list') {
      return json({ error: 'Access denied to this list' }, { status: 403 });
    }
    if (
      error.message === 'Todo not found' ||
      error.message === 'Cannot change parent via reorder' ||
      error.message === 'Todo does not belong to this list' ||
      error.message === 'Invalid reorder payload'
    ) {
      return json({ error: error.message }, { status: 400 });
    }

    console.error('Error reordering todos:', error);
    return json({ error: 'Failed to reorder todos' }, { status: 500 });
  }
}

