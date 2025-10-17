<script>
	import { onMount, onDestroy, setContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import TodoItem from '$lib/components/TodoItem.svelte';
	import {
		initializeWebSocket,
		joinList,
		leaveList,
		onTodoCreated,
		onTodoUpdated,
		onTodoDeleted,
		onUserJoined,
		onUserLeft,
		onUserEditing,
		onUserStoppedEditing,
		onUserTyping,
		onUserStoppedTyping,
		disconnectWebSocket,
		connectionState
	} from '$lib/stores/websocket.js';
	import { themes, viewDensities, applyTheme, applyViewDensity } from '$lib/themes.js';

	let { data } = $props();

	let lists = $state([]);
	let currentList = $state(null);
	let todos = $state([]);
	let invitations = $state([]);
	let newTodoText = $state('');
	let filter = $state('all');
let newTodoMode = $state('single');
let recurrencePattern = $state('daily');
let newTodoPriority = $state('medium');
let newTodoAssignee = $state('');
let showNewListModal = $state(false);
let showInviteModal = $state(false);
let showInvitationsModal = $state(false);
let showRecentlyDeletedModal = $state(false);
let showSettingsModal = $state(false);
let newListName = $state('');
let inviteUsername = $state('');
let invitePermission = $state('editor');
let newTodoDueDate = $state('');
let newTodoReminder = $state('');
let currentListMembers = $state([]);
let sortMode = $state('manual');
let showCalendarModal = $state(false);
let deletedTodos = $state([]);
let calendarReference = $state(new Date());
let currentTime = $state(new Date());
let clockTimer;
let notificationTimer;
const notifiedReminders = new SvelteSet();
let notificationPermissionRequested = false;

let expandedTodos = $state(new SvelteSet());
let darkMode = $state(data.user.dark_mode === 1);
let currentTheme = $state(data.user.theme || 'aurora');
let currentViewDensity = $state(data.user.view_density || 'comfortable');
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABELS = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const currentUserId = data.user.id;

// Presence tracking
let activeUsers = $state(new SvelteMap()); // Map of socketId -> {userId, username}
let todoEditingState = $state(new SvelteMap()); // Map of todoId -> {userId, username, socketId}
let todoTypingState = $state(new SvelteMap()); // Map of "todoId:field" -> {userId, username, socketId}

function resolvePriorityKey(value) {
	if (!value) return 'medium';
	const normalized = String(value).toLowerCase();
	return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, normalized) ? normalized : 'medium';
}

function compareByOrder(a, b) {
	const aHasOrder = Number.isInteger(a?.sort_order);
	const bHasOrder = Number.isInteger(b?.sort_order);

	if (aHasOrder && bHasOrder && a.sort_order !== b.sort_order) {
		return a.sort_order - b.sort_order;
	}

	if (aHasOrder && !bHasOrder) return -1;
	if (!aHasOrder && bHasOrder) return 1;

	const aDate = new Date(a?.created_at ?? 0).getTime();
	const bDate = new Date(b?.created_at ?? 0).getTime();
	return aDate - bDate;
}

function sortByOrder(items) {
	return [...items].sort(compareByOrder);
}

function getPriorityLabel(value) {
 return PRIORITY_LABELS[resolvePriorityKey(value)] ?? 'Medium priority';
}

let structuredTodos = $derived.by(() => {
	if (!todos.length) return [];

	const nodeMap = new SvelteMap();
	todos.forEach((raw) => {
		nodeMap.set(raw.id, {
			...raw,
			overdue: isTodoOverdue(raw),
			due_date_label: raw.due_date ? formatDueDate(raw.due_date) : '',
			subtasks: [],
			completedSubtasks: 0,
			totalSubtasks: 0,
			progressPercent: 0
		});
	});

	const roots = [];
	nodeMap.forEach((todo) => {
		if (!todo.parent_todo_id) {
			roots.push(todo);
			return;
		}

		const parent = nodeMap.get(todo.parent_todo_id);
		if (parent && !parent.parent_todo_id) {
			parent.subtasks.push(todo);
			return;
		}

		roots.push({
			...todo,
			parent_todo_id: null
		});
	});

	const normalizedRoots = roots.map((root) => {
		const subtasks = sortByOrder(root.subtasks).map((subtask) => ({
			...subtask,
			subtasks: [],
			completedSubtasks: 0,
			totalSubtasks: 0,
			progressPercent: subtask.completed ? 100 : 0,
			overdue: isTodoOverdue(subtask),
			due_date_label: subtask.due_date ? formatDueDate(subtask.due_date) : ''
		}));

		const completedSubtasks = subtasks.filter((sub) => sub.completed).length;
		const totalSubtasks = subtasks.length;

		return {
			...root,
			parent_todo_id: null,
			subtasks,
			completedSubtasks,
			totalSubtasks,
			progressPercent: totalSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
		};
	});

	return sortByOrder(normalizedRoots);
});

let sortedRootTodos = $derived.by(() => {
	const roots = structuredTodos;
	if (!roots.length) return [];

	if (sortMode === 'manual') {
		return roots;
	}

	const manualIndex = new Map(roots.map((todo, index) => [todo.id, index]));
	const byManualOrder = (a, b) => {
		return (manualIndex.get(a.id) ?? 0) - (manualIndex.get(b.id) ?? 0);
	};

	const list = [...roots];

	switch (sortMode) {
		case 'priority':
			return list.sort((a, b) => {
				const priorityDelta =
					(PRIORITY_ORDER[resolvePriorityKey(a.priority)] ?? 1) -
					(PRIORITY_ORDER[resolvePriorityKey(b.priority)] ?? 1);
				if (priorityDelta !== 0) return priorityDelta;
				return byManualOrder(a, b);
			});
		case 'dueDate':
			return list.sort((a, b) => {
				const aDue = a.due_date ? new Date(a.due_date).getTime() : null;
				const bDue = b.due_date ? new Date(b.due_date).getTime() : null;

				const aValid = Number.isFinite(aDue);
				const bValid = Number.isFinite(bDue);

				if (!aValid && !bValid) return byManualOrder(a, b);
				if (!aValid) return 1;
				if (!bValid) return -1;
				if (aDue !== bDue) return aDue - bDue;
				return byManualOrder(a, b);
			});
		case 'created':
			return list.sort((a, b) => {
				const aTime = new Date(a.created_at ?? 0).getTime();
				const bTime = new Date(b.created_at ?? 0).getTime();

				if (aTime !== bTime) return bTime - aTime; // newest first
				return byManualOrder(a, b);
			});
		case 'alphabetical':
			return list.sort((a, b) => {
				const textA = (a.text ?? '').toLocaleLowerCase();
				const textB = (b.text ?? '').toLocaleLowerCase();
				if (textA !== textB) return textA.localeCompare(textB);
				return byManualOrder(a, b);
			});
		case 'assigned':
			return list.sort((a, b) => {
				const aAssigned = a.assigned_to !== null && a.assigned_to !== undefined;
				const bAssigned = b.assigned_to !== null && b.assigned_to !== undefined;

				if (aAssigned !== bAssigned) {
					return aAssigned ? -1 : 1;
				}

				if (!aAssigned && !bAssigned) {
					return byManualOrder(a, b);
				}

				const nameA = (a.assigned_to_username ?? '').toLocaleLowerCase();
				const nameB = (b.assigned_to_username ?? '').toLocaleLowerCase();
				if (nameA !== nameB) return nameA.localeCompare(nameB);
				return byManualOrder(a, b);
			});
		default:
			return roots;
	}
});

let filteredRootTodos = $derived.by(() => {
	const roots = sortedRootTodos;
	let filtered = roots;
	if (filter === 'active') {
		filtered = roots.filter((todo) => !todo.completed || todo.subtasks.some((sub) => !sub.completed));
	} else if (filter === 'completed') {
		filtered = roots.filter((todo) => {
			const subtasksComplete = !todo.subtasks.length || todo.subtasks.every((sub) => sub.completed);
			return todo.completed && subtasksComplete;
		});
	}

	return filtered;
});

