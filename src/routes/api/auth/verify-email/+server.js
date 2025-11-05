import { json } from '@sveltejs/kit';
import { verifyEmail } from '$lib/db.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('EmailVerification');

export async function POST({ request, getClientAddress, setHeaders }) {
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
		const { token } = await request.json();

		// Validate token format
		if (!token || typeof token !== 'string') {
			return json({ error: 'Invalid verification token' }, { status: 400 });
		}

		// Verify the email using the token
		const success = verifyEmail(token);

		if (!success) {
			return json({ error: 'Invalid or expired verification token' }, { status: 400 });
		}

		logger.info('Email verified successfully');

		return json({
			message: 'Email verified successfully! You can now access all features.'
		});
	} catch (error) {
		logger.error('Email verification failed', error);
		return json({ error: 'Failed to verify email' }, { status: 500 });
	}
}
