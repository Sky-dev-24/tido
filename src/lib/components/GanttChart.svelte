<script>
	import { getContext } from 'svelte';

	let {
		timeline = [],
		tasks = [],
		unscheduled = [],
		emptyMessage = 'Add due dates to see tasks on the timeline'
	} = $props();

	const todoActions = getContext('todo-actions') ?? {};
	const toggleTodoComplete = todoActions.toggleTodoComplete ?? (() => {});
	const priorityLabel = todoActions.priorityLabel ?? ((value) => value);
	const priorityClass = todoActions.priorityClass ?? (() => '');

	function handleToggle(task) {
		if (typeof toggleTodoComplete === 'function') {
			toggleTodoComplete(task.id, task.completed);
		}
	}

	function composeBarTitle(task) {
		const parts = [`${task.text}`];
		if (task.startLabel && task.endLabel) {
			parts.push(`(${task.startLabel} → ${task.endLabel})`);
		} else if (task.endLabel) {
			parts.push(`(Due ${task.endLabel})`);
		}
		return parts.join(' ');
	}
</script>

{#if !timeline?.length && !tasks?.length}
	<p class="gantt-empty">{emptyMessage}</p>
{:else}
	<div class="gantt-chart" role="region" aria-label="Timeline view">
		<div class="gantt-header">
			<div class="gantt-task-column">Task</div>
			<div
				class="gantt-timeline"
				style={`grid-template-columns: repeat(${timeline.length || 1}, minmax(60px, 1fr));`}
			>
				{#each timeline as day (day.key ?? day.label)}
					<div class="gantt-day" class:gantt-day-today={day.isToday} aria-label={day.longLabel ?? day.label}>
						<span>{day.label}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="gantt-body">
			{#each tasks as task (task.id)}
				<div class="gantt-row">
					<div class="gantt-task-cell">
						<div class="gantt-task-title">
							<button
								type="button"
								class="gantt-toggle"
								aria-pressed={task.completed}
								onclick={() => handleToggle(task)}
								aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
							>
								<span aria-hidden="true"></span>
							</button>
							<div class="gantt-task-text">
								<strong>{task.text}</strong>
								{#if task.assignedTo}
									<span class="gantt-task-assignee">Assigned to {task.assignedTo}</span>
								{/if}
								{#if task.endLabel}
									<span class="gantt-task-due">Due {task.endLabel}</span>
								{/if}
								<span class="gantt-task-priority">{priorityLabel(task.priorityKey)}</span>
							</div>
						</div>
					</div>

					<div
						class="gantt-bar-track"
						style={`grid-template-columns: repeat(${timeline.length || 1}, minmax(60px, 1fr));`}
					>
						{#if Number.isInteger(task.startIndex) && Number.isInteger(task.duration)}
							<div
								class={`gantt-bar ${priorityClass(task.priorityKey)}`}
								class:gantt-bar-completed={task.completed}
								class:gantt-bar-overdue={task.overdue}
								style={`grid-column: ${Math.max(task.startIndex + 1, 1)} / span ${Math.max(task.duration, 1)};`}
								title={composeBarTitle(task)}
							>
								{#if task.duration >= 2}
									<span class="gantt-bar-label">{task.text}</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if unscheduled?.length}
			<div class="gantt-unscheduled" aria-label="Tasks without schedule">
				<h3>Unscheduled</h3>
				<ul>
					{#each unscheduled as todo (todo.id)}
						<li>
							<span>{todo.text}</span>
							{#if todo.createdLabel}
								<span class="gantt-unscheduled-created">Created {todo.createdLabel}</span>
							{/if}
							<span class={`gantt-unscheduled-priority ${priorityClass(todo.priorityKey)}`}>
								{priorityLabel(todo.priorityKey)}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}

<style>
	.gantt-empty {
		padding: 2rem 0;
		text-align: center;
		color: var(--muted-foreground, #6c7280);
		font-size: 0.95rem;
	}

	.gantt-chart {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.gantt-header {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(320px, 3fr);
		align-items: stretch;
		border-bottom: 1px solid rgba(125, 131, 154, 0.25);
	}

	.gantt-task-column {
		padding: 0.75rem;
		font-weight: 600;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted-foreground, #7d839a);
	}

	.gantt-timeline {
		display: grid;
		position: relative;
		min-height: 48px;
	}

	.gantt-day {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.5rem;
		border-left: 1px solid rgba(125, 131, 154, 0.2);
		font-size: 0.75rem;
		color: var(--muted-foreground, #7d839a);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.gantt-day span {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}

	.gantt-day:first-child {
		border-left: none;
	}

	.gantt-day-today {
		background: rgba(108, 92, 231, 0.12);
		color: var(--accent, #6c5ce7);
		font-weight: 600;
	}

	.gantt-body {
		display: flex;
		flex-direction: column;
	}

	.gantt-row {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(320px, 3fr);
		align-items: stretch;
		border-bottom: 1px solid rgba(125, 131, 154, 0.12);
	}

	.gantt-task-cell {
		padding: 0.75rem;
		display: flex;
		align-items: center;
	}

	.gantt-task-title {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.gantt-toggle {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1px solid rgba(125, 131, 154, 0.5);
		background: transparent;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.gantt-toggle span {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: transparent;
	}

	.gantt-toggle[aria-pressed='true'] {
		border-color: var(--accent, #6c5ce7);
		background: rgba(108, 92, 231, 0.15);
	}

	.gantt-toggle[aria-pressed='true'] span {
		background: var(--accent, #6c5ce7);
	}

	.gantt-toggle:focus-visible {
		outline: 2px solid var(--accent, #6c5ce7);
		outline-offset: 2px;
	}

	.gantt-task-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}

	.gantt-task-text strong {
		font-size: 0.95rem;
	}

	.gantt-task-assignee,
	.gantt-task-due,
	.gantt-task-priority {
		color: var(--muted-foreground, #7d839a);
	}

	.gantt-bar-track {
		display: grid;
		position: relative;
		background: rgba(31, 35, 48, 0.55);
		border-left: 1px solid rgba(125, 131, 154, 0.2);
	}

	.gantt-bar-track::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: rgba(108, 92, 231, 0.25);
		left: calc(var(--today-column, -1) * 1px);
	}

	.gantt-bar {
		margin: 0.4rem 0.2rem;
		border-radius: 999px;
		background: rgba(99, 102, 241, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #e0e7ff;
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
		position: relative;
		overflow: hidden;
	}

	.gantt-bar::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.35);
		pointer-events: none;
	}

	.gantt-bar-completed {
		background: rgba(16, 185, 129, 0.55);
		color: #ccfbf1;
	}

	.gantt-bar-overdue {
		background: rgba(248, 113, 113, 0.55);
		color: #fee2e2;
	}

	.gantt-bar-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 0.4rem;
	}

	.gantt-unscheduled {
		margin-top: 1rem;
		background: var(--surface-raised, rgba(255, 255, 255, 0.05));
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.gantt-unscheduled h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.gantt-unscheduled ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.gantt-unscheduled li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--muted-foreground, #7d839a);
	}

	.gantt-unscheduled span:first-child {
		color: inherit;
		font-weight: 500;
	}

	.gantt-unscheduled-created {
		font-size: 0.75rem;
	}

	.gantt-unscheduled-priority {
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(125, 131, 154, 0.15);
		color: #e2e8f0;
	}

	@media (max-width: 900px) {
		.gantt-header,
		.gantt-row {
			grid-template-columns: minmax(160px, 1fr) minmax(240px, 2fr);
		}
	}

	@media (max-width: 640px) {
		.gantt-chart {
			gap: 0.5rem;
		}

		.gantt-header,
		.gantt-row {
			grid-template-columns: 1fr;
		}

		.gantt-timeline,
		.gantt-bar-track {
			overflow-x: auto;
		}
	}
</style>
