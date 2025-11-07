import { json } from '@sveltejs/kit';
import { createEmailVerificationToken, isEmailVerified } from '$lib/db.js';
import { sendEmailVerification } from '$lib/email.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('ResendVerification');

export async function POST({ request, getClientAddress, setHeaders, locals, url }) {
	// Must be logged in to resend verification
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Apply rate limiting
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
		// Check if email is already verified
		if (isEmailVerified(locals.user.id)) {
			return json({ error: 'Email is already verified' }, { status: 400 });
		}

		// Generate new verification token
		const verificationToken = createEmailVerificationToken(locals.user.id);

		// Get base URL from request
		const protocol = url.protocol;
		const host = url.host;
		const baseUrl = `${protocol}//${host}`;

		// Send verification email
		const emailSent = await sendEmailVerification(
			locals.user.email,
			locals.user.username,
			verificationToken,
			baseUrl
		);

		if (emailSent) {
			logger.info('Verification email resent', { userId: locals.user.id });
		} else {
			logger.warn('Verification email not sent (SMTP not configured)', {
				userId: locals.user.id
			});
		}

		return json({
			message: 'Verification email sent! Please check your inbox.'
		});
	} catch (error) {
		logger.error('Failed to resend verification email', error);
		return json({ error: 'Failed to resend verification email' }, { status: 500 });
	}
}
