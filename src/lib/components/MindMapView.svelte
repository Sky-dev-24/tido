<script>
	import { getContext } from 'svelte';
	import { marked } from 'marked';
	import MindMapChild from './MindMapView.svelte';
	import CommentModal from './CommentModal.svelte';
	import TodoAttachments from './TodoAttachments.svelte';

	let {
		nodes = [],
		depth = 0,
		emptyMessage = 'No tasks to map'
	} = $props();

	const todoActions = getContext('todo-actions') ?? {};
	const toggleTodoComplete = todoActions.toggleTodoComplete ?? (() => {});
	const priorityLabel = todoActions.priorityLabel ?? ((value) => value);
	const priorityClass = todoActions.priorityClass ?? (() => '');
	const updateTodoCommentCount = todoActions.updateTodoCommentCount ?? (() => {});
	const updateTodoNotes = todoActions.updateTodoNotes ?? (() => {});
	const uploadAttachment = todoActions.uploadAttachment ?? (() => {});
	const removeAttachment = todoActions.removeAttachment ?? (() => {});

	let collapsedNodes = $state(new Set());
	let expandedOnce = $state(new Set());
	let expandedNotes = $state(new Set());
	let editingNotesMap = $state(new Map()); // Map<todoId, { isEditing: boolean, editedNotes: string }>
	let commentModalOpen = $state(false);
	let commentModalTodoId = $state(null);
	let commentModalTodoText = $state('');

	function handleToggle(todo) {
		if (typeof toggleTodoComplete === 'function') {
			toggleTodoComplete(todo.id, todo.completed);
		}
	}

	function toggleCollapse(nodeId, event) {
		event.stopPropagation();
		if (collapsedNodes.has(nodeId)) {
			collapsedNodes.delete(nodeId);
		} else {
			collapsedNodes.add(nodeId);
		}
		collapsedNodes = new Set(collapsedNodes); // Trigger reactivity
	}

	function isCollapsed(nodeId) {
		return collapsedNodes.has(nodeId);
	}

	function handleNodeClick(node, event) {
		// Track that this node was interacted with
		if (node.subtasks?.length && !expandedOnce.has(node.id)) {
			expandedOnce.add(node.id);
			expandedOnce = new Set(expandedOnce);
		}
	}

	function openCommentModal(node, event) {
		event.stopPropagation();
		commentModalTodoId = node.id;
		commentModalTodoText = node.text;
		commentModalOpen = true;
	}

	function closeCommentModal() {
		commentModalOpen = false;
		commentModalTodoId = null;
		commentModalTodoText = '';
	}

	function toggleNotes(nodeId, event) {
		event.stopPropagation();
		if (expandedNotes.has(nodeId)) {
			expandedNotes.delete(nodeId);
		} else {
			expandedNotes.add(nodeId);
		}
		expandedNotes = new Set(expandedNotes);
	}

	function isNotesExpanded(nodeId) {
		return expandedNotes.has(nodeId);
	}

	function startEditingNotes(node) {
		if (!expandedNotes.has(node.id)) {
			expandedNotes.add(node.id);
			expandedNotes = new Set(expandedNotes);
		}
		editingNotesMap.set(node.id, {
			isEditing: true,
			editedNotes: node.notes || ''
		});
		editingNotesMap = new Map(editingNotesMap);
	}

	function cancelEditingNotes(nodeId) {
		editingNotesMap.delete(nodeId);
		editingNotesMap = new Map(editingNotesMap);
	}

	async function saveNotes(nodeId, editedNotes) {
		if (typeof updateTodoNotes === 'function') {
			await updateTodoNotes(nodeId, editedNotes);
		}
		editingNotesMap.delete(nodeId);
		editingNotesMap = new Map(editingNotesMap);
	}

	function getRenderedNotes(notes) {
		if (!notes) return '';
		try {
			return marked.parse(notes);
		} catch (e) {
			return notes;
		}
	}

	function handleCommentCountChange(event) {
		const { todoId, count } = event.detail ?? {};
		const normalizedId = Number(todoId);
		if (!Number.isFinite(normalizedId)) {
			return;
		}
		const normalizedCount = Number.isFinite(Number(count)) ? Number(count) : 0;

		function apply(list) {
			let listChanged = false;
			const updated = (list ?? []).map((node) => {
				if (!node) return node;
				let updatedNode = node;
				if (node.id === normalizedId) {
					updatedNode = { ...node, comment_count: normalizedCount };
					listChanged = true;
				}
				if (node.subtasks?.length) {
					const updatedChildren = apply(node.subtasks);
					if (updatedChildren !== node.subtasks) {
						if (updatedNode === node) {
							updatedNode = { ...updatedNode };
						}
						updatedNode.subtasks = updatedChildren;
						listChanged = true;
					}
				}
				return updatedNode;
			});
			return listChanged ? updated : list;
		}

		const updatedNodes = apply(nodes);
		if (updatedNodes !== nodes) {
			nodes = updatedNodes;
		}

		if (typeof updateTodoCommentCount === 'function') {
			updateTodoCommentCount(normalizedId, normalizedCount);
		}
	}

	const isRoot = $derived(depth === 0);
