import { writable } from 'svelte/store';
import { io } from 'socket.io-client';
import { browser } from '$app/environment';

// Connection state store
export const connectionState = writable('disconnected');

let socket = null;
let currentListId = null;
let currentSessionId = null;

// Initialize WebSocket connection
export function initializeWebSocket() {
	if (!browser) return;

	if (socket?.connected) {
		console.log('WebSocket already connected');
		return socket;
	}

	socket = io({
		path: '/socket.io',
		transports: ['websocket', 'polling']
	});

	socket.on('connect', () => {
		console.log('[WebSocket] Connected:', socket.id);
		connectionState.set('connected');

		// Rejoin current list if we were in one
		if (currentListId && currentSessionId) {
			console.log('[WebSocket] Rejoining list after reconnect:', currentListId);
			socket.emit('join-list', {
				listId: currentListId,
				sessionId: currentSessionId
			});
		}
	});

	socket.on('disconnect', () => {
		console.log('WebSocket disconnected');
		connectionState.set('disconnected');
	});

	socket.on('connect_error', (error) => {
		console.error('WebSocket connection error:', error);
		connectionState.set('error');
	});

	return socket;
}

// Join a list room (requires sessionId for server-side authorization)
export function joinList(listId, sessionId) {
	if (!socket) {
		console.log('[WebSocket] Cannot join list - socket not initialized');
		return;
	}

	if (!listId || !sessionId) {
		console.log('[WebSocket] Cannot join list - missing listId or sessionId');
		return;
	}

	// Leave current list if any
	if (currentListId && currentListId !== listId) {
		console.log('[WebSocket] Leaving previous list:', currentListId);
		socket.emit('leave-list', currentListId);
	}

	currentListId = listId;
	currentSessionId = sessionId;

	const joinData = { listId, sessionId };

	// If socket is connected, join immediately
	if (socket.connected) {
		console.log('[WebSocket] Joining list immediately:', listId);
		socket.emit('join-list', joinData);
	} else {
		// Otherwise, join when connected
		console.log('[WebSocket] Socket not connected yet, will join list', listId, 'on connect');
		socket.once('connect', () => {
			console.log('[WebSocket] Socket connected, now joining list:', listId);
			socket.emit('join-list', joinData);
		});
	}
}

// Leave a list room
export function leaveList(listId) {
	if (!socket || !listId) return;

	socket.emit('leave-list', listId);

	if (currentListId === listId) {
		currentListId = null;
	}

	console.log('Left list:', listId);
}

// Listen for todo events
export function onTodoCreated(callback) {
	if (!socket) return () => {};

	socket.on('todo:created', callback);
	return () => socket.off('todo:created', callback);
}

export function onTodoUpdated(callback) {
	if (!socket) return () => {};

	socket.on('todo:updated', callback);
	return () => socket.off('todo:updated', callback);
}

export function onTodoDeleted(callback) {
	if (!socket) return () => {};

	socket.on('todo:deleted', callback);
	return () => socket.off('todo:deleted', callback);
}

export function onListUpdated(callback) {
	if (!socket) return () => {};

	socket.on('list:updated', callback);
	return () => socket.off('list:updated', callback);
}

// Disconnect WebSocket
export function disconnectWebSocket() {
	if (socket) {
		socket.disconnect();
		socket = null;
		currentListId = null;
		currentSessionId = null;
		connectionState.set('disconnected');
	}
}

// Get current connection status
export function getConnectionState() {
	if (!socket) return 'disconnected';
	return socket.connected ? 'connected' : 'disconnected';
}

// Presence and typing indicators
export function emitEditing(todoId, listId) {
	if (socket && socket.connected) {
		socket.emit('todo:editing', { todoId, listId });
	}
}

export function emitStoppedEditing(todoId, listId) {
	if (socket && socket.connected) {
		socket.emit('todo:stopped-editing', { todoId, listId });
	}
}

export function emitTyping(todoId, listId, field) {
	if (socket && socket.connected) {
		socket.emit('todo:typing', { todoId, listId, field });
	}
}

export function emitStoppedTyping(todoId, listId, field) {
	if (socket && socket.connected) {
		socket.emit('todo:stopped-typing', { todoId, listId, field });
	}
}

// Listen for presence events
export function onUserJoined(callback) {
	if (!socket) return () => {};
	socket.on('user:joined', callback);
	return () => socket.off('user:joined', callback);
}

export function onUserLeft(callback) {
	if (!socket) return () => {};
	socket.on('user:left', callback);
	return () => socket.off('user:left', callback);
}

export function onUserEditing(callback) {
	if (!socket) return () => {};
	socket.on('todo:user-editing', callback);
	return () => socket.off('todo:user-editing', callback);
}

export function onUserStoppedEditing(callback) {
	if (!socket) return () => {};
	socket.on('todo:user-stopped-editing', callback);
	return () => socket.off('todo:user-stopped-editing', callback);
}

export function onUserTyping(callback) {
	if (!socket) return () => {};
	socket.on('todo:user-typing', callback);
	return () => socket.off('todo:user-typing', callback);
}

export function onUserStoppedTyping(callback) {
	if (!socket) return () => {};
	socket.on('todo:user-stopped-typing', callback);
	return () => socket.off('todo:user-stopped-typing', callback);
}
