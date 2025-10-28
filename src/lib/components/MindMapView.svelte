<script>
	import { getContext } from 'svelte';
	import MindMapChild from './MindMapView.svelte';

	let {
		nodes = [],
		depth = 0,
		emptyMessage = 'No tasks to map'
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

	const isRoot = $derived(depth === 0);
</script>

{#if isRoot && !nodes?.length}
	<p class="mindmap-empty">{emptyMessage}</p>
{:else if nodes?.length}
	<ul class:mindmap-root={isRoot} class="mindmap-level" data-depth={depth}>
		{#each nodes as node (node.id)}
			<li class="mindmap-item">
				<div
					class="mindmap-node {priorityClass(node.priorityKey)}"
					class:mindmap-node-completed={node.completed}
					class:mindmap-node-overdue={node.overdue}
				>
					<button
						type="button"
						class="mindmap-toggle"
						onclick={() => handleToggle(node)}
						aria-pressed={node.completed}
						aria-label={node.completed ? 'Mark task incomplete' : 'Mark task complete'}
					>
						<span aria-hidden="true"></span>
					</button>
					<div class="mindmap-content">
						<span class="mindmap-title">{node.text}</span>
						<div class="mindmap-meta">
							{#if node.dueLabel}
								<span class="mindmap-due">Due {node.dueLabel}</span>
							{/if}
							<span class="mindmap-priority">{priorityLabel(node.priorityKey)}</span>
							{#if node.assignedTo}
								<span class="mindmap-assignee">Assigned to {node.assignedTo}</span>
							{/if}
						</div>
						{#if node.notesPreview}
							<p class="mindmap-notes">{node.notesPreview}</p>
						{/if}
					</div>
				</div>

				{#if node.subtasks?.length}
					<MindMapChild nodes={node.subtasks} depth={depth + 1} emptyMessage={emptyMessage} />
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.mindmap-empty {
		padding: 2rem 0;
		text-align: center;
		color: var(--muted-foreground, #6c7280);
		font-size: 0.95rem;
	}

	.mindmap-level {
		list-style: none;
		margin: 0;
		padding: 0 0 0 1.5rem;
		position: relative;
	}

	.mindmap-root {
		padding-left: 0;
	}

	.mindmap-root::before {
		display: none;
	}

	.mindmap-level::before {
		content: '';
		position: absolute;
		top: 0.75rem;
		left: 0.45rem;
		bottom: 0.75rem;
		width: 1px;
		background: rgba(125, 131, 154, 0.35);
	}

	.mindmap-item {
		position: relative;
		padding-left: 0.75rem;
		margin-bottom: 0.85rem;
	}

	.mindmap-item::before {
		content: '';
		position: absolute;
		left: 0.45rem;
		top: 1.1rem;
		width: 0.8rem;
		height: 1px;
		background: rgba(125, 131, 154, 0.35);
	}

	.mindmap-node {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		background: var(--surface-raised, rgba(255, 255, 255, 0.06));
		border-radius: 14px;
		padding: 0.65rem 0.8rem;
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
		border: 1px solid rgba(125, 131, 154, 0.15);
		backdrop-filter: blur(10px);
	}

	.mindmap-node-completed {
		opacity: 0.72;
		border-color: rgba(16, 185, 129, 0.4);
	}

	.mindmap-node-overdue {
		border-color: rgba(248, 113, 113, 0.4);
	}

	.mindmap-toggle {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1px solid rgba(125, 131, 154, 0.5);
		background: transparent;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.mindmap-toggle span {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		display: block;
		background: transparent;
	}

	.mindmap-toggle[aria-pressed='true'] {
		border-color: var(--accent, #6c5ce7);
		background: rgba(108, 92, 231, 0.18);
	}

	.mindmap-toggle[aria-pressed='true'] span {
		background: var(--accent, #6c5ce7);
	}

	.mindmap-toggle:focus-visible {
		outline: 2px solid var(--accent, #6c5ce7);
		outline-offset: 2px;
	}

	.mindmap-content {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.mindmap-title {
		font-weight: 600;
		font-size: 0.98rem;
		color: inherit;
	}

	.mindmap-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		font-size: 0.78rem;
		color: var(--muted-foreground, #7d839a);
	}

	.mindmap-due {
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: rgba(125, 131, 154, 0.18);
	}

	.mindmap-priority {
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.mindmap-assignee {
		font-style: italic;
	}

	.mindmap-notes {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(226, 232, 240, 0.8);
	}

	.mindmap-node::after {
		content: '';
		position: absolute;
		top: 0.8rem;
		left: -0.35rem;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 999px;
		background: rgba(108, 92, 231, 0.65);
		box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
	}

	.mindmap-root > .mindmap-item::before,
	.mindmap-root > .mindmap-item::after {
		display: none;
	}

	.mindmap-root > .mindmap-item > .mindmap-node::after {
		left: -1.2rem;
	}

	@media (max-width: 680px) {
		.mindmap-node {
			flex-direction: column;
		}

		.mindmap-toggle {
			align-self: flex-start;
		}
	}
</style>
