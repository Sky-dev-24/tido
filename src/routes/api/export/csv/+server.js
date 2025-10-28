import { getTodosForList, getList } from '$lib/db.js';

function escapeCSV(value) {
	if (value === null || value === undefined) {
		return '';
	}
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function formatCSVRow(fields) {
	return fields.map(escapeCSV).join(',');
}

export async function POST({ request, locals }) {
	const { user } = locals;

	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	try {
		const { listId } = await request.json();

		if (!listId) {
			return new Response('List ID is required', { status: 400 });
		}

		// Get list details
		const list = getList(listId, user.id);
		if (!list) {
			return new Response('List not found or access denied', { status: 404 });
		}

		// Get todos for the list
		const todos = getTodosForList(listId, user.id);

		// Build CSV content
		const headers = [
			'ID',
			'Text',
			'Completed',
			'Completed At',
			'Completed By',
			'Due Date',
			'Reminder (minutes)',
			'Priority',
			'Notes',
			'Parent Task ID',
			'Assigned To',
			'Is Recurring',
			'Recurrence Pattern',
			'Created At',
			'Sort Order'
		];

		const rows = todos.map((t) => [
			t.id,
			t.text,
			t.completed ? 'Yes' : 'No',
			t.completed_at || '',
			t.completed_by_username || '',
			t.due_date || '',
			t.reminder_minutes_before || '',
			t.priority || '',
			t.notes || '',
			t.parent_todo_id || '',
			t.assigned_to_username || '',
			t.is_recurring ? 'Yes' : 'No',
			t.recurrence_pattern || '',
			t.created_at || '',
			t.sort_order || ''
		]);

		const csvLines = [formatCSVRow(headers), ...rows.map(formatCSVRow)];
		const csvContent = csvLines.join('\n');

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="${list.name}-export-${new Date().toISOString().split('T')[0]}.csv"`
			}
		});
	} catch (error) {
		console.error('CSV export error:', error);
		return new Response(error.message, { status: 500 });
	}
}
