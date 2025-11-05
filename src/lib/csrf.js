/**
 * CSRF (Cross-Site Request Forgery) protection
 * Implements double-submit cookie pattern
 */

import crypto from 'crypto';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a cryptographically secure CSRF token
 * @returns {string} CSRF token
 */
export function generateCsrfToken() {
	return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Set CSRF token in cookie
 * @param {Object} cookies - SvelteKit cookies object
 * @param {string} token - CSRF token
 */
export function setCsrfCookie(cookies, token) {
	cookies.set(CSRF_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 7 // 7 days (same as session)
	});
}

/**
 * Validate CSRF token from request
 * @param {Object} request - Request object
 * @param {Object} cookies - SvelteKit cookies object
 * @returns {boolean} True if valid
 */
export function validateCsrfToken(request, cookies) {
	// Get token from header
	const headerToken = request.headers.get(CSRF_HEADER_NAME);

	// Get token from cookie
	const cookieToken = cookies.get(CSRF_COOKIE_NAME);

	// Both must exist and match
	if (!headerToken || !cookieToken) {
		return false;
	}

	// Constant-time comparison to prevent timing attacks
	return crypto.timingSafeEqual(
		Buffer.from(headerToken),
		Buffer.from(cookieToken)
	);
}

/**
 * Middleware to require CSRF token on state-changing operations
 * @param {Object} event - SvelteKit request event
 * @param {Array<string>} exemptMethods - Methods exempt from CSRF (default: GET, HEAD, OPTIONS)
 * @returns {Object|null} Error response if invalid, null if valid
 */
export function requireCsrfToken(event, exemptMethods = ['GET', 'HEAD', 'OPTIONS']) {
	const method = event.request.method;

	// Skip CSRF check for safe methods
	if (exemptMethods.includes(method)) {
		return null;
	}

	// Validate CSRF token
	if (!validateCsrfToken(event.request, event.cookies)) {
		return {
			error: 'Invalid or missing CSRF token',
			code: 'CSRF_VALIDATION_FAILED'
		};
	}

	return null;
}

/**
 * Ensure CSRF token exists in cookie, create if missing
 * @param {Object} cookies - SvelteKit cookies object
 * @returns {string} CSRF token
 */
export function ensureCsrfToken(cookies) {
	let token = cookies.get(CSRF_COOKIE_NAME);

	if (!token) {
		token = generateCsrfToken();
		setCsrfCookie(cookies, token);
	}

	return token;
}
