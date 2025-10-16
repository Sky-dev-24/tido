import { initializeWebSocket } from './websocket.server.js';

export function webSocketServer() {
	return {
		name: 'webSocketServer',
		configureServer(server) {
			if (server.httpServer) {
				initializeWebSocket(server.httpServer);
			}
		}
	};
}
