<script>
	import { getContext, onMount, onDestroy } from 'svelte';
	import { marked } from 'marked';
	import TodoAttachments from './TodoAttachments.svelte';
	import TodoItemComponent from './TodoItem.svelte';
	import { emitEditing, emitStoppedEditing, emitTyping, emitStoppedTyping } from '$lib/stores/websocket.js';

	let {
		todo,
		level = 0,
		currentUserId,
		onDragStart = null,
		onDragOver = null,
		onDrop = null,
		onDragEnd = null,
		isDragging = false,
		isDragOver = false
	} = $props();

	const {
		toggleTodoComplete,
		deleteTodo,
		toggleExpanded,
		isExpanded,
	addSubtask,
	priorityLabel,
	priorityClass,
	updateTodoText,
	updateTodoPriority,
	updateTodoDueDate,
	updateTodoNotes,
	updateTodoAssignee,
	getListMembers,
	getEditingUser,
	getTypingUser,
	currentListId
	} = getContext('todo-actions');
const mobileEnhancements = getContext('mobile-enhancements') ?? {};
const mobileActionSheet = getContext('mobile-action-sheet') ?? null;
const domRegistry = getContext('todo-dom-registry') ?? null;
const mobileDnd = getContext('mobile-dnd') ?? null;

	const isMobileDevice = mobileEnhancements?.isMobile?.() ?? false;
	const hasTouchInput = mobileEnhancements?.hasCoarsePointer?.() ?? false;
	const openActionSheet = mobileActionSheet?.openActionSheet ?? null;

	let subtaskText = $state('');
	let subtaskPriority = $state('medium');
	let isEditingText = $state(false);
	let editedText = $state(todo.text);
	let isEditingPriority = $state(false);
	let isEditingDueDate = $state(false);
	let saveTimeout = null;
	let isCompletionAnimating = $state(false);
	let previousCompletedState = $state(todo.completed);
	let editStartText = $state('');
	let editStartNotes = $state('');
	let hasConflict = $state(false);

	let notesExpanded = $state(false);
	let isEditingNotes = $state(false);
	let editedNotes = $state(todo.notes || '');
	let notesSaveTimeout = null;

let renderedNotes = $derived(todo.notes ? marked.parse(todo.notes || '') : '');

let hasNotes = $derived.by(() => typeof todo.notes === 'string' && todo.notes.trim().length > 0);
let attachmentCount = $derived((todo.attachments ?? []).length);
let isEditingAssignee = $state(false);
let assigneeDraft = $state(todo.assigned_to ? String(todo.assigned_to) : '');

let assignmentOptions = $derived.by(() => {
	if (typeof getListMembers !== 'function') {
		return [];
	}
	const members = getListMembers() ?? [];
	return members
		.map((member) => ({ id: member.id, username: member.username, permission_level: member.permission_level }))
		.sort((a, b) => a.username.localeCompare(b.username));
});

let assigneeLabel = $derived.by(() => {
	if (!todo.assigned_to) {
		return 'Unassigned';
	}
	const match = assignmentOptions.find((member) => member.id === todo.assigned_to);
	return match ? match.username : (todo.assigned_to_username ?? 'Unassigned');
});

// Presence tracking
let editingUser = $derived.by(() => {
	const editor = getEditingUser(todo.id);
	// Don't show indicator for current user
	if (editor && editor.userId !== currentUserId) {
		return editor;
	}
	return null;
});

let typingUserText = $derived.by(() => {
	const typer = getTypingUser(todo.id, 'text');
	if (typer && typer.userId !== currentUserId) {
		return typer;
	}
	return null;
});

let typingUserNotes = $derived.by(() => {
	const typer = getTypingUser(todo.id, 'notes');
	if (typer && typer.userId !== currentUserId) {
		return typer;
	}
	return null;
});

	let canHaveSubtasks = $derived(level === 0);
let childTodos = $derived(canHaveSubtasks ? todo?.subtasks ?? [] : []);
let hasChildren = $derived(childTodos.length > 0);
const isSubtask = $derived(level > 0);

const indentVars = $derived(() => ({
	'--indent-level': level,
	'--card-offset': level > 0 ? '1rem' : '0rem'
}));

const swipeThreshold = 70;
let isSwiping = $state(false);
let swipeOffset = $state(0);
let swipeStartX = 0;
let swipeStartY = 0;
let longPressTimer;
let longPressTriggered = false;
let hostElement;
let swipeContentEl;

function openQuickActions(event = null) {
	if (typeof openActionSheet === 'function') {
		openActionSheet({
			todo,
			currentUserId,
			sourceEvent: event,
			actions: {
				startEditingText,
				toggleNotes,
				toggleExpanded: () => toggleExpanded(todo.id),
				markComplete: () => toggleTodoComplete(todo.id, todo.completed),
				deleteTodo: () => deleteTodo(todo.id)
			}
		});
	}
}

function shouldIgnoreGesture(target) {
	if (!target) return false;
	const interactive = target.closest('input, button, textarea, select, a, label');
	return Boolean(interactive);
}

function clearLongPressTimer() {
	if (longPressTimer) {
		clearTimeout(longPressTimer);
		longPressTimer = undefined;
	}
}

function handleTouchStart(event) {
	if (!hasTouchInput && !isMobileDevice) {
		return;
	}
	if (shouldIgnoreGesture(event.target)) {
		return;
	}

	const touch = event.touches?.[0];
	if (!touch) return;

	swipeStartX = touch.clientX;
	swipeStartY = touch.clientY;
	isSwiping = false;
	longPressTriggered = false;
	swipeOffset = 0;

	clearLongPressTimer();
	longPressTimer = setTimeout(() => {
		longPressTriggered = true;
		isSwiping = false;
		swipeOffset = 0;
		openQuickActions(event);
	}, 550);
}

function handleTouchMove(event) {
	if ((!hasTouchInput && !isMobileDevice) || longPressTriggered) {
		return;
	}

	const touch = event.touches?.[0];
	if (!touch) return;

	const deltaX = touch.clientX - swipeStartX;
	const deltaY = touch.clientY - swipeStartY;

	if (!isSwiping) {
		if (Math.abs(deltaX) < 12 || Math.abs(deltaX) < Math.abs(deltaY)) {
			return;
		}
		isSwiping = true;
	}

	if (isSwiping) {
		clearLongPressTimer();
		event.preventDefault();
		event.stopPropagation();
		const limited = Math.max(Math.min(deltaX, 140), -140);
		swipeOffset = limited;
	}
}

