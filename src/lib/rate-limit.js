/**
 * Rate limiting utility for API endpoints
 * Implements a sliding window rate limiter using in-memory storage
 */

// Store: Map<identifier, Array<timestamp>>
const requestStore = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, timestamps] of requestStore.entries()) {
		// Remove timestamps older than 1 hour
		const filtered = timestamps.filter(t => now - t < 3600000);
		if (filtered.length === 0) {
			requestStore.delete(key);
		} else {
			requestStore.set(key, filtered);
		}
	}
}, 300000);

/**
 * Rate limit configuration presets
 */
export const RATE_LIMITS = {
	// Strict limit for authentication endpoints (5 requests per minute)
	AUTH: {
		maxRequests: 5,
		windowMs: 60000, // 1 minute
		message: 'Too many authentication attempts. Please try again in a minute.'
	},
	// Medium limit for general API endpoints (30 requests per minute)
	API: {
		maxRequests: 30,
		windowMs: 60000, // 1 minute
		message: 'Too many requests. Please slow down.'
	},
	// Lenient limit for read operations (100 requests per minute)
	READ: {
		maxRequests: 100,
		windowMs: 60000, // 1 minute
		message: 'Too many requests. Please slow down.'
	}
};

/**
 * Create a rate limiter function
 * @param {Object} options - Rate limit options
 * @param {number} options.maxRequests - Maximum number of requests allowed
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {string} options.message - Error message to return when rate limited
 * @param {Function} options.keyGenerator - Optional function to generate unique identifier (default: IP address)
 * @returns {Function} Rate limiter middleware function
 */
export function createRateLimiter(options) {
	const {
		maxRequests,
		windowMs,
		message,
		keyGenerator = (event) => {
			// Try to get real IP from headers (for reverse proxy scenarios)
			return event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
			       event.request.headers.get('x-real-ip') ||
			       event.getClientAddress();
		}
	} = options;

	return function rateLimitMiddleware(event) {
		const identifier = keyGenerator(event);
		const now = Date.now();

		// Get existing timestamps for this identifier
		let timestamps = requestStore.get(identifier) || [];

		// Filter out timestamps outside the window
		timestamps = timestamps.filter(t => now - t < windowMs);

		// Check if limit exceeded
		if (timestamps.length >= maxRequests) {
			const oldestTimestamp = timestamps[0];
			const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

			return {
				limited: true,
				retryAfter,
				message
			};
		}

		// Add current timestamp
		timestamps.push(now);
		requestStore.set(identifier, timestamps);

		return {
			limited: false,
			remaining: maxRequests - timestamps.length
		};
	};
}

/**
 * Helper function to apply rate limiting in SvelteKit API routes
 * @param {Object} event - SvelteKit request event
 * @param {Object} limiter - Rate limiter configuration
 * @returns {Object|null} JSON response if rate limited, null if allowed
 */
export function applyRateLimit(event, limiter) {
	const rateLimitFn = createRateLimiter(limiter);
	const result = rateLimitFn(event);

	if (result.limited) {
		return {
			error: result.message,
			retryAfter: result.retryAfter
		};
	}

	// Add rate limit headers to response
	event.setHeaders({
		'X-RateLimit-Limit': limiter.maxRequests.toString(),
		'X-RateLimit-Remaining': result.remaining.toString(),
		'X-RateLimit-Reset': new Date(Date.now() + limiter.windowMs).toISOString()
	});

	return null;
}