</script>

{#if isRoot && !nodes?.length}
	<p class="mindmap-empty">{emptyMessage}</p>
{:else if nodes?.length}
	<ul class:mindmap-root={isRoot} class="mindmap-level" data-depth={depth}>
		{#each nodes as node (node.id)}
			<li class="mindmap-item" class:mindmap-item-collapsed={isCollapsed(node.id)}>
				<div
					class="mindmap-node {priorityClass(node.priorityKey)}"
					class:mindmap-node-completed={node.completed}
					class:mindmap-node-overdue={node.overdue}
					class:mindmap-node-recurring={node.isRecurring}
					class:mindmap-node-has-children={node.subtasks?.length}
					onclick={(e) => handleNodeClick(node, e)}
				>
					<div class="mindmap-node-controls">
						<button
							type="button"
							class="mindmap-toggle"
							onclick={(e) => { e.stopPropagation(); handleToggle(node); }}
							aria-pressed={node.completed}
							aria-label={node.completed ? 'Mark task incomplete' : 'Mark task complete'}
						>
							<span aria-hidden="true"></span>
						</button>
						{#if node.subtasks?.length}
							<button
								type="button"
								class="mindmap-collapse-btn"
								onclick={(e) => toggleCollapse(node.id, e)}
								aria-label={isCollapsed(node.id) ? 'Expand subtasks' : 'Collapse subtasks'}
								aria-expanded={!isCollapsed(node.id)}
							>
								{isCollapsed(node.id) ? '▶' : '▼'}
							</button>
						{/if}
					</div>
					<div class="mindmap-content">
						<div class="mindmap-heading">
							<span class="mindmap-title">{node.text}</span>
							{#if node.isRecurring}
								<span class="mindmap-badge" aria-label="Recurring task">
									Recurring
								</span>
							{/if}
							{#if node.completed}
								<span class="mindmap-badge mindmap-badge-completed" aria-label="Task completed">
									Completed
								</span>
							{/if}
							{#if node.subtasks?.length}
								<span class="mindmap-badge mindmap-badge-count" aria-label={`${node.subtasks.length} subtasks`}>
									{node.subtasks.length} {node.subtasks.length === 1 ? 'subtask' : 'subtasks'}
								</span>
							{/if}
						</div>
						<div class="mindmap-meta">
							{#if node.dueLabel}
								<span class="mindmap-chip mindmap-chip-due">Due {node.dueLabel}</span>
							{/if}
							<span class="mindmap-chip mindmap-chip-priority">{priorityLabel(node.priorityKey)}</span>
							{#if node.assignedTo}
								<span class="mindmap-chip mindmap-chip-assignee">Assigned to {node.assignedTo}</span>
							{/if}
							{#if true}
								{@const commentCount = Number.isFinite(Number(node.comment_count)) ? Number(node.comment_count) : 0}
								<button
									class="comment-bubble"
									class:comment-bubble-empty={!commentCount}
									type="button"
									aria-label={commentCount ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Add comment'}
									onclick={(e) => openCommentModal(node, e)}
								>
									<svg class="comment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
										<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
									</svg>
									{#if commentCount > 0}
										<span class="comment-count">{commentCount}</span>
									{:else}
										<span class="comment-count comment-count-muted">+</span>
									{/if}
								</button>
							{/if}
							{#if true}
								{@const hasNotes = node.notes && node.notes.trim().length > 0}
								{@const attachmentCount = node.attachments?.length || 0}
								{@const hasContent = hasNotes || attachmentCount > 0}
								<button
									class="notes-bubble"
									class:notes-bubble-has-content={hasContent}
									type="button"
									aria-label={hasContent ? 'View notes & attachments' : 'Add notes or attachments'}
									onclick={(e) => toggleNotes(node.id, e)}
								>
									<svg class="notes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
										<polyline points="14 2 14 8 20 8"/>
										<line x1="16" y1="13" x2="8" y2="13"/>
										<line x1="16" y1="17" x2="8" y2="17"/>
										<polyline points="10 9 9 9 8 9"/>
									</svg>
									{#if attachmentCount > 0}
										<span class="attachment-count">{attachmentCount}</span>
									{:else if !hasContent}
										<span class="attachment-count attachment-count-muted">+</span>
									{/if}
								</button>
							{/if}
							{#if node.totalSubtasks}
								<span class="mindmap-chip mindmap-chip-progress">
									{node.completedSubtasks}/{node.totalSubtasks} done
								</span>
							{/if}
						</div>
						{#if node.notesPreview}
							<p class="mindmap-notes">{node.notesPreview}</p>
						{/if}
					</div>
				</div>

				{#if isNotesExpanded(node.id)}
					{@const editingState = editingNotesMap.get(node.id)}
					{@const isEditingNotes = editingState?.isEditing ?? false}
					{@const editedNotes = editingState?.editedNotes ?? ''}
					<div class="mindmap-notes-section">
						<div class="notes-header">
							<span class="notes-title">Notes</span>
							{#if !isEditingNotes && node.notes}
								<button
									class="notes-edit-btn"
									type="button"
									onclick={() => startEditingNotes(node)}
									title="Edit notes"
								>
									Edit
								</button>
							{/if}
						</div>

						{#if isEditingNotes}
							<div class="notes-editor">
								<textarea
									class="notes-textarea"
									value={editedNotes}
									oninput={(e) => {
										const state = editingNotesMap.get(node.id);
										if (state) {
											state.editedNotes = e.target.value;
											editingNotesMap = new Map(editingNotesMap);
										}
									}}
									placeholder="Add notes in Markdown format...

**Bold**, *italic*, `code`
- Lists
- More items

[Links](https://example.com)"
								></textarea>
								<div class="notes-actions">
									<button
										class="notes-save-btn"
										type="button"
										onclick={() => saveNotes(node.id, editedNotes)}
									>
										Save
									</button>
									<button
										class="notes-cancel-btn"
										type="button"
										onclick={() => cancelEditingNotes(node.id)}
									>
										Cancel
									</button>
								</div>
							</div>
						{:else if node.notes}
							<div class="notes-preview markdown-content">
								{@html getRenderedNotes(node.notes)}
							</div>
						{:else}
							<div
								class="notes-empty"
								onclick={() => startEditingNotes(node)}
								role="button"
								tabindex={0}
							>
								Click to add notes...
							</div>
						{/if}

						<TodoAttachments todoId={node.id} attachments={node.attachments ?? []} />
					</div>
				{/if}

				{#if node.subtasks?.length && !isCollapsed(node.id)}
					<MindMapChild nodes={node.subtasks} depth={depth + 1} emptyMessage={emptyMessage} />
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if isRoot}
	<CommentModal
		todoId={commentModalTodoId}
		todoText={commentModalTodoText}
		isOpen={commentModalOpen}
		onClose={closeCommentModal}
		on:comment-count-change={handleCommentCountChange}
	/>
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
		padding: 0 0 0 1.6rem;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.mindmap-root {
		padding-left: 0;
		gap: 1.4rem;
	}

	.mindmap-root::before {
		display: none;
	}

	.mindmap-level::before {
		content: '';
		position: absolute;
		top: 1.6rem;
		left: 0.45rem;
		bottom: 1.4rem;
		width: 1px;
		background: rgba(148, 163, 184, 0.22);
	}

	.mindmap-item {
		position: relative;
		padding-left: 0.85rem;
	}

	.mindmap-item::before {
		content: '';
		position: absolute;
		left: 0.45rem;
		top: 1.4rem;
		width: 0.95rem;
		height: 1px;
		background: rgba(148, 163, 184, 0.22);
	}

	.mindmap-node {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		background: var(--surface-panel, rgba(15, 23, 42, 0.7));
		border-radius: 16px;
		padding: 0.85rem 1rem;
		border: 1px solid rgba(148, 163, 184, 0.18);
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.28);
		backdrop-filter: blur(18px);
		transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
	}

	.mindmap-node:hover {
		transform: translateX(4px);
		box-shadow: 0 16px 36px rgba(15, 23, 42, 0.35);
		border-color: rgba(148, 163, 184, 0.28);
	}

	.mindmap-node-has-children {
		cursor: pointer;
	}

	.mindmap-node-controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
	}

	.mindmap-node::before {
		content: '';
		position: absolute;
		top: 0.8rem;
		left: -0.45rem;
		bottom: 0.8rem;
		width: 3px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.28);
	}

	.mindmap-node::after {
		content: '';
		position: absolute;
		left: -0.68rem;
		top: 1.2rem;
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: rgba(79, 70, 229, 0.75);
		box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.18);
		transition: top 200ms ease;
	}

	.mindmap-root > .mindmap-item::before {
		left: -0.4rem;
	}

	.mindmap-root > .mindmap-item > .mindmap-node::before {
		left: -0.9rem;
	}

	.mindmap-root > .mindmap-item > .mindmap-node::after {
		left: -1.1rem;
	}

	.mindmap-node-completed {
		opacity: 0.78;
		border-color: rgba(16, 185, 129, 0.35);
	}

	.mindmap-node-overdue {
		border-color: rgba(248, 113, 113, 0.45);
	}

	.mindmap-node-recurring {
		border-style: dashed;
	}

	.mindmap-node.priority-high::before,
	.mindmap-node.priority-high::after {
		background: rgba(239, 68, 68, 0.85);
	}

	/* High priority: dot at top (default position ~1.2rem) */
	.mindmap-node.priority-high::after {
		top: 1.2rem;
		box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18);
	}

	.mindmap-node.priority-medium::before,
	.mindmap-node.priority-medium::after {
		background: rgba(249, 115, 22, 0.85);
	}

	/* Medium priority: dot in middle */
	.mindmap-node.priority-medium::after {
		top: 50%;
		transform: translateY(-50%);
		box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.18);
	}

	.mindmap-node.priority-low::before,
	.mindmap-node.priority-low::after {
		background: rgba(16, 185, 129, 0.85);
	}

	/* Low priority: dot at bottom */
	.mindmap-node.priority-low::after {
		top: auto;
		bottom: 0.8rem;
		box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
	}

	.mindmap-toggle {
		width: 26px;
		height: 26px;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.45);
		background: rgba(15, 23, 42, 0.65);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
	}

	.mindmap-toggle:hover {
		border-color: var(--accent, #6c5ce7);
		transform: scale(1.04);
	}

	.mindmap-toggle:focus-visible {
		outline: 2px solid var(--accent, #6c5ce7);
		outline-offset: 2px;
	}

	.mindmap-toggle span {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		display: block;
		background: transparent;
	}

	.mindmap-toggle[aria-pressed='true'] {
		border-color: rgba(16, 185, 129, 0.6);
		background: rgba(16, 185, 129, 0.18);
	}

	.mindmap-toggle[aria-pressed='true'] span {
		background: rgba(16, 185, 129, 0.85);
	}

	.mindmap-collapse-btn {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: rgba(15, 23, 42, 0.55);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		color: rgba(226, 232, 240, 0.75);
		transition: all 150ms ease;
	}

	.mindmap-collapse-btn:hover {
		border-color: rgba(99, 102, 241, 0.55);
		background: rgba(99, 102, 241, 0.15);
		color: rgba(99, 102, 241, 0.95);
		transform: scale(1.1);
	}

	.mindmap-collapse-btn:focus-visible {
		outline: 2px solid var(--accent, #6c5ce7);
		outline-offset: 2px;
	}

	.mindmap-item-collapsed > .mindmap-node {
		opacity: 0.85;
	}

	.mindmap-item-collapsed > .mindmap-level {
		display: none;
	}

	.mindmap-content {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		flex: 1;
	}

	.mindmap-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.mindmap-title {
		font-weight: 600;
		font-size: 1rem;
		color: rgba(226, 232, 240, 0.95);
	}

	.mindmap-badge {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(99, 102, 241, 0.18);
		color: #c7d2fe;
		font-weight: 600;
	}

	.mindmap-badge-completed {
		background: rgba(16, 185, 129, 0.18);
		color: #bbf7d0;
	}

	.mindmap-badge-count {
		background: rgba(59, 130, 246, 0.18);
		color: #bfdbfe;
	}

	.mindmap-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		font-size: 0.78rem;
		color: var(--muted-foreground, #8b93aa);
	}

	.mindmap-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.16);
		color: rgba(226, 232, 240, 0.85);
		font-size: 0.75rem;
	}

	.mindmap-chip-due {
		font-variant-numeric: tabular-nums;
	}

	.mindmap-chip-progress {
		background: rgba(59, 130, 246, 0.16);
		color: #bfdbfe;
	}

	.mindmap-chip-priority {
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-weight: 600;
	}

	.mindmap-node.priority-high .mindmap-chip-priority {
		background: rgba(239, 68, 68, 0.2);
		color: #fecaca;
	}

	.mindmap-node.priority-medium .mindmap-chip-priority {
		background: rgba(249, 115, 22, 0.2);
		color: #fed7aa;
	}

	.mindmap-node.priority-low .mindmap-chip-priority {
		background: rgba(16, 185, 129, 0.2);
		color: #a7f3d0;
	}

	.mindmap-chip-assignee {
		font-style: italic;
	}

	.comment-bubble {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		background: rgba(99, 102, 241, 0.12);
		border: 1px solid rgba(99, 102, 241, 0.3);
		border-radius: 999px;
		padding: 0.35rem 0.55rem;
		cursor: pointer;
		transition: all 150ms ease;
		gap: 0.35rem;
	}

	.comment-bubble-empty {
		background: rgba(99, 102, 241, 0.08);
		border-color: rgba(99, 102, 241, 0.18);
	}

	.comment-bubble:hover {
		background: rgba(99, 102, 241, 0.2);
		border-color: rgba(99, 102, 241, 0.5);
		transform: scale(1.05);
	}

	.comment-icon {
		width: 16px;
		height: 16px;
		color: rgba(199, 210, 254, 0.9);
		flex-shrink: 0;
	}

	.comment-count {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(199, 210, 254, 0.95);
		line-height: 1;
		min-width: 1ch;
		text-align: center;
	}

	.comment-count-muted {
		color: rgba(199, 210, 254, 0.65);
	}

	.notes-bubble {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.18);
		border-radius: 999px;
		padding: 0.35rem 0.55rem;
		cursor: pointer;
		transition: all 150ms ease;
		gap: 0.35rem;
	}

	.notes-bubble-has-content {
		background: rgba(16, 185, 129, 0.12);
		border-color: rgba(16, 185, 129, 0.3);
	}

	.notes-bubble:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.5);
		transform: scale(1.05);
	}

	.notes-icon {
		width: 16px;
		height: 16px;
		color: rgba(167, 243, 208, 0.9);
		flex-shrink: 0;
	}

	.attachment-count {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(167, 243, 208, 0.95);
		line-height: 1;
		min-width: 1ch;
		text-align: center;
	}

	.attachment-count-muted {
		color: rgba(167, 243, 208, 0.65);
	}

	.mindmap-notes {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: rgba(226, 232, 240, 0.82);
	}

	@media (max-width: 720px) {
		.mindmap-level {
			padding-left: 1.2rem;
			gap: 0.9rem;
		}

		.mindmap-item::before {
			width: 0.75rem;
		}

		.mindmap-node {
			flex-direction: column;
		}

		.mindmap-toggle {
			align-self: flex-start;
		}

		.mindmap-heading {
			gap: 0.35rem;
		}
	}

	/* Notes Section Styling */
	.mindmap-notes-section {
		background: rgba(30, 41, 59, 0.5);
		border: 1px solid rgba(51, 65, 85, 0.5);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 0.75rem;
	}

	.notes-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.notes-title {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--foreground, #e2e8f0);
	}

	.notes-edit-btn {
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		color: #93c5fd;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.notes-edit-btn:hover {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	.notes-textarea {
		width: 100%;
		min-height: 120px;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.8);
		border: 1px solid rgba(51, 65, 85, 0.5);
		border-radius: 6px;
		color: var(--foreground, #e2e8f0);
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}

	.notes-textarea:focus {
		outline: none;
		border-color: rgba(99, 102, 241, 0.5);
	}

	.notes-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.notes-save-btn,
	.notes-cancel-btn {
		padding: 0.4rem 1rem;
		border-radius: 4px;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
	}

	.notes-save-btn {
		background: rgba(34, 197, 94, 0.2);
		color: #86efac;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.notes-save-btn:hover {
		background: rgba(34, 197, 94, 0.3);
		border-color: rgba(34, 197, 94, 0.5);
	}

	.notes-cancel-btn {
		background: rgba(100, 116, 139, 0.2);
		color: #cbd5e1;
		border: 1px solid rgba(100, 116, 139, 0.3);
	}

	.notes-cancel-btn:hover {
		background: rgba(100, 116, 139, 0.3);
		border-color: rgba(100, 116, 139, 0.5);
	}

	.notes-preview {
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.5);
		border-radius: 6px;
		color: var(--foreground, #e2e8f0);
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.notes-empty {
		padding: 1.5rem;
		text-align: center;
		color: var(--muted-foreground, #94a3b8);
		font-style: italic;
		cursor: pointer;
		border: 1px dashed rgba(100, 116, 139, 0.3);
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.notes-empty:hover {
		background: rgba(30, 41, 59, 0.3);
		border-color: rgba(100, 116, 139, 0.5);
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3) {
		margin-top: 1rem;
		margin-bottom: 0.5rem;
		color: var(--foreground, #e2e8f0);
	}

	.markdown-content :global(p) {
		margin: 0.5rem 0;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.markdown-content :global(code) {
		background: rgba(15, 23, 42, 0.8);
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		font-size: 0.85em;
	}

	.markdown-content :global(pre) {
		background: rgba(15, 23, 42, 0.8);
		padding: 1rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.5rem 0;
	}

	.markdown-content :global(a) {
		color: #93c5fd;
		text-decoration: none;
	}

	.markdown-content :global(a:hover) {
		text-decoration: underline;
	}

	:global(body.dark-mode) .mindmap-notes-section {
		background: rgba(30, 41, 59, 0.7);
		border-color: rgba(51, 65, 85, 0.7);
	}

	:global(body.dark-mode) .notes-textarea {
		background: rgba(15, 23, 42, 0.9);
	}

	:global(body.dark-mode) .notes-preview {
		background: rgba(15, 23, 42, 0.7);
	}
</style>
