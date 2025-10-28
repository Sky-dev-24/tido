import { json } from '@sveltejs/kit';
import { getTodosForList, getList, getListMembersForUser } from '$lib/db.js';

export async function POST({ request, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { listId } = await request.json();

		if (!listId) {
			return json({ error: 'List ID is required' }, { status: 400 });
		}

		// Get list details
		const list = getList(listId, user.id);
		if (!list) {
			return json({ error: 'List not found or access denied' }, { status: 404 });
		}

		// Get todos for the list
		const todos = getTodosForList(listId, user.id);

		// Get members
		const members = getListMembersForUser(listId, user.id);

		// Prepare export data
		const exportData = {
			metadata: {
				exportDate: new Date().toISOString(),
				exportVersion: '1.0',
				appName: 'Tido',
				listName: list.name,
				listId: list.id,
				created_at: list.created_at
			},
			list: {
				id: list.id,
				name: list.name,
				is_shared: list.is_shared,
				created_at: list.created_at
			},
			members: members.map((m) => ({
				username: m.username,
				email: m.email,
				permission_level: m.permission_level
			})),
			todos: todos.map((t) => ({
				id: t.id,
				text: t.text,
				completed: Boolean(t.completed),
				completed_at: t.completed_at,
				completed_by_username: t.completed_by_username,
				due_date: t.due_date,
				reminder_minutes_before: t.reminder_minutes_before,
				priority: t.priority,
				notes: t.notes,
				parent_todo_id: t.parent_todo_id,
				assigned_to_username: t.assigned_to_username,
				assigned_to_email: t.assigned_to_email,
				is_recurring: Boolean(t.is_recurring),
				recurrence_pattern: t.recurrence_pattern,
				created_at: t.created_at,
				sort_order: t.sort_order,
				attachments: t.attachments || []
			}))
		};

		return json(exportData);
	} catch (error) {
		console.error('JSON export error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
