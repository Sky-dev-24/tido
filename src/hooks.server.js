import { getSession, cleanupOldDeletedTodos } from '$lib/db.js';

// Run cleanup of old deleted todos every hour
setInterval(() => {
  try {
    const deleted = cleanupOldDeletedTodos();
    if (deleted > 0) {
      console.log(`[Cleanup] Permanently deleted ${deleted} old todo(s)`);
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up old deleted todos:', error);
  }
}, 60 * 60 * 1000); // Every hour

// Run cleanup on startup
cleanupOldDeletedTodos();

export async function handle({ event, resolve }) {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = getSession(sessionId);

    if (session && session.is_approved) {
      event.locals.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        is_admin: Boolean(session.is_admin),
        dark_mode: session.dark_mode || 0
      };
    } else {
      // Session expired, invalid, or user not approved - clear cookie
      event.cookies.delete('session', { path: '/' });
    }
  }

  return resolve(event);
}
