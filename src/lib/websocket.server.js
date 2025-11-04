import { Server } from 'socket.io';

// Use globalThis to share the WebSocket instance across all contexts (Vite dev server + SSR)
const getGlobalIO = () => globalThis.__socketIO;
const setGlobalIO = (ioInstance) => { globalThis.__socketIO = ioInstance; };

export function initializeWebSocket(server) {
	const existingIO = getGlobalIO();
	if (existingIO) {
		console.log('WebSocket server already initialized');
		return existingIO;
	}

	const io = new Server(server, {
		cors: {
			origin: process.env.ORIGIN || false,
			methods: ['GET', 'POST'],
			credentials: true
		},
		path: '/socket.io'
	});

	io.on('connection', (socket) => {
		console.log('Client connected:', socket.id);

		// Handle user joining a list room
		socket.on('join-list', (data) => {
			const { listId, userId, username } = data;
			socket.join(`list-${listId}`);
			socket.userId = userId;
			socket.username = username;
			socket.currentListId = listId;
			console.log(`Socket ${socket.id} (${username}) joined list-${listId}`);

			// Notify others that user joined
			socket.to(`list-${listId}`).emit('user:joined', { userId, username, socketId: socket.id });
		});

		// Handle user leaving a list room
		socket.on('leave-list', (listId) => {
			socket.leave(`list-${listId}`);
			console.log(`Socket ${socket.id} left list-${listId}`);

			// Notify others that user left
			if (socket.userId && socket.username) {
				socket.to(`list-${listId}`).emit('user:left', { userId: socket.userId, username: socket.username });
			}
		});

		// Handle user editing a todo
		socket.on('todo:editing', (data) => {
			const { todoId, listId } = data;
			socket.to(`list-${listId}`).emit('todo:user-editing', {
				todoId,
				userId: socket.userId,
				username: socket.username,
				socketId: socket.id
			});
		});

		// Handle user stopped editing a todo
		socket.on('todo:stopped-editing', (data) => {
			const { todoId, listId } = data;
			socket.to(`list-${listId}`).emit('todo:user-stopped-editing', {
				todoId,
				userId: socket.userId,
				username: socket.username,
				socketId: socket.id
			});
		});

		// Handle typing indicators
		socket.on('todo:typing', (data) => {
			const { todoId, listId, field } = data;
			socket.to(`list-${listId}`).emit('todo:user-typing', {
				todoId,
				field,
				userId: socket.userId,
				username: socket.username,
				socketId: socket.id
			});
		});

		// Handle stopped typing
		socket.on('todo:stopped-typing', (data) => {
			const { todoId, listId, field } = data;
			socket.to(`list-${listId}`).emit('todo:user-stopped-typing', {
				todoId,
				field,
				userId: socket.userId,
				username: socket.username,
				socketId: socket.id
			});
		});

		socket.on('disconnect', () => {
			console.log('Client disconnected:', socket.id);

			// Notify others in the same list that user disconnected
			if (socket.currentListId && socket.userId && socket.username) {
				socket.to(`list-${socket.currentListId}`).emit('user:left', {
					userId: socket.userId,
					username: socket.username
				});
			}
		});
	});

	setGlobalIO(io);
	console.log('WebSocket server initialized and stored globally');
	return io;
}

export function getIO() {
	const io = getGlobalIO();
	if (!io) {
		throw new Error('WebSocket server not initialized');
	}
	return io;
}

// Event emitters for different types of updates
export function emitTodoUpdate(listId, todo) {
	try {
		const ioInstance = getIO();
		console.log(`[WebSocket] Emitting todo:updated to list-${listId}`, todo);
		ioInstance.to(`list-${listId}`).emit('todo:updated', todo);
	} catch (error) {
		console.error('[WebSocket] Cannot emit todo:updated:', error.message);
	}
}

export function emitTodoCreate(listId, todo) {
	try {
		const ioInstance = getIO();
		console.log(`[WebSocket] Emitting todo:created to list-${listId}`, todo);
		ioInstance.to(`list-${listId}`).emit('todo:created', todo);
	} catch (error) {
		console.error('[WebSocket] Cannot emit todo:created:', error.message);
	}
}

export function emitTodoDelete(listId, todoId) {
	try {
		const ioInstance = getIO();
		console.log(`[WebSocket] Emitting todo:deleted to list-${listId}`, todoId);
		ioInstance.to(`list-${listId}`).emit('todo:deleted', { id: todoId });
	} catch (error) {
		console.error('[WebSocket] Cannot emit todo:deleted:', error.message);
	}
}

export function emitListUpdate(listId, list) {
	try {
		const ioInstance = getIO();
		ioInstance.to(`list-${listId}`).emit('list:updated', list);
	} catch (error) {
		console.error('[WebSocket] Cannot emit list:updated:', error.message);
	}
}
