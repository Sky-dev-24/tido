<script>
	import { onMount, onDestroy, setContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import TodoItem from '$lib/components/TodoItem.svelte';
	import MobileActionSheet from '$lib/components/MobileActionSheet.svelte';
	import MindMapView from '$lib/components/MindMapView.svelte';
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
	import {
		themes,
		viewDensities,
		fontScales,
		fontFamilies,
		applyTheme,
		applyViewDensity,
		applyFontScale,
		applyFontFamily,
		getAllThemes,
		saveCustomTheme,
		deleteCustomTheme,
		exportTheme,
		importTheme
	} from '$lib/themes.js';
	import ThemeBuilder from '$lib/components/ThemeBuilder.svelte';

	let { data } = $props();

	let lists = $state([]);
	let currentList = $state(null);
	let todos = $state([]);
	let invitations = $state([]);
	let archivedLists = $state([]);
	let newTodoText = $state('');
	let filter = $state('active'); // Default to active view
	let completingTodoIds = $state(new Set()); // Track todos currently animating completion
	let newlyCreatedTodoIds = $state(new Set()); // Track newly created recurring tasks for animation
let newTodoMode = $state('single');
let recurrencePattern = $state('daily');
let customIntervalNumber = $state(1);
let customIntervalUnit = $state('days');
let newTodoPriority = $state('medium');
let newTodoAssignee = $state('');
let showNewListModal = $state(false);
let showInviteModal = $state(false);
let showInvitationsModal = $state(false);
let showRecentlyDeletedModal = $state(false);
let showSettingsModal = $state(false);
let showArchivedListsModal = $state(false);
let showMobileMenu = $state(false);
let newListName = $state('');
let inviteUsername = $state('');
let invitePermission = $state('editor');
let newTodoDueDate = $state('');
let newTodoReminder = $state('');
let currentListMembers = $state([]);
let sortMode = $state('manual');
let displayStyle = $state('list'); // 'list' or 'compact'
let showCalendarModal = $state(false);
let deletedTodos = $state([]);
let calendarReference = $state(new Date());
let calendarViewMode = $state('month'); // 'month', 'week', 'day'
let showExportModal = $state(false);
let showImportModal = $state(false);
let importFileInput = $state(null);
let importCreateNewList = $state(false);
let importNewListName = $state('');
let importSelectedFileName = $state('');
let draggedTodoId = $state(null);
let draggedOverDate = $state(null);
let currentTime = $state(new Date());
let clockTimer;
let notificationTimer;
const notifiedReminders = new SvelteSet();
let notificationPermissionRequested = false;

let expandedTodos = $state(new SvelteSet());
let darkMode = $state(data.user.dark_mode === 1);
let currentTheme = $state(data.user.theme || 'aurora');
let currentViewDensity = $state(data.user.view_density || 'comfortable');
let currentFontScale = $state(data.user.font_scale || 'medium');
let currentFontFamily = $state(data.user.font_family || 'system');
let showThemeBuilder = $state(false);
let allThemes = $state(getAllThemes());
let editingTheme = $state(null);
const customThemes = $derived.by(() =>
	Object.entries(allThemes ?? {}).filter(([_, theme]) => theme?.custom)
);
const currentThemeData = $derived(() => allThemes?.[currentTheme]);
let defaultTaskPriorityPreference = $state(data.user.default_task_priority || 'medium');
let defaultTaskDueOffset = $state(
	Number.isFinite(Number(data.user.default_task_due_offset_days))
		? Number(data.user.default_task_due_offset_days)
		: 0
);
let defaultTaskReminderMinutes = $state(
	data.user.default_task_reminder_minutes ?? null
);
let autoArchiveDaysPreference = $state(
	Number.isFinite(Number(data.user.auto_archive_days)) ? Number(data.user.auto_archive_days) : 0
);
let weekStartPreference = $state(data.user.week_start_day || 'sunday');

// Derived logo path based on dark mode
let logoPath = $derived(darkMode ? '/Tido_v8_FINAL_WHT.png' : '/Tido_v8_FINAL_BLK.png');
const weekdayLabels = $derived.by(() =>
	weekStartPreference === 'monday'
		? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
);
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABELS = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const currentUserId = data.user.id;

// Presence tracking
let activeUsers = $state(new SvelteMap()); // Map of socketId -> {userId, username}
let todoEditingState = $state(new SvelteMap()); // Map of todoId -> {userId, username, socketId}
let todoTypingState = $state(new SvelteMap()); // Map of "todoId:field" -> {userId, username, socketId}

// Mobile enhancement state
let isMobile = $state(false);
let hasCoarsePointer = $state(false);
let cameraCaptureSupported = $state(false);
let isPulling = $state(false);
let pullOffset = $state(0);
let pullStatus = $state('Pull to refresh');
let isRefreshing = $state(false);
const pullThreshold = 70;
let pullStartY = 0;
let voiceErrorClearTimer;
let detachResizeListener;

let speechRecognition;
let isVoiceSupported = $state(false);
let isVoiceActive = $state(false);
let voiceError = $state('');

let cameraInputEl = $state(null);
let newTodoInputEl;
let mainContentEl;
const todoElementRegistry = new Map();

let mobileActionSheet = $state({
	open: false,
	todoId: null,
	snapshot: null,
	actions: {}
});

let mobileActionTodo = $derived.by(() => {
	if (!mobileActionSheet.open || !mobileActionSheet.todoId) {
		return null;
	}
	const fresh = todos.find((item) => item.id === mobileActionSheet.todoId);
	return fresh ?? mobileActionSheet.snapshot;
});

let mobileDragState = $state({
	active: false,
	todoId: null,
	pointerId: null,
	startIndex: -1,
	currentIndex: -1
});

$effect(() => {
	if (mobileActionSheet.open && !mobileActionTodo) {
		closeMobileActionSheet();
	}
});

let totalTodoCount = $derived.by(() => todos.length);
let activeTodoCount = $derived.by(() => todos.filter((todo) => !todo.completed).length);
let completedTodoCount = $derived.by(() => todos.filter((todo) => todo.completed).length);

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

function updateMobileCapabilities() {
	if (!browser) {
		return;
	}
	try {
		const mobileQuery = window.matchMedia('(max-width: 768px)');
		const coarseQuery = window.matchMedia('(pointer: coarse)');
		isMobile = mobileQuery.matches;
		hasCoarsePointer = coarseQuery.matches || 'ontouchstart' in window;

		let captureSupported = false;
		try {
			const testInput = document.createElement('input');
			captureSupported = 'capture' in testInput || 'accept' in testInput;
		} catch {
			captureSupported = false;
		}

		const mediaDevicesSupported = Boolean(navigator?.mediaDevices?.getUserMedia);
		cameraCaptureSupported =
			(isMobile || hasCoarsePointer) && (captureSupported || mediaDevicesSupported);
	} catch (error) {
		console.warn('Unable to evaluate mobile capabilities', error);
		isMobile = false;
		hasCoarsePointer = false;
		cameraCaptureSupported = false;
	}
}

function resetPullState() {
	isPulling = false;
	pullOffset = 0;
	pullStatus = 'Pull to refresh';
}

function extractClientY(event) {
	if (event.touches && event.touches.length > 0) {
		return event.touches[0].clientY;
	}
	if (event.changedTouches && event.changedTouches.length > 0) {
		return event.changedTouches[0].clientY;
	}
	return event.clientY ?? 0;
}

function handlePullStart(event) {
	if (!isMobile || !hasCoarsePointer || isRefreshing) {
		return;
	}
	const scrollTop =
		document.documentElement?.scrollTop ?? document.body?.scrollTop ?? window.scrollY ?? 0;
	if (scrollTop > 0) {
		return;
	}
	pullStartY = extractClientY(event);
	if (!pullStartY) {
		return;
	}
	isPulling = true;
	pullOffset = 0;
	pullStatus = 'Pull to refresh';
}

function handlePullMove(event) {
	if (!isPulling) {
		return;
	}

	const currentY = extractClientY(event);
	if (!currentY) {
		return;
	}

	const delta = currentY - pullStartY;
	if (delta <= 0) {
		resetPullState();
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const dampened = Math.min(delta * 0.6, 140);
	pullOffset = dampened;
	pullStatus = dampened > pullThreshold ? 'Release to refresh' : 'Pull to refresh';
}

async function handlePullEnd() {
	if (!isPulling) {
		return;
	}

	const shouldRefresh = pullOffset > pullThreshold;
	resetPullState();

	if (shouldRefresh) {
		await refreshDataFromPull();
	}
}

async function refreshDataFromPull() {
	if (isRefreshing) {
		return;
	}
	isRefreshing = true;
	pullStatus = 'Refreshing...';
	try {
		await fetchLists();
		await fetchInvitations();
	} catch (error) {
		console.error('Failed to refresh data', error);
		pullStatus = 'Refresh failed';
		setTimeout(() => {
			pullStatus = 'Pull to refresh';
		}, 1500);
	} finally {
		isRefreshing = false;
		if (pullStatus !== 'Pull to refresh') {
			setTimeout(() => {
				pullStatus = 'Pull to refresh';
			}, 800);
		} else {
			pullStatus = 'Pull to refresh';
		}
	}
}

function recordVoiceError(message) {
	voiceError = message ?? 'Voice input error';
	if (voiceErrorClearTimer) {
		clearTimeout(voiceErrorClearTimer);
	}
	voiceErrorClearTimer = setTimeout(() => {
		voiceError = '';
		voiceErrorClearTimer = undefined;
	}, 4000);
}

function toggleVoiceInput() {
	if (!speechRecognition) {
		recordVoiceError('Voice recognition not supported on this device');
		return;
	}
	try {
		if (isVoiceActive) {
			speechRecognition.stop();
		} else {
			voiceError = '';
			speechRecognition.start();
		}
	} catch (error) {
		console.error('Failed to toggle voice input', error);
		recordVoiceError('Unable to access microphone');
	}
}

async function handleCameraCapture(event) {
	const input = event.currentTarget;
	const file = input?.files?.[0];
	if (input) {
		input.value = '';
	}

	if (!file) {
		return;
	}

	if (!currentList) {
		alert('Select a list before attaching a photo.');
		return;
	}

	const baseText =
		newTodoText.trim() ||
		file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() ||
		'New photo task';

	const isRecurringTask = newTodoMode === 'recurring';
	// Build recurrence pattern - for custom, format as "custom:N:unit"
	let recurrenceValue = null;
	if (isRecurringTask) {
		if (recurrencePattern === 'custom') {
			recurrenceValue = `custom:${customIntervalNumber}:${customIntervalUnit}`;
		} else {
			recurrenceValue = recurrencePattern;
		}
	}
	const dueDateValue = (newTodoMode === 'deadline' || newTodoMode === 'recurring') ? newTodoDueDate || null : null;
	const reminderValue =
		newTodoMode === 'deadline' && newTodoReminder ? Number(newTodoReminder) : null;
	const priorityValue = resolvePriorityKey(newTodoPriority);

	try {
		const response = await fetch('/api/todos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				listId: currentList.id,
				text: baseText,
				isRecurring: isRecurringTask,
				recurrencePattern: recurrenceValue,
				dueDate: dueDateValue,
				reminderMinutesBefore: reminderValue,
				priority: priorityValue,
				assignedTo: newTodoAssignee ? Number(newTodoAssignee) : null
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error?.error ?? 'Failed to create task');
		}

		const todo = await response.json();
		const uploaded = await uploadAttachment(todo.id, file);
		if (!uploaded) {
			throw new Error('Failed to upload attachment');
		}

		resetNewTodoFields();
	} catch (error) {
		console.error('Camera capture failed', error);
		alert(error.message ?? 'Unable to capture photo');
	}
}

function handleMobileListChange(event) {
	const selectedId = Number(event.currentTarget.value);
	if (!Number.isFinite(selectedId)) {
		return;
	}
	const target = lists.find((list) => list.id === selectedId);
	if (target) {
		selectList(target);
	}
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
			progressPercent: totalSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0,
			overdue: isTodoOverdue(root)
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
		filtered = roots.filter((todo) => {
			// Keep todos visible if they're currently completing (for animation)
			if (completingTodoIds.has(todo.id)) {
				return true;
			}
			return !todo.completed || todo.subtasks.some((sub) => !sub.completed);
		});
	} else if (filter === 'completed') {
		filtered = roots.filter((todo) => {
			const subtasksComplete = !todo.subtasks.length || todo.subtasks.every((sub) => sub.completed);
			return todo.completed && subtasksComplete;
		});
	}

	return filtered;
});

let remainingCount = $derived(todos.filter((t) => !t.completed).length);

