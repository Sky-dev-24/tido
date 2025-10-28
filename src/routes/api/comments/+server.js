import { json } from '@sveltejs/kit';
import { createComment, getCommentsForTodo } from '$lib/db.js';

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
		console.error('Error fetching comments:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// POST - Create a new comment
export async function POST({ request, locals }) {
	const { user } = locals;

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { todoId, commentText } = await request.json();

		if (!todoId || !commentText || !commentText.trim()) {
			return json({ error: 'Todo ID and comment text are required' }, { status: 400 });
		}

		const comment = createComment(parseInt(todoId), user.id, commentText.trim());

		// Add username to the returned comment
		comment.username = user.username;

		return json({ comment }, { status: 201 });
	} catch (error) {
		console.error('Error creating comment:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
