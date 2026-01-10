import { json } from '@sveltejs/kit';
import { createComment, getCommentsForTodo } from '$lib/db.js';
import { sanitizeText } from '$lib/validation.js';
import { createLogger } from '$lib/logger.js';
import { requireCsrfToken } from '$lib/csrf.js';

const logger = createLogger('CommentsAPI');

// GET - Fetch all comments for a todo
export async function GET({ url, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const todoId = url.searchParams.get('todoId');

	if (!todoId) {
		return json({ error: 'Todo ID is required' }, { status: 400 });
	}

	try {
		const comments = getCommentsForTodo(parseInt(todoId), user.id);
		return json({ comments });
	} catch (error) {
		logger.error('Error fetching comments', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// POST - Create a new comment
export async function POST({ request, locals, cookies }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Validate CSRF token
	const csrfError = requireCsrfToken({ request, cookies });
	if (csrfError) {
		return json(csrfError, { status: 403 });
	}

	try {
		const { todoId, commentText } = await request.json();

		if (!todoId || !commentText || !commentText.trim()) {
			return json({ error: 'Todo ID and comment text are required' }, { status: 400 });
		}

		// Validate comment length
		if (commentText.trim().length > 5000) {
			return json({ error: 'Comment must be less than 5000 characters' }, { status: 400 });
		}

		// Sanitize comment text
		const sanitizedComment = sanitizeText(commentText.trim(), {
			maxLength: 5000,
			allowNewlines: true
		});

		const comment = createComment(parseInt(todoId), user.id, sanitizedComment);

		// Add username to the returned comment
		comment.username = user.username;

		return json({ comment }, { status: 201 });
	} catch (error) {
		logger.error('Error creating comment', error);
		return json({ error: error.message }, { status: 500 });
	}
}
