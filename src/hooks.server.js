import { getSession, cleanupOldDeletedTodos } from '$lib/db.js';
import { createLogger } from '$lib/logger.js';

const logger = createLogger('Server');

// Run cleanup of old deleted todos every hour
setInterval(() => {
  try {
    const deleted = cleanupOldDeletedTodos();
    if (deleted > 0) {
      logger.info(`Permanently deleted ${deleted} old todo(s)`);
    }
  } catch (error) {
    logger.error('Error cleaning up old deleted todos', error);
  }
}, 60 * 60 * 1000); // Every hour

// Run cleanup on startup
try {
  const deleted = cleanupOldDeletedTodos();
  if (deleted > 0) {
    logger.info(`Startup cleanup: Permanently deleted ${deleted} old todo(s)`);
  }
} catch (error) {
  logger.error('Error during startup cleanup', error);
}

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
        dark_mode: session.dark_mode || 0,
        theme: session.theme,
        view_density: session.view_density,
        font_scale: session.font_scale,
        font_family: session.font_family,
        default_task_priority: session.default_task_priority,
        default_task_due_offset_days: session.default_task_due_offset_days,
        default_task_reminder_minutes: session.default_task_reminder_minutes,
        auto_archive_days: session.auto_archive_days,
        week_start_day: session.week_start_day
      };
    } else {
      // Session expired, invalid, or user not approved - clear cookie
      event.cookies.delete('session', { path: '/' });
    }
  }

  const response = await resolve(event);

  // Add security headers to all responses
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Add HSTS only if using HTTPS (check if not explicitly disabled)
  if (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content Security Policy
  // Note: This is a balanced CSP that allows the app to function while providing security
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // 'unsafe-inline' needed for Svelte
    "style-src 'self' 'unsafe-inline'",  // 'unsafe-inline' needed for dynamic styles
    "img-src 'self' data: blob:",        // Allow data URIs for images
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",       // Allow WebSocket connections
    "frame-ancestors 'none'",            // Equivalent to X-Frame-Options: DENY
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  response.headers.set('Content-Security-Policy', cspDirectives);

  return response;
}
