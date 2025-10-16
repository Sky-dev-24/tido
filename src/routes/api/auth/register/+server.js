import { json } from '@sveltejs/kit';
import { createUser, createSession } from '$lib/db.js';

export async function POST({ request, cookies }) {
  try {
    const { username, email, password } = await request.json();

    // Validation
    if (!username || username.length < 3) {
      return json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Create user
    const user = await createUser(username, email, password);

    // If user is approved (first user/admin), create session immediately
    if (user.is_approved) {
      const session = createSession(user.id);

      // Set cookie
      cookies.set('session', session.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });

      return json({ user, needsApproval: false }, { status: 201 });
    }

    // User needs approval
    return json({ user, needsApproval: true }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return json({ error: error.message }, { status: 400 });
  }
}
