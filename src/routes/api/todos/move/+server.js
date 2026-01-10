import { json } from '@sveltejs/kit';
import { moveTodoToList } from '$lib/db.js';
import { emitTodoCreate, emitTodoDelete, emitTodoUpdate } from '$lib/websocket.server.js';
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
	const todoId = payload?.todoId;
	const targetListId = payload?.targetListId;
	const targetParentId =
		payload?.targetParentId === null || payload?.targetParentId === undefined
			? null
			: payload.targetParentId;
	const targetIndex = payload?.targetIndex ?? null;

	if (!Number.isInteger(Number(todoId)) || !Number.isInteger(Number(targetListId))) {
		return json({ error: 'Invalid move payload' }, { status: 400 });
	}

	try {
		const { todo, previousListId } = moveTodoToList(
			Number(todoId),
			locals.user.id,
			Number(targetListId),
			targetParentId,
			targetIndex
		);

		const newListId = todo.list_id;

		if (previousListId !== newListId) {
			emitTodoDelete(previousListId, todo.id);
			emitTodoCreate(newListId, todo);
		} else {
			emitTodoUpdate(newListId, todo);
		}

		return json({
			success: true,
			todo,
			previousListId,
			targetListId: newListId
		});
	} catch (error) {
		if (
			error.message === 'Todo not found' ||
			error.message === 'Access denied to target list' ||
			error.message === 'Invalid move payload' ||
			error.message === 'Invalid parent todo id' ||
			error.message === 'Parent todo not found' ||
			error.message === 'Parent todo must belong to target list' ||
			error.message === 'Subtasks cannot have subtasks' ||
			error.message === 'Todo cannot be its own parent'
		) {
			return json({ error: error.message }, { status: 400 });
		}

		console.error('Error moving todo:', error);
		return json({ error: 'Failed to move todo' }, { status: 500 });
	}
}