let remainingCount = $derived(todos.filter((t) => !t.completed).length);

	let calendarLabel = $derived.by(() =>
		calendarReference.toLocaleString(undefined, { month: 'long', year: 'numeric' })
	);

	let calendarWeeks = $derived.by(() => {
		const reference = calendarReference;
		const activeTime = currentTime;
		const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
		const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
		const dueMap = new SvelteMap();

		todos.forEach((todo) => {
			const key = getLocalDateKey(todo.due_date);
			if (!key) return;
			if (!dueMap.has(key)) {
				dueMap.set(key, []);
			}
			dueMap.get(key).push(todo);
		});

		dueMap.forEach((list) => {
		list.sort((a, b) => {
			const priorityDelta = (PRIORITY_ORDER[resolvePriorityKey(a.priority)] ?? 1) - (PRIORITY_ORDER[resolvePriorityKey(b.priority)] ?? 1);
			if (priorityDelta !== 0) return priorityDelta;
			const dateA = new Date(a.due_date ?? a.created_at ?? 0).getTime();
			const dateB = new Date(b.due_date ?? b.created_at ?? 0).getTime();
			return dateA - dateB;
		});
	});

		const weeks = [];
		let currentWeek = [];

		for (let i = 0; i < start.getDay(); i += 1) {
			currentWeek.push(null);
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const date = new Date(reference.getFullYear(), reference.getMonth(), day);
			const key = getLocalDateKey(date);
			const todosForDay = dueMap.get(key) ?? [];
			currentWeek.push({
				date,
				key,
				isToday: isSameCalendarDay(date, activeTime),
				todos: todosForDay,
				hasOverdue: todosForDay.some((todo) => isTodoOverdue(todo, activeTime))
			});

			if (currentWeek.length === 7) {
				weeks.push(currentWeek);
				currentWeek = [];
			}
		}

		if (currentWeek.length > 0) {
			while (currentWeek.length < 7) {
				currentWeek.push(null);
			}
			weeks.push(currentWeek);
		}

		return weeks;
	});

	function getLocalDateKey(value) {
		if (!value) return null;
		const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${date.getFullYear()}-${month}-${day}`;
	}

	function formatDueDate(value) {
		const date = value ? new Date(value) : null;
		if (!date || Number.isNaN(date.getTime())) return '';
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function isSameCalendarDay(dateA, dateB) {
		if (!dateA || !dateB) return false;
		return (
			dateA.getFullYear() === dateB.getFullYear() &&
			dateA.getMonth() === dateB.getMonth() &&
			dateA.getDate() === dateB.getDate()
		);
	}

function isTodoOverdue(todo, reference = currentTime) {
	if (!todo?.due_date || todo.completed) return false;
	const dueDate = new Date(todo.due_date);
	if (Number.isNaN(dueDate.getTime())) return false;
	return dueDate.getTime() < reference.getTime();
}

function isExpanded(id) {
	return expandedTodos.has(id);
}

function toggleExpanded(id) {
	const next = new SvelteSet(expandedTodos);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	expandedTodos = next;
}

function maintainExpandedState(list) {
	const rootIds = new Set();
	const parentsWithChildren = new Set();

	list.forEach((todo) => {
		if (!todo.parent_todo_id) {
			rootIds.add(todo.id);
		}
		if (todo.parent_todo_id) {
			parentsWithChildren.add(todo.parent_todo_id);
		}
	});

	const next = new SvelteSet();
	expandedTodos.forEach((id) => {
		if (rootIds.has(id)) {
			next.add(id);
		}
	});
	parentsWithChildren.forEach((id) => {
		if (rootIds.has(id)) {
			next.add(id);
		}
	});
	expandedTodos = next;
}

async function addSubtask(parentId, text, priority) {
	if (!currentList) return false;
	const trimmed = text.trim();
	if (!trimmed) return false;
	const parentTodo = todos.find((todo) => todo.id === parentId);
	if (!parentTodo || parentTodo.parent_todo_id) {
		return false;
	}
	const response = await fetch('/api/todos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			listId: currentList.id,
			text: trimmed,
			isRecurring: false,
			recurrencePattern: null,
			dueDate: null,
			reminderMinutesBefore: null,
			priority: priority ?? 'medium',
			parentId
		})
	});

	if (response.ok) {
		await fetchTodos();
		expandedTodos = new SvelteSet(expandedTodos).add(parentId);
		return true;
	}
	return false;
}

// Drag and drop state
let draggedTodo = $state(null);
let dragOverTodo = $state(null);
let dragOverTopZone = $state(false);

function handleDragStart(todo) {
	if (sortMode !== 'manual') {
		return;
	}
	draggedTodo = todo;
	dragOverTopZone = false;
}

function handleDragOver(event, todo) {
	if (sortMode !== 'manual') {
		return;
	}
	event.preventDefault();
	if (draggedTodo && draggedTodo.id !== todo.id) {
		dragOverTodo = todo;
	}
}

function handleDragEnd() {
	draggedTodo = null;
	dragOverTodo = null;
	dragOverTopZone = false;
}

async function submitReorder(newOrder) {
	if (!currentList || !Array.isArray(newOrder) || newOrder.length === 0) {
		return;
	}

	const updates = newOrder.map((todo, index) => ({
		id: todo.id,
		sortOrder: index,
		parentId: todo.parent_todo_id ?? null
	}));

	const sortOrderMap = new Map(updates.map((update) => [update.id, update.sortOrder]));
	todos = todos.map((todo) =>
		sortOrderMap.has(todo.id) ? { ...todo, sort_order: sortOrderMap.get(todo.id) } : todo
	);

	try {
		const response = await fetch('/api/todos/reorder', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				listId: currentList.id,
				updates
			})
		});

		if (!response.ok) {
			await fetchTodos();
		}
	} catch (error) {
		console.error('Failed to reorder todos:', error);
		await fetchTodos();
	}
}

async function handleDrop(event, targetTodo) {
	if (sortMode !== 'manual') {
		return;
	}
	event.preventDefault();
	dragOverTopZone = false;

	if (!draggedTodo || !targetTodo || draggedTodo.id === targetTodo.id) {
		handleDragEnd();
		return;
	}

	// Can't drag parent into its own subtask
	if (draggedTodo.parent_todo_id === null && targetTodo.parent_todo_id === draggedTodo.id) {
		handleDragEnd();
		return;
	}

	// Can't mix levels (parent vs subtask)
	if ((draggedTodo.parent_todo_id === null) !== (targetTodo.parent_todo_id === null)) {
		handleDragEnd();
		return;
	}

	const parentId = draggedTodo.parent_todo_id ?? null;
	const siblings = sortByOrder(
		todos.filter((todo) => (todo.parent_todo_id ?? null) === parentId)
	);

	const draggedIndex = siblings.findIndex((todo) => todo.id === draggedTodo.id);
	const targetIndex = siblings.findIndex((todo) => todo.id === targetTodo.id);

	if (draggedIndex === -1 || targetIndex === -1) {
		handleDragEnd();
		return;
	}

	if (draggedIndex === targetIndex) {
		handleDragEnd();
		return;
	}

	// Reorder locally
	const newOrder = [...siblings];
	const [removed] = newOrder.splice(draggedIndex, 1);
	newOrder.splice(targetIndex, 0, removed);

	await submitReorder(newOrder);
	handleDragEnd();
}

function handleTopZoneDragOver(event) {
	if (sortMode !== 'manual') {
		return;
	}
	if (!draggedTodo || draggedTodo.parent_todo_id !== null) {
		return;
	}
	event.preventDefault();
	dragOverTopZone = true;
}

function handleTopZoneDragLeave() {
	dragOverTopZone = false;
}

async function handleDropAtTop(event) {
	if (sortMode !== 'manual') {
		return;
	}
	if (!draggedTodo || draggedTodo.parent_todo_id !== null) {
		handleDragEnd();
		return;
	}
	event.preventDefault();
	dragOverTopZone = false;

	const parentId = null;
	const siblings = sortByOrder(
		todos.filter((todo) => (todo.parent_todo_id ?? null) === parentId)
	);

	const draggedIndex = siblings.findIndex((todo) => todo.id === draggedTodo.id);
	if (draggedIndex === -1) {
		handleDragEnd();
		return;
	}

	if (draggedIndex === 0) {
		handleDragEnd();
		return;
	}

	const newOrder = [...siblings];
	const [removed] = newOrder.splice(draggedIndex, 1);
	newOrder.unshift(removed);

	await submitReorder(newOrder);
	handleDragEnd();
}

$effect(() => {
	if (sortMode !== 'manual') {
		handleDragEnd();
	}
});

	let cleanupTodoCreated;
	let cleanupTodoUpdated;
	let cleanupTodoDeleted;
	let cleanupUserJoined;
	let cleanupUserLeft;
	let cleanupUserEditing;
	let cleanupUserStoppedEditing;
	let cleanupUserTyping;
	let cleanupUserStoppedTyping;

	onMount(async () => {
		await fetchLists();
		await fetchInvitations();

		if (browser) {
			// Apply theme and density immediately on mount
			applyTheme(currentTheme);
			applyViewDensity(currentViewDensity);

			currentTime = new Date();
			startClock();
			startReminderChecks();

			// Initialize WebSocket connection
			const socket = initializeWebSocket();
			console.log('[WebSocket Client] Initialized, socket:', socket);

			// Set up real-time event listeners
			cleanupTodoCreated = onTodoCreated((todo) => {
				console.log('[WebSocket Client] Todo created:', todo);
				fetchTodos();
			});

			cleanupTodoUpdated = onTodoUpdated((todo) => {
				console.log('[WebSocket Client] Todo updated:', todo);
				fetchTodos();
			});

			cleanupTodoDeleted = onTodoDeleted((data) => {
				console.log('[WebSocket Client] Todo deleted:', data);
				fetchTodos();
			});

			// Set up presence tracking listeners
			cleanupUserJoined = onUserJoined((data) => {
				console.log('[Presence] User joined:', data);
				activeUsers.set(data.socketId, { userId: data.userId, username: data.username });
				activeUsers = new SvelteMap(activeUsers);
			});

			cleanupUserLeft = onUserLeft((data) => {
				console.log('[Presence] User left:', data);
				// Remove user from active users (we don't have socketId here, so find by userId)
				const entries = Array.from(activeUsers.entries());
				const match = entries.find(([_, user]) => user.userId === data.userId);
				if (match) {
					activeUsers.delete(match[0]);
					activeUsers = new SvelteMap(activeUsers);
				}
				// Clean up any editing/typing state for this user
				todoEditingState.forEach((editor, todoId) => {
					if (editor.userId === data.userId) {
						todoEditingState.delete(todoId);
					}
				});
				todoEditingState = new SvelteMap(todoEditingState);
			});

			cleanupUserEditing = onUserEditing((data) => {
				console.log('[Presence] User editing:', data);
				todoEditingState.set(data.todoId, {
					userId: data.userId,
					username: data.username,
					socketId: data.socketId
				});
				todoEditingState = new SvelteMap(todoEditingState);
			});

			cleanupUserStoppedEditing = onUserStoppedEditing((data) => {
				console.log('[Presence] User stopped editing:', data);
				todoEditingState.delete(data.todoId);
				todoEditingState = new SvelteMap(todoEditingState);
			});

			cleanupUserTyping = onUserTyping((data) => {
				console.log('[Presence] User typing:', data);
				const key = `${data.todoId}:${data.field}`;
				todoTypingState.set(key, {
					userId: data.userId,
					username: data.username,
					socketId: data.socketId
				});
				todoTypingState = new SvelteMap(todoTypingState);

				// Auto-clear typing indicator after 3 seconds of inactivity
				setTimeout(() => {
					if (todoTypingState.get(key)?.socketId === data.socketId) {
						todoTypingState.delete(key);
						todoTypingState = new SvelteMap(todoTypingState);
					}
				}, 3000);
			});

			cleanupUserStoppedTyping = onUserStoppedTyping((data) => {
				console.log('[Presence] User stopped typing:', data);
				const key = `${data.todoId}:${data.field}`;
				todoTypingState.delete(key);
				todoTypingState = new SvelteMap(todoTypingState);
			});
		}
	});

	// Apply dark mode class to body
	$effect(() => {
		if (browser) {
			if (darkMode) {
				document.body.classList.add('dark-mode');
			} else {
				document.body.classList.remove('dark-mode');
			}
		}
	});

	// Apply theme colors when theme changes
	$effect(() => {
		if (browser) {
			applyTheme(currentTheme);
		}
	});

	// Apply view density when it changes
	$effect(() => {
		if (browser) {
			applyViewDensity(currentViewDensity);
		}
	});

	// Join/leave list rooms when currentList changes
	$effect(() => {
		if (browser && currentList && data.user) {
			joinList(currentList.id, data.user.id, data.user.username);
		}
	});

	async function toggleDarkMode() {
		const newDarkMode = !darkMode;

		// Optimistically update UI
		darkMode = newDarkMode;

		// Save to server
		try {
			await fetch('/api/user/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ darkMode: newDarkMode })
			});
		} catch (error) {
			console.error('Failed to save dark mode preference:', error);
			// Revert on error
			darkMode = !newDarkMode;
		}
	}

	async function changeTheme(themeName) {
		const oldTheme = currentTheme;

		// Optimistically update UI
		currentTheme = themeName;

		// Explicitly apply theme immediately
		if (browser) {
			applyTheme(themeName);
			console.log('Applied theme:', themeName);
		}

		// Save to server
		try {
			await fetch('/api/user/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ theme: themeName })
			});
		} catch (error) {
			console.error('Failed to save theme preference:', error);
			// Revert on error
			currentTheme = oldTheme;
			if (browser) {
				applyTheme(oldTheme);
			}
		}
	}

	async function changeViewDensity(densityName) {
		const oldDensity = currentViewDensity;

		// Optimistically update UI
		currentViewDensity = densityName;

		// Save to server
		try {
			await fetch('/api/user/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ viewDensity: densityName })
			});
		} catch (error) {
			console.error('Failed to save view density preference:', error);
			// Revert on error
			currentViewDensity = oldDensity;
		}
	}

	onDestroy(() => {
		if (clockTimer) {
			clearInterval(clockTimer);
			clockTimer = undefined;
		}
		stopReminderChecks();

		// Clean up WebSocket event listeners
		if (cleanupTodoCreated) cleanupTodoCreated();
		if (cleanupTodoUpdated) cleanupTodoUpdated();
		if (cleanupTodoDeleted) cleanupTodoDeleted();
		if (cleanupUserJoined) cleanupUserJoined();
		if (cleanupUserLeft) cleanupUserLeft();
		if (cleanupUserEditing) cleanupUserEditing();
		if (cleanupUserStoppedEditing) cleanupUserStoppedEditing();
		if (cleanupUserTyping) cleanupUserTyping();
		if (cleanupUserStoppedTyping) cleanupUserStoppedTyping();

		// Disconnect WebSocket on component destroy
		if (browser) {
			disconnectWebSocket();
		}
	});

async function fetchLists() {
	const response = await fetch('/api/lists');
	const fetchedLists = await response.json();

	// Sort lists: personal list first, then others
	lists = fetchedLists.sort((a, b) => {
		const aIsPersonal = a.name === 'My Tasks' && a.member_count === 1;
		const bIsPersonal = b.name === 'My Tasks' && b.member_count === 1;

		if (aIsPersonal && !bIsPersonal) return -1;
		if (!aIsPersonal && bIsPersonal) return 1;
		return 0;
	});

	if (!lists.length) {
		currentList = null;
		currentListMembers = [];
		todos = [];
		return;
	}

	let selected = currentList ? lists.find((list) => list.id === currentList.id) : null;
	if (!selected) {
		selected = lists[0];
	}

	if (!currentList || currentList.id !== selected.id) {
		await selectList(selected);
	} else {
		currentList = selected;
		await fetchListMembers(selected.id);
		await fetchTodos();
	}
}

async function fetchInvitations() {
	const response = await fetch('/api/invitations');
	invitations = await response.json();
}

async function fetchListMembers(listId) {
	if (!listId) {
		currentListMembers = [];
		return;
	}

	try {
		const response = await fetch(`/api/lists/members?listId=${listId}`);
		if (response.ok) {
			const members = await response.json();
			currentListMembers = members;
		} else {
			currentListMembers = [];
		}
	} catch (error) {
		console.error('Failed to fetch list members', error);
		currentListMembers = [];
	}
}

async function fetchTodos() {
	if (!currentList) return;

	const response = await fetch(`/api/todos?listId=${currentList.id}`);
	if (response.ok) {
		const fetched = await response.json();
		todos = fetched;
		maintainExpandedState(fetched);
			if (browser) {
				checkDueReminders();
			}
		}
	}

async function selectList(list) {
	if (!list) return;
	const isDifferentList = currentList?.id !== list.id;
	currentList = list;
	if (isDifferentList) {
		expandedTodos = new Set();
		newTodoAssignee = '';
	}
	currentListMembers = [];
	await fetchListMembers(list.id);
	await fetchTodos();
}

	async function createNewList() {
		if (newListName.trim()) {
			const response = await fetch('/api/lists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newListName.trim(), isShared: false })
			});

			if (response.ok) {
				await fetchLists();
				newListName = '';
				showNewListModal = false;
			}
		}
	}

	async function inviteUser() {
		if (inviteUsername.trim()) {
			const response = await fetch('/api/invitations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create',
					listId: currentList.id,
					username: inviteUsername.trim(),
					permissionLevel: invitePermission
				})
			});

			if (response.ok) {
				inviteUsername = '';
				invitePermission = 'editor';
				showInviteModal = false;
				alert('Invitation sent successfully!');
			} else {
				const error = await response.json();
				alert(error.error || 'Failed to send invitation');
			}
		}
	}

	async function acceptInvitation(invitationId) {
		const response = await fetch('/api/invitations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'accept', invitationId })
		});

		if (response.ok) {
			await fetchLists();
			await fetchInvitations();
			showInvitationsModal = false;
		}
	}

	async function rejectInvitation(invitationId) {
		const response = await fetch('/api/invitations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'reject', invitationId })
		});

		if (response.ok) {
			await fetchInvitations();
		}
	}

	async function addTodo() {
		if (newTodoText.trim() && currentList) {
			const isRecurringTask = newTodoMode === 'recurring';
			const recurrenceValue = isRecurringTask ? recurrencePattern : null;
			const dueDateValue = newTodoMode === 'deadline' ? (newTodoDueDate || null) : null;
			const reminderValue =
				newTodoMode === 'deadline' && newTodoReminder
					? Number(newTodoReminder)
					: null;
			const priorityValue = resolvePriorityKey(newTodoPriority);

		const response = await fetch('/api/todos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				listId: currentList.id,
				text: newTodoText.trim(),
				isRecurring: isRecurringTask,
				recurrencePattern: recurrenceValue,
				dueDate: dueDateValue,
				reminderMinutesBefore: reminderValue,
				priority: priorityValue,
				assignedTo: newTodoAssignee ? Number(newTodoAssignee) : null
			})
		});

		if (response.ok) {
			await fetchTodos();
			newTodoText = '';
			newTodoMode = 'single';
			recurrencePattern = 'daily';
			newTodoDueDate = '';
			newTodoReminder = '';
			newTodoPriority = 'medium';
			newTodoAssignee = '';
		}
	}
}

	async function toggleTodo(id, currentCompleted) {
		const response = await fetch('/api/todos', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				id,
				completed: !currentCompleted
			})
		});

		if (response.ok) {
			await fetchTodos();
		} else {
			const error = await response.json();

			// Revert the UI state by refetching
			await fetchTodos();

			if (error.error === 'Cannot complete parent task with incomplete subtasks') {
				alert('Cannot complete this task until all subtasks are completed.');
			} else {
				alert('Failed to update task: ' + (error.error || 'Unknown error'));
			}
		}
	}

	async function updateTodoText(id, text) {
		const response = await fetch('/api/todos', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, text })
		});

		if (response.ok) {
			await fetchTodos();
		} else {
			alert('Failed to update task text');
			await fetchTodos();
		}
	}

	async function updateTodoPriority(id, priority) {
		const response = await fetch('/api/todos', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, priority })
		});

		if (response.ok) {
			await fetchTodos();
		} else {
			alert('Failed to update priority');
			await fetchTodos();
		}
	}

	async function updateTodoDueDate(id, dueDate) {
		const response = await fetch('/api/todos', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, due_date: dueDate })
		});

		if (response.ok) {
			await fetchTodos();
		} else {
			alert('Failed to update due date');
			await fetchTodos();
		}
	}

async function updateTodoNotes(id, notes) {
	const response = await fetch('/api/todos', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, notes })
	});

	if (response.ok) {
		await fetchTodos();
	} else {
		alert('Failed to update notes');
		await fetchTodos();
	}
}

	async function updateTodoAssignee(id, assigneeId) {
		const payload = {
			id,
			assigned_to: assigneeId ?? null
		};

		const response = await fetch('/api/todos', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (response.ok) {
			await fetchTodos();
			return true;
		}

		try {
			const error = await response.json();
			alert(error?.error ?? 'Failed to update assignment');
		} catch (error) {
			console.error('Failed to update assignment', error);
			alert('Failed to update assignment');
		}

		await fetchTodos();
		return false;
	}

	async function uploadAttachment(todoId, file) {
		if (!file) return false;

		const formData = new FormData();
		formData.append('todoId', todoId);
		formData.append('file', file);

		const response = await fetch('/api/todos/attachments', {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			await fetchTodos();
			return true;
		}

		try {
			const error = await response.json();
			alert(error?.error ?? 'Failed to upload attachment');
		} catch (error) {
			console.error('Failed to upload attachment', error);
			alert('Failed to upload attachment');
		}

		await fetchTodos();
		return false;
	}

	async function removeAttachment(attachmentId) {
		const response = await fetch(`/api/todos/attachments/${attachmentId}`, {
			method: 'DELETE'
		});

		if (response.ok) {
			await fetchTodos();
			return true;
		}

		try {
			const error = await response.json();
			alert(error?.error ?? 'Failed to delete attachment');
		} catch (error) {
			console.error('Failed to delete attachment', error);
			alert('Failed to delete attachment');
		}

		await fetchTodos();
		return false;
	}

async function deleteTodo(id) {
	const response = await fetch('/api/todos', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id })
	});

	if (response.ok) {
		await fetchTodos();
		// Also refresh deleted todos if modal is open
		if (showRecentlyDeletedModal && currentList) {
			await fetchDeletedTodos();
		}
	}
}

async function fetchDeletedTodos() {
	if (!currentList) return;

	const response = await fetch(`/api/deleted-todos?listId=${currentList.id}`);
	if (response.ok) {
		deletedTodos = await response.json();
	}
}

async function restoreTodo(id) {
	const response = await fetch('/api/deleted-todos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'restore', id })
	});

	if (response.ok) {
		await fetchTodos();
		await fetchDeletedTodos();
	} else {
		alert('Failed to restore todo');
	}
}

async function permanentlyDeleteTodo(id) {
	if (!confirm('Are you sure you want to permanently delete this item? This action cannot be undone.')) {
		return;
	}

	const response = await fetch('/api/deleted-todos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'permanent-delete', id })
	});

	if (response.ok) {
		await fetchDeletedTodos();
	} else {
		alert('Failed to permanently delete todo');
	}
}

async function openRecentlyDeleted() {
	showRecentlyDeletedModal = true;
	await fetchDeletedTodos();
}

async function deleteAllDeletedTodos() {
	if (!currentList) return;

	if (!confirm('Are you sure you want to permanently delete ALL items? This action cannot be undone.')) {
		return;
	}

	const response = await fetch('/api/deleted-todos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'delete-all', listId: currentList.id })
	});

	if (response.ok) {
		await fetchDeletedTodos();
	} else {
		alert('Failed to delete all items');
	}
}

setContext('todo-actions', {
	toggleTodoComplete: (id, completed) => toggleTodo(id, completed),
	deleteTodo,
	toggleExpanded,
	isExpanded,
	addSubtask,
	priorityLabel: getPriorityLabel,
	priorityClass: (value) => `priority-${resolvePriorityKey(value)}`,
	updateTodoText,
	updateTodoPriority,
	updateTodoDueDate,
	updateTodoNotes,
	updateTodoAssignee,
	uploadAttachment,
	removeAttachment,
	getListMembers: () => currentListMembers,
	getEditingUser: (todoId) => todoEditingState.get(todoId),
	getTypingUser: (todoId, field) => todoTypingState.get(`${todoId}:${field}`),
	currentListId: () => currentList?.id
});

	function goToPreviousMonth() {
		const reference = calendarReference;
		calendarReference = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
	}

	function goToNextMonth() {
		const reference = calendarReference;
		calendarReference = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
	}

	function handleOverlayKey(event, close) {
		if (!event) return;
		const actionableKeys = ['Escape', 'Enter', ' '];
		if (actionableKeys.includes(event.key)) {
			event.preventDefault();
			close();
		}
	}

	function startClock() {
		if (clockTimer) {
			clearInterval(clockTimer);
		}
		clockTimer = setInterval(() => {
			currentTime = new Date();
		}, 60_000);
	}

	function startReminderChecks() {
		if (!browser || typeof Notification === 'undefined') {
			return;
		}
		stopReminderChecks();
		notificationTimer = setInterval(checkDueReminders, 30_000);
		checkDueReminders();
	}

	function stopReminderChecks() {
		if (notificationTimer) {
			clearInterval(notificationTimer);
			notificationTimer = undefined;
		}
	}

	async function requestNotificationPermission() {
		if (!browser || typeof Notification === 'undefined') {
			return;
		}
		if (notificationPermissionRequested || Notification.permission !== 'default') {
			return;
		}
		notificationPermissionRequested = true;
		try {
			await Notification.requestPermission();
		} catch (error) {
			console.warn('Notification permission request failed', error);
		}
	}

	function getReminderTime(todo) {
		if (!todo?.due_date || todo.reminder_minutes_before == null) return null;
		const due = new Date(todo.due_date);
		if (Number.isNaN(due.getTime())) return null;
		return new Date(due.getTime() - Number(todo.reminder_minutes_before) * 60_000);
	}

	function showReminderNotification(todo) {
		if (!browser || typeof Notification === 'undefined') {
			return;
		}
		if (Notification.permission !== 'granted') {
			return;
		}
		const title = 'Todo Reminder';
		const bodyParts = [];
		if (todo.text) {
			bodyParts.push(todo.text);
		}
		if (todo.due_date) {
			bodyParts.push(`Due ${formatDueDate(todo.due_date)}`);
		}
		try {
			new Notification(title, {
				body: bodyParts.join(' • '),
				tag: `todo-${todo.id}`
			});
		} catch (error) {
			console.warn('Failed to show reminder notification', error);
		}
	}

	function checkDueReminders() {
		if (!browser) {
			return;
		}
		const now = new Date();
		currentTime = now;

		if (typeof Notification === 'undefined') {
			return;
		}

		const hasReminder = todos.some((todo) => todo.reminder_minutes_before != null && todo.due_date);
		if (!hasReminder) {
			return;
		}

		if (Notification.permission === 'default') {
			requestNotificationPermission();
			return;
		}

		if (Notification.permission !== 'granted') {
			return;
		}

		const validKeys = new SvelteSet();

		todos.forEach((todo) => {
			const reminderTime = getReminderTime(todo);
			if (!reminderTime) return;
			const key = `${todo.id}-${reminderTime.toISOString()}`;
			validKeys.add(key);
			if (todo.completed) {
				notifiedReminders.delete(key);
				return;
			}
			if (reminderTime.getTime() <= now.getTime() && !notifiedReminders.has(key)) {
				showReminderNotification(todo);
				notifiedReminders.add(key);
			}
		});

	notifiedReminders.forEach((value) => {
		if (!validKeys.has(value)) {
			notifiedReminders.delete(value);
		}
	});
}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			addTodo();
		}
	}

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}
</script>

<svelte:head>
	<title>Tido</title>
</svelte:head>

<div class="app-container">
	<!-- Sidebar for lists -->
	<div class="sidebar">
		<div class="sidebar-header">
			<h2>My Lists</h2>
			<button class="icon-btn" onclick={() => showNewListModal = true} title="Create new list">+</button>
		</div>

		<button class="settings-btn" onclick={() => showSettingsModal = true} title="Settings">
			⚙️ Settings
		</button>

		<div class="lists">
			{#each lists as list (list.id)}
				<button
					class="list-item"
					class:active={currentList?.id === list.id}
					onclick={() => selectList(list)}
				>
					<span class="list-name">
						{list.name}
						{#if list.name === 'My Tasks' && list.member_count === 1}
							<span class="personal-label">(Personal)</span>
						{/if}
					</span>
					{#if list.member_count > 1}
						<span class="member-count" title="{list.member_count} members">{list.member_count}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if invitations.length > 0}
			<button class="invitations-btn" onclick={() => showInvitationsModal = true}>
				Invitations ({invitations.length})
			</button>
		{/if}
	</div>

	<!-- Main content -->
	<div class="main-content">
		<div class="header">
			<div class="user-info">
				<span class="welcome">Welcome, <strong>{data.user.username}</strong>!</span>
				{#if data.user.is_admin}
					<a href="/admin" class="admin-link">Admin Dashboard</a>
				{/if}
				<div class="connection-status" class:connected={$connectionState === 'connected'} class:disconnected={$connectionState === 'disconnected'} class:error={$connectionState === 'error'} title="Connection status: {$connectionState}">
					<span class="status-dot"></span>
					<span class="status-text">{$connectionState === 'connected' ? 'Connected' : $connectionState === 'disconnected' ? 'Disconnected' : 'Error'}</span>
				</div>
			</div>
			<div class="header-actions">
				<button class="theme-toggle" onclick={toggleDarkMode} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
					{darkMode ? '☀️' : '🌙'}
				</button>
				<button class="logout-btn" onclick={handleLogout}>Logout</button>
			</div>
		</div>

		{#if currentList}
			<div class="list-header">
				<h1>{currentList.name}</h1>
				<div class="list-actions">
					<button class="calendar-btn" onclick={() => showCalendarModal = true}>
						Calendar View
					</button>
					<button class="recently-deleted-btn" onclick={openRecentlyDeleted}>
						Recently Deleted
					</button>
					{#if currentList.permission_level === 'admin' && !(currentList.name === 'My Tasks' && currentList.member_count === 1)}
						<button class="invite-btn" onclick={() => showInviteModal = true}>
							Invite Users
						</button>
					{/if}
				</div>
			</div>
		{:else}
			<h1>No lists available</h1>
			<p>Create a new list to get started!</p>
		{/if}

	<div class="input-section">
		<input
			type="text"
			bind:value={newTodoText}
			onkeypress={handleKeyPress}
			placeholder="What needs to be done?"
		/>
		<button onclick={addTodo}>Add</button>
	</div>

	<div class="task-options-row">
		<label class="task-type-label">
			<span>Task type</span>
			<select bind:value={newTodoMode}>
				<option value="single">Single Task</option>
				<option value="recurring">Recurring Task</option>
				<option value="deadline">Deadline</option>
			</select>
		</label>

		<label class="priority-label">
			<span>Priority</span>
			<select bind:value={newTodoPriority}>
				<option value="high">High</option>
				<option value="medium">Medium</option>
				<option value="low">Low</option>
			</select>
		</label>

		{#if currentList}
			<label class="assignee-label">
				<span>Assign to</span>
				<select bind:value={newTodoAssignee}>
					<option value="">Unassigned</option>
					{#each currentListMembers as member (member.id)}
						<option value={String(member.id)}>{member.username}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	{#if newTodoMode === 'recurring'}
		<div class="recurring-options">
			<label class="recurrence-select-label">
				<span>Repeats</span>
				<select bind:value={recurrencePattern} class="recurrence-select">
					<option value="daily">Daily</option>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
					<option value="yearly">Yearly</option>
				</select>
			</label>
		</div>
	{/if}

	{#if newTodoMode === 'deadline'}
		<div class="due-date-options">
			<label class="due-date-field">
				<span>Due date</span>
				<input type="datetime-local" bind:value={newTodoDueDate} />
			</label>
			<label class="reminder-field">
				<span>Reminder</span>
				<select bind:value={newTodoReminder}>
					<option value="">No reminder</option>
					<option value="5">5 minutes before</option>
					<option value="15">15 minutes before</option>
					<option value="30">30 minutes before</option>
					<option value="60">1 hour before</option>
					<option value="1440">1 day before</option>
				</select>
			</label>
		</div>
	{/if}

	<div class="filters">
		<button
			class:active={filter === 'all'}
			onclick={() => filter = 'all'}
		>
			All
		</button>
		<button
			class:active={filter === 'active'}
			onclick={() => filter = 'active'}
		>
			Active
		</button>
		<button
			class:active={filter === 'completed'}
			onclick={() => filter = 'completed'}
		>
			Completed
		</button>
	</div>

	{#if currentList}
		<div class="sort-toolbar">
			<div class="sort-inline">
				<div class="sort-inline-main">
					<label for="sortModeSelect">Sort by</label>
					<select id="sortModeSelect" bind:value={sortMode}>
						<option value="manual">Custom order</option>
						<option value="priority">Priority (high → low)</option>
						<option value="dueDate">Due date (soonest first)</option>
						<option value="created">Recently added</option>
						<option value="alphabetical">Alphabetical</option>
						<option value="assigned">Assigned</option>
					</select>
				</div>
				{#if sortMode !== 'manual'}
					<span class="sort-inline-hint">Return to Custom to drag & drop.</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if currentList}
		{#if filteredRootTodos.length}
			<ul class="todo-list">
				{#if sortMode === 'manual' && draggedTodo && draggedTodo.parent_todo_id === null}
					<li
						class="drop-zone drop-zone-top"
						ondragover={handleTopZoneDragOver}
						ondragleave={handleTopZoneDragLeave}
						ondrop={handleDropAtTop}
						class:active={dragOverTopZone}
					>
						Drop here to move this task to the top
					</li>
				{/if}
				{#each filteredRootTodos as todo (todo.id)}
					<TodoItem
						{todo}
						level={0}
						currentUserId={data.user.id}
						onDragStart={sortMode === 'manual' ? handleDragStart : null}
						onDragOver={sortMode === 'manual' ? handleDragOver : null}
						onDrop={sortMode === 'manual' ? handleDrop : null}
						onDragEnd={sortMode === 'manual' ? handleDragEnd : null}
						isDragging={sortMode === 'manual' && draggedTodo?.id === todo.id}
						isDragOver={sortMode === 'manual' && dragOverTodo?.id === todo.id}
					/>
				{/each}
			</ul>
		{:else}
			<p class="empty">No todos to display</p>
		{/if}

		<div class="footer">
			<span>{remainingCount} {remainingCount === 1 ? 'item' : 'items'} left</span>
		</div>
	{/if}
	</div>
</div>

<!-- Modals -->
{#if showCalendarModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close calendar view"
		onclick={() => showCalendarModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showCalendarModal = false)}
	>
		<div
			class="modal calendar-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Calendar view"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<div class="calendar-header">
				<button class="calendar-nav" onclick={goToPreviousMonth} aria-label="Previous month">‹</button>
				<h2>{calendarLabel}</h2>
				<button class="calendar-nav" onclick={goToNextMonth} aria-label="Next month">›</button>
			</div>
			<div class="calendar-grid">
				<div class="calendar-weekdays">
					{#each weekdayLabels as label}
						<div class="calendar-weekday">{label}</div>
					{/each}
				</div>
				{#each calendarWeeks as week, weekIndex (weekIndex)}
					<div class="calendar-week">
						{#each week as day, dayIndex (weekIndex * 7 + dayIndex)}
							{#if day}
								<div
									class="calendar-day"
									class:today={day.isToday}
									class:has-todos={day.todos.length > 0}
									class:overdue-day={day.hasOverdue}
								>
									<div class="calendar-day-number">{day.date.getDate()}</div>
									<ul class="calendar-todo-list">
									{#each day.todos.slice(0, 3) as dayTodo (dayTodo.id)}
										<li
											class:completed={dayTodo.completed}
											class:overdue-item={isTodoOverdue(dayTodo)}
											class:priority-high={resolvePriorityKey(dayTodo.priority) === 'high'}
											class:priority-medium={resolvePriorityKey(dayTodo.priority) === 'medium'}
											class:priority-low={resolvePriorityKey(dayTodo.priority) === 'low'}
										>
											{dayTodo.text}
										</li>
										{/each}
										{#if day.todos.length > 3}
											<li class="more-todos">+{day.todos.length - 3} more</li>
										{/if}
									</ul>
								</div>
							{:else}
								<div class="calendar-day empty"></div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showCalendarModal = false}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showNewListModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close create list modal"
		onclick={() => showNewListModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showNewListModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="new-list-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="new-list-title">Create New List</h2>
			<input
				type="text"
				bind:value={newListName}
				placeholder="List name"
				onkeypress={(e) => e.key === 'Enter' && createNewList()}
			/>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showNewListModal = false}>Cancel</button>
				<button class="btn-primary" onclick={createNewList}>Create</button>
			</div>
		</div>
	</div>
{/if}

{#if showInviteModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close invite modal"
		onclick={() => showInviteModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showInviteModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="invite-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="invite-title">Invite User to {currentList?.name}</h2>
			<input
				type="text"
				bind:value={inviteUsername}
				placeholder="Username"
			/>
			<select bind:value={invitePermission}>
				<option value="editor">Editor</option>
				<option value="admin">Admin</option>
			</select>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showInviteModal = false}>Cancel</button>
				<button class="btn-primary" onclick={inviteUser}>Send Invitation</button>
			</div>
		</div>
	</div>
{/if}

{#if showInvitationsModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close invitations modal"
		onclick={() => showInvitationsModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showInvitationsModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="invitations-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="invitations-title">Pending Invitations</h2>
			<div class="invitations-list">
				{#each invitations as invitation (invitation.id)}
					<div class="invitation-item">
						<div class="invitation-info">
							<strong>{invitation.list_name}</strong>
							<span>from {invitation.inviter_username}</span>
							<span class="permission-badge">{invitation.permission_level}</span>
						</div>
						<div class="invitation-actions">
							<button class="btn-accept" onclick={() => acceptInvitation(invitation.id)}>Accept</button>
							<button class="btn-reject" onclick={() => rejectInvitation(invitation.id)}>Reject</button>
						</div>
					</div>
				{/each}
			</div>
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showInvitationsModal = false}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showRecentlyDeletedModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close recently deleted modal"
		onclick={() => showRecentlyDeletedModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showRecentlyDeletedModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="recently-deleted-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<div class="modal-header-section">
				<h2 id="recently-deleted-title">Recently Deleted</h2>
				{#if deletedTodos.length > 0}
					<button class="btn-delete-all" onclick={deleteAllDeletedTodos}>Delete All</button>
				{/if}
			</div>
			<p class="deleted-info">Deleted items are kept for 7 days before being permanently removed.</p>

			{#if deletedTodos.length > 0}
				<div class="deleted-todos-list">
					{#each deletedTodos as todo (todo.id)}
						<div class="deleted-todo-item">
							<div class="deleted-todo-info">
								<div class="deleted-todo-text">{todo.text}</div>
								<div class="deleted-todo-meta">
									Deleted {new Date(todo.deleted_at).toLocaleDateString()} at {new Date(todo.deleted_at).toLocaleTimeString()}
								</div>
							</div>
							<div class="deleted-todo-actions">
								<button class="btn-restore" onclick={() => restoreTodo(todo.id)}>Restore</button>
								<button class="btn-permanent-delete" onclick={() => permanentlyDeleteTodo(todo.id)}>Delete Forever</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty-deleted">No recently deleted items</p>
			{/if}

			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showRecentlyDeletedModal = false}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showSettingsModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close settings modal"
		onclick={() => showSettingsModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showSettingsModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="settings-title">Settings</h2>

			<div class="settings-section">
				<h3>Appearance</h3>

				<div class="setting-item">
					<label for="theme-select">
						<span class="setting-label">Color Theme</span>
						<span class="setting-description">Choose your preferred color scheme</span>
					</label>
					<select
						id="theme-select"
						class="setting-select"
						bind:value={currentTheme}
						onchange={() => changeTheme(currentTheme)}
					>
						{#each Object.entries(themes) as [key, theme]}
							<option value={key}>{theme.name}</option>
						{/each}
					</select>
				</div>

				<div class="setting-item">
					<label for="density-select">
						<span class="setting-label">View Density</span>
						<span class="setting-description">Adjust spacing and sizing of tasks</span>
					</label>
					<select
						id="density-select"
						class="setting-select"
						bind:value={currentViewDensity}
						onchange={() => changeViewDensity(currentViewDensity)}
					>
						{#each Object.entries(viewDensities) as [key, density]}
							<option value={key}>{density.name}</option>
						{/each}
					</select>
				</div>

				<div class="setting-item">
					<label for="dark-mode-toggle">
						<span class="setting-label">Dark Mode</span>
						<span class="setting-description">Use dark theme for reduced eye strain</span>
					</label>
					<button
						id="dark-mode-toggle"
						class="setting-toggle-btn"
						onclick={toggleDarkMode}
					>
						{darkMode ? 'On' : 'Off'}
					</button>
				</div>
			</div>

			<div class="modal-actions">
				<button class="btn-primary" onclick={() => showSettingsModal = false}>Done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		/* Fallback for when CSS variable isn't set yet (Aurora theme) */
		background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 33%, #06b6d4 66%, #10b981 100%);
		background-image: var(--color-background);
		background-attachment: fixed;
		min-height: 100vh;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
	}

	.app-container {
		display: flex;
		min-height: 100vh;
		gap: 0;
	}

	.sidebar {
		width: 280px;
		background: var(--color-card-bg, rgba(255, 255, 255, 0.95));
		backdrop-filter: blur(10px);
		padding: 1.5rem;
		box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.sidebar-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: var(--color-text, #2c3e50);
	}

	.icon-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-primary, #667eea);
		color: white;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.icon-btn:hover {
		background: var(--color-primary-hover, #5568d3);
	}

	.lists {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
		overflow-y: auto;
	}

	.list-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #f8f9fa;
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.list-item:hover {
		background: #e9ecef;
	}

	.list-item.active {
		background: white;
		border-color: var(--color-primary, #667eea);
	}

	.list-name {
		font-weight: 500;
		color: var(--color-text, #2c3e50);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.personal-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary, #666);
		font-weight: 400;
	}

	.member-count {
		background: var(--color-primary, #667eea);
		color: white;
		padding: 0.2rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.settings-btn {
		width: 100%;
		padding: 0.75rem;
		background: #f8f9fa;
		color: #2c3e50;
		border: 2px solid transparent;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.settings-btn:hover {
		background: #e9ecef;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	.invitations-btn {
		width: 100%;
		padding: 0.75rem;
		background: #ff6b6b;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.invitations-btn:hover {
		background: #ff5252;
	}

	.main-content {
		flex: 1;
		max-width: 800px;
		margin: 2rem auto;
		padding: 2rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		height: fit-content;
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.list-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.list-header h1 {
		margin: 0;
	}

	.calendar-btn,
	.recently-deleted-btn {
		padding: 0.5rem 1rem;
		background: #f0f0f0;
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
		transition: all 0.2s;
	}

	.calendar-btn:hover,
	.recently-deleted-btn:hover {
		background: #e0e0e0;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	.invite-btn {
		padding: 0.5rem 1rem;
		background: var(--color-primary, #667eea);
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.invite-btn:hover {
		background: var(--color-primary-hover, #5568d3);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e0e0e0;
	}

	.user-info {
		color: #666;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.user-info strong {
		color: #2c3e50;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		background-color: #f8f9fa;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: #999;
	}

	.connection-status.connected .status-dot {
		background-color: #28a745;
		animation: pulse 2s infinite;
	}

	.connection-status.disconnected .status-dot {
		background-color: #ffc107;
	}

	.connection-status.error .status-dot {
		background-color: #dc3545;
	}

	.status-text {
		color: #666;
	}

	.connection-status.connected .status-text {
		color: #28a745;
	}

	.connection-status.disconnected .status-text {
		color: #f0ad4e;
	}

	.connection-status.error .status-text {
		color: #dc3545;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.theme-toggle {
		padding: 0.5rem;
		background-color: #f0f0f0;
		border: 2px solid transparent;
		border-radius: 50%;
		font-size: 1.2rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
	}

	.theme-toggle:hover {
		background-color: #e0e0e0;
		border-color: #667eea;
		transform: scale(1.05);
	}

	.admin-link {
		padding: 0.4rem 0.8rem;
		background-color: var(--color-primary, #667eea);
		color: white;
		text-decoration: none;
		border-radius: 4px;
		font-size: 0.85rem;
		font-weight: 500;
		transition: background-color 0.2s;
	}

	.admin-link:hover {
		background-color: var(--color-primary-hover, #5568d3);
	}

	.logout-btn {
		padding: 0.5rem 1rem;
		background-color: #ff6b6b;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.logout-btn:hover {
		background-color: #ff5252;
	}

	h1 {
		text-align: center;
		color: var(--color-text, #2c3e50);
		margin-bottom: 2rem;
		font-size: 3rem;
		font-weight: 200;
	}

	.input-section {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.input-section input {
		flex: 1;
		padding: 0.75rem;
		font-size: 1rem;
		border: 2px solid var(--color-card-border, #e0e0e0);
		border-radius: 4px;
		outline: none;
		transition: border-color 0.2s;
	}

	.input-section input:focus {
		border-color: var(--color-accent, #4CAF50);
	}

	.input-section button {
		padding: 0.75rem 1.5rem;
		background-color: var(--color-accent, #4CAF50);
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.input-section button:hover {
		background-color: var(--color-accent-hover, #45a049);
	}

	.task-options-row {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background-color: #f8f9fa;
		border-radius: 4px;
		flex-wrap: wrap;
	}

	.recurring-options,
	.due-date-options {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background-color: #f8f9fa;
		border-radius: 4px;
		flex-wrap: wrap;
	}

	.task-type-label,
	.priority-label,
	.assignee-label,
	.recurrence-select-label,
	.due-date-field,
	.reminder-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 160px;
		font-size: 0.85rem;
		color: #555;
	}

	.task-type-label select,
	.priority-label select,
	.assignee-label select,
	.recurrence-select,
	.due-date-field input,
	.reminder-field select {
		padding: 0.5rem;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		background-color: white;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		justify-content: center;
	}

	.filters button {
		padding: 0.5rem 1rem;
		background-color: #f0f0f0;
		color: #333;
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.filters button:hover {
		background-color: #e0e0e0;
	}

	.filters button.active {
		background-color: white;
		border-color: var(--color-accent, #4CAF50);
		color: var(--color-accent, #4CAF50);
	}

	.sort-toolbar {
		margin-top: -0.25rem;
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: flex-start;
	}

	.sort-inline {
		display: inline-flex;
		flex-direction: column;
		gap: 0.4rem;
		background-color: #f8f9fa;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		color: #555;
		width: fit-content;
		min-width: 0;
	}

	.sort-inline-main {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sort-inline-main label {
		font-weight: 600;
		font-size: 0.85rem;
	}

	.sort-inline-main select {
		padding: 0.4rem 0.6rem;
		border: 2px solid #d9d9de;
		border-radius: 4px;
		background-color: white;
		cursor: pointer;
		font-size: 0.9rem;
		min-width: 0;
	}

	.sort-inline-hint {
		font-size: 0.7rem;
		color: #777;
	}

	.drop-zone {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0.5rem 1rem;
		border: 2px dashed transparent;
		border-radius: 8px;
		text-align: center;
		color: var(--color-text-secondary, #666);
		font-size: 0.85rem;
		transition: all 0.2s ease;
	}

	.drop-zone.active {
		border-color: var(--color-primary, #667eea);
		background: rgba(102, 126, 234, 0.1);
		color: var(--color-primary, #667eea);
	}



	.calendar-modal {
		max-width: 600px;
		width: 100%;
	}

	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.calendar-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #2c3e50;
	}

	.calendar-nav {
		background: #f0f0f0;
		border: none;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.calendar-nav:hover {
		background: #e0e0e0;
	}

	.calendar-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.calendar-weekdays,
	.calendar-week {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.5rem;
	}

	.calendar-weekday {
		text-align: center;
		font-weight: 600;
		color: #555;
		font-size: 0.85rem;
	}

	.calendar-day {
		min-height: 120px;
		background: #f9fafc;
		border-radius: 8px;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid rgba(0, 0, 0, 0.05);
	}

	.calendar-day.today {
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 2px var(--color-primary, rgba(102, 126, 234, 0.2));
	}

	.calendar-day.has-todos {
		background: #fff;
	}

	.calendar-day.overdue-day {
		border-color: #ff6b6b;
	}

	.calendar-day.empty {
		background: transparent;
		border: none;
	}

	.calendar-day-number {
		font-weight: 700;
		color: #2c3e50;
	}

	.calendar-todo-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.calendar-todo-list li {
		font-size: 0.8rem;
		padding: 0.25rem 0.4rem;
		border-radius: 4px;
		background: rgba(102, 126, 234, 0.12);
		color: #2c3e50;
	}

	.calendar-todo-list li.completed {
		text-decoration: line-through;
		color: #999;
		background: rgba(0, 0, 0, 0.05);
	}

	.calendar-todo-list li.overdue-item {
		background: rgba(255, 107, 107, 0.15);
		color: #c0392b;
	}

	.calendar-todo-list li.priority-high {
		background: rgba(255, 107, 107, 0.2);
		color: #a83232;
	}

	.calendar-todo-list li.priority-medium {
		background: rgba(255, 193, 7, 0.2);
		color: #a36b00;
	}

	.calendar-todo-list li.priority-low {
		background: rgba(0, 184, 148, 0.2);
		color: #008b74;
	}

	.calendar-todo-list .more-todos {
		text-align: center;
		font-weight: 600;
		background: transparent;
		color: #555;
	}

	.footer {
		margin-top: 1rem;
		text-align: center;
		color: #666;
		font-size: 0.9rem;
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		min-width: 400px;
		max-width: 90vw;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: #2c3e50;
	}

	.modal-header-section {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.modal-header-section h2 {
		margin: 0;
	}

	.modal input,
	.modal select {
		width: 100%;
		padding: 0.75rem;
		margin-bottom: 1rem;
		font-size: 1rem;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		outline: none;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	.modal input:focus,
	.modal select:focus {
		border-color: #667eea;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-primary {
		background-color: var(--color-primary, #667eea);
		color: white;
	}

	.btn-primary:hover {
		background-color: var(--color-primary-hover, #5568d3);
	}

	.btn-secondary {
		background-color: #e0e0e0;
		color: #333;
	}

	.btn-secondary:hover {
		background-color: #d0d0d0;
	}

	.invitations-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.invitation-item {
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.invitation-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.invitation-info strong {
		color: #2c3e50;
	}

	.invitation-info span {
		font-size: 0.9rem;
		color: #666;
	}

	.permission-badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		background: var(--color-primary, #667eea);
		color: white;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.invitation-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-accept,
	.btn-reject {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-accept {
		background-color: #28a745;
		color: white;
	}

	.btn-accept:hover {
		background-color: #218838;
	}

	.btn-reject {
		background-color: #dc3545;
		color: white;
	}

	.btn-reject:hover {
		background-color: #c82333;
	}

	.deleted-info {
		margin: 0 0 1.5rem 0;
		padding: 0.75rem;
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 4px;
		color: #856404;
		font-size: 0.9rem;
	}

	.deleted-todos-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
		max-height: 400px;
		overflow-y: auto;
	}

	.deleted-todo-item {
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		border-left: 4px solid #ff6b6b;
	}

	.deleted-todo-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
	}

	.deleted-todo-text {
		color: #2c3e50;
		font-weight: 500;
		font-size: 1rem;
	}

	.deleted-todo-meta {
		font-size: 0.85rem;
		color: #666;
	}

	.deleted-todo-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-restore,
	.btn-permanent-delete {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		white-space: nowrap;
	}

	.btn-restore {
		background-color: #28a745;
		color: white;
	}

	.btn-restore:hover {
		background-color: #218838;
	}

	.btn-permanent-delete {
		background-color: #dc3545;
		color: white;
	}

	.btn-permanent-delete:hover {
		background-color: #c82333;
	}

	.empty-deleted {
		text-align: center;
		color: #999;
		padding: 2rem;
		font-style: italic;
	}

	.btn-delete-all {
		padding: 0.5rem 1rem;
		background-color: #dc3545;
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-delete-all:hover {
		background-color: #c82333;
	}

	/* Settings Modal Styles */
	.settings-section {
		margin-bottom: 1.5rem;
	}

	.settings-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		color: var(--color-text, #2c3e50);
		font-weight: 600;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid var(--color-card-border, #e0e0e0);
	}

	.setting-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		margin-bottom: 0.75rem;
		background: #f8f9fa;
		border-radius: 8px;
		gap: 1rem;
	}

	.setting-item label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 200px;
	}

	.setting-label {
		font-weight: 600;
		color: var(--color-text, #2c3e50);
		font-size: 0.95rem;
		white-space: nowrap;
	}

	.setting-description {
		font-size: 0.85rem;
		color: var(--color-text-secondary, #666);
		line-height: 1.4;
	}

	.setting-select {
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-card-border, #e0e0e0);
		border-radius: 6px;
		background: white;
		color: var(--color-text, #2c3e50);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 180px;
	}

	.setting-select:hover {
		border-color: var(--color-primary, #667eea);
	}

	.setting-select:focus {
		outline: none;
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.setting-toggle-btn {
		padding: 0.5rem 1.5rem;
		border: 2px solid var(--color-primary, #667eea);
		border-radius: 6px;
		background: white;
		color: var(--color-primary, #667eea);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 80px;
	}

	.setting-toggle-btn:hover {
		background: var(--color-primary, #667eea);
		color: white;
	}

	/* Dark Mode Styles */
	/* Dark mode keeps the theme background gradient */

	:global(body.dark-mode) .sidebar {
		background: rgba(30, 30, 46, 0.95);
		box-shadow: 2px 0 10px rgba(0, 0, 0, 0.5);
	}

	:global(body.dark-mode) .sidebar-header h2 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .list-item {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .list-item:hover {
		background: #2d2d44;
	}

	:global(body.dark-mode) .list-item.active {
		background: #353549;
		border-color: #667eea;
	}

	:global(body.dark-mode) .list-name {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .personal-label {
		color: #999;
	}

	:global(body.dark-mode) .main-content {
		background: #1e1e2e;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		color: #e0e0e0;
	}

	:global(body.dark-mode) .header {
		border-bottom-color: #353549;
	}

	:global(body.dark-mode) .user-info {
		color: #999;
	}

	:global(body.dark-mode) .user-info strong {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .connection-status {
		background-color: #252538;
	}

	:global(body.dark-mode) .settings-btn {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .settings-btn:hover {
		background: #2d2d44;
		border-color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .theme-toggle {
		background-color: #353549;
	}

	:global(body.dark-mode) .theme-toggle:hover {
		background-color: #404057;
	}

	:global(body.dark-mode) h1,
	:global(body.dark-mode) h2 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .input-section input {
		background: #252538;
		border-color: #353549;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .input-section input:focus {
		border-color: #4CAF50;
	}

	:global(body.dark-mode) .task-options-row,
	:global(body.dark-mode) .recurring-options,
	:global(body.dark-mode) .due-date-options {
		background-color: #252538;
	}

	:global(body.dark-mode) .task-type-label,
	:global(body.dark-mode) .priority-label,
	:global(body.dark-mode) .assignee-label,
	:global(body.dark-mode) .recurrence-select-label,
	:global(body.dark-mode) .due-date-field,
	:global(body.dark-mode) .reminder-field {
		color: #999;
	}

	:global(body.dark-mode) .task-type-label select,
	:global(body.dark-mode) .priority-label select,
	:global(body.dark-mode) .assignee-label select,
	:global(body.dark-mode) .recurrence-select,
	:global(body.dark-mode) .due-date-field input,
	:global(body.dark-mode) .reminder-field select,
	:global(body.dark-mode) .sort-inline-main select {
		background-color: #353549;
		border-color: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .sort-toolbar .sort-inline {
		background-color: #252538;
		color: #999;
		border-color: #353549;
	}

	:global(body.dark-mode) .sort-inline-hint {
		color: #888;
	}

	:global(body.dark-mode) .filters button {
		background-color: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .filters button:hover {
		background-color: #353549;
	}

	:global(body.dark-mode) .filters button.active {
		background-color: #353549;
		border-color: #4CAF50;
	}

	:global(body.dark-mode) .calendar-btn,
	:global(body.dark-mode) .recently-deleted-btn {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .calendar-btn:hover,
	:global(body.dark-mode) .recently-deleted-btn:hover {
		background: #353549;
	}

	:global(body.dark-mode) .footer {
		color: #999;
	}

	:global(body.dark-mode) .modal {
		background: #1e1e2e;
	}

	:global(body.dark-mode) .modal h2 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal-header-section h2 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal input,
	:global(body.dark-mode) .modal select {
		background: #252538;
		border-color: #353549;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal input:focus,
	:global(body.dark-mode) .modal select:focus {
		border-color: #667eea;
	}

	:global(body.dark-mode) .btn-secondary {
		background-color: #353549;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .btn-secondary:hover {
		background-color: #404057;
	}

	:global(body.dark-mode) .calendar-header h2 {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .calendar-nav {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .calendar-nav:hover {
		background: #353549;
	}

	:global(body.dark-mode) .calendar-weekday {
		color: #999;
	}

	:global(body.dark-mode) .calendar-day {
		background: #252538;
		border-color: rgba(255, 255, 255, 0.05);
	}

	:global(body.dark-mode) .calendar-day.has-todos {
		background: #2d2d44;
	}

	:global(body.dark-mode) .calendar-day-number {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .calendar-todo-list li {
		background: rgba(102, 126, 234, 0.25);
		color: #e0e0e0;
	}

	:global(body.dark-mode) .invitation-item {
		background: #252538;
	}

	:global(body.dark-mode) .invitation-info strong {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .invitation-info span {
		color: #999;
	}

	:global(body.dark-mode) .deleted-info {
		background: rgba(255, 193, 7, 0.2);
		border-color: rgba(255, 193, 7, 0.4);
		color: #ffc107;
	}

	:global(body.dark-mode) .deleted-todo-item {
		background: #252538;
		border-left-color: #ff6b6b;
	}

	:global(body.dark-mode) .deleted-todo-text {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .deleted-todo-meta {
		color: #999;
	}

	:global(body.dark-mode) .empty-deleted {
		color: #666;
	}

	/* Dark Mode - Settings Modal */
	:global(body.dark-mode) .settings-section h3 {
		color: #e0e0e0;
		border-bottom-color: #404057;
	}

	:global(body.dark-mode) .setting-item {
		background: #252538;
	}

	:global(body.dark-mode) .setting-label {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .setting-description {
		color: #9a9eb8;
	}

	:global(body.dark-mode) .setting-select {
		background: #353549;
		border-color: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .setting-select:hover,
	:global(body.dark-mode) .setting-select:focus {
		border-color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .setting-toggle-btn {
		background: #353549;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .setting-toggle-btn:hover {
		background: var(--color-primary, #667eea);
		color: white;
	}
</style>
