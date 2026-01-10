import { Server } from 'socket.io';
import { createLogger } from './logger.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env.DB_PATH || join(__dirname, '../../todos.db');

const logger = createLogger('WebSocket');

// Helper to verify list membership (uses separate db connection to avoid import cycles)
function isUserMemberOfList(listId, userId) {
	try {
		const db = new Database(dbPath, { readonly: true });
		const member = db.prepare(
			'SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?'
		).get(listId, userId);
		db.close();
		return Boolean(member);
	} catch (error) {
		logger.error('Error checking list membership', error);
		return false;
	}
}

// Helper to validate session and get user info
function getSessionUser(sessionId) {
	try {
		const db = new Database(dbPath, { readonly: true });
		const session = db.prepare(`
			SELECT s.*, u.username, u.is_approved
			FROM sessions s
			JOIN users u ON s.user_id = u.id
			WHERE s.id = ? AND s.expires_at > datetime('now')
		`).get(sessionId);
		db.close();

		if (session && session.is_approved) {
			return {
				userId: session.user_id,
				username: session.username
			};
		}
		return null;
	} catch (error) {
		logger.error('Error validating session', error);
		return null;
	}
}

// Use globalThis to share the WebSocket instance across all contexts (Vite dev server + SSR)
const getGlobalIO = () => globalThis.__socketIO;
const setGlobalIO = (ioInstance) => { globalThis.__socketIO = ioInstance; };

export function initializeWebSocket(server) {
	const existingIO = getGlobalIO();
	if (existingIO) {
		logger.debug('WebSocket server already initialized');
		return existingIO;
	}

	// Parse WEBSOCKET_ORIGINS (or fall back to ORIGIN) - can be comma-separated for multiple allowed origins
	// e.g., "https://tido.example.com,http://192.168.1.100:3000"
	// WEBSOCKET_ORIGINS is set by server.js to preserve the full origin list before SvelteKit normalizes ORIGIN
	let corsOrigin = false;
	const originEnv = process.env.WEBSOCKET_ORIGINS || process.env.ORIGIN;
	if (originEnv) {
		const origins = originEnv.split(',').map(o => o.trim()).filter(Boolean);
		corsOrigin = origins.length === 1 ? origins[0] : origins;
	}

	const io = new Server(server, {
		cors: {
			origin: corsOrigin,
			methods: ['GET', 'POST'],
			credentials: true
		},
		path: '/socket.io'
	});

	io.on('connection', (socket) => {
		logger.debug('Client connected', { socketId: socket.id });

		// Handle user joining a list room - WITH AUTHORIZATION
		socket.on('join-list', (data) => {
			const { listId, sessionId } = data;

			// Validate required fields
			if (!listId || !sessionId) {
				socket.emit('error', { message: 'Missing required fields' });
				return;
			}

			// Validate session and get user info
			const sessionUser = getSessionUser(sessionId);
			if (!sessionUser) {
				socket.emit('error', { message: 'Invalid or expired session' });
				return;
			}

			// Verify list membership
			if (!isUserMemberOfList(listId, sessionUser.userId)) {
				socket.emit('error', { message: 'Access denied to this list' });
				logger.security('Unauthorized list join attempt', {
					userId: sessionUser.userId,
					username: sessionUser.username,
					listId,
					socketId: socket.id
				});
				return;
			}

			// Authorization passed - join the room
			socket.join(`list-${listId}`);
			socket.userId = sessionUser.userId;
			socket.username = sessionUser.username;
			socket.currentListId = listId;
			logger.debug('User joined list', { socketId: socket.id, username: sessionUser.username, listId });

			// Notify others that user joined
			socket.to(`list-${listId}`).emit('user:joined', {
				userId: sessionUser.userId,
				username: sessionUser.username,
				socketId: socket.id
			});
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
