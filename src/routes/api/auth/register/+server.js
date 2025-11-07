import { json } from '@sveltejs/kit';
import { createUser, createSession, createEmailVerificationToken } from '$lib/db.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';
import { validateUsername, isValidEmail, validatePassword } from '$lib/validation.js';
import { sendEmailVerification } from '$lib/email.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('Auth');

export async function POST({ request, cookies, getClientAddress, setHeaders, url }) {
  // Apply rate limiting
  const rateLimitResult = applyRateLimit({ request, getClientAddress, setHeaders }, RATE_LIMITS.AUTH);
  if (rateLimitResult) {
    return json(rateLimitResult, {
      status: 429,
      headers: {
        'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
      }
    });
  }

  try {
    const { username, email, password } = await request.json();

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.isValid) {
      return json({ error: usernameValidation.error }, { status: 400 });
    }

    // Validate email
    if (!isValidEmail(email)) {
      return json({ error: 'Invalid email address format' }, { status: 400 });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return json({ error: passwordValidation.error }, { status: 400 });
    }

    // Create user
    const user = await createUser(username, email, password);

    // Generate email verification token
    const verificationToken = createEmailVerificationToken(user.id);

    // Get base URL from request
    const protocol = url.protocol;
    const host = url.host;
    const baseUrl = `${protocol}//${host}`;

    // Send verification email
    const emailSent = await sendEmailVerification(
      user.email,
      user.username,
      verificationToken,
      baseUrl
    );

    if (emailSent) {
      logger.info('Verification email sent to new user', { userId: user.id });
    } else {
      logger.warn('Verification email not sent (SMTP not configured)', { userId: user.id });
    }

    // If user is approved (first user/admin), create session immediately
    if (user.is_approved) {
      const session = createSession(user.id);

      // Set cookie
      // Use COOKIE_SECURE env var to control secure flag (set to 'false' for HTTP in Docker)
      cookies.set('session', session.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });

      return json({ user, needsApproval: false, emailSent }, { status: 201 });
    }

    // User needs approval
    return json({ user, needsApproval: true, emailSent }, { status: 201 });

  } catch (error) {
    logger.error('Registration error', error);
    return json({ error: error.message }, { status: 400 });
  }
}
