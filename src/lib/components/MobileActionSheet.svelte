<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		isOpen = false,
		todo = null,
		showNotesToggle = false,
		showEditAction = false,
		canMoveUp = false,
		canMoveDown = false
	} = $props();

	const close = () => dispatch('close');

	function handleOverlayClick(event) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	function handleOverlayKey(event) {
		const actionableKeys = ['Escape', 'Enter', ' '];
		if (actionableKeys.includes(event.key)) {
			event.preventDefault();
			close();
		}
	}

	function emit(action) {
		dispatch(action);
	}

	const hasDueDate = $derived(Boolean(todo?.due_date_label ?? todo?.due_date));
	const isCompleted = $derived(Boolean(todo?.completed));
	const priorityLabel = $derived(todo?.priority ? todo.priority : 'medium');
	const displayPriority = $derived(priorityLabel.charAt(0).toUpperCase() + priorityLabel.slice(1));
</script>

{#if isOpen && todo}
	<div
		class="sheet-overlay"
		role="button"
		tabindex="0"
		aria-label="Close quick actions"
		onclick={handleOverlayClick}
		onkeydown={handleOverlayKey}
	>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-label={`Quick actions for ${todo.text}`}
			tabindex="-1"
		>
			<header class="sheet-header">
				<div class="sheet-title">
					<div class="sheet-title-text">{todo.text}</div>
					{#if todo?.list_name}
						<span class="sheet-subtitle">{todo.list_name}</span>
					{/if}
				</div>
				<button class="sheet-close-btn" type="button" aria-label="Close quick actions" onclick={close}>
					✕
				</button>
			</header>

			<div class="sheet-meta">
				<span class="meta-chip">
					<span class="meta-label">Priority</span>
					<strong>{displayPriority}</strong>
				</span>
				{#if hasDueDate}
					<span class="meta-chip">
						<span class="meta-label">Due</span>
						<strong>{todo?.due_date_label ?? todo?.due_date}</strong>
					</span>
				{/if}
				{#if todo?.assigned_to_username}
					<span class="meta-chip">
						<span class="meta-label">Assigned</span>
						<strong>{todo.assigned_to_username}</strong>
					</span>
				{/if}
			</div>

			<div class="sheet-actions">
				<button
					type="button"
					class="sheet-action primary"
					onclick={() => emit('toggle-complete')}
				>
					<span class="icon">{isCompleted ? '↩️' : '✅'}</span>
					<span>{isCompleted ? 'Mark incomplete' : 'Mark complete'}</span>
				</button>

				<button
					type="button"
					class="sheet-action"
					onclick={() => emit('toggle-expanded')}
				>
					<span class="icon">🧭</span>
					<span>Toggle subtasks</span>
				</button>

				{#if canMoveUp}
					<button
						type="button"
						class="sheet-action"
						onclick={() => emit('move-up')}
					>
						<span class="icon">⬆️</span>
						<span>Move up</span>
					</button>
				{/if}

				{#if canMoveDown}
					<button
						type="button"
						class="sheet-action"
						onclick={() => emit('move-down')}
					>
						<span class="icon">⬇️</span>
						<span>Move down</span>
					</button>
				{/if}

				{#if showNotesToggle}
					<button
						type="button"
						class="sheet-action"
						onclick={() => emit('toggle-notes')}
					>
						<span class="icon">📝</span>
						<span>Notes & attachments</span>
					</button>
				{/if}

				{#if showEditAction}
					<button
						type="button"
						class="sheet-action"
						onclick={() => emit('edit')}
					>
						<span class="icon">✏️</span>
						<span>Edit title</span>
					</button>
				{/if}

				<button
					type="button"
					class="sheet-action danger"
					onclick={() => emit('delete')}
				>
					<span class="icon">🗑️</span>
					<span>Delete task</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.sheet-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.5);
		display: flex;
		align-items: flex-end;
		z-index: 999;
	}

	.sheet {
		width: 100%;
		background: var(--color-card-bg, #ffffff);
		border-radius: 24px 24px 0 0;
		padding: 1.25rem 1.5rem 2rem;
		box-shadow: 0 -20px 40px rgba(15, 23, 42, 0.25);
		max-width: 600px;
		margin: 0 auto;
		animation: sheet-enter 220ms ease-out;
	}

	@keyframes sheet-enter {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.sheet-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.sheet-title {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: calc(100% - 40px);
	}

	.sheet-title-text {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text, #1f2937);
		line-height: 1.3;
		word-break: break-word;
	}

	.sheet-subtitle {
		font-size: 0.85rem;
		color: #6b7280;
	}

	.sheet-close-btn {
		border: none;
		background: rgba(15, 23, 42, 0.06);
		width: 34px;
		height: 34px;
		border-radius: 50%;
		font-size: 1rem;
		cursor: pointer;
		color: #1f2937;
		transition: background 0.2s ease;
	}

	.sheet-close-btn:hover {
		background: rgba(15, 23, 42, 0.12);
	}

	.sheet-meta {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}

	.meta-chip {
		background: rgba(15, 23, 42, 0.05);
		color: #1f2937;
		border-radius: 999px;
		padding: 0.35rem 0.75rem;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 120px;
	}

	.meta-label {
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		color: #6b7280;
		text-transform: uppercase;
	}

	.sheet-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sheet-action {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		border: none;
		background: rgba(15, 23, 42, 0.05);
		color: #1f2937;
		font-size: 1rem;
		font-weight: 600;
		justify-content: flex-start;
		cursor: pointer;
		transition: transform 0.15s ease, background 0.2s ease;
	}

	.sheet-action .icon {
		font-size: 1.2rem;
		display: inline-flex;
	}

	.sheet-action.primary {
		background: linear-gradient(135deg, #34d399, #10b981);
		color: #ffffff;
	}

	.sheet-action.danger {
		background: linear-gradient(135deg, #ef4444, #dc2626);
		color: #ffffff;
	}

	.sheet-action:hover {
		transform: translateY(-2px);
		background: rgba(15, 23, 42, 0.08);
	}

	.sheet-action.primary:hover {
		background: linear-gradient(135deg, #22c55e, #16a34a);
	}

	.sheet-action.danger:hover {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
	}

	@media (max-width: 640px) {
		.sheet {
			border-radius: 24px 24px 0 0;
			padding: 1.25rem 1.25rem 2rem;
		}
	}

	:global(body.dark-mode) .sheet {
		background: #111827;
		color: #f9fafb;
	}

	:global(body.dark-mode) .sheet-close-btn {
		background: rgba(255, 255, 255, 0.08);
		color: #f9fafb;
	}

	:global(body.dark-mode) .sheet-close-btn:hover {
		background: rgba(255, 255, 255, 0.14);
	}

	:global(body.dark-mode) .meta-chip {
		background: rgba(255, 255, 255, 0.08);
		color: #e5e7eb;
	}

	:global(body.dark-mode) .meta-label {
		color: #9ca3af;
	}

	:global(body.dark-mode) .sheet-action {
		background: rgba(255, 255, 255, 0.08);
		color: #f9fafb;
	}

	:global(body.dark-mode) .sheet-action:hover {
		background: rgba(255, 255, 255, 0.14);
	}
</style>
