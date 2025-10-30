<script>
	import { createEventDispatcher } from 'svelte';

	let {
		todoId = 0,
		todoText = '',
		isOpen = false,
		onClose = () => {}
	} = $props();

	const dispatch = createEventDispatcher();

	let comments = $state([]);
	let newCommentText = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let editingCommentId = $state(null);
	let editText = $state('');

	function emitCommentCount(count) {
		if (!todoId) return;
		const normalizedCount = Number.isFinite(Number(count)) ? Number(count) : 0;
		dispatch('comment-count-change', {
			todoId,
			count: normalizedCount
		});
	}

	async function fetchComments() {
		if (!todoId) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/comments?todoId=${todoId}`);
			const data = await response.json();

			if (response.ok) {
				comments = data.comments || [];
				emitCommentCount(comments.length);
			} else {
				error = data.error || 'Failed to load comments';
			}
		} catch (err) {
			error = 'Network error loading comments';
			console.error('Error fetching comments:', err);
		} finally {
			isLoading = false;
		}
	}

	async function addComment() {
		if (!newCommentText.trim()) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					todoId,
					commentText: newCommentText.trim()
				})
			});

			const data = await response.json();

			if (response.ok) {
				comments = [...comments, data.comment];
				newCommentText = '';
				emitCommentCount(comments.length);
			} else {
				error = data.error || 'Failed to add comment';
			}
		} catch (err) {
			error = 'Network error adding comment';
			console.error('Error adding comment:', err);
		} finally {
			isLoading = false;
		}
	}

	async function updateComment(commentId) {
		if (!editText.trim()) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/comments/${commentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commentText: editText.trim() })
			});

			const data = await response.json();

			if (response.ok) {
				comments = comments.map(c =>
					c.id === commentId ? data.comment : c
				);
				editingCommentId = null;
				editText = '';
				emitCommentCount(comments.length);
			} else {
				error = data.error || 'Failed to update comment';
			}
		} catch (err) {
			error = 'Network error updating comment';
			console.error('Error updating comment:', err);
		} finally {
			isLoading = false;
		}
	}

	async function deleteComment(commentId) {
		if (!confirm('Delete this comment?')) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/comments/${commentId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				comments = comments.filter(c => c.id !== commentId);
				emitCommentCount(comments.length);
			} else {
				const data = await response.json();
				error = data.error || 'Failed to delete comment';
			}
		} catch (err) {
			error = 'Network error deleting comment';
			console.error('Error deleting comment:', err);
		} finally {
			isLoading = false;
		}
	}

	function startEdit(comment) {
		editingCommentId = comment.id;
		editText = comment.comment_text;
	}

	function cancelEdit() {
		editingCommentId = null;
		editText = '';
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			addComment();
		}
	}

	function handleModalClick(event) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	$effect(() => {
		if (isOpen && todoId) {
			fetchComments();
		}
	});
</script>

{#if isOpen}
	<div class="comment-modal-overlay" onclick={handleModalClick}>
		<div class="comment-modal">
			<div class="comment-modal-header">
				<h2>Comments</h2>
				<p class="comment-modal-task">{todoText}</p>
				<button
					type="button"
					class="comment-modal-close"
					onclick={onClose}
					aria-label="Close comments"
				>
					&times;
				</button>
			</div>

			<div class="comment-modal-body">
				{#if error}
					<div class="comment-error">{error}</div>
				{/if}

				{#if isLoading && comments.length === 0}
					<div class="comment-loading">Loading comments...</div>
				{:else if comments.length === 0}
					<div class="comment-empty">No comments yet. Be the first to comment!</div>
				{:else}
					<div class="comment-list">
						{#each comments as comment (comment.id)}
							<div class="comment-item">
								<div class="comment-header">
									<span class="comment-author">{comment.username}</span>
									<span class="comment-time">
										{new Date(comment.created_at).toLocaleString()}
									</span>
								</div>
								{#if editingCommentId === comment.id}
									<div class="comment-edit-form">
										<textarea
											bind:value={editText}
											class="comment-edit-input"
											rows="3"
										></textarea>
										<div class="comment-edit-actions">
											<button
												type="button"
												class="btn-save"
												onclick={() => updateComment(comment.id)}
												disabled={isLoading}
											>
												Save
											</button>
											<button
												type="button"
												class="btn-cancel"
												onclick={cancelEdit}
												disabled={isLoading}
											>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<p class="comment-text">{comment.comment_text}</p>
									<div class="comment-actions">
										<button
											type="button"
											class="btn-edit"
											onclick={() => startEdit(comment)}
										>
											Edit
										</button>
										<button
											type="button"
											class="btn-delete"
											onclick={() => deleteComment(comment.id)}
										>
											Delete
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="comment-modal-footer">
				<textarea
					bind:value={newCommentText}
					class="comment-input"
					placeholder="Write a comment... (Cmd/Ctrl+Enter to submit)"
					rows="3"
					onkeydown={handleKeyPress}
					disabled={isLoading}
				></textarea>
				<button
					type="button"
					class="btn-add-comment"
					onclick={addComment}
					disabled={isLoading || !newCommentText.trim()}
				>
					Add Comment
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.comment-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		padding: 1rem;
	}

	.comment-modal {
		background: var(--surface-panel, #1e1e2e);
		border-radius: 16px;
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.comment-modal-header {
		position: relative;
		padding: 1.5rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	.comment-modal-header h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.4rem;
		color: rgba(226, 232, 240, 0.95);
	}

	.comment-modal-task {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(148, 163, 184, 0.85);
	}

	.comment-modal-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		font-size: 2rem;
		color: rgba(148, 163, 184, 0.7);
		cursor: pointer;
		line-height: 1;
		padding: 0.25rem 0.5rem;
		transition: color 150ms ease;
	}

	.comment-modal-close:hover {
		color: rgba(226, 232, 240, 0.95);
	}

	.comment-modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.comment-error {
		padding: 1rem;
		background: rgba(248, 113, 113, 0.15);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: 8px;
		color: #fca5a5;
		margin-bottom: 1rem;
	}

	.comment-loading,
	.comment-empty {
		text-align: center;
		padding: 2rem;
		color: rgba(148, 163, 184, 0.7);
		font-style: italic;
	}

	.comment-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.comment-item {
		background: rgba(15, 23, 42, 0.4);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 12px;
		padding: 1rem;
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.comment-author {
		font-weight: 600;
		color: rgba(99, 102, 241, 0.9);
		font-size: 0.9rem;
	}

	.comment-time {
		font-size: 0.75rem;
		color: rgba(148, 163, 184, 0.6);
	}

	.comment-text {
		margin: 0 0 0.75rem 0;
		color: rgba(226, 232, 240, 0.9);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.comment-actions {
		display: flex;
		gap: 0.5rem;
	}

	.comment-actions button {
		font-size: 0.8rem;
		padding: 0.3rem 0.75rem;
		border-radius: 6px;
		border: none;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-edit {
		background: rgba(99, 102, 241, 0.15);
		color: #c7d2fe;
	}

	.btn-edit:hover {
		background: rgba(99, 102, 241, 0.25);
	}

	.btn-delete {
		background: rgba(248, 113, 113, 0.15);
		color: #fca5a5;
	}

	.btn-delete:hover {
		background: rgba(248, 113, 113, 0.25);
	}

	.comment-edit-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.comment-edit-input {
		width: 100%;
		padding: 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		background: rgba(15, 23, 42, 0.6);
		color: rgba(226, 232, 240, 0.95);
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}

	.comment-edit-input:focus {
		outline: none;
		border-color: rgba(99, 102, 241, 0.5);
	}

	.comment-edit-actions {
		display: flex;
		gap: 0.5rem;
	}

	.comment-edit-actions button {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		border: none;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-save {
		background: rgba(16, 185, 129, 0.2);
		color: #a7f3d0;
	}

	.btn-save:hover:not(:disabled) {
		background: rgba(16, 185, 129, 0.3);
	}

	.btn-cancel {
		background: rgba(148, 163, 184, 0.15);
		color: rgba(226, 232, 240, 0.85);
	}

	.btn-cancel:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.25);
	}

	.comment-modal-footer {
		padding: 1.5rem;
		border-top: 1px solid rgba(148, 163, 184, 0.2);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.comment-input {
		width: 100%;
		padding: 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		background: rgba(15, 23, 42, 0.6);
		color: rgba(226, 232, 240, 0.95);
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
		transition: border-color 150ms ease;
	}

	.comment-input:focus {
		outline: none;
		border-color: rgba(99, 102, 241, 0.5);
	}

	.comment-input::placeholder {
		color: rgba(148, 163, 184, 0.5);
	}

	.btn-add-comment {
		align-self: flex-end;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		border: none;
		background: rgba(99, 102, 241, 0.8);
		color: #e0e7ff;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-add-comment:hover:not(:disabled) {
		background: rgba(99, 102, 241, 1);
		transform: translateY(-1px);
	}

	.btn-add-comment:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.comment-modal {
			max-height: 90vh;
		}

		.comment-modal-header,
		.comment-modal-body,
		.comment-modal-footer {
			padding: 1rem;
		}
	}
</style>
