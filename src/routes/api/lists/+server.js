import { json } from '@sveltejs/kit';
import {
	getUserLists,
	getList,
	createList,
	updateList,
	deleteList
} from '$lib/db.js';

// GET - Fetch all lists for the authenticated user
export async function GET({ locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const lists = getUserLists(locals.user.id);
		return json(lists);
	} catch (error) {
		console.error('Error fetching lists:', error);
		return json({ error: 'Failed to fetch lists' }, { status: 500 });
	}
}

// POST - Create a new list
export async function POST({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { name, isShared } = await request.json();

		if (!name || !name.trim()) {
			return json({ error: 'List name is required' }, { status: 400 });
		}

		const list = createList(locals.user.id, name.trim(), isShared || false);
		return json(list, { status: 201 });
	} catch (error) {
		console.error('Error creating list:', error);
		return json({ error: 'Failed to create list' }, { status: 500 });
	}
}

// PATCH - Update a list
export async function PATCH({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { listId, name } = await request.json();

		if (!listId) {
			return json({ error: 'List ID is required' }, { status: 400 });
		}

		if (!name || !name.trim()) {
			return json({ error: 'List name is required' }, { status: 400 });
		}

		const updatedList = updateList(listId, locals.user.id, { name: name.trim() });
		return json(updatedList);
	} catch (error) {
		if (error.message === 'Insufficient permissions') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}
		console.error('Error updating list:', error);
		return json({ error: 'Failed to update list' }, { status: 500 });
	}
}

// DELETE - Delete a list
export async function DELETE({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { listId } = await request.json();

		if (!listId) {
			return json({ error: 'List ID is required' }, { status: 400 });
		}

		deleteList(listId, locals.user.id);
		return json({ success: true });
	} catch (error) {
		if (error.message === 'Insufficient permissions') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}
		console.error('Error deleting list:', error);
		return json({ error: 'Failed to delete list' }, { status: 500 });
	}
}
