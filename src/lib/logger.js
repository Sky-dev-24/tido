/**
 * Production-safe logging utility
 * Replaces console.log with conditional logging based on environment
 */

const LOG_LEVELS = {
	ERROR: 0,
	WARN: 1,
	INFO: 2,
	DEBUG: 3
};

// Get log level from environment (default to INFO in production, DEBUG in development)
const getLogLevel = () => {
	const envLevel = process.env.LOG_LEVEL?.toUpperCase();
	if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
		return LOG_LEVELS[envLevel];
	}
	return process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;
};

const currentLogLevel = getLogLevel();

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Optional metadata
 * @returns {string} Formatted log message
 */
function formatLog(level, message, meta = {}) {
	const timestamp = new Date().toISOString();
	const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
	return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

/**
 * Sanitize data before logging to prevent sensitive info leakage
 * @param {any} data - Data to sanitize
 * @returns {any} Sanitized data
 */
function sanitizeForLog(data) {
	if (typeof data !== 'object' || data === null) {
		return data;
	}

	// Fields that should never be logged
	const sensitiveFields = [
		'password',
		'password_hash',
		'token',
		'secret',
		'api_key',
		'apiKey',
		'session',
		'sessionId',
		'session_id',
		'authorization',
		'cookie',
		'csrf'
	];

	if (Array.isArray(data)) {
		return data.map(item => sanitizeForLog(item));
	}

	const sanitized = {};
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		if (sensitiveFields.some(field => lowerKey.includes(field))) {
			sanitized[key] = '[REDACTED]';
		} else if (typeof value === 'object' && value !== null) {
			sanitized[key] = sanitizeForLog(value);
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}

/**
 * Log error level message
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or metadata
 */
export function logError(message, error = {}) {
	if (currentLogLevel >= LOG_LEVELS.ERROR) {
		const meta = error instanceof Error
			? { error: error.message, stack: error.stack }
			: sanitizeForLog(error);
		console.error(formatLog('ERROR', message, meta));
	}
}

/**
 * Log warning level message
 * @param {string} message - Warning message
 * @param {Object} meta - Optional metadata
 */
export function logWarn(message, meta = {}) {
	if (currentLogLevel >= LOG_LEVELS.WARN) {
		console.warn(formatLog('WARN', message, sanitizeForLog(meta)));
	}
}

/**
 * Log info level message
 * @param {string} message - Info message
 * @param {Object} meta - Optional metadata
 */
export function logInfo(message, meta = {}) {
	if (currentLogLevel >= LOG_LEVELS.INFO) {
		console.log(formatLog('INFO', message, sanitizeForLog(meta)));
	}
}

/**
 * Log debug level message (only in development or if LOG_LEVEL=DEBUG)
 * @param {string} message - Debug message
 * @param {Object} meta - Optional metadata
 */
export function logDebug(message, meta = {}) {
	if (currentLogLevel >= LOG_LEVELS.DEBUG) {
		console.log(formatLog('DEBUG', message, sanitizeForLog(meta)));
	}
}

/**
 * Log security event (always logged, even in production)
 * @param {string} event - Security event type
 * @param {Object} details - Event details
 */
export function logSecurity(event, details = {}) {
	const meta = sanitizeForLog(details);
	console.warn(formatLog('SECURITY', event, meta));
}

/**
 * Create a logger instance for a specific module
 * @param {string} moduleName - Name of the module
 * @returns {Object} Logger instance with context
 */
export function createLogger(moduleName) {
	return {
		error: (message, error) => logError(`[${moduleName}] ${message}`, error),
		warn: (message, meta) => logWarn(`[${moduleName}] ${message}`, meta),
		info: (message, meta) => logInfo(`[${moduleName}] ${message}`, meta),
		debug: (message, meta) => logDebug(`[${moduleName}] ${message}`, meta),
		security: (event, details) => logSecurity(`[${moduleName}] ${event}`, details)
	};
}

// Export default logger
export default {
	error: logError,
	warn: logWarn,
	info: logInfo,
	debug: logDebug,
	security: logSecurity,
	createLogger
};
