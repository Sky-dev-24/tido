import { Server } from 'socket.io';
import { createLogger } from './logger.js';

const logger = createLogger('WebSocket');

// Use globalThis to share the WebSocket instance across all contexts (Vite dev server + SSR)
const getGlobalIO = () => globalThis.__socketIO;
const setGlobalIO = (ioInstance) => { globalThis.__socketIO = ioInstance; };

export function initializeWebSocket(server) {
	const existingIO = getGlobalIO();
	if (existingIO) {
		logger.debug('WebSocket server already initialized');
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
		logger.debug('Client connected', { socketId: socket.id });

		// Handle user joining a list room
		socket.on('join-list', (data) => {
			const { listId, userId, username } = data;
			socket.join(`list-${listId}`);
			socket.userId = userId;
			socket.username = username;
			socket.currentListId = listId;
			logger.debug('User joined list', { socketId: socket.id, username, listId });

			// Notify others that user joined
			socket.to(`list-${listId}`).emit('user:joined', { userId, username, socketId: socket.id });
		});

		// Handle user leaving a list room
		socket.on('leave-list', (listId) => {
			socket.leave(`list-${listId}`);
			logger.debug('User left list', { socketId: socket.id, listId });

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
			logger.debug('Client disconnected', { socketId: socket.id });

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
	logger.info('WebSocket server initialized and stored globally');
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
		logger.debug('Emitting todo:updated', { listId, todoId: todo.id });
		ioInstance.to(`list-${listId}`).emit('todo:updated', todo);
	} catch (error) {
		logger.error('Cannot emit todo:updated', error);
	}
}

export function emitTodoCreate(listId, todo) {
	try {
		const ioInstance = getIO();
		logger.debug('Emitting todo:created', { listId, todoId: todo.id });
		ioInstance.to(`list-${listId}`).emit('todo:created', todo);
	} catch (error) {
		logger.error('Cannot emit todo:created', error);
	}
}

export function emitTodoDelete(listId, todoId) {
	try {
		const ioInstance = getIO();
		logger.debug('Emitting todo:deleted', { listId, todoId });
		ioInstance.to(`list-${listId}`).emit('todo:deleted', { id: todoId });
	} catch (error) {
		logger.error('Cannot emit todo:deleted', error);
	}
}

export function emitListUpdate(listId, list) {
	try {
		const ioInstance = getIO();
		logger.debug('Emitting list:updated', { listId });
		ioInstance.to(`list-${listId}`).emit('list:updated', list);
	} catch (error) {
		logger.error('Cannot emit list:updated', error);
	}
}
