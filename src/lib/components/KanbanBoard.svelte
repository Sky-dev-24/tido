<script>
	import { getContext } from 'svelte';

	let {
		columns = [],
		emptyMessage = 'No tasks to display',
		showCompleted = true
	} = $props();

	const todoActions = getContext('todo-actions') ?? {};
	const toggleTodoComplete = todoActions.toggleTodoComplete ?? (() => {});
	const priorityLabel = todoActions.priorityLabel ?? ((value) => value);
	const priorityClass = todoActions.priorityClass ?? (() => '');

	function handleToggle(todo) {
		if (typeof toggleTodoComplete === 'function') {
			toggleTodoComplete(todo.id, todo.completed);
		}
	}

	function renderProgress(todo) {
		if (!todo?.totalSubtasks) {
			return null;
		}

		return `${todo.completedSubtasks}/${todo.totalSubtasks}`;
	}
</script>

{#if !columns?.length}
	<p class="kanban-empty">{emptyMessage}</p>
{:else}
	<div class="kanban-board" role="region" aria-label="Kanban board view">
		{#each columns as column (column.id ?? column.title)}
			<section class="kanban-column" aria-label={`${column.title} column`}>
				<header class="kanban-column-header">
					<h2>{column.title}</h2>
					<span class="kanban-column-count">{column.todos.length}</span>
				</header>

				{#if column.summary}
					<p class="kanban-column-summary">{column.summary}</p>
				{/if}

				<div class="kanban-card-list">
					{#if !column.todos.length}
						<p class="kanban-column-empty">No tasks</p>
					{:else}
						{#each column.todos as todo (todo.id)}
							<article
								class="kanban-card {priorityClass(todo.priorityKey)}"
								class:kanban-card-completed={todo.completed}
								class:kanban-card-overdue={todo.overdue}
								class:kanban-card-recurring={todo.isRecurring}
							>
								<header class="kanban-card-header">
									<button
										type="button"
										class="kanban-card-toggle"
										aria-pressed={todo.completed}
										onclick={() => handleToggle(todo)}
										aria-label={todo.completed ? 'Mark task incomplete' : 'Mark task complete'}
									>
										<span class="kanban-toggle-indicator" aria-hidden="true"></span>
									</button>

									<div class="kanban-card-title">
										<h3>{todo.text}</h3>
										{#if todo.assignedTo}
											<span class="kanban-card-assignee">Assigned to {todo.assignedTo}</span>
										{/if}
									</div>
								</header>

								{#if todo.dueLabel || todo.dueDate}
									<div class="kanban-card-meta">
										<span class="kanban-card-due" aria-label="Due date">
											{todo.dueLabel ?? todo.dueDate}
										</span>
									</div>
								{/if}

								<div class="kanban-card-footer">
									<span class="kanban-card-priority">
										{priorityLabel(todo.priorityKey)}
									</span>

									{#if todo.totalSubtasks}
										<span class="kanban-card-progress" aria-label="Subtask completion">
											{renderProgress(todo)}
										</span>
									{/if}

									{#if showCompleted && todo.completedAtLabel}
										<span class="kanban-card-completed-at">
											Completed {todo.completedAtLabel}
										</span>
									{/if}
								</div>

								{#if todo.subtasks?.length}
									<ul class="kanban-subtasks">
										{#each todo.subtasks.slice(0, 3) as subtask (subtask.id)}
											<li class:completed={subtask.completed}>
												{subtask.text}
											</li>
										{/each}
										{#if todo.subtasks.length > 3}
											<li class="more-subtasks">+{todo.subtasks.length - 3} more</li>
										{/if}
									</ul>
								{/if}
							</article>
						{/each}
					{/if}
				</div>
			</section>
		{/each}
	</div>
{/if}

<style>
	.kanban-empty {
		padding: 2rem 0;
		text-align: center;
		color: var(--muted-foreground, #6c7280);
		font-size: 0.95rem;
	}

	.kanban-board {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		align-items: start;
		padding-block: 0.5rem;
	}

	.kanban-column {
		background: var(--surface-raised, rgba(255, 255, 255, 0.08));
		border-radius: 12px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		min-height: 220px;
	}

	.kanban-column-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.kanban-column-header h2 {
		font-size: 1.05rem;
		font-weight: 600;
		margin: 0;
	}

	.kanban-column-count {
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: var(--surface-muted, rgba(0, 0, 0, 0.12));
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.kanban-column-summary {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		color: var(--muted-foreground, #7d839a);
	}

	.kanban-card-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.kanban-column-empty {
		padding: 1.25rem 0.5rem;
		text-align: center;
		border: 1px dashed rgba(125, 131, 154, 0.4);
		border-radius: 10px;
		font-size: 0.85rem;
		color: var(--muted-foreground, #7d839a);
	}

	.kanban-card {
		background: var(--surface-base, rgba(15, 17, 26, 0.85));
		border-radius: 12px;
		padding: 0.85rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid transparent;
		transition: transform 120ms ease, box-shadow 120ms ease;
	}

	.kanban-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
	}

	.kanban-card-header {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
	}

	.kanban-card-toggle {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		border: 1px solid rgba(125, 131, 154, 0.5);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		cursor: pointer;
		transition: border-color 120ms ease, background 120ms ease;
	}

	.kanban-card-toggle:hover {
		border-color: var(--accent, #6c5ce7);
	}

	.kanban-card-toggle:focus-visible {
		outline: 2px solid var(--accent, #6c5ce7);
		outline-offset: 2px;
	}

	.kanban-toggle-indicator {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: transparent;
		display: inline-block;
	}

	.kanban-card-completed .kanban-card-toggle {
		background: var(--accent-soft, rgba(108, 92, 231, 0.15));
		border-color: var(--accent, #6c5ce7);
	}

	.kanban-card-completed .kanban-toggle-indicator {
		background: var(--accent, #6c5ce7);
	}

	.kanban-card-title {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.kanban-card-title h3 {
		font-size: 0.98rem;
		font-weight: 600;
		margin: 0;
		color: inherit;
	}

	.kanban-card-assignee {
		font-size: 0.8rem;
		color: var(--muted-foreground, #7d839a);
	}

	.kanban-card-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--muted-foreground, #7d839a);
	}

	.kanban-card-due {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(125, 131, 154, 0.12);
	}

	.kanban-card-footer {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		font-size: 0.78rem;
		color: var(--muted-foreground, #7d839a);
		flex-wrap: wrap;
	}

	.kanban-card-progress {
		font-variant-numeric: tabular-nums;
	}

	.kanban-card-completed-at {
		font-style: italic;
	}

	.kanban-card-overdue {
		border-color: rgba(248, 113, 113, 0.45);
	}

	.kanban-card-overdue .kanban-card-due {
		background: rgba(248, 113, 113, 0.18);
		color: #f87171;
	}

	.kanban-card-recurring::after {
		content: 'Recurring';
		display: inline-block;
		align-self: flex-start;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(99, 102, 241, 0.16);
		color: #a5b4fc;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		margin-top: -0.2rem;
	}

	.kanban-subtasks {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--muted-foreground, #7d839a);
	}

	.kanban-subtasks li {
		position: relative;
		list-style: none;
	}

	.kanban-subtasks li::before {
		content: '';
		position: absolute;
		left: -0.75rem;
		top: 0.5em;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: rgba(125, 131, 154, 0.65);
	}

	.kanban-subtasks li.completed {
		color: rgba(125, 131, 154, 0.5);
		text-decoration: line-through;
	}

	.kanban-subtasks .more-subtasks {
		font-style: italic;
		color: rgba(125, 131, 154, 0.7);
	}

	@media (max-width: 768px) {
		.kanban-board {
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		}
	}
</style>
