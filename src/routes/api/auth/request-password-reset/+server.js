import { json } from '@sveltejs/kit';
import { getUserByEmail, createPasswordResetToken } from '$lib/db.js';
import { isValidEmail } from '$lib/validation.js';
import { sendPasswordResetEmail } from '$lib/email.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('PasswordResetRequest');

export async function POST({ request, getClientAddress, setHeaders, url }) {
	// Apply rate limiting - use AUTH limit (5 req/min) to prevent abuse
	const rateLimitResult = applyRateLimit(
		{ request, getClientAddress, setHeaders },
		RATE_LIMITS.AUTH
	);

	if (rateLimitResult) {
		return json(rateLimitResult, {
			status: 429,
			headers: {
				'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
			}
		});
	}

	try {
		const { email } = await request.json();

		// Validate email format
		if (!isValidEmail(email)) {
			return json({ error: 'Invalid email address' }, { status: 400 });
		}

		// Look up user by email
		const user = getUserByEmail(email);

		// Always return success to prevent email enumeration
		// (Don't reveal whether the email exists in the system)
		if (!user) {
			logger.info('Password reset requested for non-existent email', { email });
			return json({
				message: 'If an account with that email exists, a password reset link has been sent.'
			});
		}

		// Generate password reset token
		const resetToken = createPasswordResetToken(user.id);

		// Get base URL from request
		const protocol = url.protocol;
		const host = url.host;
		const baseUrl = `${protocol}//${host}`;

		// Send password reset email
		const emailSent = await sendPasswordResetEmail(
			user.email,
			user.username,
			resetToken,
			baseUrl
		);

		if (emailSent) {
			logger.info('Password reset email sent', { userId: user.id, email: user.email });
		} else {
			logger.warn('Password reset email not sent (SMTP not configured)', {
				userId: user.id,
				email: user.email
			});
		}

		return json({
			message: 'If an account with that email exists, a password reset link has been sent.'
		});
	} catch (error) {
		logger.error('Password reset request failed', error);
		return json({ error: 'Failed to process password reset request' }, { status: 500 });
	}
}
