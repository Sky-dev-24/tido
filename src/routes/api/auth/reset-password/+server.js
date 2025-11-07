import { json } from '@sveltejs/kit';
import {
	getPasswordResetToken,
	updateUserPassword,
	markPasswordResetTokenUsed
} from '$lib/db.js';
import { validatePassword } from '$lib/validation.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('PasswordReset');

export async function POST({ request, getClientAddress, setHeaders }) {
	// Apply rate limiting - use AUTH limit to prevent brute force
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
		const { token, password } = await request.json();

		// Validate token format
		if (!token || typeof token !== 'string') {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		// Validate password strength
		const passwordValidation = validatePassword(password);
		if (!passwordValidation.isValid) {
			return json({ error: passwordValidation.error }, { status: 400 });
		}

		// Validate and retrieve token
		const tokenData = getPasswordResetToken(token);
		if (!tokenData) {
			return json({ error: 'Invalid or expired reset token' }, { status: 400 });
		}

		// Update user's password
		updateUserPassword(tokenData.user_id, password);

		// Mark token as used
		markPasswordResetTokenUsed(token);

		logger.info('Password reset successful', { userId: tokenData.user_id });

		return json({
			message: 'Password has been reset successfully. You can now log in with your new password.'
		});
	} catch (error) {
		logger.error('Password reset failed', error);
		return json({ error: 'Failed to reset password' }, { status: 500 });
	}
}
