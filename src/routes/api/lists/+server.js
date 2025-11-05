import { json } from '@sveltejs/kit';
import {
	getUserLists,
	getList,
	createList,
	updateList,
	archiveList,
	getArchivedLists,
	restoreList,
	deleteList
} from '$lib/db.js';
import { validateListName, sanitizeText } from '$lib/validation.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('ListsAPI');

// GET - Fetch all lists for the authenticated user
export async function GET({ locals, url }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const archived = url.searchParams.get('archived') === 'true';
		const lists = archived ? getArchivedLists(locals.user.id) : getUserLists(locals.user.id);
		return json(lists);
	} catch (error) {
		logger.error('Error fetching lists', error);
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

		// Validate list name
		const nameValidation = validateListName(name);
		if (!nameValidation.isValid) {
			return json({ error: nameValidation.error }, { status: 400 });
		}

		// Sanitize list name
		const sanitizedName = sanitizeText(nameValidation.value, {
			maxLength: 100,
			allowNewlines: false
		});

		const list = createList(locals.user.id, sanitizedName, isShared || false);
		return json(list, { status: 201 });
	} catch (error) {
		logger.error('Error creating list', error);
		return json({ error: 'Failed to create list' }, { status: 500 });
	}
}

// PATCH - Update a list or restore from archive
export async function PATCH({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { listId, name, action } = await request.json();

		if (!listId) {
			return json({ error: 'List ID is required' }, { status: 400 });
		}

		// Handle restore action
		if (action === 'restore') {
			restoreList(listId, locals.user.id);
			return json({ success: true });
		}

		// Handle archive action
		if (action === 'archive') {
			archiveList(listId, locals.user.id);
			return json({ success: true });
		}

		// Handle name update - validate and sanitize
		const nameValidation = validateListName(name);
		if (!nameValidation.isValid) {
			return json({ error: nameValidation.error }, { status: 400 });
		}

		// Sanitize list name
		const sanitizedName = sanitizeText(nameValidation.value, {
			maxLength: 100,
			allowNewlines: false
		});

		const updatedList = updateList(listId, locals.user.id, { name: sanitizedName });
		return json(updatedList);
	} catch (error) {
		if (error.message === 'Insufficient permissions') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}
		logger.error('Error updating list', error);
		return json({ error: 'Failed to update list' }, { status: 500 });
	}
}

// DELETE - Permanently delete an archived list
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
		if (error.message === 'List must be archived before deletion') {
			return json({ error: 'List must be archived before deletion' }, { status: 400 });
		}
		logger.error('Error deleting list', error);
		return json({ error: 'Failed to delete list' }, { status: 500 });
	}
}
