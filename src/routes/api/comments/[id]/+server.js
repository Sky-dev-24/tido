import { json } from '@sveltejs/kit';
import { updateComment, deleteComment } from '$lib/db.js';
import { sanitizeText } from '$lib/validation.js';
import { createLogger } from '$lib/logger.js';
import { requireCsrfToken } from '$lib/csrf.js';

const logger = createLogger('CommentsAPI');

// PATCH - Update a comment
export async function PATCH({ params, request, locals, cookies }) {
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
		const { commentText } = await request.json();

		if (!commentText || !commentText.trim()) {
			return json({ error: 'Comment text is required' }, { status: 400 });
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

		const comment = updateComment(parseInt(params.id), user.id, sanitizedComment);

		return json({ comment });
	} catch (error) {
		logger.error('Error updating comment', error);
		return json({ error: error.message }, { status: error.message === 'Access denied' ? 403 : 500 });
	}
}

// DELETE - Delete a comment
export async function DELETE({ params, request, locals, cookies }) {
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
		deleteComment(parseInt(params.id), user.id);

		return json({ success: true });
	} catch (error) {
		logger.error('Error deleting comment', error);
		return json({ error: error.message }, { status: error.message === 'Access denied' ? 403 : 500 });
	}
}
