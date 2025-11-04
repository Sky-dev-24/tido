import { json } from '@sveltejs/kit';
import { getUserByUsername, verifyPassword, createSession } from '$lib/db.js';
import { applyRateLimit, RATE_LIMITS } from '$lib/rate-limit.js';

export async function POST({ request, cookies, getClientAddress, setHeaders }) {
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
    const { username, password } = await request.json();

    if (!username || !password) {
      return json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Find user
    const user = getUserByUsername(username);

    if (!user) {
      return json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      return json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Check if user is approved
    if (!user.is_approved) {
      return json({ error: 'Your account is pending admin approval', pending: true }, { status: 403 });
    }

    // Create session
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

    return json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return json({ error: 'Login failed' }, { status: 500 });
  }
}
