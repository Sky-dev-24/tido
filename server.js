import { createServer } from 'http';

// Normalize ORIGIN for SvelteKit before importing the handler
// SvelteKit expects a single origin, but we support comma-separated for WebSocket CORS
// Store the full list for WebSocket CORS, give SvelteKit just the first one
const originalOrigin = process.env.ORIGIN;
if (process.env.ORIGIN && process.env.ORIGIN.includes(',')) {
	const origins = process.env.ORIGIN.split(',').map(o => o.trim());
	process.env.ORIGIN = origins[0]; // SvelteKit gets the primary origin
}
// Store full origin list for WebSocket CORS
process.env.WEBSOCKET_ORIGINS = originalOrigin;

import { handler } from './build/handler.js';
import { initializeWebSocket } from './src/lib/websocket.server.js';

// Wrapper to normalize absolute or scheme-relative URIs in request URLs
// Some reverse proxies send full URLs like "http://host:port/path" or "//host:port/path"
function normalizedHandler(req, res) {
	const originalUrl = req.url;

	// Check if the URL starts with http://, https://, or // (absolute or scheme-relative URI)
	if (
		req.url &&
		(req.url.startsWith('http://') || req.url.startsWith('https://') || req.url.startsWith('//'))
	) {
		try {
			const parsed = new URL(req.url.startsWith('//') ? `http:${req.url}` : req.url);
			req.url = parsed.pathname + parsed.search;
			console.log(`[URL Normalized] ${originalUrl} -> ${req.url}`);
		} catch (e) {
			// If parsing fails, try to extract path after the host:port
			const match = req.url.match(/^(?:https?:)?\/\/[^/]+(\/.*)?$/);
			if (match) {
				req.url = match[1] || '/';
				console.log(`[URL Normalized via regex] ${originalUrl} -> ${req.url}`);
			} else {
				console.log(`[URL Normalization failed] ${originalUrl}`);
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
