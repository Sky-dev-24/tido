/**
 * Input validation utilities for user data
 */

/**
 * Validate email address using RFC 5322 compliant regex
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
	if (!email || typeof email !== 'string') {
		return false;
	}

	// RFC 5322 compliant email regex (simplified but robust)
	// This catches most invalid formats while allowing valid international emails
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// Additional checks
	const isBasicFormatValid = emailRegex.test(email);
	if (!isBasicFormatValid) {
		return false;
	}

	// Check length constraints (RFC 5321)
	if (email.length > 254) {
		return false;
	}

	// Split and validate local and domain parts
	const [localPart, domainPart] = email.split('@');

	// Local part (before @) validation
	if (localPart.length > 64) {
		return false;
	}

	// Domain part validation
	if (domainPart.length > 255) {
		return false;
	}

	// Check for consecutive dots
	if (email.includes('..')) {
		return false;
	}

	// Check for dots at start or end of local part
	if (localPart.startsWith('.') || localPart.endsWith('.')) {
		return false;
	}

	return true;
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {Object} Validation result with isValid and error message
 */
export function validateUsername(username) {
	if (!username || typeof username !== 'string') {
		return { isValid: false, error: 'Username is required' };
	}

	// Remove whitespace for length check
	const trimmed = username.trim();

	if (trimmed.length < 3) {
		return { isValid: false, error: 'Username must be at least 3 characters' };
	}

	if (trimmed.length > 32) {
		return { isValid: false, error: 'Username must be less than 32 characters' };
	}

	// Allow alphanumeric, underscore, hyphen
	const usernameRegex = /^[a-zA-Z0-9_-]+$/;
	if (!usernameRegex.test(trimmed)) {
		return {
			isValid: false,
			error: 'Username can only contain letters, numbers, underscores, and hyphens'
		};
	}

	return { isValid: true, value: trimmed };
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid, error, and strength score
 */
export function validatePassword(password) {
	if (!password || typeof password !== 'string') {
		return { isValid: false, error: 'Password is required', strength: 0 };
	}

	// Minimum length
	if (password.length < 8) {
		return {
			isValid: false,
			error: 'Password must be at least 8 characters',
			strength: 1
		};
	}

	// Maximum length (prevent DoS via bcrypt)
	if (password.length > 72) {
		return {
			isValid: false,
			error: 'Password must be less than 72 characters',
			strength: 0
		};
	}

	// Check for common weak passwords
	const commonPasswords = [
		'password', '12345678', 'qwerty', 'abc123', 'password1',
		'letmein', 'welcome', 'monkey', '1234567890', 'password123'
	];

	if (commonPasswords.includes(password.toLowerCase())) {
		return {
			isValid: false,
			error: 'Password is too common. Please choose a stronger password.',
			strength: 1
		};
	}

	// Calculate strength score
	let strength = 0;

	// Length bonus
	if (password.length >= 8) strength++;
	if (password.length >= 12) strength++;
	if (password.length >= 16) strength++;

	// Character variety
	if (/[a-z]/.test(password)) strength++; // lowercase
	if (/[A-Z]/.test(password)) strength++; // uppercase
	if (/[0-9]/.test(password)) strength++; // numbers
	if (/[^a-zA-Z0-9]/.test(password)) strength++; // special chars

	// Require at least a moderate password (score >= 4)
	if (strength < 4) {
		return {
			isValid: false,
			error: 'Password is too weak. Use a mix of uppercase, lowercase, numbers, and special characters.',
			strength
		};
	}

	return {
		isValid: true,
		strength,
		strengthLabel: strength >= 6 ? 'strong' : 'moderate'
	};
}

/**
 * Sanitize text input to prevent XSS
 * @param {string} text - Text to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized text
 */
export function sanitizeText(text, options = {}) {
	if (!text || typeof text !== 'string') {
		return '';
	}

	const {
		maxLength = 10000,
		allowNewlines = true,
		trim = true
	} = options;

	let sanitized = text;

	// Trim if requested
	if (trim) {
		sanitized = sanitized.trim();
	}

	// Truncate to max length
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength);
	}

	// Remove or escape HTML entities
	sanitized = sanitized
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/\//g, '&#x2F;');

	// Handle newlines
	if (!allowNewlines) {
		sanitized = sanitized.replace(/[\r\n]+/g, ' ');
	}

	return sanitized;
}

/**
 * Validate list name
 * @param {string} name - List name to validate
 * @returns {Object} Validation result
 */
export function validateListName(name) {
	if (!name || typeof name !== 'string') {
		return { isValid: false, error: 'List name is required' };
	}

	const trimmed = name.trim();

	if (trimmed.length < 1) {
		return { isValid: false, error: 'List name cannot be empty' };
	}

	if (trimmed.length > 100) {
		return { isValid: false, error: 'List name must be less than 100 characters' };
	}

	return { isValid: true, value: trimmed };
}

/**
 * Validate todo text
 * @param {string} text - Todo text to validate
 * @returns {Object} Validation result
 */
export function validateTodoText(text) {
	if (!text || typeof text !== 'string') {
		return { isValid: false, error: 'Task text is required' };
	}

	const trimmed = text.trim();

	if (trimmed.length < 1) {
		return { isValid: false, error: 'Task text cannot be empty' };
	}

	if (trimmed.length > 1000) {
		return { isValid: false, error: 'Task text must be less than 1000 characters' };
	}

	return { isValid: true, value: trimmed };
}
