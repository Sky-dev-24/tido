/**
 * Frontend API utilities with automatic CSRF token handling
 */

/**
 * Get CSRF token from cookie
 * @returns {string|null} CSRF token or null if not found
 */
export function getCsrfToken() {
	if (typeof document === 'undefined') return null;

	const match = document.cookie
		.split('; ')
		.find(row => row.startsWith('csrf_token='));

	return match ? match.split('=')[1] : null;
}

/**
 * Make an API request with automatic CSRF token handling
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function apiRequest(url, options = {}) {
	const headers = {
		...options.headers
	};

	// Add Content-Type for JSON requests if body is present
	if (options.body && typeof options.body === 'string') {
		headers['Content-Type'] = headers['Content-Type'] || 'application/json';
	}

	// Add CSRF token for state-changing requests
	const method = (options.method || 'GET').toUpperCase();
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		const csrfToken = getCsrfToken();
		if (csrfToken) {
			headers['x-csrf-token'] = csrfToken;
		}
	}

	return fetch(url, {
		...options,
		headers
	});
}

/**
 * Make a JSON API request with automatic CSRF token handling
 * @param {string} url - API endpoint URL
 * @param {string} method - HTTP method
 * @param {Object} data - Request body data
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function jsonRequest(url, method = 'GET', data = null) {
	const options = {
		method,
		headers: {
			'Content-Type': 'application/json'
		}
	};

	if (data && method !== 'GET') {
		options.body = JSON.stringify(data);
	}

	const response = await apiRequest(url, options);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		const error = new Error(errorData.error || `Request failed with status ${response.status}`);
		error.status = response.status;
		error.data = errorData;
		throw error;
	}

	return response.json();
}