async function triggerSwipeAction(action) {
	if (action === 'complete') {
		await toggleTodoComplete(todo.id, todo.completed);
	} else if (action === 'delete') {
		const confirmDelete = confirm('Delete this task?');
		if (confirmDelete) {
			await deleteTodo(todo.id);
		}
	}
}

async function handleTouchEnd() {
	clearLongPressTimer();
	if (!isSwiping) {
		if (!longPressTriggered) {
			// treat as tap, no action
		}
		swipeOffset = 0;
		isSwiping = false;
		return;
	}

	const finalOffset = swipeOffset;
	swipeOffset = 0;
	isSwiping = false;

	if (finalOffset > swipeThreshold) {
		await triggerSwipeAction('complete');
	} else if (finalOffset < -swipeThreshold) {
		await triggerSwipeAction('delete');
	}
	longPressTriggered = false;
}

function handleDragHandlePointerDown(event) {
	if (!mobileDnd?.startDrag) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	clearLongPressTimer();
	mobileDnd.startDrag({ todo, level }, event);
}

onMount(() => {
	domRegistry?.registerElement?.(todo.id, hostElement);
	if (swipeContentEl) {
		swipeContentEl.addEventListener('touchmove', handleTouchMove, { passive: false });
	}
	return () => {
		domRegistry?.unregisterElement?.(todo.id);
		if (swipeContentEl) {
			swipeContentEl.removeEventListener('touchmove', handleTouchMove);
		}
	};
});

onDestroy(() => {
	clearLongPressTimer();
});

	// Watch for completion state changes to trigger animation
	$effect(() => {
		if (todo.completed !== previousCompletedState) {
			if (todo.completed) {
				// Task just completed - trigger animation
				isCompletionAnimating = true;
				setTimeout(() => {
					isCompletionAnimating = false;
				}, 1000);
			}
			previousCompletedState = todo.completed;
		}
	});

	function handleActivationKey(event, callback) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			callback?.();
		}
	}

	async function handleAddSubtask() {
		if (!canHaveSubtasks) return;
		const text = subtaskText.trim();
		if (!text) return;
		const success = await addSubtask(todo.id, text, subtaskPriority);
		if (success) {
			subtaskText = '';
			subtaskPriority = 'medium';
		}
	}

	function handleKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleAddSubtask();
		}
	}

	function startEditingText() {
		isEditingText = true;
		editedText = todo.text;
		editStartText = todo.text; // Store original value for conflict detection
		hasConflict = false;
		// Emit presence event
		const listId = currentListId();
		if (listId) {
			emitEditing(todo.id, listId);
		}
	}

	function cancelEditingText() {
		isEditingText = false;
		editedText = todo.text;
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		// Emit presence event
		const listId = currentListId();
		if (listId) {
			emitStoppedEditing(todo.id, listId);
			emitStoppedTyping(todo.id, listId, 'text');
		}
	}

	async function saveText(stopEditing = true) {
		const trimmedText = editedText.trim();
		if (!trimmedText || trimmedText === todo.text) {
			if (stopEditing) {
				isEditingText = false;
				// Emit presence event
				const listId = currentListId();
				if (listId) {
					emitStoppedEditing(todo.id, listId);
					emitStoppedTyping(todo.id, listId, 'text');
				}
			}
			return;
		}

		// Check for conflict - has the todo been modified by someone else while we were editing?
		if (editStartText !== todo.text && todo.text !== editedText) {
			// Conflict detected!
			hasConflict = true;
			const confirmed = confirm(
				`Warning: This todo was modified by another user while you were editing.\n\n` +
				`Their version: "${todo.text}"\n` +
				`Your version: "${trimmedText}"\n\n` +
				`Click OK to save your changes (overwrite), or Cancel to discard your changes.`
			);

			if (!confirmed) {
				// User chose to discard their changes
				editedText = todo.text;
				isEditingText = false;
				hasConflict = false;
				const listId = currentListId();
				if (listId) {
					emitStoppedEditing(todo.id, listId);
					emitStoppedTyping(todo.id, listId, 'text');
				}
				return;
			}
			hasConflict = false;
		}

		await updateTodoText(todo.id, trimmedText);

		// Only stop editing if explicitly requested (e.g., on blur or Enter key)
		if (stopEditing) {
			isEditingText = false;
			// Emit presence event
			const listId = currentListId();
			if (listId) {
				emitStoppedEditing(todo.id, listId);
				emitStoppedTyping(todo.id, listId, 'text');
			}
		}
	}

	function handleTextKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveText();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditingText();
		}
	}

	function handleTextInput(event) {
		editedText = event.currentTarget.value;

		// Emit typing indicator
		const listId = currentListId();
		if (listId) {
			emitTyping(todo.id, listId, 'text');
		}

		// Debounced auto-save (but don't stop editing)
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => {
			if (isEditingText && editedText.trim() && editedText.trim() !== todo.text) {
				saveText(false); // Auto-save without stopping editing state
			}
		}, 1000);
	}

	async function handlePriorityChange(newPriority) {
		isEditingPriority = false;
		if (newPriority !== todo.priority) {
			await updateTodoPriority(todo.id, newPriority);
		}
	}

	async function handleDueDateChange(event) {
		const newDueDate = event.currentTarget.value;
		isEditingDueDate = false;
		if (newDueDate !== todo.due_date) {
			await updateTodoDueDate(todo.id, newDueDate || null);
		}
	}

	function toggleNotes() {
		notesExpanded = !notesExpanded;
		if (notesExpanded && !hasNotes && attachmentCount === 0) {
			isEditingNotes = true;
		}
	}

	function startEditingNotes() {
		isEditingNotes = true;
		editedNotes = todo.notes || '';
		editStartNotes = todo.notes || ''; // Store original value for conflict detection
		hasConflict = false;
		// Emit presence event
		const listId = currentListId();
		if (listId) {
			emitEditing(todo.id, listId);
		}
	}

	function cancelEditingNotes() {
		isEditingNotes = false;
		editedNotes = todo.notes || '';
		if (notesSaveTimeout) {
			clearTimeout(notesSaveTimeout);
			notesSaveTimeout = null;
		}
		// Emit presence event
		const listId = currentListId();
		if (listId) {
			emitStoppedEditing(todo.id, listId);
			emitStoppedTyping(todo.id, listId, 'notes');
		}
	}

	async function saveNotes(stopEditing = true) {
		const trimmedNotes = editedNotes.trim();

		// Check for conflict
		const currentNotes = todo.notes || '';
		if (editStartNotes !== currentNotes && currentNotes !== trimmedNotes) {
			// Conflict detected!
			hasConflict = true;
			const confirmed = confirm(
				`Warning: These notes were modified by another user while you were editing.\n\n` +
				`Click OK to save your changes (overwrite), or Cancel to discard your changes.`
			);

			if (!confirmed) {
				// User chose to discard their changes
				editedNotes = todo.notes || '';
				isEditingNotes = false;
				hasConflict = false;
				const listId = currentListId();
				if (listId) {
					emitStoppedEditing(todo.id, listId);
					emitStoppedTyping(todo.id, listId, 'notes');
				}
				return;
			}
			hasConflict = false;
		}

		await updateTodoNotes(todo.id, trimmedNotes || null);

		// Only stop editing if explicitly requested
		if (stopEditing) {
			// Emit presence event
			const listId = currentListId();
			if (listId && isEditingNotes) {
				emitStoppedEditing(todo.id, listId);
				emitStoppedTyping(todo.id, listId, 'notes');
			}
		}
	}

	function handleNotesInput(event) {
		editedNotes = event.currentTarget.value;

		// Emit typing indicator
		const listId = currentListId();
		if (listId) {
			emitTyping(todo.id, listId, 'notes');
		}

		// Debounced auto-save (but don't stop editing)
		if (notesSaveTimeout) {
			clearTimeout(notesSaveTimeout);
		}
		notesSaveTimeout = setTimeout(() => {
			if (editedNotes.trim() !== (todo.notes || '')) {
				saveNotes(false); // Auto-save without stopping editing state
			}
		}, 1000);
	}

