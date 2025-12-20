import { createServer } from 'http';
import { handler } from './build/handler.js';
import { initializeWebSocket } from './src/lib/websocket.server.js';

// Wrapper to normalize absolute URIs in request URLs
// Some reverse proxies send full URLs like "http://host:port/path" instead of just "/path"
function normalizedHandler(req, res) {
	// Check if the URL starts with http:// or https:// (absolute URI)
	if (req.url && (req.url.startsWith('http://') || req.url.startsWith('https://'))) {
		try {
			const parsed = new URL(req.url);
			req.url = parsed.pathname + parsed.search;
		} catch (e) {
			// If parsing fails, try to extract path after the host:port
			const match = req.url.match(/^https?:\/\/[^/]+(\/.*)?$/);
			if (match) {
				req.url = match[1] || '/';
			}
		}
	}
	return handler(req, res);
}

const server = createServer(normalizedHandler);

initializeWebSocket(server);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
	console.log(`Tido listening on http://${host}:${port}`);
});
