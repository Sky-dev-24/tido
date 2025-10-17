import { createServer } from 'http';
import { handler } from './build/handler.js';
import { initializeWebSocket } from './src/lib/websocket.server.js';

const server = createServer(handler);

initializeWebSocket(server);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
	console.log(`Tido listening on http://${host}:${port}`);
});
