import { json } from '@sveltejs/kit';
import db, {
  getTodosForList,
  createTodo,
  updateTodo,
  deleteTodo,
  getAttachmentFilesForTodo
} from '$lib/db.js';
import { emitTodoCreate, emitTodoUpdate, emitTodoDelete, getIO } from '$lib/websocket.server.js';
import { join } from 'path';
import { unlink } from 'fs/promises';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

export async function GET({ url, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listId = url.searchParams.get('listId');

  if (!listId) {
    return json({ error: 'List ID is required' }, { status: 400 });
  }

  try {
    const todos = getTodosForList(parseInt(listId), locals.user.id);
    return json(todos);
  } catch (error) {
    if (error.message === 'Access denied to this list') {
      return json({ error: 'Access denied to this list' }, { status: 403 });
    }
    console.error('Error fetching todos:', error);
    return json({ error: 'Failed to fetch todos' }, { status: 500 });
  }
}

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();
  const { listId, text, isRecurring, recurrencePattern, dueDate, reminderMinutesBefore, priority, parentId, assignedTo } = data;

  if (!listId) {
    return json({ error: 'List ID is required' }, { status: 400 });
  }

  if (!text || !text.trim()) {
    return json({ error: 'Text is required' }, { status: 400 });
  }

  try {
    const todo = createTodo(
      parseInt(listId),
      locals.user.id,
      text.trim(),
      isRecurring,
      recurrencePattern,
      dueDate ?? null,
      reminderMinutesBefore ?? null,
      priority ?? 'medium',
      parentId !== undefined && parentId !== null ? parseInt(parentId) : null,
      assignedTo ?? null
    );
    console.log('[API] Todo created, about to emit WebSocket event for list', parseInt(listId));
    emitTodoCreate(parseInt(listId), todo);
    console.log('[API] WebSocket event emitted');
    return json(todo, { status: 201 });
  } catch (error) {
    if (error.message === 'Access denied to this list') {
      return json({ error: 'Access denied to this list' }, { status: 403 });
    }
    if (error.message === 'Subtasks cannot have subtasks') {
      return json({ error: error.message }, { status: 400 });
    }
    if (error.message === 'Assignee must be a list member' || error.message === 'Invalid assignee id') {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating todo:', error);
    return json({ error: 'Failed to create todo' }, { status: 500 });
  }
}

export async function PATCH({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();
  const { id, ...updates } = data;

  if (!id) {
    return json({ error: 'ID is required' }, { status: 400 });
  }

  try {
    const todo = updateTodo(id, locals.user.id, updates);

    if (!todo) {
      return json({ error: 'Todo not found' }, { status: 404 });
    }

    emitTodoUpdate(todo.list_id, todo);
    return json(todo);
  } catch (error) {
    if (error.message === 'Cannot complete parent task with incomplete subtasks') {
      return json({ error: error.message }, { status: 400 });
    }
    if (error.message === 'Assignee must be a list member' || error.message === 'Invalid assignee id') {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('Error updating todo:', error);
    return json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

export async function DELETE({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();
  const { id } = data;

  if (!id) {
    return json({ error: 'ID is required' }, { status: 400 });
  }

  const attachments = getAttachmentFilesForTodo(id, locals.user.id);

  // Get the todo before deletion to access its list_id for WebSocket emit
  const todoToDelete = db.prepare(`
    SELECT t.list_id
    FROM todos t
    JOIN list_members lm ON t.list_id = lm.list_id
    WHERE t.id = ? AND lm.user_id = ?
  `).get(id, locals.user.id);

  const success = deleteTodo(id, locals.user.id);

  if (!success) {
    return json({ error: 'Todo not found' }, { status: 404 });
  }

  if (todoToDelete) {
    emitTodoDelete(todoToDelete.list_id, id);
  }

  await Promise.all(
    (attachments ?? []).map((attachment) =>
      unlink(join(UPLOAD_DIR, attachment.stored_name)).catch(() => {})
    )
  );

  return json({ success: true });
}