function handleNotesKeyDown(event) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancelEditingNotes();
	}
	// Allow Ctrl/Cmd+Enter to save and stop editing
	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
		event.preventDefault();
		saveNotes(true); // Save and stop editing
		isEditingNotes = false;
	}
}

function startEditingAssignee() {
	isEditingAssignee = true;
	assigneeDraft = todo.assigned_to ? String(todo.assigned_to) : '';
}

function cancelEditingAssignee() {
	isEditingAssignee = false;
	assigneeDraft = todo.assigned_to ? String(todo.assigned_to) : '';
}

async function handleAssigneeChange(event) {
	const value = event.currentTarget.value;
	const newAssignee = value === '' ? null : Number(value);
	if ((newAssignee ?? null) === (todo.assigned_to ?? null)) {
		isEditingAssignee = false;
		return;
	}
	const success = await updateTodoAssignee(todo.id, newAssignee);
	assigneeDraft = success ? value : (todo.assigned_to ? String(todo.assigned_to) : '');
	isEditingAssignee = false;
}

function handleAssigneeKeyDown(event) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancelEditingAssignee();
	}
}
</script>

<li
	class="todo-item"
	class:subtask-card={isSubtask}
	style={indentVars}
	class:completed={todo.completed}
	class:being-edited={editingUser !== null}
	class:completing={isCompletionAnimating}
	class:dragging={isDragging}
	class:drag-over={isDragOver}
	class:swipe-right={swipeOffset > 16}
	class:swipe-left={swipeOffset < -16}
	bind:this={hostElement}
	draggable={onDragStart !== null && !(isMobileDevice && hasTouchInput)}
	ondragstart={onDragStart ? () => onDragStart(todo) : null}
	ondragover={onDragOver ? (e) => onDragOver(e, todo) : null}
	ondrop={onDrop ? (e) => onDrop(e, todo) : null}
	ondragend={onDragEnd ? () => onDragEnd() : null}
