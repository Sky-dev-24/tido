import { json } from '@sveltejs/kit';
import {
	getDeletedTodosForList,
	restoreTodo,
	permanentlyDeleteTodo,
	cleanupOldDeletedTodos,
	deleteAllDeletedTodosForList
} from '$lib/db.js';
import { emitTodoUpdate, emitTodoDelete } from '$lib/websocket.server.js';

export async function GET({ url, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const listId = url.searchParams.get('listId');

	if (!listId) {
		return json({ error: 'List ID is required' }, { status: 400 });
	}

	try {
		// Run cleanup before fetching
		cleanupOldDeletedTodos();

		const deletedTodos = getDeletedTodosForList(parseInt(listId), locals.user.id);
		return json(deletedTodos);
	} catch (error) {
		if (error.message === 'Access denied to this list') {
			return json({ error: 'Access denied to this list' }, { status: 403 });
		}
		console.error('Error fetching deleted todos:', error);
		return json({ error: 'Failed to fetch deleted todos' }, { status: 500 });
	}
}

export async function POST({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const data = await request.json();
	const { action, id, listId } = data;

	if (!action) {
		return json({ error: 'Action is required' }, { status: 400 });
	}

	// For delete-all action, we need listId instead of id
	if (action === 'delete-all') {
		if (!listId) {
			return json({ error: 'List ID is required for delete-all action' }, { status: 400 });
		}
	} else {
		if (!id) {
			return json({ error: 'ID is required' }, { status: 400 });
		}
	}

	try {
		if (action === 'restore') {
			// Restore the todo
			const restored = restoreTodo(id, locals.user.id);

			if (!restored) {
				return json({ error: 'Todo not found' }, { status: 404 });
			}

			// Emit WebSocket event to update clients
			emitTodoUpdate(restored.list_id, restored);

			return json({ success: true, todo: restored });
		} else if (action === 'permanent-delete') {
			// Get the list ID before deleting for WebSocket emit
			const todo = await import('$lib/db.js').then((db) =>
				db.default
					.prepare('SELECT list_id FROM todos WHERE id = ?')
					.get(id)
			);

			const success = permanentlyDeleteTodo(id, locals.user.id);

			if (!success) {
				return json({ error: 'Todo not found' }, { status: 404 });
			}

			// Emit WebSocket event
			if (todo) {
				emitTodoDelete(todo.list_id, id);
			}

			return json({ success: true });
		} else if (action === 'delete-all') {
			// Delete all deleted todos for the list
			const count = deleteAllDeletedTodosForList(parseInt(listId), locals.user.id);

			return json({ success: true, count });
		} else {
			return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Error processing deleted todo action:', error);
		return json({ error: 'Failed to process action' }, { status: 500 });
	}
}