const mindMapNodes = $derived.by(() => {
	if (!currentList) return [];
	return (filteredRootTodos ?? [])
		.map((todo) => mapTodoForViews({ ...todo, depth: 0 }, { includeChildren: true }))
		.filter(Boolean);
});

	let calendarLabel = $derived.by(() => {
		if (calendarViewMode === 'day') {
			return calendarReference.toLocaleString(undefined, {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		} else if (calendarViewMode === 'week') {
			const weekStartsOnMonday = weekStartPreference === 'monday';
			const referenceDay = calendarReference.getDay();
			const offset = weekStartsOnMonday ? (referenceDay + 6) % 7 : referenceDay;
			const startOfWeek = new Date(calendarReference);
			startOfWeek.setDate(calendarReference.getDate() - offset);
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);

			if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
				return `${startOfWeek.toLocaleString(undefined, { month: 'long' })} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
			} else {
				return `${startOfWeek.toLocaleString(undefined, { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
			}
		} else {
			return calendarReference.toLocaleString(undefined, { month: 'long', year: 'numeric' });
		}
	});

	let calendarWeeks = $derived.by(() => {
		const reference = calendarReference;
		const activeTime = currentTime;
		const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
		const daysInMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
		const dueMap = new SvelteMap();
		const weekStartsOnMonday = weekStartPreference === 'monday';

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

		const startDay = start.getDay();
		const leadingNulls = weekStartsOnMonday ? (startDay + 6) % 7 : startDay;

		for (let i = 0; i < leadingNulls; i += 1) {
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
			hasOverdue: todosForDay.some((todo) => isTodoOverdue(todo, activeTime)),
			priorityCounts: computePriorityCounts(todosForDay)
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

	let calendarWeekView = $derived.by(() => {
		const reference = calendarReference;
		const activeTime = currentTime;
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

		// Get the week containing the reference date
	const weekStartsOnMonday = weekStartPreference === 'monday';
	const startOfWeek = new Date(reference);
	const referenceDay = reference.getDay();
	const offset = weekStartsOnMonday ? (referenceDay + 6) % 7 : referenceDay;
	startOfWeek.setDate(reference.getDate() - offset);

		const days = [];
		for (let i = 0; i < 7; i++) {
			const date = new Date(startOfWeek);
			date.setDate(startOfWeek.getDate() + i);
		const key = getLocalDateKey(date);
		const todosForDay = dueMap.get(key) ?? [];
		days.push({
			date,
			key,
			isToday: isSameCalendarDay(date, activeTime),
			todos: todosForDay,
			hasOverdue: todosForDay.some((todo) => isTodoOverdue(todo, activeTime)),
			priorityCounts: computePriorityCounts(todosForDay)
		});
	}

		return days;
	});

	let calendarDayView = $derived.by(() => {
		const reference = calendarReference;
		const activeTime = currentTime;
		const key = getLocalDateKey(reference);
		const todosForDay = todos.filter(todo => getLocalDateKey(todo.due_date) === key);

		todosForDay.sort((a, b) => {
			const priorityDelta = (PRIORITY_ORDER[resolvePriorityKey(a.priority)] ?? 1) - (PRIORITY_ORDER[resolvePriorityKey(b.priority)] ?? 1);
			if (priorityDelta !== 0) return priorityDelta;
			const dateA = new Date(a.due_date ?? a.created_at ?? 0).getTime();
			const dateB = new Date(b.due_date ?? b.created_at ?? 0).getTime();
			return dateA - dateB;
		});

		return {
			date: reference,
			key,
			isToday: isSameCalendarDay(reference, activeTime),
			todos: todosForDay,
			hasOverdue: todosForDay.some((todo) => isTodoOverdue(todo, activeTime))
		};
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

	function formatDateTimeLocal(date) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
			return '';
		}
		const timezoneOffset = date.getTimezoneOffset();
		const local = new Date(date.getTime() - timezoneOffset * 60 * 1000);
		return local.toISOString().slice(0, 16);
	}

	function computeDefaultDueDateValue() {
		if (!defaultTaskDueOffset || defaultTaskDueOffset <= 0) {
			return '';
		}
		const due = new Date();
		due.setHours(17, 0, 0, 0);
		due.setDate(due.getDate() + Number(defaultTaskDueOffset));
		return formatDateTimeLocal(due);
	}

	function computePriorityCounts(todos) {
		const counts = { high: 0, medium: 0, low: 0 };
		if (!Array.isArray(todos)) {
			return counts;
		}
	for (const todo of todos) {
		if (!todo || todo.completed) continue;
		const key = resolvePriorityKey(todo.priority);
		if (counts[key] !== undefined) {
			counts[key] += 1;
		}
	}
	return counts;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
	if (!value) return null;
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
	const date = toDate(value);
	if (!date) return null;
	date.setHours(0, 0, 0, 0);
	return date;
}

function formatRelativeDay(value, reference = currentTime) {
	const target = toDate(value);
	const base = toDate(reference);
	if (!target || !base) return '';
	const diffMs = target.getTime() - base.getTime();
	const diffDays = Math.round(diffMs / ONE_DAY_MS);

	if (diffDays === 0) return 'today';
	if (diffDays === 1) return 'tomorrow';
	if (diffDays === -1) return 'yesterday';
	if (diffDays > 0 && diffDays <= 7) return `in ${diffDays} days`;
	if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

	return target.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: target.getFullYear() !== base.getFullYear() ? 'numeric' : undefined
	});
}

function createNotesPreview(notes) {
	if (typeof notes !== 'string') return '';
	const trimmed = notes.trim().replace(/\s+/g, ' ');
	if (!trimmed) return '';
	return trimmed.length <= 160 ? trimmed : `${trimmed.slice(0, 157)}...`;
}

function mapTodoForViews(todo, { includeChildren = false } = {}) {
	if (!todo) return null;
	const dueDate = toDate(todo.due_date);
	const createdDate = toDate(todo.created_at);
	const priorityKey = resolvePriorityKey(todo.priority);

	const base = {
		id: todo.id,
		text: todo.text,
		completed: Boolean(todo.completed),
		isRecurring: Boolean(todo.is_recurring),
		overdue: isTodoOverdue(todo),
		dueDate: dueDate ? dueDate.toISOString() : null,
		dueLabel: todo.due_date_label ?? (dueDate ? formatDueDate(dueDate) : ''),
		priorityKey,
		priority: todo.priority,
		comment_count: Number.isFinite(Number(todo.comment_count)) ? Number(todo.comment_count) : 0,
		assignedTo:
			(todo.assigned_to_username && todo.assigned_to_username.trim()) ||
			(todo.assigned_to_email && todo.assigned_to_email.trim()) ||
			'',
		totalSubtasks:
			typeof todo.totalSubtasks === 'number'
				? todo.totalSubtasks
				: Array.isArray(todo.subtasks)
				? todo.subtasks.length
				: 0,
		completedSubtasks:
			typeof todo.completedSubtasks === 'number'
				? todo.completedSubtasks
				: Array.isArray(todo.subtasks)
				? todo.subtasks.filter((sub) => sub?.completed).length
				: 0,
		subtasks: [],
		notesPreview: createNotesPreview(todo.notes),
		completedAtLabel: todo.completed_at ? formatRelativeDay(todo.completed_at) : '',
		createdLabel: createdDate ? formatRelativeDay(createdDate) : '',
		createdAt: createdDate ? createdDate.toISOString() : null,
		depth: todo.depth ?? 0
	};

	if (Array.isArray(todo.subtasks) && todo.subtasks.length) {
		const childInclude = includeChildren;
		base.subtasks = todo.subtasks
			.map((subtask) =>
				mapTodoForViews(
					{ ...subtask, depth: (todo.depth ?? 0) + 1 },
					{ includeChildren: childInclude }
				)
			)
			.filter(Boolean)
			.map((subtask) => (childInclude ? subtask : { ...subtask, subtasks: [] }));
	}

	return base;
}

	function resetNewTodoFields({ preserveText = false } = {}) {
		if (!preserveText) {
			newTodoText = '';
		}

		const dueValue = computeDefaultDueDateValue();
		const reminderValue =
			defaultTaskReminderMinutes === null || defaultTaskReminderMinutes === undefined
				? ''
				: String(defaultTaskReminderMinutes);

		if (dueValue || reminderValue) {
			newTodoMode = 'deadline';
			newTodoDueDate = dueValue || '';
			newTodoReminder = reminderValue;
		} else {
			newTodoMode = 'single';
			newTodoDueDate = '';
			newTodoReminder = '';
		}

		recurrencePattern = 'daily';
		newTodoPriority = defaultTaskPriorityPreference || 'medium';
		newTodoAssignee = '';
	}

	resetNewTodoFields({ preserveText: true });

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
let dragIntent = $state({ type: 'none', targetId: null, parentId: null });
let dropTargetListId = $state(null);

const DESKTOP_INDENT_THRESHOLD = 0.55;
const DESKTOP_OUTDENT_THRESHOLD = 0.28;

function resetDragState() {
	draggedTodo = null;
	dragOverTodo = null;
	dragOverTopZone = false;
	dragIntent = { type: 'none', targetId: null, parentId: null };
	dropTargetListId = null;
}

function handleDragStart(event, todo) {
	if (sortMode !== 'manual' || !todo || isMobile) {
		return;
	}

	if (event?.dataTransfer) {
		try {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(todo.id));
		} catch {
			// Ignore browsers that disallow setData in certain contexts
		}
	}

	draggedTodo = todo;
	dragOverTopZone = false;
	dragIntent = { type: 'none', targetId: null, parentId: null };
	dropTargetListId = null;
}

function deriveDragIntent(event, targetTodo) {
	if (!draggedTodo || !targetTodo || draggedTodo.id === targetTodo.id) {
		return { type: 'none', targetId: null, parentId: null };
	}

	const baseIntent = {
		type: 'reorder',
		targetId: targetTodo.id,
		parentId: targetTodo.parent_todo_id ?? null
	};

	const rect = event?.currentTarget?.getBoundingClientRect?.();
	if (!rect) {
		return baseIntent;
	}

	const offsetX = event.clientX - rect.left;
	const ratio = rect.width > 0 ? offsetX / rect.width : 0;

	const draggingRoot = draggedTodo.parent_todo_id === null;
	const targetIsRoot = targetTodo.parent_todo_id === null;
	const draggingSubtask = !draggingRoot;
	const draggedHasSubtasks =
		Array.isArray(draggedTodo.subtasks) && draggedTodo.subtasks.length > 0;

	if (draggingRoot && targetIsRoot && ratio > DESKTOP_INDENT_THRESHOLD) {
		if (draggedTodo.id !== targetTodo.id && !draggedHasSubtasks) {
			return { type: 'indent', targetId: targetTodo.id, parentId: targetTodo.id };
		}
	}

	if (draggingSubtask) {
		if (ratio < DESKTOP_OUTDENT_THRESHOLD) {
			return { type: 'outdent', targetId: draggedTodo.parent_todo_id ?? null, parentId: null };
		}

		if (
			targetIsRoot &&
			ratio > DESKTOP_INDENT_THRESHOLD &&
			draggedTodo.parent_todo_id !== targetTodo.id
		) {
			return { type: 'indent', targetId: targetTodo.id, parentId: targetTodo.id };
		}
	}

	return baseIntent;
}

function handleDragOver(event, todo) {
	if (sortMode !== 'manual' || isMobile || !draggedTodo) {
		return;
	}

	event.preventDefault();
	if (event?.dataTransfer) {
		event.dataTransfer.dropEffect = 'move';
	}

	dragIntent = deriveDragIntent(event, todo);
	if (draggedTodo.id !== todo.id) {
		dragOverTodo = todo;
	}
}

function handleDragEnd() {
	resetDragState();
}

async function moveTodoUp(todoId) {
	if (sortMode !== 'manual') return;

	const todo = todos.find((t) => t.id === todoId);
	if (!todo) return;

	const parentId = todo.parent_todo_id ?? null;
	const siblings = sortByOrder(
		todos.filter((t) => (t.parent_todo_id ?? null) === parentId)
	);

	const currentIndex = siblings.findIndex((t) => t.id === todoId);
	if (currentIndex <= 0) return; // Already at top

	const newOrder = [...siblings];
	const [removed] = newOrder.splice(currentIndex, 1);
	newOrder.splice(currentIndex - 1, 0, removed);

	await submitReorder(newOrder);
}

async function moveTodoDown(todoId) {
	if (sortMode !== 'manual') return;

	const todo = todos.find((t) => t.id === todoId);
	if (!todo) return;

	const parentId = todo.parent_todo_id ?? null;
	const siblings = sortByOrder(
		todos.filter((t) => (t.parent_todo_id ?? null) === parentId)
	);

	const currentIndex = siblings.findIndex((t) => t.id === todoId);
	if (currentIndex === -1 || currentIndex >= siblings.length - 1) return; // Already at bottom

	const newOrder = [...siblings];
	const [removed] = newOrder.splice(currentIndex, 1);
	newOrder.splice(currentIndex + 1, 0, removed);

	await submitReorder(newOrder);
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

async function moveTodoToDestination({
	todoId,
	targetListId,
	targetParentId = null,
	targetIndex = null,
	expandParent = false
}) {
	try {
		const response = await fetch('/api/todos/move', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				todoId,
				targetListId,
				targetParentId,
				targetIndex
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error?.error ?? 'Failed to move todo');
		}

		const result = await response.json().catch(() => ({}));

		if (expandParent && targetParentId) {
			const next = new SvelteSet(expandedTodos);
			next.add(targetParentId);
			expandedTodos = next;
		}

		await fetchTodos();
		if (result?.previousListId !== result?.targetListId) {
			await fetchLists();
		}
		return true;
	} catch (error) {
		console.error('Failed to move todo:', error);
		await fetchTodos();
		return false;
	}
}

async function handleDrop(event, targetTodo) {
	if (sortMode !== 'manual' || isMobile) {
		return;
	}
	event.preventDefault();
	dragOverTopZone = false;

	if (!draggedTodo || !targetTodo || draggedTodo.id === targetTodo.id) {
		resetDragState();
		return;
	}

	const intent = dragIntent ?? { type: 'reorder', targetId: targetTodo.id, parentId: null };

	if (intent.type === 'indent' && intent.parentId && draggedTodo.id !== intent.parentId) {
		if (draggedTodo.parent_todo_id !== intent.parentId) {
			if (Array.isArray(draggedTodo.subtasks) && draggedTodo.subtasks.length > 0) {
				// Prevent creating nested subtasks
			} else {
				const siblingCount = todos.filter(
					(todo) => (todo.parent_todo_id ?? null) === intent.parentId
				).length;
				await moveTodoToDestination({
					todoId: draggedTodo.id,
					targetListId: currentList.id,
					targetParentId: intent.parentId,
					targetIndex: siblingCount,
					expandParent: true
				});
				resetDragState();
				return;
			}
		}
	} else if (intent.type === 'outdent' && draggedTodo.parent_todo_id !== null) {
		const rootTodos = sortByOrder(todos.filter((todo) => todo.parent_todo_id === null));
		const parentIndex = rootTodos.findIndex((todo) => todo.id === draggedTodo.parent_todo_id);
		const targetIndex = parentIndex === -1 ? rootTodos.length : parentIndex + 1;

		await moveTodoToDestination({
			todoId: draggedTodo.id,
			targetListId: currentList.id,
			targetParentId: null,
			targetIndex
		});
		resetDragState();
		return;
	}

	const parentId = draggedTodo.parent_todo_id ?? null;
	const siblings = sortByOrder(
		todos.filter((todo) => (todo.parent_todo_id ?? null) === parentId)
	);

	const draggedIndex = siblings.findIndex((todo) => todo.id === draggedTodo.id);
	const targetIndex = siblings.findIndex((todo) => todo.id === targetTodo.id);

	if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
		resetDragState();
		return;
	}

	const newOrder = [...siblings];
	const [removed] = newOrder.splice(draggedIndex, 1);
	newOrder.splice(targetIndex, 0, removed);

	await submitReorder(newOrder);
	resetDragState();
}

function handleTopZoneDragOver(event) {
	if (sortMode !== 'manual' || isMobile) {
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
	if (sortMode !== 'manual' || isMobile) {
		return;
	}
	if (!draggedTodo || draggedTodo.parent_todo_id !== null) {
		resetDragState();
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
		resetDragState();
		return;
	}

	if (draggedIndex === 0) {
		resetDragState();
		return;
	}

	const newOrder = [...siblings];
	const [removed] = newOrder.splice(draggedIndex, 1);
	newOrder.unshift(removed);

	await submitReorder(newOrder);
	resetDragState();
}

function handleListDragOver(event, list) {
	if (sortMode !== 'manual' || isMobile || !draggedTodo) {
		return;
	}
	event.preventDefault();
	dropTargetListId = list.id;
}

function handleListDragLeave(list) {
	if (dropTargetListId === list.id) {
		dropTargetListId = null;
	}
}

async function handleListDrop(event, list) {
	if (sortMode !== 'manual' || isMobile || !draggedTodo) {
		return;
	}
	event.preventDefault();
	dropTargetListId = null;

	await moveTodoToDestination({
		todoId: draggedTodo.id,
		targetListId: list.id,
		targetParentId: null,
		targetIndex: 0
	});
	resetDragState();
}

$effect(() => {
	if (sortMode !== 'manual') {
		resetDragState();
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
		updateMobileCapabilities();
		const handleResize = () => updateMobileCapabilities();
		window.addEventListener('resize', handleResize);
		detachResizeListener = () => {
			window.removeEventListener('resize', handleResize);
			detachResizeListener = undefined;
		};

		const SpeechRecognitionClass =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		if (SpeechRecognitionClass) {
			try {
				speechRecognition = new SpeechRecognitionClass();
				speechRecognition.lang = navigator.language || 'en-US';
				speechRecognition.continuous = false;
				speechRecognition.interimResults = false;
				speechRecognition.maxAlternatives = 1;

				speechRecognition.onstart = () => {
					isVoiceActive = true;
					voiceError = '';
				};

				speechRecognition.onend = () => {
					isVoiceActive = false;
				};

				speechRecognition.onerror = (event) => {
					isVoiceActive = false;
					if (!event?.error) {
						return;
					}
					if (event.error === 'not-allowed') {
						recordVoiceError('Microphone permission denied');
					} else if (event.error !== 'aborted' && event.error !== 'no-speech') {
						recordVoiceError(`Voice input error: ${event.error}`);
					}
				};

				speechRecognition.onresult = (event) => {
					const transcript =
						event?.results?.[0]?.[0]?.transcript?.trim();
					if (transcript) {
						newTodoText = newTodoText
							? `${newTodoText.trim()} ${transcript}`
							: transcript;
					}
				};

				isVoiceSupported = true;
			} catch (error) {
				console.warn('Failed to initialize voice recognition', error);
				recordVoiceError('Voice input unavailable');
				isVoiceSupported = false;
			}
		} else {
			isVoiceSupported = false;
		}

		if (mainContentEl) {
			mainContentEl.addEventListener('touchmove', handlePullMove, { passive: false });
		}

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

	$effect(() => {
		if (browser) {
			applyFontScale(currentFontScale);
		}
	});

	$effect(() => {
		if (browser) {
			applyFontFamily(currentFontFamily);
		}
	});

	// Join/leave list rooms when currentList changes
	$effect(() => {
		if (browser && currentList && data.user) {
			joinList(currentList.id, data.user.id, data.user.username);
		}
	});

	async function persistPreferences(payload) {
		const response = await fetch('/api/user/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorPayload = await response.json().catch(() => ({}));
			throw new Error(errorPayload?.error ?? 'Failed to update preferences');
		}

		const result = await response.json().catch(() => ({}));
		return result?.user ?? null;
	}

	function syncPreferences(user) {
		if (!user) return;

		if (user.darkMode !== undefined) {
			darkMode = Boolean(user.darkMode);
		}

		if (user.theme) {
			currentTheme = user.theme;
		}

		if (user.viewDensity) {
			currentViewDensity = user.viewDensity;
		}

		if (user.fontScale) {
			currentFontScale = user.fontScale;
		}

		if (user.fontFamily) {
			currentFontFamily = user.fontFamily;
		}

		if (user.defaultTaskPriority !== undefined) {
			defaultTaskPriorityPreference = user.defaultTaskPriority ?? 'medium';
		}

		if (user.defaultTaskDueOffsetDays !== undefined) {
			const parsed = Number(user.defaultTaskDueOffsetDays);
			defaultTaskDueOffset = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
		}

		if (user.defaultTaskReminderMinutes !== undefined) {
			defaultTaskReminderMinutes =
				user.defaultTaskReminderMinutes === null
					? null
					: Number.isFinite(Number(user.defaultTaskReminderMinutes))
						? Math.max(0, Math.trunc(Number(user.defaultTaskReminderMinutes)))
						: null;
		}

		if (user.autoArchiveDays !== undefined) {
			const parsed = Number(user.autoArchiveDays);
			autoArchiveDaysPreference = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
		}

		if (user.weekStartDay) {
			weekStartPreference = user.weekStartDay;
		}
	}

	async function toggleDarkMode() {
		const newDarkMode = !darkMode;
		darkMode = newDarkMode;

		try {
			const updated = await persistPreferences({ darkMode: newDarkMode });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save dark mode preference:', error);
			darkMode = !newDarkMode;
			alert(error.message ?? 'Unable to update dark mode');
		}
	}

	async function changeTheme(themeName) {
		const oldTheme = currentTheme;
		currentTheme = themeName;

		if (browser) {
			applyTheme(themeName);
		}

		try {
			const updated = await persistPreferences({ theme: themeName });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save theme preference:', error);
			currentTheme = oldTheme;
			if (browser) {
				applyTheme(oldTheme);
			}
			alert(error.message ?? 'Unable to update theme');
		}
	}

	function handleSaveTheme(theme) {
		saveCustomTheme(theme);
		allThemes = getAllThemes();
		currentTheme = theme.key;
		if (browser) {
			applyTheme(theme.key);
		}
		persistPreferences({ theme: theme.key });
		showThemeBuilder = false;
		editingTheme = null;
	}

	function handleDeleteTheme(themeKey) {
		if (!confirm('Are you sure you want to delete this custom theme?')) return;

		deleteCustomTheme(themeKey);
		allThemes = getAllThemes();

		if (currentTheme === themeKey) {
			currentTheme = 'aurora';
			if (browser) {
				applyTheme('aurora');
			}
			persistPreferences({ theme: 'aurora' });
		}
	}

	function handleExportTheme(themeKey) {
		const jsonData = exportTheme(themeKey);
		if (!jsonData) {
			alert('Theme not found');
			return;
		}

		const blob = new Blob([jsonData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${themeKey}-theme.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function handleImportTheme() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			try {
				const text = await file.text();
				const theme = importTheme(text);
				allThemes = getAllThemes();
				alert(`Theme "${theme.name}" imported successfully!`);
			} catch (error) {
				alert(error.message);
			}
		};
		input.click();
	}

	async function changeViewDensity(densityName) {
		const oldDensity = currentViewDensity;
		currentViewDensity = densityName;

		try {
			const updated = await persistPreferences({ viewDensity: densityName });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save view density preference:', error);
			currentViewDensity = oldDensity;
			alert(error.message ?? 'Unable to update view density');
		}
	}

	async function changeFontScale(scaleName) {
		const previous = currentFontScale;
		currentFontScale = scaleName;

		if (browser) {
			applyFontScale(scaleName);
		}

		try {
			const updated = await persistPreferences({ fontScale: scaleName });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save font scale preference:', error);
			currentFontScale = previous;
			if (browser) {
				applyFontScale(previous);
			}
			alert(error.message ?? 'Unable to update font size');
		}
	}

	async function changeFontFamily(familyName) {
		const previous = currentFontFamily;
		currentFontFamily = familyName;

		if (browser) {
			applyFontFamily(familyName);
		}

		try {
			const updated = await persistPreferences({ fontFamily: familyName });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save font family preference:', error);
			currentFontFamily = previous;
			if (browser) {
				applyFontFamily(previous);
			}
			alert(error.message ?? 'Unable to update font family');
		}
	}

	async function updateTaskDefaults(updates, onError) {
		try {
			const updated = await persistPreferences(updates);
			syncPreferences(updated);
			resetNewTodoFields({ preserveText: true });
		} catch (error) {
			console.error('Failed to save default task settings:', error);
			if (typeof onError === 'function') {
				try {
					onError();
				} catch {
					// ignore secondary errors
				}
			}
			alert(error.message ?? 'Unable to update default task settings');
		}
	}

	async function updateAutoArchiveDays(days, onError) {
		try {
			const updated = await persistPreferences({ autoArchiveDays: days });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save auto archive preference:', error);
			if (typeof onError === 'function') {
				try {
					onError();
				} catch {
					// ignore
				}
			}
			alert(error.message ?? 'Unable to update auto-archive setting');
		}
	}

	async function updateWeekStart(day, onError) {
		try {
			const updated = await persistPreferences({ weekStartDay: day });
			syncPreferences(updated);
		} catch (error) {
			console.error('Failed to save week start preference:', error);
			if (typeof onError === 'function') {
				try {
					onError();
				} catch {
					// ignore
				}
			}
			alert(error.message ?? 'Unable to update week start day');
		}
	}

	onDestroy(() => {
		if (detachResizeListener) {
			detachResizeListener();
		}

	if (voiceErrorClearTimer) {
		clearTimeout(voiceErrorClearTimer);
		voiceErrorClearTimer = undefined;
	}

	if (speechRecognition) {
		try {
			speechRecognition.stop();
		} catch (error) {
			// Ignore stop errors silently
		}
		speechRecognition.onstart = null;
		speechRecognition.onend = null;
		speechRecognition.onerror = null;
		speechRecognition.onresult = null;
		speechRecognition = undefined;
	}

	if (mainContentEl) {
		mainContentEl.removeEventListener('touchmove', handlePullMove);
	}

		cleanupMobileDragListeners();
		mobileDragState = {
			active: false,
			todoId: null,
			pointerId: null,
			startIndex: -1,
			currentIndex: -1
		};

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

function updateTodoCommentCount(todoId, commentCount) {
	const normalizedId = Number(todoId);
	if (!Number.isFinite(normalizedId)) {
		return;
	}
	const normalizedCount = Number.isFinite(Number(commentCount)) ? Number(commentCount) : 0;

	let didUpdate = false;

	function apply(list) {
		let listChanged = false;
		const updatedList = (list ?? []).map((todo) => {
			if (!todo) return todo;
			let updatedTodo = todo;

			if (todo.id === normalizedId) {
				updatedTodo = { ...todo, comment_count: normalizedCount };
				listChanged = true;
				didUpdate = true;
			}

			if (todo.subtasks?.length) {
				const updatedSubtasks = apply(todo.subtasks);
				if (updatedSubtasks !== todo.subtasks) {
					if (updatedTodo === todo) {
						updatedTodo = { ...updatedTodo };
					}
					updatedTodo.subtasks = updatedSubtasks;
					listChanged = true;
				}
			}

			return updatedTodo;
		});

		return listChanged ? updatedList : list;
	}

	const updatedTodos = apply(todos);
	if (didUpdate) {
		todos = updatedTodos;
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

	async function archiveCurrentList() {
		if (!currentList) return;

		const isPersonalList = currentList.name === 'My Tasks' && currentList.member_count === 1;
		if (isPersonalList) {
			alert('Cannot archive your personal list');
			return;
		}

		if (currentList.permission_level !== 'admin') {
			alert('Only list administrators can archive lists');
			return;
		}

		const confirmArchive = confirm(`Are you sure you want to archive "${currentList.name}"? You can restore it later from the archived lists.`);

		if (!confirmArchive) return;

		const response = await fetch('/api/lists', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ listId: currentList.id, action: 'archive' })
		});

		if (response.ok) {
			currentList = null;
			todos = [];
			await fetchLists();
			// Select first available list
			if (lists.length > 0) {
				await selectList(lists[0]);
			}
		} else {
			const error = await response.json();
			alert(error.error || 'Failed to archive list');
		}
	}

async function exportList(format) {
	if (!currentList) return;

	try {
		const response = await fetch(`/api/export/${format}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ listId: currentList.id })
			});

			if (!response.ok) {
				const error = await response.json();
				alert(error.error || `Failed to export as ${format.toUpperCase()}`);
				return;
			}

			// Handle different response types
			if (format === 'json') {
				const data = await response.json();
				const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${currentList.name}-export-${new Date().toISOString().split('T')[0]}.json`;
				a.click();
				URL.revokeObjectURL(url);
			} else {
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
					`${currentList.name}-export.${format}`;
				a.click();
				URL.revokeObjectURL(url);
			}

			showExportModal = false;
		} catch (error) {
			console.error('Export error:', error);
			alert('Failed to export list');
		}
}

function closeImportModal(resetFile = true) {
	showImportModal = false;
	importCreateNewList = false;
	importNewListName = '';

	if (resetFile) {
		importSelectedFileName = '';
		if (importFileInput) {
			importFileInput.value = '';
		}
	}
}

async function handleImport(event) {
	const fileInput = event.target;
	const file = fileInput.files?.[0];
	if (!file) return;

	importSelectedFileName = file.name ?? '';

		try {
			const formData = new FormData();
			formData.append('file', file);

			if (importCreateNewList && importNewListName.trim()) {
				formData.append('createNewList', 'true');
				formData.append('newListName', importNewListName.trim());
			} else {
				formData.append('listId', currentList.id);
			}

			const response = await fetch('/api/import', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				alert(error.error || 'Failed to import');
				return;
			}

			const result = await response.json();

			if (result.errors && result.errors.length > 0) {
				const errorMsg = `Imported ${result.importedCount} tasks with ${result.errors.length} errors:\n${result.errors.slice(0, 5).join('\n')}`;
				alert(errorMsg);
			} else {
				alert(`Successfully imported ${result.importedCount} tasks!`);
			}

			// Refresh the data
			await fetchLists();
			if (importCreateNewList && result.listId) {
				const newList = lists.find(l => l.id === result.listId);
				if (newList) {
					await selectList(newList);
				}
			} else {
				await fetchTodos();
			}

			// Reset form
			closeImportModal();
	} catch (error) {
		console.error('Import error:', error);
		alert('Failed to import file');
	} finally {
		if (fileInput) {
			fileInput.value = '';
		}
	}
}

	async function fetchArchivedLists() {
		const response = await fetch('/api/lists?archived=true');
		if (response.ok) {
			archivedLists = await response.json();
		}
	}

	async function restoreList(listId) {
		const response = await fetch('/api/lists', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ listId, action: 'restore' })
		});

		if (response.ok) {
			await fetchArchivedLists();
			await fetchLists();
			alert('List restored successfully!');
		} else {
			const error = await response.json();
			alert(error.error || 'Failed to restore list');
		}
	}

	async function permanentlyDeleteList(listId, listName) {
		const confirmDelete = confirm(`Are you sure you want to permanently delete "${listName}"? This action cannot be undone and will delete all tasks in this list.`);

		if (!confirmDelete) return;

		const response = await fetch('/api/lists', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ listId })
		});

		if (response.ok) {
			await fetchArchivedLists();
			alert('List permanently deleted');
		} else {
			const error = await response.json();
			alert(error.error || 'Failed to delete list');
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
			// Build recurrence pattern - for custom, format as "custom:N:unit"
			let recurrenceValue = null;
			if (isRecurringTask) {
				if (recurrencePattern === 'custom') {
					recurrenceValue = `custom:${customIntervalNumber}:${customIntervalUnit}`;
				} else {
					recurrenceValue = recurrencePattern;
				}
			}
			const dueDateValue = (newTodoMode === 'deadline' || newTodoMode === 'recurring') ? (newTodoDueDate || null) : null;
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
			resetNewTodoFields();
		}
	}
}

	async function toggleTodo(id, currentCompleted) {
		// Find the todo being toggled to check if it's recurring
		const todoBeingToggled = todos.find(t => t.id === id);
		const isRecurringTask = todoBeingToggled?.is_recurring;
		const isCompletingRecurring = isRecurringTask && !currentCompleted;

		// Store existing todo IDs before the toggle
		const existingIds = new Set(todos.map(t => t.id));

		// Add to completing set if we're in active filter and completing a recurring task
		if (isCompletingRecurring && filter === 'active') {
			const newSet = new Set(completingTodoIds);
			newSet.add(id);
			completingTodoIds = newSet;
		}

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

			// After fetching, detect new recurring tasks
			if (isCompletingRecurring && filter === 'active') {
				const newTodos = todos.filter(t => !existingIds.has(t.id) && t.is_recurring);
				if (newTodos.length > 0) {
					const newIds = new Set(newlyCreatedTodoIds);
					newTodos.forEach(t => newIds.add(t.id));
					newlyCreatedTodoIds = newIds;

					// Remove from newly created after animation (1.2 seconds)
					setTimeout(() => {
						const cleanedIds = new Set(newlyCreatedTodoIds);
						newTodos.forEach(t => cleanedIds.delete(t.id));
						newlyCreatedTodoIds = cleanedIds;
					}, 1200);
				}

				// Remove from completing set after completion animation (1 second)
				setTimeout(() => {
					const newSet = new Set(completingTodoIds);
					newSet.delete(id);
					completingTodoIds = newSet;
				}, 1000);
			}
		} else {
			const error = await response.json();

			// Revert the UI state by refetching
			await fetchTodos();

			if (error.error === 'Cannot complete parent task with incomplete subtasks') {
				alert('Cannot complete this task until all subtasks are completed.');
			} else {
				alert('Failed to update task: ' + (error.error || 'Unknown error'));
			}

			// Clean up completion tracking on error
			if (isCompletingRecurring && filter === 'active') {
				const newSet = new Set(completingTodoIds);
				newSet.delete(id);
				completingTodoIds = newSet;
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

function openMobileActionSheet(payload) {
	if (!payload?.todo) {
		return;
	}
	mobileActionSheet = {
		open: true,
		todoId: payload.todo.id,
		snapshot: payload.todo,
		actions: payload.actions ?? {}
	};
}

function closeMobileActionSheet() {
	mobileActionSheet = { open: false, todoId: null, snapshot: null, actions: {} };
}

async function handleMobileSheetAction(actionKey) {
	const todo = mobileActionTodo;
	if (!todo) {
		closeMobileActionSheet();
		return;
	}

	const actions = mobileActionSheet.actions ?? {};
	const handler = actions[actionKey];

	try {
		if (typeof handler === 'function') {
			const result = handler();
			if (result instanceof Promise) {
				await result;
			}
		} else {
			switch (actionKey) {
				case 'markComplete':
					await toggleTodo(todo.id, todo.completed);
					break;
				case 'deleteTodo':
					await deleteTodo(todo.id);
					break;
				case 'toggleExpanded':
					toggleExpanded(todo.id);
					break;
				case 'moveUp':
					await moveTodoUp(todo.id);
					break;
				case 'moveDown':
					await moveTodoDown(todo.id);
					break;
				default:
					break;
			}
		}
	} finally {
		closeMobileActionSheet();
	}
}

function registerTodoElement(id, element) {
	if (!id || !element) return;
	todoElementRegistry.set(id, element);
}

function unregisterTodoElement(id) {
	if (!id) return;
	todoElementRegistry.delete(id);
}

function cleanupMobileDragListeners() {
	if (typeof window === 'undefined') {
		return;
	}
	window.removeEventListener('pointermove', handleMobileDragMove);
	window.removeEventListener('pointerup', handleMobileDragEnd);
	window.removeEventListener('pointercancel', handleMobileDragEnd);
}

function startMobileDrag(payload, event) {
	if (!payload?.todo || sortMode !== 'manual') {
		return;
	}
	if (!hasCoarsePointer && !isMobile) {
		return;
	}
	if (payload.level !== 0) {
		return;
	}

	const index = filteredRootTodos.findIndex((item) => item.id === payload.todo.id);
	if (index === -1) {
		return;
	}

	event?.preventDefault?.();
	event?.stopPropagation?.();

	mobileDragState = {
		active: true,
		todoId: payload.todo.id,
		pointerId: event?.pointerId ?? null,
		startIndex: index,
		currentIndex: index
	};

	draggedTodo = payload.todo;
	dragOverTodo = payload.todo;

	window.addEventListener('pointermove', handleMobileDragMove, { passive: false });
	window.addEventListener('pointerup', handleMobileDragEnd);
	window.addEventListener('pointercancel', handleMobileDragEnd);
}

function updateMobileDragTarget(clientY) {
	if (!mobileDragState.active) {
		return;
	}

	const list = filteredRootTodos;
	if (!list.length) {
		return;
	}

	let targetIndex = list.findIndex((item) => {
		const element = todoElementRegistry.get(item.id);
		if (!element) return false;
		const rect = element.getBoundingClientRect();
		return clientY >= rect.top && clientY <= rect.bottom;
	});

	if (targetIndex === -1) {
		const firstElement = todoElementRegistry.get(list[0].id);
		const lastElement = todoElementRegistry.get(list[list.length - 1].id);
		if (firstElement) {
			const firstRect = firstElement.getBoundingClientRect();
			if (clientY < firstRect.top) {
				targetIndex = 0;
			}
		}
		if (targetIndex === -1 && lastElement) {
			const lastRect = lastElement.getBoundingClientRect();
			if (clientY > lastRect.bottom) {
				targetIndex = list.length - 1;
			}
		}
	}

	if (targetIndex !== -1 && targetIndex !== mobileDragState.currentIndex) {
		mobileDragState = {
			...mobileDragState,
			currentIndex: targetIndex
		};
		dragOverTodo = list[targetIndex];
	}
}

function handleMobileDragMove(event) {
	if (!mobileDragState.active) {
		return;
	}
	if (mobileDragState.pointerId != null && event.pointerId !== mobileDragState.pointerId) {
		return;
	}
	event.preventDefault();
	updateMobileDragTarget(event.clientY);
}

async function handleMobileDragEnd(event) {
	if (!mobileDragState.active) {
		return;
	}
	if (mobileDragState.pointerId != null && event.pointerId !== mobileDragState.pointerId) {
		return;
	}

	cleanupMobileDragListeners();

	const { startIndex, currentIndex } = mobileDragState;
	mobileDragState = {
		active: false,
		todoId: null,
		pointerId: null,
		startIndex: -1,
		currentIndex: -1
	};

	const list = filteredRootTodos;
	dragOverTodo = null;
	draggedTodo = null;
	dragOverTopZone = false;

	if (startIndex === -1 || currentIndex === -1 || startIndex === currentIndex) {
		return;
	}

	const newOrder = [...list];
	const [moved] = newOrder.splice(startIndex, 1);
	newOrder.splice(currentIndex, 0, moved);
	await submitReorder(newOrder);
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
	updateTodoCommentCount,
	updateTodoAssignee,
	uploadAttachment,
	removeAttachment,
	getListMembers: () => currentListMembers,
	getEditingUser: (todoId) => todoEditingState.get(todoId),
	getTypingUser: (todoId, field) => todoTypingState.get(`${todoId}:${field}`),
	currentListId: () => currentList?.id
});

setContext('mobile-enhancements', {
	isMobile: () => isMobile,
	hasCoarsePointer: () => hasCoarsePointer,
	cameraCaptureSupported: () => cameraCaptureSupported,
	isVoiceSupported: () => isVoiceSupported,
	toggleVoiceInput
});

setContext('mobile-action-sheet', {
	openActionSheet: openMobileActionSheet,
	closeActionSheet: closeMobileActionSheet
});

setContext('todo-dom-registry', {
	registerElement: registerTodoElement,
	unregisterElement: unregisterTodoElement
});

setContext('mobile-dnd', {
	startDrag: startMobileDrag
});

	function goToPrevious() {
		const reference = calendarReference;
		if (calendarViewMode === 'day') {
			const newDate = new Date(reference);
			newDate.setDate(reference.getDate() - 1);
			calendarReference = newDate;
		} else if (calendarViewMode === 'week') {
			const newDate = new Date(reference);
			newDate.setDate(reference.getDate() - 7);
			calendarReference = newDate;
		} else {
			calendarReference = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
		}
	}

	function goToNext() {
		const reference = calendarReference;
		if (calendarViewMode === 'day') {
			const newDate = new Date(reference);
			newDate.setDate(reference.getDate() + 1);
			calendarReference = newDate;
		} else if (calendarViewMode === 'week') {
			const newDate = new Date(reference);
			newDate.setDate(reference.getDate() + 7);
			calendarReference = newDate;
		} else {
			calendarReference = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
		}
	}

	function goToPreviousMonth() {
		const reference = calendarReference;
		calendarReference = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
	}

	function goToNextMonth() {
		const reference = calendarReference;
		calendarReference = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
	}

	function handleCalendarTaskDragStart(event, todoId) {
		draggedTodoId = todoId;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', todoId);
	}

	function handleCalendarTaskDragEnd() {
		draggedTodoId = null;
		draggedOverDate = null;
	}

	function handleCalendarDayDragOver(event, dateKey) {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		draggedOverDate = dateKey;
	}

	function handleCalendarDayDragLeave(event, dateKey) {
		// Only clear if we're leaving this specific date
		if (draggedOverDate === dateKey) {
			draggedOverDate = null;
		}
	}

	async function handleCalendarDayDrop(event, dateKey) {
		event.preventDefault();
		draggedOverDate = null;

		if (!draggedTodoId || !dateKey) return;

		const todoId = draggedTodoId;
		draggedTodoId = null;

		// Convert date key to ISO string for due date
		const newDueDate = new Date(dateKey + 'T12:00:00').toISOString();

		await updateTodoDueDate(todoId, newDueDate);
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
{#if !isMobile}
	<!-- Sidebar for lists -->
	<div id="sidebar-nav" class="sidebar">
		<div class="sidebar-header">
			<div class="sidebar-logo-section">
				<img src={logoPath} alt="Tido Logo" class="sidebar-logo" />
				<span class="logo-divider"></span>
				<h2>My Lists</h2>
			</div>
		</div>

		<button class="settings-btn" onclick={() => showSettingsModal = true} title="Settings">
			⚙️ Settings
		</button>

			<div class="lists">
				{#each lists as list (list.id)}
					<button
						class="list-item"
						class:active={currentList?.id === list.id}
						class:list-drop-target={dropTargetListId === list.id}
						onclick={() => selectList(list)}
						ondragover={(event) => handleListDragOver(event, list)}
						ondragleave={() => handleListDragLeave(list)}
						ondrop={(event) => handleListDrop(event, list)}
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

			<button class="add-list-btn" onclick={() => showNewListModal = true} title="Create new list" aria-label="Create new list">
				+ Add List
			</button>
		</div>

		{#if invitations.length > 0}
			<button class="invitations-btn" onclick={() => showInvitationsModal = true}>
				Invitations ({invitations.length})
			</button>
		{/if}

		<button class="archived-lists-btn" onclick={async () => { await fetchArchivedLists(); showArchivedListsModal = true; }}>
			Archived Lists
		</button>
	</div>
{/if}

	<!-- Main content -->
	<div
	class={['main-content', isMobile && 'main-content-mobile']}
	bind:this={mainContentEl}
	style={`transform: translateY(${isMobile ? pullOffset : 0}px); --pull-offset: ${pullOffset}px;`}
	class:pulling={isPulling || isRefreshing}
	ontouchstart={handlePullStart}
	ontouchend={handlePullEnd}
	ontouchcancel={handlePullEnd}
	>
		{#if isMobile}
			<div class="pull-indicator" aria-live="polite">
				<span>{isRefreshing ? 'Refreshing…' : pullStatus}</span>
			</div>
		{/if}
		<div class="header">
			{#if isMobile}
				<button class="mobile-menu-btn" onclick={() => showMobileMenu = true} aria-label="Open menu">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="3" y1="6" x2="21" y2="6"></line>
						<line x1="3" y1="12" x2="21" y2="12"></line>
						<line x1="3" y1="18" x2="21" y2="18"></line>
					</svg>
				</button>
			{/if}
			<div class="header-left">
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
			</div>
			<div class="header-actions">
				<button class="theme-toggle" onclick={toggleDarkMode} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
					{darkMode ? '☀️' : '🌙'}
				</button>
				<button class="logout-btn" onclick={handleLogout}>Logout</button>
			</div>
		</div>

		{#if isMobile}
			<div class="mobile-header-controls">
				<div class="mobile-list-select">
					<label for="mobile-list">Current list</label>
					<select id="mobile-list" onchange={handleMobileListChange} aria-label="Select active list">
						{#if !currentList}
							<option value="" disabled selected>Select a list</option>
						{/if}
						{#each lists as list (list.id)}
							<option value={list.id} selected={currentList?.id === list.id}>{list.name}</option>
						{/each}
					</select>
				</div>
			</div>
		{/if}

	{#if currentList}
		{#if isMobile}
			<section class="mobile-hero">
				<div class="mobile-hero-heading">
					<h1>{currentList.name}</h1>
					<p class="mobile-hero-caption">
						{currentList.member_count === 1 ? 'Personal list' : `${currentList.member_count} members`} · {activeTodoCount} active · {completedTodoCount} done
					</p>
				</div>
				<div class="mobile-hero-stats">
					<span class="mobile-stat-chip">
						<strong>{activeTodoCount}</strong>
						<span>Active</span>
					</span>
					<span class="mobile-stat-chip">
						<strong>{completedTodoCount}</strong>
						<span>Done</span>
					</span>
					<span class="mobile-stat-chip">
						<strong>{totalTodoCount}</strong>
						<span>Total</span>
					</span>
				</div>
				<div class="mobile-quick-actions">
					<button type="button" class="mobile-action primary" onclick={() => { newTodoInputEl?.focus(); }}>
						<span>+ Task</span>
					</button>
					<button type="button" class="mobile-action" onclick={() => showCalendarModal = true}>
						<span>Calendar</span>
					</button>
					<button type="button" class="mobile-action" onclick={openRecentlyDeleted}>
						<span>Deleted</span>
					</button>
				</div>
				<div class="mobile-secondary-actions">
					<button type="button" class="export-btn-mobile" onclick={() => showExportModal = true}>Export</button>
					<button type="button" class="import-btn-mobile" onclick={() => showImportModal = true}>Import</button>
				{#if currentList.permission_level === 'admin' && !(currentList.name === 'My Tasks' && currentList.member_count === 1)}
						<button type="button" class="invite-btn-mobile" onclick={() => showInviteModal = true}>Invite</button>
						<button type="button" class="archive-list-btn" onclick={archiveCurrentList}>Archive</button>
				{/if}
			</div>
			</section>
		{:else}
			<div class="list-header">
				<h1>{currentList.name}</h1>
				<div class="list-actions">
					<button class="calendar-btn" onclick={() => showCalendarModal = true}>
						Calendar View
					</button>
					<button class="recently-deleted-btn" onclick={openRecentlyDeleted}>
						Recently Deleted
					</button>
					<button class="export-btn" onclick={() => showExportModal = true}>
						Export
					</button>
					<button class="import-btn" onclick={() => showImportModal = true}>
						Import
					</button>
					{#if currentList.permission_level === 'admin' && !(currentList.name === 'My Tasks' && currentList.member_count === 1)}
						<button class="invite-btn" onclick={() => showInviteModal = true}>
							Invite Users
						</button>
						<button class="archive-list-btn" onclick={archiveCurrentList}>
							Archive List
						</button>
					{/if}
				</div>
			</div>
		{/if}
	{:else}
		<h1>No lists available</h1>
		<p>Create a new list to get started!</p>
	{/if}

	<div class="input-section">
		<div class="input-with-tools">
			<input
				type="text"
				bind:value={newTodoText}
				bind:this={newTodoInputEl}
				onkeypress={handleKeyPress}
				placeholder="What needs to be done?"
				autocomplete="off"
				enterkeyhint="done"
			/>
		</div>
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
					<option value="biweekly">Biweekly (Every 2 weeks)</option>
					<option value="monthly">Monthly</option>
					<option value="yearly">Yearly</option>
					<option value="custom">Custom interval...</option>
				</select>
			</label>
			{#if recurrencePattern === 'custom'}
				<div class="custom-interval-inputs">
					<label class="custom-interval-number">
						<span>Every</span>
						<input type="number" bind:value={customIntervalNumber} min="1" max="999" />
					</label>
					<label class="custom-interval-unit">
						<span>Unit</span>
						<select bind:value={customIntervalUnit}>
							<option value="days">Days</option>
							<option value="weeks">Weeks</option>
							<option value="months">Months</option>
							<option value="years">Years</option>
						</select>
					</label>
				</div>
			{/if}
			<label class="due-date-field">
				<span>First due date</span>
				<input type="datetime-local" bind:value={newTodoDueDate} />
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

	<div class="filters-scroll">
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
			<div class="display-style-toggle">
				<button
					type="button"
					class="display-style-btn"
					class:active={displayStyle === 'list'}
					onclick={() => (displayStyle = 'list')}
					aria-label="List view"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<line x1="3" y1="4" x2="13" y2="4"/>
						<line x1="3" y1="8" x2="13" y2="8"/>
						<line x1="3" y1="12" x2="13" y2="12"/>
					</svg>
				</button>
				<button
					type="button"
					class="display-style-btn"
					class:active={displayStyle === 'compact'}
					onclick={() => (displayStyle = 'compact')}
					aria-label="Compact view"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<rect x="2" y="2" width="5" height="5" rx="1"/>
						<rect x="9" y="2" width="5" height="5" rx="1"/>
						<rect x="2" y="9" width="5" height="5" rx="1"/>
						<rect x="9" y="9" width="5" height="5" rx="1"/>
					</svg>
				</button>
			</div>
			{#if sortMode !== 'manual' && displayStyle === 'list'}
				<span class="sort-inline-hint">Return to Custom to drag & drop.</span>
			{/if}
		</div>
	</div>

	{#if displayStyle === 'list'}
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
				<div class:newly-created-todo={newlyCreatedTodoIds.has(todo.id)}>
					<TodoItem
						{todo}
						level={0}
						currentUserId={data.user.id}
						onDragStart={sortMode === 'manual' ? handleDragStart : null}
						onDragOver={sortMode === 'manual' ? handleDragOver : null}
						onDrop={sortMode === 'manual' ? handleDrop : null}
						onDragEnd={sortMode === 'manual' ? handleDragEnd : null}
						dragIntentTargetId={dragIntent.targetId}
						dragIntentType={dragIntent.type}
						isDragging={sortMode === 'manual' && draggedTodo?.id === todo.id}
						isDragOver={sortMode === 'manual' && dragOverTodo?.id === todo.id}
					/>
				</div>
			{/each}
		</ul>
		{:else}
			<p class="empty">No todos to display</p>
		{/if}

		<div class="footer">
			<span>{remainingCount} {remainingCount === 1 ? 'item' : 'items'} left</span>
		</div>
	{:else if displayStyle === 'compact'}
		<MindMapView nodes={mindMapNodes} emptyMessage="No tasks to display" />
		<div class="alt-footer">
			<span>{totalTodoCount} total • {activeTodoCount} active • {completedTodoCount} done</span>
		</div>
	{/if}
{/if}
	</div>
</div>

<MobileActionSheet
	isOpen={mobileActionSheet.open && Boolean(mobileActionTodo)}
	todo={mobileActionTodo}
	showNotesToggle={Boolean(mobileActionSheet.actions?.toggleNotes)}
	showEditAction={Boolean(mobileActionSheet.actions?.startEditingText)}
	canMoveUp={(() => {
		if (sortMode !== 'manual' || !mobileActionTodo) return false;
		const parentId = mobileActionTodo.parent_todo_id ?? null;
		const siblings = sortByOrder(todos.filter((t) => (t.parent_todo_id ?? null) === parentId));
		const index = siblings.findIndex((t) => t.id === mobileActionTodo.id);
		return index > 0;
	})()}
	canMoveDown={(() => {
		if (sortMode !== 'manual' || !mobileActionTodo) return false;
		const parentId = mobileActionTodo.parent_todo_id ?? null;
		const siblings = sortByOrder(todos.filter((t) => (t.parent_todo_id ?? null) === parentId));
		const index = siblings.findIndex((t) => t.id === mobileActionTodo.id);
		return index !== -1 && index < siblings.length - 1;
	})()}
	on:close={closeMobileActionSheet}
	on:toggle-complete={() => handleMobileSheetAction('markComplete')}
	on:toggle-notes={() => handleMobileSheetAction('toggleNotes')}
	on:toggle-expanded={() => handleMobileSheetAction('toggleExpanded')}
	on:edit={() => handleMobileSheetAction('startEditingText')}
	on:delete={() => handleMobileSheetAction('deleteTodo')}
	on:move-up={() => handleMobileSheetAction('moveUp')}
	on:move-down={() => handleMobileSheetAction('moveDown')}
/>

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
				<button class="calendar-nav" onclick={goToPrevious} aria-label="Previous">‹</button>
				<div class="calendar-header-center">
					<h2>{calendarLabel}</h2>
					<div class="calendar-view-modes">
						<button
							class="view-mode-btn"
							class:active={calendarViewMode === 'month'}
							onclick={() => calendarViewMode = 'month'}
						>
							Month
						</button>
						<button
							class="view-mode-btn"
							class:active={calendarViewMode === 'week'}
							onclick={() => calendarViewMode = 'week'}
						>
							Week
						</button>
						<button
							class="view-mode-btn"
							class:active={calendarViewMode === 'day'}
							onclick={() => calendarViewMode = 'day'}
						>
							Day
						</button>
					</div>
				</div>
				<button class="calendar-nav" onclick={goToNext} aria-label="Next">›</button>
			</div>
			{#if calendarViewMode === 'month'}
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
										class:drag-over={draggedOverDate === day.key}
										ondragover={(e) => handleCalendarDayDragOver(e, day.key)}
										ondragleave={(e) => handleCalendarDayDragLeave(e, day.key)}
										ondrop={(e) => handleCalendarDayDrop(e, day.key)}
									>
										<div class="calendar-day-header">
											<div class="calendar-day-number">{day.date.getDate()}</div>
							{#if day.todos.length > 0}
								<div class="calendar-day-indicators">
									{#if day.priorityCounts.high > 0}
										<span class="priority-indicator high" title="{day.priorityCounts.high} high priority task{day.priorityCounts.high > 1 ? 's' : ''}"></span>
									{/if}
									{#if day.priorityCounts.medium > 0}
										<span class="priority-indicator medium" title="{day.priorityCounts.medium} medium priority task{day.priorityCounts.medium > 1 ? 's' : ''}"></span>
									{/if}
									{#if day.priorityCounts.low > 0}
										<span class="priority-indicator low" title="{day.priorityCounts.low} low priority task{day.priorityCounts.low > 1 ? 's' : ''}"></span>
									{/if}
								</div>
							{/if}
										</div>
										<ul class="calendar-todo-list">
										{#each day.todos.slice(0, 3) as dayTodo (dayTodo.id)}
											<li
												draggable="true"
												ondragstart={(e) => handleCalendarTaskDragStart(e, dayTodo.id)}
												ondragend={handleCalendarTaskDragEnd}
												class:completed={dayTodo.completed}
												class:overdue-item={isTodoOverdue(dayTodo)}
												class:priority-high={resolvePriorityKey(dayTodo.priority) === 'high'}
												class:priority-medium={resolvePriorityKey(dayTodo.priority) === 'medium'}
												class:priority-low={resolvePriorityKey(dayTodo.priority) === 'low'}
												class:dragging={draggedTodoId === dayTodo.id}
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
			{:else if calendarViewMode === 'week'}
				<div class="calendar-week-view">
					<div class="calendar-weekdays">
						{#each weekdayLabels as label}
							<div class="calendar-weekday">{label}</div>
						{/each}
					</div>
					<div class="calendar-week">
						{#each calendarWeekView as day (day.key)}
							<div
								class="calendar-day"
								class:today={day.isToday}
								class:has-todos={day.todos.length > 0}
								class:overdue-day={day.hasOverdue}
								class:drag-over={draggedOverDate === day.key}
								ondragover={(e) => handleCalendarDayDragOver(e, day.key)}
								ondragleave={(e) => handleCalendarDayDragLeave(e, day.key)}
								ondrop={(e) => handleCalendarDayDrop(e, day.key)}
							>
								<div class="calendar-day-header">
									<div class="calendar-day-number">{day.date.getDate()}</div>
							{#if day.todos.length > 0}
								<div class="calendar-day-indicators">
									{#if day.priorityCounts.high > 0}
										<span class="priority-indicator high" title="{day.priorityCounts.high} high priority task{day.priorityCounts.high > 1 ? 's' : ''}"></span>
									{/if}
									{#if day.priorityCounts.medium > 0}
										<span class="priority-indicator medium" title="{day.priorityCounts.medium} medium priority task{day.priorityCounts.medium > 1 ? 's' : ''}"></span>
									{/if}
									{#if day.priorityCounts.low > 0}
										<span class="priority-indicator low" title="{day.priorityCounts.low} low priority task{day.priorityCounts.low > 1 ? 's' : ''}"></span>
									{/if}
								</div>
							{/if}
								</div>
								<ul class="calendar-todo-list">
								{#each day.todos as dayTodo (dayTodo.id)}
									<li
										draggable="true"
										ondragstart={(e) => handleCalendarTaskDragStart(e, dayTodo.id)}
										ondragend={handleCalendarTaskDragEnd}
										class:completed={dayTodo.completed}
										class:overdue-item={isTodoOverdue(dayTodo)}
										class:priority-high={resolvePriorityKey(dayTodo.priority) === 'high'}
										class:priority-medium={resolvePriorityKey(dayTodo.priority) === 'medium'}
										class:priority-low={resolvePriorityKey(dayTodo.priority) === 'low'}
										class:dragging={draggedTodoId === dayTodo.id}
									>
										{dayTodo.text}
									</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</div>
			{:else if calendarViewMode === 'day'}
				<div class="calendar-day-view">
					<div
						class="calendar-day-full"
						class:today={calendarDayView.isToday}
						class:drag-over={draggedOverDate === calendarDayView.key}
						ondragover={(e) => handleCalendarDayDragOver(e, calendarDayView.key)}
						ondragleave={(e) => handleCalendarDayDragLeave(e, calendarDayView.key)}
						ondrop={(e) => handleCalendarDayDrop(e, calendarDayView.key)}
					>
						{#if calendarDayView.todos.length > 0}
							<ul class="calendar-todo-list-full">
							{#each calendarDayView.todos as dayTodo (dayTodo.id)}
								<li
									draggable="true"
									ondragstart={(e) => handleCalendarTaskDragStart(e, dayTodo.id)}
									ondragend={handleCalendarTaskDragEnd}
									class:completed={dayTodo.completed}
									class:overdue-item={isTodoOverdue(dayTodo)}
									class:priority-high={resolvePriorityKey(dayTodo.priority) === 'high'}
									class:priority-medium={resolvePriorityKey(dayTodo.priority) === 'medium'}
									class:priority-low={resolvePriorityKey(dayTodo.priority) === 'low'}
									class:dragging={draggedTodoId === dayTodo.id}
								>
									<span class="task-priority-badge" class:high={resolvePriorityKey(dayTodo.priority) === 'high'} class:medium={resolvePriorityKey(dayTodo.priority) === 'medium'} class:low={resolvePriorityKey(dayTodo.priority) === 'low'}></span>
									{dayTodo.text}
								</li>
							{/each}
							</ul>
						{:else}
							<p class="no-tasks">No tasks for this day</p>
						{/if}
					</div>
				</div>
			{/if}
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

{#if showArchivedListsModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close archived lists modal"
		onclick={() => showArchivedListsModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showArchivedListsModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="archived-lists-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="archived-lists-title">Archived Lists</h2>
			{#if archivedLists.length === 0}
				<p class="empty-message">No archived lists</p>
			{:else}
				<div class="archived-lists-container">
					{#each archivedLists as list (list.id)}
						<div class="archived-list-item">
							<div class="archived-list-info">
								<strong>{list.name}</strong>
								{#if list.member_count > 1}
									<span class="member-count">{list.member_count} members</span>
								{/if}
								<span class="archived-date">Archived {new Date(list.archived_at).toLocaleDateString()}</span>
							</div>
							<div class="archived-list-actions">
								<button class="btn-restore" onclick={() => restoreList(list.id)}>Restore</button>
								{#if list.permission_level === 'admin'}
									<button class="btn-delete-permanent" onclick={() => permanentlyDeleteList(list.id, list.name)}>Delete</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showArchivedListsModal = false}>Close</button>
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
			<p class="deleted-info">Deleted or auto-archived items are kept for 7 days before being permanently removed.</p>

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

{#if showExportModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		aria-label="Close export modal"
		onclick={() => showExportModal = false}
		onkeydown={(event) => handleOverlayKey(event, () => showExportModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="export-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="export-title">Export List</h2>
			<p class="modal-description">Choose a format to export "{currentList.name}"</p>

			<div class="modal-section">
				<h3 class="modal-subheading">Choose export format</h3>
				<div class="modal-option-grid">
					<button
						type="button"
						class="modal-option-btn"
						data-variant="json"
						onclick={() => exportList('json')}
					>
						<div class="modal-option-icon" aria-hidden="true">📄</div>
						<div class="modal-option-copy">
							<span class="modal-option-title">JSON</span>
							<span class="modal-option-description">Full data with all metadata</span>
						</div>
						<span class="modal-option-cta">Download</span>
					</button>

					<button
						type="button"
						class="modal-option-btn"
						data-variant="csv"
						onclick={() => exportList('csv')}
					>
						<div class="modal-option-icon" aria-hidden="true">📊</div>
						<div class="modal-option-copy">
							<span class="modal-option-title">CSV</span>
							<span class="modal-option-description">Spreadsheet compatible</span>
						</div>
						<span class="modal-option-cta">Download</span>
					</button>

					<button
						type="button"
						class="modal-option-btn"
						data-variant="pdf"
						onclick={() => exportList('pdf')}
					>
						<div class="modal-option-icon" aria-hidden="true">📋</div>
						<div class="modal-option-copy">
							<span class="modal-option-title">PDF</span>
							<span class="modal-option-description">Printable document</span>
						</div>
						<span class="modal-option-cta">Download</span>
					</button>
				</div>
			</div>

			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => showExportModal = false}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

{#if showImportModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
	aria-label="Close import modal"
	onclick={() => closeImportModal()}
	onkeydown={(event) => handleOverlayKey(event, () => closeImportModal())}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="import-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<h2 id="import-title">Import Tasks</h2>
			<p class="modal-description">Import tasks from JSON or CSV file</p>

			<div class="modal-section">
				<h3 class="modal-subheading">Destination</h3>
				<label class="modal-checkbox-card">
					<input
						type="checkbox"
						class="modal-checkbox-control"
						bind:checked={importCreateNewList}
					/>
					<div class="modal-option-copy">
						<span class="modal-option-title">Create a new list</span>
						<span class="modal-option-description">
							Keep imported tasks separate from "{currentList?.name ?? 'your current list'}"
						</span>
					</div>
				</label>

				{#if importCreateNewList}
					<label class="modal-input-field" for="import-new-list-name">
						<span class="modal-option-title">New list name</span>
						<input
							id="import-new-list-name"
							type="text"
							class="modal-input"
							bind:value={importNewListName}
							placeholder="Enter list name"
						/>
					</label>
				{/if}
			</div>

			<div class="modal-section">
				<h3 class="modal-subheading">Source file</h3>
				<button
					type="button"
					class="file-drop"
					onclick={() => {
						if (importFileInput) {
							importFileInput.click();
						}
					}}
					aria-label={importSelectedFileName
						? `Replace ${importSelectedFileName}`
						: 'Choose a JSON or CSV file to import'}
				>
					<div class="file-drop-icon" aria-hidden="true">📥</div>
					<div class="modal-option-copy">
						<span class="modal-option-title">
							{importSelectedFileName || 'Choose a JSON or CSV file'}
						</span>
						<span class="modal-option-description">
							{importSelectedFileName
								? 'Select a different file to replace this upload'
								: 'Drag & drop or click to browse'}
						</span>
					</div>
					<span class="file-drop-action">Browse</span>
				</button>
				<input
					id="import-file-input"
					class="file-input-hidden"
					type="file"
					accept=".json,.csv"
					onchange={handleImport}
					bind:this={importFileInput}
					tabindex="-1"
					aria-hidden="true"
				/>
				<p class="modal-footnote">
					Supported formats: JSON, CSV
					<br />
					{#if importCreateNewList}
						The new list will appear in your sidebar.
					{:else}
						Tasks will be added to "{currentList?.name ?? 'your selected list'}".
					{/if}
				</p>
			</div>

			<div class="modal-actions">
				<button class="btn-secondary" onclick={() => closeImportModal()}>Cancel</button>
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

				{#if showThemeBuilder}
					<ThemeBuilder
						onSave={handleSaveTheme}
						onCancel={() => { showThemeBuilder = false; editingTheme = null; }}
						editingTheme={editingTheme}
					/>
				{:else}
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
							<optgroup label="Built-in Themes">
						{#each Object.entries(themes) as [key, theme]}
							<option value={key}>{theme.name}</option>
						{/each}
					</optgroup>
					{#if customThemes.length > 0}
						<optgroup label="Custom Themes">
							{#each customThemes as [key, theme]}
								<option value={key}>{theme.name}</option>
							{/each}
								</optgroup>
							{/if}
						</select>
					</div>

					<div class="theme-actions">
						<button
							type="button"
							class="btn-secondary btn-small"
							onclick={() => showThemeBuilder = true}
						>
							+ Create Theme
						</button>
						<button
							type="button"
							class="btn-secondary btn-small"
							onclick={handleImportTheme}
					>
						Import Theme
					</button>
					{#if currentThemeData}
						<button
							type="button"
							class="btn-secondary btn-small"
							onclick={() => handleExportTheme(currentTheme)}
							>
								Export Current
							</button>
							{#if currentThemeData.custom}
								<button
									type="button"
									class="btn-danger btn-small"
									onclick={() => handleDeleteTheme(currentTheme)}
								>
									Delete
								</button>
							{/if}
						{/if}
					</div>
				{/if}

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

			<div class="settings-section">
				<h3>Typography</h3>

				<div class="setting-item">
					<label for="font-scale-select">
						<span class="setting-label">Font Size</span>
						<span class="setting-description">Scale interface text for comfort</span>
					</label>
					<select
						id="font-scale-select"
						class="setting-select"
						bind:value={currentFontScale}
						onchange={() => changeFontScale(currentFontScale)}
					>
						{#each Object.entries(fontScales) as [key, scale]}
							<option value={key}>{scale.name}</option>
						{/each}
					</select>
				</div>

				<div class="setting-item">
					<label for="font-family-select">
						<span class="setting-label">Font Family</span>
						<span class="setting-description">Choose the typeface used across the app</span>
					</label>
					<select
						id="font-family-select"
						class="setting-select"
						bind:value={currentFontFamily}
						onchange={() => changeFontFamily(currentFontFamily)}
					>
						{#each Object.entries(fontFamilies) as [key, family]}
							<option value={key}>{family.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="settings-section">
				<h3>Task Defaults</h3>

				<div class="setting-item">
					<label for="default-priority-select">
						<span class="setting-label">Default Priority</span>
						<span class="setting-description">Set the priority assigned to new tasks</span>
					</label>
					<select
						id="default-priority-select"
						class="setting-select"
						value={defaultTaskPriorityPreference}
						onchange={(event) => {
							const previous = defaultTaskPriorityPreference;
							const next = event.currentTarget.value;
							defaultTaskPriorityPreference = next;
							updateTaskDefaults({ defaultTaskPriority: next }, () => {
								defaultTaskPriorityPreference = previous;
							});
						}}
					>
						{#each ['high', 'medium', 'low'] as level}
							<option value={level}>{PRIORITY_LABELS[level]}</option>
						{/each}
					</select>
				</div>

				<div class="setting-item">
					<label for="default-due-offset">
						<span class="setting-label">Default Due Date Offset</span>
						<span class="setting-description">Automatically add a due date this many days after creation (0 to disable)</span>
					</label>
					<input
						id="default-due-offset"
						class="setting-input"
						type="number"
						min="0"
						max="365"
						value={defaultTaskDueOffset}
						onchange={(event) => {
							const value = event.currentTarget.value;
							const previous = defaultTaskDueOffset;
							const numeric = value === '' ? 0 : Math.max(0, Math.trunc(Number(value)));
							defaultTaskDueOffset = numeric;
							updateTaskDefaults({ defaultTaskDueOffsetDays: numeric }, () => {
								defaultTaskDueOffset = previous;
							});
						}}
					/>
				</div>

				<div class="setting-item">
					<label for="default-reminder-minutes">
						<span class="setting-label">Default Reminder</span>
						<span class="setting-description">Send a reminder this many minutes before (leave blank for none)</span>
					</label>
					<input
						id="default-reminder-minutes"
						class="setting-input"
						type="number"
						min="0"
						max="10080"
						step="5"
						value={defaultTaskReminderMinutes ?? ''}
						placeholder="None"
						onchange={(event) => {
							const value = event.currentTarget.value;
							const previous = defaultTaskReminderMinutes;
							const normalized = value === '' ? null : Math.max(0, Math.trunc(Number(value)));
							defaultTaskReminderMinutes = normalized;
							updateTaskDefaults({ defaultTaskReminderMinutes: normalized }, () => {
								defaultTaskReminderMinutes = previous ?? null;
							});
						}}
					/>
				</div>
			</div>

			<div class="settings-section">
				<h3>Automation</h3>

				<div class="setting-item">
					<label for="auto-archive-days">
						<span class="setting-label">Auto-Archive Completed Tasks</span>
						<span class="setting-description">Move completed tasks to the Recently Archived view after this many days (0 disables)</span>
					</label>
					<input
						id="auto-archive-days"
						class="setting-input"
						type="number"
						min="0"
						max="365"
						value={autoArchiveDaysPreference}
						onchange={(event) => {
							const value = event.currentTarget.value;
							const previous = autoArchiveDaysPreference;
							const numeric = value === '' ? 0 : Math.max(0, Math.trunc(Number(value)));
							autoArchiveDaysPreference = numeric;
							updateAutoArchiveDays(numeric, () => {
								autoArchiveDaysPreference = previous;
							});
						}}
					/>
				</div>
			</div>

			<div class="settings-section">
				<h3>Calendar</h3>

				<div class="setting-item">
					<label for="week-start-select">
						<span class="setting-label">Week Starts On</span>
						<span class="setting-description">Control how the calendar grid is arranged</span>
					</label>
					<select
						id="week-start-select"
						class="setting-select"
						value={weekStartPreference}
						onchange={(event) => {
							const previous = weekStartPreference;
							const next = event.currentTarget.value;
							weekStartPreference = next;
							updateWeekStart(next, () => {
								weekStartPreference = previous;
							});
						}}
					>
						<option value="sunday">Sunday</option>
						<option value="monday">Monday</option>
					</select>
				</div>
			</div>

			<div class="modal-actions">
				<button class="btn-primary" onclick={() => showSettingsModal = false}>Done</button>
			</div>
		</div>
	</div>
{/if}

{#if showMobileMenu}
	<div class="mobile-menu-overlay" onclick={() => showMobileMenu = false}>
		<nav class="mobile-menu" onclick={(e) => e.stopPropagation()}>
			<div class="mobile-menu-header">
				<div class="mobile-menu-logo">
					<img src={logoPath} alt="Tido Logo" class="mobile-menu-logo-img" />
					<h2>Tido</h2>
				</div>
				<button class="mobile-menu-close" onclick={() => showMobileMenu = false} aria-label="Close menu">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="mobile-menu-section">
				<h3>My Lists</h3>
				<div class="mobile-menu-lists">
						{#each lists as list (list.id)}
							<button
								class="mobile-menu-list-item"
								class:list-drop-target={dropTargetListId === list.id}
								class:active={currentList?.id === list.id}
								onclick={() => { selectList(list); showMobileMenu = false; }}
								ondragover={(event) => handleListDragOver(event, list)}
								ondragleave={() => handleListDragLeave(list)}
								ondrop={(event) => handleListDrop(event, list)}
							>
								<span class="mobile-menu-list-name">{list.name}</span>
								{#if list.member_count > 1}
									<span class="mobile-menu-member-count">{list.member_count}</span>
								{/if}
						</button>
					{/each}
				</div>
				<button class="mobile-menu-action-btn" onclick={() => { showNewListModal = true; showMobileMenu = false; }}>
					+ Create New List
				</button>
			</div>

			{#if invitations.length > 0}
				<button class="mobile-menu-invitations" onclick={() => { showInvitationsModal = true; showMobileMenu = false; }}>
					Invitations ({invitations.length})
				</button>
			{/if}

			<div class="mobile-menu-section">
				{#if data.user.is_admin}
					<a href="/admin" class="mobile-menu-action-btn admin-dashboard-btn">
						Admin Dashboard
					</a>
				{/if}
				<button class="mobile-menu-action-btn" onclick={() => { fetchArchivedLists(); showArchivedListsModal = true; showMobileMenu = false; }}>
					Archived Lists
				</button>
				<button class="mobile-menu-action-btn" onclick={() => { showSettingsModal = true; showMobileMenu = false; }}>
					⚙️ Settings
				</button>
			</div>
		</nav>
	</div>
{/if}

<style>
:global(html) {
	box-sizing: border-box;
	width: 100%;
	font-size: var(--app-base-font-size, 16px);
}

:global(*),
:global(*::before),
:global(*::after) {
	box-sizing: inherit;
}

:global(body) {
	margin: 0;
	padding: 0;
	/* Fallback for when CSS variable isn't set yet (Aurora theme) */
	background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 33%, #06b6d4 66%, #10b981 100%);
	background-image: var(--color-background);
	background-attachment: fixed;
	min-height: 100vh;
	font-family: var(
		--app-font-family,
		-apple-system,
		BlinkMacSystemFont,
		'Segoe UI',
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		sans-serif
	);
	line-height: var(--app-body-line-height, 1.5);
	overflow-x: hidden;
}

	.app-container {
		display: flex;
		min-height: 100vh;
		gap: 0;
		width: 100%;
		overflow-x: hidden;
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

	.sidebar-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 1rem;
	}

	.sidebar-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: var(--color-text, #2c3e50);
		white-space: nowrap;
	}

	.sidebar-logo-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sidebar-logo {
		height: 24px;
		width: auto;
		object-fit: contain;
	}

	.logo-divider {
		width: 1px;
		height: 20px;
		background: var(--color-border, #e2e6ff);
		margin: 0 0.25rem;
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

	.main-content-mobile {
		max-width: none;
		margin: 0;
		width: 100%;
		border-radius: 0;
		box-shadow: none;
		padding: 1.25rem 1rem 3rem;
		box-sizing: border-box;
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

	.list-item.list-drop-target {
		border-color: var(--color-primary, #667eea);
		background: rgba(102, 126, 234, 0.15);
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

	.add-list-btn {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-primary, #667eea);
		color: white;
		border: 2px solid transparent;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 1rem;
		text-align: center;
	}

	.add-list-btn:hover {
		background: var(--color-primary-hover, #5568d3);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
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

	@media (max-width: 1024px) {
		.app-container {
			flex-direction: column;
		}

		.sidebar-header-actions .icon-btn {
			width: 36px;
			height: 36px;
		}

		.main-content {
			max-width: none;
			margin: 0;
			width: 100%;
			border-radius: 0;
			box-shadow: none;
			padding: 1.25rem 1rem 3rem;
		}

		.header {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: nowrap;
		}

		.header-left {
			flex: 0 0 auto;
		}

		.header-actions {
			flex: 0 0 auto;
			justify-content: flex-start;
			gap: 0.5rem;
		}

		.user-info {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: nowrap;
		}

		.user-info .welcome {
			display: none;
		}

		.user-info .admin-link {
			display: none;
		}

		.connection-status {
			display: none;
		}

		.theme-toggle,
		.logout-btn {
			font-size: 0.85rem;
			padding: 0.5rem 0.75rem;
		}

		.list-actions {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.input-section {
			flex-direction: column;
			align-items: stretch;
			gap: 0.85rem;
		}

		.input-section button {
			width: 100%;
		}

		.filters-scroll {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			padding-bottom: 0.5rem;
		}

		.filters {
			flex-wrap: nowrap;
			gap: 0.65rem;
			justify-content: flex-start;
		}

		.filters button {
			flex: 0 0 auto;
		}

		.task-options-row,
		.recurring-options,
		.due-date-options {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.todo-list {
			padding-bottom: 1.5rem;
		}
	}

	@media (max-width: 640px) {
		.header {
			gap: 0.75rem;
		}

		.mobile-header-controls {
			margin-bottom: 1rem;
		}

		h1 {
			text-align: left;
			font-size: 2.2rem;
		}

		.list-header h1 {
			font-size: 2.15rem;
		}

		.sort-toolbar {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}

		.sort-inline {
			flex-direction: column;
			align-items: stretch;
			width: 100%;
			gap: 0.5rem;
		}

		.display-style-toggle {
			margin-left: 0;
			align-self: flex-start;
		}

		.sort-inline-hint {
			flex-basis: auto;
		}

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
		position: relative;
		transition: transform 0.2s ease;
		will-change: transform;
		touch-action: pan-y;
		box-sizing: border-box;
		line-height: 1.6;
	}

	.main-content.pulling {
		transition: none;
	}

	.pull-indicator {
		position: absolute;
		top: -48px;
		left: 50%;
		transform: translate(-50%, calc(-100% + min(48px, var(--pull-offset, 0px))));
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease, transform 0.2s ease;
	}

	.main-content.pulling .pull-indicator,
	.pull-indicator:global(.active) {
		opacity: 1;
	}

	.list-header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.list-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
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

	.export-btn,
	.import-btn,
	.invite-btn,
	.archive-list-btn {
		padding: 0.5rem 1rem;
		border: 2px solid transparent;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.export-btn {
		background: #f0f0f0;
		color: #27ae60;
		border-color: #27ae60;
	}

	.export-btn:hover {
		background: #27ae60;
		color: white;
	}

	.import-btn {
		background: #f0f0f0;
		color: #3498db;
		border-color: #3498db;
	}

	.import-btn:hover {
		background: #3498db;
		color: white;
	}

	.invite-btn {
		background: var(--color-primary, #667eea);
		color: white;
		border-color: var(--color-primary, #667eea);
	}

	.invite-btn:hover {
		background: transparent;
		color: var(--color-primary, #667eea);
	}

	.archive-list-btn {
		background: #f0f0f0;
		color: #e67e22;
		border-color: #e67e22;
	}

	.archive-list-btn:hover {
		background: #e67e22;
		color: white;
	}

	.archived-lists-btn {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: transparent;
		border: 2px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
		transition: all 0.2s;
		width: calc(100% - 2rem);
		margin-left: 1rem;
		color: #333;
	}

	.archived-lists-btn:hover {
		background: #f5f5f5;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	.archived-lists-container {
		max-height: 400px;
		overflow-y: auto;
		margin: 1rem 0;
	}

	.archived-list-item {
		padding: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		margin-bottom: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.archived-list-info {
		flex: 1;
	}

	.archived-list-info strong {
		display: block;
		margin-bottom: 0.25rem;
	}

	.archived-list-info .member-count,
	.archived-list-info .archived-date {
		font-size: 0.875rem;
		color: #666;
		margin-right: 0.5rem;
	}

	.archived-list-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-restore {
		padding: 0.5rem 1rem;
		background: #28a745;
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-restore:hover {
		background: #218838;
	}

	.btn-delete-permanent {
		padding: 0.5rem 1rem;
		background: #dc3545;
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-delete-permanent:hover {
		background: #c82333;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e0e0e0;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
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

	.mobile-header-controls {
		display: flex;
		width: 100%;
		margin-bottom: 1.25rem;
	}

	.mobile-list-select {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		width: 100%;
	}

	.mobile-list-select label {
		font-size: 0.85rem;
		font-weight: 600;
		color: #4b5563;
	}

	.mobile-list-select select {
		padding: 0.65rem 0.75rem;
		border: 2px solid #d1d5db;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		background-color: #fff;
		color: #1f2937;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
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
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.mobile-hero {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
		margin-bottom: 1.75rem;
	}

	.mobile-hero-heading h1 {
		margin: 0;
		font-size: 2.25rem;
		line-height: 1.2;
		color: var(--color-text, #1f2937);
	}

	.mobile-hero-caption {
		margin: 0;
		color: #6b7280;
		font-size: 0.9rem;
	}

	.mobile-hero-stats {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
	}

	.mobile-stat-chip {
		display: inline-flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.9rem;
		border-radius: 12px;
		background: rgba(99, 102, 241, 0.08);
		border: 1px solid rgba(99, 102, 241, 0.18);
		min-width: 96px;
	}

	.mobile-stat-chip strong {
		font-size: 1.05rem;
		color: #1f2937;
	}

	.mobile-stat-chip span {
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #525a79;
	}

	.mobile-quick-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	.mobile-action {
		border: none;
		border-radius: 14px;
		padding: 0.9rem 1rem;
		background: #eef2ff;
		color: #36458a;
		font-weight: 600;
		font-size: 1rem;
		box-shadow: 0 6px 14px rgba(59, 70, 180, 0.12);
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.mobile-action:hover {
		transform: translateY(-1px);
		box-shadow: 0 10px 22px rgba(59, 70, 180, 0.16);
	}

	.mobile-action.primary {
		background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);
		color: #fff;
	}

	.mobile-secondary-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.mobile-secondary-actions .invite-btn-mobile {
		border: 2px solid var(--color-primary, #667eea);
		background: var(--color-primary, #667eea);
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
	}

	.mobile-secondary-actions .archive-list-btn {
		border: 2px solid #e67e22;
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		background: rgba(243, 244, 246, 0.72);
		color: #e67e22;
	}

	.mobile-export-import {
		margin-top: 0.75rem;
	}

	.mobile-secondary-actions .export-btn-mobile {
		border: 2px solid #27ae60;
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		background: rgba(243, 244, 246, 0.72);
		color: #27ae60;
	}

	.mobile-secondary-actions .import-btn-mobile {
		border: 2px solid #3498db;
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		background: rgba(243, 244, 246, 0.72);
		color: #3498db;
	}

	.input-with-tools {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.input-with-tools input {
		flex: 1;
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

	.camera-input {
		display: none;
	}

	.voice-btn,
	.camera-btn {
		width: 40px;
		height: 40px;
		font-size: 1.2rem;
		background: var(--color-primary, #667eea);
	}

	.voice-btn.listening {
		background: #ef4444;
	}

	.voice-error {
		margin-bottom: 0.75rem;
		color: #ef4444;
		font-size: 0.9rem;
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

	.custom-interval-inputs {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		width: 100%;
	}

	.custom-interval-number,
	.custom-interval-unit {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.custom-interval-number input {
		width: 100%;
		padding: 0.5rem;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		font-size: 1rem;
	}

	.custom-interval-unit select {
		width: 100%;
		padding: 0.5rem;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		font-size: 1rem;
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
		gap: 0.75rem;
		margin-bottom: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.filters-scroll {
		width: 100%;
	}

	.todo-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.filters button {
		padding: 0.5rem 1rem;
		background-color: #f0f0f0;
		color: #333;
		border: 2px solid transparent;
		border-radius: 999px;
		cursor: pointer;
		transition: all 0.2s;
		font-weight: 600;
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
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		column-gap: 0.75rem;
		row-gap: 0.35rem;
		background-color: #f8f9fa;
		border: 2px solid #e0e0e0;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		color: #555;
		width: fit-content;
		min-width: 0;
		flex-wrap: wrap;
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
		flex-basis: 100%;
		margin-top: 0.1rem;
	}

	.display-style-toggle {
		display: inline-flex;
		background: #f1f3f5;
		border-radius: 6px;
		padding: 2px;
		margin-left: auto;
		border: 1px solid #e0e3e7;
	}

	.display-style-btn {
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 0.4rem 0.5rem;
		cursor: pointer;
		color: #6b7280;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.display-style-btn svg {
		display: block;
	}

	.display-style-btn:hover:not(.active) {
		background: rgba(99, 102, 241, 0.06);
		color: #4f46e5;
	}

	.display-style-btn.active {
		background: white;
		color: #4f46e5;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
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

	.calendar-header-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.calendar-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #2c3e50;
	}

	.calendar-view-modes {
		display: flex;
		gap: 0.5rem;
		background: #f0f0f0;
		padding: 4px;
		border-radius: 8px;
	}

	.view-mode-btn {
		padding: 0.4rem 0.8rem;
		border: none;
		background: transparent;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		color: #666;
		transition: all 0.2s;
	}

	.view-mode-btn:hover {
		background: rgba(102, 126, 234, 0.1);
		color: var(--color-primary, #667eea);
	}

	.view-mode-btn.active {
		background: var(--color-primary, #667eea);
		color: white;
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

	.calendar-week-view {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.calendar-week-view .calendar-day {
		min-height: 200px;
	}

	.calendar-day-view {
		padding: 1rem;
	}

	.calendar-day-full {
		background: #f9fafc;
		border-radius: 8px;
		padding: 1.5rem;
		min-height: 300px;
		border: 1px solid rgba(0, 0, 0, 0.05);
	}

	.calendar-day-full.today {
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 2px var(--color-primary, rgba(102, 126, 234, 0.2));
	}

	.calendar-todo-list-full {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.calendar-todo-list-full li {
		padding: 1rem;
		background: rgba(102, 126, 234, 0.12);
		border-radius: 8px;
		font-size: 1rem;
		color: #2c3e50;
		cursor: grab;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.calendar-todo-list-full li:hover {
		background: rgba(102, 126, 234, 0.18);
		transform: translateX(4px);
	}

	.calendar-todo-list-full li:active {
		cursor: grabbing;
	}

	.calendar-todo-list-full li.dragging {
		opacity: 0.4;
	}

	.task-priority-badge {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.task-priority-badge.high {
		background-color: #ff6b6b;
	}

	.task-priority-badge.medium {
		background-color: #ffa500;
	}

	.task-priority-badge.low {
		background-color: #51cf66;
	}

	.no-tasks {
		text-align: center;
		color: #999;
		font-style: italic;
		padding: 2rem;
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

	.calendar-day.drag-over {
		background: rgba(102, 126, 234, 0.1);
		border-color: var(--color-primary, #667eea);
		border-width: 2px;
		border-style: dashed;
	}

	.calendar-day-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.calendar-day-number {
		font-weight: 700;
		color: #2c3e50;
	}

	.calendar-day-indicators {
		display: flex;
		gap: 3px;
		align-items: center;
	}

	.priority-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		display: inline-block;
		flex-shrink: 0;
	}

	.priority-indicator.high {
		background-color: #ff6b6b;
		box-shadow: 0 0 4px rgba(255, 107, 107, 0.4);
	}

	.priority-indicator.medium {
		background-color: #ffa500;
		box-shadow: 0 0 4px rgba(255, 165, 0, 0.4);
	}

	.priority-indicator.low {
		background-color: #51cf66;
		box-shadow: 0 0 4px rgba(81, 207, 102, 0.4);
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
		cursor: grab;
		transition: opacity 0.2s, transform 0.2s;
	}

	.calendar-todo-list li:active {
		cursor: grabbing;
	}

	.calendar-todo-list li.dragging {
		opacity: 0.4;
		transform: scale(0.95);
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

	.view-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1.5rem 0 1rem;
	}

	.view-switcher button {
		background: rgba(99, 102, 241, 0.1);
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: 0.9rem;
		cursor: pointer;
		color: inherit;
		transition: background 0.2s, border-color 0.2s, color 0.2s;
	}

	.view-switcher button:hover {
		background: rgba(99, 102, 241, 0.18);
	}

	.view-switcher button.active {
		background: rgba(99, 102, 241, 0.25);
		border-color: rgba(99, 102, 241, 0.5);
		color: #1a1d2d;
	}

	.footer {
		margin-top: 1rem;
		text-align: center;
		color: #666;
		font-size: 0.9rem;
	}

	.alt-footer {
		margin-top: 1.5rem;
		text-align: center;
		font-size: 0.9rem;
		color: #666;
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

	/* Export/Import Modal Styles */
	.modal-description {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.modal-section {
		background: var(--color-card-bg, rgba(255, 255, 255, 0.95));
		border: 1px solid var(--color-card-border, #e0e0e0);
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
	}

	.modal-subheading {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text, #2c3e50);
	}

	.modal-option-grid {
		display: grid;
		gap: 0.75rem;
	}

	@media (min-width: 600px) {
		.modal-option-grid {
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		}
	}

	.modal-option-btn {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		border: 1px solid var(--color-card-border, #e0e0e0);
		background: var(--color-card-bg, #ffffff);
		cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s, background 0.2s;
		text-align: left;
		width: 100%;
	}

	.modal-option-btn:hover,
	.modal-option-btn:focus-visible {
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 10px 20px rgba(102, 126, 234, 0.18);
		transform: translateY(-2px);
		outline: none;
		background: rgba(102, 126, 234, 0.05);
	}

	.modal-option-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		font-size: 1.5rem;
		flex-shrink: 0;
		background: rgba(102, 126, 234, 0.1);
		color: var(--color-primary, #667eea);
	}

	.modal-option-btn[data-variant='csv'] .modal-option-icon {
		background: rgba(13, 148, 136, 0.12);
		color: #0f766e;
	}

	.modal-option-btn[data-variant='pdf'] .modal-option-icon {
		background: rgba(239, 68, 68, 0.12);
		color: #b91c1c;
	}

	.modal-option-copy {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.modal-option-title {
		font-weight: 600;
		color: var(--color-text, #1f2937);
		word-break: break-word;
	}

	.modal-option-description {
		font-size: 0.9rem;
		color: var(--color-text-secondary, #666);
		line-height: 1.4;
	}

	.modal-option-cta {
		font-weight: 600;
		color: var(--color-primary, #667eea);
		font-size: 0.9rem;
		margin-left: auto;
	}

	.modal-checkbox-card {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 0.75rem;
		row-gap: 0.35rem;
		padding: 0.75rem 1rem;
		border-radius: 12px;
		border: 1px solid var(--color-card-border, #e0e0e0);
		background: var(--color-card-bg, #ffffff);
		cursor: pointer;
		transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
	}

	.modal-checkbox-card:hover {
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 8px 16px rgba(102, 126, 234, 0.15);
		background: rgba(102, 126, 234, 0.05);
	}

	.modal-checkbox-card:focus-within {
		outline: none;
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
		background: rgba(102, 126, 234, 0.08);
	}

	.modal-checkbox-control {
		grid-row: 1 / span 2;
		width: 18px;
		height: 18px;
		margin-top: 0.2rem;
		accent-color: var(--color-primary, #667eea);
	}

	.modal-input-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 1rem;
	}

	.modal-input {
		padding: 0.75rem;
		border: 2px solid var(--color-card-border, #e0e0e0);
		border-radius: 8px;
		font-size: 1rem;
		outline: none;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.modal-input:focus {
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
	}

	.file-drop {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		border: 1px dashed var(--color-card-border, #cbd5f5);
		background: rgba(102, 126, 234, 0.05);
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
	}

	.file-drop:hover {
		border-color: var(--color-primary, #667eea);
		background: rgba(102, 126, 234, 0.12);
		box-shadow: 0 8px 16px rgba(102, 126, 234, 0.12);
	}

	.file-drop:focus-visible {
		outline: none;
		border-color: var(--color-primary, #667eea);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
	}

	.file-drop-icon {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgba(102, 126, 234, 0.15);
		color: var(--color-primary, #667eea);
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.file-drop-action {
		margin-left: auto;
		font-weight: 600;
		color: var(--color-primary, #667eea);
	}

	.file-input-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.modal-footnote {
		font-size: 0.85rem;
		color: var(--color-text-secondary, #666);
		margin: 0.75rem 0 0;
		text-align: left;
		line-height: 1.4;
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

	.theme-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
		margin-bottom: 1.5rem;
		padding: 0 1rem;
	}

	.btn-small {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		font-weight: 500;
	}

	.btn-danger {
		background: #ff6b6b;
		color: white;
	}

	.btn-danger:hover {
		background: #ff5252;
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

	.setting-input {
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-card-border, #e0e0e0);
		border-radius: 6px;
		background: white;
		color: var(--color-text, #2c3e50);
		font-size: 0.9rem;
		font-weight: 500;
		min-width: 180px;
		transition: all 0.2s;
	}

	.setting-input:focus {
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

	:global(body.dark-mode) .logo-divider {
		background: rgba(255, 255, 255, 0.2);
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

:global(body.dark-mode) .list-item.list-drop-target {
	background: #2d2d44;
	border-color: rgba(102, 126, 234, 0.7);
}

	:global(body.dark-mode) .list-item.list-drop-target {
		background: #2d2d44;
		border-color: rgba(102, 126, 234, 0.7);
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

	:global(body.dark-mode) .pull-indicator {
		background: rgba(148, 163, 184, 0.85);
		color: #0f172a;
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

	:global(body.dark-mode) .add-list-btn {
		background: var(--color-primary, #667eea);
		color: white;
	}

	:global(body.dark-mode) .add-list-btn:hover {
		background: var(--color-primary-hover, #5568d3);
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
	}

	:global(body.dark-mode) .settings-btn {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .settings-btn:hover {
		background: #2d2d44;
		border-color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .archived-lists-btn {
		border-color: #444;
		color: #e0e0e0;
		background: #252538;
	}

	:global(body.dark-mode) .archived-lists-btn:hover {
		background: #2d2d44;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
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

	:global(body.dark-mode) .mobile-hero-caption {
		color: #a5acc7;
	}

	:global(body.dark-mode) .mobile-stat-chip {
		background: rgba(99, 102, 241, 0.18);
		border-color: rgba(129, 140, 248, 0.3);
	}

	:global(body.dark-mode) .mobile-stat-chip strong {
		color: #f1f5ff;
	}

	:global(body.dark-mode) .mobile-stat-chip span {
		color: #c7d2fe;
	}

	:global(body.dark-mode) .mobile-action {
		background: rgba(61, 74, 118, 0.55);
		color: #e4e7ff;
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.45);
	}

	:global(body.dark-mode) .mobile-action.primary {
		background: linear-gradient(135deg, #4c51bf 0%, #6366f1 100%);
	}

	:global(body.dark-mode) .mobile-secondary-actions .export-btn-mobile,
	:global(body.dark-mode) .mobile-secondary-actions .import-btn-mobile,
	:global(body.dark-mode) .mobile-secondary-actions .archive-list-btn {
		background: rgba(37, 37, 56, 0.8);
	}

	:global(body.dark-mode) .mobile-secondary-actions .invite-btn-mobile {
		background: var(--color-primary, #667eea);
		border-color: var(--color-primary, #667eea);
		color: white;
	}

	:global(body.dark-mode) .mobile-list-select label {
		color: #cbd5f5;
	}

	:global(body.dark-mode) .mobile-list-select select {
		background: #162036;
		border-color: #334155;
		color: #e2e8f0;
	}

	:global(body.dark-mode) .voice-error {
		color: #fca5a5;
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
	:global(body.dark-mode) .sort-inline-main select,
	:global(body.dark-mode) .custom-interval-number input,
	:global(body.dark-mode) .custom-interval-unit select {
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

	:global(body.dark-mode) .export-btn,
	:global(body.dark-mode) .import-btn,
	:global(body.dark-mode) .archive-list-btn {
		background: #252538;
	}

	:global(body.dark-mode) .export-btn:hover {
		background: #27ae60;
		color: white;
	}

	:global(body.dark-mode) .import-btn:hover {
		background: #3498db;
		color: white;
	}

	:global(body.dark-mode) .invite-btn {
		background: var(--color-primary, #667eea);
		color: white;
	}

	:global(body.dark-mode) .invite-btn:hover {
		background: #252538;
		color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .archive-list-btn:hover {
		background: #e67e22;
		color: white;
	}

	:global(body.dark-mode) .footer {
		color: #999;
	}

	:global(body.dark-mode) .view-switcher button {
		background: rgba(99, 102, 241, 0.2);
		color: #d0d4ff;
	}

	:global(body.dark-mode) .view-switcher button:hover {
		background: rgba(99, 102, 241, 0.3);
	}

	:global(body.dark-mode) .view-switcher button.active {
		background: rgba(99, 102, 241, 0.4);
		border-color: rgba(99, 102, 241, 0.7);
		color: #f8fafc;
	}

	:global(body.dark-mode) .display-style-toggle {
		background: #1e293b;
		border-color: #334155;
	}

	:global(body.dark-mode) .display-style-btn {
		color: #94a3b8;
	}

	:global(body.dark-mode) .display-style-btn:hover:not(.active) {
		background: rgba(99, 102, 241, 0.15);
		color: #a5b4fc;
	}

	:global(body.dark-mode) .display-style-btn.active {
		background: #334155;
		color: #a5b4fc;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	:global(body.dark-mode) .alt-footer {
		color: #cbd5f5;
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

	:global(body.dark-mode) .modal-section {
		background: rgba(37, 37, 56, 0.85);
		border-color: #353549;
		box-shadow: 0 12px 24px rgba(8, 8, 20, 0.55);
	}

	:global(body.dark-mode) .modal-subheading {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal-option-btn {
		background: #252538;
		border-color: #353549;
	}

	:global(body.dark-mode) .modal-option-btn:hover,
	:global(body.dark-mode) .modal-option-btn:focus-visible {
		background: rgba(102, 126, 234, 0.12);
	}

	:global(body.dark-mode) .modal-option-title {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal-option-description,
	:global(body.dark-mode) .modal-footnote {
		color: #a1a1bb;
	}

	:global(body.dark-mode) .modal-option-cta,
	:global(body.dark-mode) .file-drop-action {
		color: #a5b4fc;
	}

	:global(body.dark-mode) .file-drop {
		background: rgba(102, 126, 234, 0.12);
		border-color: #3f3f60;
	}

	:global(body.dark-mode) .file-drop:hover {
		background: rgba(102, 126, 234, 0.18);
		border-color: #667eea;
		box-shadow: 0 10px 24px rgba(102, 126, 234, 0.2);
	}

	:global(body.dark-mode) .file-drop:focus-visible {
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.28);
	}

	:global(body.dark-mode) .file-drop-icon {
		background: rgba(102, 126, 234, 0.2);
		color: #cbd5f5;
	}

	:global(body.dark-mode) .modal-checkbox-card {
		background: #252538;
		border-color: #353549;
	}

	:global(body.dark-mode) .modal-checkbox-card:hover {
		background: rgba(102, 126, 234, 0.12);
	}

	:global(body.dark-mode) .modal-checkbox-card:focus-within {
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.28);
		background: rgba(102, 126, 234, 0.16);
	}

	:global(body.dark-mode) .modal-input {
		background: #252538;
		border-color: #353549;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .modal-input:focus {
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
	}

	:global(body.dark-mode) .modal-checkbox-control {
		accent-color: #667eea;
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

	:global(body.dark-mode) .calendar-day.drag-over {
		background: rgba(102, 126, 234, 0.2);
		border-color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .priority-indicator.high {
		background-color: #ff8787;
	}

	:global(body.dark-mode) .priority-indicator.medium {
		background-color: #ffb84d;
	}

	:global(body.dark-mode) .priority-indicator.low {
		background-color: #69db7c;
	}

	:global(body.dark-mode) .calendar-view-modes {
		background: #1a1a2e;
	}

	:global(body.dark-mode) .view-mode-btn {
		color: #999;
	}

	:global(body.dark-mode) .view-mode-btn:hover {
		background: rgba(102, 126, 234, 0.2);
		color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .calendar-day-full {
		background: #252538;
		border-color: rgba(255, 255, 255, 0.05);
	}

	:global(body.dark-mode) .calendar-todo-list-full li {
		background: rgba(102, 126, 234, 0.25);
		color: #e0e0e0;
	}

	:global(body.dark-mode) .calendar-todo-list-full li:hover {
		background: rgba(102, 126, 234, 0.35);
	}

	:global(body.dark-mode) .no-tasks {
		color: #666;
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

	:global(body.dark-mode) .btn-danger {
		background: #ff8787;
	}

	:global(body.dark-mode) .btn-danger:hover {
		background: #ff6b6b;
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

	:global(body.dark-mode) .setting-input {
		background: #353549;
		border-color: #404057;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .setting-input:focus {
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

	:global(body.dark-mode) .archived-list-item {
		border-color: #444;
		background: #1e1e2e;
	}

	:global(body.dark-mode) .archived-list-info .member-count,
	:global(body.dark-mode) .archived-list-info .archived-date {
		color: #999;
	}

	/* Mobile Navigation Menu */
	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text, #2c3e50);
		min-width: 44px;
		min-height: 44px;
		border-radius: 8px;
		transition: background 0.2s;
	}

	.mobile-menu-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	:global(body.dark-mode) .mobile-menu-btn {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .mobile-menu-btn:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.mobile-menu-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideIn {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
	}

	.mobile-menu {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 85%;
		max-width: 320px;
		background: white;
		overflow-y: auto;
		animation: slideIn 0.3s ease-out;
		box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
	}

	:global(body.dark-mode) .mobile-menu {
		background: #1e1e2e;
	}

	.mobile-menu-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 1rem;
		border-bottom: 1px solid #e9ecef;
	}

	:global(body.dark-mode) .mobile-menu-header {
		border-bottom-color: #333;
	}

	.mobile-menu-logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.mobile-menu-logo-img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}

	.mobile-menu-logo h2 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--color-text, #2c3e50);
	}

	:global(body.dark-mode) .mobile-menu-logo h2 {
		color: #e0e0e0;
	}

	.mobile-menu-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text, #2c3e50);
		min-width: 44px;
		min-height: 44px;
		border-radius: 8px;
		transition: background 0.2s;
	}

	.mobile-menu-close:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	:global(body.dark-mode) .mobile-menu-close {
		color: #e0e0e0;
	}

	:global(body.dark-mode) .mobile-menu-close:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.mobile-menu-section {
		padding: 1rem;
		border-bottom: 1px solid #e9ecef;
	}

	:global(body.dark-mode) .mobile-menu-section {
		border-bottom-color: #333;
	}

	.mobile-menu-section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #666;
		font-weight: 600;
	}

	:global(body.dark-mode) .mobile-menu-section h3 {
		color: #999;
	}

	.mobile-menu-lists {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.mobile-menu-list-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.875rem;
		background: #f8f9fa;
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		min-height: 48px;
		width: 100%;
	}

	.mobile-menu-list-item:hover {
		background: #e9ecef;
	}

	.mobile-menu-list-item.active {
		background: white;
		border-color: var(--color-primary, #667eea);
	}

	.mobile-menu-list-item.list-drop-target {
		border-color: var(--color-primary, #667eea);
		background: rgba(102, 126, 234, 0.18);
	}

	:global(body.dark-mode) .mobile-menu-list-item {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .mobile-menu-list-item:hover {
		background: #2d2d44;
	}

	:global(body.dark-mode) .mobile-menu-list-item.active {
		background: #1e1e2e;
		border-color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .mobile-menu-list-item.list-drop-target {
		background: rgba(102, 126, 234, 0.2);
		border-color: rgba(102, 126, 234, 0.6);
	}

	.mobile-menu-list-name {
		font-weight: 500;
		color: var(--color-text, #2c3e50);
	}

	:global(body.dark-mode) .mobile-menu-list-name {
		color: #e0e0e0;
	}

	.mobile-menu-member-count {
		background: var(--color-primary, #667eea);
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.mobile-menu-action-btn {
		width: 100%;
		padding: 0.875rem;
		background: #f8f9fa;
		color: var(--color-text, #2c3e50);
		border: 2px solid transparent;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.5rem;
		text-decoration: none;
	}

	.admin-dashboard-btn {
		background: var(--color-primary, #667eea);
		color: white;
	}

	.admin-dashboard-btn:hover {
		background: var(--color-primary-hover, #5568d3);
		border-color: transparent;
	}

	.mobile-menu-action-btn:hover {
		background: #e9ecef;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .mobile-menu-action-btn {
		background: #252538;
		color: #e0e0e0;
	}

	:global(body.dark-mode) .mobile-menu-action-btn:hover {
		background: #2d2d44;
		border-color: var(--color-primary, #667eea);
		color: var(--color-primary, #667eea);
	}

	:global(body.dark-mode) .admin-dashboard-btn {
		background: var(--color-primary, #667eea);
		color: white;
	}

	:global(body.dark-mode) .admin-dashboard-btn:hover {
		background: var(--color-primary-hover, #5568d3);
		border-color: transparent;
		color: white;
	}

	.mobile-menu-invitations {
		width: 100%;
		padding: 0.875rem;
		background: #ff6b6b;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
		min-height: 48px;
		margin: 1rem;
		margin-bottom: 0;
	}

	.mobile-menu-invitations:hover {
		background: #ff5252;
	}

	/* Mobile Touch Target Improvements */
	@media (max-width: 768px) {
		/* Ensure all interactive elements are at least 44x44px */
		button, .icon-btn, .filter-btn, .sort-btn {
			min-height: 44px;
			min-width: 44px;
			padding: 0.75rem 1rem;
		}

		.theme-toggle, .logout-btn {
			min-height: 44px;
			padding: 0.75rem 1.25rem;
		}

		input[type="text"], input[type="email"], input[type="password"],
		input[type="date"], input[type="time"], select, textarea {
			min-height: 48px;
			padding: 0.875rem 1rem;
			font-size: 16px; /* Prevents iOS zoom on focus */
		}

		/* Make modals full-screen on mobile */
		.modal {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			max-width: 100%;
			max-height: 100%;
			width: 100%;
			height: 100%;
			border-radius: 0;
			margin: 0;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}

		.modal h2 {
			margin-bottom: 1.5rem;
		}

		.modal-actions {
			margin-top: 1.5rem;
		}

		/* Improve header layout on mobile */
		.header {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.75rem;
			padding: 1rem;
		}

		.header-left {
			flex: 1;
			min-width: 0;
		}

		.user-info {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		.welcome {
			font-size: 0.9rem;
		}

		.connection-status {
			font-size: 0.8rem;
		}

		/* Better spacing for mobile */
		.main-content {
			padding: 1rem;
		}

		.input-section {
			gap: 1rem;
		}

		.input-with-tools {
			position: relative;
			display: flex;
			gap: 0.5rem;
			width: 100%;
		}

		.input-with-tools input {
			flex: 1;
		}

		/* Improve list actions on mobile */
		.list-actions button {
			white-space: nowrap;
			font-size: 0.875rem;
		}

		/* Better mobile select styling */
		.mobile-list-select {
			width: 100%;
		}

		.mobile-list-select select {
			width: 100%;
			min-height: 48px;
			font-size: 16px;
		}

		/* Improve mobile hero section */
		.mobile-hero {
			padding: 1.5rem 0;
		}

		.mobile-quick-actions {
			display: flex;
			gap: 0.75rem;
			margin-top: 1rem;
		}

		.mobile-action {
			flex: 1;
			min-height: 48px;
			padding: 0.875rem;
			border-radius: 8px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s;
		}

		.mobile-action.primary {
			background: var(--color-primary, #667eea);
			color: white;
			border: none;
		}

		/* Improve mobile scroll behavior */
		.todo-list {
			-webkit-overflow-scrolling: touch;
		}

		/* Better touch feedback */
		button:active, .list-item:active, .mobile-menu-list-item:active {
			transform: scale(0.98);
		}

		/* Improve calendar modal on mobile */
		.calendar-grid {
			-webkit-overflow-scrolling: touch;
		}

		/* Better spacing for mobile forms */
		.task-options-row {
			gap: 1rem;
		}

		.task-options-row label {
			width: 100%;
		}

		/* Fix settings modal overflow on mobile */
		.setting-item {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.setting-item label {
			min-width: 0;
		}

		.setting-label {
			white-space: normal;
			word-break: break-word;
		}

		.setting-select {
			width: 100%;
			min-width: 0;
		}

		.setting-input {
			width: 100%;
		}

		.theme-actions {
			flex-direction: column;
		}

		.theme-actions button {
			width: 100%;
		}
	}

	/* Very small screens (phones in portrait) */
	@media (max-width: 375px) {
		.mobile-menu {
			width: 90%;
		}

		.welcome strong {
			display: block;
			margin-top: 0.25rem;
		}

		.mobile-quick-actions {
			flex-direction: column;
		}

		.mobile-action {
			width: 100%;
		}
	}

	/* Print Styles */
	@media print {
		/* Hide non-essential elements */
		.sidebar,
		.input-section,
		.list-actions,
		.mobile-hero-actions,
		.mobile-secondary-actions,
		.settings-btn,
		.mobile-menu-btn,
		.modal-overlay,
		.mobile-action-sheet,
		button[type="button"],
		.btn-primary,
		.btn-secondary,
		.export-btn,
		.import-btn,
		.invite-btn,
		.archive-list-btn,
		.calendar-btn,
		.recently-deleted-btn {
			display: none !important;
		}

		/* Reset body and main content for print */
		body {
			background: white !important;
			color: black !important;
		}

		.main-content {
			margin: 0 !important;
			padding: 1rem !important;
			max-width: 100% !important;
		}

		/* List header styling */
		.list-header h1,
		.mobile-hero h1 {
			font-size: 24pt !important;
			margin-bottom: 0.5rem !important;
			color: black !important;
			page-break-after: avoid;
		}

		/* Todo item styling */
		.todo-item {
			break-inside: avoid;
			page-break-inside: avoid;
			margin-bottom: 0.5rem !important;
			border: none !important;
			padding: 0.5rem 0 !important;
		}

		.todo-content {
			display: flex !important;
			align-items: flex-start !important;
			gap: 0.5rem !important;
		}

		.todo-text {
			font-size: 12pt !important;
			color: black !important;
		}

		.todo-item.completed .todo-text {
			text-decoration: line-through !important;
			color: #666 !important;
		}

		/* Subtask styling */
		.subtask {
			margin-left: 2rem !important;
			font-size: 11pt !important;
		}

		/* Task metadata */
		.todo-meta {
			font-size: 9pt !important;
			color: #666 !important;
			margin-top: 0.25rem !important;
		}

		/* Priority indicators */
		.priority-badge {
			display: inline-block !important;
			padding: 2px 6px !important;
			font-size: 8pt !important;
			border: 1px solid #666 !important;
			border-radius: 3px !important;
			background: white !important;
			color: black !important;
		}

		/* Due dates */
		.due-date {
			font-weight: bold !important;
		}

		/* Hide interactive elements */
		input[type="checkbox"]:not(:checked)::before {
			content: "☐ ";
		}

		input[type="checkbox"]:checked::before {
			content: "☑ ";
		}

		/* Page breaks */
		h1, h2, h3 {
			page-break-after: avoid;
		}

		/* Print footer */
		@page {
			margin: 1cm;
			@bottom-right {
				content: "Page " counter(page) " of " counter(pages);
			}
		}

		/* Add printed date */
		.list-header::after,
		.mobile-hero::after {
			content: "Printed: " attr(data-print-date);
			display: block;
			font-size: 10pt;
			color: #666;
			margin-top: 0.5rem;
		}
	}

	/* Animation for newly created recurring tasks */
	.newly-created-todo {
		animation: slide-fade-in 0.6s ease-out;
	}

	@keyframes slide-fade-in {
		0% {
			opacity: 0;
			transform: translateY(-20px) scale(0.95);
		}
		60% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
