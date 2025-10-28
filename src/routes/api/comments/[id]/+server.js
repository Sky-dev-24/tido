import { json } from '@sveltejs/kit';
import { updateComment, deleteComment } from '$lib/db.js';

// PATCH - Update a comment
export async function PATCH({ params, request, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { commentText } = await request.json();

		if (!commentText || !commentText.trim()) {
			return json({ error: 'Comment text is required' }, { status: 400 });
		}

		const comment = updateComment(parseInt(params.id), user.id, commentText.trim());

		return json({ comment });
	} catch (error) {
		console.error('Error updating comment:', error);
		return json({ error: error.message }, { status: error.message === 'Access denied' ? 403 : 500 });
	}
}

// DELETE - Delete a comment
export async function DELETE({ params, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		deleteComment(parseInt(params.id), user.id);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting comment:', error);
		return json({ error: error.message }, { status: error.message === 'Access denied' ? 403 : 500 });
	}
}