>
	<div class="swipe-background">
		<div class="swipe-zone swipe-complete">
			<span>✓ Complete</span>
		</div>
		<div class="swipe-zone swipe-delete">
			<span>🗑 Delete</span>
		</div>
	</div>
	<div
		class="swipe-content"
		class:swiping={isSwiping}
		style={`transform: translateX(${swipeOffset}px);`}
		bind:this={swipeContentEl}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
		ontouchcancel={handleTouchEnd}
	>
	{#if editingUser}
		<div class="presence-indicator">
			<span class="presence-badge">✏️ {editingUser.username} is editing</span>
		</div>
	{/if}
	{#if hasConflict}
		<div class="conflict-indicator">
			<span class="conflict-badge">⚠️ Conflict detected</span>
		</div>
	{/if}
	<div class="todo-row" class:has-mobile-handle={(hasTouchInput || isMobileDevice) && level === 0}>
		{#if (hasTouchInput || isMobileDevice) && level === 0}
			<div class="drag-handle-cell">
				<button
					type="button"
					class="drag-handle-btn"
					onpointerdown={handleDragHandlePointerDown}
					aria-label="Reorder task"
				>
					☰
				</button>
			</div>
		{/if}
		<div class="checkbox-cell">
			<input
				type="checkbox"
				checked={todo.completed}
				onchange={() => toggleTodoComplete(todo.id, todo.completed)}
				aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
			/>
		</div>
		<div class="expand-cell">
			{#if canHaveSubtasks && hasChildren}
				<button
					type="button"
					class="expand-btn"
					class:expanded={isExpanded(todo.id)}
					onclick={() => toggleExpanded(todo.id)}
					aria-label={isExpanded(todo.id) ? 'Collapse subtasks' : 'Expand subtasks'}
				>
					{isExpanded(todo.id) ? '▾' : '▸'}
				</button>
			{/if}
		</div>
		<div class="content-cell">
			{#if isEditingText}
				<input
					type="text"
					class="todo-title-input"
					value={editedText}
					oninput={handleTextInput}
					onkeydown={handleTextKeyDown}
					onblur={saveText}
				/>
			{:else}
				<span
					class="todo-title"
					class:editable={!todo.completed}
					role="button"
					tabindex={!todo.completed ? 0 : undefined}
					aria-disabled={todo.completed}
					onclick={!todo.completed ? startEditingText : undefined}
					onkeydown={!todo.completed ? (event) => handleActivationKey(event, startEditingText) : undefined}
				>
					{todo.text}
					{#if typingUserText}
						<span class="typing-indicator">✍️ {typingUserText.username}</span>
					{/if}
				</span>
			{/if}

		<div class="meta-row">
			<div class="meta-item">
				{#if isEditingPriority}
					<select
						class="priority-dropdown meta-control"
						value={todo.priority}
						onchange={(e) => handlePriorityChange(e.currentTarget.value)}
						onblur={() => isEditingPriority = false}
					>
						<option value="high">High priority</option>
						<option value="medium">Medium priority</option>
						<option value="low">Low priority</option>
					</select>
				{:else}
					<span
						class={`priority-badge ${priorityClass(todo.priority)} editable meta-chip`}
						onclick={() => isEditingPriority = true}
						role="button"
						tabindex={0}
						onkeydown={(event) => handleActivationKey(event, () => { isEditingPriority = true; })}
						title="Tap to change priority"
					>
						{priorityLabel(todo.priority)}
					</span>
				{/if}
			</div>
			<div class="meta-item">
				{#if isEditingDueDate}
					<input
						type="datetime-local"
						class="due-date-input meta-control"
						value={todo.due_date ? new Date(todo.due_date).toISOString().slice(0, 16) : ''}
						onchange={handleDueDateChange}
						onblur={() => isEditingDueDate = false}
					/>
				{:else if todo.due_date}
					<button
						type="button"
						class={`meta-chip meta-chip--due ${todo.overdue ? 'meta-chip--overdue' : ''}`}
						onclick={() => isEditingDueDate = true}
						onkeydown={(event) => handleActivationKey(event, () => { isEditingDueDate = true; })}
						title="Tap to adjust due date"
					>
						⏰ {todo.due_date_label ?? ''}
					</button>
				{:else}
					<button
						type="button"
						class="meta-chip meta-chip--ghost add-due-date-btn"
						onclick={() => isEditingDueDate = true}
						title="Add due date"
					>
						+ Due date
					</button>
				{/if}
			</div>
			<div class="meta-item">
				{#if isEditingAssignee}
					<select
						class="assignee-dropdown meta-control"
						value={assigneeDraft}
						onchange={handleAssigneeChange}
						onblur={cancelEditingAssignee}
						onkeydown={handleAssigneeKeyDown}
					>
						<option value="">Unassigned</option>
						{#each assignmentOptions as member (member.id)}
							<option value={String(member.id)}>{member.username}</option>
						{/each}
					</select>
				{:else}
					<button
						type="button"
						class="assignee-badge meta-chip"
						onclick={startEditingAssignee}
						onkeydown={(event) => handleActivationKey(event, startEditingAssignee)}
						title="Tap to change assignee"
					>
						👤 {assigneeLabel}
					</button>
				{/if}
			</div>
			{#if todo.is_recurring}
				<span class="meta-chip meta-chip--recurring">🔄 {todo.recurrence_pattern}</span>
			{/if}
			{#if todo.completed && todo.completed_by_username}
				<span class="meta-chip meta-chip--completed" title="Completed by">✓ {todo.completed_by_username}</span>
			{/if}
		</div>
		</div>
		<div class="actions-cell">
		<button
			class="notes-toggle-btn"
			type="button"
			onclick={toggleNotes}
			title={hasNotes || attachmentCount ? 'View notes & attachments' : 'Add notes or attachments'}
			aria-label={notesExpanded ? 'Hide notes & attachments' : 'Show notes & attachments'}
		>
			📝
			{#if attachmentCount > 0}
				<span class="attachments-count">{attachmentCount}</span>
			{/if}
		</button>
			<button class="delete-btn" type="button" onclick={() => deleteTodo(todo.id)} aria-label="Delete">
				×
			</button>
		</div>
	</div>

	{#if notesExpanded}
		<div class="notes-section">
			<div class="notes-header">
				<span class="notes-title">Notes</span>
				{#if !isEditingNotes && todo.notes}
					<button
						class="notes-edit-btn"
						type="button"
						onclick={startEditingNotes}
						title="Edit notes"
					>
						Edit
					</button>
				{/if}
			</div>

			{#if isEditingNotes}
				<div class="notes-editor">
					{#if typingUserNotes}
						<div class="typing-notification">
							<span class="typing-indicator-notes">✍️ {typingUserNotes.username} is typing...</span>
						</div>
					{/if}
					<textarea
						class="notes-textarea"
						value={editedNotes}
						oninput={handleNotesInput}
						onkeydown={handleNotesKeyDown}
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
							onclick={() => { saveNotes(); isEditingNotes = false; }}
						>
							Save
						</button>
						<button
							class="notes-cancel-btn"
							type="button"
							onclick={cancelEditingNotes}
						>
							Cancel
						</button>
						<span class="notes-hint">Auto-saves after 1s | Ctrl+Enter to save | Esc to cancel</span>
					</div>
				</div>
			{:else if todo.notes}
				<div class="notes-preview markdown-content">
					{@html renderedNotes}
				</div>
			{:else}
				<div
					class="notes-empty"
					onclick={startEditingNotes}
					role="button"
					tabindex={0}
					onkeydown={(event) => handleActivationKey(event, startEditingNotes)}
				>
					Click to add notes...
				</div>
	{/if}
	</div>

		<TodoAttachments todoId={todo.id} attachments={todo.attachments ?? []} />
	{/if}

	{#if canHaveSubtasks && hasChildren}
		<div class="subtask-summary">
			<div class="progress-bar" aria-hidden="true">
				<div class="progress-bar-fill" style={`width: ${todo.progressPercent ?? 0}%`}></div>
			</div>
			<span class="subtask-progress-label">
				{todo.completedSubtasks}/{todo.totalSubtasks} subtasks complete
			</span>
		</div>
	{/if}

	{#if canHaveSubtasks && hasChildren && isExpanded(todo.id)}
		<ul class="child-list">
			{#each childTodos as subtask (subtask.id)}
				<TodoItemComponent
					todo={subtask}
					level={level + 1}
					{currentUserId}
					{onDragStart}
					{onDragOver}
					{onDrop}
					{onDragEnd}
					isDragging={false}
					isDragOver={false}
				/>
			{/each}
		</ul>
	{/if}

	{#if canHaveSubtasks}
		<div class="subtask-input" class:hidden={!isExpanded(todo.id) && hasChildren}>
			<div class="subtask-input-inner">
				<input
					type="text"
					placeholder="Add subtask"
					value={subtaskText}
					oninput={(event) => subtaskText = event.currentTarget.value}
					onkeydown={handleKeyDown}
				/>
				<select bind:value={subtaskPriority}>
					<option value="high">High priority</option>
					<option value="medium">Medium priority</option>
					<option value="low">Low priority</option>
				</select>
				<button type="button" class="btn-add-subtask" onclick={handleAddSubtask}>
					Add
				</button>
			</div>
		</div>
	{/if}

	</div>
</li>

<style>
	:global(:root) {
		--indent-size: 1.5rem;
	}

	.todo-item {
		list-style: none;
		margin: var(--todo-item-margin, 0 0 1rem 0);
		margin-left: var(--card-offset, 0);
		background: #fafafa;
		border: 1px solid #e2e6ff;
		border-radius: 12px;
		box-shadow: 0 4px 14px rgba(64, 76, 140, 0.06);
		padding: 0;
		overflow: hidden;
		transition: border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
		position: relative;
		cursor: grab;
	}

	.todo-item.subtask-card {
		background: linear-gradient(135deg, #f5f7ff 0%, #fbfcff 100%);
		border-color: rgba(102, 126, 234, 0.25);
	}

	.swipe-content {
		position: relative;
		z-index: 1;
		padding: var(--todo-item-padding, 0.9rem 1.1rem);
		background: inherit;
		transition: transform 0.2s ease;
		will-change: transform;
	}

	.swipe-content.swiping {
		transition: none;
	}

	.swipe-background {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: space-between;
		align-items: stretch;
		pointer-events: none;
		background: transparent;
	}

	.swipe-zone {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #fff;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0 1rem;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.swipe-zone.swipe-complete {
		background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
	}

	.swipe-zone.swipe-delete {
		background: linear-gradient(135deg, #fb7185 0%, #ef4444 100%);
	}

	.todo-item.swipe-right .swipe-zone.swipe-complete,
	.todo-item.swipe-left .swipe-zone.swipe-delete {
		opacity: 1;
	}

	.todo-item[draggable="true"]:active {
		cursor: grabbing;
	}

	.todo-item.dragging {
		opacity: 0.5;
		transform: scale(0.98);
	}

	.todo-item.drag-over {
		border-color: #667eea;
		border-width: 2px;
		border-style: dashed;
		box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
	}

	.todo-item.being-edited {
		border-color: #ffa726;
		box-shadow: 0 0 0 2px rgba(255, 167, 38, 0.2);
	}

	.todo-item.completed {
		opacity: 0.85;
	}

	.todo-item.completing {
		animation: complete-celebration 1s ease-out;
	}

	@keyframes complete-celebration {
		0% {
			transform: scale(1);
			background: #fafafa;
		}
		15% {
			transform: scale(1.02);
			background: #def7e5;
			box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.3);
		}
		50% {
			background: #def7e5;
		}
		100% {
			transform: scale(1);
			background: #fafafa;
			box-shadow: 0 4px 14px rgba(64, 76, 140, 0.06);
		}
	}

	.presence-indicator {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 10;
	}

	.presence-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.7rem;
		background: linear-gradient(135deg, #ffa726 0%, #ff9800 100%);
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 999px;
		box-shadow: 0 2px 8px rgba(255, 167, 38, 0.3);
		animation: pulse-presence 2s ease-in-out infinite;
	}

	.conflict-indicator {
		position: absolute;
		top: 2.5rem;
		right: 0.5rem;
		z-index: 10;
	}

	.conflict-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.7rem;
		background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 999px;
		box-shadow: 0 2px 8px rgba(239, 83, 80, 0.3);
		animation: pulse-conflict 1s ease-in-out infinite;
	}

	@keyframes pulse-conflict {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	@keyframes pulse-presence {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}

	.typing-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.5rem;
		padding: 0.2rem 0.5rem;
		background: #e3f2fd;
		color: #1976d2;
		font-size: 0.7rem;
		font-weight: 600;
		border-radius: 999px;
		animation: typing-pulse 1.5s ease-in-out infinite;
	}

	@keyframes typing-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	.typing-notification {
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		background: #e3f2fd;
		border-left: 3px solid #1976d2;
		border-radius: 4px;
	}

	.typing-indicator-notes {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: #1976d2;
		font-size: 0.8rem;
		font-weight: 600;
		animation: typing-pulse 1.5s ease-in-out infinite;
	}

	.todo-row {
		display: grid;
		grid-template-columns: 26px 26px minmax(0, 1fr) auto;
		align-items: center;
	gap: var(--todo-item-gap, 0.75rem);
		padding-left: calc(var(--indent-size) * var(--indent-level));
		font-size: var(--todo-item-font-size, 1rem);
	}

	.todo-row.has-mobile-handle {
		grid-template-columns: 32px 26px 26px minmax(0, 1fr) auto;
	}

	.drag-handle-cell {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.drag-handle-btn {
		border: none;
		background: transparent;
		font-size: 1.2rem;
		line-height: 1;
		cursor: grab;
		color: #9aa0c2;
		padding: 0;
	}

	.drag-handle-btn:active {
		cursor: grabbing;
		color: #5568d3;
	}

	.todo-row input[type='checkbox'] {
		width: 18px;
		height: 18px;
	}

	@media (max-width: 640px) {
		:global(:root) {
			--indent-size: 1.1rem;
		}

		.todo-item {
			padding: 0;
			margin-bottom: 1.25rem;
		}

		.swipe-content {
			padding: 1rem 1.1rem;
		}

		.todo-row {
			display: flex;
			align-items: flex-start;
			gap: 0.75rem;
			flex-wrap: nowrap;
		}

		.todo-row.has-mobile-handle {
			display: flex;
		}

		.drag-handle-cell {
			display: none;
		}

		/* Hide metadata by default on mobile - only show essential info */
		.meta-row {
			display: none;
		}

		/* Show metadata when todo is expanded/being edited */
		.todo-item.being-edited .meta-row,
		.todo-item:focus-within .meta-row {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			margin-top: 0.75rem;
			padding-top: 0.75rem;
			border-top: 1px solid #e4e9ff;
		}

		:global(body.dark-mode) .todo-item.being-edited .meta-row,
		:global(body.dark-mode) .todo-item:focus-within .meta-row {
			border-top-color: #404057;
		}

		.meta-item {
			width: 100%;
		}

		.meta-chip,
		.meta-control {
			width: 100%;
			justify-content: flex-start;
			min-height: 44px;
		}

		.checkbox-cell {
			align-self: flex-start;
			order: 0;
			margin-top: 0.3rem;
		}

		.expand-cell {
			align-self: flex-start;
			order: 1;
			margin-top: 0.25rem;
		}

		.content-cell {
			order: 2;
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: 0;
		}

		.actions-cell {
			order: 3;
			margin-left: auto;
			display: flex;
			align-items: flex-start;
			gap: 0.5rem;
			padding-top: 0.3rem;
		}

		/* More breathing room for subtasks on mobile */
		.child-list {
			margin-left: 0.5rem;
			padding-left: 0.75rem;
			border-left-width: 2px;
			margin-top: 0.75rem;
		}

		/* Hide subtask input by default on mobile */
		.subtask-input {
			margin-left: 0.5rem;
			margin-top: 0.5rem;
		}

		/* Better text wrapping on mobile */
		.todo-title {
			white-space: normal;
			word-break: break-word;
			overflow-wrap: anywhere;
			font-size: 1rem;
			line-height: 1.5;
			padding: 0;
		}

		.todo-title-input {
			font-size: 1rem;
			min-width: 100%;
			padding: 0.5rem;
		}

		.priority-badge {
			font-size: 0.8rem;
			padding: 0.4rem 0.75rem;
		}

		.notes-section {
			padding: 0.75rem;
			margin-top: 0.75rem;
			margin-left: 0;
			margin-right: 0;
		}

		.subtask-summary {
			margin-top: 0.75rem;
			padding-left: 0;
		}

		/* Make action buttons more tappable on mobile */
		.notes-toggle-btn,
		.delete-btn {
			min-width: 44px;
			min-height: 44px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 1.3rem;
		}

		.expand-btn {
			min-width: 32px;
			min-height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		/* Subtasks - collapse by default on mobile */
		.todo-item.subtask-card {
			margin-bottom: 0.75rem;
		}

		.todo-item.subtask-card .meta-row {
			display: none;
		}
	}

	.expand-cell {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.expand-btn {
		border: none;
		background: transparent;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		color: #9aa0c2;
		transition: color 0.2s ease;
	}

	.expand-btn.expanded,
	.expand-btn:hover {
		color: #5568d3;
	}

	.content-cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.todo-title {
		font-weight: 600;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.todo-title.editable {
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 3px;
		transition: background-color 0.2s ease;
	}

	.todo-title.editable:hover {
		background-color: rgba(102, 126, 234, 0.1);
	}

	.todo-title-input {
		font-weight: 600;
		padding: 2px 4px;
		border: 2px solid #667eea;
		border-radius: 3px;
		background: white;
		min-width: 200px;
		font-size: inherit;
		font-family: inherit;
	}

	.todo-title-input:focus {
		outline: none;
		border-color: #5568d3;
	}

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.6rem;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.meta-control {
		width: 100%;
		min-width: 0;
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 2px solid #e5e7eb;
		font-size: 0.9rem;
		font-weight: 500;
		background: #ffffff;
	}

	.meta-control:focus {
		outline: none;
		border-color: #94a3f5;
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
	}

	.meta-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		background: #f0f3ff;
		color: #2c3e66;
		border: 1px solid rgba(99, 102, 241, 0.25);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.meta-chip:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 15px rgba(15, 23, 42, 0.1);
	}

	.meta-chip:focus-visible {
		outline: 2px solid rgba(99, 102, 241, 0.5);
		outline-offset: 2px;
	}

	.meta-chip--ghost {
		background: transparent;
		border-style: dashed;
		color: #3b5bfd;
	}

	.meta-chip--due {
		background: #eef6ff;
		border-color: #bfdbfe;
		color: #1d4ed8;
	}

	.meta-chip--overdue {
		background: #ffe4e6;
		border-color: #fca5a5;
		color: #b91c1c;
	}

	.meta-chip--recurring {
		background: #ecfdf5;
		border-color: #99f6e4;
		color: #047857;
	}

	.meta-chip--completed {
		background: #e9f7ef;
		border-color: #a7f3d0;
		color: #0f766e;
	}

	.todo-item.subtask-card .meta-chip {
		background: rgba(99, 102, 241, 0.12);
		border-color: rgba(99, 102, 241, 0.2);
		color: #364571;
	}

	.todo-item.completed .todo-title {
		text-decoration: line-through;
		color: #888;
	}

	.priority-badge {
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 600;
	}

	.priority-badge.editable {
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.priority-badge.editable:hover {
		transform: scale(1.05);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.priority-dropdown {
		padding: 0.25rem 0.5rem;
		border: 2px solid #667eea;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		background: white;
	}

	.priority-dropdown:focus {
		outline: none;
		border-color: #5568d3;
	}

.assignee-badge {
	border: none;
	background: transparent;
	padding: 0;
	font: inherit;
}

	.assignee-dropdown {
		padding: 0.3rem 0.6rem;
		border: 2px solid #ccd2ff;
		border-radius: 6px;
		font-size: 0.85rem;
		background: white;
		cursor: pointer;
	}

	.assignee-dropdown:focus {
		outline: none;
		border-color: #667eea;
	}

	.priority-high {
		background: #ffe3df;
		color: #c52b1c;
	}

	.priority-medium {
		background: #fff0d9;
		color: #b37a05;
	}

	.priority-low {
		background: #e4faf3;
		color: #0d8a73;
	}

	.due-date {
		font-size: 0.82rem;
		color: #525f8a;
		background: #edf0ff;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
	}

	.due-date.editable {
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.due-date.editable:hover {
		transform: scale(1.05);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.due-date.overdue-label {
		background: #ffe0e3;
		color: #c0392b;
	}

	.due-date-input {
		padding: 0.25rem 0.5rem;
		border: 2px solid #667eea;
		border-radius: 6px;
		font-size: 0.82rem;
		background: white;
	}

	.due-date-input:focus {
		outline: none;
		border-color: #5568d3;
	}

	.add-due-date-btn {
		font-size: 0.8rem;
		padding: 0.2rem 0.5rem;
		background: transparent;
		border: 1px dashed #9aa0c2;
		border-radius: 6px;
		color: #667eea;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-due-date-btn:hover {
		background: rgba(102, 126, 234, 0.1);
		border-color: #667eea;
		border-style: solid;
	}

	.recurring-badge {
		font-size: 0.8rem;
		background: #eef4ff;
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		color: #4656a6;
	}

	.completed-by {
		font-size: 0.78rem;
		background: #def7e5;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		color: #247939;
	}

	.actions-cell {
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.notes-toggle-btn {
		background: transparent;
		border: none;
		color: #7b88af;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		margin-right: 0.5rem;
		transition: all 0.2s ease;
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.notes-toggle-btn:hover {
		color: #667eea;
		transform: scale(1.1);
	}

	.attachments-count {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		background: #ff7043;
		color: white;
		font-size: 0.65rem;
		padding: 0.05rem 0.3rem;
		border-radius: 999px;
		font-weight: 600;
		line-height: 1;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
	}

	.delete-btn {
		background: transparent;
		border: none;
		color: #7b88af;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s ease;
	}

	.delete-btn:hover {
		color: #e25561;
	}

	.notes-section {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: #f7f8ff;
		border-radius: 8px;
		border: 1px solid #e4e9ff;
	}

	.notes-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.notes-title {
		font-weight: 600;
		font-size: 0.9rem;
		color: #525f8a;
	}

	.notes-edit-btn {
		padding: 0.25rem 0.6rem;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.notes-edit-btn:hover {
		background: #5568d3;
	}

	.notes-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notes-textarea {
		min-height: 120px;
		padding: 0.75rem;
		border: 2px solid #ccd2ff;
		border-radius: 6px;
		font-size: 0.9rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		resize: vertical;
		background: white;
	}

	.notes-textarea:focus {
		outline: none;
		border-color: #667eea;
	}

	.notes-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.notes-save-btn,
	.notes-cancel-btn {
		padding: 0.4rem 0.8rem;
		border: none;
		border-radius: 4px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.notes-save-btn {
		background: #4CAF50;
		color: white;
	}

	.notes-save-btn:hover {
		background: #43a047;
	}

	.notes-cancel-btn {
		background: #e0e0e0;
		color: #333;
	}

	.notes-cancel-btn:hover {
		background: #d0d0d0;
	}

	.notes-hint {
		font-size: 0.75rem;
		color: #7b88af;
		margin-left: auto;
	}

	.notes-preview {
		padding: 0.5rem;
		border-radius: 4px;
		background: white;
		border: 1px solid #e4e9ff;
	}

	.notes-empty {
		padding: 1rem;
		text-align: center;
		color: #9aa0c2;
		font-style: italic;
		cursor: pointer;
		border: 2px dashed #ccd2ff;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.notes-empty:hover {
		background: white;
		border-color: #667eea;
		color: #667eea;
	}


	.markdown-content {
		font-size: 0.9rem;
		line-height: 1.6;
		color: #2c3e50;
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3) {
		margin-top: 1rem;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #2c3e50;
	}

	.markdown-content :global(h1) {
		font-size: 1.5rem;
	}

	.markdown-content :global(h2) {
		font-size: 1.3rem;
	}

	.markdown-content :global(h3) {
		font-size: 1.1rem;
	}

	.markdown-content :global(p) {
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(code) {
		background: #f0f0f0;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: 'Monaco', 'Menlo', monospace;
		font-size: 0.85em;
	}

	.markdown-content :global(pre) {
		background: #f7f8ff;
		padding: 1rem;
		border-radius: 6px;
		overflow-x: auto;
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(pre code) {
		background: none;
		padding: 0;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin-left: 1.5rem;
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(li) {
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(a) {
		color: #667eea;
		text-decoration: none;
	}

	.markdown-content :global(a:hover) {
		text-decoration: underline;
	}

	.markdown-content :global(blockquote) {
		border-left: 4px solid #667eea;
		padding-left: 1rem;
		margin-left: 0;
		color: #525f8a;
		font-style: italic;
	}

	.subtask-summary {
		margin: 0.45rem 0 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-left: calc(var(--indent-size) * var(--indent-level) + 2.3rem);
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: #e8eaf6;
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: #667eea;
		transition: width 0.2s ease;
	}

	.subtask-progress-label {
		font-size: 0.8rem;
		color: #566089;
	}

	.child-list {
		list-style: none;
		padding: 0;
		margin: 0.6rem 0 0;
		border-left: 2px solid #e4e9ff;
		margin-left: calc(var(--indent-size) * var(--indent-level) + 1.7rem);
		padding-left: 1rem;
	}

	.subtask-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.8rem;
		margin-left: calc(var(--indent-size) * var(--indent-level) + 2rem);
		flex-wrap: wrap;
	}

	.subtask-input.hidden {
		display: none;
	}

	.subtask-input-inner {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.subtask-input input,
	.subtask-input select {
		padding: 0.45rem 0.6rem;
		border: 1px solid #ccd2ff;
		border-radius: 6px;
		font-size: 0.85rem;
	}

	.subtask-input select {
		cursor: pointer;
	}

	.btn-add-subtask {
		padding: 0.45rem 0.9rem;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.btn-add-subtask:hover {
		background-color: #43a047;
	}

	/* Dark Mode Styles */
	:global(body.dark-mode) .todo-item {
		background: #252538;
		border-color: #353549;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
	}

	:global(body.dark-mode) .todo-item.being-edited {
		border-color: #ffa726;
		box-shadow: 0 0 0 2px rgba(255, 167, 38, 0.3);
	}

	@keyframes complete-celebration-dark {
		0% {
			transform: scale(1);
			background: #252538;
		}
		15% {
			transform: scale(1.02);
			background: #2a4a34;
			box-shadow: 0 0 0 4px rgba(109, 217, 138, 0.3);
		}
		50% {
			background: #2a4a34;
		}
		100% {
			transform: scale(1);
			background: #252538;
			box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
		}
	}

	:global(body.dark-mode) .todo-item.completing {
		animation: complete-celebration-dark 1s ease-out;
	}

	:global(body.dark-mode) .typing-indicator {
		background: #1e3a5f;
		color: #64b5f6;
	}

	:global(body.dark-mode) .typing-notification {
		background: #1e3a5f;
		border-left-color: #64b5f6;
	}

	:global(body.dark-mode) .typing-indicator-notes {
		color: #64b5f6;
	}

	:global(body.dark-mode) .todo-item:hover {
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
	}

	:global(body.dark-mode) .todo-item.subtask-card {
		background: rgba(24, 32, 56, 0.92);
		border-color: rgba(148, 163, 196, 0.35);
	}

	:global(body.dark-mode) .todo-title {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .todo-item.completed .todo-title {
		color: #666;
	}

	:global(body.dark-mode) .expand-btn {
		color: #7a7d9e;
	}

	:global(body.dark-mode) .expand-btn.expanded,
	:global(body.dark-mode) .expand-btn:hover {
		color: #8b95e8;
	}

	:global(body.dark-mode) .delete-btn {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .delete-btn:hover {
		color: #e25561;
	}

	:global(body.dark-mode) .due-date {
		background: #353549;
		color: #b5b9d4;
	}

	:global(body.dark-mode) .due-date.overdue-label {
		background: #4a2a2e;
		color: #ff9999;
	}

	:global(body.dark-mode) .recurring-badge {
		background: #353549;
		color: #8b95e8;
	}

	:global(body.dark-mode) .completed-by {
		background: #2a4a34;
		color: #6dd98a;
	}

	:global(body.dark-mode) .meta-chip {
		background: rgba(99, 102, 241, 0.18);
		border-color: rgba(129, 140, 248, 0.35);
		color: #e0e7ff;
	}

	:global(body.dark-mode) .meta-chip--ghost {
		border-color: rgba(129, 140, 248, 0.45);
		color: #cbd5ff;
	}

	:global(body.dark-mode) .meta-chip--due {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(147, 197, 253, 0.4);
		color: #bfdbfe;
	}

	:global(body.dark-mode) .meta-chip--overdue {
		background: rgba(248, 113, 113, 0.22);
		border-color: rgba(252, 165, 165, 0.4);
		color: #fecaca;
	}

	:global(body.dark-mode) .meta-chip--recurring {
		background: rgba(52, 211, 153, 0.2);
		border-color: rgba(110, 231, 183, 0.4);
		color: #bbf7d0;
	}

	:global(body.dark-mode) .meta-chip--completed {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(52, 211, 153, 0.4);
		color: #6ee7b7;
	}

	:global(body.dark-mode) .priority-high {
		background: #4a2a2e;
		color: #ff9999;
	}

	:global(body.dark-mode) .priority-medium {
		background: #4a4230;
		color: #ffcc80;
	}

	:global(body.dark-mode) .priority-low {
		background: #2a4a3e;
		color: #6dd98a;
	}

	:global(body.dark-mode) .subtask-summary {
		color: #b5b9d4;
	}

	:global(body.dark-mode) .progress-bar {
		background: #353549;
	}

	:global(body.dark-mode) .progress-bar-fill {
		background: #8b95e8;
	}

	:global(body.dark-mode) .subtask-progress-label {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .child-list {
		border-left-color: #353549;
	}

	:global(body.dark-mode) .subtask-input input,
	:global(body.dark-mode) .subtask-input select {
		background: #353549;
		border-color: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .subtask-input input::placeholder {
		color: #7a7d9e;
	}

	:global(body.dark-mode) .todo-title.editable:hover {
		background-color: rgba(139, 149, 232, 0.15);
	}

	:global(body.dark-mode) .todo-title-input {
		background: #353549;
		border-color: #8b95e8;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .priority-dropdown {
		background: #353549;
		border-color: #8b95e8;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .assignee-badge {
		background: #2f3255;
		color: #c3c7e9;
		border-color: #4a4f7d;
	}

	:global(body.dark-mode) .assignee-badge:hover {
		background: #3a3f63;
	}

	:global(body.dark-mode) .assignee-dropdown {
		background: #353549;
		border-color: #8b95e8;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .due-date-input {
		background: #353549;
		border-color: #8b95e8;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .add-due-date-btn {
		border-color: #7a7d9e;
		color: #8b95e8;
	}

	:global(body.dark-mode) .add-due-date-btn:hover {
		background: rgba(139, 149, 232, 0.15);
		border-color: #8b95e8;
	}

	:global(body.dark-mode) .notes-toggle-btn {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .notes-toggle-btn:hover {
		color: #8b95e8;
	}

	:global(body.dark-mode) .notes-section {
		background: #2a2a3e;
		border-color: #404057;
	}

	:global(body.dark-mode) .notes-title {
		color: #b5b9d4;
	}

	:global(body.dark-mode) .notes-edit-btn {
		background: #8b95e8;
	}

	:global(body.dark-mode) .notes-edit-btn:hover {
		background: #7a84d7;
	}

	:global(body.dark-mode) .notes-textarea {
		background: #353549;
		border-color: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .notes-textarea:focus {
		border-color: #8b95e8;
	}

	:global(body.dark-mode) .notes-cancel-btn {
		background: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .notes-cancel-btn:hover {
		background: #4a4a5e;
	}

	:global(body.dark-mode) .notes-hint {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .notes-preview {
		background: #353549;
		border-color: #404057;
	}

	:global(body.dark-mode) .notes-empty {
		border-color: #404057;
		color: #7a7d9e;
	}

	:global(body.dark-mode) .notes-empty:hover {
		background: #353549;
		border-color: #8b95e8;
		color: #8b95e8;
	}


	:global(body.dark-mode) .markdown-content {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .markdown-content :global(h1),
	:global(body.dark-mode) .markdown-content :global(h2),
	:global(body.dark-mode) .markdown-content :global(h3) {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .markdown-content :global(code) {
		background: #404057;
	}

	:global(body.dark-mode) .markdown-content :global(pre) {
		background: #2a2a3e;
	}

	:global(body.dark-mode) .markdown-content :global(a) {
		color: #8b95e8;
	}

	:global(body.dark-mode) .markdown-content :global(blockquote) {
		border-left-color: #8b95e8;
		color: #b5b9d4;
	}
</style>
