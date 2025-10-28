import { json } from '@sveltejs/kit';
import { createTodo, createList, getList } from '$lib/db.js';

function parseCSV(csvText) {
	const lines = csvText.split('\n').filter((line) => line.trim());
	if (lines.length === 0) {
		throw new Error('Empty CSV file');
	}

	const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
	const todos = [];

	for (let i = 1; i < lines.length; i++) {
		const values = [];
		let current = '';
		let inQuotes = false;

		for (let j = 0; j < lines[i].length; j++) {
			const char = lines[i][j];
			if (char === '"') {
				if (inQuotes && lines[i][j + 1] === '"') {
					current += '"';
					j++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === ',' && !inQuotes) {
				values.push(current);
				current = '';
			} else {
				current += char;
			}
		}
		values.push(current);

		const todo = {};
		headers.forEach((header, index) => {
			const value = values[index]?.trim() || '';
			todo[header] = value;
		});
		todos.push(todo);
	}

	return todos;
}

export async function POST({ request, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		const listId = formData.get('listId');
		const createNewList = formData.get('createNewList') === 'true';
		const newListName = formData.get('newListName');

		if (!file) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Read file content
		const fileContent = await file.text();
		const fileType = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';

		let targetListId = listId;

		// Create new list if requested
		if (createNewList && newListName) {
			const newList = createList(user.id, newListName, false);
			targetListId = newList.id;
		} else if (!targetListId) {
			return json({ error: 'List ID is required' }, { status: 400 });
		}

		// Verify user has access to the list
		const list = getList(targetListId, user.id);
		if (!list) {
			return json({ error: 'List not found or access denied' }, { status: 404 });
		}

		let todos;
		let importedCount = 0;
		const errors = [];

		if (fileType === 'json') {
			// Parse JSON
			const data = JSON.parse(fileContent);
			todos = data.todos || data;

			if (!Array.isArray(todos)) {
				return json({ error: 'Invalid JSON format: expected array of todos' }, { status: 400 });
			}

			// Import todos (root tasks first, then subtasks)
			const idMapping = new Map(); // Map old IDs to new IDs
			const rootTodos = todos.filter((t) => !t.parent_todo_id && !t.parent_todo_id);
			const subtasks = todos.filter((t) => t.parent_todo_id || t.parent_todo_id);

			// Import root todos first
			for (const todo of rootTodos) {
				try {
					const newTodo = createTodo(
						targetListId,
						user.id,
						todo.text || todo.Text || 'Imported task',
						Boolean(todo.is_recurring || todo['Is Recurring'] === 'Yes'),
						todo.recurrence_pattern || todo['Recurrence Pattern'] || null,
						todo.due_date || todo['Due Date'] || null,
						todo.reminder_minutes_before || todo['Reminder (minutes)'] || null,
						todo.priority || todo.Priority || 'medium',
						null,
						null
					);
					idMapping.set(todo.id || todo.ID, newTodo.id);
					importedCount++;
				} catch (err) {
					errors.push(`Failed to import task "${todo.text || todo.Text}": ${err.message}`);
				}
			}

			// Import subtasks
			for (const subtask of subtasks) {
				try {
					const parentId = idMapping.get(subtask.parent_todo_id || subtask['Parent Task ID']);
					if (!parentId) {
						errors.push(`Skipped subtask "${subtask.text || subtask.Text}": parent not found`);
						continue;
					}

					createTodo(
						targetListId,
						user.id,
						subtask.text || subtask.Text || 'Imported subtask',
						Boolean(subtask.is_recurring || subtask['Is Recurring'] === 'Yes'),
						subtask.recurrence_pattern || subtask['Recurrence Pattern'] || null,
						subtask.due_date || subtask['Due Date'] || null,
						subtask.reminder_minutes_before || subtask['Reminder (minutes)'] || null,
						subtask.priority || subtask.Priority || 'medium',
						parentId,
						null
					);
					importedCount++;
				} catch (err) {
					errors.push(`Failed to import subtask "${subtask.text || subtask.Text}": ${err.message}`);
				}
			}
		} else {
			// Parse CSV
			todos = parseCSV(fileContent);

			// Import todos (root tasks first)
			const idMapping = new Map();
			const rootTodos = todos.filter((t) => !t['Parent Task ID']);
			const subtasks = todos.filter((t) => t['Parent Task ID']);

			// Import root todos
			for (const todo of rootTodos) {
				try {
					const newTodo = createTodo(
						targetListId,
						user.id,
						todo.Text || 'Imported task',
						todo['Is Recurring'] === 'Yes',
						todo['Recurrence Pattern'] || null,
						todo['Due Date'] || null,
						todo['Reminder (minutes)'] || null,
						todo.Priority || 'medium',
						null,
						null
					);
					idMapping.set(todo.ID, newTodo.id);
					importedCount++;
				} catch (err) {
					errors.push(`Failed to import task "${todo.Text}": ${err.message}`);
				}
			}

			// Import subtasks
			for (const subtask of subtasks) {
				try {
					const parentId = idMapping.get(subtask['Parent Task ID']);
					if (!parentId) {
						errors.push(`Skipped subtask "${subtask.Text}": parent not found`);
						continue;
					}

					createTodo(
						targetListId,
						user.id,
						subtask.Text || 'Imported subtask',
						subtask['Is Recurring'] === 'Yes',
						subtask['Recurrence Pattern'] || null,
						subtask['Due Date'] || null,
						subtask['Reminder (minutes)'] || null,
						subtask.Priority || 'medium',
						parentId,
						null
					);
					importedCount++;
				} catch (err) {
					errors.push(`Failed to import subtask "${subtask.Text}": ${err.message}`);
				}
			}
		}

		return json({
			success: true,
			importedCount,
			listId: targetListId,
			listName: list.name,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (error) {
		console.error('Import error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
